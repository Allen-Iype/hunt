import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import {
  SCHEMA_VERSION,
  normalizeCompanyKey,
  type Company,
  type NewApplicationEvent,
  type Profile,
} from "@hunt/core";
import { openDatabase } from "../db.js";
import { createApplicationRepository } from "./applications.js";
import { createCompanyRepository } from "./companies.js";
import { createJobRepository } from "./jobs.js";
import { createProfileRepository } from "./profiles.js";
import { InvalidEventError } from "./applications.js";
import { makeApplication, makeJob, makeTempDir } from "../testing/fixtures.js";

let db: Database;
let cleanup: () => void;

beforeEach(() => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  db = openDatabase(tmp.dir);
});
afterEach(() => {
  db.close();
  cleanup();
});

describe("ProfileRepository (sqlite)", () => {
  const profile: Profile = {
    id: "profile_default",
    schemaVersion: SCHEMA_VERSION,
    basics: { name: "Ada Example", links: [] },
    experience: [],
    skills: [],
    projects: [],
    education: [],
    certifications: [],
    updatedAt: "2026-07-05T12:00:00Z",
  };

  it("round-trips a profile", () => {
    const repo = createProfileRepository(db);
    repo.save(profile);
    expect(repo.get("profile_default")).toEqual(profile);
  });

  it("returns null for a missing profile", () => {
    expect(createProfileRepository(db).get("nope")).toBeNull();
  });

  it("save is an upsert: latest write wins", () => {
    const repo = createProfileRepository(db);
    repo.save(profile);
    repo.save({ ...profile, basics: { ...profile.basics, name: "Ada Updated" } });
    expect(repo.get("profile_default")!.basics.name).toBe("Ada Updated");
  });
});

describe("CompanyRepository (sqlite)", () => {
  const company: Company = {
    id: "com_01",
    schemaVersion: SCHEMA_VERSION,
    name: "Acme Corp",
    normalizedKey: normalizeCompanyKey("Acme Corp"),
    createdAt: "2026-07-05T12:00:00Z",
    updatedAt: "2026-07-05T12:00:00Z",
  };

  it("round-trips and finds by normalized key", () => {
    const repo = createCompanyRepository(db);
    repo.save(company);
    expect(repo.getById("com_01")).toEqual(company);
    expect(repo.getByNormalizedKey("acme")).toEqual(company);
    expect(repo.getByNormalizedKey("initech")).toBeNull();
  });

  it("enforces normalized-key uniqueness across distinct companies", () => {
    const repo = createCompanyRepository(db);
    repo.save(company);
    expect(() => repo.save({ ...company, id: "com_02", name: "ACME Corporation" })).toThrow();
  });

  it("lists companies sorted by name", () => {
    const repo = createCompanyRepository(db);
    repo.save({ ...company, id: "c2", name: "Zeta", normalizedKey: "zeta" });
    repo.save({ ...company, id: "c1", name: "Alpha", normalizedKey: "alpha" });
    expect(repo.list().map((c) => c.name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("JobRepository (sqlite)", () => {
  it("round-trips a fully-populated job (M1 exit criterion)", () => {
    const repo = createJobRepository(db);
    const job = makeJob();
    repo.save(job);
    expect(repo.getById(job.id)).toEqual(job);
  });

  it("finds by dedup hash", () => {
    const repo = createJobRepository(db);
    const job = makeJob();
    repo.save(job);
    expect(repo.findByDedupHash(job.dedupHash)).toEqual(job);
    expect(repo.findByDedupHash("unknown")).toBeNull();
  });

  it("enforces dedup-hash uniqueness", () => {
    const repo = createJobRepository(db);
    repo.save(makeJob());
    expect(() => repo.save(makeJob({ id: "job_02" }))).toThrow();
  });

  it("save is an upsert by id", () => {
    const repo = createJobRepository(db);
    repo.save(makeJob());
    repo.save(makeJob({ title: "Staff Engineer" }));
    expect(repo.getById("job_01")!.title).toBe("Staff Engineer");
    expect(repo.list()).toHaveLength(1);
  });
});

describe("ApplicationRepository (sqlite)", () => {
  const event = (over: Partial<NewApplicationEvent> & Pick<NewApplicationEvent, "id">) =>
    ({
      applicationId: "app_01",
      kind: "note_added",
      data: { text: "hello" },
      occurredAt: "2026-07-05T13:00:00Z",
      ...over,
    }) as NewApplicationEvent;

  function setup() {
    createJobRepository(db).save(makeJob());
    const repo = createApplicationRepository(db);
    repo.create(makeApplication());
    return repo;
  }

  it("creates and reads back an application", () => {
    const repo = setup();
    expect(repo.getById("app_01")).toEqual(makeApplication());
    expect(repo.list()).toHaveLength(1);
  });

  it("rejects an application for a nonexistent job (FK)", () => {
    const repo = createApplicationRepository(db);
    expect(() => repo.create(makeApplication({ jobId: "job_missing" }))).toThrow();
  });

  it("assigns monotonic seq numbers", () => {
    const repo = setup();
    const e1 = repo.appendEvent(event({ id: "e1" }));
    const e2 = repo.appendEvent(event({ id: "e2" }));
    expect([e1.seq, e2.seq]).toEqual([0, 1]);
    expect(repo.listEvents("app_01").map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("status_changed updates the materialized status atomically", () => {
    const repo = setup();
    repo.appendEvent(
      event({
        id: "e1",
        kind: "status_changed",
        data: { from: "discovered", to: "interested" },
      }),
    );
    const app = repo.getById("app_01")!;
    expect(app.status).toBe("interested");
    expect(app.updatedAt).toBe("2026-07-05T13:00:00Z");
  });

  it("rejects a status event whose `from` mismatches the current status", () => {
    const repo = setup();
    expect(() =>
      repo.appendEvent(
        event({ id: "e1", kind: "status_changed", data: { from: "applied", to: "screen" } }),
      ),
    ).toThrow(InvalidEventError);
    // Nothing was persisted.
    expect(repo.listEvents("app_01")).toEqual([]);
    expect(repo.getById("app_01")!.status).toBe("discovered");
  });

  it("rejects invalid transitions (M1 exit criterion)", () => {
    const repo = setup();
    expect(() =>
      repo.appendEvent(
        event({ id: "e1", kind: "status_changed", data: { from: "discovered", to: "offer" } }),
      ),
    ).toThrow(InvalidEventError);
  });

  it("rejects events for unknown applications", () => {
    const repo = setup();
    expect(() => repo.appendEvent(event({ id: "e1", applicationId: "app_missing" }))).toThrow(
      InvalidEventError,
    );
  });

  it("non-status events leave status untouched", () => {
    const repo = setup();
    repo.appendEvent(event({ id: "e1" }));
    expect(repo.getById("app_01")!.status).toBe("discovered");
  });

  it("materialized status always equals the last status_changed event", () => {
    const repo = setup();
    repo.appendEvent(
      event({ id: "e1", kind: "status_changed", data: { from: "discovered", to: "preparing" } }),
    );
    repo.appendEvent(event({ id: "e2" }));
    repo.appendEvent(
      event({ id: "e3", kind: "status_changed", data: { from: "preparing", to: "applied" } }),
    );
    const events = repo.listEvents("app_01");
    const lastStatus = events.filter((e) => e.kind === "status_changed").at(-1)!;
    expect(lastStatus.kind === "status_changed" && lastStatus.data.to).toBe(
      repo.getById("app_01")!.status,
    );
  });
});
