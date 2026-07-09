import {
  fnv1a,
  type Application,
  type ApplicationEvent,
  type ApplicationRepository,
  type ApplicationStatus,
  type GeneratedDocument,
  type Id,
  type Job,
  type JobAnalysis,
  type JobAnalysisRepository,
  type DocumentRepository,
  type JobRepository,
} from "@hunt/core";

/**
 * Read-only queries for tracking surfaces (SDD §13, §19-lite). No AI, no
 * writes — these assemble what `hunt list` and `hunt show` render. Kept as
 * capabilities (not raw repo access in the CLI) so any future surface (web
 * UI, MCP) gets the same shaped reads.
 */

export interface QueryDeps {
  jobs: JobRepository;
  applications: ApplicationRepository;
  analyses: JobAnalysisRepository;
  documents: DocumentRepository;
}

/** One row in `hunt list`: a job with its tracking state, if any. */
export interface ApplicationListItem {
  job: Job;
  application: Application | null;
  latestFitScore: number | null;
}

/** Everything `hunt show` renders for one job. */
export interface JobDetail {
  job: Job;
  analysis: JobAnalysis | null;
  documents: GeneratedDocument[];
  application: Application | null;
  events: ApplicationEvent[];
}

/** Deterministic application id for a job (mirrors TrackApplication). */
export function applicationIdForJob(jobId: Id): Id {
  return `app_${fnv1a(jobId)}`;
}

export function createQueryApplications(deps: QueryDeps) {
  return {
    /** All jobs (optionally filtered by application status), newest first. */
    list(filter?: { status?: ApplicationStatus }): ApplicationListItem[] {
      const items = deps.jobs.list().map((job): ApplicationListItem => {
        const application = deps.applications.getById(applicationIdForJob(job.id));
        const analysis = deps.analyses.getLatestForJob(job.id);
        return {
          job,
          application,
          latestFitScore: analysis?.fitScore ?? null,
        };
      });
      if (!filter?.status) return items;
      return items.filter((i) => i.application?.status === filter.status);
    },

    /** Full detail for a job by job id, or for an application by app id. */
    detail(id: Id): JobDetail | null {
      // Resolve id → job. Accept a job id directly, or an application id.
      let job = deps.jobs.getById(id);
      let application: Application | null = null;
      if (job) {
        application = deps.applications.getById(applicationIdForJob(job.id));
      } else {
        application = deps.applications.getById(id);
        if (application) job = deps.jobs.getById(application.jobId);
      }
      if (!job) return null;

      return {
        job,
        analysis: deps.analyses.getLatestForJob(job.id),
        documents: deps.documents.listForJob(job.id),
        application,
        events: application ? deps.applications.listEvents(application.id) : [],
      };
    },
  };
}
