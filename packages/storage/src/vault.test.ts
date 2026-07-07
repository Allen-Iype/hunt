import { afterEach, describe, expect, it } from "vitest";
import { createFileVault } from "./vault.js";
import { makeTempDir } from "./testing/fixtures.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

function vault() {
  const { dir, cleanup } = makeTempDir();
  cleanups.push(cleanup);
  return createFileVault(dir);
}

describe("file vault", () => {
  it("round-trips content by hash", () => {
    const v = vault();
    const hash = v.put("<html>job posting</html>");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(v.get(hash)!).toString("utf8")).toBe("<html>job posting</html>");
    expect(v.has(hash)).toBe(true);
  });

  it("returns null for unknown hashes", () => {
    const v = vault();
    expect(v.get("0".repeat(64))).toBeNull();
    expect(v.has("0".repeat(64))).toBe(false);
  });

  it("is idempotent: same content → same hash, no error", () => {
    const v = vault();
    const h1 = v.put("same content");
    const h2 = v.put("same content");
    expect(h1).toBe(h2);
  });

  it("hashes strings and their UTF-8 bytes identically", () => {
    const v = vault();
    expect(v.put("héllo")).toBe(v.put(Buffer.from("héllo", "utf8")));
  });

  it("gives distinct content distinct addresses", () => {
    const v = vault();
    expect(v.put("a")).not.toBe(v.put("b"));
  });
});
