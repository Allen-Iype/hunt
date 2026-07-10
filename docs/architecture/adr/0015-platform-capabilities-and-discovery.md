# ADR-0015: Platform capabilities and a discovery layer that emits references

- **Status**: Proposed · **Date**: 2026-07-10 · **SDD**: §1, §9, §22
- **Relationship to prior decisions**: extends ADR-0002 (hexagonal + dependency
  rule), ADR-0004/0005 (ingestion), ADR-0006/0007 (grounding, deterministic
  scoring), ADR-0013 (domain-shaped AI ports). Re-sequences the SDD §27 post-V1
  ordering; supersedes nothing.

## Context

Hunt at v0.1 has built the trust-critical core of a career assistant (grounded
generation, deterministic analysis, lifecycle tracking) and deliberately deferred
breadth. A near-term product priority has emerged: **helping users find relevant
job opportunities**.

Discovery is **not merely the loop's front-end**. It is one of Hunt's **two
primary, co-equal entry points**. A user must be able to start from either:

- **"Help me find jobs."** — discovery from stated intent; **or**
- **"I already have this job description."** — the import → analyze → generate path.

Both must feel equally native, and discovery must deliver value **before** a user
has authored a polished profile.

This priority collides with a load-bearing non-goal — SDD §3: *"never a job board
or aggregator service… no server-side crawling fleet."* We must add discovery as a
first-class entry point **without** becoming that, and sequence the work so
discovery strengthens the platform rather than bolting on a fragile feature.

## Problem statement

How should Hunt evolve from a document-centric assistant into the full career loop
(discovery → understanding → generation → tracking → learning), where discovery is
a **co-primary entry point**, while (a) preserving the moat (structurally-enforced
grounding and deterministic, calibratable scoring), (b) preserving local-first and
the no-AI-core invariant, (c) keeping the §3 non-goals intact, and (d) avoiding a
major refactor within 3–5 years?

## Decision

1. **Adopt a capability-platform model with two primary entry points.** Future
   work is expressed as capabilities over the existing hexagonal core, each
   **reusing a strategic asset** (grounding engine, AI gateway, deterministic
   matching/scoring, ingestion pipeline) — never bypassing the trust core, never
   introducing a parallel system. **Find** (DiscoverJobs) and **Assess & Generate**
   (AnalyzeJob + GenerateResume/CoverLetter) are co-equal front doors; Track,
   Analytics, Research, Prep, and Learning are connective tissue over the same core.

