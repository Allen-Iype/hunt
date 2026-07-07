import { describe, expect, it } from "vitest";
import {
  ProfileSchema,
  SCHEMA_VERSION,
  type ComposeResumePort,
  type DocumentRepository,
  type GeneratedDocument,
  type Job,
  type JobAnalysis,
  type JobAnalysisRepository,
  type JobRepository,
  type Profile,
  type ProfileRepository,
  type RenderOutput,
  type RenderPort,
  type ResumeDraft,
} from "@hunt/core";
import { createGenerateResume } from "./generate-resume.js";

/** Inline fake renderer — capabilities depend on the RenderPort, never on an adapter. */
const fakeRender: RenderPort = {
  renderResume: (doc): RenderOutput => ({
    contentType: "text/html",
    content: `<html>${doc.summary.text}${doc.sections.flatMap((s) => s.bullets.map((b) => b.text)).join("")}</html>`,
    extension: "html",
  }),
  renderCoverLetter: (): RenderOutput => ({ contentType: "text/html", content: "", extension: "html" }),
};

const NOW = "2026-07-07T12:00:00Z";

const profile: Profile = ProfileSchema.parse({
  id: "profile_default",
  schemaVersion: SCHEMA_VERSION,
  basics: { name: "Ada Lovelace", email: "ada@example.com" },
  experience: [
    {
      id: "exp_acme",
      company: "Acme",
      role: "Senior Engineer",
      startDate: "2020-01-01",
      summary: "Built payment services in Go",
      achievements: [{ id: "ach_scale", text: "Scaled to 5m requests/day", skills: ["go"] }],
    },
  ],
  skills: [{ id: "skill_go", name: "Go", years: 6 }],
  updatedAt: "2026-07-07T10:00:00Z",
});

const job: Job = {
  id: "job_x",
  schemaVersion: SCHEMA_VERSION,
  title: "Backend Engineer",
  companyName: "Initech",
  locations: ["Remote"],
  workplaceType: "remote",
  employmentType: "full_time",
  seniority: "senior",
  descriptionText: "Build distributed systems in Go.",
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
};

const analysis: JobAnalysis = {
  id: "ana_1",
  schemaVersion: SCHEMA_VERSION,
  jobId: "job_x",
  profileVersion: profile.updatedAt,
  analyzerVersion: 1,
  fitScore: 80,
  breakdown: [],
  skills: { matched: [{ name: "go", profileSkillId: "skill_go" }], missing: ["kubernetes"] },
  requirements: [
    { id: "req_1", text: "Go experience", kind: "must", category: "technical", skills: ["go"], coverage: 1 },
  ],
  seniority: { value: "senior", source: "import" },
  redFlags: [],
  implicitExpectations: [],
  fieldProvenance: { skills: "deterministic" },
  aiUsed: false,
  createdAt: NOW,
};

function fakeDeps(composer?: ComposeResumePort) {
  const saved: GeneratedDocument[] = [];
  const jobs: JobRepository = {
    save: () => {},
    getById: (id) => (id === job.id ? job : null),
    findByDedupHash: () => null,
    list: () => [job],
  };
  const profiles: ProfileRepository = {
    save: () => {},
    get: (id) => (id === "profile_default" ? profile : null),
  };
  const analyses: JobAnalysisRepository = {
    save: () => {},
    getById: () => null,
    getLatestForJob: (jobId) => (jobId === job.id ? analysis : null),
    listForJob: () => [analysis],
  };
  const documents: DocumentRepository = {
    save: (d) => {
      saved.push(d);
    },
    getById: (id) => saved.find((d) => d.id === id) ?? null,
    listForJob: () => saved,
    getLatestForJob: () => saved[saved.length - 1] ?? null,
  };
  const render: RenderPort = fakeRender;
  return {
    saved,
    deps: { jobs, profiles, analyses, documents, render, ...(composer ? { composer } : {}) },
  };
}

