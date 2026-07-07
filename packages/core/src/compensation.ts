import type { Compensation } from "./models/job.js";

/**
 * Deterministic compensation parsing (SDD §18 pass A). Best-effort by
 * design: the raw string is always preserved as ground truth (SDD §11);
 * parsing failures return just the raw.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR",
  $: "USD",
  "£": "GBP",
  "₹": "INR",
};
const CURRENCY_CODES = ["EUR", "USD", "GBP", "CHF", "SEK", "INR", "CAD", "AUD"];

const PERIOD_PATTERNS: [RegExp, NonNullable<Compensation["period"]>][] = [
  [/\b(year|yr|annum|annual|annually|p\.?a\.?)\b/i, "year"],
  [/\b(month|monthly|mo)\b/i, "month"],
  [/\b(day|daily)\b/i, "day"],
  [/\b(hour|hourly|hr)\b/i, "hour"],
];

function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/[,\s]/g, "");
  const match = /^(\d+(?:\.\d+)?)(k)?$/i.exec(cleaned);
  if (!match) return undefined;
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(value) ? value : undefined;
}

export function parseCompensation(raw: string): Compensation {
  const result: Compensation = { raw };

  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(symbol)) {
      result.currency = code;
      break;
    }
  }
  if (!result.currency) {
    const code = CURRENCY_CODES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(raw));
    if (code) result.currency = code;
  }

  for (const [pattern, period] of PERIOD_PATTERNS) {
    if (pattern.test(raw)) {
      result.period = period;
      break;
    }
  }

  // Numbers: find amounts like 95,000 / 95000 / 95k / 120.5k. "401(k)" is a
  // US retirement plan, not pay — remove it before matching.
  const withoutNoise = raw.replace(/\b401\s?\(?k\)?/gi, "");
  const amounts = [...withoutNoise.matchAll(/(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*(k)?/gi)]
    .map((m) => parseAmount(`${m[1]}${m[2] ?? ""}`))
    .filter((n): n is number => n !== undefined && n > 0);

  // Heuristic: salary-sized figures only, so "5+ years" or "401k plan" noise
  // doesn't read as pay. Hourly rates are small; everything else is ≥ 1000.
  const plausible = amounts.filter((n) => (result.period === "hour" ? n >= 10 : n >= 1000));
  if (plausible.length >= 2) {
    result.min = Math.min(...plausible);
    result.max = Math.max(...plausible);
  } else if (plausible.length === 1) {
    result.min = plausible[0]!;
    result.max = plausible[0]!;
  }
  return result;
}
