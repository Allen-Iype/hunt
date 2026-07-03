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
| CLI unit tests (pure `run()` function) | ✅ active | `packages/cli/src/run.test.ts` |
| Port contract tests (shared suite every adapter must pass) | ⬜ arrives with first port implementations (M1 storage) | one reusable suite per port, exported from the package that defines the port's tests |
| Adapter fixture tests (recorded envelopes) | ⬜ M2 | fixtures committed under the adapter's package |
| AI record/replay + eval set | ⬜ M2 (with the AI gateway) | gateway recording mode; CI always replays, never calls providers |
| Capability integration tests (temp-dir SQLite + replay gateway) | ⬜ M2+ | |
| E2E smoke (full V1 flow via CLI, fake provider) | ⬜ M2+, mandatory before v0.1 | |
| **No-AI suite** (entire non-AI surface with no provider configured) | ⬜ meaningful from M2 | must always stay green (SDD Principle 2) |

## Conventions

- Tests are deterministic: no network, no real LLM calls, no reliance on wall-clock time. Timestamps in fixtures are literals.
- Schema tests assert both acceptance (valid fixture round-trips) and rejection (invalid input fails **at the expected path**), so error reporting stays useful.
- Bug fixes ship with a regression test that fails on the pre-fix code.
- Zod is v4: `z.iso.datetime()`, `z.iso.date()`, `z.email()`, `z.url()` — not the v3 string-method forms.
