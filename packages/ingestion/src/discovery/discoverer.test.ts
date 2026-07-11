import { describe, expect, it } from "vitest";
import type { DiscoveredRef } from "@hunt/core";
import { createDiscoverer } from "./discoverer.js";
import type { DiscoveryAdapter } from "./types.js";

const query = { roles: [], skills: [], locations: [] };

function adapter(id: string, refs: DiscoveredRef[] | Error): DiscoveryAdapter {
  return {
    id,
    version: "0.1.0",
    discover: async () => {
      if (refs instanceof Error) throw refs;
      return refs;
    },
  };
}

const lead = (url: string, title = "Engineer"): DiscoveredRef => ({ sourceId: "greenhouse", url, title });

describe("createDiscoverer", () => {
  it("fans out over sources and dedups leads by URL", async () => {
    const discoverer = createDiscoverer([
      adapter("greenhouse", [lead("https://x/1"), lead("https://x/2"), lead("https://x/1")]),
    ]);
    const result = await discoverer.discover({
      sources: [{ adapterId: "greenhouse", board: "acme" }],
      query,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refs.map((r) => r.url).sort()).toEqual(["https://x/1", "https://x/2"]);
  });

  it("reports an unknown adapter as a typed failure when nothing else succeeds", async () => {
    const discoverer = createDiscoverer([]);
    const result = await discoverer.discover({
      sources: [{ adapterId: "nope", board: "acme" }],
      query,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("fetch");
    expect(result.message).toContain("no discovery adapter");
  });

  it("surfaces a fetch error but keeps leads from healthy sources", async () => {
    const discoverer = createDiscoverer([
      adapter("greenhouse", [lead("https://x/1")]),
      adapter("lever", new Error("HTTP 404")),
    ]);
    const result = await discoverer.discover({
      sources: [
        { adapterId: "greenhouse", board: "acme" },
        { adapterId: "lever", board: "gone" },
      ],
      query,
    });
    // One source succeeded → overall ok, with that source's leads.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refs).toHaveLength(1);
  });
});
