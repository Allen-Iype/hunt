import {
  CoverLetterDocumentSchema,
  DEFAULT_PROFILE_ID,
  DOCUMENT_GENERATOR_VERSION,
  SCHEMA_VERSION,
  fnv1a,
  selectCandidateFacts,
  type ClaimBullet,
  type ComposeContext,
  type ComposeCoverLetterPort,
  type CoverLetterDocument,
  type CoverLetterDraft,
  type DocumentRepository,
  type Id,
  type JobAnalysisRepository,
  type JobRepository,
  type ProfileRepository,
  type RenderPort,
  type Timestamp,
} from "@hunt/core";
import { composeGroundedDraft } from "./generation-pipeline.js";

/**
 * GenerateCoverLetter capability (SDD §13, §17). Identical rails to
 * GenerateResume — select → compose → claim-trace with bounded repair →
 * render → persist as a draft pending review. The grounding invariant holds
 * for cover letters exactly as for resumes.
 */

export interface GenerateCoverLetterDeps {
  jobs: JobRepository;
  profiles: ProfileRepository;
  analyses: JobAnalysisRepository;
  documents: DocumentRepository;
  render: RenderPort;
  composer?: ComposeCoverLetterPort | undefined;
}

export interface GenerateCoverLetterInput {
  jobId: Id;
  now?: Timestamp;
}

export type GenerateCoverLetterResult =
  | {
      ok: true;
      document: CoverLetterDocument;
      render: { contentType: string; content: string; extension: string };
      candidateCount: number;
      needsReview: true;
    }
  | {
      ok: false;
      stage: "input" | "ai" | "grounding" | "storage";
      message: string;
      hint?: string;
      violations?: { path: string; message: string }[];
    };

const letterBullets = (draft: CoverLetterDraft): ClaimBullet[] => [
  { path: "hook", text: draft.hook.text, sourceFactIds: draft.hook.sourceFactIds },
  ...draft.body.map((b, i) => ({
    path: `body[${i}]`,
    text: b.text,
    sourceFactIds: b.sourceFactIds,
  })),
  { path: "closing", text: draft.closing.text, sourceFactIds: draft.closing.sourceFactIds },
];

export function createGenerateCoverLetter(deps: GenerateCoverLetterDeps) {
  return async function generateCoverLetter(
    input: GenerateCoverLetterInput,
  ): Promise<GenerateCoverLetterResult> {
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
        message: "no analysis found — a cover letter is tailored against the job analysis",
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
        message: "no AI provider configured — cover-letter composition needs a language model",
        hint: "set ANTHROPIC_API_KEY, or HUNT_AI_PROVIDER=ollama for local generation",
      };
    }
    const now = input.now ?? (new Date().toISOString() as Timestamp);

    const candidateFacts = selectCandidateFacts(profile, analysis, { now });
    if (candidateFacts.length === 0) {
      return {
        ok: false,
        stage: "input",
        message: "your profile has no facts to build a cover letter from",
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

    const composer = deps.composer;
    const grounded = await composeGroundedDraft<CoverLetterDraft>(
      candidateFacts,
      (repairFeedback) =>
        composer.composeCoverLetter({
          context,
          candidateFacts,
          ...(repairFeedback ? { repairFeedback } : {}),
        }),
      letterBullets,
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

    const draft = grounded.draft;
    const allCited = letterBullets(draft).flatMap((b) => b.sourceFactIds);
    if (allCited.some((id) => !candidateIds.has(id))) {
      return {
        ok: false,
        stage: "grounding",
        message: "internal grounding invariant violated: a cited fact escaped the candidate set",
      };
    }

    const document: CoverLetterDocument = CoverLetterDocumentSchema.parse({
      id: `doc_${fnv1a(`cover_letter|${job.id}|${analysis.id}`)}`,
      schemaVersion: SCHEMA_VERSION,
      kind: "cover_letter",
      jobId: job.id,
      analysisId: analysis.id,
      profileVersion: profile.updatedAt,
      status: "draft",
      generationMeta: {
        generatorVersion: DOCUMENT_GENERATOR_VERSION,
        aiTaskId: "draft-cover-letter",
        aiTaskVersion: grounded.taskVersion,
        providerId: grounded.providerId,
        candidateFactIds: candidateFacts.map((f) => f.id),
        repairRounds: grounded.repairRounds,
      },
      companyName: job.companyName,
      jobTitle: job.title,
      hook: draft.hook,
      body: draft.body,
      closing: draft.closing,
      createdAt: now,
    });

    const rendered = deps.render.renderCoverLetter(document);
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
