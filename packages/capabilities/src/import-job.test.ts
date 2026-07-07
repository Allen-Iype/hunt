import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  type Company,
  type CompanyRepository,
  type IngestJobResult,
  type Job,
  type JobIngestor,
  type JobRepository,
} from "@hunt/core";
import { createImportJob } from "./import-job.js";

const NOW = "2026-07-07T10:00:00Z";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job_abc123def456",
    schemaVersion: SCHEMA_VERSION,
    title: "Senior Engineer",
    companyName: "Acme Corp",
    locations: ["Berlin"],
    workplaceType: "hybrid",
    employmentType: "full_time",
    seniority: "senior",
    descriptionText: "desc",
    requirements: [],
    responsibilities: [],
    skills: [],
    dedupHash: "hash_1",
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

function fakeJobs(): JobRepository & { store: Map<string, Job> } {
  const store = new Map<string, Job>();
  return {
    store,
    save: (j) => void store.set(j.id, j),
    getById: (id) => store.get(id) ?? null,
    findByDedupHash: (h) => [...store.values()].find((j) => j.dedupHash === h) ?? null,
    list: () => [...store.values()],
  };
}

function fakeCompanies(): CompanyRepository & { store: Map<string, Company> } {
  const store = new Map<string, Company>();
  return {
    store,
    save: (c) => void store.set(c.id, c),
    getById: (id) => store.get(id) ?? null,
    getByNormalizedKey: (k) => [...store.values()].find((c) => c.normalizedKey === k) ?? null,
    list: () => [...store.values()],
  };
}

function ingestorReturning(result: IngestJobResult): JobIngestor {
  return { ingest: async () => result };
}

const okIngest = (job: Job): IngestJobResult => ({
  ok: true,
  job,
  envelope: {
    hash: "e".repeat(64),
    sourceId: "paste",
    adapterVersion: "0.1.0",
    contentType: "text/plain",
    inputRef: "paste:stdin",
    fetchedAt: NOW,
  },
  aiUsed: false,
});

describe("ImportJob", () => {
  it("persists a new job and creates its company", async () => {
    const jobs = fakeJobs();
    const companies = fakeCompanies();
    const importJob = createImportJob({
      ingestor: ingestorReturning(okIngest(makeJob())),
      jobs,
      companies,
    });

    const result = await importJob({ kind: "content", content: "x", inputRef: "paste:stdin" });
    expect(result).toMatchObject({ ok: true, dedup: "new", extractionTier: "structured" });
    if (!result.ok) return;
    expect(result.company.name).toBe("Acme Corp");
    expect(result.job.companyId).toBe(result.company.id);
    expect(jobs.store.size).toBe(1);
    expect(companies.store.size).toBe(1);
  });

  it("reuses an existing company via the normalized key", async () => {
    const jobs = fakeJobs();
    const companies = fakeCompanies();
    const importJob = createImportJob({
      ingestor: ingestorReturning(okIngest(makeJob({ companyName: "ACME Corporation" }))),
      jobs,
      companies,
    });
    companies.save({
      id: "com_existing",
      schemaVersion: SCHEMA_VERSION,
      name: "Acme Corp",
      normalizedKey: "acme",
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await importJob({ kind: "content", content: "x", inputRef: "paste:stdin" });
    if (!result.ok) throw new Error("expected success");
    expect(result.company.id).toBe("com_existing");
    expect(companies.store.size).toBe(1);
  });

  it("re-import updates provenance on the existing job, never duplicates (SDD §9)", async () => {
    const jobs = fakeJobs();
    const companies = fakeCompanies();
    const existing = makeJob();
    jobs.save(existing);

    const reimported = makeJob({
      provenance: { ...existing.provenance, inputRef: "file:again.html", normalizedAt: "2026-07-07T11:00:00Z" },
      updatedAt: "2026-07-07T11:00:00Z",
    });
    const importJob = createImportJob({
      ingestor: ingestorReturning(okIngest(reimported)),
      jobs,
      companies,
    });

    const result = await importJob({ kind: "content", content: "x", inputRef: "file:again.html" });
    expect(result).toMatchObject({ ok: true, dedup: "updated-existing" });
    expect(jobs.store.size).toBe(1);
    const stored = jobs.getById(existing.id)!;
    expect(stored.provenance.inputRef).toBe("file:again.html");
    expect(stored.updatedAt).toBe("2026-07-07T11:00:00Z");
    expect(stored.createdAt).toBe(existing.createdAt);
  });

  it("maps ingest failures with their hint", async () => {
    const importJob = createImportJob({
      ingestor: ingestorReturning({
        ok: false,
        stage: "fetch",
        message: "login wall",
        hint: "paste instead",
      }),
      jobs: fakeJobs(),
      companies: fakeCompanies(),
    });
    const result = await importJob({ kind: "url", url: "https://x" });
    expect(result).toMatchObject({
      ok: false,
      stage: "ingest",
      message: "fetch: login wall",
      hint: "paste instead",
    });
  });

  it("maps repository failures to the storage stage", async () => {
    const jobs = fakeJobs();
    jobs.save = () => {
      throw new Error("disk full");
    };
    const importJob = createImportJob({
      ingestor: ingestorReturning(okIngest(makeJob())),
      jobs,
      companies: fakeCompanies(),
    });
    const result = await importJob({ kind: "content", content: "x", inputRef: "p" });
    expect(result).toMatchObject({ ok: false, stage: "storage", message: "disk full" });
  });
});
