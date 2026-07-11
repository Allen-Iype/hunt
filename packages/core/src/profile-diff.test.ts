import { describe, expect, it } from "vitest";
import { diffProfiles } from "./profile-diff.js";
import { resolveProfileInput, type ProfileInput } from "./profile-input.js";
import type { Profile } from "./models/profile.js";

const NOW = "2026-07-12T00:00:00.000Z";

/** Build a Profile from authoring input (deterministic ids), like a real import. */
function profile(input: ProfileInput): Profile {
  const r = resolveProfileInput(input, NOW);
  if (!r.ok) throw new Error(r.reason);
  return r.profile;
}

const base = (): ProfileInput => ({
  basics: { name: "Dana", links: [] },
  experience: [
    {
      company: "Globex",
      role: "Staff Engineer",
      startDate: "2020-02-01",
      achievements: [{ text: "Built a ledger", skills: ["go"], verified: true }],
      verified: true,
    },
  ],
  skills: [{ name: "typescript", evidenceFactIds: [], verified: true }],
  projects: [],
  education: [],
  certifications: [],
});

describe("diffProfiles", () => {
  it("reports a first import as previousExisted:false with everything added", () => {
    const next = profile(base());
    const d = diffProfiles(null, next);
    expect(d.previousExisted).toBe(false);
    // experience + achievement + skill
    expect(d.added).toHaveLength(3);
    expect(d.removed).toHaveLength(0);
  });

  it("reports no changes when re-importing an identical profile", () => {
    const p = profile(base());
    const d = diffProfiles(p, profile(base()));
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.updated).toEqual([]);
    expect(d.newlyConfirmed).toEqual([]);
  });

  it("detects an added fact", () => {
    const prev = profile(base());
    const withSkill = base();
    withSkill.skills.push({ name: "rust", evidenceFactIds: [], verified: true });
    const d = diffProfiles(prev, profile(withSkill));
    expect(d.added.map((f) => f.label)).toContain("skill: rust");
    expect(d.added).toHaveLength(1);
  });

  it("detects a removed fact and names it", () => {
    const prev = profile(base());
    const withoutSkill = base();
    withoutSkill.skills = [];
    const d = diffProfiles(prev, profile(withoutSkill));
    expect(d.removed.map((f) => f.label)).toEqual(["skill: typescript"]);
  });

  it("treats an identity change (role) as remove-old + add-new", () => {
    const prev = profile(base());
    const renamed = base();
    renamed.experience[0]!.role = "Principal Engineer"; // changes the exp id
    const d = diffProfiles(prev, profile(renamed));
    // old experience (and its achievement) removed; new experience (+achievement) added
    expect(d.removed.some((f) => f.label === "Staff Engineer @ Globex")).toBe(true);
    expect(d.added.some((f) => f.label === "Principal Engineer @ Globex")).toBe(true);
  });

  it("flags a non-identity content edit as updated (same id)", () => {
    const prev = profile(base());
    const edited = base();
    // Editing an achievement's text keeps the experience id but changes achievement content...
    // achievement id derives from expId|text, so change skills instead to keep the id stable:
    edited.experience[0]!.achievements[0]!.skills = ["go", "kubernetes"];
    const d = diffProfiles(prev, profile(edited));
    expect(d.updated.map((f) => f.category)).toContain("achievement");
    expect(d.removed).toEqual([]);
    expect(d.added).toEqual([]);
  });

  it("counts a seeded fact kept in the YAML as newly confirmed", () => {
    const seeded = base();
    seeded.skills = [{ name: "typescript", evidenceFactIds: [], verified: false }];
    const prev = profile(seeded);
    // Same content, now verified:true (user confirmed by keeping it).
    const confirmed = base(); // skills default verified:true
    const d = diffProfiles(prev, profile(confirmed));
    expect(d.newlyConfirmed.map((f) => f.label)).toContain("skill: typescript");
    expect(d.removed).toEqual([]);
  });
});
