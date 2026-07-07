import { describe, expect, it } from "vitest";
import { SKILL_DICTIONARY, canonicalizeSkill, skillLookup } from "./dictionary.js";
import { detectSkills, matchSkills } from "./matching.js";
import { ProfileSchema } from "../models/profile.js";
import { SCHEMA_VERSION } from "../models/common.js";

describe("skill dictionary", () => {
  it("has no duplicate names or aliases across entries", () => {
    const seen = new Set<string>();
    for (const entry of SKILL_DICTIONARY) {
      for (const key of [entry.name, ...entry.aliases]) {
        expect(seen.has(key), `duplicate dictionary key: ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("canonicalizes aliases and passes unknown skills through lowercased", () => {
    expect(canonicalizeSkill("K8s")).toBe("kubernetes");
    expect(canonicalizeSkill("Golang")).toBe("go");
    expect(canonicalizeSkill("TS")).toBe("typescript");
    expect(canonicalizeSkill("COBOL")).toBe("cobol");
  });

  it("lookup maps stay consistent with the dictionary", () => {
    const { byName } = skillLookup();
    expect(byName.size).toBe(SKILL_DICTIONARY.length);
  });
});

describe("detectSkills", () => {
  it("detects skills as whole tokens, not substrings", () => {
    expect(detectSkills("We use Go at Google")).toEqual(["go"]);
    expect(detectSkills("Django experience welcome")).toEqual(["django"]);
  });

  it("handles symbol-bearing skills", () => {
    expect(detectSkills("Strong C++ and C# background")).toEqual(["c#", "c++"]);
    expect(detectSkills("Node.js services")).toContain("node.js");
  });

  it("resolves aliases to canonical names", () => {
    expect(detectSkills("k8s clusters and golang tooling")).toEqual(["go", "kubernetes"]);
  });

  it("matches multi-word phrases", () => {
    expect(detectSkills("experience with distributed systems and machine learning")).toEqual([
      "distributed systems",
      "machine learning",
    ]);
  });

  it("returns each skill once, sorted", () => {
    expect(detectSkills("Go, go, GO and golang")).toEqual(["go"]);
  });

  it("finds nothing in unrelated prose", () => {
    expect(detectSkills("We value kindness and communication")).toEqual([]);
  });
});

describe("matchSkills", () => {
  const profile = ProfileSchema.parse({
    id: "profile_default",
    schemaVersion: SCHEMA_VERSION,
    basics: { name: "Ada" },
    skills: [
      { id: "skill_ts", name: "TypeScript" },
      { id: "skill_k8s", name: "K8s" },
    ],
    updatedAt: "2026-07-07T10:00:00Z",
  });

  it("matches through canonicalization on both sides", () => {
    const result = matchSkills(["ts", "kubernetes", "rust"], profile);
    expect(result.matched).toEqual([
      { name: "kubernetes", profileSkillId: "skill_k8s" },
      { name: "typescript", profileSkillId: "skill_ts" },
    ]);
    expect(result.missing).toEqual(["rust"]);
  });

  it("dedupes job skills that canonicalize identically", () => {
    const result = matchSkills(["node", "node.js", "nodejs"], profile);
    expect(result.missing).toEqual(["node.js"]);
  });
});
