import { describe, expect, it } from "vitest";
import { ProfileSchema } from "./profile.js";
import { SCHEMA_VERSION } from "./common.js";

const validProfile = {
  id: "profile_default",
  schemaVersion: SCHEMA_VERSION,
  basics: {
    name: "Gokul P S",
    email: "gokul@example.com",
    links: [{ label: "GitHub", url: "https://github.com/example" }],
  },
  experience: [
    {
      id: "exp_01",
      company: "Acme Corp",
      role: "Software Engineer",
      startDate: "2021-03-01",
      achievements: [
        {
          id: "ach_01",
          text: "Reduced API p99 latency from 800ms to 120ms",
          skills: ["performance", "node.js"],
        },
      ],
    },
  ],
  skills: [
    {
      id: "skill_ts",
      name: "TypeScript",
      level: "expert",
      years: 5,
      evidenceFactIds: ["exp_01"],
    },
  ],
  updatedAt: "2026-07-01T10:00:00Z",
};

describe("ProfileSchema", () => {
  it("accepts a valid profile and applies defaults", () => {
    const parsed = ProfileSchema.parse(validProfile);
    expect(parsed.basics.name).toBe("Gokul P S");
    // Collections not provided default to empty — facts are optional, shape is not.
    expect(parsed.projects).toEqual([]);
    expect(parsed.education).toEqual([]);
    // User-authored facts default to verified (SDD §11).
    expect(parsed.experience[0]?.verified).toBe(true);
    expect(parsed.experience[0]?.achievements[0]?.verified).toBe(true);
  });

  it("preserves an explicit unverified flag (AI-imported facts)", () => {
    const withUnverified = {
      ...validProfile,
      experience: [{ ...validProfile.experience[0], verified: false }],
    };
    const parsed = ProfileSchema.parse(withUnverified);
    expect(parsed.experience[0]?.verified).toBe(false);
  });

  it("rejects an invalid email", () => {
    const bad = {
      ...validProfile,
      basics: { ...validProfile.basics, email: "not-an-email" },
    };
    expect(ProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid link URL", () => {
    const bad = {
      ...validProfile,
      basics: {
        ...validProfile.basics,
        links: [{ label: "x", url: "not a url" }],
      },
    };
    expect(ProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an experience entry without a start date", () => {
    const bad = {
      ...validProfile,
      experience: [{ id: "e", company: "c", role: "r" }],
    };
    expect(ProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-date startDate", () => {
    const bad = {
      ...validProfile,
      experience: [
        { ...validProfile.experience[0], startDate: "March 2021" },
      ],
    };
    expect(ProfileSchema.safeParse(bad).success).toBe(false);
  });
});
