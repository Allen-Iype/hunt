import type { Profile } from "./models/profile.js";

/**
 * Profile re-import diff (M7 — Profile Augment).
 *
 * The `profile.yaml` is the authoritative source of truth (SDD §12), so
 * re-import is *full-replace done correctly*: what the YAML contains exists;
 * what it omits is deleted. This module does NOT change that — it only DESCRIBES
 * the change, by diffing the previously-stored profile against the resolved
 * import by stable fact id (ADR-0011 content ids), so the CLI can surface
 * added / updated / removed / newly-confirmed facts and never delete silently.
 *
 * A fact whose *identity-bearing* content changed (e.g. an experience's
 * company/role/startDate) hashes to a new id, so it correctly appears as one
 * `removed` (old id) + one `added` (new id). A fact edited in a non-identity
 * field (e.g. an achievement's text) keeps its id and shows as `updated`.
 */

export type FactCategory =
  | "experience"
  | "achievement"
  | "skill"
  | "project"
  | "education"
  | "certification";

/** A flattened fact, keyed by id, with a human label for reporting. */
export interface FactRef {
  id: string;
  category: FactCategory;
  /** Human-readable, e.g. "Staff Engineer @ Globex" or "skill: redis". */
  label: string;
}

export interface ProfileDelta {
  /** False when there was no prior profile — a first import, not a churn. */
  previousExisted: boolean;
  added: FactRef[];
  removed: FactRef[];
  /** Same id, non-identity content changed. */
  updated: FactRef[];
  /** Same id, verified went false → true (a seeded fact the user confirmed). */
  newlyConfirmed: FactRef[];
}

interface FlatFact extends FactRef {
  verified: boolean;
  /** Stable JSON of all non-id, non-verified fields — the "content changed?" key. */
  content: string;
}

function labelFor(category: FactCategory, name: string): string {
  switch (category) {
    case "achievement":
      return `achievement: ${name}`;
    case "skill":
      return `skill: ${name}`;
    case "project":
      return `project: ${name}`;
    case "education":
      return `education: ${name}`;
    case "certification":
      return `certification: ${name}`;
    case "experience":
      return name;
  }
}

/** Deterministic content key: every field except id and verified, order-stable. */
function contentKey(fact: Record<string, unknown>): string {
  const { id: _id, verified: _verified, ...rest } = fact;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/** Flatten a profile's facts (including nested achievements) into keyed refs. */
function flatten(profile: Profile): FlatFact[] {
  const out: FlatFact[] = [];
  for (const exp of profile.experience) {
    out.push({
      id: exp.id,
      category: "experience",
      label: labelFor("experience", `${exp.role} @ ${exp.company}`),
      verified: exp.verified,
      content: contentKey({ ...exp, achievements: exp.achievements.map((a) => a.id) }),
    });
    for (const ach of exp.achievements) {
      out.push({
        id: ach.id,
        category: "achievement",
        label: labelFor("achievement", ach.text),
        verified: ach.verified,
        content: contentKey(ach),
      });
    }
  }
  for (const skill of profile.skills) {
    out.push({ id: skill.id, category: "skill", label: labelFor("skill", skill.name), verified: skill.verified, content: contentKey(skill) });
  }
  for (const project of profile.projects) {
    out.push({ id: project.id, category: "project", label: labelFor("project", project.name), verified: project.verified, content: contentKey(project) });
  }
  for (const edu of profile.education) {
    out.push({ id: edu.id, category: "education", label: labelFor("education", edu.institution), verified: edu.verified, content: contentKey(edu) });
  }
  for (const cert of profile.certifications) {
    out.push({ id: cert.id, category: "certification", label: labelFor("certification", cert.name), verified: cert.verified, content: contentKey(cert) });
  }
  return out;
}

const asRef = (f: FlatFact): FactRef => ({ id: f.id, category: f.category, label: f.label });

/**
 * Diff a previously-stored profile against the resolved import, by fact id.
 * Pure and deterministic — no I/O, no ordering assumptions.
 */
export function diffProfiles(previous: Profile | null, next: Profile): ProfileDelta {
  const prev = previous ? flatten(previous) : [];
  const cur = flatten(next);
  const prevById = new Map(prev.map((f) => [f.id, f]));
  const curById = new Map(cur.map((f) => [f.id, f]));

  const added: FactRef[] = [];
  const updated: FactRef[] = [];
  const newlyConfirmed: FactRef[] = [];
  for (const f of cur) {
    const before = prevById.get(f.id);
    if (!before) {
      added.push(asRef(f));
      continue;
    }
    if (before.content !== f.content) updated.push(asRef(f));
    if (!before.verified && f.verified) newlyConfirmed.push(asRef(f));
  }

  const removed: FactRef[] = prev.filter((f) => !curById.has(f.id)).map(asRef);

  return { previousExisted: previous !== null, added, removed, updated, newlyConfirmed };
}
