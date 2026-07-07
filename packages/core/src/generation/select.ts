import type { CandidateFact } from "../models/candidate-fact.js";
import type { JobAnalysis } from "../models/job-analysis.js";
import type { Profile } from "../models/profile.js";
import { canonicalizeSkill } from "../skills/dictionary.js";
import { detectSkills } from "../skills/matching.js";

/**
 * Deterministic candidate-fact selection (SDD §17 step 1, ADR-0006).
 *
 * Selection is deterministic so tailoring is explainable ("these facts were
 * chosen because requirements X, Y matched") and stable across runs — the
 * AI's creative surface is phrasing and emphasis, never deciding what is
 * true. This function flattens the profile into atomic, ID'd facts, scores
 * each by relevance to the job analysis, and returns a bounded, ranked set.
 *
 * Relevance is a transparent weighted sum over signals code can compute:
 *   - skill overlap with the job's required/matched skills (dominant signal)
 *   - recency (a fact from a current or recent role outranks an old one)
 *   - kind weight (quantified achievements are the strongest resume material)
 * No AI, no hidden state; identical inputs yield an identical set.
 */

export const DEFAULT_MAX_CANDIDATES = 40;

interface SelectOptions {
  /** Cap on returned facts; the top-N by relevance. */
  maxCandidates?: number;
  /** Current time (ISO); injected for deterministic recency in tests. */
  now?: string;
}

/** Skills the job cares about, canonicalized: matched + missing + per-requirement. */
function jobSkillSet(analysis: JobAnalysis): Set<string> {
  const skills = new Set<string>();
  for (const m of analysis.skills.matched) skills.add(canonicalizeSkill(m.name));
  for (const s of analysis.skills.missing) skills.add(canonicalizeSkill(s));
  for (const r of analysis.requirements) {
    for (const s of r.skills) skills.add(canonicalizeSkill(s));
  }
  return skills;
}

/** Fraction of a fact's skills that the job cares about; 0 when the fact has none. */
function skillRelevance(factSkills: readonly string[], jobSkills: Set<string>): number {
  if (factSkills.length === 0) return 0;
  const hits = factSkills.filter((s) => jobSkills.has(canonicalizeSkill(s))).length;
  return hits / factSkills.length;
}

/** Recency in [0..1]: 1.0 for a current role, decaying by end year over ~15 years. */
function recency(endDate: string | undefined, now: string): number {
  if (!endDate) return 1; // current role / ongoing
  const endYear = Number(endDate.slice(0, 4));
  const nowYear = Number(now.slice(0, 4));
  if (!Number.isFinite(endYear) || !Number.isFinite(nowYear)) return 0.5;
  const age = Math.max(0, nowYear - endYear);
  return Math.max(0, 1 - age / 15);
}

const KIND_WEIGHT: Record<CandidateFact["kind"], number> = {
  achievement: 1,
  experience: 0.85,
  project: 0.8,
  skill: 0.6,
  certification: 0.55,
  education: 0.4,
};

function score(
  kind: CandidateFact["kind"],
  factSkills: readonly string[],
  jobSkills: Set<string>,
  rec: number,
): number {
  const skill = skillRelevance(factSkills, jobSkills);
  // Skill overlap dominates; recency and kind break ties and lift strong material.
  const raw = 0.6 * skill + 0.25 * rec + 0.15 * KIND_WEIGHT[kind];
  return Math.min(1, Math.max(0, raw));
}

export function selectCandidateFacts(
  profile: Profile,
  analysis: JobAnalysis,
  options: SelectOptions = {},
): CandidateFact[] {
  const now = options.now ?? new Date().toISOString();
  const max = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const jobSkills = jobSkillSet(analysis);
  const facts: CandidateFact[] = [];

  for (const exp of profile.experience) {
    const rec = recency(exp.endDate, now);
    const expSkills = detectSkills(`${exp.role} ${exp.summary ?? ""}`);
    facts.push({
      id: exp.id,
      kind: "experience",
      text: `${exp.role} at ${exp.company}${exp.summary ? ` — ${exp.summary}` : ""}`,
      skills: expSkills,
      relevance: score("experience", expSkills, jobSkills, rec),
    });
    for (const ach of exp.achievements) {
      const achSkills = [...new Set([...ach.skills, ...detectSkills(ach.text)])];
      facts.push({
        id: ach.id,
        kind: "achievement",
        text: ach.text,
        skills: achSkills,
        parentId: exp.id,
        relevance: score("achievement", achSkills, jobSkills, rec),
      });
    }
  }

  for (const proj of profile.projects) {
    const projSkills = [...new Set([...proj.skills, ...detectSkills(`${proj.name} ${proj.description}`)])];
    facts.push({
      id: proj.id,
      kind: "project",
      text: `${proj.name} — ${proj.description}`,
      skills: projSkills,
      relevance: score("project", projSkills, jobSkills, 0.8),
    });
  }

  for (const skill of profile.skills) {
    const canon = [canonicalizeSkill(skill.name)];
    facts.push({
      id: skill.id,
      kind: "skill",
      text: skill.name + (skill.years ? ` (${skill.years}y)` : ""),
      skills: canon,
      relevance: score("skill", canon, jobSkills, 0.8),
    });
  }

  for (const cert of profile.certifications) {
    facts.push({
      id: cert.id,
      kind: "certification",
      text: cert.name + (cert.issuer ? ` — ${cert.issuer}` : ""),
      skills: detectSkills(cert.name),
      relevance: score("certification", detectSkills(cert.name), jobSkills, 0.7),
    });
  }

  for (const edu of profile.education) {
    facts.push({
      id: edu.id,
      kind: "education",
      text: [edu.degree, edu.field, edu.institution].filter(Boolean).join(", "),
      skills: [],
      relevance: score("education", [], jobSkills, recency(edu.endDate, now)),
    });
  }

  // Stable ranking: relevance desc, then id asc for deterministic ties.
  facts.sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id));
  return facts.slice(0, max);
}
