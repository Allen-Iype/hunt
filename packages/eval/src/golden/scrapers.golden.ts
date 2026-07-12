import type { DiscoveredRef } from "@hunt/core";

/**
 * Golden extraction snapshots for the Tier-4 web scrapers (ADR-0015, Phase D).
 * Each pairs a recorded public HTML fragment with its hand-verified expected
 * leads, so the @hunt/eval gate proves the scraper still extracts correctly.
 * A DOM change that breaks a selector shows up as a failing eval — the whole
 * point of gating this brittle tier — rather than as silently-missing jobs.
 *
 * The HTML here mirrors the shape recorded from each site's public search
 * surface; the harness feeds it to the real adapter via an injected fetcher.
 */

// ── LinkedIn (public guest jobs fragment) ──────────────────────────────────
export const linkedinHtml = `<ul>
  <li><div class="base-card">
    <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/101?refId=x"></a>
    <h3 class="base-search-card__title">Senior Backend Engineer</h3>
    <h4 class="base-search-card__subtitle"><a href="/company/acme">Acme</a></h4>
    <span class="job-search-card__location">Remote, US</span>
    <p class="job-search-card__snippet">We build distributed systems in Go and Kubernetes.</p>
  </div></li>
  <li><div class="base-card">
    <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/102"></a>
    <h3 class="base-search-card__title">Staff Frontend Engineer</h3>
    <h4 class="base-search-card__subtitle">Globex</h4>
    <span class="job-search-card__location">Berlin</span>
  </div></li>
</ul>`;

export const linkedinExpected: DiscoveredRef[] = [
  {
    sourceId: "linkedin",
    url: "https://www.linkedin.com/jobs/view/101",
    title: "Senior Backend Engineer",
    companyName: "Acme",
    location: "Remote, US",
    snippet: "We build distributed systems in Go and Kubernetes.",
  },
  {
    sourceId: "linkedin",
    url: "https://www.linkedin.com/jobs/view/102",
    title: "Staff Frontend Engineer",
    companyName: "Globex",
    location: "Berlin",
  },
];

// ── Indeed (results fragment) ──────────────────────────────────────────────
export const indeedHtml = `<div id="mosaic-provider-jobcards">
  <div class="job_seen_beacon">
    <h2 class="jobTitle"><a href="/rc/clk?jk=abc101">Senior Backend Engineer</a></h2>
    <span data-testid="company-name">Acme</span>
    <div data-testid="text-location">Remote</div>
    <div class="job-snippet">We build distributed systems in Go and Kubernetes.</div>
  </div>
  <div class="job_seen_beacon">
    <h2 class="jobTitle"><a href="https://www.indeed.com/viewjob?jk=abc102">Data Engineer</a></h2>
    <span data-testid="company-name">Globex</span>
    <div data-testid="text-location">New York</div>
  </div>
</div>`;

export const indeedExpected: DiscoveredRef[] = [
  {
    sourceId: "indeed",
    url: "https://www.indeed.com/rc/clk?jk=abc101",
    title: "Senior Backend Engineer",
    companyName: "Acme",
    location: "Remote",
    snippet: "We build distributed systems in Go and Kubernetes.",
  },
  {
    sourceId: "indeed",
    url: "https://www.indeed.com/viewjob?jk=abc102",
    title: "Data Engineer",
    companyName: "Globex",
    location: "New York",
  },
];

// ── Glassdoor (listings fragment) ──────────────────────────────────────────
export const glassdoorHtml = `<ul>
  <li class="react-job-listing">
    <a class="jobLink" data-test="job-link" href="/job-listing/backend-101.htm">
      <div data-test="job-title">Senior Backend Engineer</div>
    </a>
    <div data-test="employer-short-name">Acme</div>
    <div data-test="emp-location">Remote, US</div>
    <div data-test="descSnippet">We build distributed systems in Go and Kubernetes.</div>
  </li>
  <li class="react-job-listing">
    <a class="jobLink" href="https://www.glassdoor.com/job-listing/platform-102.htm">
      <div data-test="job-title">Platform Engineer</div>
    </a>
    <div data-test="employer-short-name">Globex</div>
    <div data-test="emp-location">London</div>
  </li>
</ul>`;

export const glassdoorExpected: DiscoveredRef[] = [
  {
    sourceId: "glassdoor",
    url: "https://www.glassdoor.com/job-listing/backend-101.htm",
    title: "Senior Backend Engineer",
    companyName: "Acme",
    location: "Remote, US",
    snippet: "We build distributed systems in Go and Kubernetes.",
  },
  {
    sourceId: "glassdoor",
    url: "https://www.glassdoor.com/job-listing/platform-102.htm",
    title: "Platform Engineer",
    companyName: "Globex",
    location: "London",
  },
];
