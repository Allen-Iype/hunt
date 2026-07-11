import { createAshbyAdapter } from "./adapters/ashby.js";
import { createGreenhouseAdapter } from "./adapters/greenhouse.js";
import { createLeverAdapter } from "./adapters/lever.js";
import type { DiscoveryAdapter } from "./types.js";

/**
 * Discovery adapter registry (ADR-0015, Tier-0 stance). Deliberately SEPARATE
 * from the source-adapter registry (`SOURCE_ADAPTERS`): discovery adapters have
 * the inverse shape (produce-many vs. fetch-one), so mixing them would conflate
 * two contracts. This is the single file that changes when a discovery source
 * is added. M8 shipped Greenhouse; M9 adds Lever and Ashby (same ATS tier — all
 * public JSON, no auth, no AI).
 */
export function buildDiscoveryRegistry(
  overrides?: readonly DiscoveryAdapter[],
): Map<string, DiscoveryAdapter> {
  const adapters = overrides ?? [
    createGreenhouseAdapter(),
    createLeverAdapter(),
    createAshbyAdapter(),
  ];
  return new Map(adapters.map((a) => [a.id, a]));
}
