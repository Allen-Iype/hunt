import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DB_FILENAME, openDatabase } from "./db.js";
import { MIGRATIONS } from "./migrations.js";
import { makeTempDir } from "./testing/fixtures.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

function tempDir(): string {
  const { dir, cleanup } = makeTempDir();
  cleanups.push(cleanup);
  return dir;
}

const M1 = `CREATE TABLE one (id TEXT PRIMARY KEY);`;
const M2 = `CREATE TABLE two (id TEXT PRIMARY KEY);`;

describe("openDatabase", () => {
  it("creates the database and applies all migrations", () => {
    const dir = tempDir();
    const db = openDatabase(dir);
    expect(db.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    db.close();
  });

  it("is idempotent: reopening applies nothing and keeps data", () => {
    const dir = tempDir();
    const db1 = openDatabase(dir, [M1]);
    db1.prepare(`INSERT INTO one (id) VALUES ('a')`).run();
    db1.close();

    const db2 = openDatabase(dir, [M1]);
    expect(db2.prepare(`SELECT COUNT(*) AS n FROM one`).get()).toEqual({ n: 1 });
    expect(existsSync(join(dir, `${DB_FILENAME}.backup-v1`))).toBe(false);
    db2.close();
  });

  it("backs up the existing database before migrating, then migrates", () => {
    const dir = tempDir();
    const db1 = openDatabase(dir, [M1]);
    db1.prepare(`INSERT INTO one (id) VALUES ('a')`).run();
    db1.close();

    const db2 = openDatabase(dir, [M1, M2]);
    expect(db2.pragma("user_version", { simple: true })).toBe(2);
    expect(db2.prepare(`SELECT COUNT(*) AS n FROM two`).get()).toEqual({ n: 0 });
    expect(db2.prepare(`SELECT COUNT(*) AS n FROM one`).get()).toEqual({ n: 1 });
    expect(existsSync(join(dir, `${DB_FILENAME}.backup-v1`))).toBe(true);
    db2.close();
  });

  it("takes no backup for a brand-new database", () => {
    const dir = tempDir();
    openDatabase(dir, [M1]).close();
    expect(existsSync(join(dir, `${DB_FILENAME}.backup-v0`))).toBe(false);
  });

  it("refuses to open a database newer than the build", () => {
    const dir = tempDir();
    openDatabase(dir, [M1, M2]).close();
    expect(() => openDatabase(dir, [M1])).toThrow(/newer than this build/);
  });
});
