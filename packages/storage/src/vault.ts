import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RawVault } from "@hunt/core";

/**
 * Content-addressed file vault (SDD §12, §14): verbatim raw payloads under
 * vault/raw/<hh>/<sha256>, immutable once written. Fan-out by the first two
 * hash characters keeps directories small.
 */
export function createFileVault(rootDir: string): RawVault {
  const base = join(rootDir, "vault", "raw");

  const pathFor = (hash: string) => join(base, hash.slice(0, 2), hash);

  return {
    put(content: string | Uint8Array): string {
      const bytes =
        typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const path = pathFor(hash);
      if (!existsSync(path)) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes, { flag: "wx" });
      }
      return hash;
    },

    get(hash: string): Uint8Array | null {
      const path = pathFor(hash);
      return existsSync(path) ? readFileSync(path) : null;
    },

    has(hash: string): boolean {
      return existsSync(pathFor(hash));
    },
  };
}
