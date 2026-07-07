import type { CandidateFact } from "../models/candidate-fact.js";
import { canonicalizeSkill } from "../skills/dictionary.js";
import { detectSkills } from "../skills/matching.js";

/**
 * Deterministic claim tracing (SDD §17 step 3, ADR-0006): the structural
 * enforcement of N7 — no generated claim may lack a traceable fact-ID
 * citation. This runs over the AI's draft BEFORE anything is persisted as a
 * document; violations feed the bounded repair loop and, failing that, are
 * surfaced to the user.
 *
 * The check is deliberately CONSERVATIVE. It cannot prove semantic
 * faithfulness (that is what mandatory human review, §17 step 5, is for), but
 * it catches the dangerous, trust-fatal failures:
 *   - `uncited`        — a bullet citing no fact at all
 *   - `unknown-fact`   — a bullet citing an id outside the candidate set
 *                        (an invented employer/achievement)
 *   - `unsupported-number` — a quantity in the prose absent from every cited
 *                        fact (an inflated or fabricated metric)
 *   - `unsupported-skill`  — a technology named in the prose absent from every
 *                        cited fact (a claimed skill the facts don't back)
 * Format lint (`empty`, `too-long`) keeps output well-formed.
 */

export interface ClaimBullet {
  /** Where this bullet lives, for a legible violation message. */
  path: string;
  text: string;
  sourceFactIds: readonly string[];
}

export type ClaimViolationKind =
  | "uncited"
  | "unknown-fact"
  | "unsupported-number"
  | "unsupported-skill"
  | "empty"
  | "too-long";

export interface ClaimViolation {
  kind: ClaimViolationKind;
  path: string;
  message: string;
}

export interface ClaimTraceResult {
  ok: boolean;
  violations: ClaimViolation[];
}

/** Bullets longer than this read as paragraphs, not resume bullets. */
const MAX_BULLET_CHARS = 400;

/** Numbers that carry a claim (metrics, percentages, magnitudes), ignoring years. */
function significantNumbers(text: string): string[] {
  const out: string[] = [];
  // Match integers/decimals with optional %/k/m/x/+ suffix; keep the digits.
  const re = /\b(\d[\d,.]*)\s*(%|k\b|m\b|x\b|\+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = m[1]!.replace(/[,.]/g, "");
    // Ignore bare 4-digit years (1900–2099) — they aren't claim metrics.
    if (!m[2] && /^(19|20)\d{2}$/.test(m[1]!)) continue;
    if (digits.length > 0) out.push(digits);
  }
  return out;
}

/** Normalize a fact's numbers the same way for comparison. */
function factNumbers(text: string): Set<string> {
  const set = new Set<string>();
  const re = /\b(\d[\d,.]*)\s*(%|k\b|m\b|x\b|\+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    set.add(m[1]!.replace(/[,.]/g, ""));
  }
  return set;
}

/**
 * Trace every bullet against the candidate set. `candidates` is the exact set
 * offered to the composer (SDD §17 step 1) — the only material a bullet may
 * draw from.
 */
export function traceClaims(
  bullets: readonly ClaimBullet[],
  candidates: readonly CandidateFact[],
): ClaimTraceResult {
  const byId = new Map(candidates.map((f) => [f.id, f]));
  const violations: ClaimViolation[] = [];

  for (const bullet of bullets) {
    const text = bullet.text.trim();
    if (text.length === 0) {
      violations.push({ kind: "empty", path: bullet.path, message: "bullet text is empty" });
      continue;
    }
    if (text.length > MAX_BULLET_CHARS) {
      violations.push({
        kind: "too-long",
        path: bullet.path,
        message: `bullet is ${text.length} chars (max ${MAX_BULLET_CHARS})`,
      });
    }
    if (bullet.sourceFactIds.length === 0) {
      violations.push({ kind: "uncited", path: bullet.path, message: "bullet cites no fact" });
      continue;
    }

    const cited: CandidateFact[] = [];
    let hadUnknown = false;
    for (const id of bullet.sourceFactIds) {
      const fact = byId.get(id);
      if (!fact) {
        hadUnknown = true;
        violations.push({
          kind: "unknown-fact",
          path: bullet.path,
          message: `cites unknown fact id "${id}" (not in candidate set)`,
        });
      } else {
        cited.push(fact);
      }
    }
    // Lexical checks only make sense against real cited facts.
    if (hadUnknown && cited.length === 0) continue;

    const citedText = cited.map((f) => f.text).join(" • ");
    const citedNumbers = factNumbers(citedText);
    for (const n of significantNumbers(text)) {
      if (!citedNumbers.has(n)) {
        violations.push({
          kind: "unsupported-number",
          path: bullet.path,
          message: `quantity "${n}" does not appear in the cited facts`,
        });
      }
    }

    const citedSkills = new Set<string>();
    for (const f of cited) {
      for (const s of f.skills) citedSkills.add(canonicalizeSkill(s));
      for (const s of detectSkills(f.text)) citedSkills.add(canonicalizeSkill(s));
    }
    for (const s of detectSkills(text)) {
      if (!citedSkills.has(canonicalizeSkill(s))) {
        violations.push({
          kind: "unsupported-skill",
          path: bullet.path,
          message: `technology "${s}" is not evidenced by the cited facts`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Compact, model-facing summary of violations for the repair prompt (§17). */
export function formatViolationsForRepair(violations: readonly ClaimViolation[]): string {
  return violations.map((v) => `- [${v.path}] ${v.message}`).join("\n");
}
