import { z } from "zod";
import { IdSchema, SchemaVersionSchema, TimestampSchema } from "./common.js";

/**
 * Canonical Company model (SDD §11). Deliberately thin for V1: identity plus
 * room to grow; research dossiers arrive post-V1.
 */

export const CompanySchema = z.object({
  id: IdSchema,
  schemaVersion: SchemaVersionSchema,
  name: z.string().min(1),
  /** Deterministic identity key for dedup across name variants (see normalizeCompanyKey). */
  normalizedKey: z.string().min(1),
  website: z.url().optional(),
  industry: z.string().min(1).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Company = z.infer<typeof CompanySchema>;

const LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "gmbh",
  "corp",
  "corporation",
  "co",
  "plc",
  "ag",
  "sa",
  "srl",
  "pvt",
  "oy",
  "ab",
]);

const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Normalize a company name to a stable identity key so "Acme Corp." and
 * "ACME Corporation" resolve to the same Company. Deterministic; used as the
 * unique key in storage.
 */
export function normalizeCompanyKey(name: string): string {
  const tokens = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1]!)) {
    tokens.pop();
  }
  return tokens.join("-");
}
