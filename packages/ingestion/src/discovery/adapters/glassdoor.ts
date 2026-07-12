import type { DiscoveredRef, SearchQuery } from "@hunt/core";
import { parse } from "node-html-parser";
import { FetchError, fetchPage } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { plainTeaser } from "./teaser.js";

/**
 * Glassdoor discovery adapter (ADR-0015, Tier-4 best-effort web). Same
 * boundaries as LinkedIn/Indeed (SDD §21): honest identified fetching, NO
 * login/credentials, NO browser evasion, on-demand only; ships only behind the
 * @hunt/eval gate. Glassdoor gates its search behind a bot challenge, so the
 * common honest outcome is a clean, typed failure pointing at the legal floors
 * (the JSearch official API, which aggregates Glassdoor, or the paste path).
 *
 *   https://www.glassdoor.com/Job/jobs.htm?sc.keyword=<roles>&locKeyword=<board>
 *
 * `board` is a location hint; intent supplies the keyword. When Glassdoor serves
 * a challenge/verification page instead of listings, we throw rather than evade.
 * Selectors are pinned by fixture tests so a DOM change fails the eval.
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

export type PageFetcher = (url: string) => Promise<string>;

const GLASSDOOR_ADAPTER_VERSION = "0.1.0";
const GLASSDOOR_ORIGIN = "https://www.glassdoor.com";

const FALLBACK_HINT =
  "Glassdoor blocks un-authenticated automated fetching — use the JSearch source (official API) or paste the posting: hunt import -";

/** A bot challenge / verification page, not a listings page. */
function isBlocked(html: string): boolean {
  return (
    /challenge|captcha|please verify|are you a human|security check|px-captcha/i.test(html) ||
    /<title>[^<]*just a moment[^<]*<\/title>/i.test(html)
  );
}

function buildUrl(board: string, query: SearchQuery): string {
  const params = new URLSearchParams();
  const keyword = query.roles.join(" ").trim();
  if (keyword) params.set("sc.keyword", keyword);
  const location = board && board !== "global" ? board : (query.locations[0]?.trim() ?? "");
  if (location) params.set("locKeyword", location);
  return `${GLASSDOOR_ORIGIN}/Job/jobs.htm?${params.toString()}`;
}

/** Glassdoor job links are often relative (/job-listing/…); resolve to absolute. */
function absolute(href: string): string {
  return href.startsWith("http") ? href : `${GLASSDOOR_ORIGIN}${href}`;
}

export function createGlassdoorAdapter(deps: { fetchPage?: PageFetcher } = {}): DiscoveryAdapter {
  const getPage = deps.fetchPage ?? ((url: string) => fetchPage(url));
  return {
    id: "glassdoor",
    version: GLASSDOOR_ADAPTER_VERSION,
    async discover({ board, query }): Promise<DiscoveredRef[]> {
      const html = await getPage(buildUrl(board, query));
      if (isBlocked(html)) throw new FetchError("Glassdoor served a bot-challenge page", FALLBACK_HINT);

      const root = parse(html);
      const refs: DiscoveredRef[] = [];
      for (const card of root.querySelectorAll('li.react-job-listing, [data-test="jobListing"]')) {
        const link = card.querySelector('a.jobLink, a[data-test="job-link"], [data-test="job-title"]');
        const href = link?.getAttribute("href")?.trim();
        const title = card.querySelector('[data-test="job-title"]')?.text.trim() ?? link?.text.trim();
        if (!href || !title) continue; // a lead needs a title and a URL
        const companyName = card.querySelector('[data-test="employer-short-name"], [data-test="employer-name"]')?.text.trim();
        const location = card.querySelector('[data-test="emp-location"], [data-test="location"]')?.text.trim();
        const snippet = plainTeaser(card.querySelector('[data-test="descSnippet"], div.job-snippet')?.text);
        refs.push({
          sourceId: "glassdoor",
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
