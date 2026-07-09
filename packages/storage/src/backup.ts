import type { Database } from "better-sqlite3";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DB_FILENAME } from "./db.js";

/**
 * `hunt backup` support (SDD §14, §26). Produces a consistent, self-contained
 * copy of a Hunt home under `destDir`:
 *   - the database via `VACUUM INTO` (a clean snapshot even with WAL active —
 *     no partial pages, no separate -wal/-shm to reconcile),
 *   - the content-addressed raw vault (immutable payloads),
 *   - the user-facing rendered documents.
 * An integrity check runs first; a corrupt source aborts the backup rather
 * than propagating corruption (SDD §23 SQLite-corruption mitigation).
 *
 * The profile.yaml and config live in the same home and are copied by the
 * caller-facing directory copy in the CLI; this helper owns the DB + vault,
 * the two things that need engine-aware handling.
 */

export interface BackupResult {
  dbPath: string;
  vaultCopied: boolean;
  documentsCopied: boolean;
}

export class BackupError extends Error {
  override readonly name = "BackupError";
}

export function backupStorage(db: Database, rootDir: string, destDir: string): BackupResult {
  const integrity = db.pragma("integrity_check", { simple: true }) as string;
  if (integrity !== "ok") {
    throw new BackupError(`database failed integrity check ("${integrity}") — backup aborted`);
  }

  mkdirSync(destDir, { recursive: true });
  const dbDest = join(destDir, DB_FILENAME);
  // VACUUM INTO refuses to overwrite an existing file.
  if (existsSync(dbDest)) {
    throw new BackupError(`backup target already has a ${DB_FILENAME}: ${dbDest}`);
  }
  db.exec(`VACUUM INTO '${dbDest.replaceAll("'", "''")}'`);

  const vaultSrc = join(rootDir, "vault");
  let vaultCopied = false;
  if (existsSync(vaultSrc)) {
    cpSync(vaultSrc, join(destDir, "vault"), { recursive: true });
    vaultCopied = true;
  }

  const docsSrc = join(rootDir, "documents");
  let documentsCopied = false;
  if (existsSync(docsSrc)) {
    cpSync(docsSrc, join(destDir, "documents"), { recursive: true });
    documentsCopied = true;
  }

  return { dbPath: dbDest, vaultCopied, documentsCopied };
}
