# Hunt — First-Principles Reassessment (2026-07)

A ground-up evaluation of the project as it stands at **v0.1** (M0–M5 complete),
based on a full read of the codebase, docs, ADRs, and tests. Verified facts:
~6,300 LOC source / ~4,100 LOC tests, **263 tests green**, **4 external runtime
deps** (zod, yaml, better-sqlite3, node-html-parser), **0** TODO/FIXME/HACK
markers, 14 ADRs, 7 SQLite tables, 4 AI tasks, 57-entry skill dictionary.

---

## 1. Current State

**Primary purpose today.** Hunt is a **local-first, candidate-side career
operating system** whose signature capability is **grounded generation of
tailored application documents** — resumes and cover letters that cannot contain
a claim the user's own verified profile doesn't support. Everything runs on the
user's machine; AI is an optional enhancement, not a requirement for the core.

**Problems it solves today:**
- Turning a job posting (URL or pasted text) into structured, analyzable data.
- Scoring fit against the user's profile deterministically (comparable across jobs).
- Generating a resume/cover letter tailored to a job **without fabrication** —
  the anti-hallucination story is the product's reason to exist.
- Tracking an application through a validated lifecycle with an event history.
- Keeping all data inspectable and portable (SQLite + plain files + backup).

**Major features implemented (all production-ready for V1 scope):**
job import (tiered normalization: JSON-LD → DOM → AI), job analysis (deterministic
skill match + fit score + AI requirement classification), resume & cover-letter
generation (select → compose → claim-trace → bounded repair → render → human
approve), application tracking (state machine + append-only events), HTML
rendering with print CSS, backup, and a full CLI.

**Production-ready components:** the AI gateway, the grounding pipeline
(`selectCandidateFacts` + `traceClaims` + `composeGroundedDraft`), storage
(7 repositories, migrations, vault, backup), the deterministic domain core
(scoring, matching, state machine, ID derivation), ingestion (envelope-first,
dedup-by-content), and the composition-root CLI. All are tested and green.

**Experimental / incomplete / thin:**
- **LinkedIn adapter** — explicitly "best-effort" with pinned CSS selectors and
  auth-wall detection; brittle by nature (the paste path is the guaranteed route).
- **Skill dictionary** — 57 entries; deliberately small, the main quality lever.
- **Company model** — intentionally thin (name + key); dossiers are post-V1.
- **No evaluation framework** — only prompt-hash *locks* (change detection),
  not quality measurement. AI output quality is unvalidated against real models.
- **No distribution** — packages are `private`/`workspace:*`; runs from source.
- **PDF** — deferred; user prints HTML→PDF from the browser.

