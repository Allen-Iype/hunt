import type { Database } from "better-sqlite3";
import { CompanySchema, type Company, type CompanyRepository, type Id } from "@hunt/core";

export function createCompanyRepository(db: Database): CompanyRepository {
  const upsert = db.prepare(
    `INSERT INTO companies (id, schema_version, name, normalized_key, data, created_at, updated_at)
     VALUES (@id, @schemaVersion, @name, @normalizedKey, @data, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       schema_version = excluded.schema_version,
       name = excluded.name,
       normalized_key = excluded.normalized_key,
       data = excluded.data,
       updated_at = excluded.updated_at`,
  );
  const selectById = db.prepare(`SELECT data FROM companies WHERE id = ?`);
  const selectByKey = db.prepare(`SELECT data FROM companies WHERE normalized_key = ?`);
  const selectAll = db.prepare(`SELECT data FROM companies ORDER BY name`);

  const parse = (row: { data: string }) => CompanySchema.parse(JSON.parse(row.data));

  return {
    save(company: Company): void {
      upsert.run({
        id: company.id,
        schemaVersion: company.schemaVersion,
        name: company.name,
        normalizedKey: company.normalizedKey,
        data: JSON.stringify(company),
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      });
    },

    getById(id: Id): Company | null {
      const row = selectById.get(id) as { data: string } | undefined;
      return row ? parse(row) : null;
    },

    getByNormalizedKey(key: string): Company | null {
      const row = selectByKey.get(key) as { data: string } | undefined;
      return row ? parse(row) : null;
    },

    list(): Company[] {
      return (selectAll.all() as { data: string }[]).map(parse);
    },
  };
}
