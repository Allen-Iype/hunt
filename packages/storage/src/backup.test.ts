import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openStorage, type HuntStorage } from "./index.js";
import { makeJob, makeTempDir } from "./testing/fixtures.js";

let storage: HuntStorage;
let root: string;
let cleanup: () => void;

beforeEach(() => {
  const tmp = makeTempDir();
  root = tmp.dir;
  cleanup = tmp.cleanup;
  storage = openStorage(root);
});
afterEach(() => {
  storage.close();
  cleanup();
});

describe("backup", () => {
  it("snapshots the database and the vault into a fresh directory", () => {
    storage.jobs.save(makeJob());
    storage.vault.put("raw payload bytes");
    const dest = join(root, "backup-out");

    const result = storage.backup(dest);

    expect(existsSync(join(dest, "hunt.db"))).toBe(true);
    expect(result.vaultCopied).toBe(true);
    // The snapshot is a real, openable Hunt DB carrying the same data.
    const restored = openStorage(dest);
    try {
      expect(restored.jobs.getById("job_01")).not.toBeNull();
    } finally {
      restored.close();
    }
  });

  it("refuses to overwrite an existing db in the target", () => {
    const dest = join(root, "backup-out");
    storage.backup(dest);
    expect(() => storage.backup(dest)).toThrowError(/already has a hunt\.db/);
  });
});
