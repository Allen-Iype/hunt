import type { DiscoveredRef } from "@hunt/core";
import { fetchJson } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";
import { htmlTeaser } from "./teaser.js";

/**
 * RemoteOK discovery adapter (ADR-0015, Tier-2 aggregator feed). RemoteOK
 * publishes a public JSON feed of remote jobs — no auth, structured, broad:
 *
 *   https://remoteok.com/api
 *
 * Unlike the ATS tier, this is an aggregator feed, not a single company board.
 * It has no server-side search, so it lists ALL current remote openings; the
 * capability layer ranks them client-side against the search's intent. The
 * `board` handle is therefore ignored (there is one global feed) — callers
 * conventionally pass "global".
 *
 * Shape quirk: the response is a top-level ARRAY whose FIRST element is a
 * legal/metadata notice, not a job (`{ legal: "..." }`). We skip any element
 * lacking a position + url, which drops that row and any malformed entry. The
 * `description` field is HTML; we keep only a de-HTMLed teaser (the full
 * description belongs to the import pipeline, ADR-0015 invariant).
 *
 * The HTTP call is injected so contract tests run against recorded fixtures,
 * fully offline (matching the source-adapter fixture discipline, SDD §20).
 */

interface RemoteOkPosting {
  /** Present on the leading metadata row, absent on real postings. */
  legal?: string;
  position?: string;
  company?: string;
  url?: string;
  location?: string;
  description?: string;
}

export type JsonFetcher = <T>(url: string) => Promise<T>;

const REMOTEOK_ADAPTER_VERSION = "0.1.0";

export function createRemoteOkAdapter(deps: { fetchJson?: JsonFetcher } = {}): DiscoveryAdapter {
  const getJson = deps.fetchJson ?? (<T>(url: string) => fetchJson<T>(url));
  return {
    id: "remoteok",
    version: REMOTEOK_ADAPTER_VERSION,
    async discover(): Promise<DiscoveredRef[]> {
      const url = "https://remoteok.com/api";
      const postings = await getJson<RemoteOkPosting[]>(url);
      const refs: DiscoveredRef[] = [];
      for (const posting of postings ?? []) {
        if (posting.legal !== undefined) continue; // leading metadata row, not a job
        if (!posting.position || !posting.url) continue; // a lead needs a title and a URL
        const snippet = htmlTeaser(posting.description);
        refs.push({
          sourceId: "remoteok",
          url: posting.url,
          title: posting.position,
          ...(posting.company ? { companyName: posting.company } : {}),
          ...(posting.location ? { location: posting.location } : {}),
          ...(snippet ? { snippet } : {}),
        });
      }
      return refs;
    },
  };
}
