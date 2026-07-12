import { describe, expect, it } from "vitest";
import { createHackerNewsAdapter } from "./hackernews.js";

/**
 * Fixture: a recorded HN "Who is hiring?" thread and its comment postings, keyed
 * by item id (the API is one item-fetch per id). The injected fetcher routes by
 * URL so the two-step fan-out (thread → kids) runs fully offline (SDD §20).
 */
const ITEMS: Record<number, unknown> = {
  1000: { id: 1000, type: "story", kids: [1001, 1002, 1003, 1004] },
  1001: {
    id: 1001,
    type: "comment",
    text: "Acme | Senior Backend Engineer | Remote<p>We build distributed systems in Go and Kubernetes.</p>",
  },
  1002: { id: 1002, type: "comment", text: "Globex | Product Designer | Berlin" },
  1003: { id: 1003, type: "comment", deleted: true }, // deleted — skipped
  1004: { id: 1004, type: "comment", dead: true, text: "Spam" }, // dead — skipped
};

function adapterWith(items: Record<number, unknown>) {
  return createHackerNewsAdapter({
    fetchJson: async <T>(url: string) => {
      const id = Number(url.match(/item\/(\d+)\.json/)?.[1]);
      return (items[id] ?? {}) as T;
    },
  });
}

const QUERY = { roles: [], skills: [], locations: [] };

describe("Hacker News Who's Hiring discovery adapter", () => {
  it("maps thread comments to leads, deriving a title and permalink, skipping dead/deleted", async () => {
    const refs = await adapterWith(ITEMS).discover({ board: "1000", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "hackernews",
      url: "https://news.ycombinator.com/item?id=1001",
      title: "Acme | Senior Backend Engineer | Remote",
    });
    expect(refs[1]).toMatchObject({ title: "Globex | Product Designer | Berlin" });
  });

  it("produces a de-HTMLed teaser snippet, never the full comment (lead invariant)", async () => {
    const [first] = await adapterWith(ITEMS).discover({ board: "1000", query: QUERY });
    expect(first!.snippet).toContain("distributed systems");
    expect(first!.snippet).not.toContain("<");
    expect(first).not.toHaveProperty("requirements");
  });

  it("handles a thread with no comments", async () => {
    const refs = await adapterWith({ 2000: { id: 2000, type: "story" } }).discover({ board: "2000", query: QUERY });
    expect(refs).toEqual([]);
  });
});
