import { describe, expect, it } from "vitest";
import { FetchError } from "../../fetch.js";
import { createIndeedAdapter } from "./indeed.js";

/**
 * Fixture: a recorded Indeed results fragment (indeed.com/jobs) and a bot-
 * challenge page. The HTTP call is injected so the adapter is tested fully
 * offline (SDD §20). Selectors are pinned so a DOM change fails the eval.
 */
const RESULTS_HTML = `<div id="mosaic-provider-jobcards">
  <div class="job_seen_beacon">
    <h2 class="jobTitle"><a href="/rc/clk?jk=abc101">Senior Backend Engineer</a></h2>
    <span data-testid="company-name">Acme</span>
    <div data-testid="text-location">Remote</div>
    <div class="job-snippet">We build distributed systems in Go and Kubernetes.</div>
  </div>
  <div class="job_seen_beacon">
    <h2 class="jobTitle"><a href="https://www.indeed.com/viewjob?jk=abc102">Product Designer</a></h2>
    <span data-testid="company-name">Globex</span>
    <div data-testid="text-location">Berlin</div>
  </div>
  <div class="job_seen_beacon"><span data-testid="company-name">No Title Co</span></div>
</div>`;

const CHALLENGE_HTML = `<html><head><title>Just a moment...</title></head><body>Please verify you are a human. cf-browser-verification</body></html>`;

function adapterWith(html: string) {
  return createIndeedAdapter({ fetchPage: async () => html });
}

const QUERY = { roles: ["Backend Engineer"], skills: [], locations: [] };

describe("Indeed discovery adapter (Tier-4)", () => {
  it("parses result cards into leads, resolving relative links and skipping title-less cards", async () => {
    const refs = await adapterWith(RESULTS_HTML).discover({ board: "Remote", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "indeed",
      url: "https://www.indeed.com/rc/clk?jk=abc101",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      location: "Remote",
    });
    expect(refs[1]!.url).toBe("https://www.indeed.com/viewjob?jk=abc102");
    expect(refs[0]!.snippet).toContain("distributed systems");
  });

  it("fails honestly with a paste/JSearch pointer when served a bot challenge (no evasion)", async () => {
    await expect(adapterWith(CHALLENGE_HTML).discover({ board: "global", query: QUERY })).rejects.toBeInstanceOf(
      FetchError,
    );
    await expect(adapterWith(CHALLENGE_HTML).discover({ board: "global", query: QUERY })).rejects.toThrow(
      /bot-challenge/,
    );
  });

  it("carries a teaser only, never job structure (lead invariant)", async () => {
    const [first] = await adapterWith(RESULTS_HTML).discover({ board: "global", query: QUERY });
    expect(first).not.toHaveProperty("requirements");
    expect(first).not.toHaveProperty("descriptionText");
  });

  it("returns [] for an empty results fragment", async () => {
    const refs = await adapterWith('<div id="mosaic-provider-jobcards"></div>').discover({
      board: "global",
      query: QUERY,
    });
    expect(refs).toEqual([]);
  });
});
