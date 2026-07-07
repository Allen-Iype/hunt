import { z } from "zod";
import {
  EmploymentTypeSchema,
  SenioritySchema,
  WorkplaceTypeSchema,
} from "./job.js";

/**
 * The draft a normalizer produces before canonical assembly (SDD §9): the
 * subset of Job that is *extractable from posting content*. System fields
 * (ids, dedup hash, provenance, timestamps) are deliberately absent — they
 * are assembled deterministically and never come from extraction, least of
 * all from an LLM.
 *
 * This schema does double duty (SDD §15): it validates every extraction
 * tier's output, and its JSON Schema form constrains AI structured output.
 * Unknown enum values default to "unspecified" — an extractor omitting a
 * field is the honest signal.
 */
export const ExtractedJobDraftSchema = z.object({
  title: z.string().min(1),
  companyName: z.string().min(1),
  locations: z.array(z.string().min(1)).default([]),
  workplaceType: WorkplaceTypeSchema.default("unspecified"),
  employmentType: EmploymentTypeSchema.default("unspecified"),
  seniority: SenioritySchema.default("unspecified"),
  /** Verbatim pay text if present; parsing into a range is deterministic downstream work. */
  compensationRaw: z.string().min(1).optional(),
  requirements: z
    .array(
      z.object({
        text: z.string().min(1),
        kind: z.enum(["must", "nice", "unknown"]).default("unknown"),
      }),
    )
    .default([]),
  responsibilities: z.array(z.string().min(1)).default([]),
  skills: z.array(z.string().min(1)).default([]),
  /** ISO date or datetime; normalized to a full timestamp at assembly. */
  postedAt: z.union([z.iso.datetime({ offset: true }), z.iso.date()]).optional(),
});
export type ExtractedJobDraft = z.infer<typeof ExtractedJobDraftSchema>;
