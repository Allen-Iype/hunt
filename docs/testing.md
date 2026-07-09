# Testing Guide

Test strategy follows SDD §20. This document tracks what exists now and the conventions to follow.

## Running tests

```sh
pnpm test          # all packages (vitest, from repo root)
pnpm lint          # includes the core dependency-rule check
pnpm build         # tsc across packages
```

## Layers (SDD §20)

| Layer | Status | Location / convention |
|-------|--------|-----------------------|
| Core unit tests (schemas, pure logic, state machines) | ✅ active | co-located `*.test.ts` next to sources in `packages/core/src` |
| CLI unit + integration tests (`run()` against real storage in a temp `HUNT_HOME`) | ✅ active | `packages/cli/src/run.test.ts` |
| Storage tests: repositories, migration/backup path, vault | ✅ active | `packages/storage/src/**/*.test.ts`; temp-dir SQLite per test; shared fixtures in `src/testing/` (excluded from build). With a single implementation per port these double as the contract suite; they become shared suites when a second implementation appears |
| Capability tests (fake repositories; staged error assertions) | ✅ active | `packages/capabilities/src/*.test.ts` |
| Adapter fixture tests (committed pages: JSON-LD shapes, DOM-only, auth wall, plain text) | ✅ active | `packages/ingestion/src/testing/fixtures/`; a broken source is fixed by adding a new fixture + updating the normalizer |
| AI gateway tests (validation, repair retry, cache, replay-miss) + provider wire-format tests (stubbed fetch) | ✅ active | `packages/ai/src/*.test.ts`; CI never calls a real provider |
| Generation pipeline (deterministic): fact selection, claim tracing (invented-fact / inflated-metric / unsupported-skill rejection), the bounded repair loop, the approval gate | ✅ active | `packages/core/src/generation/*.test.ts`; `packages/capabilities/src/{generate-resume,approve-document}.test.ts` — grounding is enforced with no AI in the loop |
| Render tests (HTML structure, embedded print CSS, HTML-escaping of untrusted document text) | ✅ active | `packages/render/src/html.test.ts` |
| AI record/replay | ✅ infra active | the response cache *is* the replay store (decisions #11); live-recorded fixtures + behavioral eval set pending a real API key |
| Prompt locks (prompt edits require task-version bumps) | ✅ active | `packages/ai/src/tasks/prompt-locks.test.ts` + committed `prompt-locks.json` (decisions #13) |
| Full-AI-path E2E (real gateway + Ollama adapter against a local fake HTTP server) | ✅ active | `packages/cli/src/run.test.ts` — covers both import (extract-job) and generation (draft-resume/draft-cover-letter); the fake provider grounds its draft in a candidate fact id parsed from the prompt, exercising the real claim-trace + repair path |
| E2E smoke (full V1 flow via CLI) | ✅ active | the complete loop — import → analyze → resume → approve → track → attach → show — runs in one test (`packages/cli/src/run.test.ts`); this is the SDD §26 "one test that proves the product works" |
| Tracking + backup (deterministic, no AI) | ✅ active | `packages/cli/src/run.test.ts` (track/list/show/backup, invalid-transition rejection) and `packages/capabilities/src/{track-application,query-applications}.test.ts`; `packages/storage/src/backup.test.ts` |
| **No-AI suite** (non-AI surface with no provider configured) | ✅ active | structured/DOM import succeed with no provider; AI-needing paths fail fast with config guidance — must always stay green (SDD Principle 2) |

## Conventions

- Tests are deterministic: no network, no real LLM calls, no reliance on wall-clock time. Timestamps in fixtures are literals.
- Schema tests assert both acceptance (valid fixture round-trips) and rejection (invalid input fails **at the expected path**), so error reporting stays useful.
- Bug fixes ship with a regression test that fails on the pre-fix code.
- Zod is v4: `z.iso.datetime()`, `z.iso.date()`, `z.email()`, `z.url()` — not the v3 string-method forms.
