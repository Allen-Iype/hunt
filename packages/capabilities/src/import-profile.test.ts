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

  it("re-import of identical YAML is idempotent (deterministic IDs)", () => {
    const { repo } = fakeRepo();
    const importProfile = createImportProfile({ profiles: repo });
    const a = importProfile({ yamlSource: VALID_YAML, now: NOW });
    const b = importProfile({ yamlSource: VALID_YAML, now: NOW });
    expect(a).toEqual(b);
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
});
