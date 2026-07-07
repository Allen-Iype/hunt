import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  EnvelopeRepository,
  ExtractJobPort,
  RawEnvelope,
  RawVault,
} from "@hunt/core";

/** Test-support only (excluded from the build). */

export function loadFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

export function memoryVault(): RawVault & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    put(content) {
      const text = typeof content === "string" ? content : Buffer.from(content).toString("utf8");
      const hash = createHash("sha256").update(text, "utf8").digest("hex");
      store.set(hash, text);
      return hash;
    },
    get(hash) {
      const value = store.get(hash);
      return value === undefined ? null : Buffer.from(value, "utf8");
    },
    has: (hash) => store.has(hash),
  };
}

export function memoryEnvelopes(): EnvelopeRepository & { store: Map<string, RawEnvelope> } {
  const store = new Map<string, RawEnvelope>();
  return {
    store,
    save: (e) => void store.set(e.hash, e),
    getByHash: (hash) => store.get(hash) ?? null,
  };
}

export const FIXED_NOW = "2026-07-07T10:00:00Z";
export const fixedClock = () => FIXED_NOW;

/** ExtractJobPort stub returning a canned draft (or failure). */
export function fakeExtractor(
  result: Awaited<ReturnType<ExtractJobPort["extractJob"]>>,
): ExtractJobPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async extractJob({ text }) {
      calls.push(text);
      return result;
    },
  };
}
