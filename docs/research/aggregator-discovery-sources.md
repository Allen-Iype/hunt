# Research — Aggregator discovery sources

> **Status:** Research notes only. **Not a plan, not a committed milestone.** Captured
> so the findings survive across sessions; a proper explain+plan comes later and
> needs explicit go-ahead (engineering contract). Verified live **2026-07-12**.

## Why this exists

The M8/M9 discovery tier is **per-company**: each ATS (Greenhouse/Lever/Ashby)
publishes only a *per-board* public API keyed by a company slug — there is **no
"list all jobs" endpoint** on any of them. To get breadth ("show me broadly
what's out there" rather than "Stripe's openings"), we need an **aggregator
source** — a feed that already spans many companies. ADR-0015 anticipated this as
deferred future work ("aggregator feeds", Phase 2). This doc records which
aggregators are actually usable.

Key reality check: **a single free firehose of "every job everywhere" does not
exist.** Every free aggregator is *scoped* (region, remote-only, or gov-only).
Any one of them is still a large breadth step-change over naming boards.

## Candidates (all response shapes verified live)

### No-auth, free, JSON — drop-in fit for our `DiscoveryAdapter` seam

| Source | Endpoint | Coverage | Maps to `DiscoveredRef` | Terms — the catch |
|---|---|---|---|---|
| **Arbeitnow** | `https://www.arbeitnow.com/api/job-board-api` | EU-focused; aggregates from Greenhouse/SmartRecruiters/Recruitee/etc. | `data[]` → `title`, `company_name`, `url`, `location`, `remote`, `tags` | Free, **no key, no published attribution/rate rules** — most permissive |
| **Remotive** | `https://remotive.com/api/remote-jobs` | Remote-only, curated, strong in software | `jobs[]` → `title`, `company_name`, `url`, `candidate_required_location`, `category`, `salary`, `description` | ⚠️ **Restrictive** (see below) |
| **RemoteOK** | `https://remoteok.com/api` | Remote-only, 30k+ listings | `[]` (index 0 is a legal object) → `position`, `company`, `url`, `location`, `tags`, `salary_min/max` | ⚠️ Must **link back + credit "Remote OK"** or access suspended; logo trademarked |

### Free but requires a self-service API key (broader / mainstream)

| Source | Coverage | Terms |
|---|---|---|
| **Adzuna** | Mainstream aggregator, country-scoped, indexes many boards | Free tier but **requires `app_id` + `app_key`** (register); rate-limited; review ToS before redistribution |
| **USAJOBS** | **All US federal jobs**, fully normalized | Free **self-service key** (email → `Authorization-Key`, two headers: `User-Agent` + `Authorization-Key`); US-gov only — narrow but cleanest terms of the keyed set; per-User-Agent rate limit |

## Terms detail worth remembering (verbatim highlights)

- **Remotive** (returned in-band as a `0-legal-notice` field): *"do not submit Remotive
  jobs to third-party websites… link back to the URL found on Remotive AND mention
  Remotive as a source… Jobs displayed are delayed by 24 hours… you only need to GET
  … a couple of times a day (we advise max. 4 times a day)… excessive requests will
  be blocked."* Paid private API starts at $5k/mo.
- **RemoteOK** (index-0 legal object): *"Please link back (with follow…) to the URL on
  Remote OK and mention Remote OK as a source… If you do not we'll have to suspend API
  access. Please don't use the Remote OK logo… DO use our name Remote OK."*
- **Arbeitnow**: no key; docs state no attribution/rate rules (contact@arbeitnow.com for
  a private tailored endpoint). Most permissive of the no-auth set.
- **USAJOBS**: *"Data provided … is for the explicit use of the requesting company…
  No other use … without prior approval, in writing, from OPM."* — fine for personal
  use; note for any redistribution.
- **Adzuna**: key required; rate-limited; ToS at developer.adzuna.com/docs/terms_of_service.

## Why the attribution obligations are naturally satisfiable for Hunt

Hunt is **local-first and single-user**. A discovered lead stores and opens the
**source posting's real URL** (the `OpportunityRef.url`), and Hunt does **not**
republish listings, harvest emails, or run a public site. So "link back + credit
the source" is met by design (we point the user straight at the source URL), and
low-rate obligations (e.g. Remotive's ~4/day) map onto **aggressive caching, not
polling**. This must still be documented and honored per-adapter, not assumed.

## Architectural fit (the reason this is cheap later)

An aggregator adapter is just a `DiscoveryAdapter` that **ignores the board slug**
and returns a broad feed. It slots into the exact registry M8/M9 built, still
emits `OpportunityRef` **leads** (lead-vs-job invariant unchanged), still needs
**no AI and no profile**. The one genuinely new design question is the CLI/search
UX: an aggregator source isn't "per board", so `hunt searches add` needs a shape
like `--aggregator arbeitnow` (or a query-bearing `--aggregator arbeitnow:remote`)
distinct from the per-board `--board/--lever/--ashby` flags. Also new per source:
an **attribution/caching policy** field, and honoring rate limits.

## Suggested sequencing (when we plan it)

1. **Arbeitnow first** — no key, no attribution strings, cleanest terms; aggregates
   *from ATS systems* so it's philosophically identical to M8/M9. Proves the
   aggregator seam with zero friction.
2. **Remotive + RemoteOK** as remote-focused fast-follows — with link-back/credit
   obligations documented and satisfied, and caching to respect rate limits.
3. **USAJOBS / Adzuna** later — federal coverage, or keyed mainstream breadth
   (introduces the first discovery source that needs credentials in `.env`).

## Open questions for the future plan (do NOT decide here)

- CLI shape for naming an aggregator source + optional query (remote? region? role?).
- Where per-source attribution/caching/rate-limit policy lives (adapter metadata?).
- Whether keyed sources (Adzuna/USAJOBS) reuse the existing env-var config pattern.
- De-dup across aggregators + ATS boards (same posting via two feeds) — the
  discoverer already dedups by URL, but aggregators may carry a different URL than
  the company's own board.

## Sources (verified 2026-07-12)

- Arbeitnow — https://www.arbeitnow.com/blog/job-board-api
- Remotive — https://github.com/remotive-com/remote-jobs-api (endpoint `remotive.com/api/remote-jobs`)
- RemoteOK — https://remoteok.com/api
- Adzuna — https://developer.adzuna.com/overview
- USAJOBS — https://developer.usajobs.gov/
