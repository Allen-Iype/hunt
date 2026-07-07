import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS } from "./migrations.js";

export const DB_FILENAME = "hunt.db";

/**
 * Open (creating if needed) the Hunt database under `rootDir` and bring it
 * to the current schema version.
 *
 * Migration policy (SDD §14): forward-only, applied automatically, with an
 * automatic backup of the database file taken before any migration runs on
 * an existing database.
 */
export function openDatabase(
  rootDir: string,
  migrations: readonly string[] = MIGRATIONS,
): Database.Database {
  mkdirSync(rootDir, { recursive: true });
  const dbPath = join(rootDir, DB_FILENAME);
  const existedBefore = existsSync(dbPath);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");

  const current = db.pragma("user_version", { simple: true }) as number;
  if (current > migrations.length) {
    db.close();
    throw new Error(
      `database schema version ${current} is newer than this build supports (${migrations.length}); ` +
        `refusing to open — upgrade Hunt`,
    );
  }

  if (current < migrations.length) {
    if (existedBefore && current > 0) {
      // Consistent snapshot even under WAL, in one synchronous statement.
      // If a backup for this version already exists (a previous attempt at
      // this same upgrade), it is still a valid pre-upgrade snapshot — keep it.
      const backupPath = `${dbPath}.backup-v${current}`;
      if (!existsSync(backupPath)) {
        db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
      }
    }
    const applyAll = db.transaction(() => {
      for (let v = current; v < migrations.length; v++) {
        db.exec(migrations[v]!);
        db.pragma(`user_version = ${v + 1}`);
      }
    });
    applyAll();
  }

  return db;
}
