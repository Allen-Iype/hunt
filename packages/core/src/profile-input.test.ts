import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE_ID,
  ProfileInputSchema,
  resolveProfileInput,
  type ProfileInput,
} from "./profile-input.js";

const NOW = "2026-07-05T12:00:00Z";

const input = (): ProfileInput =>
  ProfileInputSchema.parse({
    basics: { name: "Ada Example" },
    experience: [
      {
        company: "Acme Corp",
        role: "Senior Engineer",
        startDate: "2021-03-01",
        achievements: [{ text: "Cut p99 latency 6x" }],
      },
    ],
    skills: [{ name: "TypeScript", level: "expert" }],
  });

describe("resolveProfileInput", () => {
  it("produces a canonical profile with the default id", () => {
    const result = resolveProfileInput(input(), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.id).toBe(DEFAULT_PROFILE_ID);
      expect(result.profile.updatedAt).toBe(NOW);
    }
  });

  it("assigns deterministic IDs: same input → identical profile", () => {
    const a = resolveProfileInput(input(), NOW);
    const b = resolveProfileInput(input(), NOW);
    expect(a).toEqual(b);
  });

  it("prefixes IDs by fact kind", () => {
    const result = resolveProfileInput(input(), NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.profile.experience[0]!.id).toMatch(/^exp_[0-9a-f]{8}$/);
    expect(result.profile.experience[0]!.achievements[0]!.id).toMatch(/^ach_[0-9a-f]{8}$/);
    expect(result.profile.skills[0]!.id).toMatch(/^skill_[0-9a-f]{8}$/);
  });

  it("preserves explicit IDs", () => {
    const withId = input();
    withId.experience[0]!.id = "exp_custom";
    const result = resolveProfileInput(withId, NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.profile.experience[0]!.id).toBe("exp_custom");
    // Achievement IDs derive from the parent's resolved ID.
    expect(result.profile.experience[0]!.achievements[0]!.id).toMatch(/^ach_[0-9a-f]{8}$/);
  });

  it("disambiguates identical duplicate facts deterministically", () => {
    const doubled = input();
    doubled.experience.push(JSON.parse(JSON.stringify(doubled.experience[0])));
    const result = resolveProfileInput(doubled, NOW);
    if (!result.ok) throw new Error(result.reason);
    const [first, second] = result.profile.experience;
    expect(first!.id).not.toBe(second!.id);
    expect(second!.id).toBe(`${first!.id}_2`);
  });

  it("accepts evidenceFactIds that reference explicit fact IDs", () => {
    const withEvidence = input();
    withEvidence.experience[0]!.id = "exp_acme";
    withEvidence.skills[0]!.evidenceFactIds = ["exp_acme"];
    const result = resolveProfileInput(withEvidence, NOW);
    expect(result.ok).toBe(true);
  });

  it("rejects evidenceFactIds that reference unknown facts", () => {
    const broken = input();
    broken.skills[0]!.evidenceFactIds = ["exp_nonexistent"];
    const result = resolveProfileInput(broken, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("exp_nonexistent");
      expect(result.reason).toContain("TypeScript");
    }
  });

  it("defaults facts to verified (user-authored)", () => {
    const result = resolveProfileInput(input(), NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.profile.experience[0]!.verified).toBe(true);
    expect(result.profile.skills[0]!.verified).toBe(true);
  });
});

describe("ProfileInputSchema", () => {
  it("rejects a profile without a name", () => {
    expect(ProfileInputSchema.safeParse({ basics: {} }).success).toBe(false);
  });

  it("accepts a minimal profile (basics only)", () => {
    const parsed = ProfileInputSchema.parse({ basics: { name: "Ada" } });
    expect(parsed.experience).toEqual([]);
    expect(parsed.skills).toEqual([]);
  });
});
