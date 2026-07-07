import type { ExtractedJobDraft } from "@hunt/core";

/**
 * Source adapter contract (SDD §8, Tier-0 plugin stance ADR-0008). Fetching
 * (I/O) and DOM-tier normalization (parsing) are both source-specific, so an
 * adapter may provide either or both; the pipeline owns the tier ordering.
 */
export interface SourceAdapter {
  id: string;
  version: string;
  /** Claim a URL. Adapters are consulted in registry order. */
  matchesUrl(url: string): boolean;
  /** Fetch the page for a claimed URL. Throws FetchError with a user hint on failure. */
  fetchUrl(url: string): Promise<string>;
  /**
   * Tier-2 DOM extraction for this source's known markup (SDD §9).
   * Returns null when the markup doesn't match (fall through to AI tier).
   */
  domExtract?(html: string): { draft: ExtractedJobDraft; descriptionText: string } | null;
}
