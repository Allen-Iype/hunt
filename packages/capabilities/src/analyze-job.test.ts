import { describe, expect, it } from "vitest";
import {
  ProfileSchema,
  SCHEMA_VERSION,
  type Job,
  type JobAnalysis,
  type JobAnalysisRepository,
  type JobInsightsPort,
  type JobRepository,
  type Profile,
  type ProfileRepository,
} from "@hunt/core";
import { createAnalyzeJob } from "./analyze-job.js";

const NOW = "2026-07-07T12:00:00Z";

const profile: Profile = ProfileSchema.parse({
  id: "profile_default",
  schemaVersion: SCHEMA_VERSION,
  basics: { name: "Ada" },
  experience: [{ id: "e1", company: "Acme", role: "Engineer", startDate: "2019-01-01" }],
  skills: [
    { id: "skill_ts", name: "TypeScript" },
    { id: "skill_go", name: "Go" },
  ],
  updatedAt: "2026-07-07T10:00:00Z",
});

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_x",
    schemaVersion: SCHEMA_VERSION,
    title: "Senior Backend Engineer",
    companyName: "Initech",
    locations: ["Berlin"],
    workplaceType: "hybrid",
    employmentType: "full_time",
    seniority: "senior",
    compensation: { raw: "EUR 85000-105000 per year" },
    descriptionText: "Design and run distributed systems in Go. Kubernetes required. TypeScript tooling.",
    requirements: [],
    responsibilities: [],
    skills: [],
    dedupHash: "h1",
    provenance: {
      sourceId: "paste",
      adapterVersion: "0.1.0",
      inputRef: "paste:stdin",
      envelopeHash: "e".repeat(64),
      extractionTier: "structured",
      fetchedAt: NOW,
      normalizedAt: NOW,
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function deps(job: Job, insights?: JobInsightsPort) {
  const analyses = new Map<string, JobAnalysis>();
  const jobsRepo: JobRepository = {
    save: () => {},
    getById: (id) => (id === job.id ? job : null),
    findByDedupHash: () => null,
    list: () => [job],
  };
  const profilesRepo: ProfileRepository = {
    save: () => {},
    get: (id) => (id === "profile_default" ? profile : null),
  };
  const analysesRepo: JobAnalysisRepository = {
    save: (a) => void analyses.set(a.id, a),
    getById: (id) => analyses.get(id) ?? null,
    getLatestForJob: () => null,
    listForJob: () => [...analyses.values()],
  };
  return { jobsRepo, profilesRepo, analysesRepo, analyses, insights };
}

describe("AnalyzeJob — deterministic pass (no AI)", () => {
  it("matches skills from the description, parses compensation, scores, persists", async () => {
    const d = deps(makeJob());
    const analyze = createAnalyzeJob({ jobs: d.jobsRepo, profiles: d.profilesRepo, analyses: d.analysesRepo });
    const result = await analyze({ jobId: "job_x", now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.analysis;
    expect(a.aiUsed).toBe(false);
    expect(result.aiNote).toContain("no AI provider configured");
    expect(a.skills.matched.map((m) => m.name)).toEqual(["go", "typescript"]);
    expect(a.skills.missing).toEqual(["distributed systems", "kubernetes"]);
    expect(a.compensation).toMatchObject({ min: 85000, max: 105000, currency: "EUR", period: "year" });
    expect(a.seniority).toEqual({ value: "senior", source: "import" });
    expect(a.fitScore).toBeGreaterThan(0);
    expect(a.fitScore).toBeLessThanOrEqual(100);
    expect(a.fieldProvenance.skills).toBe("deterministic");
    expect(d.analyses.size).toBe(1);
  });

  it("is deterministic: same inputs → identical analysis (incl. id)", async () => {
    const d = deps(makeJob());
    const analyze = createAnalyzeJob({ jobs: d.jobsRepo, profiles: d.profilesRepo, analyses: d.analysesRepo });
    const a = await analyze({ jobId: "job_x", now: NOW });
    const b = await analyze({ jobId: "job_x", now: NOW });
    expect(a).toEqual(b);
    expect(d.analyses.size).toBe(1); // deterministic id → refreshed, not duplicated
  });

  it("fails helpfully without a job or profile", async () => {
    const d = deps(makeJob());
    const analyze = createAnalyzeJob({ jobs: d.jobsRepo, profiles: d.profilesRepo, analyses: d.analysesRepo });
    expect(await analyze({ jobId: "job_missing", now: NOW })).toMatchObject({
      ok: false,
      stage: "input",
      hint: expect.stringContaining("hunt import"),
    });

    const noProfile = createAnalyzeJob({
      jobs: d.jobsRepo,
      profiles: { save: () => {}, get: () => null },
      analyses: d.analysesRepo,
    });
    expect(await noProfile({ jobId: "job_x", now: NOW })).toMatchObject({
      ok: false,
      stage: "input",
      hint: expect.stringContaining("hunt profile import"),
    });
  });
});

describe("AnalyzeJob — merge rules (pass C)", () => {
  const aiInsights: JobInsightsPort = {
    async getJobInsights() {
      return {
        ok: true,
        insights: {
          requirements: [
            { text: "Kubernetes required", kind: "must", category: "technical" },
            { text: "TypeScript tooling", kind: "nice", category: "technical" },
          ],
          seniority: "staff",
          redFlags: ["vague scope"],
          implicitExpectations: ["on-call"],
          gapNarrative: "Missing kubernetes; strong on go and typescript.",
        },
      };
    },
  };

  it("uses AI requirements when import produced none; computes coverage", async () => {
    const d = deps(makeJob(), aiInsights);
    const analyze = createAnalyzeJob({
      jobs: d.jobsRepo,
      profiles: d.profilesRepo,
      analyses: d.analysesRepo,
      insights: aiInsights,
    });
    const result = await analyze({ jobId: "job_x", now: NOW });
    if (!result.ok) throw new Error("expected success");
    const a = result.analysis;
    expect(a.aiUsed).toBe(true);
    expect(a.fieldProvenance.requirements).toBe("ai");
    const k8s = a.requirements.find((r) => r.text.includes("Kubernetes"))!;
    expect(k8s.coverage).toBe(0); // kubernetes not in profile
    const ts = a.requirements.find((r) => r.text.includes("TypeScript"))!;
    expect(ts.coverage).toBe(1);
    expect(a.redFlags).toEqual(["vague scope"]);
    expect(a.gapNarrative).toContain("kubernetes");
  });

  it("prefers import-time requirements over AI classification", async () => {
    const job = makeJob({
      requirements: [{ id: "req_1", text: "5+ years Go experience", kind: "must" }],
    });
    const d = deps(job, aiInsights);
    const analyze = createAnalyzeJob({
      jobs: d.jobsRepo,
      profiles: d.profilesRepo,
      analyses: d.analysesRepo,
      insights: aiInsights,
    });
    const result = await analyze({ jobId: "job_x", now: NOW });
    if (!result.ok) throw new Error("expected success");
    expect(result.analysis.fieldProvenance.requirements).toBe("import");
    expect(result.analysis.requirements).toHaveLength(1);
    expect(result.analysis.requirements[0]!.coverage).toBe(1); // go is in profile
  });

  it("posting-stated seniority beats AI inference; AI fills when unspecified", async () => {
    const stated = deps(makeJob({ seniority: "senior" }), aiInsights);
    const analyzeStated = createAnalyzeJob({
      jobs: stated.jobsRepo,
      profiles: stated.profilesRepo,
      analyses: stated.analysesRepo,
      insights: aiInsights,
    });
    const statedResult = await analyzeStated({ jobId: "job_x", now: NOW });
    if (!statedResult.ok) throw new Error("expected success");
    expect(statedResult.analysis.seniority).toEqual({ value: "senior", source: "import" });

    const unspecified = deps(makeJob({ seniority: "unspecified" }), aiInsights);
    const analyzeUnspecified = createAnalyzeJob({
      jobs: unspecified.jobsRepo,
      profiles: unspecified.profilesRepo,
      analyses: unspecified.analysesRepo,
      insights: aiInsights,
    });
    const aiResult = await analyzeUnspecified({ jobId: "job_x", now: NOW });
    if (!aiResult.ok) throw new Error("expected success");
    expect(aiResult.analysis.seniority).toEqual({ value: "staff", source: "ai" });
  });

  it("degrades to deterministic-only when the AI pass fails, with a note", async () => {
    const failing: JobInsightsPort = {
      async getJobInsights() {
        return { ok: false, kind: "provider", message: "quota exceeded" };
      },
    };
    const d = deps(makeJob(), failing);
    const analyze = createAnalyzeJob({
      jobs: d.jobsRepo,
      profiles: d.profilesRepo,
      analyses: d.analysesRepo,
      insights: failing,
    });
    const result = await analyze({ jobId: "job_x", now: NOW });
    if (!result.ok) throw new Error("expected success");
    expect(result.analysis.aiUsed).toBe(false);
    expect(result.analysis.fitScore).toBeGreaterThan(0);
    expect(result.aiNote).toContain("quota exceeded");
  });
});
