import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import type { OpportunityRef, SavedSearch } from "@hunt/core";
import { openDatabase } from "../db.js";
import { makeTempDir } from "../testing/fixtures.js";
import { createOpportunityRefRepository } from "./opportunity-refs.js";
import { createSavedSearchRepository } from "./saved-searches.js";

const NOW = "2026-07-11T10:00:00Z";

let db: Database;
let cleanup: () => void;

beforeEach(() => {
  const tmp = makeTempDir();
  cleanup = tmp.cleanup;
  db = openDatabase(tmp.dir);
});
afterEach(() => {
  db.close();
  cleanup();
});

const search: SavedSearch = {
  id: "search_1",
  name: "backend",
  query: { roles: ["engineer"], skills: ["go"], locations: [] },
  sources: [{ adapterId: "greenhouse", board: "acme" }],
  createdAt: NOW,
};

const ref = (overrides: Partial<OpportunityRef> = {}): OpportunityRef => ({
  id: "opp_1",
  sourceId: "greenhouse",
  url: "https://x/1",
  title: "Go Engineer",
  queryId: "search_1",
  discoveredAt: NOW,
  status: "new",
  relevance: 0.8,
  ...overrides,
});

describe("SavedSearchRepository", () => {
  it("round-trips and deletes", () => {
    const repo = createSavedSearchRepository(db);
    repo.save(search);
    expect(repo.getById("search_1")).toEqual(search);
    expect(repo.list()).toHaveLength(1);
    repo.delete("search_1");
    expect(repo.getById("search_1")).toBeNull();
  });
});

describe("OpportunityRefRepository", () => {
  it("round-trips and finds by URL", () => {
    const repo = createOpportunityRefRepository(db);
    repo.save(ref());
    expect(repo.getById("opp_1")).toEqual(ref());
    expect(repo.findByUrl("https://x/1")?.id).toBe("opp_1");
  });

  it("lists only new refs for a search, most relevant first", () => {
    const repo = createOpportunityRefRepository(db);
    repo.save(ref({ id: "opp_a", url: "https://x/a", relevance: 0.3 }));
    repo.save(ref({ id: "opp_b", url: "https://x/b", relevance: 0.9 }));
    repo.save(ref({ id: "opp_c", url: "https://x/c", status: "imported", relevance: 1 }));
    const listed = repo.listForSearch("search_1");
    expect(listed.map((r) => r.id)).toEqual(["opp_b", "opp_a"]); // imported one excluded, sorted desc
  });

  it("markStatus flips the lifecycle so re-discovery skips it", () => {
    const repo = createOpportunityRefRepository(db);
    repo.save(ref());
    repo.markStatus("opp_1", "dismissed");
    expect(repo.getById("opp_1")?.status).toBe("dismissed");
    expect(repo.listForSearch("search_1")).toHaveLength(0);
  });
});
