# Hunt Progress

## Overall Progress

| Milestone | Status |
|-----------|--------|
| M0 — Skeleton | ✅ |
| M1 — Models & storage | ⬜ |
| M2 — Ingestion | ⬜ |
| M3 — Analysis | ⬜ |
| M4 — Generation | ⬜ |
| M5 — Tracking & release | ⬜ |

---

## Current Milestone

**M0 — Skeleton** · Status: **complete, awaiting approval** · Completion: 100%

Objective: monorepo scaffold, lint-enforced dependency rule, CI, drafted core schemas, documentation system, `hunt --version`.

---

## Completed Work

| Date | Work | Notes |
|------|------|-------|
| 2026-07-03 | SDD authored and approved | `docs/architecture/software-design.md` |
| 2026-07-03 | pnpm/TypeScript monorepo scaffold (`@hunt/core`, `@hunt/cli`) | Other SDD packages deferred to their milestones (see decisions.md #1) |
| 2026-07-03 | Dependency-rule ESLint guardrail for `core` | Blocks `@hunt/*` and I/O builtins; violation-fires verified |
| 2026-07-03 | Draft canonical schemas: Job, Profile (fact-based), Application (+ events), common (provenance, timestamps) | Zod v4; drafts to be finalized in M1 |
| 2026-07-03 | CLI skeleton: `hunt --version`, `--help`, unknown-command handling | No arg-parsing dependency (YAGNI) |
| 2026-07-03 | Test suite: 24 tests (schema validation + CLI) | All green |
| 2026-07-03 | GitHub Actions CI: lint, build, test, CLI smoke test | Runs on push/PR |
| 2026-07-03 | Documentation tree + 10 ADRs seeded from SDD appendix | |

---

## Current Focus

Nothing in flight — M0 delivered, stopped per milestone workflow.

---

## Next Steps

On approval, begin **M1 — Models & storage**:
1. Finalize V1 canonical model shapes (promote M0 drafts; add Company, tighten event payload schemas).
2. Application state machine with transition validation in `core`.
3. `@hunt/storage`: SQLite repositories, migrations, file vault.
4. `profile.yaml` import path.

---

## Technical Debt

| Item | Reason | Recommendation |
|------|--------|----------------|
| `ApplicationEvent.data` is a loose `record(string, unknown)` | Per-kind payload schemas belong with the M1 state machine; typing them now would be speculative | Tighten to per-kind discriminated schemas in M1 |
| CLI version string duplicated in `run.ts` (not read from package.json) | Reading package.json at runtime needs path resolution that differs pre/post build; not worth it for M0 | Revisit when CLI gains a build step for release packaging (M5) |
| Core dependency rule enforced for `@hunt/*` imports and I/O builtins only | Third-party SDK imports can't be pattern-banned generically | Keep `core` dependencies reviewed manually (currently: zod only); consider dependency-cruiser if the rule ever proves insufficient |

---

## Risks

- Zod v4 API is newer than most training data/examples floating around; contributors may write v3 idioms. Mitigated by tests and CI.
- LinkedIn ingestion risk (SDD §23) unchanged; becomes live in M2.

---

## Blockers

None. The repository is not yet a git repository — the maintainer should run `git init` and make the initial commit (Hunt tooling never runs git state-changing commands).
