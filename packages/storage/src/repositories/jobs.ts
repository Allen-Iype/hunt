import type { Database } from "better-sqlite3";
import { JobSchema, type Id, type Job, type JobRepository } from "@hunt/core";

export function createJobRepository(db: Database): JobRepository {
  const upsert = db.prepare(
    `INSERT INTO jobs (id, schema_version, dedup_hash, company_id, company_name,
                       title, seniority, posted_at, data, created_at, updated_at)
     VALUES (@id, @schemaVersion, @dedupHash, @companyId, @companyName,
             @title, @seniority, @postedAt, @data, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       schema_version = excluded.schema_version,
       dedup_hash = excluded.dedup_hash,
       company_id = excluded.company_id,
       company_name = excluded.company_name,
       title = excluded.title,
       seniority = excluded.seniority,
       posted_at = excluded.posted_at,
       data = excluded.data,
       updated_at = excluded.updated_at`,
  );
  const selectById = db.prepare(`SELECT data FROM jobs WHERE id = ?`);
  const selectByHash = db.prepare(`SELECT data FROM jobs WHERE dedup_hash = ?`);
  const selectAll = db.prepare(`SELECT data FROM jobs ORDER BY created_at DESC, id`);

  const parse = (row: { data: string }) => JobSchema.parse(JSON.parse(row.data));

  return {
    save(job: Job): void {
      upsert.run({
        id: job.id,
        schemaVersion: job.schemaVersion,
        dedupHash: job.dedupHash,
        companyId: job.companyId ?? null,
        companyName: job.companyName,
        title: job.title,
        seniority: job.seniority,
        postedAt: job.postedAt ?? null,
        data: JSON.stringify(job),
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    },

    getById(id: Id): Job | null {
      const row = selectById.get(id) as { data: string } | undefined;
      return row ? parse(row) : null;
    },

    findByDedupHash(hash: string): Job | null {
      const row = selectByHash.get(hash) as { data: string } | undefined;
      return row ? parse(row) : null;
    },

    list(): Job[] {
      return (selectAll.all() as { data: string }[]).map(parse);
    },
  };
}
