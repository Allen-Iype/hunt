import type { Database } from "better-sqlite3";
import {
  ApplicationEventSchema,
  ApplicationSchema,
  validateTransition,
  type Application,
  type ApplicationEvent,
  type ApplicationRepository,
  type Id,
  type NewApplicationEvent,
} from "@hunt/core";

/** Thrown when an appended event would corrupt the event log's integrity. */
export class InvalidEventError extends Error {
  override readonly name = "InvalidEventError";
}

export function createApplicationRepository(db: Database): ApplicationRepository {
  const insert = db.prepare(
    `INSERT INTO applications (id, schema_version, job_id, status, created_at, updated_at)
     VALUES (@id, @schemaVersion, @jobId, @status, @createdAt, @updatedAt)`,
  );
  const selectById = db.prepare(`SELECT * FROM applications WHERE id = ?`);
  const selectAll = db.prepare(`SELECT * FROM applications ORDER BY created_at DESC, id`);
  const nextSeq = db.prepare(
    `SELECT COALESCE(MAX(seq), -1) + 1 AS seq FROM application_events WHERE application_id = ?`,
  );
  const insertEvent = db.prepare(
    `INSERT INTO application_events (id, application_id, seq, kind, data, occurred_at)
     VALUES (@id, @applicationId, @seq, @kind, @data, @occurredAt)`,
  );
  const updateStatus = db.prepare(
    `UPDATE applications SET status = @status, updated_at = @updatedAt WHERE id = @id`,
  );
  const selectEvents = db.prepare(
    `SELECT * FROM application_events WHERE application_id = ? ORDER BY seq`,
  );

  interface ApplicationRow {
    id: string;
    schema_version: number;
    job_id: string;
    status: string;
    created_at: string;
    updated_at: string;
  }
  const toApplication = (row: ApplicationRow): Application =>
    ApplicationSchema.parse({
      id: row.id,
      schemaVersion: row.schema_version,
      jobId: row.job_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });

  interface EventRow {
    id: string;
    application_id: string;
    seq: number;
    kind: string;
    data: string;
    occurred_at: string;
  }
  const toEvent = (row: EventRow): ApplicationEvent =>
    ApplicationEventSchema.parse({
      id: row.id,
      applicationId: row.application_id,
      seq: row.seq,
      kind: row.kind,
      data: JSON.parse(row.data),
      occurredAt: row.occurred_at,
    });

  const appendEventTx = db.transaction((event: NewApplicationEvent): ApplicationEvent => {
    const appRow = selectById.get(event.applicationId) as ApplicationRow | undefined;
    if (!appRow) {
      throw new InvalidEventError(`application not found: ${event.applicationId}`);
    }

    if (event.kind === "status_changed") {
      if (event.data.from !== appRow.status) {
        throw new InvalidEventError(
          `event "from" is "${event.data.from}" but application is "${appRow.status}"`,
        );
      }
      const check = validateTransition(event.data.from, event.data.to);
      if (!check.valid) {
        throw new InvalidEventError(check.reason);
      }
    }

    const { seq } = nextSeq.get(event.applicationId) as { seq: number };
    const full = ApplicationEventSchema.parse({ ...event, seq });
    insertEvent.run({
      id: full.id,
      applicationId: full.applicationId,
      seq: full.seq,
      kind: full.kind,
      data: JSON.stringify(full.data),
      occurredAt: full.occurredAt,
    });
    if (full.kind === "status_changed") {
      updateStatus.run({
        id: full.applicationId,
        status: full.data.to,
        updatedAt: full.occurredAt,
      });
    }
    return full;
  });

  return {
    create(application: Application): void {
      insert.run({
        id: application.id,
        schemaVersion: application.schemaVersion,
        jobId: application.jobId,
        status: application.status,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      });
    },

    getById(id: Id): Application | null {
      const row = selectById.get(id) as ApplicationRow | undefined;
      return row ? toApplication(row) : null;
    },

    list(): Application[] {
      return (selectAll.all() as ApplicationRow[]).map(toApplication);
    },

    appendEvent(event: NewApplicationEvent): ApplicationEvent {
      return appendEventTx(event);
    },

    listEvents(applicationId: Id): ApplicationEvent[] {
      return (selectEvents.all(applicationId) as EventRow[]).map(toEvent);
    },
  };
}
