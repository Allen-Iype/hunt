import {
  createGlassdoorAdapter,
  createIndeedAdapter,
  createLinkedInAdapter,
} from "@hunt/ingestion";
import { describe, expect, it } from "vitest";
import { gate, runEval } from "../harness.js";
import type { GoldenCase } from "../types.js";
import {
  glassdoorExpected,
  glassdoorHtml,
  indeedExpected,
  indeedHtml,
  linkedinExpected,
  linkedinHtml,
} from "./scrapers.golden.js";

/**
 * The Phase D gate (ADR-0015): every Tier-4 web scraper must clear the eval
 * threshold against its golden snapshot before it ships. This is the enforced
 * link between Phase C (harness) and Phase D (scrapers) — a broken selector
 * drops the score below the bar and fails CI, instead of silently returning no
 * jobs. Threshold: high, since these are pinned fixtures (real-world recall
 * against a live site will be lower and is measured separately when recording).
 */
const QUERY = { roles: ["Backend Engineer"], skills: [], locations: [] };
const THRESHOLD = { minMeanScore: 0.9, maxFalsePositiveRate: 0.1 };

const CASES: GoldenCase[] = [
  {
    name: "linkedin: guest jobs fragment (recorded)",
    source: "linkedin",
    expected: linkedinExpected,
    run: () => createLinkedInAdapter({ fetchPage: async () => linkedinHtml }).discover({ board: "global", query: QUERY }),
  },
  {
    name: "indeed: results fragment (recorded)",
    source: "indeed",
    expected: indeedExpected,
    run: () => createIndeedAdapter({ fetchPage: async () => indeedHtml }).discover({ board: "global", query: QUERY }),
  },
  {
    name: "glassdoor: listings fragment (recorded)",
    source: "glassdoor",
    expected: glassdoorExpected,
    run: () => createGlassdoorAdapter({ fetchPage: async () => glassdoorHtml }).discover({ board: "global", query: QUERY }),
  },
];

describe("Tier-4 scraper eval gate", () => {
  it("every scraper clears the quality threshold against its golden snapshot", async () => {
    const report = await runEval(CASES);
    const result = gate(report, THRESHOLD);
    expect(result.reasons).toEqual([]);
    expect(result.passed).toBe(true);
    expect(report.meanScore).toBeGreaterThanOrEqual(0.9);
  });

  it("scores each scraper individually so a single regression is attributable", async () => {
    const report = await runEval(CASES);
    for (const c of report.cases) {
      expect(c.score, `${c.source} extraction score`).toBeGreaterThanOrEqual(0.9);
      expect(c.falsePositiveRate, `${c.source} false-positive rate`).toBeLessThanOrEqual(0.1);
    }
  });
});
