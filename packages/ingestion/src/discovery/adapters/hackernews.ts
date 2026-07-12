import type { DiscoveredRef } from "@hunt/core";
import { fetchJson } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { htmlTeaser } from "./teaser.js";

/**
 * Hacker News "Who is hiring?" discovery adapter (ADR-0015, Tier-2 feed). Each
 * month HN runs an "Ask HN: Who is hiring?" thread; its top-level comments are
 * individual job postings. We read them through HN's public Firebase API — no
 * auth:
 *
 *   https://hacker-news.firebaseio.com/v0/item/<id>.json
 *
 * The `board` handle is the thread's HN item id (e.g. "39562986"). Resolving
 * "this month's thread" would need HN's search API and a live clock, so we keep
 * the adapter deterministic: the caller supplies the thread id. We fetch the
 * thread, then its comment `kids` (capped), and turn each into a lead.
 *
 * HN comments are freeform, not structured — there is no company/location
 * field. We derive a title from the comment's first line and use the HN
 * permalink as the URL. We keep only a de-HTMLed teaser of the body (the full
 * text belongs to the import pipeline, ADR-0015 invariant). Deleted/dead
 * comments and non-postings (no text) are skipped.
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

interface HnItem {
  id?: number;
  type?: string;
  text?: string;
  kids?: number[];
  deleted?: boolean;
  dead?: boolean;
}

export type JsonFetcher = <T>(url: string) => Promise<T>;

const HN_ADAPTER_VERSION = "0.1.0";
/** Bound the fan-out: a Who's Hiring thread can have 500+ comments. */
const MAX_COMMENTS = 100;
const MAX_TITLE = 100;

const itemUrl = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const permalink = (id: number) => `https://news.ycombinator.com/item?id=${id}`;

/**
 * First non-empty line of the (de-HTMLed) comment, capped — HN's de-facto title
 * line. Who's-Hiring posts conventionally lead with "Company | Role | Location |
 * …", so we keep the whole first line (splitting on `<p>`/newlines, not on the
 * `|` field separator) and let ranking read the structure from it.
 */
function deriveTitle(text: string): string | undefined {
  const firstLine = text
    .replace(/<\/?p>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")[0]
    ?.replace(/\s+/g, " ")
    .trim();
  if (!firstLine) return undefined;
  return firstLine.length > MAX_TITLE ? `${firstLine.slice(0, MAX_TITLE - 1)}…` : firstLine;
}

export function createHackerNewsAdapter(deps: { fetchJson?: JsonFetcher } = {}): DiscoveryAdapter {
  const getJson = deps.fetchJson ?? (<T>(url: string) => fetchJson<T>(url));
  return {
    id: "hackernews",
    version: HN_ADAPTER_VERSION,
    async discover({ board }): Promise<DiscoveredRef[]> {
      const thread = await getJson<HnItem>(itemUrl(Number(board)));
      const kids = (thread.kids ?? []).slice(0, MAX_COMMENTS);
      const comments = await Promise.all(kids.map((id) => getJson<HnItem>(itemUrl(id))));
      const refs: DiscoveredRef[] = [];
      for (const comment of comments) {
        if (!comment || comment.deleted || comment.dead) continue;
        if (comment.id === undefined || !comment.text) continue; // top-level postings carry text
        const title = deriveTitle(comment.text);
        if (!title) continue;
        const snippet = htmlTeaser(comment.text);
        refs.push({
          sourceId: "hackernews",
          url: permalink(comment.id),
          title,
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
