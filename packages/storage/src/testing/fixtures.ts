import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_VERSION, type Application, type Job } from "@hunt/core";

/** Test-support only (excluded from the build). */

export function makeTempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "hunt-test-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_01",
    schemaVersion: SCHEMA_VERSION,
    title: "Senior Software Engineer",
    companyName: "Acme Corp",
    locations: ["Berlin, Germany"],
    workplaceType: "hybrid",
    employmentType: "full_time",
    seniority: "senior",
    compensation: { raw: "€90k–€110k", min: 90000, max: 110000, currency: "EUR", period: "year" },
    descriptionText: "We are looking for a senior engineer with TypeScript experience.",
    requirements: [{ id: "req_01", text: "TypeScript experience", kind: "must" }],
    responsibilities: [],
    skills: ["typescript"],
    dedupHash: "hash_job_01",
    provenance: {
      sourceId: "paste",
      adapterVersion: "0.0.1",
      inputRef: "clipboard",
      envelopeHash: "deadbeef",
      extractionTier: "user",
      fetchedAt: "2026-07-01T10:00:00Z",
      normalizedAt: "2026-07-01T10:00:05Z",
    },
    createdAt: "2026-07-01T10:00:05Z",
    updatedAt: "2026-07-01T10:00:05Z",
    ...overrides,
  };
}

export function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: "app_01",
    schemaVersion: SCHEMA_VERSION,
    jobId: "job_01",
    status: "discovered",
    createdAt: "2026-07-02T09:00:00Z",
    updatedAt: "2026-07-02T09:00:00Z",
    ...overrides,
  };
}
