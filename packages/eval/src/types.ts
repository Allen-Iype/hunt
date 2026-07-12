import type { DiscoveredRef } from "@hunt/core";

/**
 * Eval harness types (ADR-0015, discovery-extraction scope). The harness scores
 * ONE stage of the pipeline: does a discovery adapter/scraper correctly extract
 * *leads* from a recorded snapshot? It exists to gate the brittle Tier-4 web
 * scrapers — a scraper must clear a quality threshold against golden pages
 * before it ships, so a silent DOM change surfaces as a failing eval rather than
 * as missing jobs. (AI-output quality is a separate, later concern; not here.)
 */

/**
 * One golden extraction case. The `run` thunk is supplied by the caller and
 * wires the adapter to the recorded snapshot however that adapter needs (JSON
 * fetcher, text fetcher, …) — the harness stays adapter-construction-agnostic,
 * so it scores JSON feeds and HTML scrapers uniformly. `expected` is the
 * hand-verified set of leads that snapshot should yield.
 */
export interface GoldenCase {
  /** Human label, e.g. "linkedin: backend search page (2026-07 snapshot)". */
  name: string;
  /** Discovery source id under test, e.g. "linkedin". */
  source: string;
  /** Produce the adapter's output for the recorded snapshot. Fully offline. */
  run: () => Promise<DiscoveredRef[]>;
  /** The hand-verified leads the snapshot should produce. */
  expected: DiscoveredRef[];
}

/** Per-case extraction score. All rates are 0..1. */
export interface CaseScore {
  name: string;
  source: string;
  /** Fraction of expected leads found by URL (miss rate = 1 − recall). */
  recall: number;
  /**
   * Of matched leads, the fraction of expected display fields (title,
   * companyName, location, snippet-presence) that matched. Detects partial
   * extraction breakage even when the URL is still found.
   */
  fieldAccuracy: number;
  /** Actual leads whose URL is not in `expected`, over total actual (0 if none). */
  falsePositiveRate: number;
  /**
   * Overall quality: recall × fieldAccuracy. A scraper that misses postings OR
   * mangles their fields scores low. False positives are reported separately and
   * gated separately (a scraper can be precise-but-incomplete or vice versa).
   */
  score: number;
  expectedCount: number;
  actualCount: number;
  matchedCount: number;
}

/** Aggregate over a set of cases (e.g. all golden pages for one scraper). */
export interface EvalReport {
  cases: CaseScore[];
  /** Mean `score` across cases (0 if no cases). */
  meanScore: number;
  /** Max `falsePositiveRate` across cases — the worst offender. */
  maxFalsePositiveRate: number;
}

/** Pass/fail gate for a report. A scraper ships only if it clears both bars. */
export interface EvalThreshold {
  /** Minimum acceptable mean score (recall × fieldAccuracy). */
  minMeanScore: number;
  /** Maximum tolerated false-positive rate on any case. */
  maxFalsePositiveRate: number;
}

export interface GateResult {
  passed: boolean;
  /** Human-readable reasons a gate failed (empty when passed). */
  reasons: string[];
}