/** A composer that returns a fixed draft, recording the feedback it was given. */
function scriptedComposer(drafts: ResumeDraft[]): ComposeResumePort & { feedback: (string | undefined)[] } {
  const feedback: (string | undefined)[] = [];
  let call = 0;
  return {
    feedback,
    async composeResume(input) {
      feedback.push(input.repairFeedback);
      const draft = drafts[Math.min(call, drafts.length - 1)]!;
      call++;
      return { ok: true, draft, providerId: "test:model", taskVersion: 1 };
    },
  };
}

const groundedDraft: ResumeDraft = {
  summary: { text: "Backend engineer with Go experience", sourceFactIds: ["exp_acme"] },
  sections: [
    {
      heading: "Experience",
      bullets: [{ text: "Scaled systems to 5m requests/day", sourceFactIds: ["ach_scale"] }],
    },
  ],
};

describe("GenerateResume", () => {
  it("produces a grounded draft document and renders HTML", async () => {
    const { deps, saved } = fakeDeps(scriptedComposer([groundedDraft]));
    const result = await createGenerateResume(deps)({ jobId: "job_x", now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.status).toBe("draft"); // never sendable without review
    expect(result.document.generationMeta.repairRounds).toBe(0);
    expect(result.render.content).toContain("Scaled systems to 5m requests/day");
    expect(saved).toHaveLength(1);
  });

  it("fails without an AI provider (composition needs a model)", async () => {
    const { deps } = fakeDeps(undefined);
    const result = await createGenerateResume(deps)({ jobId: "job_x", now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("ai");
  });

  it("requires an analysis first", async () => {
    const { deps } = fakeDeps(scriptedComposer([groundedDraft]));
    deps.analyses.getLatestForJob = () => null;
    const result = await createGenerateResume(deps)({ jobId: "job_x", now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("input");
    expect(result.hint).toContain("hunt analyze");
  });

  it("rejects a fabricated draft that never grounds, persisting nothing (invariant)", async () => {
    const hostile: ResumeDraft = {
      summary: { text: "10x engineer", sourceFactIds: ["exp_acme"] },
      sections: [
        {
          heading: "Experience",
          // Cites a real fact but claims a metric it doesn't contain.
          bullets: [{ text: "Scaled to 500m requests/day", sourceFactIds: ["ach_scale"] }],
        },
      ],
    };
    const { deps, saved } = fakeDeps(scriptedComposer([hostile]));
    const result = await createGenerateResume(deps)({ jobId: "job_x", now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("grounding");
    expect(result.violations?.some((v) => v.message.includes("500"))).toBe(true);
    expect(saved).toHaveLength(0); // nothing sendable produced
  });

  it("recovers via the bounded repair loop when a later attempt grounds", async () => {
    const bad: ResumeDraft = {
      summary: { text: "Backend engineer", sourceFactIds: ["exp_acme"] },
      sections: [
        { heading: "Experience", bullets: [{ text: "Ran Kubernetes clusters", sourceFactIds: ["ach_scale"] }] },
      ],
    };
    const composer = scriptedComposer([bad, groundedDraft]);
    const { deps, saved } = fakeDeps(composer);
    const result = await createGenerateResume(deps)({ jobId: "job_x", now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.generationMeta.repairRounds).toBe(1);
    // The repaired attempt received the violation feedback naming the ungrounded skill.
    expect(composer.feedback[1]).toContain("kubernetes");
    expect(saved).toHaveLength(1);
  });

  it("gives a deterministic document id for the same (job, analysis)", async () => {
    const r1 = await createGenerateResume(fakeDeps(scriptedComposer([groundedDraft])).deps)({
      jobId: "job_x",
      now: NOW,
    });
    const r2 = await createGenerateResume(fakeDeps(scriptedComposer([groundedDraft])).deps)({
      jobId: "job_x",
      now: NOW,
    });
    expect(r1.ok && r2.ok && r1.document.id === r2.document.id).toBe(true);
  });
});
