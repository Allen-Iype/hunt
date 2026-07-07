import { genericUrlAdapter } from "./adapters/generic-url.js";
import { linkedinAdapter } from "./adapters/linkedin.js";
import type { SourceAdapter } from "./adapters/types.js";

/**
 * Static adapter registry (Tier 0, ADR-0008): the single file that changes
 * when a source is added. Order matters — first match wins, so specific
 * adapters precede the generic fallback.
 */
export const SOURCE_ADAPTERS: readonly SourceAdapter[] = [linkedinAdapter, genericUrlAdapter];

export function resolveAdapter(url: string): SourceAdapter | null {
  return SOURCE_ADAPTERS.find((a) => a.matchesUrl(url)) ?? null;
}
