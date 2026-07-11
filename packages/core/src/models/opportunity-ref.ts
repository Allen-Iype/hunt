import { z } from "zod";
import { fnv1a } from "../hash.js";
import { IdSchema, TimestampSchema } from "./common.js";

/**
 * OpportunityRef (ADR-0015): a discovered **lead**, never a job.
 *
 * The load-bearing invariant (ADR-0015 decision #3): a ref carries only enough
 * to identify and rank a lead — source, url, title, company, a short snippet.
 * It MUST NOT carry normalized job structure (requirements, parsed
 * compensation, a clean description). Normalization happens ONLY in the import
 * pipeline, on refs the user chose to import. This is the line that keeps Hunt
 * a local discovery tool and not an aggregator: we store leads + the user's own
 * imported jobs, never a hosted corpus of postings.
 *
 * `.strict()` enforces the invariant structurally — any attempt to smuggle job
 * fields onto a ref fails validation, so the invariant is testable, not just
 * documented.
 */

/** Lifecycle so re-running a search doesn't resurface handled leads (ADR-0015 extension point). */
export const OpportunityRefStatusSchema = z.enum(["new", "imported", "dismissed"]);
export type OpportunityRefStatus = z.infer<typeof OpportunityRefStatusSchema>;

export const OpportunityRefSchema = z
  .object({
    id: IdSchema,
    /** Discovery adapter id that produced this lead, e.g. "greenhouse". */
    sourceId: z.string().min(1),
    /** The canonical URL of the posting — the handoff into the import pipeline. */
    url: z.url(),
    title: z.string().min(1),
    companyName: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    /** Short teaser only (NOT the full description) — a display/ranking aid. */
    snippet: z.string().optional(),
    /** The SavedSearch this lead was discovered for. */
    queryId: IdSchema,
    discoveredAt: TimestampSchema,
    status: OpportunityRefStatusSchema.default("new"),
    /** Deterministic intent-relevance in [0..1] (rankOpportunity). */
    relevance: z.number().min(0).max(1),
  })
  .strict();
export type OpportunityRef = z.infer<typeof OpportunityRefSchema>;

/**
 * Deterministic id from (sourceId, url) so re-discovering the same posting
 * updates rather than duplicates. Content-derived, matching ADR-0011's stance;
 * cross-corpus job dedup remains SHA-256 in ingestion — this is intra-user
 * lead identity at profile scale.
 */
export function opportunityRefId(sourceId: string, url: string): string {
  return `opp_${fnv1a(`${sourceId}|${url}`)}`;
}
