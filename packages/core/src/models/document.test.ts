import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "./common.js";
import {
  CoverLetterDocumentSchema,
  GeneratedDocumentSchema,
  ResumeDocumentSchema,
} from "./document.js";

const generationMeta = {
  generatorVersion: 1,
  aiTaskId: "draft-resume",
  aiTaskVersion: 1,
  providerId: "anthropic:claude-sonnet-5",
  candidateFactIds: ["exp_1", "ach_1"],
  repairRounds: 0,
};

const validResume = {
  id: "doc_r1",
  schemaVersion: SCHEMA_VERSION,
  kind: "resume",
  jobId: "job_1",
  analysisId: "ana_1",
  profileVersion: "2026-07-07T00:00:00Z",
  status: "draft",
  generationMeta,
  contact: { name: "Ada Lovelace", email: "ada@example.com" },
  summary: { text: "Backend engineer", sourceFactIds: ["exp_1"] },
  sections: [
    { heading: "Experience", bullets: [{ text: "Built payments", sourceFactIds: ["ach_1"] }] },
  ],
  createdAt: "2026-07-07T00:00:00Z",
};

describe("ResumeDocumentSchema", () => {
  it("accepts a valid resume", () => {
    expect(ResumeDocumentSchema.parse(validResume).kind).toBe("resume");
  });

  it("rejects a bullet with no source fact ids at the expected path (grounding invariant)", () => {
    const bad = {
      ...validResume,
      sections: [{ heading: "Experience", bullets: [{ text: "Built payments", sourceFactIds: [] }] }],
    };
    const result = ResumeDocumentSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["sections", 0, "bullets", 0, "sourceFactIds"]);
    }
  });

  it("rejects a resume with zero sections", () => {
    expect(ResumeDocumentSchema.safeParse({ ...validResume, sections: [] }).success).toBe(false);
  });
});

describe("CoverLetterDocumentSchema", () => {
  const validLetter = {
    id: "doc_c1",
    schemaVersion: SCHEMA_VERSION,
    kind: "cover_letter",
    jobId: "job_1",
    analysisId: "ana_1",
    profileVersion: "2026-07-07T00:00:00Z",
    status: "draft",
    generationMeta: { ...generationMeta, aiTaskId: "draft-cover-letter" },
    companyName: "Acme",
    jobTitle: "Senior Engineer",
    hook: { text: "I admire Acme", sourceFactIds: ["exp_1"] },
    body: [{ text: "I built payments", sourceFactIds: ["ach_1"] }],
    closing: { text: "Thanks", sourceFactIds: ["exp_1"] },
    createdAt: "2026-07-07T00:00:00Z",
  };

  it("accepts a valid cover letter", () => {
    expect(CoverLetterDocumentSchema.parse(validLetter).kind).toBe("cover_letter");
  });

  it("discriminates on kind through the union", () => {
    expect(GeneratedDocumentSchema.parse(validLetter).kind).toBe("cover_letter");
    expect(GeneratedDocumentSchema.parse(validResume).kind).toBe("resume");
  });
});
