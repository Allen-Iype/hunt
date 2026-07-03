import { z } from "zod";
import {
  DateOnlySchema,
  IdSchema,
  SchemaVersionSchema,
  TimestampSchema,
} from "./common.js";

/**
 * Canonical Profile model (SDD §11). Draft (M0).
 *
 * The Profile is a set of discrete, stable-ID'd facts — not a resume blob.
 * Fact IDs are what make generation grounding enforceable (SDD §17): every
 * generated bullet must cite the fact IDs it derives from.
 *
 * `verified`: facts imported by AI parsing start unverified until the user
 * confirms them; user-authored facts are verified by definition.
 */

export const AchievementSchema = z.object({
  id: IdSchema,
  text: z.string().min(1),
  skills: z.array(z.string().min(1)).default([]),
  verified: z.boolean().default(true),
});

export const ExperienceEntrySchema = z.object({
  id: IdSchema,
  company: z.string().min(1),
  role: z.string().min(1),
  startDate: DateOnlySchema,
  /** Absent = current position. */
  endDate: DateOnlySchema.optional(),
  location: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  achievements: z.array(AchievementSchema).default([]),
  verified: z.boolean().default(true),
});

export const SkillSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  level: z.enum(["familiar", "proficient", "expert"]).optional(),
  years: z.number().nonnegative().optional(),
  /** Fact IDs (experience/project/achievement) evidencing this skill. */
  evidenceFactIds: z.array(IdSchema).default([]),
  verified: z.boolean().default(true),
});

export const ProjectSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.url().optional(),
  skills: z.array(z.string().min(1)).default([]),
  verified: z.boolean().default(true),
});

export const EducationEntrySchema = z.object({
  id: IdSchema,
  institution: z.string().min(1),
  degree: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  startDate: DateOnlySchema.optional(),
  endDate: DateOnlySchema.optional(),
  verified: z.boolean().default(true),
});

export const CertificationSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  issuer: z.string().min(1).optional(),
  issuedDate: DateOnlySchema.optional(),
  verified: z.boolean().default(true),
});

export const ProfileBasicsSchema = z.object({
  name: z.string().min(1),
  email: z.email().optional(),
  phone: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  headline: z.string().min(1).optional(),
  links: z.array(z.object({ label: z.string().min(1), url: z.url() })).default([]),
});

export const ProfileSchema = z.object({
  id: IdSchema,
  schemaVersion: SchemaVersionSchema,
  basics: ProfileBasicsSchema,
  experience: z.array(ExperienceEntrySchema).default([]),
  skills: z.array(SkillSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  education: z.array(EducationEntrySchema).default([]),
  certifications: z.array(CertificationSchema).default([]),
  updatedAt: TimestampSchema,
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileBasics = z.infer<typeof ProfileBasicsSchema>;
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;
export type Achievement = z.infer<typeof AchievementSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type EducationEntry = z.infer<typeof EducationEntrySchema>;
export type Certification = z.infer<typeof CertificationSchema>;
