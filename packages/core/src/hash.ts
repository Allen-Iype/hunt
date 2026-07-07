/**
 * FNV-1a 32-bit hash, hex-encoded.
 *
 * Used for deterministic fact IDs (ADR-0011): pure, dependency-free, and
 * environment-agnostic (no node:crypto, keeping core portable). NOT for
 * security or for cross-corpus dedup — job dedup hashing (M2) uses SHA-256
 * in the ingestion package.
 */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
