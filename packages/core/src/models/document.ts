import { z } from "zod";
import { IdSchema, SchemaVersionSchema, TimestampSchema } from "./common.js";

/**
 * Canonical generated documents (SDD §11, §17): ResumeDocument and
 * CoverLetterDocument. Structured content whose every bullet carries the
 * fact ids it derives from (grounding is a property of the stored artifact,
 * not just of generation). Documents are immutable versions — new tailoring
 * is a new version, and approval is a one-way gate before a document is
 * sendable (§17 step 5).
 */

export const DOCUMENT_GENERATOR_VERSION = 1;

export const DocumentKindSchema = z.enum(["resume", "cover_letter"]);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

export const DocumentStatusSchema = z.enum(["draft", "approved"]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/** A rendered bullet: prose plus the candidate-set fact ids it cites. */
export const DocumentBulletSchema = z.object({
  text: z.string().min(1),
  sourceFactIds: z.array(IdSchema).min(1),
});
export type DocumentBullet = z.infer<typeof DocumentBulletSchema>;

export const DocumentSectionSchema = z.object({
  heading: z.string().min(1),
  bullets: z.array(DocumentBulletSchema).min(1),
});
export type DocumentSection = z.infer<typeof DocumentSectionSchema>;

/**
 * Reproducibility record (SDD §17): which model, prompt/task version, and
 * inputs produced this document, plus the exact candidate fact ids offered to
 * the composer — so a document's grounding is auditable after the fact even
 * if the profile later changes.
 */
export const GenerationMetaSchema = z.object({
  generatorVersion: z.number().int().positive(),
  aiTaskId: z.string().min(1),
  aiTaskVersion: z.number().int().positive(),
  providerId: z.string().min(1),
  /** Candidate fact ids presented to the composer at generation time. */
  candidateFactIds: z.array(IdSchema),
  /** Number of repair rounds the claim tracer forced (0 = clean first pass). */
  repairRounds: z.number().int().nonnegative(),
});
export type GenerationMeta = z.infer<typeof GenerationMetaSchema>;

/** Content shared by both document kinds: an ordered list of grounded sections. */
const documentBase = {
  id: IdSchema,
  schemaVersion: SchemaVersionSchema,
  kind: DocumentKindSchema,
  jobId: IdSchema,
  /** The analysis this document was tailored against. */
  analysisId: IdSchema,
  /** The profile's updatedAt at generation time — staleness is detectable (SDD §11). */
  profileVersion: TimestampSchema,
  /** Attached to an application once tracked (M5); documents can be generated first. */
  applicationId: IdSchema.optional(),
  status: DocumentStatusSchema,
  generationMeta: GenerationMetaSchema,
  /** Path to the rendered HTML in the user-facing documents folder, once rendered. */
  renderPath: z.string().min(1).optional(),
  createdAt: TimestampSchema,
} as const;

export const ResumeDocumentSchema = z.object({
  ...documentBase,
  kind: z.literal("resume"),
  contact: z.object({
    name: z.string().min(1),
    email: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    links: z.array(z.object({ label: z.string().min(1), url: z.url() })).default([]),
  }),
  summary: DocumentBulletSchema,
  sections: z.array(DocumentSectionSchema).min(1),
});
export type ResumeDocument = z.infer<typeof ResumeDocumentSchema>;

export const CoverLetterDocumentSchema = z.object({
  ...documentBase,
  kind: z.literal("cover_letter"),
  companyName: z.string().min(1),
  jobTitle: z.string().min(1),
  hook: DocumentBulletSchema,
  body: z.array(DocumentBulletSchema).min(1),
  closing: DocumentBulletSchema,
});
export type CoverLetterDocument = z.infer<typeof CoverLetterDocumentSchema>;

/** A generated document of either kind (discriminated by `kind`). */
export const GeneratedDocumentSchema = z.discriminatedUnion("kind", [
  ResumeDocumentSchema,
  CoverLetterDocumentSchema,
]);
export type GeneratedDocument = z.infer<typeof GeneratedDocumentSchema>;
