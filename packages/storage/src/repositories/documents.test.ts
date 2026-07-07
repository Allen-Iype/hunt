import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { SCHEMA_VERSION, type GeneratedDocument, type ResumeDocument } from "@hunt/core";
import { openDatabase } from "../db.js";
import { createDocumentRepository } from "./documents.js";
import { createJobRepository } from "./jobs.js";
import { makeJob, makeTempDir } from "../testing/fixtures.js";

let db: Database;
let cleanup: () => void;

beforeEach(() => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  db = openDatabase(tmp.dir);
  createJobRepository(db).save(makeJob());
});
afterEach(() => {
  db.close();
  cleanup();
});

const makeResume = (overrides: Partial<ResumeDocument> = {}): ResumeDocument => ({
  id: "doc_r1",
  schemaVersion: SCHEMA_VERSION,
  kind: "resume",
  jobId: "job_01",
  analysisId: "ana_1",
  profileVersion: "2026-07-07T10:00:00Z",
  status: "draft",
  generationMeta: {
    generatorVersion: 1,
    aiTaskId: "draft-resume",
    aiTaskVersion: 1,
    providerId: "test",
    candidateFactIds: ["exp_1"],
    repairRounds: 0,
  },
  contact: { name: "Ada", links: [] },
  summary: { text: "Engineer", sourceFactIds: ["exp_1"] },
  sections: [{ heading: "Experience", bullets: [{ text: "Built things", sourceFactIds: ["exp_1"] }] }],
  createdAt: "2026-07-07T11:00:00Z",
  ...overrides,
});

describe("DocumentRepository (sqlite)", () => {
  it("round-trips a resume document", () => {
    const repo = createDocumentRepository(db);
    const doc: GeneratedDocument = makeResume();
    repo.save(doc);
    expect(repo.getById("doc_r1")).toEqual(doc);
  });

  it("save is an upsert by id (approval refreshes the same version)", () => {
    const repo = createDocumentRepository(db);
    repo.save(makeResume());
    repo.save(makeResume({ status: "approved", renderPath: "/docs/r.html" }));
    expect(repo.listForJob("job_01")).toHaveLength(1);
    const stored = repo.getById("doc_r1")!;
    expect(stored.status).toBe("approved");
    expect(stored.renderPath).toBe("/docs/r.html");
  });

  it("getLatestForJob is scoped by kind", () => {
    const repo = createDocumentRepository(db);
    repo.save(makeResume({ id: "doc_old", createdAt: "2026-07-01T00:00:00Z" }));
    repo.save(makeResume({ id: "doc_new", createdAt: "2026-07-07T00:00:00Z" }));
    expect(repo.getLatestForJob("job_01", "resume")!.id).toBe("doc_new");
    expect(repo.getLatestForJob("job_01", "cover_letter")).toBeNull();
  });
});
