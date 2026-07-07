import { z } from "zod";
import { IdSchema } from "./common.js";

/**
 * AI composition output contracts (SDD §17 step 2). Like ExtractedJobDraft
 * and JobInsights, these define exactly what the model may emit — nothing
 * here can touch system fields (ids, status, provenance), and every bullet
 * MUST cite at least one fact id (schema-required grounding, ADR-0006).
 *
 * The cited ids are validated against the candidate set by the deterministic
 * claim tracer (§17 step 3), not trusted from the model.
 */

export const DraftBulletSchema = z.object({
  text: z.string().min(1),
  /** Candidate-set fact ids this bullet derives from — required, min 1 (ADR-0006). */
  sourceFactIds: z.array(IdSchema).min(1),
});
export type DraftBullet = z.infer<typeof DraftBulletSchema>;

export const DraftSectionSchema = z.object({
  heading: z.string().min(1),
  bullets: z.array(DraftBulletSchema).min(1),
});
export type DraftSection = z.infer<typeof DraftSectionSchema>;

/** Resume draft: a headline summary plus grounded sections. */
export const ResumeDraftSchema = z.object({
  /** One-line positioning statement; must itself cite facts. */
  summary: DraftBulletSchema,
  sections: z.array(DraftSectionSchema).min(1),
});
export type ResumeDraft = z.infer<typeof ResumeDraftSchema>;

/** Cover-letter draft: hook, body claims, closing — each a grounded bullet. */
export const CoverLetterDraftSchema = z.object({
  hook: DraftBulletSchema,
  body: z.array(DraftBulletSchema).min(1),
  closing: DraftBulletSchema,
});
export type CoverLetterDraft = z.infer<typeof CoverLetterDraftSchema>;
