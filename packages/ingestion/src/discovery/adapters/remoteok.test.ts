import { describe, expect, it } from "vitest";
import { createRemoteOkAdapter } from "./remoteok.js";

/**
 * Fixture: a recorded RemoteOK feed response shape (remoteok.com/api) — a
 * TOP-LEVEL ARRAY whose first element is a legal/metadata notice, not a job.
 * The HTTP call is injected so the adapter is tested fully offline (SDD §20).
 */
const FIXTURE = [
  { legal: "See https://remoteok.com/api for terms. Attribution required." },
  {
    position: "Senior Backend Engineer",
    company: "Acme",
    url: "https://remoteok.com/remote-jobs/101",
    location: "Worldwide",
    description: "<p>We build distributed systems in <b>Go</b> and Kubernetes.</p>",
  },
  {
    position: "Product Designer",
    company: "Globex",
    url: "https://remoteok.com/remote-jobs/102",
  },
  // Malformed entries (no title / no url) must be skipped, not crash.
  { company: "NoTitle Inc" },
  { position: "No URL Role" },
];

function adapterWith(response: unknown) {
  return createRemoteOkAdapter({
    fetchJson: async <T>() => response as T,
  });
}

const QUERY = { roles: [], skills: [], locations: [] };

describe("RemoteOK discovery adapter", () => {
  it("maps postings to leads, skipping the metadata row and malformed entries", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "global", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "remoteok",
      url: "https://remoteok.com/remote-jobs/101",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      location: "Worldwide",
    });
  });

  it("produces a de-HTMLed teaser snippet, never the full description (lead invariant)", async () => {
    const [first] = await adapterWith(FIXTURE).discover({ board: "global", query: QUERY });
    expect(first!.snippet).toContain("distributed systems");
    expect(first!.snippet).not.toContain("<");
    // A lead carries no job structure — only display fields.
    expect(first).not.toHaveProperty("requirements");
    expect(first).not.toHaveProperty("descriptionText");
  });

  it("handles an empty feed", async () => {
    const refs = await adapterWith([]).discover({ board: "global", query: QUERY });
    expect(refs).toEqual([]);
  });
});
