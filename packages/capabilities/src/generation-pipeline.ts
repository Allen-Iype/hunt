import {
  formatViolationsForRepair,
  traceClaims,
  type CandidateFact,
  type ClaimBullet,
  type ClaimViolation,
} from "@hunt/core";

/**
 * The bounded compose → trace → repair loop shared by resume and cover-letter
 * generation (SDD §17 steps 2–3, ADR-0006). The composer is invoked; its
 * draft is claim-traced; if it fails, the violations are fed back and it is
 * re-invoked, up to a bounded number of rounds. A draft that still fails is
 * never persisted as sendable — the violations are surfaced to the user.
 *
 * `compose` and `toBullets` are supplied by the caller so the same loop
 * serves both document kinds; the loop itself owns the invariant.
 */

export const MAX_REPAIR_ROUNDS = 2;

export type ComposeAttempt<TDraft> =
  | { ok: true; draft: TDraft; providerId: string; taskVersion: number }
  | { ok: false; kind: "unavailable" | "provider" | "invalid-output"; message: string };

export type GroundedDraft<TDraft> =
  | {
      ok: true;
      draft: TDraft;
      providerId: string;
      taskVersion: number;
      /** Number of repair rounds forced (0 = clean first pass). */
      repairRounds: number;
    }
  | { ok: false; stage: "ai"; message: string; kind: string }
  | { ok: false; stage: "grounding"; message: string; violations: ClaimViolation[] };

export async function composeGroundedDraft<TDraft>(
  candidateFacts: readonly CandidateFact[],
  compose: (repairFeedback?: string) => Promise<ComposeAttempt<TDraft>>,
  toBullets: (draft: TDraft) => ClaimBullet[],
): Promise<GroundedDraft<TDraft>> {
  let repairFeedback: string | undefined;
  let lastViolations: ClaimViolation[] = [];

  for (let round = 0; round <= MAX_REPAIR_ROUNDS; round++) {
    const attempt = await compose(repairFeedback);
    if (!attempt.ok) {
      return { ok: false, stage: "ai", message: attempt.message, kind: attempt.kind };
    }
    const trace = traceClaims(toBullets(attempt.draft), candidateFacts);
    if (trace.ok) {
      return {
        ok: true,
        draft: attempt.draft,
        providerId: attempt.providerId,
        taskVersion: attempt.taskVersion,
        repairRounds: round,
      };
    }
    lastViolations = trace.violations;
    repairFeedback = formatViolationsForRepair(trace.violations);
  }

  return {
    ok: false,
    stage: "grounding",
    message:
      `generated content still contained ungrounded claims after ${MAX_REPAIR_ROUNDS} repair ` +
      `round(s); nothing sendable was produced`,
    violations: lastViolations,
  };
}
