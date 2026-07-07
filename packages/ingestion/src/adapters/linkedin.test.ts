import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchError } from "../fetch.js";
import { loadFixture } from "../testing/helpers.js";
import { linkedinAdapter } from "./linkedin.js";
import { genericUrlAdapter } from "./generic-url.js";
import { resolveAdapter } from "../registry.js";

afterEach(() => vi.unstubAllGlobals());

describe("linkedin adapter", () => {
  it("claims LinkedIn job URLs and nothing else", () => {
    expect(linkedinAdapter.matchesUrl("https://www.linkedin.com/jobs/view/4012345678")).toBe(true);
    expect(linkedinAdapter.matchesUrl("https://de.linkedin.com/jobs/view/4012345678")).toBe(true);
    expect(linkedinAdapter.matchesUrl("https://www.linkedin.com/in/somebody")).toBe(false);
    expect(linkedinAdapter.matchesUrl("https://jobs.example.com/123")).toBe(false);
  });

  it("DOM tier extracts a public page without JSON-LD", () => {
    const result = linkedinAdapter.domExtract!(loadFixture("linkedin-dom.html"));
    expect(result).not.toBeNull();
    expect(result!.draft).toMatchObject({
      title: "Frontend Engineer",
      companyName: "Widgets GmbH",
      locations: ["Munich, Bavaria, Germany"],
    });
    expect(result!.descriptionText).toContain("3+ years of React experience");
  });

  it("DOM tier returns null on unknown markup (falls through to AI)", () => {
    expect(linkedinAdapter.domExtract!("<html><body><h1>Other</h1></body></html>")).toBeNull();
  });

  it("detects the auth wall at fetch time and points to the paste path", async () => {
    vi.stubGlobal("fetch", async () => new Response(loadFixture("linkedin-authwall.html")));
    await expect(
      linkedinAdapter.fetchUrl("https://www.linkedin.com/jobs/view/1"),
    ).rejects.toThrow(/login wall/);
    await expect(
      linkedinAdapter.fetchUrl("https://www.linkedin.com/jobs/view/1"),
    ).rejects.toMatchObject({ hint: expect.stringContaining("hunt import -") });
  });

  it("maps HTTP failures to FetchError with a hint", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 403 }));
    await expect(
      linkedinAdapter.fetchUrl("https://www.linkedin.com/jobs/view/1"),
    ).rejects.toThrow(FetchError);
  });
});

describe("registry", () => {
  it("routes LinkedIn URLs to the LinkedIn adapter, other http(s) to generic", () => {
    expect(resolveAdapter("https://www.linkedin.com/jobs/view/1")?.id).toBe("linkedin");
    expect(resolveAdapter("https://boards.greenhouse.io/x/jobs/1")?.id).toBe("generic-url");
    expect(resolveAdapter("ftp://old.example.com")).toBeNull();
  });

  it("generic adapter claims any http(s) URL", () => {
    expect(genericUrlAdapter.matchesUrl("http://example.com/job")).toBe(true);
    expect(genericUrlAdapter.matchesUrl("not a url")).toBe(false);
  });
});
