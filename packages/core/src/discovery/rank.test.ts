import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../models/common.js";
import { ProfileSchema, type Profile } from "../models/profile.js";
import type { SavedSearch } from "../models/saved-search.js";
import { rankOpportunity } from "./rank.js";

const NOW = "2026-07-11T10:00:00Z";

function search(overrides: Partial<SavedSearch["query"]> = {}): SavedSearch {
  return {
    id: "search_1",
    name: "backend",
    query: { roles: [], skills: [], locations: [], ...overrides },
    sources: [{ adapterId: "greenhouse", board: "acme" }],
    createdAt: NOW,
  };
}

function profile(skills: string[]): Profile {
  return ProfileSchema.parse({
    id: "profile_default",
    schemaVersion: SCHEMA_VERSION,
    basics: { name: "Dev" },
    skills: skills.map((name) => ({ id: `sk_${name}`, name })),
    updatedAt: NOW,
  });
}

describe("rankOpportunity", () => {
  it("is deterministic for identical inputs", () => {
    const lead = { title: "Senior Go Engineer", snippet: "Kubernetes, Go", location: "Remote" };
    const s = search({ skills: ["go", "kubernetes"] });
    expect(rankOpportunity(lead, s)).toBe(rankOpportunity(lead, s));
  });

  it("ranks a skill-matching lead above a non-matching one (intent alone, no profile)", () => {
    const s = search({ skills: ["go", "kubernetes"], roles: ["engineer"] });
    const match = rankOpportunity({ title: "Go Engineer", snippet: "Kubernetes" }, s);
    const noMatch = rankOpportunity({ title: "Sales Manager", snippet: "quotas" }, s);
    expect(match).toBeGreaterThan(noMatch);
  });

  it("works with NO profile — discovery is profile-optional (ADR-0015)", () => {
    const s = search({ skills: ["rust"] });
    const score = rankOpportunity({ title: "Rust Engineer", snippet: "systems in Rust" }, s);
    expect(score).toBeGreaterThan(0);
  });

  it("uses the profile as an enrichment signal when present", () => {
    const s = search({ roles: ["engineer"] }); // no intent skills → profile does the lifting
    const lead = { title: "Backend Engineer", snippet: "we use Go and Kubernetes" };
    const withProfile = rankOpportunity(lead, s, profile(["go", "kubernetes"]));
    const withoutProfile = rankOpportunity(lead, s);
    expect(withProfile).toBeGreaterThan(withoutProfile);
  });

  it("returns a value within [0,1]", () => {
    const s = search({ skills: ["go"], roles: ["go engineer"], locations: ["remote"] });
    const score = rankOpportunity({ title: "Go Engineer", snippet: "Go", location: "Remote" }, s, profile(["go"]));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
