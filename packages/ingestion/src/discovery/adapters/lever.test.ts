import { describe, expect, it } from "vitest";
import { createLeverAdapter } from "./lever.js";

/**
 * Fixture: a recorded Lever postings API response shape
 * (api.lever.co/v0/postings/<board>?mode=json) — a TOP-LEVEL ARRAY, no
 * envelope. The HTTP call is injected so the adapter is tested fully offline
 * (SDD §20).
 */
const FIXTURE = [
  {
    text: "Senior Backend Engineer",
    hostedUrl: "https://jobs.lever.co/acme/101",
    categories: { location: "Remote - US", commitment: "Full-time" },
    descriptionPlain: "We build distributed systems in Go and Kubernetes at scale.",
  },
  {
    text: "Product Designer",
    hostedUrl: "https://jobs.lever.co/acme/102",
    categories: { location: "Berlin" },
  },
  // Malformed entries (no title / no url) must be skipped, not crash.
  { categories: { location: "NYC" } },
  { text: "No URL Role" },
];

function adapterWith(response: unknown) {
  return createLeverAdapter({
    fetchJson: async <T>() => response as T,
  });
}

const QUERY = { roles: [], skills: [], locations: [] };

describe("Lever discovery adapter", () => {
  it("maps postings to leads, skipping malformed entries", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "acme", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "lever",
      url: "https://jobs.lever.co/acme/101",
      title: "Senior Backend Engineer",
      location: "Remote - US",
    });
    // Lever payloads carry no company name — omitted on the lead.
    expect(refs[0]).not.toHaveProperty("companyName");
  });

  it("produces a teaser from descriptionPlain, never the full description (lead invariant)", async () => {
    const [first] = await adapterWith(FIXTURE).discover({ board: "acme", query: QUERY });
    expect(first!.snippet).toContain("distributed systems");
    // A lead carries no job structure — only display fields.
    expect(first).not.toHaveProperty("requirements");
    expect(first).not.toHaveProperty("descriptionText");
  });

  it("handles an empty board", async () => {
    const refs = await adapterWith([]).discover({ board: "empty", query: QUERY });
    expect(refs).toEqual([]);
  });
});
