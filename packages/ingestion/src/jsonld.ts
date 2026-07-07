import { parse } from "node-html-parser";
import { ExtractedJobDraftSchema, type ExtractedJobDraft } from "@hunt/core";
import { htmlToText } from "./html.js";

/**
 * Tier 1 normalization (SDD §9, ADR-0005): schema.org JobPosting JSON-LD.
 * Deterministic, free, exact — most job boards (LinkedIn public pages,
 * Greenhouse, Lever, Ashby) embed it.
 */

interface JsonLdJobPosting {
  "@type"?: unknown;
  "@graph"?: unknown;
  title?: unknown;
  hiringOrganization?: { name?: unknown } | string;
  jobLocation?: unknown;
  jobLocationType?: unknown;
  employmentType?: unknown;
  datePosted?: unknown;
  description?: unknown;
  baseSalary?: unknown;
}

function findJobPostings(node: unknown, found: JsonLdJobPosting[]): void {
  if (Array.isArray(node)) {
    for (const item of node) findJobPostings(item, found);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node as JsonLdJobPosting;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === "string" && t.toLowerCase() === "jobposting")) {
    found.push(obj);
  }
  if (obj["@graph"]) findJobPostings(obj["@graph"], found);
}

const EMPLOYMENT_TYPE_MAP: Record<string, ExtractedJobDraft["employmentType"]> = {
  full_time: "full_time",
  fulltime: "full_time",
  part_time: "part_time",
  parttime: "part_time",
  contractor: "contract",
  contract: "contract",
  temporary: "temporary",
  intern: "internship",
  internship: "internship",
};

function mapEmploymentType(value: unknown): ExtractedJobDraft["employmentType"] {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return "unspecified";
  return EMPLOYMENT_TYPE_MAP[first.toLowerCase().replace(/[\s-]/g, "_")] ?? "unspecified";
}

function mapLocations(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const locations: string[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      locations.push(item);
      continue;
    }
    if (item && typeof item === "object") {
      const address = (item as { address?: unknown }).address;
      const a = (typeof address === "object" && address !== null ? address : item) as Record<
        string,
        unknown
      >;
      const parts = [a.addressLocality, a.addressRegion, a.addressCountry]
        .filter((p): p is string => typeof p === "string" && p.length > 0);
      if (parts.length > 0) locations.push(parts.join(", "));
    }
  }
  return locations;
}

function mapCompensation(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const salary = value as {
    currency?: unknown;
    value?: { minValue?: unknown; maxValue?: unknown; value?: unknown; unitText?: unknown };
  };
  const v = salary.value;
  if (!v || typeof v !== "object") return undefined;
  const range =
    v.minValue !== undefined && v.maxValue !== undefined
      ? `${v.minValue}-${v.maxValue}`
      : (v.value ?? v.minValue ?? v.maxValue);
  if (range === undefined) return undefined;
  const unit = typeof v.unitText === "string" ? ` per ${v.unitText.toLowerCase()}` : "";
  const currency = typeof salary.currency === "string" ? `${salary.currency} ` : "";
  return `${currency}${range}${unit}`;
}

/** "2026-07-01" → "2026-07-01T00:00:00Z"; full timestamps pass through. */
export function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
  return value;
}

export interface JsonLdExtraction {
  draft: ExtractedJobDraft;
  descriptionText: string;
}

/** Returns null when the page has no parseable JobPosting JSON-LD. */
export function extractJobPostingJsonLd(html: string): JsonLdExtraction | null {
  const root = parse(html);
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');
  const postings: JsonLdJobPosting[] = [];
  for (const script of scripts) {
    try {
      findJobPostings(JSON.parse(script.text), postings);
    } catch {
      // Malformed JSON-LD block: skip it, other blocks may still work.
    }
  }
  const posting = postings[0];
  if (!posting) return null;

  const companyName =
    typeof posting.hiringOrganization === "string"
      ? posting.hiringOrganization
      : posting.hiringOrganization?.name;
  const descriptionHtml = typeof posting.description === "string" ? posting.description : "";
  const descriptionText = htmlToText(descriptionHtml);

  const remote =
    typeof posting.jobLocationType === "string" &&
    posting.jobLocationType.toUpperCase() === "TELECOMMUTE";

  const candidate = {
    title: posting.title,
    companyName,
    locations: mapLocations(posting.jobLocation),
    ...(remote ? { workplaceType: "remote" as const } : {}),
    employmentType: mapEmploymentType(posting.employmentType),
    ...(mapCompensation(posting.baseSalary)
      ? { compensationRaw: mapCompensation(posting.baseSalary) }
      : {}),
    ...(normalizeDate(posting.datePosted) ? { postedAt: normalizeDate(posting.datePosted) } : {}),
  };
  const parsed = ExtractedJobDraftSchema.safeParse(candidate);
  if (!parsed.success || descriptionText.length === 0) return null;
  return { draft: parsed.data, descriptionText };
}
