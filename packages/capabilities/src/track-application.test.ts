import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  validateTransition,
  type Application,
  type ApplicationEvent,
  type ApplicationRepository,
  type Job,
  type JobRepository,
  type NewApplicationEvent,
} from "@hunt/core";
import { createTrackApplication } from "./track-application.js";

const NOW = "2026-07-08T12:00:00Z";

const job: Job = {
  id: "job_x",
  schemaVersion: SCHEMA_VERSION,
  title: "Backend Engineer",
  companyName: "Initech",
  locations: ["Remote"],
  workplaceType: "remote",
  employmentType: "full_time",
  seniority: "senior",
  descriptionText: "Build things.",
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

/** In-memory application repo faithful to the real one's state-machine + seq rules. */
function fakeApplications() {
  const apps = new Map<string, Application>();
  const events = new Map<string, ApplicationEvent[]>();
  const repo: ApplicationRepository = {
    create(a) {
      if (apps.has(a.id)) throw new Error("duplicate application");
      apps.set(a.id, a);
      events.set(a.id, []);
    },
    getById: (id) => apps.get(id) ?? null,
    list: () => [...apps.values()],
    appendEvent(e: NewApplicationEvent): ApplicationEvent {
      const app = apps.get(e.applicationId);
      if (!app) throw new Error(`application not found: ${e.applicationId}`);
      if (e.kind === "status_changed") {
        if (e.data.from !== app.status) throw new Error("from mismatch");
        const check = validateTransition(e.data.from, e.data.to);
        if (!check.valid) throw new Error(check.reason);
      }
      const list = events.get(e.applicationId)!;
      const full = { ...e, seq: list.length } as ApplicationEvent;
      list.push(full);
      if (full.kind === "status_changed") {
        apps.set(app.id, { ...app, status: full.data.to, updatedAt: full.occurredAt });
      }
      return full;
    },
    listEvents: (id) => events.get(id) ?? [],
  };
  return { repo, apps, events };
}

function jobsRepo(): JobRepository {
  return {
    save: () => {},
    getById: (id) => (id === job.id ? job : null),
    findByDedupHash: () => null,
    list: () => [job],
  };
}

describe("TrackApplication", () => {
  it("auto-creates the application on first track and applies the transition", () => {
    const { repo, apps } = fakeApplications();
    const track = createTrackApplication({ applications: repo, jobs: jobsRepo() });
    const result = track({ jobId: "job_x", action: { kind: "transition", to: "applied" }, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.application.status).toBe("applied");
    expect([...apps.values()]).toHaveLength(1);
  });

  it("reuses the same application on subsequent tracks (one app per job)", () => {
    const { repo } = fakeApplications();
    const track = createTrackApplication({ applications: repo, jobs: jobsRepo() });
    const first = track({ jobId: "job_x", action: { kind: "transition", to: "applied" }, now: NOW });
    const second = track({ jobId: "job_x", action: { kind: "transition", to: "screen" }, now: NOW });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.created).toBe(false);
    expect(first.application.id).toBe(second.application.id);
    expect(second.application.status).toBe("screen");
  });

  it("rejects an invalid transition with the state machine's reason", () => {
    const { repo } = fakeApplications();
    const track = createTrackApplication({ applications: repo, jobs: jobsRepo() });
    track({ jobId: "job_x", action: { kind: "transition", to: "applied" }, now: NOW });
    const bad = track({ jobId: "job_x", action: { kind: "transition", to: "accepted" }, now: NOW });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.stage).toBe("transition");
    expect(bad.message).toContain("invalid transition");
  });

  it("appends a note without changing status", () => {
    const { repo } = fakeApplications();
    const track = createTrackApplication({ applications: repo, jobs: jobsRepo() });
    track({ jobId: "job_x", action: { kind: "transition", to: "applied" }, now: NOW });
    const noted = track({ jobId: "job_x", action: { kind: "note", text: "Referred by Sam" }, now: NOW });
    expect(noted.ok).toBe(true);
    if (!noted.ok) return;
    expect(noted.event.kind).toBe("note_added");
    expect(noted.application.status).toBe("applied");
  });

  it("attaches a document reference", () => {
    const { repo, events } = fakeApplications();
    const track = createTrackApplication({ applications: repo, jobs: jobsRepo() });
    const created = track({ jobId: "job_x", action: { kind: "attach", ref: "doc_abc", label: "resume" }, now: NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.event.kind).toBe("document_attached");
    const evs = events.get(created.application.id)!;
    expect(evs[0]!.kind).toBe("document_attached");
  });

  it("fails helpfully for an unknown job", () => {
    const { repo } = fakeApplications();
    const track = createTrackApplication({ applications: repo, jobs: jobsRepo() });
    const result = track({ jobId: "job_nope", action: { kind: "note", text: "x" }, now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("input");
    expect(result.hint).toContain("hunt import");
  });
});
