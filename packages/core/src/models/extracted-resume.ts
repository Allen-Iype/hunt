import { z } from "zod";

/**
 * The draft a resume extractor produces before profile assembly (SDD §11, §15,
 * F11 §4). The subset of a Profile that is *extractable from a resume's text* —
 * system fields (fact IDs, timestamps) are deliberately absent, and so is
 * `verified`: extraction NEVER asserts a fact is verified. The ImportResume
 * capability stamps `verified: false` on every proposed fact; the user vouches
 * for their record on review, before `hunt profile import` confirms it.
 *
 * This mirrors `ExtractedJobDraft`: the schema does double duty — it validates
 * the extraction and, as JSON Schema, constrains the AI's structured output.
 * An extractor omitting a field (arrays default to empty) is the honest signal
 * that the resume did not state it. No inference, no gap-filling.
 */

const DraftAchievementSchema = z.object({
  text: z.string().min(1),
  skills: z.array(z.string().min(1)).default([]),
});

const DraftExperienceSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  /** ISO date (YYYY-MM-DD) or year-month/year if that's all the resume states. */
  startDate: z.string().min(1),
  /** Absent = current position. */
  endDate: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  achievements: z.array(DraftAchievementSchema).default([]),
});

const DraftSkillSchema = z.object({
  name: z.string().min(1),
  level: z.enum(["familiar", "proficient", "expert"]).optional(),
  years: z.number().nonnegative().optional(),
});

const DraftProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.url().optional(),
  skills: z.array(z.string().min(1)).default([]),
});

const DraftEducationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
});

const DraftCertificationSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().min(1).optional(),
  issuedDate: z.string().min(1).optional(),
});

/** Basics carry no `verified` field (ProfileBasicsSchema has none) — see M6 docs note. */
const DraftBasicsSchema = z.object({
  name: z.string().min(1),
  email: z.email().optional(),
  phone: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  headline: z.string().min(1).optional(),
  links: z.array(z.object({ label: z.string().min(1), url: z.url() })).default([]),
});

export const ExtractedResumeDraftSchema = z.object({
  basics: DraftBasicsSchema,
  experience: z.array(DraftExperienceSchema).default([]),
  skills: z.array(DraftSkillSchema).default([]),
  projects: z.array(DraftProjectSchema).default([]),
  education: z.array(DraftEducationSchema).default([]),
  certifications: z.array(DraftCertificationSchema).default([]),
});
export type ExtractedResumeDraft = z.infer<typeof ExtractedResumeDraftSchema>;
