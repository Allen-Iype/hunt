import type { Database } from "better-sqlite3";
import { ProfileSchema, type Id, type Profile, type ProfileRepository } from "@hunt/core";

/**
 * Reads re-validate against the canonical schema so a corrupted or
 * hand-edited row surfaces as a loud error, never as bad data downstream.
 * (Same policy in every repository.)
 */
export function createProfileRepository(db: Database): ProfileRepository {
  const upsert = db.prepare(
    `INSERT INTO profiles (id, schema_version, data, updated_at)
     VALUES (@id, @schemaVersion, @data, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       schema_version = excluded.schema_version,
       data = excluded.data,
       updated_at = excluded.updated_at`,
  );
  const selectById = db.prepare(`SELECT data FROM profiles WHERE id = ?`);

  return {
    save(profile: Profile): void {
      upsert.run({
        id: profile.id,
        schemaVersion: profile.schemaVersion,
        data: JSON.stringify(profile),
        updatedAt: profile.updatedAt,
      });
    },

    get(id: Id): Profile | null {
      const row = selectById.get(id) as { data: string } | undefined;
      return row ? ProfileSchema.parse(JSON.parse(row.data)) : null;
    },
  };
}
