# Hunt Progress

## Overall Progress

| Milestone | Status |
|-----------|--------|
| M0 — Skeleton | ✅ |
| M1 — Models & storage | ✅ |
| M2 — Ingestion | ✅ |
| M3 — Analysis | ✅ |
| M4 — Generation | ✅ |
| M5 — Tracking & release | ✅ |

**All V1 milestones complete → v0.1.**

---

## Current Milestone

**M5 — Tracking & release** · Status: **complete, awaiting approval** · Completion: 100%

Objective: complete the V1 loop and ship v0.1 — `hunt track/list/show/backup` over the existing state machine + event log, attach generated documents to applications, and the release documentation (user guide, data format, adapter authoring). No core changes: M5 is a capability + CLI layer over M1's primitives.

---

## Completed Work

| Date | Work | Notes |
|------|------|-------|
| 2026-07-03 | M0: scaffold, dependency rule, draft schemas, CI, docs, ADRs 0001–0010 | |
| 2026-07-05 | M1: finalized models, state machine, SQLite storage, vault, profile import, ADR-0011 | |
| 2026-07-07 | M2: envelope pipeline, tiered normalization, AI gateway, providers, ImportJob, `hunt import`, ADR-0012/0013 | |
| 2026-07-07 | Core: skill dictionary v1 (~55 canonical skills + aliases, pure data), token-based detection (no substring false positives), profile↔job matching with two-sided canonicalization | SDD §18 pass A |
| 2026-07-07 | Core: `parseCompensation` (ranges, k-suffix, currencies, periods; 401(k) noise guard), `computeFitScore` (weighted, renormalizing; ADR-0007), candidate seniority from experience span (decisions #14), `JobAnalysis` + `JobInsights` models, `JobInsightsPort` + `JobAnalysisRepository` ports | SDD §18 pass D |
| 2026-07-07 | `@hunt/ai`: job-insights task v1 (grounding rules; no score emission); prompt-lock test infra (decisions #13) | SDD §18 pass B |
| 2026-07-07 | Storage migration 3 (`job_analyses`) + repository | |
| 2026-07-07 | `AnalyzeJob` capability: A → optional B → merge C (import-stated seniority beats AI; import requirements beat AI classification; skills always deterministic) → D; deterministic analysis id → re-analysis refreshes | SDD §18 pass C |
| 2026-07-07 | CLI `hunt analyze <job-id>` with breakdown, per-requirement coverage, provenance markers | |
| 2026-07-07 | Tests 153 → 198; one real bug found and fixed by tests: "401k" parsed as salary | |
| 2026-07-07 | M4 Core: `ResumeDocument`/`CoverLetterDocument` (fact-ID-cited bullets, immutable-once-approved), `CandidateFact` view, AI draft schemas (min-1 `sourceFactIds`); `selectCandidateFacts` (deterministic relevance ranking); `traceClaims` (ID validity + conservative lexical check + format lint) + repair-feedback formatter; ports `ComposeResumePort`/`ComposeCoverLetterPort`/`RenderPort`/`DocumentRepository` | SDD §17 steps 1–3 |
| 2026-07-07 | M4 `@hunt/ai`: `draft-resume` + `draft-cover-letter` tasks constrained to candidate fact IDs; prompt locks extended | SDD §17 step 2 |
| 2026-07-07 | M4 `@hunt/render` (new package): `RenderPort` → self-contained HTML + print CSS; HTML-escaping; PDF deferred behind the port (ADR-0014) | SDD §17 step 4 |
| 2026-07-07 | M4 Storage: migration 4 (`documents`) + repository | |
| 2026-07-07 | M4 Capabilities: `GenerateResume`/`GenerateCoverLetter` (select → compose → trace → bounded repair → render → persist draft, `needsReview`); `ApproveDocument` (one-way review gate, immutable thereafter); shared `composeGroundedDraft` loop | SDD §13, §17 |
| 2026-07-07 | M4 CLI: `hunt resume`/`hunt letter` (writes HTML to `documents/<company>-<role>-<date>/`, prints grounding summary) and `hunt approve <doc-id>`; ports wired in container/ai-config | |
| 2026-07-07 | Tests 198 → 243; full generation E2E through the real gateway + a fake Ollama that grounds in a parsed candidate fact id, incl. the repair-loop path | SDD §20 |
| 2026-07-07 | M4 manually validated against a live local model (qwen3:14b via Ollama): resume grounded cleanly (0 repair rounds); cover letter for the same low-fit job hit the repair budget and was refused ("distributed systems" unsupported) — the grounding invariant holding under adversarial pressure. Isolated `HUNT_HOME`; nothing ungrounded persisted. | — |
| 2026-07-09 | M5 Capabilities: `TrackApplication` (auto-create on first track; transition/note/attach/contact via the M1 state-machine-enforcing repo); `QueryApplications` (list with fit+status, detail by job-id or app-id). | SDD §13 |
| 2026-07-09 | M5 Storage: `backup` (VACUUM INTO snapshot + vault/documents copy + integrity check) on `HuntStorage`. | SDD §14 |
| 2026-07-09 | M5 CLI: `hunt track/list/show/backup`; `CLI_VERSION` now read from package.json (M0 debt cleared); version → 0.1.0. Full V1-loop E2E (import→analyze→resume→approve→track→attach→show). Tests 243 → 263. | SDD §20, §26 |
| 2026-07-09 | Release docs: `docs/user-guide.md`, `docs/data-format.md`, `docs/adapter-authoring.md`; README updated. | SDD §26 |

---

## Current Focus

Nothing in flight — M5 delivered, all V1 milestones complete (v0.1), stopped per milestone workflow.

---

## Next Steps

V1 is feature-complete. Remaining before a real release cut are **maintainer actions**, not milestones:
1. Real-posting validation sweep (M2 exit) — 10 real postings via paste across 3+ sites.
2. Live AI fixture recording + behavioral eval for the four AI tasks (extract-job, job-insights, draft-resume, draft-cover-letter) — needs a provider key; prompt locks cover the offline invariant.
3. Distribution: the packages are `private` with `workspace:*` deps; a real `npm i -g` / single-binary build needs a bundler (deliberately deferred — see decisions #20).
4. Run the full loop in anger on a real job search (the SDD §26 v0.1 exit criterion).

Post-V1 order of attack (SDD §27), with the top item now split into two planned, designed milestones:
- **M6 — Resume Import (Seed):** `hunt profile from-resume` → proposed `unverified` facts → reviewable `profile.yaml` → existing `hunt profile import` confirms. Text/paste first (zero new deps), PDF/DOCX follow-on.
- **M7 — Profile Augment:** re-importing an edited `profile.yaml` merges (full-replace done correctly — absence = deletion, `verified` promotes on re-import; no `profile_facts` table) with an added delta summary so deletions aren't silent. **This augment loop was a gap in the original SDD §27** — it named seeding, not the edit-and-re-import loop.
- Then: browser extension + Greenhouse/Lever/Ashby adapters, web UI, analytics + FTS, interview prep + company research, MCP server, discovery agent.

M6/M7 are designed and approved (see the plan file); implementation awaits explicit go-ahead, M6 first.

**Standing maintainer actions:** items 1–2 above.

---

## Technical Debt

| Item | Reason | Recommendation |
|------|--------|----------------|
| ~~CLI version string duplicated in `run.ts`~~ | ~~Carried from M0~~ | **Resolved M5**: `CLI_VERSION` reads from package.json |
| `hunt profile show` output minimal | Carried from M1 | Acceptable for v0.1; richer view lands with the web UI |
| AI quality unvalidated against real models | Carried from M2; prompt locks now force versioning discipline, but behavioral eval needs live calls | Record fixtures + run eval when a key is available |
| Skill dictionary is deliberately small (57 entries) | Quality investment is data-only and incremental | Grow it from real usage; every unknown-but-relevant skill in a posting is a dictionary PR |
| Requirement `span` offsets (SDD §11) not populated | AI offsets are unreliable; JSON-LD/DOM tiers don't isolate requirement sentences | Revisit if the audit UI (post-V1) needs highlighting |
| ~~No `hunt jobs list/show`~~ | ~~M5 scope~~ | **Resolved M5**: `hunt list` / `hunt show` |
| Automated PDF rendering not shipped | Headless-browser dependency deferred (ADR-0014) | User prints HTML→PDF; add a PDF adapter behind `RenderPort` when it earns its keep |
| ~~Generated documents not yet attachable to an application~~ | ~~M4~~ | **Resolved M5**: `hunt track <job-id> --attach <doc-id>` |
| Distribution not packaged (`npm i -g` / binary) | Packages are `private` with `workspace:*` deps; a real install needs a bundler | Maintainer action; decisions #20 |
| Lexical claim check is conservative (numbers + dictionary skills) | Deliberate (SDD §17) — mandatory human review covers the rest | Grow the rule set only if real usage surfaces a dangerous miss |
| Grounding-failure output is a validation error, not career guidance | Surfaced in manual M4 test (2026-07-07): a cover letter for a low-fit job failed after the repair budget because the model kept reaching for a skill (`distributed systems`) the profile lacks. The CLI correctly refuses and lists the violating claim, but a user wants next steps, not a lint message. | When a generation exhausts the repair loop on `unsupported-skill` violations, summarize the missing skills that drove it and suggest the choice ("add it to your profile if you have it, or proceed with a document that doesn't claim it"). CLI-only presentation change; the capability already returns the typed violations. |
| No evaluation framework (only prompt-hash locks) | Surfaced in the 2026-07 reassessment. Prompt locks detect prompt *change*, not output *quality*; there is no committed golden-input/expected-output eval set. For an AI product this is the top gap — you cannot safely iterate prompts/models without it. | Build `@hunt/eval` (golden JD/resume inputs → expected extractions + claim-trace pass-rate + fit-score assertions), runnable on prompt/model change. Prioritized in the reassessment roadmap (Phase 1). |
| Presentation logic trapped in `run.ts` (~630 lines) | View-shaping (renderAnalysis, renderGenerateResult, list/show formatters) is inline in the CLI. A web UI or MCP surface (both roadmapped) will need the same view-models. | Extract a presenter/view-model layer (a future `@hunt/presentation`) before building surface #2 (reassessment Phase 3). |
| Staged-error shape duplicated across 8 capabilities | The `{ok, stage, message, hint}` result is re-declared per capability and the `Failed (${stage}): ${message}` formatting is re-implemented ~8× in `run.ts`. Consistent by convention but not DRY. | Introduce a shared `CapabilityError` type + a `formatFailure()` CLI helper. |
| Composer internals duplicated | `renderFacts` and `MAX_CONTEXT_CHARS` copied between `draft-resume` and `draft-cover-letter`. | Extract to a shared module in `@hunt/ai`. |
| Anthropic provider uses a dated API path | Pins `anthropic-version: 2023-06-01` and relies on prompt-instructed JSON rather than native structured-output/tool-use. Functional (repair loop catches malformed JSON) but dated. | Validate current model IDs; consider the structured-output API to remove a class of repair round-trips. |
| AI cache key hashes the user string only, not `instructions` | Editing instructions without bumping the task version would reuse a stale cache key. | Compensating control exists (the prompt-lock test forces a version bump on instruction edits); note the coupling if the lock test is ever changed. |

---

## Risks

- Fit-score calibration is untested against real outcomes — by design it waits for §19 analytics (fit-vs-outcome). Until then scores are comparative, not absolute; the CLI shows the breakdown to keep them interpretable.
- The example profile scoring 28/100 against the Go/Kubernetes fixture is *correct* behavior (real gap) — worth remembering when users report "low scores" as bugs.
- Generation quality against real models is unvalidated offline (as with M2/M3 AI tasks); prompt locks enforce versioning discipline, but the composer's grounding behavior needs live fixtures + the eval set (maintainer action). The *structural* grounding guarantee (claim tracing, mandatory review) holds regardless of model quality — that is the point of §17.

---

## Blockers

None. Reminder: `git init` + commits remain a maintainer action.
