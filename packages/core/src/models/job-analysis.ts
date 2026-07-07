import { z } from "zod";
import { IdSchema, SchemaVersionSchema, TimestampSchema } from "./common.js";
import { CompensationSchema, SenioritySchema } from "./job.js";
import { RequirementCategorySchema } from "./job-insights.js";

/**
 * Canonical JobAnalysis (SDD §11, §18): a derived, versioned artifact bound
 * to (job, profile version, analyzer version). Every section records whether
 * it came from deterministic code, the import-time extraction, or the AI
 * pass — trust is a property of data.
 */

export const AnalysisFieldSourceSchema = z.enum(["deterministic", "import", "ai"]);
export type AnalysisFieldSource = z.infer<typeof AnalysisFieldSourceSchema>;

export const AnalyzedRequirementSchema = z.object({
  id: IdSchema,
  text: z.string().min(1),
  kind: z.enum(["must", "nice", "unknown"]),
  category: RequirementCategorySchema,
  /** Dictionary skills detected in this requirement's text. */
  skills: z.array(z.string().min(1)),
  /** Fraction of detected skills present in the profile; null = no detectable skills. */
  coverage: z.number().min(0).max(1).nullable(),
});

export const JobAnalysisSchema = z.object({
  id: IdSchema,
  schemaVersion: SchemaVersionSchema,
  jobId: IdSchema,
  /** The profile's updatedAt at analysis time — staleness is detectable (SDD §11). */
  profileVersion: TimestampSchema,
  analyzerVersion: z.number().int().positive(),
  fitScore: z.number().int().min(0).max(100),
  breakdown: z.array(
    z.object({
      component: z.enum(["mustCoverage", "skillOverlap", "seniorityAlignment"]),
      weight: z.number().positive(),
      value: z.number().min(0).max(1),
    }),
  ),
  skills: z.object({
    matched: z.array(z.object({ name: z.string().min(1), profileSkillId: IdSchema })),
    missing: z.array(z.string().min(1)),
  }),
  requirements: z.array(AnalyzedRequirementSchema),
  seniority: z.object({ value: SenioritySchema, source: AnalysisFieldSourceSchema }),
  compensation: CompensationSchema.optional(),
  redFlags: z.array(z.string().min(1)),
  implicitExpectations: z.array(z.string().min(1)),
  gapNarrative: z.string().min(1).optional(),
  /** Which pass produced each section (SDD §18 pass C). */
  fieldProvenance: z.record(z.string(), AnalysisFieldSourceSchema),
  aiUsed: z.boolean(),
  createdAt: TimestampSchema,
});
export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;
export type AnalyzedRequirement = z.infer<typeof AnalyzedRequirementSchema>;
