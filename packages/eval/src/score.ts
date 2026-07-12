import type { DiscoveredRef } from "@hunt/core";
import type { CaseScore } from "./types.js";

/**
 * Extraction scorer (ADR-0015). Compares an adapter's actual leads against a
 * golden `expected` set, matched by URL (the lead primary key). Produces recall,
 * per-field accuracy on matched leads, and a false-positive rate. Deterministic
 * and offline — no network, no clock, no randomness.
 */

/** Normalize a display field for comparison: trim + collapse whitespace + lowercase. */
function norm(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : undefined;
}

/** URLs identify leads; normalize trailing slash + case of host only lightly (trim). */
function normUrl(url: string): string {
  return url.trim();
}

/**
 * Compare the display fields of a matched (same-URL) pair. Returns [matched,
 * total] over the fields the EXPECTED lead asserts. `title` is always asserted
 * (a lead requires one); companyName/location are scored only when expected has
 * them; snippet is scored by presence (both have / both lack), since teasers are
 * truncated and not worth exact-matching.
 */
function fieldScore(expected: DiscoveredRef, actual: DiscoveredRef): [matched: number, total: number] {
  let matched = 0;
  let total = 0;

  // title — always asserted
  total += 1;
  if (norm(expected.title) === norm(actual.title)) matched += 1;

  // companyName / location — asserted only when expected carries them
  for (const key of ["companyName", "location"] as const) {
    if (expected[key] !== undefined) {
      total += 1;
      if (norm(expected[key]) === norm(actual[key])) matched += 1;
    }
  }

  // snippet — presence match (teasers are truncated; exact text is brittle)
  total += 1;
  if (Boolean(expected.snippet) === Boolean(actual.snippet)) matched += 1;

  return [matched, total];
}

/** Score one case's actual output against its expected leads. */
export function scoreCase(
  name: string,
  source: string,
  expected: DiscoveredRef[],
  actual: DiscoveredRef[],
): CaseScore {
  const actualByUrl = new Map<string, DiscoveredRef>();
  for (const ref of actual) actualByUrl.set(normUrl(ref.url), ref);

  const expectedUrls = new Set(expected.map((e) => normUrl(e.url)));

  let matchedCount = 0;
  let fieldMatched = 0;
  let fieldTotal = 0;
  for (const exp of expected) {
    const act = actualByUrl.get(normUrl(exp.url));
    if (!act) continue; // missed lead — lowers recall
    matchedCount += 1;
    const [m, t] = fieldScore(exp, act);
    fieldMatched += m;
    fieldTotal += t;
  }

  const falsePositives = actual.filter((a) => !expectedUrls.has(normUrl(a.url))).length;

  const recall = expected.length === 0 ? 1 : matchedCount / expected.length;
  const fieldAccuracy = fieldTotal === 0 ? 1 : fieldMatched / fieldTotal;
  const falsePositiveRate = actual.length === 0 ? 0 : falsePositives / actual.length;

  return {
    name,
    source,
    recall,
    fieldAccuracy,
    falsePositiveRate,
    score: recall * fieldAccuracy,
    expectedCount: expected.length,
    actualCount: actual.length,
    matchedCount,
  };
}
