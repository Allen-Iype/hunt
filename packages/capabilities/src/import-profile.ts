import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  ProfileInputSchema,
  resolveProfileInput,
  type Profile,
  type ProfileRepository,
  type Timestamp,
} from "@hunt/core";

/**
 * ImportProfile capability (SDD §12, §13): parse profile.yaml source,
 * validate it, assign deterministic fact IDs, persist.
 *
 * Takes YAML *text*, not a path — reading the user-supplied file is the
 * presentation layer's job, which keeps this capability free of filesystem
 * concerns and trivially testable.
 */

export interface ImportProfileInput {
  yamlSource: string;
  /** Injectable for determinism in tests; defaults to the current time. */
  now?: Timestamp;
}

export type ImportProfileResult =
  | {
      ok: true;
      profile: Profile;
      summary: {
        experience: number;
        achievements: number;
        skills: number;
        projects: number;
        education: number;
        certifications: number;
      };
    }
  | { ok: false; stage: "parse" | "validate" | "resolve" | "storage"; message: string };

export interface ImportProfileDeps {
  profiles: ProfileRepository;
}

export function createImportProfile(deps: ImportProfileDeps) {
  return function importProfile(input: ImportProfileInput): ImportProfileResult {
    let raw: unknown;
    try {
      raw = parseYaml(input.yamlSource);
    } catch (err) {
      return {
        ok: false,
        stage: "parse",
        message: `invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const validated = ProfileInputSchema.safeParse(raw);
    if (!validated.success) {
      return {
        ok: false,
        stage: "validate",
        message: z.prettifyError(validated.error),
      };
    }

    const now = input.now ?? (new Date().toISOString() as Timestamp);
    const resolved = resolveProfileInput(validated.data, now);
    if (!resolved.ok) {
      return { ok: false, stage: "resolve", message: resolved.reason };
    }

    try {
      deps.profiles.save(resolved.profile);
    } catch (err) {
      return {
        ok: false,
        stage: "storage",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const p = resolved.profile;
    return {
      ok: true,
      profile: p,
      summary: {
        experience: p.experience.length,
        achievements: p.experience.reduce((n, e) => n + e.achievements.length, 0),
        skills: p.skills.length,
        projects: p.projects.length,
        education: p.education.length,
        certifications: p.certifications.length,
      },
    };
  };
}
