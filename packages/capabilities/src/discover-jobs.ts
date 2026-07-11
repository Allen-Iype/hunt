import {
  OpportunityRefSchema,
  opportunityRefId,
  rankOpportunity,
  type DiscoveryPort,
  type Id,
  type JobRepository,
  type OpportunityRef,
  type OpportunityRefRepository,
  type ProfileRepository,
  type SavedSearch,
  type SavedSearchRepository,
} from "@hunt/core";

/**
 * DiscoverJobs capability (ADR-0015): the "help me find jobs" entry point.
 *
 * Flow: load the saved search → DiscoveryPort produces leads from the watched
 * boards → dedup (skip already-imported jobs and already-handled refs) → rank
 * each lead deterministically by stated intent (profile OPTIONAL) → persist as
 * new OpportunityRefs → return the ranked, new leads.
 *
 * Discovery PROPOSES; the user imports (importOpportunityRef). No AI, no
 * normalization here — leads stay leads (ADR-0015 invariant).
 */

export interface DiscoverJobsDeps {
  discovery: DiscoveryPort;
  savedSearches: SavedSearchRepository;
  opportunityRefs: OpportunityRefRepository;
  jobs: JobRepository;
  profiles: ProfileRepository;
  /** Injectable clock for deterministic tests. */
  clock?: () => string;
  /** Optional profile id; discovery works with no profile (ADR-0015). */
  profileId?: Id;
}

export type DiscoverJobsResult =
  | {
      ok: true;
      search: SavedSearch;
      /** New, ranked leads (most relevant first). */
      refs: OpportunityRef[];
      /** Leads seen but skipped because already imported/handled. */
      skipped: number;
      usedProfile: boolean;
    }
  | { ok: false; stage: "input" | "discover"; message: string; hint?: string };

export function createDiscoverJobs(deps: DiscoverJobsDeps) {
  const clock = deps.clock ?? (() => new Date().toISOString());
  return async function discoverJobs(searchId: Id): Promise<DiscoverJobsResult> {
    const search = deps.savedSearches.getById(searchId);
    if (!search) {
      return { ok: false, stage: "input", message: `no saved search "${searchId}"`, hint: "add one with: hunt searches add" };
    }

    const result = await deps.discovery.discover({ sources: search.sources, query: search.query });
    if (!result.ok) {
      return { ok: false, stage: "discover", message: result.message, ...(result.hint ? { hint: result.hint } : {}) };
    }

    // Profile is an optional enrichment signal (ADR-0015): absent → rank on intent alone.
    const profile = deps.profileId ? deps.profiles.get(deps.profileId) : null;
    const now = clock();
    const fresh: OpportunityRef[] = [];
    let skipped = 0;

    for (const lead of result.refs) {
      // Dedup: already imported as a job, or already handled as a ref.
      const existingRef = deps.opportunityRefs.findByUrl(lead.url);
      if (existingRef && existingRef.status !== "new") {
        skipped++;
        continue;
      }

      const relevance = rankOpportunity(lead, search, profile ?? undefined);
      const ref = OpportunityRefSchema.parse({
        id: opportunityRefId(lead.sourceId, lead.url),
        sourceId: lead.sourceId,
        url: lead.url,
        title: lead.title,
        ...(lead.companyName ? { companyName: lead.companyName } : {}),
        ...(lead.location ? { location: lead.location } : {}),
        ...(lead.snippet ? { snippet: lead.snippet } : {}),
        queryId: search.id,
        discoveredAt: now,
        status: "new",
        relevance,
      });
      deps.opportunityRefs.save(ref);
      fresh.push(ref);
    }

    fresh.sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id));
    return { ok: true, search, refs: fresh, skipped, usedProfile: profile !== null };
  };
}

/**
 * Import a discovered lead into a canonical Job (ADR-0015): discovery emits
 * refs, the user imports them. This reuses the EXISTING import pipeline
 * unchanged — the ref's URL becomes a normal url import — then marks the ref
 * `imported` so it won't resurface. No normalization lives here.
 */
export interface ImportOpportunityRefDeps {
  opportunityRefs: OpportunityRefRepository;
  importJob: (input: { kind: "url"; url: string }) => Promise<ImportJobLike>;
}

/** The subset of ImportJob's result this capability needs (kept structural to avoid a cycle). */
export type ImportJobLike =
  | { ok: true; job: { id: string; title: string; companyName: string }; dedup: "new" | "updated-existing" }
  | { ok: false; stage: string; message: string; hint?: string };

export type ImportOpportunityRefResult =
  | { ok: true; job: { id: string; title: string; companyName: string }; dedup: "new" | "updated-existing" }
  | { ok: false; stage: "input" | "import"; message: string; hint?: string };

export function createImportOpportunityRef(deps: ImportOpportunityRefDeps) {
  return async function importOpportunityRef(refId: Id): Promise<ImportOpportunityRefResult> {
    const ref = deps.opportunityRefs.getById(refId);
    if (!ref) {
      return { ok: false, stage: "input", message: `no opportunity "${refId}"` };
    }
    const imported = await deps.importJob({ kind: "url", url: ref.url });
    if (!imported.ok) {
      return { ok: false, stage: "import", message: imported.message, ...(imported.hint ? { hint: imported.hint } : {}) };
    }
    deps.opportunityRefs.markStatus(ref.id, "imported");
    return { ok: true, job: imported.job, dedup: imported.dedup };
  };
}
