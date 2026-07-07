# Hunt Progress

## Overall Progress

| Milestone | Status |
|-----------|--------|
| M0 — Skeleton | ✅ |
| M1 — Models & storage | ✅ |
| M2 — Ingestion | ✅ |
| M3 — Analysis | ✅ |
| M4 — Generation | ✅ |
| M5 — Tracking & release | ⬜ |

---

## Current Milestone

**M4 — Generation** · Status: **complete, awaiting approval** · Completion: 100%

Objective: the SDD §17 grounded pipeline end-to-end — deterministic fact selection → AI composition constrained to candidate fact IDs → deterministic claim tracing with a bounded repair loop → HTML render → mandatory human-review gate; cover letters on the same rails; `hunt resume` / `hunt letter` / `hunt approve`.

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

---

## Current Focus

Nothing in flight — M4 delivered, stopped per milestone workflow.

---

## Next Steps

On approval, begin **M5 — Tracking & release** (SDD §26/§27):
1. `hunt track` / `list` / `show` over the application state machine + event log.
2. Attach approved documents to applications (`documentId` already models this link).
3. `hunt backup`; docs (README, adapter-authoring guide, data-format doc); packaging → **v0.1**.

**Standing maintainer actions:** real-posting validation sweep (M2 exit); live AI fixture recording + behavioral eval for the four AI tasks (extract-job, job-insights, draft-resume, draft-cover-letter) — all need a real provider key.

---

## Technical Debt

| Item | Reason | Recommendation |
|------|--------|----------------|
| CLI version string duplicated in `run.ts` | Carried from M0 | M5 packaging |
| `hunt profile show` output minimal | Carried from M1 | M5 CLI polish |
| AI quality unvalidated against real models | Carried from M2; prompt locks now force versioning discipline, but behavioral eval needs live calls | Record fixtures + run eval when a key is available |
| Skill dictionary is deliberately small (~55 entries) | Quality investment is data-only and incremental | Grow it from real usage; every unknown-but-relevant skill in a posting is a dictionary PR |
| Requirement `span` offsets (SDD §11) not populated | AI offsets are unreliable; JSON-LD/DOM tiers don't isolate requirement sentences | Revisit if the audit UI (post-V1) needs highlighting |
| No `hunt jobs list/show` | M5 scope | With tracking CLI |
| Automated PDF rendering not shipped | Headless-browser dependency deferred (ADR-0014) | User prints HTML→PDF; add a PDF adapter behind `RenderPort` when it earns its keep |
| Generated documents not yet attachable to an application | Application tracking is M5; `documentId`/`applicationId` links already modeled | Wire in M5 with `hunt track` |
| Lexical claim check is conservative (numbers + dictionary skills) | Deliberate (SDD §17) — mandatory human review covers the rest | Grow the rule set only if real usage surfaces a dangerous miss |

---

## Risks

- Fit-score calibration is untested against real outcomes — by design it waits for §19 analytics (fit-vs-outcome). Until then scores are comparative, not absolute; the CLI shows the breakdown to keep them interpretable.
- The example profile scoring 28/100 against the Go/Kubernetes fixture is *correct* behavior (real gap) — worth remembering when users report "low scores" as bugs.
- Generation quality against real models is unvalidated offline (as with M2/M3 AI tasks); prompt locks enforce versioning discipline, but the composer's grounding behavior needs live fixtures + the eval set (maintainer action). The *structural* grounding guarantee (claim tracing, mandatory review) holds regardless of model quality — that is the point of §17.

---

## Blockers

None. Reminder: `git init` + commits remain a maintainer action.
