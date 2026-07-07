import type { Database } from "better-sqlite3";
import { JobAnalysisSchema, type Id, type JobAnalysis, type JobAnalysisRepository } from "@hunt/core";

export function createJobAnalysisRepository(db: Database): JobAnalysisRepository {
  const upsert = db.prepare(
    `INSERT INTO job_analyses (id, job_id, profile_version, analyzer_version, fit_score, data, created_at)
     VALUES (@id, @jobId, @profileVersion, @analyzerVersion, @fitScore, @data, @createdAt)
     ON CONFLICT(id) DO UPDATE SET
       profile_version = excluded.profile_version,
       analyzer_version = excluded.analyzer_version,
       fit_score = excluded.fit_score,
       data = excluded.data,
       created_at = excluded.created_at`,
  );
  const selectById = db.prepare(`SELECT data FROM job_analyses WHERE id = ?`);
  const selectLatest = db.prepare(
    `SELECT data FROM job_analyses WHERE job_id = ? ORDER BY created_at DESC, id LIMIT 1`,
  );
  const selectForJob = db.prepare(
    `SELECT data FROM job_analyses WHERE job_id = ? ORDER BY created_at DESC, id`,
  );

  const parse = (row: { data: string }) => JobAnalysisSchema.parse(JSON.parse(row.data));

  return {
    save(analysis: JobAnalysis): void {
      upsert.run({
        id: analysis.id,
        jobId: analysis.jobId,
        profileVersion: analysis.profileVersion,
        analyzerVersion: analysis.analyzerVersion,
        fitScore: analysis.fitScore,
        data: JSON.stringify(analysis),
        createdAt: analysis.createdAt,
      });
    },

    getById(id: Id): JobAnalysis | null {
      const row = selectById.get(id) as { data: string } | undefined;
      return row ? parse(row) : null;
    },

    getLatestForJob(jobId: Id): JobAnalysis | null {
      const row = selectLatest.get(jobId) as { data: string } | undefined;
      return row ? parse(row) : null;
    },

    listForJob(jobId: Id): JobAnalysis[] {
      return (selectForJob.all(jobId) as { data: string }[]).map(parse);
    },
  };
}
