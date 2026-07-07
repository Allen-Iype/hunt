import type { Database } from "better-sqlite3";
import {
  GeneratedDocumentSchema,
  type DocumentKind,
  type DocumentRepository,
  type GeneratedDocument,
  type Id,
} from "@hunt/core";

/**
 * Generated-document repository (SDD §12, §17). Documents are immutable
 * versions; `save` inserts or replaces by id (a re-render of the same
 * document id refreshes its render_path/status). The full canonical model is
 * re-validated on read.
 */
export function createDocumentRepository(db: Database): DocumentRepository {
  const upsert = db.prepare(
    `INSERT INTO documents (id, job_id, application_id, kind, status, render_path, data, created_at)
     VALUES (@id, @jobId, @applicationId, @kind, @status, @renderPath, @data, @createdAt)
     ON CONFLICT(id) DO UPDATE SET
       application_id = excluded.application_id,
       status = excluded.status,
       render_path = excluded.render_path,
       data = excluded.data`,
  );
  const selectById = db.prepare(`SELECT data FROM documents WHERE id = ?`);
  const selectForJob = db.prepare(
    `SELECT data FROM documents WHERE job_id = ? ORDER BY created_at DESC, id`,
  );
  const selectLatestOfKind = db.prepare(
    `SELECT data FROM documents WHERE job_id = ? AND kind = ? ORDER BY created_at DESC, id LIMIT 1`,
  );

  const parse = (row: { data: string }) => GeneratedDocumentSchema.parse(JSON.parse(row.data));

  return {
    save(document: GeneratedDocument): void {
      upsert.run({
        id: document.id,
        jobId: document.jobId,
        applicationId: document.applicationId ?? null,
        kind: document.kind,
        status: document.status,
        renderPath: document.renderPath ?? null,
        data: JSON.stringify(document),
        createdAt: document.createdAt,
      });
    },

    getById(id: Id): GeneratedDocument | null {
      const row = selectById.get(id) as { data: string } | undefined;
      return row ? parse(row) : null;
    },

    listForJob(jobId: Id): GeneratedDocument[] {
      return (selectForJob.all(jobId) as { data: string }[]).map(parse);
    },

    getLatestForJob(jobId: Id, kind: DocumentKind): GeneratedDocument | null {
      const row = selectLatestOfKind.get(jobId, kind) as { data: string } | undefined;
      return row ? parse(row) : null;
    },
  };
}
