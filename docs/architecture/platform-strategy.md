# Hunt — Platform Strategy (3–5 Year Architecture)

**Status:** Adopted direction · **Date:** 2026-07-10 · **Companion ADR:**
[ADR-0015](adr/0015-platform-capabilities-and-discovery.md) · **Source of truth
for architecture:** [software-design.md](software-design.md)

This document defines Hunt's long-term product and architectural direction. It is
a **reference document**: it should let a future contributor understand what Hunt
is for, which capabilities are primary, how the pieces fit, and in what order they
are built — with confidence that the direction is deliberate and internally
consistent. It extends the SDD; it does not replace it.

---

## 1. Product Vision

**Hunt is a local-first Career Intelligence platform for software engineers, with
two equally native starting points:**

- **"Help me find jobs."** — discovery finds relevant openings on your machine,
  on-demand, ranked to your stated intent (and, when available, your verified
  profile).
- **"I already have this job description."** — assess fit and generate application
  materials that cannot fabricate experience.

**Both flow into one trust core** — deterministic, calibratable fit scoring and a
grounding engine that traces every claim to a verified fact — over a career record
you own and can walk away with.

> Hunt finds and prepares. It never becomes a job board, never crawls at scale,
> never auto-applies, and never fabricates.

This is not a pivot from the SDD; it is the SDD §1 vision ("a career operating
system… the entire job-search lifecycle") made concrete, with the trust core
already built at v0.1 and **discovery elevated to a co-primary entry point**.

### The problems Hunt owns

1. **Private discovery** — finding relevant opportunities on the user's machine,
   on-demand, from sources the user is entitled to see, ranked by the same
   deterministic matching engine — without becoming an aggregator.
2. **Truthful tailoring** — generating application materials provably grounded in
   verified facts. This is the moat; nothing may dilute it.
3. **Fit intelligence** — deterministic, comparable, calibratable scoring of
   opportunities against a verified profile, and analytics that audit that scoring
   against real outcomes.
4. **A durable, portable career record** — the profile as an owned, versioned,
   fact-addressable source of truth that outlives any single search.

### The problems Hunt explicitly avoids (and why)

- **Being a job board / aggregator that hosts data for others** (SDD §3). Hosting
  and serving other people's postings means crawling infrastructure, freshness
  SLAs, legal exposure, and a server — and abandons local-first. Discovery pulls
  **into one user's local store, for that user only**. *Permanent.*
- **Auto-apply** (SDD §3). An ethics/quality trap that directly contradicts the
  moat (mandatory human review). Hunt prepares; the human submits. *Permanent.*
- **Recruiter / ATS side** — different user, different trust stance. Candidate-side
  only. *Permanent.*
- **A cloud sync service or required daemon** (N9) — on-demand commands only.
- **Becoming an ML platform** — ~6–10 thin AI tasks with strict schemas, not an
  inference stack. Determinism is the default; AI is the exception.

### Primary users

Software engineers running their own search — comfortable with a CLI and YAML
today, a local web UI tomorrow, optionally fully offline via Ollama. Hunt matures
toward a broader audience by adding **surfaces over the same capability layer**,
never by compromising the core.

### The long-term competitive advantage

**Structurally-enforced verification over an owned fact base, spanning the whole
loop.** Competitors optimize for keyword-gaming and ship LLM-judged everything;
they cannot retrofit a deterministic verification layer without rebuilding around
it. Hunt's discovery ranks by a *calibratable* function; its generation *cannot
fabricate*; its analytics *audit its own AI*. The moat is the architecture, and it
deepens with every capability that reuses the trust core.

---

## 2. Design Principles governing the evolution

1. **Two co-equal entry points.** Discovery ("find jobs") and job-description-in
   ("assess & generate") are peers. Neither is subordinate; both are how a user
   *starts*.
2. **Every new capability strengthens or reuses the trust core — never bypasses
   it, never forks a parallel system.** Discovery ranks on the shared matching
   primitive; research and prep ground with `traceClaims`/`composeGroundedDraft`;
   analytics is deterministic SQL. A capability that would need its own scorer or
   its own ungrounded generation is a design smell to resolve, not accept.
3. **Discovery emits references, never jobs.** The discovery layer's entire output
   is `OpportunityRef`s (leads) handed to the existing ingestion pipeline. This is
   what lets ATS, feeds, and paste converge downstream with zero duplication — and
   what keeps Hunt from becoming an aggregator.
4. **Discovery works from user intent alone; the profile is optional enrichment.**
   A `SavedSearch` drives ranking; the profile improves it when present but never
   gates it. Discovery is functional on day one with no profile and no AI.
5. **Determinism where it gives reliability/explainability/performance; AI only for
   language reasoning.** Ranking, filtering, dedup, scoring, tracing, analytics are
   deterministic. Extraction-from-prose, classification, drafting, narrative are AI.
6. **The core stays provider-, source-, and surface-independent** — the dependency
   rule (ADR-0002) and domain-shaped AI ports (ADR-0013) remain sacred and
   lint-enforced.
7. **Tier external reach by legality × effort × signal; the paste path is the
   always-legal floor.** "Broad web" is a user-directed, best-effort tier, never a
   standing crawler.
8. **Evaluation is infrastructure, not a phase.** The eval harness gates prompt
   iteration and discovery's best-effort tier; it is built early and reused.
9. **Incremental evolution, no rewrites.** Every capability attaches to an existing
   seam.

---

## 3. Capability Hierarchy

Hunt is **two primary capabilities over one trust core**, with connective-tissue
capabilities that turn them into a loop.

```
   PRIMARY ENTRY POINT A            PRIMARY ENTRY POINT B
   ────────────────────            ─────────────────────
   FIND                            ASSESS & GENERATE
   DiscoverJobs                    AnalyzeJob → GenerateResume / GenerateCoverLetter
   "Where are the right            "This opportunity — is it a fit,
    opportunities?"                 and prepare truthful materials."
        │                                   │
        │  OpportunityRef → import           │
        └───────────────┬───────────────────┘
                        ▼
        CONNECTIVE TISSUE (make it a loop)
        TrackApplication · QueryApplications · ComputeAnalytics ·
        ResearchCompany · PrepareInterview · RecommendLearning
                        │
                        ▼
        ┌───────────────────────────────────────────────┐
        │  TRUST CORE (the moat, reused by everything)   │
        │  • Grounding engine: select · trace · compose  │
        │  • Deterministic matching primitive:           │
        │      skillOverlap → computeFitScore (jobs)      │
        │                   → rankOpportunity (leads)     │
        │  • State machine · IDs · provenance · analytics │
        └───────────────────────────────────────────────┘
```

**Find and Assess/Generate are co-primary.** Tracking, analytics, research, prep,
and learning are valuable, but they exist to connect and improve the two front
doors — not as peers to them.

---

## 4. Platform Capabilities

Uniform contract for all: typed input (validated) → deterministic workflow with
explicit AI steps → typed output (validated) → persist + return. Each entry names
**how it reuses the trust core** — reuse is the point.

### A — DiscoverJobs *(primary entry point A)*

- **Purpose:** find relevant opportunities on the user's machine, on-demand,
  ranked to stated intent — without hosting or aggregating for anyone else.
- **Responsibilities:** resolve a `SavedSearch` → fan out to configured discovery
  adapters → collect `OpportunityRef`s → dedup against already-imported jobs and
  previously-seen refs → deterministically **pre-rank** by intent (and profile when
  present) → return ranked leads. It does **not** fetch full postings or normalize;
  the user imports chosen refs (or "import top N").
- **Inputs:** `SavedSearch` (required — the intent); profile (optional enrichment);
  source config.
- **Outputs:** ranked `OpportunityRef[]` with per-ref provenance (adapter, query,
  snippet). Discovery *proposes*; the user *imports*.
- **Internal engines:** the `DiscoveryPort` adapter registry (tiered by source);
  `rankOpportunity(ref, savedSearch, profile?)` — deterministic, over the **shared
  matching primitive**; dedup (reused from ingestion + a seen/dismissed lifecycle).
- **Public interface:** `discover(search): Promise<DiscoverResult>` — MCP-exposable.
- **Dependencies:** `DiscoveryPort` (new, async), profile repo (optional), job repo
  (dedup), the shared matching primitive. **No AI dependency for the ATS/feed
  tiers** — discovery works with zero provider, preserving the no-AI invariant.
- **Source tiers (legality × effort × signal):**
  1. **ATS boards** (Greenhouse/Lever/Ashby) — structured JSON, deterministic, no
     AI. Highest ROI; ships first.
  2. **Aggregator feeds** (RSS/JSON) — broader reach, per-source structure.
  3. **Best-effort user-directed web / big boards (incl. LinkedIn)** — bounded,
     on-demand, honest; **no standing crawler, no credentialed scraping, no
     hosting-for-others**; paste-path fallback; ships **only after** `@hunt/eval`
     can measure extraction quality.
- **Why it does not violate the non-goal:** Hunt never *hosts* discovered data for
  others, never runs a server-side fleet, and every ref lands in one user's local
  store. `OpportunityRef` stays a **lead** (ADR-0015 invariant), never a shadow
  `Job`. It is a local agent with adapters — precisely SDD §9/§22's design.
- **Future expansion:** `ManageSavedSearch` (CRUD), opt-in local scheduling
  (additive over on-demand), a discovery *agent* (emits refs), semantic re-ranking
  (`sqlite-vec`).

### B — AnalyzeJob + GenerateResume / GenerateCoverLetter *(primary entry point B)*

- **Purpose:** assess a specific opportunity's fit and generate truthful,
  fabrication-proof application materials.
- **Reuses:** deterministic scoring (`computeFitScore`, ADR-0007), the shared
  matching primitive, and the **grounding engine** (`selectCandidateFacts` →
  cite-fact-IDs composition → `traceClaims` → bounded repair → mandatory approval,
  ADR-0006 / SDD §17). Mature at v0.1.
- **AI:** analysis is AI-optional; generation is AI-required (the one place a whole
  capability requires a provider, by design).

### Connective-tissue capabilities

| Capability | Purpose | Reuses (trust core) | AI |
|---|---|---|---|
| **TrackApplication / QueryApplications** *(exists)* | lifecycle + views; feeds analytics | state machine, append-only event log | none |
| **ImportResume (onboarding)** ⊕ | seed the profile from a resume; augment on re-import | ingestion pattern, gateway, `verified`-flag | required |
| **ComputeAnalytics** ⊕ | funnel/velocity/gap-frequency + **fit-vs-outcome calibration** | event log, analytics query-model | none |
| **ResearchCompany** ⊕ | grounded company dossiers | ingestion, **`traceClaims`**, gateway | required |
| **PrepareInterview** ⊕ | prep pack + grounded answer drafts | analysis, **`composeGroundedDraft`** | required |
| **RecommendLearning** ⊕ | gap-frequency → suggested skills | **analytics**, matching | optional (narrative) |

The pattern: **every AI-using capability reuses the grounding engine or the
gateway; every deterministic one reuses the matching/analytics core.** Nothing
needs new trust infrastructure — the platform working as designed.

---

## 5. Long-Term Architecture

The v0.1 hexagonal architecture is correct and needs **no structural change** —
only extension along its existing seams. New elements are marked ⊕.

```
┌──────────────────────────── Surfaces ─────────────────────────────┐
│  CLI (today)    ⊕ Local Web UI (loopback)    ⊕ MCP Server         │
│  thin: parse intent → invoke capability → present view-model      │
└───────────────────────────────┬───────────────────────────────────┘
┌───────────────────────────────▼───────────────────────────────────┐
│  ⊕ Presentation / view-models  (shared by every surface)          │
│  extracted from run.ts; CapabilityError + formatFailure           │
└───────────────────────────────┬───────────────────────────────────┘
┌───────────────────────────────▼───────────────────────────────────┐
│  Capability Layer  (the stable typed API — the real product)      │
│  PRIMARY: DiscoverJobs · AnalyzeJob · Generate{Resume,Letter}     │
│  + ImportProfile · ImportJob · ApproveDocument · TrackApplication  │
│    · QueryApplications                                             │
│  ⊕ ImportResume · ⊕ ComputeAnalytics · ⊕ ResearchCompany          │
│  ⊕ PrepareInterview · ⊕ RecommendLearning · ⊕ ManageSavedSearch   │
└───────────────────────────────┬───────────────────────────────────┘
                                │ uses (ports only)
┌───────────────────────────────▼───────────────────────────────────┐
│  Domain Core  (@hunt/core — no I/O, no SDKs, zod only)            │
│  Canonical models (⊕ OpportunityRef, ⊕ SavedSearch) · state       │
│  machine · IDs · provenance                                       │
│  GROUNDING ENGINE: select · trace · compose-orchestration         │
│  MATCHING PRIMITIVE: skillOverlap → computeFitScore (jobs)        │
│                                   → ⊕ rankOpportunity (leads)      │
│  ⊕ analytics query-models · ⊕ eval scorers                        │
│  ALL PORTS: storage · AI · ingestion · render · ⊕ discovery       │
└───────────────────────────────────────────────────────────────────┘
    ▲ implements        ▲ implements        ▲ implements       ▲
┌──────────────┐ ┌──────────────────┐ ┌──────────────┐ ┌───────────────┐
│ Ingestion    │ │ AI Gateway       │ │ Storage      │ │ Render        │
│ envelope→norm│ │ tasks/providers  │ │ SQLite+vault │ │ HTML (⊕PDF)   │
│ ⊕ Discovery  │ │ cache/replay     │ │ ⊕ FTS ⊕ vec  │ │               │
│   adapters   │ │ ⊕ eval-run mode  │ │ ⊕ refs table │ │               │
└──────────────┘ └──────────────────┘ └──────────────┘ └───────────────┘
                        ⊕ @hunt/eval (harness + golden sets + scorers)
```

### Why each boundary exists

- **Surfaces / presentation split (⊕).** ~630 lines of view-shaping are trapped in
  `run.ts`. The moment a second surface exists, that logic must be shared or it
  re-traps. Extracting view-models is the one debt paid before surface #2.
- **Capability layer as the API.** Vindicated by expansion: every new capability —
  including the co-primary `DiscoverJobs` — fits the same contract, so surfaces and
  agents map onto it mechanically (SDD §22).
- **Core owns the reasoning; adapters own the mess.** New deterministic logic
  (`rankOpportunity`, analytics query-models, eval scorers) is pure and belongs in
  core; new I/O (discovery sources, FTS, vectors) belongs in adapters.
- **Discovery as a new async `DiscoveryPort`, not a `SourceAdapter`.** Verified
  against the code: `SourceAdapter` fetches-and-normalizes one known URL; discovery
  is the inverse — *query in, many refs out*. Discovery output feeds the existing
  `JobIngestor` unchanged. `DiscoveryPort` is async (network I/O); the synchronous
  storage ports do not need to widen because discovery collects refs, then the
  capability persists them.
- **The matching primitive as an explicit, shared core engine.** `computeFitScore`
  (jobs) and `rankOpportunity` (leads) sit on the **same** skill-canonicalization +
  overlap primitive. This is the boundary that prevents a future contributor from
  building a parallel scorer for discovery (the exact anti-pattern to avoid).
- **`@hunt/eval` as a sibling package.** Not core (it does I/O), not a capability
  (it is dev/CI infra); reuses the gateway's record/replay and the core's scorers.

### Canonical models the architecture naturally needs

- **`OpportunityRef`** ⊕ — a **lead**: `{ sourceId, ref/url, title?, company?,
  discoveredAt, queryId, snippet? }`. **Invariant (ADR-0015): never carries
  normalized job structure.** Normalization happens only in import.
- **`SavedSearch`** ⊕ — structured intent (roles/skills/location/remote/seniority);
  the **required** discovery input and the primary ranking signal.
- **`Company`** — grow the existing stub only when `ResearchCompany` lands.
- **`Interview`, `LearningItem`** — realize (SDD §11) when their capabilities land.
- **Deliberately not added:** a separate `Candidate` model (the Profile is the
  candidate), a normalized job/company graph (documents-with-relations stays), or a
  `profile_facts` merge table (full-replace-done-right needs none). YAGNI holds.

### Storage additions

An `opportunity_refs` table with a **seen/dismissed lifecycle** ("don't show me
this again"), FTS5 (Phase 2), and `sqlite-vec` for semantic re-ranking of refs
(later) — all in the single SQLite file, preserving local-first and single-file
backup.

---

## 6. Roadmap (capability-based, dependency-sequenced)

Ordering is derived from real dependencies, not preference. Two facts drive it:
discovery's **fetch tiers are independent of everything** (ATS/feeds need only the
existing ingestion pipeline), so the legal, deterministic slice of discovery ships
**immediately, in parallel**; discovery's **best-effort web tier depends on the
eval harness** (untrusted extraction must be measured), so it is deferred behind it.
Discovery is a **parallel first-class track**, phased internally by tier — a
Phase-1 headline, **not** gated behind onboarding.

### Phase 1 — Two front doors + safe iteration

| # | Deliverable | Depends on | Reuse | Risk | Success criteria | Impact |
|---|---|---|---|---|---|---|
| 1.1 | **DiscoverJobs — ATS tier, intent-first ranking** | v0.1 ingestion | ingestion, matching primitive, dedup | source markup drift | `hunt discover <search>` returns ranked real openings from ATS boards, **with no profile and no AI** | ⊕ `DiscoveryPort` + registry; `OpportunityRef`, `SavedSearch`; `rankOpportunity`; `opportunity_refs` table |
| 1.2 | **Resume onboarding (seed + augment)** | v0.1 | ingestion, gateway, `verified` | PDF parsing quality | onboard from a resume in minutes; re-import shows a delta; **enriches** discovery ranking | ⊕ `ExtractProfilePort` (one AI task) |
| 1.3 | **Eval harness** (`@hunt/eval`) | v0.1 | gateway record/replay, core scorers | building golden sets | prompt/model changes run against golden JD/resume sets with claim-trace pass-rate | ⊕ `@hunt/eval` |

*1.1 and 1.2 are peers.* 1.1 ships the "help me find jobs" front door via the
cleanest, most legal, zero-AI source; 1.2 ships the "I have my facts" path and
improves discovery ranking. Neither blocks the other. 1.3 unlocks safe iteration
and gates the later web tier.

### Phase 2 — Broaden + close the loop

| # | Deliverable | Depends on | Reuse | Success | Impact |
|---|---|---|---|---|---|
| 2.1 | **DiscoverJobs — aggregator feeds** (RSS/JSON) | 1.1 | discovery registry | feeds broaden the ref pool; each is one adapter | +feed adapters |
| 2.2 | **ComputeAnalytics** (funnel, velocity, gap-freq, **fit-vs-outcome**) | v0.1 data | event log, matching | `hunt stats`; calibration validates scoring & discovery ranking | +analytics query-model |
| 2.3 | **FTS + honest keyword-coverage awareness** | 1.3 | storage, matching | `hunt list --search`; coverage (not stuffing) report per JD | +FTS5 |

### Phase 3 — Refactor, then expand safely

| # | Deliverable | Depends on | Reuse | Success | Impact |
|---|---|---|---|---|---|
| 3.1 | **Presentation refactor** (`@hunt/presentation`) + `CapabilityError` | v0.1 | — | view-models shared; `run.ts` thinned | ⊕ presentation module |
| 3.2 | **DiscoverJobs — best-effort web/LinkedIn tier** | 1.1, 1.3 | discovery, **eval** | on-demand web discovery, paste-fallback, quality **measured** | +web adapter (best-effort) |
| 3.3 | **Local web UI** (loopback) | 3.1 | capabilities, view-models | find/review/approve/track/discover in a browser | new surface |
| 3.4 | **MCP server** | 3.1 | capabilities | any agent becomes a Hunt front-end; guardrails hold | new surface |

The risky discovery tier (3.2) lands **only after** the eval harness (1.3), so its
extraction quality is measured, not hoped.

### Phase 4 — Breadth over the mature loop

Company research (grounded dossiers, reuse `traceClaims`), interview prep (grounded
answers, reuse `composeGroundedDraft`), learning recommendations (reuse analytics),
discovery agent (reuse discovery + MCP), semantic re-ranking (`sqlite-vec`). Each
reuses existing infra; none needs new trust machinery.

### Sequencing summary

1. **In parallel now:** ATS discovery (1.1) · resume onboarding (1.2) · eval (1.3).
2. Then: feeds (2.1) · analytics + calibration (2.2) · FTS/coverage (2.3).
3. Then: presentation refactor (3.1) → web/LinkedIn discovery (3.2) → web UI (3.3)
   → MCP (3.4).
4. Then: breadth (Phase 4).

Discovery is elevated (real job-finding value in Phase 1 via ATS boards) while its
fragile/gray tier waits for the eval harness that makes it trustworthy — the
responsible way to make discovery primary without compromising the moat or the
non-goals.

---

## 7. Risks specific to this evolution

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `OpportunityRef` drifts into a shadow `Job` (silent aggregation) | Medium | High (non-goal rot) | ADR-0015 lead-vs-job invariant, guarded in review; normalization only in import |
| Best-effort web/LinkedIn tier is fragile / legally gray | High | Medium | On-demand + honest + paste fallback; no credentialed scraping; deferred behind eval |
| A contributor builds a parallel scorer for discovery | Medium | Medium | Shared matching primitive + `rankOpportunity` documented as the only path; ADR alternative recorded |
| Discovery quality gated by the small skill dictionary | Medium | Medium | Dictionary growth (existing lever); eval measures impact |
| Single-profile assumption meets multi-track pressure | Low–Med | Medium | Named as a future pressure; not designed now (YAGNI) |
| N1 outbound-call widening misread as "Hunt crawls" | Low | Medium | Explicitly framed in ADR-0015: on-demand, query-resolved, bounded, honest |

---

## 8. Internal consistency statement

The vision (two entry points), the capability hierarchy (Find and Assess/Generate
co-primary), the architecture (`DiscoveryPort` + `OpportunityRef`/`SavedSearch` +
shared matching primitive), the roadmap (discovery a Phase-1 headline, peer to
onboarding, intent-first), and [ADR-0015](adr/0015-platform-capabilities-and-discovery.md)
are aligned:

- **Discovery is co-primary, not a feeder** — reflected in the vision's first
  clause, the hierarchy's two pillars, and the roadmap's Phase-1 headline.
- **Discovery works from intent alone** — enforced in the design by
  `rankOpportunity(ref, savedSearch, profile?)`, where the profile is an optional
  argument, not a precondition.
- **Every capability reuses the trust core** — the grounding engine, the shared
  matching primitive, deterministic analytics — with no parallel systems.
- **The moat and non-goals are intact** — grounding unchanged; "never a job board /
  no crawler / no auto-apply" reaffirmed; discovery stays refs-in-local-store.

This direction is the correct long-term one: it forces no rewrite in the 3–5-year
window, preserves the architectural principles that make Hunt trustworthy, and
makes discovery a genuine primary entry point in the design — not merely in the
prose.
