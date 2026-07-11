import type { DiscoveredRef } from "@hunt/core";
import { fetchJson } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { htmlTeaser } from "./teaser.js";

/**
 * Greenhouse discovery adapter (ADR-0015, ATS tier). Greenhouse publishes a
 * public board API — no auth, structured JSON, deterministic:
 *
 *   https://boards-api.greenhouse.io/v1/boards/<board>/jobs?content=true
 *
 * `board` is the company's board token (e.g. "stripe"). We map each posting to
 * a lead. `content=true` gives us a short teaser snippet; we deliberately keep
 * only a teaser — the full description belongs to the import pipeline, not to a
 * lead (ADR-0015 invariant).
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

interface GhLocation {
  name?: string;
}
interface GhJob {
  title?: string;
  absolute_url?: string;
  location?: GhLocation;
  content?: string;
  company_name?: string;
}
interface GhResponse {
  jobs?: GhJob[];
}

export type JsonFetcher = <T>(url: string) => Promise<T>;

const GREENHOUSE_ADAPTER_VERSION = "0.1.0";

export function createGreenhouseAdapter(deps: { fetchJson?: JsonFetcher } = {}): DiscoveryAdapter {
  const getJson = deps.fetchJson ?? (<T>(url: string) => fetchJson<T>(url));
  return {
    id: "greenhouse",
    version: GREENHOUSE_ADAPTER_VERSION,
    async discover({ board }): Promise<DiscoveredRef[]> {
      const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
      const data = await getJson<GhResponse>(url);
      const jobs = data.jobs ?? [];
      const refs: DiscoveredRef[] = [];
      for (const job of jobs) {
        if (!job.title || !job.absolute_url) continue; // a lead needs a title and a URL
        const snippet = htmlTeaser(job.content);
        refs.push({
          sourceId: "greenhouse",
          url: job.absolute_url,
          title: job.title,
          ...(job.company_name ? { companyName: job.company_name } : {}),
          ...(job.location?.name ? { location: job.location.name } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
