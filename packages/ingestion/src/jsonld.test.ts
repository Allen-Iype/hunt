import { describe, expect, it } from "vitest";
import { extractJobPostingJsonLd, normalizeDate } from "./jsonld.js";
import { htmlToText, looksLikeHtml } from "./html.js";
import { loadFixture } from "./testing/helpers.js";

describe("extractJobPostingJsonLd", () => {
  it("extracts a Greenhouse-shaped posting: fields, salary, date, location", () => {
    const result = extractJobPostingJsonLd(loadFixture("greenhouse.html"));
    expect(result).not.toBeNull();
    expect(result!.draft).toMatchObject({
      title: "Senior Backend Engineer",
      companyName: "Initech",
      locations: ["Berlin, DE"],
      employmentType: "full_time",
      compensationRaw: "EUR 85000-105000 per year",
      postedAt: "2026-06-28T00:00:00Z",
    });
    expect(result!.descriptionText).toContain("distributed systems in Go");
    expect(result!.descriptionText).not.toContain("<ul>");
  });

  it("extracts from an @graph array and maps TELECOMMUTE to remote", () => {
    const result = extractJobPostingJsonLd(loadFixture("lever.html"));
    expect(result).not.toBeNull();
    expect(result!.draft).toMatchObject({
      title: "Staff Platform Engineer",
      companyName: "Hooli",
      workplaceType: "remote",
      postedAt: "2026-07-01T09:30:00+02:00",
    });
  });

  it("extracts a LinkedIn-shaped posting", () => {
    const result = extractJobPostingJsonLd(loadFixture("linkedin-jsonld.html"));
    expect(result).not.toBeNull();
    expect(result!.draft.companyName).toBe("Acme Corp");
    expect(result!.draft.locations).toEqual(["Berlin, BE, Germany"]);
  });

  it("returns null when no JobPosting JSON-LD exists", () => {
    expect(extractJobPostingJsonLd(loadFixture("linkedin-dom.html"))).toBeNull();
    expect(extractJobPostingJsonLd("<html><body>plain page</body></html>")).toBeNull();
  });

  it("skips malformed JSON-LD blocks without failing", () => {
    const html = `<script type="application/ld+json">{broken</script>
      <script type="application/ld+json">{"@type":"JobPosting","title":"T","hiringOrganization":{"name":"C"},"description":"<p>d</p>"}</script>`;
    const result = extractJobPostingJsonLd(html);
    expect(result?.draft.title).toBe("T");
  });
});

describe("normalizeDate", () => {
  it("expands date-only to UTC midnight and passes timestamps through", () => {
    expect(normalizeDate("2026-06-28")).toBe("2026-06-28T00:00:00Z");
    expect(normalizeDate("2026-07-01T09:30:00+02:00")).toBe("2026-07-01T09:30:00+02:00");
    expect(normalizeDate(undefined)).toBeUndefined();
  });
});

describe("html helpers", () => {
  it("htmlToText strips tags, keeps structure, drops scripts", () => {
    const text = htmlToText("<div><p>One</p><script>evil()</script><ul><li>Two</li></ul></div>");
    expect(text).toContain("One");
    expect(text).toContain("Two");
    expect(text).not.toContain("evil");
  });

  it("looksLikeHtml distinguishes markup from prose", () => {
    expect(looksLikeHtml("<html><body>x</body></html>")).toBe(true);
    expect(looksLikeHtml("Platform Engineer — hire me, 5 < 6 years")).toBe(false);
  });
});
