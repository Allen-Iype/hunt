import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../models/common.js";
import { JobAnalysisSchema, type JobAnalysis } from "../models/job-analysis.js";
import { ProfileSchema, type Profile } from "../models/profile.js";
import { ANALYZER_VERSION } from "../scoring.js";
import { selectCandidateFacts } from "./select.js";

const NOW = "2026-07-07T00:00:00Z";

const profile: Profile = ProfileSchema.parse({
  id: "profile_default",
  schemaVersion: SCHEMA_VERSION,
  basics: { name: "Ada Lovelace" },
  experience: [
    {
      id: "exp_current",
      company: "Acme",
      role: "Senior Backend Engineer",
      startDate: "2022-01-01",
      summary: "Built payment services in Go and Kubernetes",
      achievements: [
        { id: "ach_scale", text: "Scaled the platform to 5m requests/day", skills: ["go"] },
        { id: "ach_css", text: "Refactored the design system in CSS", skills: ["css"] },
      ],
    },
    {
      id: "exp_old",
      company: "OldCo",
      role: "Junior Developer",
      startDate: "2010-01-01",
      endDate: "2012-01-01",
      summary: "Maintained a PHP monolith",
      achievements: [],
    },
  ],
  skills: [
    { id: "skill_go", name: "Go", years: 5 },
    { id: "skill_php", name: "PHP", years: 2 },
  ],
  projects: [
    { id: "proj_k8s", name: "k8s-operator", description: "A Kubernetes operator in Go" },
  ],
  education: [
    { id: "edu_1", institution: "MIT", degree: "BSc", field: "CS", endDate: "2010-06-01" },
  ],
  certifications: [{ id: "cert_cka", name: "CKA", issuer: "CNCF" }],
  updatedAt: NOW,
});

const analysis: JobAnalysis = JobAnalysisSchema.parse({
  id: "ana_1",
  schemaVersion: SCHEMA_VERSION,
  jobId: "job_1",
  profileVersion: NOW,
  analyzerVersion: ANALYZER_VERSION,
  fitScore: 60,
  breakdown: [],
  skills: {
    matched: [{ name: "go", profileSkillId: "skill_go" }],
    missing: ["kubernetes"],
  },
  requirements: [
    { id: "req_1", text: "Experience with Go", kind: "must", category: "technical", skills: ["go"], coverage: 1 },
    { id: "req_2", text: "Kubernetes in production", kind: "must", category: "technical", skills: ["kubernetes"], coverage: 0 },
  ],
  seniority: { value: "senior", source: "import" },
  redFlags: [],
  implicitExpectations: [],
  fieldProvenance: { skills: "deterministic" },
  aiUsed: false,
  createdAt: NOW,
});

describe("selectCandidateFacts", () => {
  it("returns facts spanning every profile section", () => {
    const facts = selectCandidateFacts(profile, analysis, { now: NOW });
    const kinds = new Set(facts.map((f) => f.kind));
    expect(kinds).toEqual(
      new Set(["experience", "achievement", "skill", "project", "education", "certification"]),
    );
  });

  it("is deterministic across runs", () => {
    const a = selectCandidateFacts(profile, analysis, { now: NOW });
    const b = selectCandidateFacts(profile, analysis, { now: NOW });
    expect(a).toEqual(b);
  });

  it("ranks Go/Kubernetes facts above unrelated ones", () => {
    const facts = selectCandidateFacts(profile, analysis, { now: NOW });
    const rank = (id: string) => facts.findIndex((f) => f.id === id);
    // The Go achievement and the k8s project should outrank the CSS achievement.
    expect(rank("ach_scale")).toBeLessThan(rank("ach_css"));
    expect(rank("proj_k8s")).toBeLessThan(rank("ach_css"));
  });

  it("prefers a current role over an old one at equal skill relevance", () => {
    const facts = selectCandidateFacts(profile, analysis, { now: NOW });
    const cur = facts.find((f) => f.id === "exp_current")!;
    const old = facts.find((f) => f.id === "exp_old")!;
    expect(cur.relevance).toBeGreaterThan(old.relevance);
  });

  it("honors the candidate cap, keeping the highest-relevance facts", () => {
    const facts = selectCandidateFacts(profile, analysis, { now: NOW, maxCandidates: 3 });
    expect(facts).toHaveLength(3);
    // Sorted descending — the last kept fact is >= any it could have dropped.
    for (let i = 1; i < facts.length; i++) {
      expect(facts[i - 1]!.relevance).toBeGreaterThanOrEqual(facts[i]!.relevance);
    }
  });

  it("every candidate id is a real profile fact id (citations must resolve)", () => {
    const ids = new Set([
      ...profile.experience.map((e) => e.id),
      ...profile.experience.flatMap((e) => e.achievements.map((a) => a.id)),
      ...profile.skills.map((s) => s.id),
      ...profile.projects.map((p) => p.id),
      ...profile.education.map((e) => e.id),
      ...profile.certifications.map((c) => c.id),
    ]);
    for (const f of selectCandidateFacts(profile, analysis, { now: NOW })) {
      expect(ids.has(f.id)).toBe(true);
    }
  });
});
