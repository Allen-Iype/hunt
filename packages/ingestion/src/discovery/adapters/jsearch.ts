import type { DiscoveredRef, SearchQuery } from "@hunt/core";
import { fetchJson, type FetchJsonOptions } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { plainTeaser } from "./teaser.js";

/**
 * JSearch discovery adapter (ADR-0015, Tier-3 aggregator API). JSearch (via
 * RapidAPI) aggregates LinkedIn/Indeed/Glassdoor/etc. behind one official API
 * with server-side search. Auth is two RapidAPI headers, so the key never
 * enters the URL:
 *
 *   https://jsearch.p.rapidapi.com/search?query=<roles+location>&page=1
 *   X-RapidAPI-Key: <key>   X-RapidAPI-Host: jsearch.p.rapidapi.com
 *
 * JSearch has no single "board" — the free-text `query` carries everything — so
 * the `board` handle is folded into the query as an extra location/keyword hint
 * (callers conventionally pass "global" to add nothing). Credentials are
 * INJECTED; env lives at the CLI composition root. A keyless adapter is not
 * constructed; the registry substitutes a "set the key" stub.
 *
 * `job_description` is plain text from JSearch; we keep only a teaser (the full
 * description belongs to the import pipeline, ADR-0015 invariant).
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

interface JSearchJob {
  job_title?: string;
  employer_name?: string;
  job_city?: string;
  job_country?: string;
  job_apply_link?: string;
  job_description?: string;
}
interface JSearchResponse {
  data?: JSearchJob[];
}

export type JsonFetcher = <T>(url: string, options?: FetchJsonOptions) => Promise<T>;

export interface JSearchCredentials {
  apiKey: string;
}

const JSEARCH_ADAPTER_VERSION = "0.1.0";
const JSEARCH_HOST = "jsearch.p.rapidapi.com";

/** JSearch takes one free-text `query`; combine roles, an optional location, and the board hint. */
function buildQueryText(board: string, query: SearchQuery): string {
  const parts = [query.roles.join(" ").trim(), query.locations[0]?.trim() ?? ""];
  if (board && board !== "global") parts.push(board);
  return parts.filter(Boolean).join(" ").trim();
}

/** Prefer "City, Country"; fall back to whichever is present. */
function joinLocation(job: JSearchJob): string | undefined {
  const parts = [job.job_city, job.job_country].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function createJSearchAdapter(
  deps: JSearchCredentials & { fetchJson?: JsonFetcher },
): DiscoveryAdapter {
  const getJson: JsonFetcher = deps.fetchJson ?? ((url, options) => fetchJson(url, options));
  return {
    id: "jsearch",
    version: JSEARCH_ADAPTER_VERSION,
    async discover({ board, query }): Promise<DiscoveredRef[]> {
      const queryText = buildQueryText(board, query);
      const params = new URLSearchParams({ query: queryText || "software engineer", page: "1", num_pages: "1" });
      const url = `https://${JSEARCH_HOST}/search?${params.toString()}`;
      const data = await getJson<JSearchResponse>(url, {
        headers: { "x-rapidapi-key": deps.apiKey, "x-rapidapi-host": JSEARCH_HOST },
      });
      const refs: DiscoveredRef[] = [];
      for (const job of data.data ?? []) {
        if (!job.job_title || !job.job_apply_link) continue; // a lead needs a title and a URL
        const location = joinLocation(job);
        const snippet = plainTeaser(job.job_description);
        refs.push({
          sourceId: "jsearch",
          url: job.job_apply_link,
          title: job.job_title,
          ...(job.employer_name ? { companyName: job.employer_name } : {}),
          ...(location ? { location } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
