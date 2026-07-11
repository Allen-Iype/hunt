import type { Database } from "better-sqlite3";
import type {
  ApplicationRepository,
  CompanyRepository,
  DocumentRepository,
  EnvelopeRepository,
  JobAnalysisRepository,
  JobRepository,
  OpportunityRefRepository,
  ProfileRepository,
  RawVault,
  SavedSearchRepository,
} from "@hunt/core";
import { backupStorage, type BackupResult } from "./backup.js";
import { openDatabase } from "./db.js";
import { createApplicationRepository } from "./repositories/applications.js";
import { createEnvelopeRepository } from "./repositories/envelopes.js";
import { createJobAnalysisRepository } from "./repositories/analyses.js";
import { createCompanyRepository } from "./repositories/companies.js";
import { createDocumentRepository } from "./repositories/documents.js";
import { createJobRepository } from "./repositories/jobs.js";
import { createOpportunityRefRepository } from "./repositories/opportunity-refs.js";
import { createProfileRepository } from "./repositories/profiles.js";
import { createSavedSearchRepository } from "./repositories/saved-searches.js";
import { createFileVault } from "./vault.js";

export { DB_FILENAME, openDatabase } from "./db.js";
export { MIGRATIONS } from "./migrations.js";
export { createFileVault } from "./vault.js";
export { createProfileRepository } from "./repositories/profiles.js";
export { createCompanyRepository } from "./repositories/companies.js";
export { createJobRepository } from "./repositories/jobs.js";
export { createApplicationRepository, InvalidEventError } from "./repositories/applications.js";
export { createEnvelopeRepository } from "./repositories/envelopes.js";
export { createJobAnalysisRepository } from "./repositories/analyses.js";
export { createDocumentRepository } from "./repositories/documents.js";
export { createOpportunityRefRepository } from "./repositories/opportunity-refs.js";
export { createSavedSearchRepository } from "./repositories/saved-searches.js";
export { BackupError, type BackupResult } from "./backup.js";

export interface HuntStorage {
  profiles: ProfileRepository;
  companies: CompanyRepository;
  jobs: JobRepository;
  applications: ApplicationRepository;
  envelopes: EnvelopeRepository;
  analyses: JobAnalysisRepository;
  documents: DocumentRepository;
  savedSearches: SavedSearchRepository;
  opportunityRefs: OpportunityRefRepository;
  vault: RawVault;
  /** Snapshot the DB (VACUUM INTO) + vault + documents into `destDir` (SDD §14). */
  backup(destDir: string): BackupResult;
  close(): void;
}

/** Open all Hunt storage under `rootDir` (default: ~/.hunt, resolved by the caller). */
export function openStorage(rootDir: string): HuntStorage {
  const db: Database = openDatabase(rootDir);
  return {
    profiles: createProfileRepository(db),
    companies: createCompanyRepository(db),
    jobs: createJobRepository(db),
    applications: createApplicationRepository(db),
    envelopes: createEnvelopeRepository(db),
    analyses: createJobAnalysisRepository(db),
    documents: createDocumentRepository(db),
    savedSearches: createSavedSearchRepository(db),
    opportunityRefs: createOpportunityRefRepository(db),
    vault: createFileVault(rootDir),
    backup: (destDir: string) => backupStorage(db, rootDir, destDir),
    close: () => db.close(),
  };
}
