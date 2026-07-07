import type { Database } from "better-sqlite3";
import type {
  ApplicationRepository,
  CompanyRepository,
  DocumentRepository,
  EnvelopeRepository,
  JobAnalysisRepository,
  JobRepository,
  ProfileRepository,
  RawVault,
} from "@hunt/core";
import { openDatabase } from "./db.js";
import { createApplicationRepository } from "./repositories/applications.js";
import { createEnvelopeRepository } from "./repositories/envelopes.js";
import { createJobAnalysisRepository } from "./repositories/analyses.js";
import { createCompanyRepository } from "./repositories/companies.js";
import { createDocumentRepository } from "./repositories/documents.js";
import { createJobRepository } from "./repositories/jobs.js";
import { createProfileRepository } from "./repositories/profiles.js";
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

export interface HuntStorage {
  profiles: ProfileRepository;
  companies: CompanyRepository;
  jobs: JobRepository;
  applications: ApplicationRepository;
  envelopes: EnvelopeRepository;
  analyses: JobAnalysisRepository;
  documents: DocumentRepository;
  vault: RawVault;
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
    vault: createFileVault(rootDir),
    close: () => db.close(),
  };
}
