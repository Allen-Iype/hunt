import { describe, expect, it } from "vitest";
import { FetchError } from "../../fetch.js";
import { createLinkedInAdapter } from "./linkedin.js";

/**
 * Fixture: a recorded LinkedIn PUBLIC guest jobs fragment
 * (jobs-guest/jobs/api/seeMoreJobPostings/search) — a list of job cards, no
 * auth. The HTTP call is injected so the adapter is tested fully offline (SDD
 * §20). Selectors are pinned here so a DOM change fails the eval, not silently.
 */
const CARDS_HTML = `<ul>
  <li>
    <div class="base-card">
      <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/101?refId=abc"></a>
      <h3 class="base-search-card__title">Senior Backend Engineer</h3>
      <h4 class="base-search-card__subtitle"><a href="/company/acme">Acme</a></h4>
      <span class="job-search-card__location">Remote, US</span>
      <p class="job-search-card__snippet">We build distributed systems in Go and Kubernetes.</p>
    </div>
  </li>
  <li>
    <div class="base-card">
      <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/102"></a>
      <h3 class="base-search-card__title">Product Designer</h3>
      <h4 class="base-search-card__subtitle">Globex</h4>
      <span class="job-search-card__location">Berlin</span>
    </div>
  </li>
  <li><div class="base-card"><h3 class="base-search-card__title">No Link Role</h3></div></li>
</ul>`;

const AUTHWALL_HTML = `<html><head><title>Sign Up | LinkedIn</title></head><body><div class="authwall"></div></body></html>`;

function adapterWith(html: string) {
  return createLinkedInAdapter({ fetchPage: async () => html });
}

const QUERY = { roles: ["Backend Engineer"], skills: [], locations: [] };

describe("LinkedIn discovery adapter (Tier-4)", () => {
  it("parses public job cards into leads, skipping cards without a link", async () => {
    const refs = await adapterWith(CARDS_HTML).discover({ board: "United States", query: QUERY });
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      sourceId: "linkedin",
      url: "https://www.linkedin.com/jobs/view/101",
      title: "Senior Backend Engineer",
      companyName: "Acme",
      location: "Remote, US",
    });
    expect(refs[0]!.snippet).toContain("distributed systems");
    // Query string is stripped from the URL so dedup works across searches.
    expect(refs[0]!.url).not.toContain("refId");
  });

  it("fails honestly with a paste/JSearch pointer when served a login wall (no evasion)", async () => {
    await expect(adapterWith(AUTHWALL_HTML).discover({ board: "global", query: QUERY })).rejects.toBeInstanceOf(
      FetchError,
    );
    await expect(adapterWith(AUTHWALL_HTML).discover({ board: "global", query: QUERY })).rejects.toThrow(
      /login\/challenge wall/,
    );
  });

  it("carries a teaser only, never job structure (lead invariant)", async () => {
    const [first] = await adapterWith(CARDS_HTML).discover({ board: "global", query: QUERY });
    expect(first).not.toHaveProperty("requirements");
    expect(first).not.toHaveProperty("descriptionText");
  });

  it("returns [] for an empty results fragment", async () => {
    const refs = await adapterWith("<ul></ul>").discover({ board: "global", query: QUERY });
    expect(refs).toEqual([]);
  });
});
