# Changelog

All notable changes, grouped by milestone.

## M0 — Skeleton (2026-07-03)

### Added
- pnpm/TypeScript monorepo (`packages/core`, `packages/cli`) with strict shared `tsconfig.base.json`.
- `@hunt/core`: draft canonical schemas (Zod v4) for Job, Profile (atomic ID'd facts with `verified` flags), Application + append-only ApplicationEvent, and shared blocks (Id, Timestamp, Provenance with extraction tier, schema version).
- `@hunt/cli`: `hunt --version`, `--help`, unknown-command handling; pure `run()` for testability.
- ESLint dependency-rule guardrail: `packages/core` cannot import other `@hunt/*` packages or I/O-capable Node builtins.
- Test suite: 24 tests (schema fixtures valid/invalid, CLI behavior).
- GitHub Actions CI: lint → build → test → CLI smoke test.
- Documentation tree: SDD relocated to `docs/architecture/software-design.md`, 10 ADRs, roadmap, progress, decisions, changelog, known-issues, contributing, testing guides, README.

### Changed
- Nothing (first milestone).

### Fixed
- Nothing (first milestone).

### Deferred
- Packages `capabilities`, `storage`, `ai`, `ingestion`, `render` → created in the milestones that need them (decisions.md #1).
- Per-kind `ApplicationEvent.data` schemas → M1 (with the state machine).
- Company model → M1.

### Breaking Changes
- None.
