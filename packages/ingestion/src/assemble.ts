import { createHash } from "node:crypto";
import {
  JobSchema,
  SCHEMA_VERSION,
  jobDedupFingerprint,
  type ExtractedJobDraft,
  type ExtractionTier,
  type Job,
  type RawEnvelope,
} from "@hunt/core";
import { normalizeDate } from "./jsonld.js";

/**
 * Deterministic canonical assembly (SDD §9): system fields — id, dedup hash,
 * provenance, timestamps — are computed here, never extracted. The job id
 * derives from the dedup hash, so re-ingesting identical content yields the
 * identical job.
 */
export function assembleJob(args: {
  draft: ExtractedJobDraft;
  descriptionText: string;
  envelope: RawEnvelope;
  tier: ExtractionTier;
  now: string;
}): Job {
  const { draft, descriptionText, envelope, tier, now } = args;

  const dedupHash = createHash("sha256")
    .update(
      jobDedupFingerprint({
        companyName: draft.companyName,
        title: draft.title,
        locations: draft.locations,
        descriptionText,
      }),
    )
    .digest("hex");

  return JobSchema.parse({
    id: `job_${dedupHash.slice(0, 12)}`,
    schemaVersion: SCHEMA_VERSION,
    title: draft.title,
    companyName: draft.companyName,
    locations: draft.locations,
    workplaceType: draft.workplaceType,
    employmentType: draft.employmentType,
    seniority: draft.seniority,
    ...(draft.compensationRaw ? { compensation: { raw: draft.compensationRaw } } : {}),
    descriptionText,
    requirements: draft.requirements.map((r, i) => ({
      id: `req_${i + 1}`,
      text: r.text,
      kind: r.kind,
    })),
    responsibilities: draft.responsibilities.map((text, i) => ({
      id: `res_${i + 1}`,
      text,
      kind: "unknown",
    })),
    skills: draft.skills,
    ...(normalizeDate(draft.postedAt) ? { postedAt: normalizeDate(draft.postedAt) } : {}),
    dedupHash,
    provenance: {
      sourceId: envelope.sourceId,
      adapterVersion: envelope.adapterVersion,
      inputRef: envelope.inputRef,
      envelopeHash: envelope.hash,
      extractionTier: tier,
      fetchedAt: envelope.fetchedAt,
      normalizedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  });
}
