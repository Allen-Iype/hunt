import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  type Application,
  type ApplicationEvent,
  type ApplicationRepository,
  type DocumentRepository,
  type GeneratedDocument,
  type Job,
  type JobAnalysis,
  type JobAnalysisRepository,
  type JobRepository,
} from "@hunt/core";
import { applicationIdForJob, createQueryApplications } from "./query-applications.js";

const NOW = "2026-07-08T12:00:00Z";

const mkJob = (id: string, title: string): Job => ({
  id,
  schemaVersion: SCHEMA_VERSION,
  title,
  companyName: "Initech",
  locations: ["Remote"],
  workplaceType: "remote",
  employmentType: "full_time",
  seniority: "senior",
  descriptionText: "Build things.",
  requirements: [],
  responsibilities: [],
  skills: [],
  dedupHash: `h-${id}`,
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
});

const analysis = (jobId: string, fitScore: number): JobAnalysis => ({
  id: `ana_${jobId}`,
  schemaVersion: SCHEMA_VERSION,
  jobId,
  profileVersion: NOW,
  analyzerVersion: 1,
  fitScore,
  breakdown: [],
  skills: { matched: [], missing: [] },
  requirements: [],
  seniority: { value: "senior", source: "import" },
  redFlags: [],
  implicitExpectations: [],
  fieldProvenance: {},
  aiUsed: false,
  createdAt: NOW,
});

function deps() {
  const jobs = [mkJob("job_a", "A"), mkJob("job_b", "B")];
  const jobsRepo: JobRepository = {
    save: () => {},
    getById: (id) => jobs.find((j) => j.id === id) ?? null,
    findByDedupHash: () => null,
    list: () => jobs,
  };
  const apps = new Map<string, Application>();
  const events = new Map<string, ApplicationEvent[]>();
  const applications: ApplicationRepository = {
    create: (a) => {
      apps.set(a.id, a);
    },
    getById: (id) => apps.get(id) ?? null,
    list: () => [...apps.values()],
    appendEvent: () => {
      throw new Error("unused");
    },
    listEvents: (id) => events.get(id) ?? [],
  };
  const analyses: JobAnalysisRepository = {
    save: () => {},
    getById: () => null,
    getLatestForJob: (jobId) => (jobId === "job_a" ? analysis("job_a", 82) : null),
    listForJob: () => [],
  };
  const docsStore: GeneratedDocument[] = [];
  const documents: DocumentRepository = {
    save: (d) => docsStore.push(d),
    getById: (id) => docsStore.find((d) => d.id === id) ?? null,
    listForJob: (jobId) => docsStore.filter((d) => d.jobId === jobId),
    getLatestForJob: () => null,
  };
  return { jobsRepo, applications, analyses, documents, apps, events };
}

describe("QueryApplications", () => {
  it("lists all jobs with their tracking state and latest fit score", () => {
    const d = deps();
    // Track job_a as applied.
    d.apps.set(applicationIdForJob("job_a"), {
      id: applicationIdForJob("job_a"),
      schemaVersion: SCHEMA_VERSION,
      jobId: "job_a",
      status: "applied",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const q = createQueryApplications({
      jobs: d.jobsRepo,
      applications: d.applications,
      analyses: d.analyses,
      documents: d.documents,
    });
    const list = q.list();
    expect(list).toHaveLength(2);
    const a = list.find((i) => i.job.id === "job_a")!;
    expect(a.application?.status).toBe("applied");
    expect(a.latestFitScore).toBe(82);
    const b = list.find((i) => i.job.id === "job_b")!;
    expect(b.application).toBeNull();
    expect(b.latestFitScore).toBeNull();
  });

  it("filters the list by application status", () => {
    const d = deps();
    d.apps.set(applicationIdForJob("job_a"), {
      id: applicationIdForJob("job_a"),
      schemaVersion: SCHEMA_VERSION,
      jobId: "job_a",
      status: "applied",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const q = createQueryApplications({
      jobs: d.jobsRepo,
      applications: d.applications,
      analyses: d.analyses,
      documents: d.documents,
    });
    expect(q.list({ status: "applied" })).toHaveLength(1);
    expect(q.list({ status: "offer" })).toHaveLength(0);
  });

  it("detail resolves by job id and includes analysis + documents", () => {
    const d = deps();
    const q = createQueryApplications({
      jobs: d.jobsRepo,
      applications: d.applications,
      analyses: d.analyses,
      documents: d.documents,
    });
    const detail = q.detail("job_a");
    expect(detail).not.toBeNull();
    expect(detail!.job.id).toBe("job_a");
    expect(detail!.analysis?.fitScore).toBe(82);
    expect(detail!.application).toBeNull(); // not tracked yet
  });

  it("detail resolves by application id too", () => {
    const d = deps();
    const appId = applicationIdForJob("job_a");
    d.apps.set(appId, {
      id: appId,
      schemaVersion: SCHEMA_VERSION,
      jobId: "job_a",
      status: "screen",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const q = createQueryApplications({
      jobs: d.jobsRepo,
      applications: d.applications,
      analyses: d.analyses,
      documents: d.documents,
    });
    const detail = q.detail(appId);
    expect(detail!.job.id).toBe("job_a");
    expect(detail!.application?.status).toBe("screen");
  });

  it("returns null for an unknown id", () => {
    const d = deps();
    const q = createQueryApplications({
      jobs: d.jobsRepo,
      applications: d.applications,
      analyses: d.analyses,
      documents: d.documents,
    });
    expect(q.detail("nope")).toBeNull();
  });
});
