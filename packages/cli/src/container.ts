import { homedir } from "node:os";
import { join } from "node:path";
import {
  createAnalyzeJob,
  createApproveDocument,
  createDiscoverJobs,
  createGenerateCoverLetter,
  createGenerateResume,
  createGetProfile,
  createImportJob,
  createImportOpportunityRef,
  createImportProfile,
  createManageSavedSearch,
  createQueryApplications,
  createTrackApplication,
} from "@hunt/capabilities";
import { DEFAULT_PROFILE_ID } from "@hunt/core";
import { createDiscoverer, createJobIngestor } from "@hunt/ingestion";
import { createHtmlRenderer } from "@hunt/render";
import { openStorage, type HuntStorage } from "@hunt/storage";
import { buildAiSetup } from "./ai-config.js";

/**
 * Composition root (SDD §6, §7): the one place concrete adapters are
 * constructed and wired into capabilities. Manual wiring, no DI framework.
 */

export function resolveHuntHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.HUNT_HOME && env.HUNT_HOME.length > 0
    ? env.HUNT_HOME
    : join(homedir(), ".hunt");
}

export interface Container {
  storage: HuntStorage;
  importProfile: ReturnType<typeof createImportProfile>;
  getProfile: ReturnType<typeof createGetProfile>;
  importJob: ReturnType<typeof createImportJob>;
  analyzeJob: ReturnType<typeof createAnalyzeJob>;
  generateResume: ReturnType<typeof createGenerateResume>;
  generateCoverLetter: ReturnType<typeof createGenerateCoverLetter>;
  approveDocument: ReturnType<typeof createApproveDocument>;
  trackApplication: ReturnType<typeof createTrackApplication>;
  queries: ReturnType<typeof createQueryApplications>;
  discoverJobs: ReturnType<typeof createDiscoverJobs>;
  importOpportunityRef: ReturnType<typeof createImportOpportunityRef>;
  savedSearches: ReturnType<typeof createManageSavedSearch>;
  aiConfigError?: string;
  close(): void;
}

export function createContainer(
  huntHome: string,
  env: NodeJS.ProcessEnv = process.env,
): Container {
  const storage = openStorage(huntHome);
  const ai = buildAiSetup(huntHome, env);
  const render = createHtmlRenderer();
  const ingestor = createJobIngestor({
    vault: storage.vault,
    envelopes: storage.envelopes,
    extractJob: ai.extractor,
  });
  const discoverer = createDiscoverer();
  const importJob = createImportJob({ ingestor, jobs: storage.jobs, companies: storage.companies });
  return {
    storage,
    importProfile: createImportProfile({ profiles: storage.profiles }),
    getProfile: createGetProfile({ profiles: storage.profiles }),
    importJob,
    analyzeJob: createAnalyzeJob({
      jobs: storage.jobs,
      profiles: storage.profiles,
      analyses: storage.analyses,
      insights: ai.insights,
    }),
    generateResume: createGenerateResume({
      jobs: storage.jobs,
      profiles: storage.profiles,
      analyses: storage.analyses,
      documents: storage.documents,
      render,
      composer: ai.resumeComposer,
    }),
    generateCoverLetter: createGenerateCoverLetter({
      jobs: storage.jobs,
      profiles: storage.profiles,
      analyses: storage.analyses,
      documents: storage.documents,
      render,
      composer: ai.coverLetterComposer,
    }),
    approveDocument: createApproveDocument({ documents: storage.documents }),
    trackApplication: createTrackApplication({
      applications: storage.applications,
      jobs: storage.jobs,
    }),
    queries: createQueryApplications({
      jobs: storage.jobs,
      applications: storage.applications,
      analyses: storage.analyses,
      documents: storage.documents,
    }),
    discoverJobs: createDiscoverJobs({
      discovery: discoverer,
      savedSearches: storage.savedSearches,
      opportunityRefs: storage.opportunityRefs,
      jobs: storage.jobs,
      profiles: storage.profiles,
      profileId: DEFAULT_PROFILE_ID,
    }),
    importOpportunityRef: createImportOpportunityRef({
      opportunityRefs: storage.opportunityRefs,
      importJob,
    }),
    savedSearches: createManageSavedSearch({ savedSearches: storage.savedSearches }),
    ...("configError" in ai && ai.configError ? { aiConfigError: ai.configError } : {}),
    close: () => storage.close(),
  };
}
