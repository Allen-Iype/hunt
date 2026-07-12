import { describe, expect, it } from "vitest";
import type { FetchJsonOptions } from "../../fetch.js";
import { createFindworkAdapter } from "./findwork.js";

/**
 * Fixture: a recorded Findwork search response shape
 * (findwork.dev/api/jobs/). The HTTP call is injected so the adapter is tested
 * fully offline (SDD §20); we capture the URL and headers to assert intent and
 * the Authorization token are wired correctly.
 */
const FIXTURE = {
  results: [
    {
      role: "Senior Backend Engineer",
      company_name: "Acme",
      location: "Remote",
      url: "https://findwork.dev/jobs/101",
      text: "<p>We build distributed systems in Go and Kubernetes.</p>",
    },
    {
      role: "Product Designer",
      company_name: "Globex",
      url: "https://findwork.dev/jobs/102",
    },
    // Malformed entries (no role / no url) must be skipped, not crash.
    { company_name: "NoRole Inc" },
    { role: "No URL Role" },
  ],
};

function adapterWith(response: unknown, capture?: (url: string, options?: FetchJsonOptions) => void) {
  return createFindworkAdapter({
    apiKey: "secret-token",
    fetchJson: async <T>(url: string, options?: FetchJsonOptions) => {
      capture?.(url, options);
      return response as T;
    },
  });
}

const QUERY = { roles: ["Backend Engineer"], skills: ["Go"], locations: ["Berlin"] };

describe("Findwork discovery adapter", () => {
  it("maps results to leads, skipping malformed entries", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "all", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "findwork",
      url: "https://findwork.dev/jobs/101",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      location: "Remote",
    });
  });

  it("sends the token as an Authorization header, never in the URL", async () => {
    let url = "";
    let options: FetchJsonOptions | undefined;
    await adapterWith(FIXTURE, (u, o) => {
      url = u;
      options = o;
    }).discover({ board: "remote", query: QUERY });
    expect(options?.headers?.authorization).toBe("Token secret-token");
    expect(url).not.toContain("secret-token");
    expect(url).toContain("search=Backend+Engineer+Go");
    expect(url).toContain("location=Berlin");
    expect(url).toContain("remote=true");
  });

  it("produces a de-HTMLed teaser snippet, never the full description (lead invariant)", async () => {
    const [first] = await adapterWith(FIXTURE).discover({ board: "all", query: QUERY });
    expect(first!.snippet).toContain("distributed systems");
    expect(first!.snippet).not.toContain("<");
    expect(first).not.toHaveProperty("requirements");
  });

  it("handles an empty result set", async () => {
    const refs = await adapterWith({ results: [] }).discover({ board: "all", query: QUERY });
    expect(refs).toEqual([]);
  });
});
