import { stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import {
  ProfileInputSchema,
  type ExtractResumePort,
  type ExtractedResumeDraft,
  type ProfileInput,
} from "@hunt/core";

/**
 * ImportResume capability (SDD §27 #1, F11 §4, ADR-0013): seed a profile from a
 * resume's text. Extract structured facts via the AI port, stamp EVERY proposed
 * fact `verified: false`, and serialize to a `profile.yaml` the user reviews and
 * edits before the existing `hunt profile import` confirms it.
 *
 * This capability does NOT persist a profile — that is `ImportProfile`'s job,
 * unchanged. The output is YAML text; writing the file is the CLI's job. Keeping
 * extraction and confirmation as two steps is the whole design: AI proposes,
 * a human vouches (SDD §15). Nothing here is a trust surface.
 *
 * Takes resume *text*, not a path: reading/decoding the file (and, later, PDF or
 * DOCX) is the presentation layer's concern, which keeps this testable and
 * file-format agnostic.
 */

export interface ImportResumeInput {
  resumeText: string;
}

export type ImportResumeResult =
  | {
      ok: true;
      /** A ready-to-edit profile.yaml, every fact marked `verified: false`. */
      yaml: string;
      summary: {
        experience: number;
        achievements: number;
        skills: number;
        projects: number;
        education: number;
        certifications: number;
      };
    }
  | { ok: false; stage: "input" | "extract" | "shape"; message: string; hint?: string };

export interface ImportResumeDeps {
  /** Undefined when no AI provider is configured — extraction needs a model. */
  resumeExtractor?: ExtractResumePort | undefined;
}

/**
 * Coerce a resume date to the profile's strict `YYYY-MM-DD` (`z.iso.date()`).
 *
 * Resumes state dates imprecisely — "2021-03", "2019", "Mar 2021", "Present".
 * The Profile schema requires a full ISO date, so we fill missing month/day with
 * "01" (never inventing a *later* date). This is the one deliberate, transparent
 * inference in M6: the user sees the filled date in the reviewable YAML and can
 * correct it before confirming. Anything we can't parse (e.g. "Present") returns
 * undefined — for an end date that correctly means "current position".
 */
function toIsoDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  // Already a full ISO date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY-MM → first of the month.
  let m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-01`;
  // YYYY → first of the year.
  m = /^(\d{4})$/.exec(s);
  if (m) return `${m[1]}-01-01`;
  // "Mon YYYY" / "Month YYYY" (e.g. "Mar 2021", "March 2021").
  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  m = /^([A-Za-z]{3,})\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (mon) return `${m[2]}-${mon}-01`;
  }
  // Unparseable ("Present", "Current", free text) — omit.
  return undefined;
}

/**
 * Shape an extraction draft into ProfileInput with `verified: false` on every
 * fact. Basics carry no `verified` field (ProfileBasicsSchema has none) — an
 * accepted M6 limitation, documented; the user sees basics in the YAML anyway.
 */
function draftToProfileInput(draft: ExtractedResumeDraft): ProfileInput {
  return {
    basics: draft.basics,
    experience: draft.experience.map((exp) => {
      const endDate = toIsoDate(exp.endDate);
      return {
        company: exp.company,
        role: exp.role,
        // Fall back to the raw string if unparseable; the round-trip guard turns
        // that into a clear shape-stage error naming the field, rather than a
        // silently fabricated date.
        startDate: toIsoDate(exp.startDate) ?? exp.startDate,
        ...(endDate ? { endDate } : {}),
        ...(exp.location ? { location: exp.location } : {}),
        ...(exp.summary ? { summary: exp.summary } : {}),
        achievements: exp.achievements.map((ach) => ({
          text: ach.text,
          skills: ach.skills,
          verified: false,
        })),
        verified: false,
      };
    }),
    skills: draft.skills.map((skill) => ({
      name: skill.name,
      ...(skill.level ? { level: skill.level } : {}),
      ...(skill.years !== undefined ? { years: skill.years } : {}),
      evidenceFactIds: [],
      verified: false,
    })),
    projects: draft.projects.map((project) => ({
      name: project.name,
      description: project.description,
      ...(project.url ? { url: project.url } : {}),
      skills: project.skills,
      verified: false,
    })),
    education: draft.education.map((edu) => {
      const startDate = toIsoDate(edu.startDate);
      const endDate = toIsoDate(edu.endDate);
      return {
        institution: edu.institution,
        ...(edu.degree ? { degree: edu.degree } : {}),
        ...(edu.field ? { field: edu.field } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        verified: false,
      };
    }),
    certifications: draft.certifications.map((cert) => ({
      name: cert.name,
      ...(cert.issuer ? { issuer: cert.issuer } : {}),
      ...(cert.issuedDate ? { issuedDate: cert.issuedDate } : {}),
      verified: false,
    })),
  };
}

const YAML_HEADER = [
  "# Generated by `hunt profile from-resume` — every fact is UNVERIFIED.",
  "# Review and edit, then confirm with: hunt profile import my-profile.yaml",
  "# Flip `verified: false` → `true` on the facts you vouch for (or leave them;",
  "# generation simply prefers verified facts). Delete anything the tool got wrong.",
  "",
].join("\n");

export function createImportResume(deps: ImportResumeDeps) {
  return async function importResume(input: ImportResumeInput): Promise<ImportResumeResult> {
    const text = input.resumeText.trim();
    if (text.length === 0) {
      return { ok: false, stage: "input", message: "the resume is empty" };
    }
    if (!deps.resumeExtractor) {
      return {
        ok: false,
        stage: "extract",
        message: "no AI provider configured — reading a resume needs a language model",
        hint: "set ANTHROPIC_API_KEY, or HUNT_AI_PROVIDER=ollama for local extraction",
      };
    }

    const extracted = await deps.resumeExtractor.extractResume({ text });
    if (!extracted.ok) {
      return { ok: false, stage: "extract", message: extracted.message };
    }

    const profileInput = draftToProfileInput(extracted.draft);

    // Guard: what we hand the user must round-trip through the confirm step.
    const validated = ProfileInputSchema.safeParse(profileInput);
    if (!validated.success) {
      return {
        ok: false,
        stage: "shape",
        message:
          "extracted facts did not form a valid profile (often an unparseable date) — seed manually or fix the resume:\n" +
          z.prettifyError(validated.error),
      };
    }

    const yaml = YAML_HEADER + stringifyYaml(validated.data);
    const d = validated.data;
    return {
      ok: true,
      yaml,
      summary: {
        experience: d.experience.length,
        achievements: d.experience.reduce((n, e) => n + e.achievements.length, 0),
        skills: d.skills.length,
        projects: d.projects.length,
        education: d.education.length,
        certifications: d.certifications.length,
      },
    };
  };
}
