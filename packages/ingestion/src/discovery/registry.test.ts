import { describe, expect, it } from "vitest";
import { buildDiscoveryRegistry } from "./registry.js";

/**
 * Registry wiring for the Tier-3 graceful-degradation contract (ADR-0015): a
 * source with credentials registers its real adapter; a source without
 * registers an unconfigured stub whose `discover` throws a clear "set the key"
 * message, so one unconfigured source warns instead of crashing the search.
 */
const QUERY = { roles: [], skills: [], locations: [] };

describe("buildDiscoveryRegistry", () => {
  it("always registers the no-auth ATS and feed adapters", () => {
    const registry = buildDiscoveryRegistry();
    for (const id of ["greenhouse", "lever", "ashby", "remoteok", "arbeitnow", "weworkremotely", "hackernews"]) {
      expect(registry.has(id)).toBe(true);
    }
  });

  it("registers a Tier-3 source as an unconfigured stub when its key is missing", async () => {
    const adzuna = buildDiscoveryRegistry().get("adzuna");
    expect(adzuna).toBeDefined();
    await expect(adzuna!.discover({ board: "us", query: QUERY })).rejects.toThrow(
      /not configured.*HUNT_ADZUNA_APP_ID/,
    );
  });

  it("registers the real Tier-3 adapter when credentials are supplied", () => {
    const registry = buildDiscoveryRegistry(undefined, {
      adzunaAppId: "id",
      adzunaAppKey: "key",
      findworkApiKey: "fw",
      jsearchApiKey: "js",
    });
    // Real adapters carry a non-zero version; stubs are "0.0.0".
    expect(registry.get("adzuna")?.version).not.toBe("0.0.0");
    expect(registry.get("findwork")?.version).not.toBe("0.0.0");
    expect(registry.get("jsearch")?.version).not.toBe("0.0.0");
  });

  it("stubs findwork/jsearch independently of adzuna", () => {
    const registry = buildDiscoveryRegistry(undefined, { adzunaAppId: "id", adzunaAppKey: "key" });
    expect(registry.get("adzuna")?.version).not.toBe("0.0.0");
    expect(registry.get("findwork")?.version).toBe("0.0.0");
    expect(registry.get("jsearch")?.version).toBe("0.0.0");
  });
});
