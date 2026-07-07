# Changelog

All notable changes, grouped by milestone.

## M3 — Analysis (2026-07-07)

### Added
- **Core**: skill dictionary v1 (~55 canonical skills with aliases and categories; versioned pure data) with token-based detection (whole-token matching — "go" never matches "google"; C++/C#/node.js handled) and two-sided canonical profile↔job matching; `parseCompensation` (ranges, k-suffix, symbols/codes, periods); `computeFitScore` — weighted components renormalized over what's computable (ADR-0007), `deriveCandidateSeniority` from experience span (decisions #14); `JobAnalysis` model with per-field provenance (`deterministic|import|ai`) and per-requirement coverage fractions; `JobInsights` contract; ports `JobInsightsPort`, `JobAnalysisRepository`.
- **`@hunt/ai`**: `job-insights` task v1 (requirement classification, seniority inference, red flags, gap narrative grounded in provided match results; fit score deliberately absent from the schema); **prompt locks** — SHA-256 of every task's instructions committed and test-enforced, so prompt edits force version bumps (decisions #13).
- **Storage**: migration 3 (`job_analyses`) + repository (upsert by deterministic id; latest-per-job).
- **Capabilities**: `AnalyzeJob` — deterministic pass → optional AI pass → merge (deterministic/import wins conflicts) → deterministic score → persist. Fully functional with no AI configured.
- **CLI**: `hunt analyze <job-id>` with score breakdown, matched/missing skills, per-requirement coverage, provenance markers, and an explicit note when running deterministic-only.
- Tests 153 → 198.

### Changed
- Nothing outside additive wiring (container, storage interface).

### Fixed
- `parseCompensation` treated "401k" as a salary figure — caught by tests during this milestone, fixed with a noise guard.

### Deferred
- Behavioral eval set against live models (maintainer action; prompt locks cover the offline invariant).
- Requirement source-span offsets (SDD §11) — no consumer yet.

### Breaking Changes
- None.

## M2 — Ingestion (2026-07-07)

### Added
- **Core**: `RawEnvelope` model; `ExtractedJobDraft` (the extraction contract — system fields structurally impossible to extract); `jobDedupFingerprint`; ports: `EnvelopeRepository`, `ExtractJobPort` (domain-shaped AI port, ADR-0013), `JobIngestor`.
- **`@hunt/ai`** (new package): gateway with named/versioned tasks, JSON-Schema-constrained prompting, bounded repair retry, content-keyed response cache with replay mode (decisions #11); Anthropic and Ollama providers as raw-HTTP adapters (ADR-0012); `extract-job` task v1.
- **`@hunt/ingestion`** (new package): two-phase pipeline — verbatim payload into the vault *before* normalization (ADR-0004); tiered normalization: schema.org JobPosting JSON-LD (incl. `@graph`, TELECOMMUTE, salary, date normalization) → source DOM selectors → AI fallback; LinkedIn adapter (URL matching, auth-wall detection with paste hint, DOM tier), paste adapter, generic-URL fallback adapter (decisions #12); static registry (Tier 0); deterministic assembly (job id derived from dedup hash).
- **Storage**: migration 2 (`raw_envelopes`) + envelope repository.
- **Capabilities**: `ImportJob` — ingest → dedup (re-import updates provenance, SDD §9) → company resolution via normalized key (clears M1 debt) → persist.
- **CLI**: `hunt import <url>`, `hunt import --file <path>`, `hunt import -`; AI provider config via env vars (decisions #10); async command runner.
- Fixture suite: six committed pages/postings (Greenhouse/Lever/LinkedIn shapes, auth wall, DOM-only, plain text); tests 95 → 153 including a full AI-path E2E against a local HTTP server posing as Ollama.

### Changed
- `run()` is now async; `hunt` bin awaits it.
- `HuntStorage` exposes `envelopes`.

### Fixed
- Nothing (no reported bugs).

### Deferred
- `config.toml` until per-task model routing creates real config surface (decisions #10).
- Live-recorded AI fixtures + eval set (needs a real API key; record/replay infra is in place).
- Compensation range *parsing* (raw string is captured; deterministic parsing lands with analysis/analytics needs).

### Breaking Changes
- None.

## M1 — Models & storage (2026-07-05)

### Added
- **Core**: Company model with deterministic `normalizeCompanyKey`; application state machine (full transition table, terminal/revivable semantics) with `validateTransition`; per-kind typed `ApplicationEvent` payloads (discriminated union: status_changed, note_added, document_attached, contact_added); `ProfileInputSchema` + `resolveProfileInput` with deterministic content-derived fact IDs (ADR-0011) and evidence-reference integrity checking; repository and vault **ports** (`ProfileRepository`, `CompanyRepository`, `JobRepository`, `ApplicationRepository`, `RawVault`); dependency-free `fnv1a`.
- **`@hunt/storage`** (new package): SQLite via better-sqlite3 (WAL, foreign keys, busy timeout); forward-only migration runner with automatic pre-migration backup (`VACUUM INTO`) and refusal to open newer-versioned databases; four repositories (reads re-validated against canonical schemas); transactional event append with seq assignment, atomic status materialization, and state-machine enforcement (`InvalidEventError`); content-addressed file vault (`vault/raw/<hh>/<sha256>`).
- **`@hunt/capabilities`** (new package): `ImportProfile` (staged typed errors: parse → validate → resolve → storage), `GetProfile`.
- **CLI**: composition root (`createContainer`, `resolveHuntHome` with `HUNT_HOME` override); `hunt profile import <path>` and `hunt profile show`.
- `examples/profile.example.yaml` — documented starting point for user profiles.
- Vitest workspace aliases so tests run against package sources without a prior build.
- Tests: 24 → 95 (state-machine invariants incl. reachability; migration/backup; vault; repository behavior incl. FK and uniqueness enforcement; capability stages; CLI integration against real storage in temp `HUNT_HOME`).

### Changed
- `ApplicationEvent.data` tightened from `record(string, unknown)` to per-kind schemas (was logged as M0 technical debt).
- `openDatabase` accepts an injectable migrations list (default: real migrations) for upgrade-path testing.

### Fixed
- Nothing (no reported bugs).

### Deferred
- `JobAnalysis` model → M3; document models → M4 (finalized with their consumers).
- `profile_facts` and `raw_envelopes` tables (decisions log #4, #6).
- `config.toml` → M2 (first real configuration: AI providers).

### Breaking Changes
- None (pre-release; no data migrations shipped to users).

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
