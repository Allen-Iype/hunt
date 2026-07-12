import type { DiscoveredRef, DiscoveryPort, DiscoveryResult } from "@hunt/core";
import { buildDiscoveryRegistry, type DiscoveryCredentials } from "./registry.js";
import type { DiscoveryAdapter } from "./types.js";

/**
 * DiscoveryPort implementation (ADR-0015): fan out across the search's sources,
 * collect leads, dedup by URL. Adapter/transport failures for one source are
 * surfaced as a typed `fetch`/`parse` result — one bad board should not sink a
 * whole search, but the caller is told which failed.
 *
 * `credentials` (Tier-3 API keys, resolved from env at the CLI composition root)
 * are passed to the registry; a source whose key is absent still registers, as
 * an unconfigured stub that yields a clear "set the key" warning. Tests pass
 * `overrides` to supply their own adapter set (credentials then ignored).
 */
export function createDiscoverer(
  overrides?: readonly DiscoveryAdapter[],
  credentials?: DiscoveryCredentials,
): DiscoveryPort {
  const registry = buildDiscoveryRegistry(overrides, credentials);
  return {
    async discover({ sources, query }): Promise<DiscoveryResult> {
      const byUrl = new Map<string, DiscoveredRef>();
      const errors: string[] = [];
      for (const source of sources) {
        const adapter = registry.get(source.adapterId);
        if (!adapter) {
          errors.push(`no discovery adapter "${source.adapterId}"`);
          continue;
        }
        try {
          const refs = await adapter.discover({ board: source.board, query });
          for (const ref of refs) if (!byUrl.has(ref.url)) byUrl.set(ref.url, ref);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${source.adapterId}/${source.board}: ${msg}`);
        }
      }

      // All sources failed → a typed failure so the surface can react.
      if (byUrl.size === 0 && errors.length > 0) {
        const hint = errors.some((e) => e.includes("HTTP 404"))
          ? "check the board handle (e.g. the Greenhouse board token)"
          : undefined;
        return {
          ok: false,
          stage: "fetch",
          message: errors.join("; "),
          ...(hint ? { hint } : {}),
        };
      }
      return { ok: true, refs: [...byUrl.values()] };
    },
  };
}
