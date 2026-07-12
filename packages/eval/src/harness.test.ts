import { createGreenhouseAdapter } from "@hunt/ingestion";
import { describe, expect, it } from "vitest";
import { greenhouseExpected, greenhouseSnapshot } from "./golden/greenhouse.golden.js";
import { gate, runEval } from "./harness.js";
import type { GoldenCase } from "./types.js";

const QUERY = { roles: [], skills: [], locations: [] };

/**
 * Harness integration tests (ADR-0015). These drive a REAL discovery adapter
 * (Greenhouse) against a recorded golden snapshot, proving the eval measures
 * actual extraction — and that a deliberately-broken adapter is caught by the
 * gate. This is the template Tier-4 scrapers reuse.
 */

/** A golden case that wires the real Greenhouse adapter to the recorded snapshot. */
function greenhouseCase(): GoldenCase {
  return {
    name: "greenhouse: acme board (recorded)",
    source: "greenhouse",
    expected: greenhouseExpected,
    run: () =>
      createGreenhouseAdapter({ fetchJson: async () => greenhouseSnapshot }).discover({
        board: "acme",
        query: QUERY,
      }),
  };
}

/** A broken adapter that mangles titles and invents a junk lead — should fail the gate. */
function brokenCase(): GoldenCase {
  return {
    name: "greenhouse: broken extraction",
    source: "greenhouse",
    expected: greenhouseExpected,
    run: async () => [
      { sourceId: "greenhouse", url: "https://boards.greenhouse.io/acme/jobs/101", title: "???" },
      { sourceId: "greenhouse", url: "junk://cookie-banner", title: "Accept all cookies" },
    ],
  };
}

describe("runEval + gate", () => {
  it("scores a healthy real adapter at the top of the range", async () => {
    const report = await runEval([greenhouseCase()]);
    expect(report.cases).toHaveLength(1);
    expect(report.meanScore).toBe(1);
    expect(report.maxFalsePositiveRate).toBe(0);
    expect(gate(report, { minMeanScore: 0.9, maxFalsePositiveRate: 0.1 }).passed).toBe(true);
  });

  it("fails the gate when extraction is broken (missed leads, mangled title, junk lead)", async () => {
    const report = await runEval([brokenCase()]);
    // 1 of 3 leads found, its title mangled, plus a junk false positive.
    expect(report.meanScore).toBeLessThan(0.5);
    expect(report.maxFalsePositiveRate).toBeGreaterThan(0);
    const result = gate(report, { minMeanScore: 0.9, maxFalsePositiveRate: 0.1 });
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/score .* below|false-positive/);
  });

  it("fails a gate with no golden cases (an untested scraper is not a passing scraper)", () => {
    const result = gate({ cases: [], meanScore: 0, maxFalsePositiveRate: 0 }, {
      minMeanScore: 0.9,
      maxFalsePositiveRate: 0.1,
    });
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("no golden cases were evaluated");
  });
});