2. **Add discovery as an ingestion-adjacent adapter family behind a new,
   async `DiscoveryPort`.** Discovery is **not** a `SourceAdapter` (which fetches
   and normalizes one known URL); it is the inverse shape — *given a structured
   query, produce many `OpportunityRef`s*. Its entire output is references, handed
   to the **existing** `JobIngestor` unchanged (SDD §9's discovery slot). New core
   models: `OpportunityRef` and `SavedSearch`.

3. **`OpportunityRef` is a lead, not a job (invariant).** A ref carries only
   `{ sourceId, ref/url, title?, company?, discoveredAt, queryId, snippet? }`. It
   **must not** carry normalized job structure (requirements, parsed comp, clean
   description). Normalization happens **only** in the import pipeline, on refs the
   user chose to import. This invariant is what keeps discovery from silently
   becoming an aggregator: Hunt stores *leads and the user's own imported jobs*,
   never a hosted corpus of postings.

4. **Discovery ranks on stated intent; the profile is optional enrichment.**
   `DiscoverJobs` ranks primarily on a `SavedSearch` (the user's intent:
   roles/skills/location/remote/seniority). The profile, **when present**, enriches
   ranking; it is **never a prerequisite**. Discovery is therefore functional on
   day one with **no profile and no AI** (the ATS/feed tiers are structured JSON).
   This is what makes "help me find jobs" a genuine entry point rather than a
   downstream feature.

5. **Ranking reuses the trust core via a shared matching primitive — not a
   parallel scorer.** `computeFitScore` operates on a normalized `Job` + full
   `Profile` and is unchanged (comparable, calibratable — ADR-0007). Lead ranking
   uses a new, deterministic `rankOpportunity(ref, savedSearch, profile?)` that
   sits on the **same** skill-canonicalization + overlap primitive
   (`canonicalizeSkill`/`detectSkills`/a shared `skillOverlap` helper, promoted out
   of the private selection logic). One matching engine, two altitudes
   (lead-ranking vs. fit-scoring). A future contributor must **not** wire discovery
   into `computeFitScore` (it needs a normalized Job it will not have) and must
   **not** build a second scorer.

6. **Tier discovery sources by legality × effort × signal**, with the paste path
   as the always-legal floor:
   1. **ATS boards** (Greenhouse/Lever/Ashby) — structured JSON, deterministic, no
      AI. Highest ROI; ships first.
   2. **Aggregator feeds** (RSS/JSON) — broader reach, per-source structure.
   3. **Best-effort user-directed web / big boards (incl. LinkedIn)** — bounded,
      on-demand, honest (robots-respecting, no user-agent spoofing arms race),
      **no standing crawler, no credentialed scraping, no hosting-for-others**,
      paste-path fallback. This tier ships **only after** `@hunt/eval` can measure
      its extraction quality.

7. **Introduce `@hunt/eval`** (golden inputs → expected extractions + claim-trace
   pass-rate + fit-score assertions) as infrastructure that gates prompt/model
   iteration and discovery's best-effort tier.

8. **Pay one refactor before the second surface:** extract a `@hunt/presentation`
   view-model layer out of `run.ts` and introduce a shared
   `CapabilityError`/`formatFailure` convention.

9. **Reaffirm the permanent non-goals:** never host or aggregate job data for other
   users; no server-side crawling fleet; no auto-apply (it contradicts the
   mandatory-review moat and is an ethics trap); no recruiter/ATS side; no required
   daemon or sync service. Discovery pulls into **one** user's **local** store,
   **on-demand**.

## Design principles

- Determinism by default; AI only where language reasoning genuinely helps.
- **Discovery and job-description-in are co-equal entry points; neither is
  subordinate to the other.**
- Discovery emits references, never jobs; `OpportunityRef` stays a lead.
- Discovery works from user intent alone; the profile is an optional enrichment
  signal.
- Every new capability reuses or strengthens the trust core — never a parallel
  system.
- The core stays provider-, source-, and surface-independent (dependency rule,
  domain-shaped ports).
- Tier external reach; the paste path is the always-legal floor.
- Evaluation is infrastructure, built early and reused everywhere.
- Incremental evolution, no rewrites: every capability attaches to an existing seam.

## Core platform responsibilities

Canonical models (incl. `OpportunityRef`, `SavedSearch`); deterministic engines —
the **shared matching/relevance primitive** (canonicalization + overlap) underneath
both `computeFitScore` and `rankOpportunity`, plus selection, claim tracing,
analytics query-models, and eval scorers; the application state machine;
ID derivation and provenance; and **all port interfaces** (storage, AI, ingestion,
render, and the new `DiscoveryPort`). No I/O, `zod`-only.

## Adapter responsibilities

Ingestion (envelope → tiered normalization, unchanged) and **discovery adapters**
(per-source `OpportunityRef` production behind `DiscoveryPort`); the AI gateway
(tasks/providers/cache/replay + an eval-run mode); storage (+ FTS5, later
`sqlite-vec`, + an `opportunity_refs` table with a seen/dismissed lifecycle);
render (HTML, later PDF). Adapters stay mutually deletable; a discovery adapter's
blast radius is one adapter, and raw-envelope preservation makes every imported
ref recoverable.

`DiscoveryPort` is **async** by nature (network I/O), unlike the synchronous
storage ports (`core/ports.ts`) — discovery collects refs, then the capability
persists them; nothing forces the storage ports to widen.

## Capability boundaries

Each capability keeps the uniform contract: typed input (validated) →
deterministic workflow with explicit AI steps → typed output (validated) →
persist + return. `DiscoverJobs` **proposes** ranked refs; the user imports the
ones they want (discovery never auto-normalizes a corpus). Capabilities compose
only via public interfaces (`DiscoverJobs` → `ImportJob`), never by reaching into
internals. **The no-AI core invariant holds:** import, analyze, track, analytics,
and the ATS/feed discovery tiers all work with **zero** provider configured.

## Trade-offs

- **Discovery-as-refs** pays some convenience (the user picks what to import) to
  keep the aggregator line clean and legally safe. Accepted.
- **Intent-first ranking** means a new `rankOpportunity` rather than reusing
  `computeFitScore` directly; paid as one small shared-primitive refactor, bought
  the "profile-optional" entry point and prevention of a parallel scorer. Accepted.
- **Deferring the web/LinkedIn tier** behind `@hunt/eval` pays speed to buy
  trustworthy, measured extraction. Accepted (fragile-source quality is the risk).
- **Widening N1's outbound-call framing:** discovery fetches URLs the user's
  *on-demand query resolved to*, not only URLs the user typed. This is a real,
  deliberate widening of SDD N1 — bounded (on-demand, honest, robots-respecting,
  no credentialed content), documented here rather than glossed. Accepted.
- **A new `DiscoveryPort` + two models + an `opportunity_refs` table** add surface
  area; justified by a prioritized product need and bounded by existing patterns.

## Consequences

**Positive:** the full career loop with two native entry points and the moat
intact; discovery ships real value in Phase 1 via the cleanest, most legal,
zero-AI source; analytics closes the calibration loop on scoring; surfaces
(web UI, MCP) become mechanical after one refactor; the matching engine becomes an
explicitly reusable primitive.

**Negative / ongoing attention:** more adapters to maintain (contained by contract
tests + raw-envelope recovery); the best-effort discovery tier carries ongoing
legal/fragility attention (mitigated: on-demand, honest, paste-fallback, no
credentialed scraping); discovery quality raises the stakes on skill-dictionary
growth (the same known lever); the `OpportunityRef` lead-vs-job invariant must be
guarded in review to prevent slow aggregation drift.

## Extension points

- `DiscoveryPort` — new sources (ATS → feeds → best-effort web; later a discovery
  *agent* that emits refs into the same pipeline, and opt-in local scheduling that
  simply calls `discover()` on a timer — additive over on-demand, no rewrite).
- `AiTask` registry — new tasks (extract-profile, company dossier, prep answers).
- Capability layer — new capabilities + the mechanical MCP mapping (SDD §22).
- `RenderPort` — PDF.
- Storage — FTS5, `sqlite-vec` (semantic re-ranking of refs), `opportunity_refs`
  seen/dismissed lifecycle.
- `@hunt/eval` — new golden sets and scorers.
- Presentation — new surfaces over shared view-models.

## Known future pressures (named, not yet built — YAGNI)

- **Single-profile assumption** (`DEFAULT_PROFILE_ID`) may face pressure from
  per-career-track profiles within 5 years. Not designed now; flagged so it is not
  a surprise.
- **`ManageSavedSearch`** (CRUD over standing searches) is part of the discovery
  entry point; realize it as a thin capability or as part of DiscoverJobs' surface
  when discovery lands.
- **Scheduled discovery** stays deferred (preserves N9); if demanded, it wraps
  on-demand discovery without a rewrite.

## Future evolution strategy

Sequence (infrastructure before breadth; every phase ships independent value and
reuses the trust core):

1. **Two front doors + safe iteration** — DiscoverJobs (ATS tier, intent-first,
   no profile/no AI) · Resume onboarding (seed + augment) · `@hunt/eval`. These are
   **peers**; discovery does not depend on onboarding.
2. **Broaden + close the loop** — aggregator-feed discovery · analytics
   (funnel/velocity/gap-frequency/**fit-vs-outcome calibration**) · FTS + honest
   keyword-coverage awareness.
3. **Refactor, then expand safely** — presentation refactor →
   best-effort web/LinkedIn discovery tier (now measurable via eval) → local web UI
   → MCP server.
4. **Breadth over the mature loop** — company research (grounded dossiers, reuse
   `traceClaims`) · interview prep (grounded answers, reuse `composeGroundedDraft`)
   · learning recommendations (reuse analytics) · discovery agent · semantic
   re-ranking.

## Alternatives

- **Discovery as a `SourceAdapter`** — wrong shape (fetch-one vs. produce-many).
  Rejected.
- **A standing crawler / background daemon** — violates §3 and N9. Rejected;
  on-demand only.
- **LLM-judged discovery ranking** — incomparable and uncalibratable; reuse the
  deterministic matching primitive instead. Rejected.
- **Reusing `computeFitScore` for lead ranking** — impossible without a normalized
  Job; would force a parallel scorer. Rejected in favor of `rankOpportunity` on the
  shared primitive.
- **`OpportunityRef` carrying full job structure** — convenient but turns Hunt into
  an aggregator and rots the non-goal. Rejected; refs stay leads.
- **Building the web/LinkedIn tier first** — fragile and legally gray before the
  safety infrastructure exists. Deferred behind `@hunt/eval`.
- **Profile-gated discovery** — would make "help me find jobs" impossible on day
  one, subordinating discovery to onboarding. Rejected; intent-first, profile-
  optional.
