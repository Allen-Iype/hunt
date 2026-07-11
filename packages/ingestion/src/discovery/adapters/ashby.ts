import type { DiscoveredRef } from "@hunt/core";
import { fetchJson } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { plainTeaser } from "./teaser.js";

/**
 * Ashby discovery adapter (ADR-0015, ATS tier). Ashby publishes a public
 * job-board API — no auth, structured JSON, deterministic:
 *
 *   https://api.ashbyhq.com/posting-api/job-board/<board>
 *
 * `board` is the org handle (e.g. "Ramp"). The response is `{ jobs: [...] }`.
 * Each job carries `descriptionPlain` (already plain text — no de-HTML needed);
 * we keep only a teaser (the full description belongs to the import pipeline,
 * ADR-0015 invariant). `isListed === false` postings are unpublished and
 * skipped. Ashby carries no org name at the board level; it is resolved later
 * on import.
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

interface AshbyJob {
  title?: string;
  jobUrl?: string;
  location?: string;
  isListed?: boolean;
  descriptionPlain?: string;
}
interface AshbyResponse {
  jobs?: AshbyJob[];
}

export type JsonFetcher = <T>(url: string) => Promise<T>;

const ASHBY_ADAPTER_VERSION = "0.1.0";

export function createAshbyAdapter(deps: { fetchJson?: JsonFetcher } = {}): DiscoveryAdapter {
  const getJson = deps.fetchJson ?? (<T>(url: string) => fetchJson<T>(url));
  return {
    id: "ashby",
    version: ASHBY_ADAPTER_VERSION,
    async discover({ board }): Promise<DiscoveredRef[]> {
      const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`;
      const data = await getJson<AshbyResponse>(url);
      const refs: DiscoveredRef[] = [];
      for (const job of data.jobs ?? []) {
        if (job.isListed === false) continue; // unpublished — not a live opening
        if (!job.title || !job.jobUrl) continue; // a lead needs a title and a URL
        const snippet = plainTeaser(job.descriptionPlain);
        refs.push({
          sourceId: "ashby",
          url: job.jobUrl,
          title: job.title,
          ...(job.location ? { location: job.location } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
