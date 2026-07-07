import { describe, expect, it } from "vitest";
import { jobDedupFingerprint } from "./dedup.js";
import { ExtractedJobDraftSchema } from "./models/extracted-job.js";
import { RawEnvelopeSchema } from "./models/envelope.js";

describe("jobDedupFingerprint", () => {
  const base = {
    companyName: "Acme Corp",
    title: "Senior Engineer",
    locations: ["Berlin", "Munich"],
    descriptionText: "Build   things.\nWell.",
  };

  it("is deterministic", () => {
    expect(jobDedupFingerprint(base)).toBe(jobDedupFingerprint({ ...base }));
  });

  it("normalizes case and whitespace", () => {
    expect(
      jobDedupFingerprint({
        ...base,
        companyName: "  ACME   corp ",
        descriptionText: "Build things. Well.",
      }),
    ).toBe(jobDedupFingerprint(base));
  });

  it("ignores location order", () => {
    expect(jobDedupFingerprint({ ...base, locations: ["Munich", "Berlin"] })).toBe(
      jobDedupFingerprint(base),
    );
  });

  it("distinguishes different titles", () => {
    expect(jobDedupFingerprint({ ...base, title: "Staff Engineer" })).not.toBe(
      jobDedupFingerprint(base),
    );
  });
});

describe("ExtractedJobDraftSchema", () => {
  it("applies honest defaults for omitted fields", () => {
    const draft = ExtractedJobDraftSchema.parse({ title: "Engineer", companyName: "Acme" });
    expect(draft.workplaceType).toBe("unspecified");
    expect(draft.seniority).toBe("unspecified");
    expect(draft.requirements).toEqual([]);
  });

  it("accepts date-only and full timestamps for postedAt", () => {
    const base = { title: "E", companyName: "A" };
    expect(ExtractedJobDraftSchema.safeParse({ ...base, postedAt: "2026-06-30" }).success).toBe(true);
    expect(
      ExtractedJobDraftSchema.safeParse({ ...base, postedAt: "2026-06-30T09:00:00+02:00" }).success,
    ).toBe(true);
    expect(ExtractedJobDraftSchema.safeParse({ ...base, postedAt: "June 30th" }).success).toBe(false);
  });

  it("rejects system fields the extractor must not produce", () => {
    const parsed = ExtractedJobDraftSchema.parse({
      title: "E",
      companyName: "A",
      id: "job_evil",
      dedupHash: "evil",
    });
    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("dedupHash");
  });
});

describe("RawEnvelopeSchema", () => {
  it("round-trips a valid envelope", () => {
    const envelope = {
      hash: "a".repeat(64),
      sourceId: "paste",
      adapterVersion: "0.1.0",
      contentType: "text/plain",
      inputRef: "paste:stdin",
      fetchedAt: "2026-07-07T10:00:00Z",
    };
    expect(RawEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it("rejects a malformed hash", () => {
    expect(
      RawEnvelopeSchema.safeParse({
        hash: "not-a-hash",
        sourceId: "paste",
        adapterVersion: "0.1.0",
        contentType: "text/plain",
        inputRef: "x",
        fetchedAt: "2026-07-07T10:00:00Z",
      }).success,
    ).toBe(false);
  });
});
