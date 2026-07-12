import type { DiscoveredRef, SearchQuery } from "@hunt/core";
import { parse } from "node-html-parser";
import { FetchError, fetchPage } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { plainTeaser } from "./teaser.js";

/**
 * LinkedIn discovery adapter (ADR-0015, Tier-4 best-effort web). This is the
 * BRITTLE tier: it parses public HTML, so it ships only behind the @hunt/eval
 * gate and fails honestly when blocked. Hard boundaries (SDD §21): honest,
 * identified fetching (no user-agent spoofing), NO login/credentials, NO
 * browser-based evasion, on-demand only. The always-legal floors are the
 * JSearch official API (Tier-3, aggregates LinkedIn) and the paste path.
 *
 * We hit LinkedIn's PUBLIC guest jobs endpoint — the un-authenticated surface
 * that returns a fragment of job cards, no login:
 *
 *   https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
 *     ?keywords=<roles>&location=<board>
 *
 * `board` is a location hint (e.g. "United States", "Remote"); intent supplies
 * the keywords. When LinkedIn serves a login/challenge wall instead of cards,
 * we throw a typed FetchError pointing at the legal fallbacks rather than trying
 * to evade it. Selectors are pinned by fixture tests so a DOM change surfaces as
 * a failing eval, not as silently-missing jobs.
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

export type PageFetcher = (url: string) => Promise<string>;

const LINKEDIN_ADAPTER_VERSION = "0.1.0";

const FALLBACK_HINT =
  "LinkedIn blocks un-authenticated automated fetching — use the JSearch source (official API) or paste the posting: hunt import -";

/** A login/challenge wall, not a job-cards fragment. */
function isBlocked(html: string): boolean {
  return (
    html.includes("authwall") ||
    /<title>[^<]*(sign\s?up|sign\s?in|log\s?in|join linkedin)[^<]*<\/title>/i.test(html) ||
    /challenge|captcha|please verify/i.test(html)
  );
}

function buildUrl(board: string, query: SearchQuery): string {
  const params = new URLSearchParams();
  const keywords = query.roles.join(" ").trim();
  if (keywords) params.set("keywords", keywords);
  const location = board && board !== "global" ? board : (query.locations[0]?.trim() ?? "");
  if (location) params.set("location", location);
  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;
}

export function createLinkedInAdapter(deps: { fetchPage?: PageFetcher } = {}): DiscoveryAdapter {
  const getPage = deps.fetchPage ?? ((url: string) => fetchPage(url));
  return {
    id: "linkedin",
    version: LINKEDIN_ADAPTER_VERSION,
    async discover({ board, query }): Promise<DiscoveredRef[]> {
      const html = await getPage(buildUrl(board, query));
      if (isBlocked(html)) throw new FetchError("LinkedIn served a login/challenge wall", FALLBACK_HINT);

      const root = parse(html);
      const refs: DiscoveredRef[] = [];
      // One container per card. `div.base-card` is LinkedIn's card wrapper; the
      // guest endpoint nests it in an <li>, so selecting the div avoids double-
      // counting. Fall back to the li only if no base-card wrappers are present.
      const cards = root.querySelectorAll("div.base-card");
      for (const card of cards.length > 0 ? cards : root.querySelectorAll("li")) {
        const link = card.querySelector("a.base-card__full-link, a.base-search-card__title-link");
        const url = link?.getAttribute("href")?.split("?")[0]?.trim();
        const title = card.querySelector("h3.base-search-card__title")?.text.trim();
        if (!url || !title) continue; // a lead needs a title and a URL
        const companyName = card.querySelector("h4.base-search-card__subtitle a, h4.base-search-card__subtitle")?.text.trim();
        const location = card.querySelector("span.job-search-card__location")?.text.trim();
        const snippet = plainTeaser(card.querySelector("p.job-search-card__snippet")?.text);
        refs.push({
          sourceId: "linkedin",
          url,
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
