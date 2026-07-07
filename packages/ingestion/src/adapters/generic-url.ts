import { fetchPage } from "../fetch.js";
import type { SourceAdapter } from "./types.js";

/**
 * Fallback adapter for any http(s) job URL (decisions log #12): fetch the
 * page and rely on the shared tiers (JSON-LD, then AI). No DOM tier — that
 * requires knowing the site's markup.
 */
export const genericUrlAdapter: SourceAdapter = {
  id: "generic-url",
  version: "0.1.0",
  matchesUrl: (url) => /^https?:\/\//i.test(url),
  fetchUrl: (url) => fetchPage(url),
};
