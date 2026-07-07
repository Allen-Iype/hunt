import type { Profile } from "../models/profile.js";
import { canonicalizeSkill, skillLookup } from "./dictionary.js";

/**
 * Deterministic skill detection and profile matching (SDD §18 pass A).
 *
 * Detection is token-based, not substring-based: "go" must not match inside
 * "google". Tokens keep the symbols that identify skills (+ # . /), and
 * multi-token aliases are matched as consecutive token phrases.
 */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#./-]+/)
    .map((t) => t.replace(/^[./-]+|[./-]+$/g, ""))
    .filter((t) => t.length > 0);
}

/** Canonical dictionary skills mentioned in free text. */
export function detectSkills(text: string): string[] {
  const { byAlias } = skillLookup();
  const tokens = tokenize(text);
  const found = new Set<string>();

  const aliasTokenLists = aliasPhrases();
  for (const { phrase, canonical } of aliasTokenLists) {
    if (phrase.length === 1) continue; // single tokens handled below
    for (let i = 0; i + phrase.length <= tokens.length; i++) {
      if (phrase.every((word, j) => tokens[i + j] === word)) {
        found.add(canonical);
        break;
      }
    }
  }
  for (const token of tokens) {
    const canonical = byAlias.get(token);
    if (canonical) found.add(canonical);
  }
  return [...found].sort();
}

let phrases: { phrase: string[]; canonical: string }[] | null = null;
function aliasPhrases() {
  if (phrases) return phrases;
  phrases = [...skillLookup().byAlias.entries()].map(([alias, canonical]) => ({
    phrase: tokenize(alias),
    canonical,
  }));
  return phrases;
}

export interface SkillMatch {
  matched: { name: string; profileSkillId: string }[];
  missing: string[];
}

/**
 * Match a set of job skills against the profile. Profile skill names are
 * canonicalized through the dictionary so "K8s" in a profile matches
 * "Kubernetes" in a posting.
 */
export function matchSkills(jobSkills: readonly string[], profile: Profile): SkillMatch {
  const profileByCanonical = new Map<string, string>();
  for (const skill of profile.skills) {
    profileByCanonical.set(canonicalizeSkill(skill.name), skill.id);
  }
  const matched: SkillMatch["matched"] = [];
  const missing: string[] = [];
  for (const raw of new Set(jobSkills.map(canonicalizeSkill))) {
    const profileSkillId = profileByCanonical.get(raw);
    if (profileSkillId) matched.push({ name: raw, profileSkillId });
    else missing.push(raw);
  }
  matched.sort((a, b) => a.name.localeCompare(b.name));
  missing.sort();
  return { matched, missing };
}
