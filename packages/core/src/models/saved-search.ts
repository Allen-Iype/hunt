import { z } from "zod";
import { fnv1a } from "../hash.js";
import { IdSchema, TimestampSchema } from "./common.js";

/**
 * SavedSearch (ADR-0015): the user's *stated intent* — the primary ranking
 * signal for discovery. Discovery works from intent alone; the profile is an
 * optional enrichment, never a prerequisite (ADR-0015 decision #4).
 *
 * A search names the boards to watch (`sources`, e.g. a Greenhouse company
 * slug) and the intent to filter/rank by. Board query semantics vary — some
 * boards list every opening with no server-side search — so intent is applied
 * client-side, deterministically, over the fetched leads.
 */

/** One discovery source binding: which adapter, and its per-source config (e.g. a board slug). */
export const DiscoverySourceSchema = z
  .object({
    /** Discovery adapter id, e.g. "greenhouse". */
    adapterId: z.string().min(1),
    /** Adapter-specific handle: a board/company slug the adapter knows how to fetch. */
    board: z.string().min(1),
  })
  .strict();
export type DiscoverySource = z.infer<typeof DiscoverySourceSchema>;

export const SearchQuerySchema = z
  .object({
    roles: z.array(z.string().min(1)).default([]),
    skills: z.array(z.string().min(1)).default([]),
    locations: z.array(z.string().min(1)).default([]),
    remote: z.boolean().optional(),
  })
  .strict();
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SavedSearchSchema = z
  .object({
    id: IdSchema,
    /** Human label for the search, e.g. "senior backend, remote". */
    name: z.string().min(1),
    query: SearchQuerySchema,
    sources: z.array(DiscoverySourceSchema).min(1),
    createdAt: TimestampSchema,
  })
  .strict();
export type SavedSearch = z.infer<typeof SavedSearchSchema>;

/**
 * Deterministic id from the search's name so re-adding an identically-named
 * search is idempotent (matches the ID-derivation stance, ADR-0011).
 */
export function savedSearchId(name: string): string {
  return `search_${fnv1a(name.trim().toLowerCase())}`;
}
