import { z } from "zod";
import { fnv1a } from "./hash.js";
import { SCHEMA_VERSION, type Timestamp } from "./models/common.js";
import {
  AchievementSchema,
  CertificationSchema,
  EducationEntrySchema,
  ExperienceEntrySchema,
  ProfileBasicsSchema,
  ProfileSchema,
  ProjectSchema,
  SkillSchema,
  type Profile,
} from "./models/profile.js";

/**
 * Profile authoring input (SDD §12): the shape of profile.yaml after YAML
 * parsing. Identical to Profile except that system fields are absent and
 * fact IDs are optional — when omitted, IDs are derived deterministically
 * from fact content (ADR-0011), so re-importing an unchanged file yields an
 * identical profile.
 */

const optionalId = { id: z.string().min(1).optional() };

export const ProfileInputSchema = z.object({
  basics: ProfileBasicsSchema,
  experience: z
    .array(
      ExperienceEntrySchema.omit({ id: true }).extend({
        ...optionalId,
        achievements: z
          .array(AchievementSchema.omit({ id: true }).extend(optionalId))
          .default([]),
      }),
    )
    .default([]),
  skills: z.array(SkillSchema.omit({ id: true }).extend(optionalId)).default([]),
  projects: z.array(ProjectSchema.omit({ id: true }).extend(optionalId)).default([]),
  education: z
    .array(EducationEntrySchema.omit({ id: true }).extend(optionalId))
    .default([]),
  certifications: z
    .array(CertificationSchema.omit({ id: true }).extend(optionalId))
    .default([]),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

/** V1 is single-profile (SDD §26); the id is a fixed well-known value. */
export const DEFAULT_PROFILE_ID = "profile_default";

export type ResolveProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; reason: string };

/**
 * Turn validated authoring input into a canonical Profile: assign
 * deterministic fact IDs where absent, then check that every
 * `evidenceFactIds` reference resolves to a known fact.
 *
 * Duplicate content (two identical facts) gets a deterministic ordinal
 * suffix; reordering such duplicates changes their IDs, which is acceptable
 * (generated documents snapshot the IDs they cite at generation time).
 */
export function resolveProfileInput(
  input: ProfileInput,
  now: Timestamp,
): ResolveProfileResult {
  const seen = new Map<string, number>();
  const assign = (prefix: string, content: string, explicit?: string): string => {
    if (explicit !== undefined) return explicit;
    const base = `${prefix}_${fnv1a(content)}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  };

  const experience = input.experience.map((exp) => {
    const expId = assign("exp", `${exp.company}|${exp.role}|${exp.startDate}`, exp.id);
    return {
      ...exp,
      id: expId,
      achievements: exp.achievements.map((ach) => ({
        ...ach,
        id: assign("ach", `${expId}|${ach.text}`, ach.id),
      })),
    };
  });

  const skills = input.skills.map((skill) => ({
    ...skill,
    id: assign("skill", skill.name.toLowerCase(), skill.id),
  }));

  const projects = input.projects.map((project) => ({
    ...project,
    id: assign("proj", project.name, project.id),
  }));

  const education = input.education.map((edu) => ({
    ...edu,
    id: assign("edu", `${edu.institution}|${edu.degree ?? ""}|${edu.field ?? ""}`, edu.id),
  }));

  const certifications = input.certifications.map((cert) => ({
    ...cert,
    id: assign("cert", `${cert.name}|${cert.issuer ?? ""}`, cert.id),
  }));

  const knownFactIds = new Set<string>([
    ...experience.flatMap((e) => [e.id, ...e.achievements.map((a) => a.id)]),
    ...skills.map((s) => s.id),
    ...projects.map((p) => p.id),
    ...education.map((e) => e.id),
    ...certifications.map((c) => c.id),
  ]);
  const unknownRefs = skills
    .flatMap((s) => s.evidenceFactIds.map((ref) => ({ skill: s.name, ref })))
    .filter(({ ref }) => !knownFactIds.has(ref));
  if (unknownRefs.length > 0) {
    return {
      ok: false,
      reason: `unknown evidenceFactIds: ${unknownRefs
        .map(({ skill, ref }) => `"${ref}" (skill: ${skill})`)
        .join(", ")}`,
    };
  }

  const profile = ProfileSchema.parse({
    id: DEFAULT_PROFILE_ID,
    schemaVersion: SCHEMA_VERSION,
    basics: input.basics,
    experience,
    skills,
    projects,
    education,
    certifications,
    updatedAt: now,
  });
  return { ok: true, profile };
}
