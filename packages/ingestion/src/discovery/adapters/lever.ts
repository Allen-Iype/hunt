import type { DiscoveredRef } from "@hunt/core";
import { fetchJson } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { plainTeaser } from "./teaser.js";

/**
 * Lever discovery adapter (ADR-0015, ATS tier). Lever publishes a public
 * postings API — no auth, structured JSON, deterministic:
 *
 *   https://api.lever.co/v0/postings/<board>?mode=json
 *
 * `board` is the company handle (e.g. "palantir"). The response is a top-level
 * ARRAY of postings (no envelope). We map each to a lead; `descriptionPlain`
 * gives us a plain-text teaser — we keep only a teaser (the full description
 * belongs to the import pipeline, ADR-0015 invariant). Lever postings carry no
 * company name; it is resolved later on import.
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

interface LeverCategories {
  location?: string;
}
interface LeverPosting {
  text?: string;
  hostedUrl?: string;
  categories?: LeverCategories;
  descriptionPlain?: string;
}

export type JsonFetcher = <T>(url: string) => Promise<T>;

const LEVER_ADAPTER_VERSION = "0.1.0";

export function createLeverAdapter(deps: { fetchJson?: JsonFetcher } = {}): DiscoveryAdapter {
  const getJson = deps.fetchJson ?? (<T>(url: string) => fetchJson<T>(url));
  return {
    id: "lever",
    version: LEVER_ADAPTER_VERSION,
    async discover({ board }): Promise<DiscoveredRef[]> {
      const url = `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`;
      const postings = await getJson<LeverPosting[]>(url);
      const refs: DiscoveredRef[] = [];
      for (const posting of postings ?? []) {
        if (!posting.text || !posting.hostedUrl) continue; // a lead needs a title and a URL
        const snippet = plainTeaser(posting.descriptionPlain);
        refs.push({
          sourceId: "lever",
          url: posting.hostedUrl,
          title: posting.text,
          ...(posting.categories?.location ? { location: posting.categories.location } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
