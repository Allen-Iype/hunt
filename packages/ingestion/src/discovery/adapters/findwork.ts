import type { DiscoveredRef, SearchQuery } from "@hunt/core";
import { fetchJson, type FetchJsonOptions } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { htmlTeaser } from "./teaser.js";

/**
 * Findwork discovery adapter (ADR-0015, Tier-3 aggregator API). Findwork is a
 * developer-focused job API with server-side search; the key travels in an
 * `Authorization: Token …` header (not the URL), so it never leaks into logs:
 *
 *   https://findwork.dev/api/jobs/?search=<roles+skills>&location=<location>
 *
 * `board` selects remote-only vs. all: "remote" sets `remote=true`, anything
 * else (conventionally "all") leaves it unset. Credentials are INJECTED — env
 * lives at the CLI composition root. A keyless adapter is not constructed; the
 * registry substitutes a "set the key" stub.
 *
 * Each result's `text` is HTML; we keep only a de-HTMLed teaser (the full
 * description belongs to the import pipeline, ADR-0015 invariant).
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

interface FindworkJob {
  role?: string;
  company_name?: string;
  location?: string;
  url?: string;
  text?: string;
}
interface FindworkResponse {
  results?: FindworkJob[];
}

export type JsonFetcher = <T>(url: string, options?: FetchJsonOptions) => Promise<T>;

export interface FindworkCredentials {
  apiKey: string;
}

const FINDWORK_ADAPTER_VERSION = "0.1.0";

/** Findwork's single `search` field takes free text; combine roles + skills. */
function buildQuery(board: string, query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  const search = [...query.roles, ...query.skills].join(" ").trim();
  if (search) params.set("search", search);
  const location = query.locations[0]?.trim();
  if (location) params.set("location", location);
  if (board === "remote") params.set("remote", "true");
  return params;
}

export function createFindworkAdapter(
  deps: FindworkCredentials & { fetchJson?: JsonFetcher },
): DiscoveryAdapter {
  const getJson: JsonFetcher = deps.fetchJson ?? ((url, options) => fetchJson(url, options));
  return {
    id: "findwork",
    version: FINDWORK_ADAPTER_VERSION,
    async discover({ board, query }): Promise<DiscoveredRef[]> {
      const params = buildQuery(board, query);
      const suffix = params.toString();
      const url = `https://findwork.dev/api/jobs/${suffix ? `?${suffix}` : ""}`;
      const data = await getJson<FindworkResponse>(url, {
        headers: { authorization: `Token ${deps.apiKey}` },
      });
      const refs: DiscoveredRef[] = [];
      for (const job of data.results ?? []) {
        if (!job.role || !job.url) continue; // a lead needs a title and a URL
        const snippet = htmlTeaser(job.text);
        refs.push({
          sourceId: "findwork",
          url: job.url,
          title: job.role,
          ...(job.company_name ? { companyName: job.company_name } : {}),
          ...(job.location ? { location: job.location } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