**Assumptions the project currently makes:**
- **Single user, single profile** (`DEFAULT_PROFILE_ID`), single pursuit per job.
- **The profile is the source of truth** and is authored as YAML (no resume import yet).
- **The user does discovery** (they paste/supply the URL); Hunt never crawls.
- **Local machine is trusted** (plaintext at rest; full-disk encryption is the OS's job).
- **AI is optional** except for generation; the whole product functions offline
  (Ollama) or with no AI at all for import/analyze/track.
- **CLI is the only surface** (no server, no UI, no daemon).

---

## 2. Architecture

**Style:** hexagonal (ports & adapters) with a **compile-time-enforced dependency
rule** — `@hunt/core` imports nothing else and does no I/O (ESLint-guarded).
Dependencies point inward only.

### Modules & responsibilities

| Package | Responsibility | Depends on |
|---|---|---|
| `@hunt/core` | Canonical models (Zod), scoring, skill matching, grounding logic (select + claim-trace), state machine, deterministic IDs, **all port interfaces** | `zod` |
| `@hunt/capabilities` | Use-case orchestrations (9 capabilities) over core + ports; staged typed errors; non-interactive | `core`, `yaml`, `zod` |
| `@hunt/storage` | SQLite repositories, migrations, content-addressed vault, backup | `core`, `better-sqlite3` |
| `@hunt/ai` | AI gateway, raw-HTTP providers (Anthropic/Ollama), 4 named tasks, cache/replay | `core`, `zod` |
| `@hunt/ingestion` | Source adapters, envelope pipeline, tiered normalization | `core`, `node-html-parser` |
| `@hunt/render` | Document → HTML (+ print CSS) behind `RenderPort` | `core` |
| `@hunt/cli` | Presentation + composition root (the only package that wires everything) | everything |

### Data flow (the V1 loop)
```
profile.yaml ──ImportProfile──▶ Profile (facts, deterministic IDs)
URL/paste ──ImportJob──▶ [envelope→vault] → tiered normalize → Job (dedup by content)
Job + Profile ──AnalyzeJob──▶ JobAnalysis (deterministic score + AI requirement classification)
Job + Analysis + Profile ──GenerateResume/Letter──▶
    selectCandidateFacts (deterministic) → compose (AI, cite fact IDs) →
    traceClaims (deterministic) → bounded repair → render HTML → Document(draft)
Document ──ApproveDocument (human gate)──▶ Document(approved, sendable)
Job ──TrackApplication──▶ Application (state machine + append-only events)
        └─ attach approved document
QueryApplications ──▶ hunt list / hunt show
```

### LLM pipeline (the crown jewel)
One choke-point: `runStructuredTask(options, task, input)`. Each **AI task is
data** (`{id, version, instructions, outputSchema, renderInput, maxTokens}`).
The gateway appends the Zod-derived JSON Schema to the system prompt, runs a
**bounded 2-attempt schema-repair loop**, and unifies **caching + record/replay**
(one mechanism; replay = "cache miss is an error" for offline CI). Providers are
**raw HTTP** (`fetch`, no SDKs, ADR-0012). A *second*, distinct repair loop lives
in capabilities (`composeGroundedDraft`, `MAX_REPAIR_ROUNDS=2`) enforcing
*factual grounding* — the gateway fixes JSON validity, the capability fixes
truthfulness. AI ports are **domain-shaped** (`ExtractJobPort`, `ComposeResumePort`,
…), so business logic never knows an LLM is behind them (ADR-0013).

### Storage layer
SQLite (better-sqlite3, WAL, FKs) with a consistent **hot-columns-promoted +
full-model-in-JSON** pattern; every read re-validates through the Zod schema.
7 tables; applications are the **only event-sourced aggregate** (append-only
`application_events`, materialized `status`). Content-addressed vault for raw
payloads (immutable). Forward-only migrations with automatic pre-migration
backup. **No FTS, no embeddings** (both deferred).

### APIs / UI / integrations
- **API:** none external — the **capability layer *is* the stable API** (typed
  input → typed result), designed so a UI/MCP/agent maps onto it mechanically.
- **UI:** none — CLI only (thin on business logic, but ~630 lines of presentation
  formatting live in `run.ts`).
- **External integrations:** only (a) fetching a user-supplied URL and (b) the
  configured LLM provider. No Gmail/Calendar/GitHub, no job boards, no crawling.

### Strengths
- **The grounding architecture** — schema-required fact-ID citation + deterministic
  claim tracing + mandatory human review. Genuinely more rigorous than typical
  LLM apps; this is the moat.
- **Determinism discipline** — the AI is a function, not an actor; scoring/selection/
  tracing are deterministic and testable without a network or a model.
- **Dependency minimalism** — 4 runtime deps for a whole career OS; supply-chain
  surface is auditable at a glance.
- **The dependency rule + ports** — adapters are mutually deletable; the core will
  outlive every provider and UI.
- **Self-documenting** — 14 ADRs, a decision log, and doc-tracked debt with
  migration paths. Zero code-comment debt markers.

### Weaknesses
- **No eval framework** — prompt *quality* is unmeasured; only prompt *change* is
  detected. This is the single most important gap for an AI product.
- **`run.ts` presentation weight** — view-shaping logic (renderAnalysis, etc.) is
  locked inside CLI functions; a future UI/API surface would need it extracted.
- **Staged-error shape duplicated** across 8 capabilities with no shared helper;
  the CLI re-implements `Failed (${stage}): ${message}` formatting ~8 times.
- **Duplicated composer internals** (`renderFacts`, `MAX_CONTEXT_CHARS`) across the
  two generation tasks.
- **Dated Anthropic path** — pins `anthropic-version: 2023-06-01`, relies on
  prompt-instructed JSON rather than native structured-output/tool-use APIs.
- **Single-profile assumption** is baked in (`DEFAULT_PROFILE_ID`).

---

## 3. Existing Capabilities

| Capability | What it does | Maturity | Missing | Future improvement |
|---|---|---|---|---|
| **ImportProfile** | YAML → validated Profile with deterministic fact IDs | Prod | Merge/augment (M7); no resume seed (M6) | Delta summary; PDF/DOCX seeding |
| **GetProfile** | Fetch the single profile | Prod | — (single-profile) | Multi-profile later |
| **ImportJob** | URL/paste → canonical Job (tiered normalize, dedup, company resolve) | Prod | More adapters (Greenhouse/Lever/Ashby); requirement spans | Structured-API adapters (cheap wins) |
| **AnalyzeJob** | Deterministic skill match + fit score; optional AI requirement classification, red flags, gaps | Prod | Bigger dictionary; comp calibration | Grow dictionary; fit-vs-outcome calibration (needs analytics) |
| **GenerateResume** | Grounded resume (select→compose→trace→repair→render→draft) | Prod (AI-required) | ATS/keyword optimization; format variety | ATS pass; templates; keyword coverage lint |
| **GenerateCoverLetter** | Grounded cover letter, same rails | Prod (AI-required) | Tone/angle controls beyond minimal | Angle directives; company-research grounding |
| **ApproveDocument** | One-way human-review gate (draft→approved, immutable) | Prod | — | Diff-against-facts review view |
| **TrackApplication** | State-machine lifecycle, append-only events, auto-create, attach docs | Prod | Reminders/staleness → ghosted suggestion | Staleness detection; analytics feed |
| **QueryApplications** | `list`/`show` read assembly (fit + status + timeline) | Prod | Filtering/search beyond status | FTS; funnel/velocity views |

---

## 4. Resume Optimization (deep evaluation)

This is the product's core, so it deserves precision about **what exists vs. the
common "resume optimizer" feature set**.

| Concern | State | Detail |
|---|---|---|
| **Resume parsing** | ❌ Not built (planned M6) | No PDF/DOCX/text → profile path yet; profile is hand-authored YAML |
| **Resume understanding** | ⚠️ Indirect | Understanding lives on the *profile* side (structured facts), not on an uploaded resume |
| **Job description parsing** | ✅ Mature | Tiered normalization → `descriptionText` + structured Job; requirements extracted by AI in analysis |
| **Skill extraction** | ✅ Mature (deterministic) | Token-based `detectSkills` over a 57-entry dictionary with alias/phrase matching; **no substring false positives** |
| **Scoring** | ✅ Mature (deterministic) | `computeFitScore`: mustCoverage 0.5 / skillOverlap 0.3 / seniorityAlignment 0.2, renormalized over computable components; stable & comparable (ADR-0007) |
| **Evidence validation** | ✅ **Distinctive** | `traceClaims`: fact-ID validity + lexical checks (numbers, technologies) against cited facts; 6 violation kinds; bounded repair; mandatory human approval. This is the strongest part of the whole system |
| **Feedback generation** | ⚠️ Partial | Analysis surfaces matched/missing skills, gaps, red flags, per-requirement coverage. But there's **no resume-improvement feedback loop** ("your resume is missing keyword X for this job") — feedback today is about the *job/profile fit*, not about *improving an existing resume* |
| **ATS analysis** | ❌ Not built | No ATS-format checks, no keyword-density/coverage scoring against a JD, no parseability lint |
| **Keyword optimization** | ⚠️ Implicit only | The composer is *told* the missing skills ("do NOT claim these"), so it emphasizes what's genuinely present — but there's no explicit keyword-coverage measurement or optimization pass |
| **LLM prompting strategy** | ✅ Consistent convention | "role + Rules: bullet list" per task; grounding-by-citation for composers, anti-hallucination for extractors; unified by the gateway (JSON schema + repair). **Not a prompt *framework*** — rules are hand-written per task; `renderFacts` duplicated |

**Achieved:** a *fabrication-proof* generation engine grounded in verified facts,
with deterministic fit scoring and honest gap analysis. This is a real,
differentiated achievement.

**Missing (relative to a full "resume optimizer"):** resume *ingestion*, explicit
**ATS/keyword-coverage analysis**, and a **resume-improvement feedback loop** that
tells the user how to strengthen their profile/resume for a target job (as opposed
to just generating from what exists). Notably, Hunt's philosophy *inverts* the
typical ATS-keyword-stuffing optimizer: it optimizes for **truthful tailoring**,
not keyword gaming. That's a deliberate, defensible stance — but keyword *coverage
awareness* (not stuffing) is a legitimate gap.

---

## 5. Reusable Components

Ranked by leverage for future features:

1. **AI gateway (`runStructuredTask` + `AiTask` + `LLMProvider` + cache/replay)** —
   the reusable substrate for *any* new AI task. Add a schema + instructions +
   renderer; get validation, repair, caching, replay, provider-independence free.
2. **Grounding engine (`composeGroundedDraft` + `traceClaims` + `selectCandidateFacts`)** —
   reusable for *any* cite-your-sources generation (interview answers, LinkedIn
   summaries, outreach messages — all could be grounded in profile facts).
3. **Scoring/matching (`computeFitScore`, `detectSkills`, `matchSkills`, dictionary)** —
   reusable for job↔profile matching, gap analytics, learning recommendations.
4. **Ingestion skeleton (envelope→tiered-normalize + `SourceAdapter` contract)** —
   the same pattern serves resumes, company pages, emails (SDD §8 says so explicitly).
5. **Storage models & repository pattern** — the hot-column+JSON+Zod-revalidate
   pattern extends to any new entity mechanically.
6. **The capability layer as the stable API** — every capability is already
   tool-definition-shaped; exposing them via MCP/HTTP/UI is a mechanical mapping.
7. **Deterministic ID derivation + provenance + `verified` flags** — reusable
   trust infrastructure for any user-vouched data.

Gaps in reusable infra: **no rubric/eval framework** (there's no scoring-of-outputs
harness to reuse), **no prompt-template/fragment library** (each task hand-writes
rules), and **no view/presentation layer** separable from the CLI.

---

## 6. Project Vision — what is this becoming?

**Today it is best described as a "Grounded Career-Document Assistant" — the
trustworthy core of a broader AI Career Platform.** Here's the reasoning against
each label:

- **Resume Optimizer?** Too narrow, and philosophically opposite — Hunt refuses
  keyword-stuffing; it does *truthful tailoring*. It's more than a resume tool
  (it tracks applications, analyzes jobs).
- **ATS Analyzer?** No — it has no ATS/keyword-coverage analysis at all. This is
  a *gap*, not the identity.
- **AI Recruiter?** No — it's explicitly candidate-side, single-user, not an ATS
  for recruiters (SDD §3 non-goal).
- **Job Search Platform?** Not yet — no discovery, no aggregation (deliberately;
  "never a job board", SDD §3), no networking/salary/company research.
- **Career Assistant?** *This is the trajectory.* The SDD's own vision (§1) is a
  "career operating system … the entire job-search lifecycle." The capability
  layer, canonical models, and grounding engine are the substrate for exactly
  that — discovery, understanding, generation, tracking, research, prep, analytics,
  learning are all named future capabilities using the same contract shape.

**Verdict:** the project has *built the hard, trust-critical core* of an AI Career
Assistant (verified-fact grounding + deterministic analysis + lifecycle tracking)
and deliberately deferred the *breadth* (discovery, research, prep, analytics).
It is evolving into a **modular, local-first AI Career Assistant** whose
differentiator is **provable truthfulness**, not feature count.

---

## 7. Gap Analysis (current → end-to-end AI Career Assistant)

Ordered by leverage. ✅ done · ⚠️ partial · ❌ missing.

| Domain | State | Gap |
|---|---|---|
| **Profile onboarding** | ❌ | No resume import (M6); hand-authored YAML only — **the biggest onboarding friction** |
| **Profile maintenance** | ❌ | No merge/augment on re-import (M7) — save is full-replace |
| **Job discovery** | ❌ | User supplies every URL; no saved searches, RSS, board adapters, or discovery agent |
| **Job understanding** | ✅ | Analysis is mature |
| **Resume tailoring** | ✅ | Grounded generation is mature (the strength) |
| **Cover letters** | ✅ | Same rails, mature |
| **ATS / keyword coverage** | ❌ | No parseability or keyword-coverage analysis |
| **Application tracking** | ✅ | State machine + events, mature |
| **Analytics** | ❌ | No funnel/velocity/gap-frequency/fit-vs-outcome (all deterministic-SQL-ready) |
| **Interview preparation** | ❌ | No prep packs from analysis/profile |
| **Company research** | ❌ | Company model is a stub; no dossiers |
| **Networking assistance** | ❌ | Not in scope anywhere |
| **Salary insights** | ⚠️ | Compensation parsed per-job; no market/benchmark data (would need external data — tension with local-first) |
| **Search/retrieval** | ❌ | No FTS, no embeddings |
| **Multiple surfaces (UI/MCP)** | ❌ | CLI only; capability layer is ready for them |

**The three highest-leverage gaps:** (1) **resume import** (onboarding — nothing
else matters if users can't easily get in), (2) **analytics** (nearly free — it's
SQL over data already captured, and it *closes the loop* on the scoring function),
and (3) **structured-API job adapters** (Greenhouse/Lever/Ashby publish JSON —
cheap discovery-adjacent wins).

---

## 8. Technical Debt

**The good news:** genuinely low. 0 code debt markers, 4 deps, comprehensive
tests, every deferral logged with a migration path. Most "missing abstractions"
are deliberate YAGNI, not oversights.

**Real items, by priority:**

1. **No evaluation framework (highest).** Prompt-hash locks detect *change*, not
   *quality*. For an AI product this is the critical gap — you cannot safely
   iterate prompts/models without golden inputs + expected-output assertions +
   claim-trace pass-rate metrics. The infra exists (record/replay) but no eval
   set is committed.
2. **Presentation logic trapped in `run.ts` (~630 lines).** View-shaping
   (renderAnalysis, renderGenerateResult, list/show formatters) is inline. A UI
   or MCP surface — both on the roadmap — will need it. Extract a presenter/
   view-model layer before building surface #2.
3. **Staged-error duplication.** The `{ok, stage, message, hint}` shape is
   re-declared in 8 capabilities and re-formatted ~8× in the CLI. A shared
   `CapabilityError` type + a `formatFailure()` CLI helper removes real duplication.
4. **Composer duplication.** `renderFacts` + `MAX_CONTEXT_CHARS` copied across
   draft-resume and draft-cover-letter; extract to a shared module.
5. **Dated Anthropic provider.** Pinned `2023-06-01`, prompt-instructed JSON
   instead of native structured outputs; validate current model IDs and consider
   the structured-output API to eliminate a class of repair round-trips.
6. **Test fixture duplication.** `make*/build*` factories recur across capability/
   ingestion tests instead of a shared fixtures module (storage has one).
7. **Skill dictionary size (57).** Match quality's main lever; data-only growth.
8. **Cache key hashes user-string only** (not instructions) — the prompt-lock
   test is the compensating control; note the coupling.
9. **Single-profile assumption** (`DEFAULT_PROFILE_ID`) — fine for now, but any
   multi-profile future touches many call sites.

**Refactor-before-major-features recommendation:** items **2 and 3** should
precede any new *surface* (web UI, MCP) or any *fleet of new capabilities*, because
both duplications compound with each addition. Item **1 (eval)** should precede any
*prompt/model iteration* work. None block M6/M7.

---

## 9. Recommendations

**Keep as-is (the foundation — do not touch):**
- The hexagonal architecture + dependency rule.
- `@hunt/core` in its entirety (models, scoring, grounding, state machine, IDs).
- The AI gateway and the grounding engine — these are the moat.
- The storage pattern (hot-column + JSON + Zod-revalidate) and the vault.
- The dependency-minimalism discipline and the ADR/decision-log practice.

**Refactor (before scaling surfaces/capabilities):**
- Extract a **presenter/view-model layer** out of `run.ts` (unblocks UI/MCP).
- Introduce a shared **`CapabilityError` + `formatFailure`** convention.
- De-duplicate composer internals (`renderFacts`).
- Build an **eval harness** (golden inputs → assertions + claim-trace pass rate).

**Remove:** nothing. There is no dead code or speculative abstraction to delete —
a direct result of the YAGNI discipline. (The one *simplification*, not removal:
the repository boilerplate could collapse into a generic JSON-column helper, but
the explicit form is arguably clearer at this scale — low priority.)

**Promote to independent modules (when the time comes):**
- **`@hunt/ai` gateway** is already effectively a standalone structured-LLM
  library — it could be extracted/published for reuse.
- A future **`@hunt/eval`** package (harness + golden sets + scorers).
- A future **`@hunt/presentation`** (view-models) shared by CLI + web UI + MCP.
- The **grounding engine** (`select` + `claim-trace` + `composeGroundedDraft`)
  could become a named sub-module — it's the reusable heart for any grounded
  generation beyond resumes.

**Strongest foundations for future work:** (1) the AI gateway, (2) the grounding
engine, (3) the deterministic scoring/matching core, (4) the capability layer as
the stable API. Build outward from these; don't rebuild them.

---

## 10. Proposed Roadmap (redesigned)

The old roadmap was a linear feature list (resume import → extension → web UI →
analytics → prep → MCP → agent). **I recommend restructuring it around the vision
— a modular AI Career Assistant with truthfulness as the moat — grouped into
phases that each ship independent value and respect dependencies.**

### Guiding principle
Hunt has built the **trust core**. The roadmap should (a) remove onboarding
friction so people can actually *use* it, (b) harden the AI core with evaluation
before iterating on quality, (c) close the analytics loop that's nearly free, and
(d) *then* expand breadth (discovery, research, prep) and surfaces (UI, MCP) — with
one deliberate refactor to make multi-surface expansion clean.

### Modular architecture for the evolution
```
                        ┌───────────────── Surfaces ─────────────────┐
                        │  CLI    Web UI (loopback)    MCP server     │
                        └───────────────────┬─────────────────────────┘
                                            │  (all over the SAME capabilities)
        ┌───────────────────────────────────▼───────────────────────────────┐
        │  Capability layer  (stable typed API — the product's real surface) │
        │  Onboard · Analyze · Generate · Track · Discover · Research ·       │
        │  Prep · Analytics · Recommend                                       │
        └───────┬───────────────┬───────────────┬───────────────┬────────────┘
   ┌────────────▼──┐  ┌──────────▼───────┐  ┌────▼──────────┐  ┌─▼───────────────┐
   │ Grounding      │  │ AI gateway +     │  │ Deterministic │  │ Storage +       │
   │ engine (moat)  │  │ eval harness     │  │ core (score,  │  │ vault + FTS     │
   │ select/trace   │  │ tasks/providers  │  │ match, SM)    │  │ (+ vec later)   │
   └────────────────┘  └──────────────────┘  └───────────────┘  └─────────────────┘
                    presentation/view-models (shared by all surfaces)
```
New shared modules to introduce as they're needed: **`@hunt/eval`** (Phase 1),
**`@hunt/presentation`** (Phase 3), and later a **discovery** package.

### Phases

Complexity: S(mall)/M(edium)/L(arge). Priority: P0 (do first) → P3.

---

**Phase 1 — Onboarding & AI Hardening** *(make it usable & safe to iterate)*
| # | Milestone | Deliverable | Depends on | Complexity | Priority |
|---|---|---|---|---|---|
| 1.1 | **Resume Import (Seed)** = old M6 | `hunt profile from-resume` (text/paste first, then PDF/DOCX) → reviewable `profile.yaml` of unverified facts | v0.1 | M | **P0** |
| 1.2 | **Profile Augment** = old M7 | Re-import merges (full-replace-done-right) + delta summary | 1.1 | S | **P0** |
| 1.3 | **Eval harness** (`@hunt/eval`) | Golden JD/resume inputs → expected extractions + claim-trace pass-rate + fit-score assertions; runnable on prompt/model change | v0.1 | M | **P0** |
*Rationale:* 1.1/1.2 remove the #1 friction (nobody can use Hunt without a profile);
1.3 lets you safely improve every AI task thereafter. All three unblock everything else.

---

**Phase 2 — Close the Loop (near-free, high-value)**
| # | Milestone | Deliverable | Depends on | Complexity | Priority |
|---|---|---|---|---|---|
| 2.1 | **Analytics** | Deterministic SQL: funnel, velocity, gap-frequency, **fit-vs-outcome calibration**; `hunt stats` | v0.1 (data already captured) | M | **P1** |
| 2.2 | **FTS surfacing** | SQLite FTS5 over jobs/notes; `hunt list --search`; filters | v0.1 | S | P1 |
| 2.3 | **Skill-dictionary growth + ATS keyword-coverage lint** | Grow dictionary from real usage; add a *coverage* (not stuffing) report: which JD keywords the profile/resume covers | 1.3 (eval to measure) | M | P1 |
*Rationale:* analytics is mostly `GROUP BY` over the event log — it audits the
scoring function and turns the tool from "generate docs" into "understand my search."

---

**Phase 3 — Refactor for Multi-Surface, then Web UI**
| # | Milestone | Deliverable | Depends on | Complexity | Priority |
|---|---|---|---|---|---|
| 3.1 | **Presentation refactor** (`@hunt/presentation`) | Extract view-models out of `run.ts`; shared `CapabilityError`/`formatFailure` | v0.1 | M | **P1** (debt) |
| 3.2 | **Local web UI** (loopback, session token) | Read/review/approve/track over the capability layer; the review-diff-against-facts view | 3.1 | L | P2 |
*Rationale:* do the debt refactor (§8 items 2–3) *once*, right before the second
surface, so UI and MCP don't re-trap logic.

---

**Phase 4 — Breadth: Discovery, Research, Prep**
| # | Milestone | Deliverable | Depends on | Complexity | Priority |
|---|---|---|---|---|---|
| 4.1 | **Structured-API adapters** (Greenhouse/Lever/Ashby) | Cheap wins — they publish JSON; slot into the existing tiered pipeline | v0.1 | S–M | **P2** |
| 4.2 | **Browser extension capture** | One-click posting capture → paste path | 4.1 | M | P2 |
| 4.3 | **Company research** | Grow Company model; dossiers grounded in imported material (reuse grounding engine) | v0.1 | M | P3 |
| 4.4 | **Interview prep packs** | Questions from analysis + profile; grounded answer drafting (reuse `composeGroundedDraft`) | 2.1 | M | P3 |
| 4.5 | **Learning recommendations** | Gap-frequency (from 2.1) → suggested skills/resources | 2.1 | S | P3 |
*Rationale:* these are the breadth of a career assistant; each reuses existing infra
(grounding engine, ingestion pattern, analytics).

---

**Phase 5 — Surfaces & Ecosystem**
| # | Milestone | Deliverable | Depends on | Complexity | Priority |
|---|---|---|---|---|---|
| 5.1 | **MCP server** | Expose capabilities as MCP tools → any agent becomes a Hunt front-end (guardrails still apply) | 3.1 | M | P2 |
| 5.2 | **Distribution** | Bundler (tsup/esbuild) → `npm i -g` / single binary | v0.1 | S–M | **P1** (whenever real users arrive) |
| 5.3 | **Discovery agent** | Runs saved searches, emits refs into ingestion (no new architecture) | 4.1, 5.1 | M | P3 |
| 5.4 | **Semantic search** (sqlite-vec) | Embeddings via the gateway as re-ranker over FTS | 2.2 | M | P3 |
*Rationale:* MCP is the highest-leverage *surface* move (SDD §22) and depends only
on the presentation refactor; distribution should happen as soon as there are users.

### Sequencing summary (what I'd actually do, in order)
1. **1.1 Resume Import**, then **1.2 Augment** — usable onboarding. *(P0)*
2. **1.3 Eval harness** — safe AI iteration. *(P0, parallelizable with 1.x)*
3. **2.1 Analytics** — close the loop, near-free. *(P1)*
4. **3.1 Presentation refactor** — pay the debt before surface #2. *(P1)*
5. **5.2 Distribution** — the moment you want real users. *(P1, on demand)*
6. Then breadth (Phase 4) and surfaces (3.2 UI, 5.1 MCP) as priorities dictate.

### Why this over the old roadmap
The old order (extension → web UI → analytics → prep → MCP → agent) front-loads
*breadth and surfaces* before **onboarding** (users can't start) and before
**evaluation** (can't safely improve the AI) — and defers **analytics**, which is
the cheapest, loop-closing win. The redesign puts *usability and safety first*,
*near-free value second*, *one deliberate refactor third*, and *breadth/surfaces
last* — each phase shippable on its own, every item building on the existing
trust core rather than around it.
```
