import {
  SCHEMA_VERSION,
  fnv1a,
  validateTransition,
  type Application,
  type ApplicationEvent,
  type ApplicationRepository,
  type ApplicationStatus,
  type Id,
  type JobRepository,
  type NewApplicationEvent,
  type Timestamp,
} from "@hunt/core";

/**
 * TrackApplication capability (SDD §13, §12): the single write path for the
 * application lifecycle. Fully deterministic, zero AI. All state-machine and
 * event-log integrity is enforced by the ApplicationRepository (M1); this
 * capability resolves the application (creating it on first track), derives
 * deterministic ids, and appends the requested event.
 *
 * An application is auto-created for a job on first track — one application
 * per job, id derived from the job id, so re-tracking the same job resolves
 * to the same aggregate.
 */

export interface TrackApplicationDeps {
  applications: ApplicationRepository;
  jobs: JobRepository;
}

/** One action per invocation (the CLI maps a flag to exactly one). */
export type TrackAction =
  | { kind: "transition"; to: ApplicationStatus; note?: string }
  | { kind: "note"; text: string }
  | { kind: "attach"; ref: string; label?: string }
  | { kind: "contact"; name: string; role?: string; email?: string; url?: string };

export interface TrackApplicationInput {
  jobId: Id;
  action: TrackAction;
  /** Injected for deterministic tests; defaults to now. */
  now?: Timestamp;
}

export type TrackApplicationResult =
  | { ok: true; application: Application; event: ApplicationEvent; created: boolean }
  | { ok: false; stage: "input" | "transition" | "storage"; message: string; hint?: string };

/** The status a freshly-created application starts in (SDD §12). */
const INITIAL_STATUS: ApplicationStatus = "discovered";

export function createTrackApplication(deps: TrackApplicationDeps) {
  return function trackApplication(input: TrackApplicationInput): TrackApplicationResult {
    const job = deps.jobs.getById(input.jobId);
    if (!job) {
      return {
        ok: false,
        stage: "input",
        message: `job not found: ${input.jobId}`,
        hint: "import one first: hunt import <url|-|--file>",
      };
    }
    const now = input.now ?? (new Date().toISOString() as Timestamp);
    const applicationId = `app_${fnv1a(input.jobId)}`;

    // Resolve (or create) the application aggregate.
    let application = deps.applications.getById(applicationId);
    let created = false;
    if (!application) {
      application = {
        id: applicationId,
        schemaVersion: SCHEMA_VERSION,
        jobId: input.jobId,
        status: INITIAL_STATUS,
        createdAt: now,
        updatedAt: now,
      };
      try {
        deps.applications.create(application);
        created = true;
      } catch (err) {
        return { ok: false, stage: "storage", message: errMsg(err) };
      }
    }

    // A transition to the initial status right after creation is a no-op the
    // state machine would reject (from === to); treat it as "already there".
    if (input.action.kind === "transition") {
      const check = validateTransition(application.status, input.action.to);
      if (!check.valid) {
        return {
          ok: false,
          stage: "transition",
          message: check.reason,
          ...(created ? {} : { hint: `current status: ${application.status}` }),
        };
      }
    }

    const event = buildEvent(applicationId, application.status, input.action, now);
    let appended: ApplicationEvent;
    try {
      appended = deps.applications.appendEvent(event);
    } catch (err) {
      return { ok: false, stage: "storage", message: errMsg(err) };
    }
    // Re-read so the caller sees the materialized status after a transition.
    const updated = deps.applications.getById(applicationId) ?? application;
    return { ok: true, application: updated, event: appended, created };
  };
}

function buildEvent(
  applicationId: Id,
  currentStatus: ApplicationStatus,
  action: TrackAction,
  occurredAt: Timestamp,
): NewApplicationEvent {
  // Deterministic-ish event id: unique per (application, action, time). Events
  // are append-only and storage assigns the authoritative seq.
  const id = `evt_${fnv1a(`${applicationId}|${action.kind}|${occurredAt}`)}`;
  const base = { id, applicationId, occurredAt };
  switch (action.kind) {
    case "transition":
      return {
        ...base,
        kind: "status_changed",
        data: {
          from: currentStatus,
          to: action.to,
          ...(action.note ? { note: action.note } : {}),
        },
      };
    case "note":
      return { ...base, kind: "note_added", data: { text: action.text } };
    case "attach":
      return {
        ...base,
        kind: "document_attached",
        data: { ref: action.ref, ...(action.label ? { label: action.label } : {}) },
      };
    case "contact":
      return {
        ...base,
        kind: "contact_added",
        data: {
          name: action.name,
          ...(action.role ? { role: action.role } : {}),
          ...(action.email ? { email: action.email } : {}),
          ...(action.url ? { url: action.url } : {}),
        },
      };
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
