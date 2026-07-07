import {
  ANALYZER_VERSION,
  DEFAULT_PROFILE_ID,
  JobAnalysisSchema,
  SCHEMA_VERSION,
  computeFitScore,
  deriveCandidateSeniority,
  detectSkills,
  fnv1a,
  matchSkills,
  parseCompensation,
  type AnalysisFieldSource,
  type AnalyzedRequirement,
  type Id,
  type Job,
  type JobAnalysis,
  type JobAnalysisRepository,
  type JobInsightsPort,
  type JobRepository,
  type ProfileRepository,
  type Timestamp,
} from "@hunt/core";

/**
 * AnalyzeJob capability (SDD §13, §18): deterministic pass A → optional AI
 * pass B → merge C (deterministic wins its conflicts) → deterministic score
 * D → persist. Works without AI: matching + scoring alone is a useful
 * analysis (Principle 2).
 */

export interface AnalyzeJobDeps {
  jobs: JobRepository;
  profiles: ProfileRepository;
  analyses: JobAnalysisRepository;
  insights?: JobInsightsPort | undefined;
}

export type AnalyzeJobResult =
  | { ok: true; analysis: JobAnalysis; job: Job; aiNote?: string }
  | { ok: false; stage: "input" | "storage"; message: string; hint?: string };

export interface AnalyzeJobInput {
  jobId: Id;
  /** Injectable for determinism in tests; defaults to the current time. */
  now?: Timestamp;
}

export function createAnalyzeJob(deps: AnalyzeJobDeps) {
  return async function analyzeJob(input: AnalyzeJobInput): Promise<AnalyzeJobResult> {
    const job = deps.jobs.getById(input.jobId);
    if (!job) {
      return {
        ok: false,
        stage: "input",
        message: `job not found: ${input.jobId}`,
        hint: "import one first: hunt import <url|-|--file>",
      };
    }
    const profile = deps.profiles.get(DEFAULT_PROFILE_ID);
    if (!profile) {
      return {
        ok: false,
        stage: "input",
        message: "no profile found — analysis needs your skills to match against",
        hint: "create one: hunt profile import <path-to-profile.yaml>",
      };
    }
    const now = input.now ?? (new Date().toISOString() as Timestamp);

    // ── Pass A: deterministic ────────────────────────────────────────────
    const jobSkills = [
      ...new Set([...job.skills, ...detectSkills(job.descriptionText)]),
    ];
    const skillMatch = matchSkills(jobSkills, profile);
    const matchedNames = skillMatch.matched.map((m) => m.name);
    const compensation = job.compensation
      ? parseCompensation(job.compensation.raw)
      : undefined;

    // ── Pass B: AI (optional) ────────────────────────────────────────────
    const fieldProvenance: Record<string, AnalysisFieldSource> = {
      skills: "deterministic",
      compensation: "deterministic",
      fitScore: "deterministic",
    };
    let aiNote: string | undefined;
    let insights: Awaited<ReturnType<JobInsightsPort["getJobInsights"]>> | undefined;
    if (deps.insights) {
      insights = await deps.insights.getJobInsights({
        title: job.title,
        descriptionText: job.descriptionText,
        matchedSkills: matchedNames,
        missingSkills: skillMatch.missing,
      });
      if (!insights.ok) {
        aiNote = `AI insights unavailable (${insights.kind}): ${insights.message} — deterministic analysis only`;
      }
    } else {
      aiNote = "no AI provider configured — deterministic analysis only";
    }
    const ai = insights?.ok ? insights.insights : undefined;

    // ── Pass C: merge, deterministic wins its conflicts ──────────────────
    // Requirements: import-time extraction is closest to the source; fresh AI
    // classification fills in only when the import tier produced none.
    let requirementSource: AnalysisFieldSource;
    let rawRequirements: {
      text: string;
      kind: "must" | "nice" | "unknown";
      category?: string | undefined;
    }[];
    if (job.requirements.length > 0) {
      requirementSource = "import";
      rawRequirements = job.requirements;
    } else if (ai && ai.requirements.length > 0) {
      requirementSource = "ai";
      rawRequirements = ai.requirements;
    } else {
      requirementSource = "deterministic";
      rawRequirements = [];
    }
    const profileSkillSet = new Set(matchedNames);
    const requirements: AnalyzedRequirement[] = rawRequirements.map((r, i) => {
      const skills = detectSkills(r.text);
      const coverage =
        skills.length === 0
          ? null
          : skills.filter((s) => profileSkillSet.has(s)).length / skills.length;
      const aiCategory = ai?.requirements.find((c) => c.text === r.text)?.category;
      return {
        id: `req_${i + 1}`,
        text: r.text,
        kind: r.kind,
        category: (r.category ?? aiCategory ?? "other") as AnalyzedRequirement["category"],
        skills,
        coverage,
      };
    });
    fieldProvenance.requirements = requirementSource;

    // Seniority: the posting's own statement beats AI inference.
    const seniority =
      job.seniority !== "unspecified"
        ? { value: job.seniority, source: "import" as const }
        : ai && ai.seniority !== "unspecified"
          ? { value: ai.seniority, source: "ai" as const }
          : { value: "unspecified" as const, source: "deterministic" as const };
    fieldProvenance.seniority = seniority.source;
    if (ai) {
      fieldProvenance.redFlags = "ai";
      fieldProvenance.gapNarrative = "ai";
    }

    // ── Pass D: deterministic score (ADR-0007) ───────────────────────────
    const mustCoverage = requirements
      .filter((r) => r.kind === "must" && r.coverage !== null)
      .map((r) => r.coverage!);
    const { score, breakdown } = computeFitScore({
      mustCoverage,
      skillOverlap: jobSkills.length > 0 ? matchedNames.length / new Set(jobSkills.map((s) => s)).size : null,
      jobSeniority: seniority.value,
      candidateSeniority: deriveCandidateSeniority(profile, now),
    });

    const analysis = JobAnalysisSchema.parse({
      // Deterministic identity: re-analyzing the same (job, profile, analyzer)
      // refreshes one row instead of accumulating duplicates.
      id: `ana_${fnv1a(`${job.id}|${profile.updatedAt}|${ANALYZER_VERSION}`)}`,
      schemaVersion: SCHEMA_VERSION,
      jobId: job.id,
      profileVersion: profile.updatedAt,
      analyzerVersion: ANALYZER_VERSION,
      fitScore: score,
      breakdown,
      skills: { matched: skillMatch.matched, missing: skillMatch.missing },
      requirements,
      seniority,
      ...(compensation ? { compensation } : {}),
      redFlags: ai?.redFlags ?? [],
      implicitExpectations: ai?.implicitExpectations ?? [],
      ...(ai?.gapNarrative ? { gapNarrative: ai.gapNarrative } : {}),
      fieldProvenance,
      aiUsed: ai !== undefined,
      createdAt: now,
    });

    try {
      deps.analyses.save(analysis);
    } catch (err) {
      return {
        ok: false,
        stage: "storage",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return { ok: true, analysis, job, ...(aiNote ? { aiNote } : {}) };
  };
}
