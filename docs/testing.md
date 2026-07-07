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
| AI record/replay | ✅ infra active | the response cache *is* the replay store (decisions #11); live-recorded fixtures + eval set pending a real API key |
| Full-AI-path E2E (real gateway + Ollama adapter against a local fake HTTP server) | ✅ active | `packages/cli/src/run.test.ts` |
| E2E smoke (full V1 flow via CLI) | ⬜ grows with each milestone; complete flow mandatory before v0.1 | import legs active; analyze/generate/track legs arrive M3–M5 |
| **No-AI suite** (non-AI surface with no provider configured) | ✅ active | structured/DOM import succeed with no provider; AI-needing paths fail fast with config guidance — must always stay green (SDD Principle 2) |

## Conventions

- Tests are deterministic: no network, no real LLM calls, no reliance on wall-clock time. Timestamps in fixtures are literals.
- Schema tests assert both acceptance (valid fixture round-trips) and rejection (invalid input fails **at the expected path**), so error reporting stays useful.
- Bug fixes ship with a regression test that fails on the pre-fix code.
- Zod is v4: `z.iso.datetime()`, `z.iso.date()`, `z.email()`, `z.url()` — not the v3 string-method forms.
