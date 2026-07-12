import { scoreCase } from "./score.js";
import type { EvalReport, EvalThreshold, GateResult, GoldenCase } from "./types.js";

/**
 * Eval runner + gate (ADR-0015, discovery-extraction scope). `runEval` executes
 * each golden case's `run` thunk (fully offline — the thunk wires the adapter to
 * a recorded snapshot) and scores the output. `gate` turns a report into a
 * pass/fail verdict a Tier-4 scraper must clear before it ships.
 */

/** Run and score every golden case, then aggregate. */
export async function runEval(cases: readonly GoldenCase[]): Promise<EvalReport> {
  const scored = [];
  for (const c of cases) {
    const actual = await c.run();
    scored.push(scoreCase(c.name, c.source, c.expected, actual));
  }
  const meanScore =
    scored.length === 0 ? 0 : scored.reduce((sum, s) => sum + s.score, 0) / scored.length;
  const maxFalsePositiveRate =
    scored.length === 0 ? 0 : Math.max(...scored.map((s) => s.falsePositiveRate));
  return { cases: scored, meanScore, maxFalsePositiveRate };
}

/**
 * Apply a pass/fail threshold to a report. Both bars must clear: mean score at
 * or above `minMeanScore`, and no case above `maxFalsePositiveRate`. A report
 * with no cases fails — an untested scraper is not a passing scraper.
 */
export function gate(report: EvalReport, threshold: EvalThreshold): GateResult {
  const reasons: string[] = [];
  if (report.cases.length === 0) {
    reasons.push("no golden cases were evaluated");
  }
  if (report.meanScore < threshold.minMeanScore) {
    reasons.push(
      `mean score ${report.meanScore.toFixed(3)} is below the minimum ${threshold.minMeanScore.toFixed(3)}`,
    );
  }
  if (report.maxFalsePositiveRate > threshold.maxFalsePositiveRate) {
    const worst = report.cases.find((c) => c.falsePositiveRate === report.maxFalsePositiveRate);
    reasons.push(
      `false-positive rate ${report.maxFalsePositiveRate.toFixed(3)}${worst ? ` (case "${worst.name}")` : ""} exceeds the maximum ${threshold.maxFalsePositiveRate.toFixed(3)}`,
    );
  }
  return { passed: reasons.length === 0, reasons };
}
