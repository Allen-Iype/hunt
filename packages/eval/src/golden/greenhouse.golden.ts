import type { DiscoveredRef } from "@hunt/core";

/**
 * A golden extraction snapshot for the Greenhouse discovery adapter (ADR-0015).
 * `snapshot` is a recorded board-API response shape; `expected` is the
 * hand-verified set of leads it should produce. This pairs a raw input with its
 * ground-truth output so the harness can detect if the adapter's extraction
 * regresses. It doubles as the template a Tier-4 HTML scraper follows: record a
 * page, hand-verify the leads, wire the adapter to the snapshot in a `run`
 * thunk, and gate on the score.
 */

export const greenhouseSnapshot = {
  jobs: [
    {
      title: "Senior Backend Engineer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/101",
      location: { name: "Remote - US" },
      company_name: "Acme",
      content: "&lt;p&gt;We build distributed systems in Go and Kubernetes.&lt;/p&gt;",
    },
    {
      title: "Product Designer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/102",
      location: { name: "Berlin" },
      company_name: "Acme",
      content: "&lt;p&gt;Own the design system end to end.&lt;/p&gt;",
    },
    {
      title: "Staff Data Engineer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/103",
      location: { name: "New York" },
      company_name: "Acme",
    },
  ],
};

export const greenhouseExpected: DiscoveredRef[] = [
  {
    sourceId: "greenhouse",
    url: "https://boards.greenhouse.io/acme/jobs/101",
    title: "Senior Backend Engineer",
    companyName: "Acme",
    location: "Remote - US",
    snippet: "We build distributed systems in Go and Kubernetes.",
  },
  {
    sourceId: "greenhouse",
    url: "https://boards.greenhouse.io/acme/jobs/102",
    title: "Product Designer",
    companyName: "Acme",
    location: "Berlin",
    snippet: "Own the design system end to end.",
  },
  {
    sourceId: "greenhouse",
    url: "https://boards.greenhouse.io/acme/jobs/103",
    title: "Staff Data Engineer",
    companyName: "Acme",
    location: "New York",
    // no content → no snippet expected
  },
];
