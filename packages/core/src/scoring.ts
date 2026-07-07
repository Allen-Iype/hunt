import type { Profile } from "./models/profile.js";
import type { Seniority } from "./models/job.js";

/**
 * Deterministic fit scoring (SDD §18 pass D, ADR-0007). One stable,
 * versioned function; the AI feeds inputs upstream but never emits the
 * number, so scores stay comparable across jobs and over time.
 */

export const ANALYZER_VERSION = 1;

export interface ScoreComponent {
  component: "mustCoverage" | "skillOverlap" | "seniorityAlignment";
  weight: number;
  /** 0..1 */
  value: number;
}

export interface FitScoreInput {
  /** Per-must-requirement coverage fractions (0..1); only requirements with detectable skills. */
  mustCoverage: readonly number[];
  /** Matched job skills / all detected job skills; null when no skills detected. */
  skillOverlap: number | null;
  jobSeniority: Seniority;
  candidateSeniority: Seniority;
}

export interface FitScore {
  score: number;
  breakdown: ScoreComponent[];
}

const IC_RANK: Partial<Record<Seniority, number>> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  principal: 5,
};

export function seniorityAlignment(job: Seniority, candidate: Seniority): number {
  const jobRank = IC_RANK[job];
  const candidateRank = IC_RANK[candidate];
  // Non-IC or unspecified on either side: neutral — no evidence either way.
  if (jobRank === undefined || candidateRank === undefined) return 0.7;
  const delta = Math.abs(jobRank - candidateRank);
  if (delta === 0) return 1;
  if (delta === 1) return 0.7;
  return 0.3;
}

/** Candidate seniority from total years of recorded experience. */
export function deriveCandidateSeniority(profile: Profile, now: string): Seniority {
  const starts = profile.experience.map((e) => e.startDate).sort();
  if (starts.length === 0) return "unspecified";
  const first = new Date(`${starts[0]}T00:00:00Z`).getTime();
  const ends = profile.experience.map((e) =>
    e.endDate ? new Date(`${e.endDate}T00:00:00Z`).getTime() : new Date(now).getTime(),
  );
  const years = (Math.max(...ends) - first) / (365.25 * 24 * 3600 * 1000);
  if (years < 2) return "junior";
  if (years < 5) return "mid";
  if (years < 9) return "senior";
  if (years < 13) return "staff";
  return "principal";
}

/**
 * Weighted components, renormalized over the ones that are computable for
 * this job — a posting with no detectable skills is scored on what evidence
 * exists rather than silently penalized.
 */
export function computeFitScore(input: FitScoreInput): FitScore {
  const components: ScoreComponent[] = [];

  if (input.mustCoverage.length > 0) {
    const value =
      input.mustCoverage.reduce((sum, c) => sum + c, 0) / input.mustCoverage.length;
    components.push({ component: "mustCoverage", weight: 0.5, value });
  }
  if (input.skillOverlap !== null) {
    components.push({ component: "skillOverlap", weight: 0.3, value: input.skillOverlap });
  }
  components.push({
    component: "seniorityAlignment",
    weight: 0.2,
    value: seniorityAlignment(input.jobSeniority, input.candidateSeniority),
  });

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weighted = components.reduce((sum, c) => sum + c.weight * c.value, 0);
  return {
    score: Math.round((weighted / totalWeight) * 100),
    breakdown: components,
  };
}
