import { describe, expect, it } from "vitest";
import { createGreenhouseAdapter } from "./greenhouse.js";

/**
 * Fixture: a recorded Greenhouse board API response shape
 * (boards-api.greenhouse.io/v1/boards/<board>/jobs?content=true). The HTTP
 * call is injected so the adapter is tested fully offline (SDD §20).
 */
const FIXTURE = {
  jobs: [
    {
      title: "Senior Backend Engineer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/101",
      location: { name: "Remote - US" },
      company_name: "Acme",
      content: "&lt;p&gt;We build distributed systems in &lt;b&gt;Go&lt;/b&gt; and Kubernetes.&lt;/p&gt;",
    },
    {
      title: "Product Designer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/102",
      location: { name: "Berlin" },
    },
    // Malformed entries (no title / no url) must be skipped, not crash.
    { location: { name: "NYC" } },
    { title: "No URL Role" },
  ],
};

function adapterWith(response: unknown) {
  return createGreenhouseAdapter({
    fetchJson: async <T>() => response as T,
  });
}

describe("Greenhouse discovery adapter", () => {
  it("maps board jobs to leads, skipping malformed entries", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "acme", query: { roles: [], skills: [], locations: [] } });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "greenhouse",
      url: "https://boards.greenhouse.io/acme/jobs/101",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      location: "Remote - US",
    });
  });

  it("produces a de-HTMLed teaser snippet, never the full description (lead invariant)", async () => {
    const [first] = await adapterWith(FIXTURE).discover({ board: "acme", query: { roles: [], skills: [], locations: [] } });
    expect(first!.snippet).toContain("distributed systems");
    expect(first!.snippet).not.toContain("<");
    expect(first!.snippet).not.toContain("&lt;");
    // A lead carries no job structure — only display fields.
    expect(first).not.toHaveProperty("requirements");
    expect(first).not.toHaveProperty("descriptionText");
  });

  it("handles an empty board", async () => {
    const refs = await adapterWith({ jobs: [] }).discover({ board: "empty", query: { roles: [], skills: [], locations: [] } });
    expect(refs).toEqual([]);
  });
});
