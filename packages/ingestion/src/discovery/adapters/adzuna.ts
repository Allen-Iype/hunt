import type { DiscoveredRef, SearchQuery } from "@hunt/core";
import { fetchJson } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { htmlTeaser } from "./teaser.js";

/**
 * Adzuna discovery adapter (ADR-0015, Tier-3 aggregator API). Adzuna aggregates
 * many job boards behind an official API — it DOES support server-side search,
 * so unlike the feed tier we pass the search's intent through as query params:
 *
 *   https://api.adzuna.com/v1/api/jobs/<country>/search/1
 *     ?app_id=…&app_key=…&what=<roles>&where=<location>
 *
 * `board` is the country code (e.g. "us", "gb", "de"). Credentials are INJECTED
 * (never read from env in this package — env lives at the CLI composition root,
 * mirroring the AI provider wiring). A keyless adapter is not constructed here;
 * the registry substitutes a stub that yields a clear "set the key" warning, so
 * one unconfigured source never sinks a whole search.
 *
 * Each result's `description` is HTML; we keep only a de-HTMLed teaser (the full
 * description belongs to the import pipeline, ADR-0015 invariant).
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

interface AdzunaResult {
  title?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
}
interface AdzunaResponse {
  results?: AdzunaResult[];
}

export type JsonFetcher = <T>(url: string) => Promise<T>;

export interface AdzunaCredentials {
  appId: string;
  appKey: string;
}

const ADZUNA_ADAPTER_VERSION = "0.1.0";
/** Adzuna's per-page cap; one page is plenty for on-demand discovery. */
const RESULTS_PER_PAGE = 50;

/** Adzuna searches a single `what` phrase; join the intended roles into one. */
function buildParams(creds: AdzunaCredentials, query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams({
    app_id: creds.appId,
    app_key: creds.appKey,
    results_per_page: String(RESULTS_PER_PAGE),
    "content-type": "application/json",
  });
  const what = query.roles.join(" ").trim();
  if (what) params.set("what", what);
  const where = query.locations[0]?.trim();
  if (where) params.set("where", where);
  return params;
}

export function createAdzunaAdapter(
  deps: AdzunaCredentials & { fetchJson?: JsonFetcher },
): DiscoveryAdapter {
  const getJson = deps.fetchJson ?? (<T>(url: string) => fetchJson<T>(url));
  return {
    id: "adzuna",
    version: ADZUNA_ADAPTER_VERSION,
    async discover({ board, query }): Promise<DiscoveredRef[]> {
      const params = buildParams({ appId: deps.appId, appKey: deps.appKey }, query);
      const url = `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(board)}/search/1?${params.toString()}`;
      const data = await getJson<AdzunaResponse>(url);
      const refs: DiscoveredRef[] = [];
      for (const result of data.results ?? []) {
        if (!result.title || !result.redirect_url) continue; // a lead needs a title and a URL
        const snippet = htmlTeaser(result.description);
        refs.push({
          sourceId: "adzuna",
          url: result.redirect_url,
          title: result.title,
          ...(result.company?.display_name ? { companyName: result.company.display_name } : {}),
          ...(result.location?.display_name ? { location: result.location.display_name } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
