import { describe, expect, it } from "vitest";
import { JobSchema, type Job } from "./job.js";
import { SCHEMA_VERSION } from "./common.js";

const validJob: Job = {
  id: "job_01",
  schemaVersion: SCHEMA_VERSION,
  title: "Senior Software Engineer",
  companyName: "Acme Corp",
  locations: ["Berlin, Germany"],
  workplaceType: "hybrid",
  employmentType: "full_time",
  seniority: "senior",
  compensation: {
    raw: "€90,000 – €110,000 per year",
    min: 90000,
    max: 110000,
    currency: "EUR",
    period: "year",
  },
  descriptionText:
    "We are looking for a senior engineer with 5+ years of TypeScript experience.",
  requirements: [
    {
      id: "req_01",
      text: "5+ years of TypeScript experience",
      kind: "must",
      span: { start: 40, end: 76 },
    },
  ],
  responsibilities: [],
  skills: ["typescript", "node.js"],
  postedAt: "2026-06-20T00:00:00Z",
  dedupHash: "abc123",
  provenance: {
    sourceId: "paste",
    adapterVersion: "0.0.1",
    inputRef: "clipboard",
    envelopeHash: "deadbeef",
    extractionTier: "ai",
    fetchedAt: "2026-07-01T10:00:00Z",
    normalizedAt: "2026-07-01T10:00:05Z",
  },
  createdAt: "2026-07-01T10:00:05Z",
  updatedAt: "2026-07-01T10:00:05Z",
};

describe("JobSchema", () => {
  it("accepts a fully-populated valid job", () => {
    expect(JobSchema.parse(validJob)).toEqual(validJob);
  });

  it("accepts a minimal job (optional fields absent)", () => {
    const { compensation, postedAt, ...minimal } = validJob;
    expect(JobSchema.parse(minimal)).toEqual(minimal);
  });

  it("rejects an empty title", () => {
    const result = JobSchema.safeParse({ ...validJob, title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["title"]);
    }
  });

  it("rejects an unknown workplace type", () => {
    expect(
      JobSchema.safeParse({ ...validJob, workplaceType: "moon" }).success,
    ).toBe(false);
  });

  it("rejects a requirement span with end <= start", () => {
    const bad = {
      ...validJob,
      requirements: [
        { id: "r1", text: "x", kind: "must", span: { start: 10, end: 10 } },
      ],
    };
    expect(JobSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    expect(
      JobSchema.safeParse({ ...validJob, createdAt: "yesterday" }).success,
    ).toBe(false);
  });

  it("rejects a missing provenance block", () => {
    const { provenance, ...withoutProvenance } = validJob;
    expect(JobSchema.safeParse(withoutProvenance).success).toBe(false);
  });
});
