import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Response cache (SDD §15) and test replay store (SDD §20) — one mechanism.
 * Keys are content hashes of (task, version, provider, input); values are
 * raw provider text. In "replay" gateway mode a miss is an error, which is
 * what keeps CI deterministic and offline.
 */
export interface ResponseCache {
  get(key: string): string | null;
  put(key: string, value: string): void;
}

export function createFileResponseCache(dir: string): ResponseCache {
  const pathFor = (key: string) => join(dir, `${key}.json`);
  return {
    get(key) {
      const path = pathFor(key);
      if (!existsSync(path)) return null;
      return (JSON.parse(readFileSync(path, "utf8")) as { text: string }).text;
    },
    put(key, value) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(pathFor(key), JSON.stringify({ text: value }, null, 2));
    },
  };
}
