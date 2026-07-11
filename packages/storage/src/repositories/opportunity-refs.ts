import type { Database } from "better-sqlite3";
import {
  OpportunityRefSchema,
  type Id,
  type OpportunityRef,
  type OpportunityRefRepository,
} from "@hunt/core";

export function createOpportunityRefRepository(db: Database): OpportunityRefRepository {
  const upsert = db.prepare(
    `INSERT INTO opportunity_refs
       (id, source_id, url, query_id, status, relevance, data, discovered_at)
     VALUES (@id, @sourceId, @url, @queryId, @status, @relevance, @data, @discoveredAt)
     ON CONFLICT(id) DO UPDATE SET
       source_id = excluded.source_id,
       query_id = excluded.query_id,
       status = excluded.status,
       relevance = excluded.relevance,
       data = excluded.data`,
  );
  const selectById = db.prepare(`SELECT data FROM opportunity_refs WHERE id = ?`);
  const selectByUrl = db.prepare(`SELECT data FROM opportunity_refs WHERE url = ?`);
  // "New" leads for a search, most relevant first — the discovery view.
  const selectForSearch = db.prepare(
    `SELECT data FROM opportunity_refs
     WHERE query_id = ? AND status = 'new'
     ORDER BY relevance DESC, id ASC`,
  );
  const updateStatus = db.prepare(
    `UPDATE opportunity_refs SET status = @status, data = @data WHERE id = @id`,
  );

  const parse = (row: { data: string }) => OpportunityRefSchema.parse(JSON.parse(row.data));

  return {
    save(ref: OpportunityRef): void {
      upsert.run({
        id: ref.id,
        sourceId: ref.sourceId,
        url: ref.url,
        queryId: ref.queryId,
        status: ref.status,
        relevance: ref.relevance,
        data: JSON.stringify(ref),
        discoveredAt: ref.discoveredAt,
      });
    },
    getById(id: Id): OpportunityRef | null {
      const row = selectById.get(id) as { data: string } | undefined;
      return row ? parse(row) : null;
    },
    findByUrl(url: string): OpportunityRef | null {
      const row = selectByUrl.get(url) as { data: string } | undefined;
      return row ? parse(row) : null;
    },
    listForSearch(queryId: Id): OpportunityRef[] {
      return (selectForSearch.all(queryId) as { data: string }[]).map(parse);
    },
    markStatus(id: Id, status: OpportunityRef["status"]): void {
      const existing = selectById.get(id) as { data: string } | undefined;
      if (!existing) return;
      const ref = { ...parse(existing), status };
      updateStatus.run({ id, status, data: JSON.stringify(ref) });
    },
  };
}
