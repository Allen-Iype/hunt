import type { DiscoveredRef, SearchQuery } from "@hunt/core";

/**
 * Discovery adapter contract (ADR-0015; decisions log: discovery registry is
 * deliberately separate from the source-adapter registry — different shape).
 *
 * A discovery adapter is the INVERSE of a `SourceAdapter`: given a board handle
 * and a structured query, it *produces many leads*, rather than fetching and
 * normalizing one known URL. It fetches the board's published listing (JSON),
 * maps each posting to a `DiscoveredRef` lead, and applies only the cheap,
 * board-side filtering it can (most boards have no server-side search, so the
 * capability layer does deterministic client-side ranking afterward).
 *
 * Adapters produce leads ONLY — never job structure (ADR-0015 invariant).
 */
export interface DiscoveryAdapter {
  id: string;
  version: string;
  /** Fetch the board's openings and map them to leads. Throws FetchError on I/O failure. */
  discover(input: { board: string; query: SearchQuery }): Promise<DiscoveredRef[]>;
}
