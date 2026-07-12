import type { DiscoveredRef } from "@hunt/core";
import { FetchError } from "../../fetch.js";
import type { DiscoveryAdapter } from "../types.js";

/**
 * Placeholder for a Tier-3 aggregator adapter whose API key is not configured
 * (ADR-0015, graceful-degradation decision). Registering this instead of the
 * real adapter means a search referencing the source produces a clear,
 * actionable per-source warning — "set X to enable" — while every other source
 * still runs. It never fabricates leads: `discover` always throws, and the
 * discoverer folds that into its warnings ("<id>/<board>: <message>").
 */
export function createUnconfiguredAdapter(id: string, hint: string): DiscoveryAdapter {
  return {
    id,
    version: "0.0.0",
    discover(): Promise<DiscoveredRef[]> {
      return Promise.reject(
        new FetchError(`"${id}" is not configured — ${hint}`, hint),
      );
    },
  };
}
