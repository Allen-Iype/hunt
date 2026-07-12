import type { DiscoveredRef } from "@hunt/core";
import { fetchJson } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { htmlTeaser } from "./teaser.js";

/**
 * Arbeitnow discovery adapter (ADR-0015, Tier-2 aggregator feed). Arbeitnow
 * publishes a public job-board API — no auth, structured JSON, European-heavy
 * with remote roles:
 *
 *   https://www.arbeitnow.com/api/job-board-api
 *
 * Like RemoteOK this is a single global feed, not a per-company board, so the
 * `board` handle is ignored (callers conventionally pass "global") and the
 * capability layer ranks client-side. The response is `{ data: [...] }`. Each
 * job carries an HTML `description`; we keep only a de-HTMLed teaser (the full
 * description belongs to the import pipeline, ADR-0015 invariant).
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

interface ArbeitnowJob {
  title?: string;
  company_name?: string;
  url?: string;
  location?: string;
  description?: string;
}
interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
}

export type JsonFetcher = <T>(url: string) => Promise<T>;

const ARBEITNOW_ADAPTER_VERSION = "0.1.0";

export function createArbeitnowAdapter(deps: { fetchJson?: JsonFetcher } = {}): DiscoveryAdapter {
  const getJson = deps.fetchJson ?? (<T>(url: string) => fetchJson<T>(url));
  return {
    id: "arbeitnow",
    version: ARBEITNOW_ADAPTER_VERSION,
    async discover(): Promise<DiscoveredRef[]> {
      const url = "https://www.arbeitnow.com/api/job-board-api";
      const data = await getJson<ArbeitnowResponse>(url);
      const refs: DiscoveredRef[] = [];
      for (const job of data.data ?? []) {
        if (!job.title || !job.url) continue; // a lead needs a title and a URL
        const snippet = htmlTeaser(job.description);
        refs.push({
          sourceId: "arbeitnow",
          url: job.url,
          title: job.title,
          ...(job.company_name ? { companyName: job.company_name } : {}),
          ...(job.location ? { location: job.location } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
