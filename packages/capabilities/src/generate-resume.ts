import {
  DEFAULT_PROFILE_ID,
  DOCUMENT_GENERATOR_VERSION,
  ResumeDocumentSchema,
  SCHEMA_VERSION,
  fnv1a,
  selectCandidateFacts,
  type ClaimBullet,
  type ComposeContext,
  type ComposeResumePort,
  type DocumentRepository,
  type Id,
  type JobAnalysisRepository,
  type JobRepository,
  type ProfileRepository,
  type RenderPort,
  type ResumeDocument,
  type ResumeDraft,
  type Timestamp,
} from "@hunt/core";
import { composeGroundedDraft } from "./generation-pipeline.js";

/**
 * GenerateResume capability (SDD §13, §17). The signature grounded pipeline:
 * deterministic fact selection → AI composition constrained to those facts →
 * deterministic claim tracing with a bounded repair loop → HTML render →
 * persist as a DRAFT pending mandatory human review (§17 step 5). The
 * capability is non-interactive: it returns a draft to be reviewed, it never
 * marks anything sendable (SDD §13).
 *
 * Requires an AI provider: composition is genuine language reasoning. The
 * surrounding machinery (selection, tracing, rendering) is deterministic.
 */

export interface GenerateResumeDeps {
  jobs: JobRepository;
  profiles: ProfileRepository;
  analyses: JobAnalysisRepository;
  documents: DocumentRepository;
  render: RenderPort;
  composer?: ComposeResumePort | undefined;
}

export interface GenerateResumeInput {
  jobId: Id;
  now?: Timestamp;
}

export type GenerateResumeResult =
  | {
      ok: true;
      document: ResumeDocument;
      /** Rendered HTML for the presentation layer to write and open. */
      render: { contentType: string; content: string; extension: string };
      /** Candidate fact count offered to the composer — for the review summary. */
      candidateCount: number;
      needsReview: true;
    }
  | {
      ok: false;
      stage: "input" | "ai" | "grounding" | "storage";
      message: string;
      hint?: string;
      /** Present on a grounding failure: the surviving violations (SDD §17). */
      violations?: { path: string; message: string }[];
    };

const resumeBullets = (draft: ResumeDraft): ClaimBullet[] => [
  { path: "summary", text: draft.summary.text, sourceFactIds: draft.summary.sourceFactIds },
  ...draft.sections.flatMap((s, si) =>
    s.bullets.map((b, bi) => ({
      path: `sections[${si}].bullets[${bi}]`,
      text: b.text,
      sourceFactIds: b.sourceFactIds,
    })),
  ),
];

export function createGenerateResume(deps: GenerateResumeDeps) {
  return async function generateResume(
    input: GenerateResumeInput,
  ): Promise<GenerateResumeResult> {
    const job = deps.jobs.getById(input.jobId);
    if (!job) {
      return {
        ok: false,
        stage: "input",
        message: `job not found: ${input.jobId}`,
        hint: "import one first: hunt import <url|-|--file>",
      };
    }
    const analysis = deps.analyses.getLatestForJob(job.id);
    if (!analysis) {
      return {
        ok: false,
        stage: "input",
        message: "no analysis found — a resume is tailored against the job analysis",
        hint: `analyze it first: hunt analyze ${job.id}`,
      };
    }
    const profile = deps.profiles.get(DEFAULT_PROFILE_ID);
    if (!profile) {
      return {
        ok: false,
        stage: "input",
        message: "no profile found — generation needs your facts to ground claims in",
        hint: "create one: hunt profile import <path-to-profile.yaml>",
      };
    }
    if (!deps.composer) {
      return {
        ok: false,
        stage: "ai",
        message: "no AI provider configured — resume composition needs a language model",
        hint: "set ANTHROPIC_API_KEY, or HUNT_AI_PROVIDER=ollama for local generation",
      };
    }
    const now = input.now ?? (new Date().toISOString() as Timestamp);

    // Step 1 — deterministic selection.
    const candidateFacts = selectCandidateFacts(profile, analysis, { now });
    if (candidateFacts.length === 0) {
      return {
        ok: false,
        stage: "input",
        message: "your profile has no facts to build a resume from",
        hint: "add experience/skills/projects to your profile.yaml and re-import",
      };
    }
    const candidateIds = new Set(candidateFacts.map((f) => f.id));
    const context: ComposeContext = {
      jobTitle: job.title,
      companyName: job.companyName,
      jobContext: job.descriptionText,
      missingSkills: analysis.skills.missing,
    };

    // Steps 2–3 — compose, trace, bounded repair.
    const composer = deps.composer;
    const grounded = await composeGroundedDraft<ResumeDraft>(
      candidateFacts,
      (repairFeedback) =>
        composer.composeResume({
          context,
          candidateFacts,
          ...(repairFeedback ? { repairFeedback } : {}),
        }),
      resumeBullets,
    );
    if (!grounded.ok) {
      if (grounded.stage === "ai") {
        return { ok: false, stage: "ai", message: grounded.message };
      }
      return {
        ok: false,
        stage: "grounding",
        message: grounded.message,
        violations: grounded.violations.map((v) => ({ path: v.path, message: v.message })),
      };
    }

    // Build the canonical document. Every cited id is guaranteed in the
    // candidate set by the tracer, but we assert it once more as a belt-and-braces
    // invariant before persisting a grounded artifact.
    const draft = grounded.draft;
    const allCited = resumeBullets(draft).flatMap((b) => b.sourceFactIds);
    if (allCited.some((id) => !candidateIds.has(id))) {
      return {
        ok: false,
        stage: "grounding",
        message: "internal grounding invariant violated: a cited fact escaped the candidate set",
      };
    }

    const document: ResumeDocument = ResumeDocumentSchema.parse({
      // Deterministic id: re-generating for the same (job, analysis) refreshes one row.
      id: `doc_${fnv1a(`resume|${job.id}|${analysis.id}`)}`,
      schemaVersion: SCHEMA_VERSION,
      kind: "resume",
      jobId: job.id,
      analysisId: analysis.id,
      profileVersion: profile.updatedAt,
      status: "draft",
      generationMeta: {
        generatorVersion: DOCUMENT_GENERATOR_VERSION,
        aiTaskId: "draft-resume",
        aiTaskVersion: grounded.taskVersion,
        providerId: grounded.providerId,
        candidateFactIds: candidateFacts.map((f) => f.id),
        repairRounds: grounded.repairRounds,
      },
      contact: {
        name: profile.basics.name,
        ...(profile.basics.email ? { email: profile.basics.email } : {}),
        ...(profile.basics.phone ? { phone: profile.basics.phone } : {}),
        ...(profile.basics.location ? { location: profile.basics.location } : {}),
        links: profile.basics.links,
      },
      summary: draft.summary,
      sections: draft.sections,
      createdAt: now,
    });

    const rendered = deps.render.renderResume(document);
    try {
      deps.documents.save(document);
    } catch (err) {
      return {
        ok: false,
        stage: "storage",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return {
      ok: true,
      document,
      render: rendered,
      candidateCount: candidateFacts.length,
      needsReview: true,
    };
  };
}
