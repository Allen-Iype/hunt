import type { Application, ApplicationEvent, NewApplicationEvent } from "./models/application.js";
import type { Company } from "./models/company.js";
import type { Id } from "./models/common.js";
import type { RawEnvelope } from "./models/envelope.js";
import type { ExtractedJobDraft } from "./models/extracted-job.js";
import type { Job } from "./models/job.js";
import type { JobAnalysis } from "./models/job-analysis.js";
import type { JobInsights } from "./models/job-insights.js";
import type { Profile } from "./models/profile.js";

/**
 * Storage ports (SDD §6, §7, §14). Defined by the core, implemented by
 * adapter packages. Intent-level methods, not query builders.
 *
 * Methods are synchronous by design: the chosen engine (better-sqlite3) is
 * synchronous and Hunt is a single-user local app. If an async backend ever
 * appears, widening these signatures is a contained, mechanical change.
 */

export interface ProfileRepository {
  save(profile: Profile): void;
  get(id: Id): Profile | null;
}

export interface CompanyRepository {
  save(company: Company): void;
  getById(id: Id): Company | null;
  getByNormalizedKey(key: string): Company | null;
  list(): Company[];
}

export interface JobRepository {
  /** Insert or replace by id. `dedupHash` is unique across jobs. */
  save(job: Job): void;
  getById(id: Id): Job | null;
  findByDedupHash(hash: string): Job | null;
  list(): Job[];
}

export interface ApplicationRepository {
  create(application: Application): void;
  getById(id: Id): Application | null;
  list(): Application[];
  /**
   * Append an event, assigning the next per-application `seq`. For
   * `status_changed` events the materialized status is updated atomically;
   * events whose `from` mismatches the current status or whose transition is
   * invalid (core state machine) are rejected — event-log integrity is a
   * storage invariant.
   */
  appendEvent(event: NewApplicationEvent): ApplicationEvent;
  listEvents(applicationId: Id): ApplicationEvent[];
}

export interface EnvelopeRepository {
  save(envelope: RawEnvelope): void;
  getByHash(hash: string): RawEnvelope | null;
}

/**
 * Ingestion port (SDD §8, §9): reference in → persisted envelope + canonical
 * Job out. Implemented by @hunt/ingestion; the capability layer orchestrates
 * it without knowing sources, tiers, or parsers.
 */
export type IngestJobInput =
  | { kind: "url"; url: string }
  | { kind: "content"; content: string; inputRef: string; contentTypeHint?: "html" | "text" };

export type IngestJobResult =
  | {
      ok: true;
      /** Canonical job; `companyId` is resolved by the capability layer. */
      job: Job;
      envelope: RawEnvelope;
      aiUsed: boolean;
    }
  | {
      ok: false;
      stage: "resolve" | "fetch" | "normalize";
      message: string;
      /** Actionable next step for the user (e.g. "paste the posting instead"). */
      hint?: string;
    };

export interface JobIngestor {
  ingest(input: IngestJobInput): Promise<IngestJobResult>;
}

/**
 * Domain-shaped AI port (SDD §15, ADR-0013): "extract a job posting from
 * prose". Implemented by the AI gateway; consumed by the ingestion layer's
 * fallback tier. Deliberately NOT an "LLM port" — business logic speaks in
 * domain tasks, never in provider wire formats.
 */
export interface ExtractJobPort {
  extractJob(input: { text: string }): Promise<ExtractJobResult>;
}

export type ExtractJobResult =
  | { ok: true; draft: ExtractedJobDraft }
  | { ok: false; kind: "unavailable" | "provider" | "invalid-output"; message: string };

/**
 * Domain-shaped AI port for the analysis pass B (SDD §18, ADR-0013):
 * classify requirements, infer seniority, surface red flags, narrate gaps.
 * Match results are provided so the narrative is grounded in pass A's facts.
 */
export interface JobInsightsPort {
  getJobInsights(input: {
    title: string;
    descriptionText: string;
    matchedSkills: readonly string[];
    missingSkills: readonly string[];
  }): Promise<JobInsightsResult>;
}

export type JobInsightsResult =
  | { ok: true; insights: JobInsights }
  | { ok: false; kind: "unavailable" | "provider" | "invalid-output"; message: string };

export interface JobAnalysisRepository {
  /** Insert or replace by id (deterministic id → re-analysis refreshes). */
  save(analysis: JobAnalysis): void;
  getById(id: Id): JobAnalysis | null;
  getLatestForJob(jobId: Id): JobAnalysis | null;
  listForJob(jobId: Id): JobAnalysis[];
}

/**
 * Content-addressed store for verbatim raw payloads (SDD §8, §12).
 * Immutable: putting identical content is a no-op returning the same hash.
 */
export interface RawVault {
  /** Store content; returns its SHA-256 hex hash. */
  put(content: string | Uint8Array): string;
  get(hash: string): Uint8Array | null;
  has(hash: string): boolean;
}
