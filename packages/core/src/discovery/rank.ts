import type { OpportunityRef } from "../models/opportunity-ref.js";
import type { Profile } from "../models/profile.js";
import type { SavedSearch } from "../models/saved-search.js";
import { canonicalizeSkill } from "../skills/dictionary.js";
import { detectSkills, skillOverlap } from "../skills/matching.js";

/**
 * Deterministic opportunity ranking (ADR-0015 decisions #4, #5).
 *
 * Ranks a discovered lead by the user's *stated intent* (the SavedSearch).
 * The profile is an OPTIONAL enrichment: when present it nudges ranking toward
 * the user's actual skills, but it is never required — discovery is a native
 * entry point that works on day one with no profile.
 *
 * Ranking reuses the shared `skillOverlap` primitive (the same one under
 * `computeFitScore`); it is NOT a parallel scorer. It operates on the thin text
 * a lead carries (title + snippet + location), never on a normalized Job — a
 * lead has no job structure by invariant (OpportunityRef, ADR-0015 #3).
 *
 * The score is a transparent weighted sum in [0..1]:
 *   - intent skill overlap (dominant): lead skills ∩ search intent skills
 *   - role/keyword match: search role words present in the title
 *   - location match: a wanted location appears in the lead's location
 *   - profile enrichment (only when a profile is given): lead skills ∩ profile skills
 */

/** Skills the search intends, canonicalized: explicit skills + skills deticted in role phrases. */
function intentSkills(search: SavedSearch): Set<string> {
  const set = new Set<string>();
  for (const s of search.query.skills) set.add(canonicalizeSkill(s));
  for (const r of search.query.roles) for (const s of detectSkills(r)) set.add(canonicalizeSkill(s));
  return set;
}

/** Text a lead exposes for matching — title + snippet (never a full description; a lead has none). */
function leadText(ref: Pick<OpportunityRef, "title" | "snippet">): string {
  return `${ref.title} ${ref.snippet ?? ""}`;
}

function roleMatch(search: SavedSearch, title: string): number {
  const roles = search.query.roles;
  if (roles.length === 0) return 0;
  const hay = title.toLowerCase();
  const hits = roles.filter((r) => hay.includes(r.toLowerCase())).length;
  return hits / roles.length;
}

/** Only called when the search has a location preference; 1 if any wanted location matches. */
function locationMatch(search: SavedSearch, ref: Pick<OpportunityRef, "location">): number {
  const hay = (ref.location ?? "").toLowerCase();
  if (hay.length === 0) return 0;
  return search.query.locations.some((l) => hay.includes(l.toLowerCase())) ? 1 : 0;
}

export function rankOpportunity(
  ref: Pick<OpportunityRef, "title" | "snippet" | "location">,
  search: SavedSearch,
  profile?: Profile,
): number {
  const leadSkills = detectSkills(leadText(ref));
  const intent = intentSkills(search);

  const skill = skillOverlap(leadSkills, intent);
  const role = roleMatch(search, ref.title);
  const location = search.query.locations.length > 0 ? locationMatch(search, ref) : 0;

  // Profile enrichment: optional. Absent → this component contributes nothing
  // and the remaining weights carry the score (discovery is profile-optional).
  const profileSet = profile
    ? new Set(profile.skills.map((s) => canonicalizeSkill(s.name)))
    : null;
  const profileBoost = profileSet ? skillOverlap(leadSkills, profileSet) : 0;

  // Weights; location only participates when a location preference exists.
  const hasLoc = search.query.locations.length > 0;
  const raw =
    0.5 * skill +
    0.25 * role +
    (hasLoc ? 0.15 * location : 0) +
    (profileSet ? 0.1 * profileBoost : 0);
  // Renormalize over the components that were actually in play, so a search
  // with no location preference and no profile isn't silently penalized.
  const weightInPlay = 0.5 + 0.25 + (hasLoc ? 0.15 : 0) + (profileSet ? 0.1 : 0);
  return Math.min(1, Math.max(0, raw / weightInPlay));
}
