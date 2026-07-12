import type { DiscoveredRef } from "@hunt/core";
import { fetchText } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { parseRssItems } from "./rss.js";
import { htmlTeaser } from "./teaser.js";

/**
 * We Work Remotely discovery adapter (ADR-0015, Tier-2 aggregator feed). WWR
 * publishes a public RSS feed of remote jobs — no auth:
 *
 *   https://weworkremotely.com/remote-jobs.rss
 *
 * A single global feed, not a per-company board, so the `board` handle is
 * ignored (callers conventionally pass "global") and the capability layer ranks
 * client-side. WWR item titles are formatted "Company: Job Title"; we split on
 * the first colon to recover the company name, falling back to the whole title
 * when there is no separator. `<region>` carries the location; the HTML
 * `<description>` yields a de-HTMLed teaser only (the full description belongs
 * to the import pipeline, ADR-0015 invariant).
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

export type TextFetcher = (url: string) => Promise<string>;

const WWR_ADAPTER_VERSION = "0.1.0";

/** Split "Company: Job Title" into its parts; company is optional. */
function splitTitle(raw: string): { title: string; company?: string } {
  const idx = raw.indexOf(":");
  if (idx <= 0 || idx >= raw.length - 1) return { title: raw.trim() };
  return { company: raw.slice(0, idx).trim(), title: raw.slice(idx + 1).trim() };
}

export function createWeWorkRemotelyAdapter(deps: { fetchText?: TextFetcher } = {}): DiscoveryAdapter {
  const getText = deps.fetchText ?? ((url: string) => fetchText(url));
  return {
    id: "weworkremotely",
    version: WWR_ADAPTER_VERSION,
    async discover(): Promise<DiscoveredRef[]> {
      const url = "https://weworkremotely.com/remote-jobs.rss";
      const xml = await getText(url);
      const refs: DiscoveredRef[] = [];
      for (const item of parseRssItems(xml)) {
        if (!item.title || !item.link) continue; // a lead needs a title and a URL
        const { title, company } = splitTitle(item.title);
        if (!title) continue;
        const snippet = htmlTeaser(item.description);
        refs.push({
          sourceId: "weworkremotely",
          url: item.link,
          title,
          ...(company ? { companyName: company } : {}),
          ...(item.region ? { location: item.region } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
