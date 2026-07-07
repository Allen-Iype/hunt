import { z } from "zod";
import { SenioritySchema } from "./job.js";

/**
 * AI pass output contract (SDD §18 pass B): reasoning over posting prose
 * that deterministic code cannot do. Like ExtractedJobDraft, this is what
 * the model may produce — nothing here can touch system fields, and the
 * fit score is deliberately absent (ADR-0007).
 */

export const RequirementCategorySchema = z.enum([
  "technical",
  "experience",
  "education",
  "soft",
  "domain",
  "language",
  "other",
]);

export const ClassifiedRequirementSchema = z.object({
  text: z.string().min(1),
  kind: z.enum(["must", "nice", "unknown"]).default("unknown"),
  category: RequirementCategorySchema.default("other"),
});

export const JobInsightsSchema = z.object({
  requirements: z.array(ClassifiedRequirementSchema).default([]),
  seniority: SenioritySchema.default("unspecified"),
  /** Observable concerns only (e.g. "on-call without compensation mentioned"). */
  redFlags: z.array(z.string().min(1)).default([]),
  /** Expectations implied but not stated (e.g. startup posting implies breadth). */
  implicitExpectations: z.array(z.string().min(1)).default([]),
  /** Short narrative on the candidate's gaps, grounded in the provided match results. */
  gapNarrative: z.string().min(1).optional(),
});
export type JobInsights = z.infer<typeof JobInsightsSchema>;
export type ClassifiedRequirement = z.infer<typeof ClassifiedRequirementSchema>;
