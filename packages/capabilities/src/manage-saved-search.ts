import {
  SavedSearchSchema,
  savedSearchId,
  type Id,
  type SavedSearch,
  type SavedSearchRepository,
  type SearchQuery,
  type DiscoverySource,
} from "@hunt/core";

/**
 * ManageSavedSearch (ADR-0015): thin CRUD over the user's standing searches —
 * the intent that drives discovery. Fully deterministic; zero AI.
 */

export interface ManageSavedSearchDeps {
  savedSearches: SavedSearchRepository;
  clock?: () => string;
}

export interface AddSavedSearchInput {
  name: string;
  query: SearchQuery;
  sources: DiscoverySource[];
}

export type AddSavedSearchResult =
  | { ok: true; search: SavedSearch }
  | { ok: false; stage: "input"; message: string };

export function createManageSavedSearch(deps: ManageSavedSearchDeps) {
  const clock = deps.clock ?? (() => new Date().toISOString());
  return {
    add(input: AddSavedSearchInput): AddSavedSearchResult {
      const parsed = SavedSearchSchema.safeParse({
        id: savedSearchId(input.name),
        name: input.name,
        query: input.query,
        sources: input.sources,
        createdAt: clock(),
      });
      if (!parsed.success) {
        return { ok: false, stage: "input", message: parsed.error.issues.map((i) => i.message).join("; ") };
      }
      deps.savedSearches.save(parsed.data);
      return { ok: true, search: parsed.data };
    },
    list(): SavedSearch[] {
      return deps.savedSearches.list();
    },
    remove(id: Id): void {
      deps.savedSearches.delete(id);
    },
  };
}
