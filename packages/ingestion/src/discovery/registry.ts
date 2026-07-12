import { createArbeitnowAdapter } from "./adapters/arbeitnow.js";
import { createAshbyAdapter } from "./adapters/ashby.js";
import { createGreenhouseAdapter } from "./adapters/greenhouse.js";
import { createHackerNewsAdapter } from "./adapters/hackernews.js";
import { createLeverAdapter } from "./adapters/lever.js";
import { createRemoteOkAdapter } from "./adapters/remoteok.js";
import { createWeWorkRemotelyAdapter } from "./adapters/weworkremotely.js";
import type { DiscoveryAdapter } from "./types.js";

/**
 * Discovery adapter registry (ADR-0015, Tier-0 stance). Deliberately SEPARATE
 * from the source-adapter registry (`SOURCE_ADAPTERS`): discovery adapters have
 * the inverse shape (produce-many vs. fetch-one), so mixing them would conflate
 * two contracts. This is the single file that changes when a discovery source
 * is added. M8 shipped Greenhouse; M9 adds Lever and Ashby (same ATS tier — all
 * public JSON, no auth, no AI). Phase A adds the Tier-2 aggregator feeds
 * (RemoteOK, Arbeitnow, We Work Remotely, Hacker News) — public feeds, no auth,
 * global (not per-company) so their `board` handle is by convention "global"
 * (HN excepted: its board is the thread item id).
 */
export function buildDiscoveryRegistry(
  overrides?: readonly DiscoveryAdapter[],
): Map<string, DiscoveryAdapter> {
  const adapters = overrides ?? [
    createGreenhouseAdapter(),
    createLeverAdapter(),
    createAshbyAdapter(),
    createRemoteOkAdapter(),
    createArbeitnowAdapter(),
    createWeWorkRemotelyAdapter(),
    createHackerNewsAdapter(),
  ];
  return new Map(adapters.map((a) => [a.id, a]));
}
