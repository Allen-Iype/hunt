import { createGreenhouseAdapter } from "./adapters/greenhouse.js";
import type { DiscoveryAdapter } from "./types.js";

/**
 * Discovery adapter registry (ADR-0015, Tier-0 stance). Deliberately SEPARATE
 * from the source-adapter registry (`SOURCE_ADAPTERS`): discovery adapters have
 * the inverse shape (produce-many vs. fetch-one), so mixing them would conflate
 * two contracts. This is the single file that changes when a discovery source
 * is added. M8 ships Greenhouse; Lever/Ashby are fast follows (same tier).
 */
export function buildDiscoveryRegistry(
  overrides?: readonly DiscoveryAdapter[],
): Map<string, DiscoveryAdapter> {
  const adapters = overrides ?? [createGreenhouseAdapter()];
  return new Map(adapters.map((a) => [a.id, a]));
}
