import { parse } from "node-html-parser";
import { ExtractedJobDraftSchema } from "@hunt/core";
import { FetchError, fetchPage } from "../fetch.js";
import { htmlToText } from "../html.js";
import type { SourceAdapter } from "./types.js";

/**
 * LinkedIn adapter (SDD §9, ADR-0009): best-effort. Public job pages carry
 * JobPosting JSON-LD (tier 1, handled by the shared pipeline); this adapter
 * adds auth-wall detection at fetch time and a DOM tier for public pages
 * whose JSON-LD is missing. Selectors are pinned by fixture tests.
 */

const URL_PATTERN = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/jobs\/view\//i;

function isAuthWall(html: string): boolean {
  return (
    html.includes("authwall") ||
    /<title>[^<]*(sign\s?up|sign\s?in|log\s?in)[^<]*linkedin[^<]*<\/title>/i.test(html)
  );
}

export const linkedinAdapter: SourceAdapter = {
  id: "linkedin",
  version: "0.1.0",

  matchesUrl(url) {
    return URL_PATTERN.test(url);
  },

  async fetchUrl(url) {
    const html = await fetchPage(url);
    if (isAuthWall(html)) {
      throw new FetchError(
        "LinkedIn served a login wall instead of the job posting",
        "open the posting in your browser, copy the text, then: hunt import -",
      );
    }
    return html;
  },

  domExtract(html) {
    const root = parse(html);
    const title = root.querySelector("h1.top-card-layout__title, h1.topcard__title")?.text.trim();
    const companyName = root
      .querySelector("a.topcard__org-name-link, span.topcard__flavor")
      ?.text.trim();
    const location = root
      .querySelector("span.topcard__flavor--bullet")
      ?.text.trim();
    const description = root.querySelector(
      "div.show-more-less-html__markup, div.description__text",
    );
    if (!title || !companyName || !description) return null;

    const descriptionText = htmlToText(description.innerHTML);
    if (descriptionText.length === 0) return null;
    const parsed = ExtractedJobDraftSchema.safeParse({
      title,
      companyName,
      locations: location ? [location] : [],
    });
    return parsed.success ? { draft: parsed.data, descriptionText } : null;
  },
};
