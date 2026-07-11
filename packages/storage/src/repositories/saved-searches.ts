import type { Database } from "better-sqlite3";
import { SavedSearchSchema, type Id, type SavedSearch, type SavedSearchRepository } from "@hunt/core";

export function createSavedSearchRepository(db: Database): SavedSearchRepository {
  const upsert = db.prepare(
    `INSERT INTO saved_searches (id, name, data, created_at)
     VALUES (@id, @name, @data, @createdAt)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       data = excluded.data`,
  );
  const selectById = db.prepare(`SELECT data FROM saved_searches WHERE id = ?`);
  const selectAll = db.prepare(`SELECT data FROM saved_searches ORDER BY created_at DESC`);
  const deleteById = db.prepare(`DELETE FROM saved_searches WHERE id = ?`);

  const parse = (row: { data: string }) => SavedSearchSchema.parse(JSON.parse(row.data));

  return {
    save(search: SavedSearch): void {
      upsert.run({
        id: search.id,
        name: search.name,
        data: JSON.stringify(search),
        createdAt: search.createdAt,
      });
    },
    getById(id: Id): SavedSearch | null {
      const row = selectById.get(id) as { data: string } | undefined;
      return row ? parse(row) : null;
    },
    list(): SavedSearch[] {
      return (selectAll.all() as { data: string }[]).map(parse);
    },
    delete(id: Id): void {
      deleteById.run(id);
    },
  };
}
