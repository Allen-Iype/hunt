import type { Application, ApplicationEvent, NewApplicationEvent } from "./models/application.js";
import type { CandidateFact } from "./models/candidate-fact.js";
import type { Company } from "./models/company.js";
import type { Id } from "./models/common.js";
import type { CoverLetterDraft, ResumeDraft } from "./models/document-draft.js";
import type {
  CoverLetterDocument,
  DocumentKind,
  GeneratedDocument,
  ResumeDocument,
} from "./models/document.js";
import type { RawEnvelope } from "./models/envelope.js";
import type { ExtractedJobDraft } from "./models/extracted-job.js";
import type { ExtractedResumeDraft } from "./models/extracted-resume.js";
import type { Job } from "./models/job.js";
import type { JobAnalysis } from "./models/job-analysis.js";
import type { JobInsights } from "./models/job-insights.js";
import type { OpportunityRef } from "./models/opportunity-ref.js";
import type { Profile } from "./models/profile.js";
import type { DiscoverySource, SavedSearch, SearchQuery } from "./models/saved-search.js";

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
 * Domain-shaped AI port (SDD §15, ADR-0013, F11 §4): "extract structured facts
 * from a resume". Implemented by the AI gateway; consumed by the ImportResume
 * capability to seed a reviewable profile.yaml. Like ExtractJobPort, this is a
 * domain task, not an LLM port — and its output is an inert proposal a human
 * confirms, never a verified fact.
 */
export interface ExtractResumePort {
  extractResume(input: { text: string }): Promise<ExtractResumeResult>;
}

export type ExtractResumeResult =
  | { ok: true; draft: ExtractedResumeDraft }
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

/**
 * Context handed to the composer alongside the candidate facts. Deliberately
 * minimal: the facts are the material, this is the target to tailor toward.
 */
export interface ComposeContext {
  jobTitle: string;
  companyName: string;
  /** Short job summary/description context (truncated by the adapter). */
  jobContext: string;
  /** Skills the job requires that the candidate is missing — informs emphasis, never claims. */
  missingSkills: readonly string[];
}

/**
 * Domain-shaped AI composition ports (SDD §15, §17, ADR-0013). The composer
 * receives ONLY the candidate fact set + job context and must cite candidate
 * fact ids on every bullet (enforced structurally by the draft schema and the
 * claim tracer). On a repair round the prior violations are passed back.
 */
export interface ComposeResumePort {
  composeResume(input: {
    context: ComposeContext;
    candidateFacts: readonly CandidateFact[];
    /** Present on a repair round: the violations to fix (SDD §17). */
    repairFeedback?: string;
  }): Promise<ComposeResult<ResumeDraft>>;
}

export interface ComposeCoverLetterPort {
  composeCoverLetter(input: {
    context: ComposeContext;
    candidateFacts: readonly CandidateFact[];
    repairFeedback?: string;
  }): Promise<ComposeResult<CoverLetterDraft>>;
}

export type ComposeResult<TDraft> =
  | { ok: true; draft: TDraft; providerId: string; taskVersion: number }
  | { ok: false; kind: "unavailable" | "provider" | "invalid-output"; message: string };

/**
 * Rendering port (SDD §17 step 4). Documents → self-contained output. The
 * concrete renderer (HTML + print CSS in V1; PDF later) is an adapter detail;
 * consumers see only "give me a document, get bytes and a suggested filename".
 */
export interface RenderPort {
  renderResume(doc: ResumeDocument): RenderOutput;
  renderCoverLetter(doc: CoverLetterDocument): RenderOutput;
}

export interface RenderOutput {
  /** MIME type of `content` (e.g. "text/html"). */
  contentType: string;
  /** Rendered document bytes/text. */
  content: string;
  /** Suggested file extension without the dot (e.g. "html"). */
  extension: string;
}

/**
 * Repository for generated documents (SDD §12). Documents are immutable
 * versions; approval flips status once and is enforced by the capability
 * layer, not re-derivable, so it is stored directly.
 */
export interface DocumentRepository {
  save(document: GeneratedDocument): void;
  getById(id: Id): GeneratedDocument | null;
  listForJob(jobId: Id): GeneratedDocument[];
  /** Latest document of a kind for a job (most recent createdAt). */
  getLatestForJob(jobId: Id, kind: DocumentKind): GeneratedDocument | null;
}

/**
 * A discovered lead as produced by a discovery source, BEFORE it becomes a
 * persisted `OpportunityRef` (id, queryId, status, and relevance are assigned
 * by the capability layer). Carries only lead data — never job structure
 * (ADR-0015 invariant).
 */
export interface DiscoveredRef {
  /** Discovery adapter that produced this lead, e.g. "greenhouse". */
  sourceId: string;
  url: string;
  title: string;
  companyName?: string;
  location?: string;
  snippet?: string;
}

/**
 * Domain-shaped discovery port (SDD §9, ADR-0015). Given a structured query,
 * produce many leads — the INVERSE shape of `JobIngestor`/`SourceAdapter`
 * (which fetch and normalize ONE known reference). Async by nature (network
 * I/O), unlike the synchronous storage ports. Its output feeds the existing
 * import pipeline unchanged; discovery never normalizes.
 */
export interface DiscoveryPort {
  discover(input: {
    sources: readonly DiscoverySource[];
    query: SearchQuery;
  }): Promise<DiscoveryResult>;
}

export type DiscoveryResult =
  | { ok: true; refs: DiscoveredRef[] }
  | { ok: false; stage: "fetch" | "parse"; message: string; hint?: string };

/**
 * Repository for discovered leads (ADR-0015). Refs carry a seen/dismissed
 * lifecycle so re-running a search does not resurface handled leads.
 */
export interface OpportunityRefRepository {
  /** Insert or replace by id. */
  save(ref: OpportunityRef): void;
  getById(id: Id): OpportunityRef | null;
  findByUrl(url: string): OpportunityRef | null;
  /** New (undismissed, unimported) refs for a search, most relevant first. */
  listForSearch(queryId: Id): OpportunityRef[];
  markStatus(id: Id, status: OpportunityRef["status"]): void;
}

export interface SavedSearchRepository {
  save(search: SavedSearch): void;
  getById(id: Id): SavedSearch | null;
  list(): SavedSearch[];
  delete(id: Id): void;
}
