import {
  SCHEMA_VERSION,
  fnv1a,
  normalizeCompanyKey,
  type Company,
  type CompanyRepository,
  type ExtractionTier,
  type IngestJobInput,
  type Job,
  type JobIngestor,
  type JobRepository,
} from "@hunt/core";

/**
 * ImportJob capability (SDD §13): ingest → dedup → resolve company → persist.
 * Sources, tiers, and parsers live behind the JobIngestor port; this
 * capability only orchestrates.
 */

export type ImportJobResult =
  | {
      ok: true;
      job: Job;
      company: Company;
      extractionTier: ExtractionTier;
      aiUsed: boolean;
      dedup: "new" | "updated-existing";
    }
  | { ok: false; stage: "ingest" | "storage"; message: string; hint?: string };

export interface ImportJobDeps {
  ingestor: JobIngestor;
  jobs: JobRepository;
  companies: CompanyRepository;
}

export function createImportJob(deps: ImportJobDeps) {
  return async function importJob(input: IngestJobInput): Promise<ImportJobResult> {
    const ingested = await deps.ingestor.ingest(input);
    if (!ingested.ok) {
      return {
        ok: false,
        stage: "ingest",
        message: `${ingested.stage}: ${ingested.message}`,
        ...(ingested.hint ? { hint: ingested.hint } : {}),
      };
    }

    try {
      const company = resolveCompany(deps.companies, ingested.job);
      const existing = deps.jobs.findByDedupHash(ingested.job.dedupHash);
      const dedup = existing ? "updated-existing" : "new";
      // Re-import updates provenance and freshness, never duplicates (SDD §9).
      const job: Job = existing
        ? {
            ...existing,
            companyId: company.id,
            provenance: ingested.job.provenance,
            updatedAt: ingested.job.updatedAt,
          }
        : { ...ingested.job, companyId: company.id };
      deps.jobs.save(job);
      return {
        ok: true,
        job,
        company,
        extractionTier: ingested.job.provenance.extractionTier,
        aiUsed: ingested.aiUsed,
        dedup,
      };
    } catch (err) {
      return {
        ok: false,
        stage: "storage",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

function resolveCompany(companies: CompanyRepository, job: Job): Company {
  const normalizedKey = normalizeCompanyKey(job.companyName);
  const existing = companies.getByNormalizedKey(normalizedKey);
  if (existing) return existing;
  const company: Company = {
    id: `com_${fnv1a(normalizedKey)}`,
    schemaVersion: SCHEMA_VERSION,
    name: job.companyName,
    normalizedKey,
    createdAt: job.createdAt,
    updatedAt: job.createdAt,
  };
  companies.save(company);
  return company;
}
