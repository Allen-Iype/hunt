/**
 * Job dedup fingerprint (SDD §9): a deterministic canonical string over the
 * fields that identify "the same posting". The ingestion layer hashes this
 * with SHA-256 to produce Job.dedupHash; core owns canonicalization, not
 * hashing, so it stays dependency-free.
 */

export interface DedupInput {
  companyName: string;
  title: string;
  locations: readonly string[];
  descriptionText: string;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function jobDedupFingerprint(input: DedupInput): string {
  const locations = input.locations.map(norm).sort().join(",");
  return [norm(input.companyName), norm(input.title), locations, norm(input.descriptionText)].join(
    "|",
  );
}
