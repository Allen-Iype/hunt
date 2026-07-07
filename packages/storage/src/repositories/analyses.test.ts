import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { SCHEMA_VERSION, type JobAnalysis } from "@hunt/core";
import { openDatabase } from "../db.js";
import { createJobAnalysisRepository } from "./analyses.js";
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

const makeAnalysis = (overrides: Partial<JobAnalysis> = {}): JobAnalysis => ({
  id: "ana_1",
  schemaVersion: SCHEMA_VERSION,
  jobId: "job_01",
  profileVersion: "2026-07-07T10:00:00Z",
  analyzerVersion: 1,
  fitScore: 72,
  breakdown: [{ component: "skillOverlap", weight: 0.3, value: 0.72 }],
  skills: { matched: [{ name: "typescript", profileSkillId: "skill_ts" }], missing: ["go"] },
  requirements: [
    { id: "req_1", text: "TypeScript", kind: "must", category: "technical", skills: ["typescript"], coverage: 1 },
  ],
  seniority: { value: "senior", source: "import" },
  redFlags: [],
  implicitExpectations: [],
  fieldProvenance: { skills: "deterministic" },
  aiUsed: false,
  createdAt: "2026-07-07T11:00:00Z",
  ...overrides,
});

describe("JobAnalysisRepository (sqlite)", () => {
  it("round-trips an analysis", () => {
    const repo = createJobAnalysisRepository(db);
    const analysis = makeAnalysis();
    repo.save(analysis);
    expect(repo.getById("ana_1")).toEqual(analysis);
  });

  it("save is an upsert by id (re-analysis refreshes)", () => {
    const repo = createJobAnalysisRepository(db);
    repo.save(makeAnalysis());
    repo.save(makeAnalysis({ fitScore: 55, createdAt: "2026-07-07T12:00:00Z" }));
    expect(repo.listForJob("job_01")).toHaveLength(1);
    expect(repo.getById("ana_1")!.fitScore).toBe(55);
  });

  it("getLatestForJob returns the newest across ids", () => {
    const repo = createJobAnalysisRepository(db);
    repo.save(makeAnalysis({ id: "ana_old", createdAt: "2026-07-06T10:00:00Z" }));
    repo.save(makeAnalysis({ id: "ana_new", createdAt: "2026-07-07T12:00:00Z", fitScore: 90 }));
    expect(repo.getLatestForJob("job_01")!.id).toBe("ana_new");
    expect(repo.listForJob("job_01").map((a) => a.id)).toEqual(["ana_new", "ana_old"]);
  });

  it("rejects an analysis for a nonexistent job (FK)", () => {
    const repo = createJobAnalysisRepository(db);
    expect(() => repo.save(makeAnalysis({ jobId: "job_missing" }))).toThrow();
  });

  it("returns null for unknown lookups", () => {
    const repo = createJobAnalysisRepository(db);
    expect(repo.getById("nope")).toBeNull();
    expect(repo.getLatestForJob("job_01")).toBeNull();
  });
});
