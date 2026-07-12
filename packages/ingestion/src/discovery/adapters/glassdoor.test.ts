import { describe, expect, it } from "vitest";
import { FetchError } from "../../fetch.js";
import { createGlassdoorAdapter } from "./glassdoor.js";

/**
 * Fixture: a recorded Glassdoor listings fragment (Job/jobs.htm) and a bot-
 * challenge page. The HTTP call is injected so the adapter is tested fully
 * offline (SDD §20). Selectors are pinned so a DOM change fails the eval.
 */
const LISTINGS_HTML = `<ul>
  <li class="react-job-listing">
    <a class="jobLink" data-test="job-link" href="/job-listing/senior-backend-101.htm">
      <div data-test="job-title">Senior Backend Engineer</div>
    </a>
    <div data-test="employer-short-name">Acme</div>
    <div data-test="emp-location">Remote, US</div>
    <div data-test="descSnippet">We build distributed systems in Go and Kubernetes.</div>
  </li>
  <li class="react-job-listing">
    <a class="jobLink" href="https://www.glassdoor.com/job-listing/designer-102.htm">
      <div data-test="job-title">Product Designer</div>
    </a>
    <div data-test="employer-short-name">Globex</div>
    <div data-test="emp-location">Berlin</div>
  </li>
  <li class="react-job-listing"><div data-test="employer-short-name">No Title Co</div></li>
</ul>`;

const CHALLENGE_HTML = `<html><head><title>Security Check</title></head><body>Please verify you are a human. px-captcha</body></html>`;

function adapterWith(html: string) {
  return createGlassdoorAdapter({ fetchPage: async () => html });
}

const QUERY = { roles: ["Backend Engineer"], skills: [], locations: [] };

describe("Glassdoor discovery adapter (Tier-4)", () => {
  it("parses listings into leads, resolving relative links and skipping title-less cards", async () => {
    const refs = await adapterWith(LISTINGS_HTML).discover({ board: "Remote", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "glassdoor",
      url: "https://www.glassdoor.com/job-listing/senior-backend-101.htm",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      location: "Remote, US",
    });
    expect(refs[1]!.url).toBe("https://www.glassdoor.com/job-listing/designer-102.htm");
    expect(refs[0]!.snippet).toContain("distributed systems");
  });

  it("fails honestly with a paste/JSearch pointer when served a challenge (no evasion)", async () => {
    await expect(adapterWith(CHALLENGE_HTML).discover({ board: "global", query: QUERY })).rejects.toBeInstanceOf(
      FetchError,
    );
    await expect(adapterWith(CHALLENGE_HTML).discover({ board: "global", query: QUERY })).rejects.toThrow(
      /bot-challenge/,
    );
  });

  it("carries a teaser only, never job structure (lead invariant)", async () => {
    const [first] = await adapterWith(LISTINGS_HTML).discover({ board: "global", query: QUERY });
    expect(first).not.toHaveProperty("requirements");
    expect(first).not.toHaveProperty("descriptionText");
  });

  it("returns [] for an empty listings fragment", async () => {
    const refs = await adapterWith("<ul></ul>").discover({ board: "global", query: QUERY });
    expect(refs).toEqual([]);
  });
});
