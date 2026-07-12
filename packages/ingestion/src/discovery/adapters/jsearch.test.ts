import { describe, expect, it } from "vitest";
import type { FetchJsonOptions } from "../../fetch.js";
import { createJSearchAdapter } from "./jsearch.js";

/**
 * Fixture: a recorded JSearch (RapidAPI) response shape
 * (jsearch.p.rapidapi.com/search) — `{ data: [...] }`. The HTTP call is
 * injected so the adapter is tested fully offline (SDD §20); we capture the URL
 * and headers to assert intent and the RapidAPI key are wired correctly.
 */
const FIXTURE = {
  data: [
    {
      job_title: "Senior Backend Engineer",
      employer_name: "Acme",
      job_city: "Austin",
      job_country: "US",
      job_apply_link: "https://jobs.example.com/101",
      job_description: "We build distributed systems in Go and Kubernetes at scale.",
    },
    {
      job_title: "Product Designer",
      employer_name: "Globex",
      job_apply_link: "https://jobs.example.com/102",
    },
    // Malformed entries (no title / no link) must be skipped, not crash.
    { employer_name: "NoTitle Inc" },
    { job_title: "No Link Role" },
  ],
};

function adapterWith(response: unknown, capture?: (url: string, options?: FetchJsonOptions) => void) {
  return createJSearchAdapter({
    apiKey: "rapid-key",
    fetchJson: async <T>(url: string, options?: FetchJsonOptions) => {
      capture?.(url, options);
      return response as T;
    },
  });
}

const QUERY = { roles: ["Backend Engineer"], skills: [], locations: ["Remote"] };

describe("JSearch discovery adapter", () => {
  it("maps results to leads, joining city+country and skipping malformed entries", async () => {
    const refs = await adapterWith(FIXTURE).discover({ board: "global", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "jsearch",
      url: "https://jobs.example.com/101",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      location: "Austin, US",
    });
  });

  it("sends the RapidAPI key/host as headers, never in the URL, and folds intent into query", async () => {
    let url = "";
    let options: FetchJsonOptions | undefined;
    await adapterWith(FIXTURE, (u, o) => {
      url = u;
      options = o;
    }).discover({ board: "global", query: QUERY });
    expect(options?.headers?.["x-rapidapi-key"]).toBe("rapid-key");
    expect(options?.headers?.["x-rapidapi-host"]).toBe("jsearch.p.rapidapi.com");
    expect(url).not.toContain("rapid-key");
    expect(url).toContain("query=Backend+Engineer+Remote");
  });

  it("produces a teaser snippet, never the full description (lead invariant)", async () => {
    const [first] = await adapterWith(FIXTURE).discover({ board: "global", query: QUERY });
    expect(first!.snippet).toContain("distributed systems");
    expect(first).not.toHaveProperty("requirements");
  });

  it("handles an empty result set", async () => {
    const refs = await adapterWith({ data: [] }).discover({ board: "global", query: QUERY });
    expect(refs).toEqual([]);
  });
});
