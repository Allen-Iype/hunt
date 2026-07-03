import { z } from "zod";
import {
  IdSchema,
  ProvenanceSchema,
  SchemaVersionSchema,
  TimestampSchema,
} from "./common.js";

/**
 * Canonical Job model (SDD §11). Draft (M0).
 *
 * A Job is a normalized posting. It never records which source it came from
 * except inside the opaque `provenance` block.
 */

export const WorkplaceTypeSchema = z.enum([
  "onsite",
  "hybrid",
  "remote",
  "unspecified",
]);

export const EmploymentTypeSchema = z.enum([
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
  "unspecified",
]);

export const SenioritySchema = z.enum([
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "manager",
  "director",
  "executive",
  "unspecified",
]);

/**
 * Compensation keeps the raw string alongside the parsed range because pay
 * text parsing is lossy (SDD §11); the raw form is the ground truth.
 */
export const CompensationSchema = z.object({
  raw: z.string().min(1),
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  period: z.enum(["hour", "day", "month", "year"]).optional(),
});

/**
 * A requirement/responsibility extracted from the description. `span` points
 * back into `descriptionText` (start/end character offsets) so extraction
 * stays auditable (SDD §11).
 */
export const JobRequirementSchema = z.object({
  id: IdSchema,
  text: z.string().min(1),
  kind: z.enum(["must", "nice", "unknown"]),
  category: z.string().min(1).optional(),
  span: z
    .object({ start: z.number().int().nonnegative(), end: z.number().int().positive() })
    .refine((s) => s.end > s.start, { message: "span.end must be > span.start" })
    .optional(),
});

export const JobSchema = z.object({
  id: IdSchema,
  schemaVersion: SchemaVersionSchema,
  title: z.string().min(1),
  companyName: z.string().min(1),
  /** Set once Company entities exist (M1+); jobs are importable before company research. */
  companyId: IdSchema.optional(),
  locations: z.array(z.string().min(1)),
  workplaceType: WorkplaceTypeSchema,
  employmentType: EmploymentTypeSchema,
  seniority: SenioritySchema,
  compensation: CompensationSchema.optional(),
  /** Clean plain text of the posting; the original HTML lives in the raw vault. */
  descriptionText: z.string().min(1),
  requirements: z.array(JobRequirementSchema),
  responsibilities: z.array(JobRequirementSchema),
  skills: z.array(z.string().min(1)),
  postedAt: TimestampSchema.optional(),
  closesAt: TimestampSchema.optional(),
  /** Deterministic content hash for dedup (SDD §9); computed by core logic in M2. */
  dedupHash: z.string().min(1),
  provenance: ProvenanceSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export type Job = z.infer<typeof JobSchema>;
export type JobRequirement = z.infer<typeof JobRequirementSchema>;
export type Compensation = z.infer<typeof CompensationSchema>;
export type WorkplaceType = z.infer<typeof WorkplaceTypeSchema>;
export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;
export type Seniority = z.infer<typeof SenioritySchema>;
