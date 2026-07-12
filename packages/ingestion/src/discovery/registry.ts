import { createAdzunaAdapter } from "./adapters/adzuna.js";
import { createArbeitnowAdapter } from "./adapters/arbeitnow.js";
import { createAshbyAdapter } from "./adapters/ashby.js";
import { createFindworkAdapter } from "./adapters/findwork.js";
import { createGlassdoorAdapter } from "./adapters/glassdoor.js";
import { createGreenhouseAdapter } from "./adapters/greenhouse.js";
import { createHackerNewsAdapter } from "./adapters/hackernews.js";
import { createIndeedAdapter } from "./adapters/indeed.js";
import { createJSearchAdapter } from "./adapters/jsearch.js";
import { createLeverAdapter } from "./adapters/lever.js";
import { createLinkedInAdapter } from "./adapters/linkedin.js";
import { createRemoteOkAdapter } from "./adapters/remoteok.js";
import { createUnconfiguredAdapter } from "./adapters/unconfigured.js";
import { createWeWorkRemotelyAdapter } from "./adapters/weworkremotely.js";
import type { DiscoveryAdapter } from "./types.js";

/**
 * Credentials for the Tier-3 aggregator adapters (ADR-0015). Read at the CLI
 * composition root from env and passed in here — this package never touches
 * `process.env` (mirrors the AI provider wiring). Any field left undefined means
 * that source is registered as an unconfigured stub: a search referencing it
 * gets a clear "set the key" warning, not a crash (graceful-degradation
 * decision).
 */
export interface DiscoveryCredentials {
  adzunaAppId?: string;
  adzunaAppKey?: string;
  findworkApiKey?: string;
  jsearchApiKey?: string;
}

/**
 * Discovery adapter registry (ADR-0015, Tier-0 stance). Deliberately SEPARATE
 * from the source-adapter registry (`SOURCE_ADAPTERS`): discovery adapters have
 * the inverse shape (produce-many vs. fetch-one), so mixing them would conflate
 * two contracts. This is the single file that changes when a discovery source
 * is added. M8 shipped Greenhouse; M9 added Lever and Ashby (ATS tier — public
 * JSON, no auth). Phase A added the Tier-2 aggregator feeds (RemoteOK,
 * Arbeitnow, We Work Remotely, Hacker News) — public feeds, no auth, global (so
 * their `board` handle is by convention "global"; HN excepted: its board is the
 * thread item id). Phase B adds the Tier-3 aggregator APIs (Adzuna, Findwork,
 * JSearch) — official APIs with server-side search and INJECTED keys; a source
 * whose key is absent is registered as an unconfigured stub. Phase D adds the
 * Tier-4 best-effort web scrapers (LinkedIn, Indeed, Glassdoor) — public HTML
 * only, honest fetching, no login/evasion (SDD §21), gated by @hunt/eval; they
 * run only when a search names them and fail honestly to JSearch/paste when a
 * site blocks the fetch.
 *
 * `overrides` (used by tests) fully replaces the default set and ignores
 * credentials.
 */
export function buildDiscoveryRegistry(
  overrides?: readonly DiscoveryAdapter[],
  credentials: DiscoveryCredentials = {},
): Map<string, DiscoveryAdapter> {
  const adapters = overrides ?? [
    createGreenhouseAdapter(),
    createLeverAdapter(),
    createAshbyAdapter(),
    createRemoteOkAdapter(),
    createArbeitnowAdapter(),
    createWeWorkRemotelyAdapter(),
    createHackerNewsAdapter(),
    ...buildTier3Adapters(credentials),
    createLinkedInAdapter(),
    createIndeedAdapter(),
    createGlassdoorAdapter(),
  ];
  return new Map(adapters.map((a) => [a.id, a]));
}

/**
 * The canonical discovery adapter ids, in tier order. Derived from the default
 * registry so it stays in sync automatically — the CLI validates `--source
 * <id>:<board>` against this so a typo'd id fails fast at search-add time.
 */
export const DISCOVERY_ADAPTER_IDS: readonly string[] = [...buildDiscoveryRegistry().keys()];

/** Construct each Tier-3 adapter, or an unconfigured stub when its key is missing. */
function buildTier3Adapters(creds: DiscoveryCredentials): DiscoveryAdapter[] {
  const adzuna =
    creds.adzunaAppId && creds.adzunaAppKey
      ? createAdzunaAdapter({ appId: creds.adzunaAppId, appKey: creds.adzunaAppKey })
      : createUnconfiguredAdapter(
          "adzuna",
          "set HUNT_ADZUNA_APP_ID and HUNT_ADZUNA_APP_KEY to enable this source",
        );
  const findwork = creds.findworkApiKey
    ? createFindworkAdapter({ apiKey: creds.findworkApiKey })
    : createUnconfiguredAdapter("findwork", "set HUNT_FINDWORK_API_KEY to enable this source");
  const jsearch = creds.jsearchApiKey
    ? createJSearchAdapter({ apiKey: creds.jsearchApiKey })
    : createUnconfiguredAdapter("jsearch", "set HUNT_JSEARCH_API_KEY to enable this source");
  return [adzuna, findwork, jsearch];
}
