import { describe, expect, it } from "vitest";
import { createAshbyAdapter } from "./ashby.js";

/**
 * Fixture: a recorded Ashby job-board API response shape
 * (api.ashbyhq.com/posting-api/job-board/<board>) — `{ jobs: [...] }`, each job
 * carrying a plain-text `descriptionPlain`. The HTTP call is injected so the
 * adapter is tested fully offline (SDD §20).
 */
const FIXTURE = {
  jobs: [
    {
      title: "Senior Backend Engineer",
      jobUrl: "https://jobs.ashbyhq.com/acme/101",
      location: "Remote (US)",
      isListed: true,
      descriptionPlain: "We build distributed systems in Go and Kubernetes at scale.",
    },
    {
      title: "Product Designer",
      jobUrl: "https://jobs.ashbyhq.com/acme/102",
      location: "Berlin",
      isListed: true,
    },
    // Unlisted postings are unpublished — skipped.
    { title: "Draft Role", jobUrl: "https://jobs.ashbyhq.com/acme/103", isListed: false },
    // Malformed entries (no title / no url) must be skipped, not crash.
    { location: "NYC", isListed: true },
    { title: "No URL Role", isListed: true },
  ],
};

function adapterWith(response: unknown) {
  return createAshbyAdapter({
    fetchJson: async <T>() => response as T,
  });
}

const QUERY = { roles: [], skills: [], locations: [] };

describe("Ashby discovery adapter", () => {
  it("maps listed jobs to leads, skipping unlisted and malformed entries", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "acme", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.title)).not.toContain("Draft Role");
    expect(refs[0]).toMatchObject({
      sourceId: "ashby",
      url: "https://jobs.ashbyhq.com/acme/101",
      title: "Senior Backend Engineer",
      location: "Remote (US)",
    });
    // Ashby carries no org name at the board level — omitted on the lead.
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
    const refs = await adapterWith({ jobs: [] }).discover({ board: "empty", query: QUERY });
    expect(refs).toEqual([]);
  });
});
