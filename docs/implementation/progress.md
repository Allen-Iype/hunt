# Hunt Progress

## Overall Progress

| Milestone | Status |
|-----------|--------|
| M0 — Skeleton | ✅ |
| M1 — Models & storage | ✅ |
| M2 — Ingestion | ✅ |
| M3 — Analysis | ⬜ |
| M4 — Generation | ⬜ |
| M5 — Tracking & release | ⬜ |

---

## Current Milestone

**M2 — Ingestion** · Status: **complete, awaiting approval** · Completion: 100%

Objective: envelope pipeline, paste + LinkedIn adapters, tiered normalization with the first AI-gateway use, dedup, fixtures.

---

## Completed Work

| Date | Work | Notes |
|------|------|-------|
| 2026-07-03 | M0: scaffold, dependency rule, draft schemas, CI, docs, ADRs 0001–0010 | |
| 2026-07-05 | M1: finalized models, state machine, SQLite storage, vault, profile import, ADR-0011 | |
| 2026-07-07 | Core: RawEnvelope model, ExtractedJobDraft schema (extraction contract), dedup fingerprint, ports: EnvelopeRepository, ExtractJobPort (ADR-0013), JobIngestor | |
| 2026-07-07 | `@hunt/ai`: gateway (schema validation, bounded repair retry, content-keyed cache, replay mode), Anthropic + Ollama providers via raw HTTP (ADR-0012), extract-job task | Cache doubles as record/replay store (decisions #11) |
| 2026-07-07 | `@hunt/ingestion`: two-phase pipeline (envelope persisted before normalization), JSON-LD tier (incl. @graph, TELECOMMUTE, salary, dates), LinkedIn adapter (auth-wall detection + DOM tier), paste + generic-URL adapters, static registry, deterministic canonical assembly (job id from dedup hash) | |
| 2026-07-07 | Storage migration 2: `raw_envelopes` + repository | First real use of the migration/backup path |
| 2026-07-07 | `ImportJob` capability: ingest → dedup (re-import updates provenance) → company resolution (clears M1 debt) → persist | |
| 2026-07-07 | CLI: `hunt import <url> | --file | -` (async runner), env-var AI config (decisions #10) | |
| 2026-07-07 | Tests 95 → 153: gateway behaviors, provider wire formats (stubbed fetch), fixture pages ×6, pipeline tiers, dedup, no-AI paths, full AI path through a real local HTTP server posing as Ollama | |

---

## Current Focus

Nothing in flight — M2 delivered, stopped per milestone workflow.

---

## Next Steps

On approval, begin **M3 — Analysis**:
1. Skill dictionary (versioned data file) + deterministic profile↔job matching.
2. `JobAnalysis` model + storage.
3. AI requirement-classification task (second domain-shaped port), merge with per-field provenance.
4. Deterministic fit scoring (ADR-0007).
5. `hunt analyze <job-id>`; lock eval fixtures for prompt changes.

**Maintainer actions requested for the M2 exit criterion "10 real postings from 3+ sites":** run `hunt import` against real postings (paste + URLs) and file any normalizer gaps; with a real `ANTHROPIC_API_KEY`, run a few plain-text imports so live responses populate `~/.hunt/cache/ai` and can be promoted to committed replay fixtures.

---

## Technical Debt

| Item | Reason | Recommendation |
|------|--------|----------------|
| CLI version string duplicated in `run.ts` | Carried from M0 | Resolve during M5 packaging |
| `hunt profile show` output minimal | Carried from M1 | M5 CLI polish |
| AI extraction quality unvalidated against real models (fixtures are hand-authored) | No API key/network in the dev loop; record/replay infra is ready | Record live fixtures + start the eval set when M3 touches prompts |
| LinkedIn DOM selectors pinned to current public markup | Inherent source brittleness (SDD §23) | Fixture tests make breakage loud; fix = new fixture + selector update |
| No `hunt jobs list/show` yet — import report is the only view | M5 scope | Arrives with tracking CLI |

---

## Risks

- LinkedIn may block unauthenticated fetches entirely in some regions — mitigated by auth-wall detection with an explicit paste hint (verified in tests).
- Prompt-injection surface opens with M2 (untrusted posting text reaches the LLM): mitigations per SDD §21 are structural — extraction output is schema-bound, system fields are never extractor-controlled (tested), AI has no tools/storage access.

---

## Blockers

None. Reminder: `git init` + commits remain a maintainer action.
