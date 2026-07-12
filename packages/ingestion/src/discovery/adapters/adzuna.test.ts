import { describe, expect, it } from "vitest";
import { createAdzunaAdapter } from "./adzuna.js";

/**
 * Fixture: a recorded Adzuna search response shape
 * (api.adzuna.com/v1/api/jobs/<country>/search/1). The HTTP call is injected so
 * the adapter is tested fully offline (SDD §20); we also capture the requested
 * URL to assert intent + credentials are wired into the query.
 */
const FIXTURE = {
  results: [
    {
      title: "Senior Backend Engineer",
      redirect_url: "https://www.adzuna.com/land/ad/101",
      company: { display_name: "Acme" },
      location: { display_name: "London, UK" },
      description: "<p>We build distributed systems in Go and Kubernetes.</p>",
    },
    {
      title: "Product Designer",
      redirect_url: "https://www.adzuna.com/land/ad/102",
      company: { display_name: "Globex" },
    },
    // Malformed entries (no title / no url) must be skipped, not crash.
    { company: { display_name: "NoTitle Inc" } },
    { title: "No URL Role" },
  ],
};

function adapterWith(response: unknown, onUrl?: (url: string) => void) {
  return createAdzunaAdapter({
    appId: "app-id-123",
    appKey: "app-key-456",
    fetchJson: async <T>(url: string) => {
      onUrl?.(url);
      return response as T;
    },
  });
}

const QUERY = { roles: ["Backend Engineer"], skills: [], locations: ["London"] };

describe("Adzuna discovery adapter", () => {
  it("maps results to leads, skipping malformed entries", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "gb", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "adzuna",
      url: "https://www.adzuna.com/land/ad/101",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      location: "London, UK",
    });
  });

  it("sends credentials and intent (what/where) as server-side query params", async () => {
    let requested = "";
    await adapterWith(FIXTURE, (url) => (requested = url)).discover({ board: "gb", query: QUERY });
    expect(requested).toContain("/jobs/gb/search/1");
    expect(requested).toContain("app_id=app-id-123");
    expect(requested).toContain("app_key=app-key-456");
    expect(requested).toContain("what=Backend+Engineer");
    expect(requested).toContain("where=London");
  });

  it("produces a de-HTMLed teaser snippet, never the full description (lead invariant)", async () => {
    const [first] = await adapterWith(FIXTURE).discover({ board: "gb", query: QUERY });
    expect(first!.snippet).toContain("distributed systems");
    expect(first!.snippet).not.toContain("<");
    expect(first).not.toHaveProperty("requirements");
  });

  it("handles an empty result set", async () => {
    const refs = await adapterWith({ results: [] }).discover({ board: "us", query: QUERY });
    expect(refs).toEqual([]);
  });
});
