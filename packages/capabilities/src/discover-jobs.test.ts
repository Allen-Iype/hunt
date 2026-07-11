import { describe, expect, it } from "vitest";
import {
  type DiscoveryPort,
  type DiscoveryResult,
  type Job,
  type JobRepository,
  type OpportunityRef,
  type OpportunityRefRepository,
  type Profile,
  type ProfileRepository,
  type SavedSearch,
  type SavedSearchRepository,
} from "@hunt/core";
import { createDiscoverJobs, createImportOpportunityRef } from "./discover-jobs.js";

const NOW = "2026-07-11T10:00:00Z";

const SEARCH: SavedSearch = {
  id: "search_1",
  name: "backend",
  query: { roles: ["engineer"], skills: ["go", "kubernetes"], locations: [] },
  sources: [{ adapterId: "greenhouse", board: "acme" }],
  createdAt: NOW,
};

function fakeSearches(search: SavedSearch | null): SavedSearchRepository {
  return {
    save: () => {},
    getById: (id) => (search && search.id === id ? search : null),
    list: () => (search ? [search] : []),
    delete: () => {},
  };
}

function fakeRefs(): OpportunityRefRepository & { store: Map<string, OpportunityRef> } {
  const store = new Map<string, OpportunityRef>();
  return {
    store,
    save: (r) => void store.set(r.id, r),
    getById: (id) => store.get(id) ?? null,
    findByUrl: (url) => [...store.values()].find((r) => r.url === url) ?? null,
    listForSearch: (q) => [...store.values()].filter((r) => r.queryId === q && r.status === "new"),
    markStatus: (id, status) => {
      const r = store.get(id);
      if (r) store.set(id, { ...r, status });
    },
  };
}

function fakeJobs(): JobRepository {
  return { save: () => {}, getById: () => null, findByDedupHash: () => null, list: () => [] };
}

function fakeProfiles(profile: Profile | null): ProfileRepository {
  return { save: () => {}, get: () => profile };
}

function discoveryReturning(result: DiscoveryResult): DiscoveryPort {
  return { discover: async () => result };
}

const twoLeads: DiscoveryResult = {
  ok: true,
  refs: [
    { sourceId: "greenhouse", url: "https://x/go", title: "Senior Go Engineer", snippet: "Go and Kubernetes" },
    { sourceId: "greenhouse", url: "https://x/sales", title: "Sales Manager", snippet: "quotas" },
  ],
};

describe("DiscoverJobs", () => {
  it("discovers, ranks by intent, and persists new refs — no profile, no AI (ADR-0015)", async () => {
    const refs = fakeRefs();
    const discover = createDiscoverJobs({
      discovery: discoveryReturning(twoLeads),
      savedSearches: fakeSearches(SEARCH),
      opportunityRefs: refs,
      jobs: fakeJobs(),
      profiles: fakeProfiles(null),
      clock: () => NOW,
    });

    const result = await discover("search_1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usedProfile).toBe(false);
    expect(result.refs).toHaveLength(2);
    // The Go role must rank above the sales role (intent = go/kubernetes/engineer).
    expect(result.refs[0]!.title).toBe("Senior Go Engineer");
    expect(result.refs[0]!.relevance).toBeGreaterThan(result.refs[1]!.relevance);
    expect(refs.store.size).toBe(2);
  });

  it("skips leads already imported/dismissed (seen lifecycle)", async () => {
    const refs = fakeRefs();
    refs.save({
      id: "opp_seen",
      sourceId: "greenhouse",
      url: "https://x/go",
      title: "Senior Go Engineer",
      queryId: "search_1",
      discoveredAt: NOW,
      status: "imported",
      relevance: 0.9,
    });
    const discover = createDiscoverJobs({
      discovery: discoveryReturning(twoLeads),
      savedSearches: fakeSearches(SEARCH),
      opportunityRefs: refs,
      jobs: fakeJobs(),
      profiles: fakeProfiles(null),
      clock: () => NOW,
    });

    const result = await discover("search_1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.skipped).toBe(1);
    expect(result.refs.map((r) => r.url)).toEqual(["https://x/sales"]);
  });

  it("fails cleanly for an unknown search", async () => {
    const discover = createDiscoverJobs({
      discovery: discoveryReturning(twoLeads),
      savedSearches: fakeSearches(null),
      opportunityRefs: fakeRefs(),
      jobs: fakeJobs(),
      profiles: fakeProfiles(null),
    });
    const result = await discover("missing");
    expect(result).toMatchObject({ ok: false, stage: "input" });
  });

  it("surfaces a discovery-port failure", async () => {
    const discover = createDiscoverJobs({
      discovery: discoveryReturning({ ok: false, stage: "fetch", message: "HTTP 404", hint: "check the board handle" }),
      savedSearches: fakeSearches(SEARCH),
      opportunityRefs: fakeRefs(),
      jobs: fakeJobs(),
      profiles: fakeProfiles(null),
    });
    const result = await discover("search_1");
    expect(result).toMatchObject({ ok: false, stage: "discover", message: "HTTP 404", hint: "check the board handle" });
  });
});

describe("ImportOpportunityRef", () => {
  const makeJob = (): Job =>
    ({ id: "job_1", title: "Senior Go Engineer", companyName: "Acme" }) as Job;

  it("reuses ImportJob and marks the ref imported (ADR-0015)", async () => {
    const refs = fakeRefs();
    refs.save({
      id: "opp_1",
      sourceId: "greenhouse",
      url: "https://x/go",
      title: "Senior Go Engineer",
      queryId: "search_1",
      discoveredAt: NOW,
      status: "new",
      relevance: 0.9,
    });
    let importedUrl = "";
    const importRef = createImportOpportunityRef({
      opportunityRefs: refs,
      importJob: async (input) => {
        importedUrl = input.url;
        return { ok: true, job: makeJob(), dedup: "new" };
      },
    });

    const result = await importRef("opp_1");
    expect(result).toMatchObject({ ok: true, dedup: "new" });
    expect(importedUrl).toBe("https://x/go");
    expect(refs.getById("opp_1")!.status).toBe("imported");
  });

  it("fails cleanly for an unknown opportunity", async () => {
    const importRef = createImportOpportunityRef({
      opportunityRefs: fakeRefs(),
      importJob: async () => ({ ok: true, job: makeJob(), dedup: "new" }),
    });
    const result = await importRef("nope");
    expect(result).toMatchObject({ ok: false, stage: "input" });
  });
});
