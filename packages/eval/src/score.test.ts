import type { DiscoveredRef } from "@hunt/core";
import { describe, expect, it } from "vitest";
import { scoreCase } from "./score.js";

/**
 * Scorer unit tests (ADR-0015). Pin the extraction-quality math: recall on
 * missed leads, field accuracy on mangled fields, false-positive rate on junk
 * leads, and the empty-expected edge.
 */
const ref = (over: Partial<DiscoveredRef> & Pick<DiscoveredRef, "url" | "title">): DiscoveredRef => ({
  sourceId: "test",
  ...over,
});

describe("scoreCase", () => {
  it("scores a perfect extraction as 1.0 across the board", () => {
    const expected = [
      ref({ url: "u/1", title: "Backend Engineer", companyName: "Acme", location: "Remote", snippet: "hi" }),
      ref({ url: "u/2", title: "Designer", companyName: "Globex" }),
    ];
    const score = scoreCase("perfect", "test", expected, expected);
    expect(score.recall).toBe(1);
    expect(score.fieldAccuracy).toBe(1);
    expect(score.falsePositiveRate).toBe(0);
    expect(score.score).toBe(1);
    expect(score.matchedCount).toBe(2);
  });

  it("normalizes whitespace and case when comparing fields", () => {
    const expected = [ref({ url: "u/1", title: "Backend Engineer", companyName: "Acme" })];
    const actual = [ref({ url: "u/1", title: "  backend   engineer ", companyName: "ACME" })];
    expect(scoreCase("norm", "test", expected, actual).fieldAccuracy).toBe(1);
  });

  it("drops recall when a lead is missed (a page the scraper failed to read)", () => {
    const expected = [ref({ url: "u/1", title: "A" }), ref({ url: "u/2", title: "B" })];
    const actual = [ref({ url: "u/1", title: "A" })];
    const score = scoreCase("miss", "test", expected, actual);
    expect(score.recall).toBe(0.5);
    expect(score.matchedCount).toBe(1);
    expect(score.score).toBe(0.5); // recall 0.5 × fieldAccuracy 1
  });

  it("drops field accuracy when a matched lead's fields are mangled", () => {
    // Expected asserts title + companyName + location + snippet-presence = 4 fields.
    const expected = [ref({ url: "u/1", title: "Backend Engineer", companyName: "Acme", location: "Remote", snippet: "x" })];
    const actual = [ref({ url: "u/1", title: "Backend Engineer", companyName: "WRONG", location: "Remote", snippet: "x" })];
    const score = scoreCase("mangled", "test", expected, actual);
    expect(score.recall).toBe(1);
    expect(score.fieldAccuracy).toBe(0.75); // 3 of 4 fields correct
  });

  it("reports a false-positive rate when the scraper grabs non-jobs", () => {
    const expected = [ref({ url: "u/1", title: "A" })];
    const actual = [ref({ url: "u/1", title: "A" }), ref({ url: "junk", title: "Cookie banner" })];
    const score = scoreCase("fp", "test", expected, actual);
    expect(score.falsePositiveRate).toBe(0.5); // 1 of 2 actual leads is junk
    expect(score.recall).toBe(1);
  });

  it("treats an empty expected set as trivially perfect (recall/fieldAccuracy = 1)", () => {
    const score = scoreCase("empty", "test", [], []);
    expect(score.score).toBe(1);
    expect(score.falsePositiveRate).toBe(0);
  });
});
