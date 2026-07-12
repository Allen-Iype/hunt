import type { DiscoveredRef, SearchQuery } from "@hunt/core";
import { parse } from "node-html-parser";
import { FetchError, fetchPage } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { plainTeaser } from "./teaser.js";

/**
 * Indeed discovery adapter (ADR-0015, Tier-4 best-effort web). Same boundaries
 * as LinkedIn (SDD §21): honest identified fetching, NO login/credentials, NO
 * browser evasion, on-demand only; ships only behind the @hunt/eval gate. In
 * practice Indeed fronts its search with a bot challenge, so this adapter's most
 * common honest outcome is a clean, typed failure pointing at the legal floors
 * (the JSearch official API, which aggregates Indeed, or the paste path).
 *
 *   https://www.indeed.com/jobs?q=<roles>&l=<board/location>
 *
 * `board` is a location hint; intent supplies the query. When Indeed serves a
 * challenge/verification page instead of results, we throw rather than evade.
 * Selectors are pinned by fixture tests so a DOM change fails the eval.
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

export type PageFetcher = (url: string) => Promise<string>;

const INDEED_ADAPTER_VERSION = "0.1.0";
const INDEED_ORIGIN = "https://www.indeed.com";

const FALLBACK_HINT =
  "Indeed blocks un-authenticated automated fetching — use the JSearch source (official API) or paste the posting: hunt import -";

/** A bot challenge / verification page, not a results list. */
function isBlocked(html: string): boolean {
  return (
    /challenge|captcha|please verify|additional verification|cf-browser-verification|are you a human/i.test(
      html,
    ) || /<title>[^<]*just a moment[^<]*<\/title>/i.test(html)
  );
}

function buildUrl(board: string, query: SearchQuery): string {
  const params = new URLSearchParams();
  const q = query.roles.join(" ").trim();
  if (q) params.set("q", q);
  const location = board && board !== "global" ? board : (query.locations[0]?.trim() ?? "");
  if (location) params.set("l", location);
  return `${INDEED_ORIGIN}/jobs?${params.toString()}`;
}

/** Indeed job links are relative (/rc/clk?jk=…); resolve to an absolute URL. */
function absolute(href: string): string {
  return href.startsWith("http") ? href : `${INDEED_ORIGIN}${href}`;
}

export function createIndeedAdapter(deps: { fetchPage?: PageFetcher } = {}): DiscoveryAdapter {
  const getPage = deps.fetchPage ?? ((url: string) => fetchPage(url));
  return {
    id: "indeed",
    version: INDEED_ADAPTER_VERSION,
    async discover({ board, query }): Promise<DiscoveredRef[]> {
      const html = await getPage(buildUrl(board, query));
      if (isBlocked(html)) throw new FetchError("Indeed served a bot-challenge page", FALLBACK_HINT);

      const root = parse(html);
      const refs: DiscoveredRef[] = [];
      for (const card of root.querySelectorAll("div.job_seen_beacon, div.result")) {
        const link = card.querySelector("h2.jobTitle a, a.jcs-JobTitle");
        const href = link?.getAttribute("href")?.trim();
        const title = link?.text.trim();
        if (!href || !title) continue; // a lead needs a title and a URL
        const companyName = card.querySelector('[data-testid="company-name"], span.companyName')?.text.trim();
        const location = card.querySelector('[data-testid="text-location"], div.companyLocation')?.text.trim();
        const snippet = plainTeaser(card.querySelector('div.job-snippet, [data-testid="job-snippet"]')?.text);
        refs.push({
          sourceId: "indeed",
          url: absolute(href),
          title,
          ...(companyName ? { companyName } : {}),
          ...(location ? { location } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
