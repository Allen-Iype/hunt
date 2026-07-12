import { describe, expect, it } from "vitest";
import { createArbeitnowAdapter } from "./arbeitnow.js";

/**
 * Fixture: a recorded Arbeitnow job-board API response shape
 * (arbeitnow.com/api/job-board-api) — `{ data: [...] }`. The HTTP call is
 * injected so the adapter is tested fully offline (SDD §20).
 */
const FIXTURE = {
  data: [
    {
      title: "Senior Backend Engineer",
      company_name: "Acme GmbH",
      url: "https://www.arbeitnow.com/jobs/101",
      location: "Berlin",
      description: "<p>We build distributed systems in <b>Go</b> and Kubernetes.</p>",
    },
    {
      title: "Product Designer",
      company_name: "Globex",
      url: "https://www.arbeitnow.com/jobs/102",
    },
    // Malformed entries (no title / no url) must be skipped, not crash.
    { company_name: "NoTitle Inc" },
    { title: "No URL Role" },
  ],
};

function adapterWith(response: unknown) {
  return createArbeitnowAdapter({
    fetchJson: async <T>() => response as T,
  });
}

const QUERY = { roles: [], skills: [], locations: [] };

describe("Arbeitnow discovery adapter", () => {
  it("maps jobs to leads, skipping malformed entries", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "global", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "arbeitnow",
      url: "https://www.arbeitnow.com/jobs/101",
      title: "Senior Backend Engineer",
      companyName: "Acme GmbH",
      location: "Berlin",
    });
  });

  it("produces a de-HTMLed teaser snippet, never the full description (lead invariant)", async () => {
    const [first] = await adapterWith(FIXTURE).discover({ board: "global", query: QUERY });
    expect(first!.snippet).toContain("distributed systems");
    expect(first!.snippet).not.toContain("<");
    expect(first).not.toHaveProperty("requirements");
    expect(first).not.toHaveProperty("descriptionText");
  });

  it("handles an empty feed", async () => {
    const refs = await adapterWith({ data: [] }).discover({ board: "global", query: QUERY });
    expect(refs).toEqual([]);
  });
});
