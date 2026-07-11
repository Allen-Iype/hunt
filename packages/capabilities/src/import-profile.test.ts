import { describe, expect, it } from "vitest";
import type { Id, Profile, ProfileRepository } from "@hunt/core";
import { createImportProfile } from "./import-profile.js";

function fakeRepo(overrides: Partial<ProfileRepository> = {}) {
  const store = new Map<Id, Profile>();
  const repo: ProfileRepository = {
    save: (p) => void store.set(p.id, p),
    get: (id) => store.get(id) ?? null,
    ...overrides,
  };
  return { repo, store };
}

const NOW = "2026-07-05T12:00:00Z";

const VALID_YAML = `
basics:
  name: Ada Example
  email: ada@example.com
experience:
  - company: Acme Corp
    role: Senior Engineer
    startDate: "2021-03-01"
    achievements:
      - text: Cut p99 latency 6x
skills:
  - name: TypeScript
    level: expert
`;

describe("ImportProfile", () => {
  it("imports a valid profile and persists it", () => {
    const { repo, store } = fakeRepo();
    const result = createImportProfile({ profiles: repo })({ yamlSource: VALID_YAML, now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toEqual({
        experience: 1,
        achievements: 1,
        skills: 1,
        projects: 0,
        education: 0,
        certifications: 0,
      });
      expect(store.get(result.profile.id)).toEqual(result.profile);
    }
  });

  it("re-import of identical YAML saves an identical profile (deterministic IDs)", () => {
    const { repo } = fakeRepo();
    const importProfile = createImportProfile({ profiles: repo });
    const a = importProfile({ yamlSource: VALID_YAML, now: NOW });
    const b = importProfile({ yamlSource: VALID_YAML, now: NOW });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // The saved profile is identical...
    expect(a.profile).toEqual(b.profile);
    // ...but the delta differs: first is a new profile, second is an unchanged re-import.
    expect(a.delta.previousExisted).toBe(false);
    expect(b.delta.previousExisted).toBe(true);
    expect(b.delta.added).toEqual([]);
    expect(b.delta.removed).toEqual([]);
  });

  it("reports YAML syntax errors at the parse stage", () => {
    const { repo } = fakeRepo();
    const result = createImportProfile({ profiles: repo })({
      yamlSource: "basics: [unclosed",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, stage: "parse" });
  });

  it("reports schema violations at the validate stage, naming the field", () => {
    const { repo } = fakeRepo();
    const result = createImportProfile({ profiles: repo })({
      yamlSource: `basics:\n  name: Ada\n  email: not-an-email`,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, stage: "validate" });
    if (!result.ok) expect(result.message).toContain("email");
  });

  it("reports unknown evidence references at the resolve stage", () => {
    const { repo } = fakeRepo();
    const yaml = `${VALID_YAML}    evidenceFactIds: [exp_nope]\n`;
    const result = createImportProfile({ profiles: repo })({ yamlSource: yaml, now: NOW });
    expect(result).toMatchObject({ ok: false, stage: "resolve" });
    if (!result.ok) expect(result.message).toContain("exp_nope");
  });

  it("reports repository failures at the storage stage", () => {
    const { repo } = fakeRepo({
      save: () => {
        throw new Error("disk full");
      },
    });
    const result = createImportProfile({ profiles: repo })({ yamlSource: VALID_YAML, now: NOW });
    expect(result).toMatchObject({ ok: false, stage: "storage", message: "disk full" });
  });

  // --- M7: augment (re-import) behavior ---

  const YAML_TWO_SKILLS = `
basics:
  name: Ada Example
skills:
  - name: TypeScript
  - name: Rust
`;
  const YAML_ONE_SKILL = `
basics:
  name: Ada Example
skills:
  - name: TypeScript
`;

  it("adds a new fact on re-import and reports it in the delta", () => {
    const { repo } = fakeRepo();
    const importProfile = createImportProfile({ profiles: repo });
    importProfile({ yamlSource: YAML_ONE_SKILL, now: NOW });
    const result = importProfile({ yamlSource: YAML_TWO_SKILLS, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delta.added.map((f) => f.label)).toEqual(["skill: Rust"]);
    expect(result.profile.skills.map((s) => s.name)).toEqual(["TypeScript", "Rust"]);
  });

  it("refuses to delete a fact absent from the re-imported YAML, and does not save", () => {
    const { repo, store } = fakeRepo();
    const importProfile = createImportProfile({ profiles: repo });
    importProfile({ yamlSource: YAML_TWO_SKILLS, now: NOW });
    const before = store.get("profile_default");
    const result = importProfile({ yamlSource: YAML_ONE_SKILL, now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("removals");
    if (result.stage !== "removals") return;
    expect(result.removed.map((f) => f.label)).toEqual(["skill: Rust"]);
    expect(result.message).toContain("--allow-removals");
    // The stored profile is untouched — the removal was refused before save.
    expect(store.get("profile_default")).toEqual(before);
  });

  it("deletes the absent fact when allowRemovals is set", () => {
    const { repo } = fakeRepo();
    const importProfile = createImportProfile({ profiles: repo });
    importProfile({ yamlSource: YAML_TWO_SKILLS, now: NOW });
    const result = importProfile({ yamlSource: YAML_ONE_SKILL, now: NOW, allowRemovals: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delta.removed.map((f) => f.label)).toEqual(["skill: Rust"]);
    expect(result.profile.skills.map((s) => s.name)).toEqual(["TypeScript"]);
  });

  it("promotes a seeded (verified:false) fact to newly-confirmed when kept in the YAML", () => {
    const { repo } = fakeRepo();
    const importProfile = createImportProfile({ profiles: repo });
    // First import: an AI-seeded, unverified skill.
    importProfile({
      yamlSource: `basics:\n  name: Ada\nskills:\n  - name: TypeScript\n    verified: false\n`,
      now: NOW,
    });
    // Re-import the same skill without the flag → verified defaults to true.
    const result = importProfile({
      yamlSource: `basics:\n  name: Ada\nskills:\n  - name: TypeScript\n`,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delta.newlyConfirmed.map((f) => f.label)).toEqual(["skill: TypeScript"]);
    expect(result.profile.skills[0]?.verified).toBe(true);
  });
});
