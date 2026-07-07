# Hunt Progress

## Overall Progress

| Milestone | Status |
|-----------|--------|
| M0 — Skeleton | ✅ |
| M1 — Models & storage | ✅ |
| M2 — Ingestion | ✅ |
| M3 — Analysis | ✅ |
| M4 — Generation | ⬜ |
| M5 — Tracking & release | ⬜ |

---

## Current Milestone

**M3 — Analysis** · Status: **complete, awaiting approval** · Completion: 100%

Objective: skill dictionary, deterministic matching, AI requirement classification, merge with provenance, deterministic fit scoring, `hunt analyze`.

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

---

## Current Focus

Nothing in flight — M3 delivered, stopped per milestone workflow.

---

## Next Steps

On approval, begin **M4 — Generation** (the signature milestone, SDD §17):
1. `ResumeDocument`/`CoverLetterDocument` models with fact-ID-cited bullets.
2. Deterministic fact selection (relevance ranking vs analysis).
3. AI composition task constrained to candidate fact IDs.
4. Claim tracing: ID validity + conservative lexical checks + bounded repair loop.
5. HTML render with print CSS; review flow; `hunt resume` / `hunt letter`.

**Standing maintainer actions:** real-posting validation sweep (M2 exit) and live AI fixture recording + behavioral eval, both need a real provider key.

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

---

## Risks

- Fit-score calibration is untested against real outcomes — by design it waits for §19 analytics (fit-vs-outcome). Until then scores are comparative, not absolute; the CLI shows the breakdown to keep them interpretable.
- The example profile scoring 28/100 against the Go/Kubernetes fixture is *correct* behavior (real gap) — worth remembering when users report "low scores" as bugs.

---

## Blockers

None. Reminder: `git init` + commits remain a maintainer action.
