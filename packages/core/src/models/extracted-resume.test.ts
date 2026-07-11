import { describe, expect, it } from "vitest";
import { ExtractedResumeDraftSchema } from "./extracted-resume.js";

const validDraft = {
  basics: { name: "Gokul P S", email: "gokul@example.com" },
  experience: [
    {
      company: "Acme Corp",
      role: "Software Engineer",
      startDate: "2021-03",
      achievements: [{ text: "Cut p99 latency 800ms → 120ms", skills: ["performance"] }],
    },
  ],
  skills: [{ name: "typescript", level: "expert" }],
};

describe("ExtractedResumeDraftSchema", () => {
  it("accepts a draft and defaults missing collections to empty", () => {
    const parsed = ExtractedResumeDraftSchema.parse(validDraft);
    expect(parsed.basics.name).toBe("Gokul P S");
    expect(parsed.projects).toEqual([]);
    expect(parsed.education).toEqual([]);
    expect(parsed.certifications).toEqual([]);
    expect(parsed.experience[0]?.achievements[0]?.skills).toEqual(["performance"]);
  });

  it("carries NO id, timestamp, or verified field (extraction never asserts trust)", () => {
    const parsed = ExtractedResumeDraftSchema.parse(validDraft);
    expect(parsed.experience[0]).not.toHaveProperty("id");
    expect(parsed.experience[0]).not.toHaveProperty("verified");
    expect(parsed.skills[0]).not.toHaveProperty("id");
    expect(parsed.skills[0]).not.toHaveProperty("verified");
  });

  it("requires a candidate name", () => {
    const bad = { ...validDraft, basics: { email: "x@example.com" } };
    expect(ExtractedResumeDraftSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid email in basics", () => {
    const bad = { ...validDraft, basics: { name: "X", email: "not-an-email" } };
    expect(ExtractedResumeDraftSchema.safeParse(bad).success).toBe(false);
  });

  it("requires company and role on each experience entry", () => {
    const bad = { ...validDraft, experience: [{ startDate: "2021" }] };
    expect(ExtractedResumeDraftSchema.safeParse(bad).success).toBe(false);
  });

  it("keeps resume date strings as written (no ISO-date coercion)", () => {
    // Resumes often state only a year or month; extraction must not fabricate precision.
    const parsed = ExtractedResumeDraftSchema.parse({
      ...validDraft,
      experience: [{ company: "C", role: "R", startDate: "2019", endDate: "Present" }],
    });
    expect(parsed.experience[0]?.startDate).toBe("2019");
    expect(parsed.experience[0]?.endDate).toBe("Present");
  });
});
