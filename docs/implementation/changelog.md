# Changelog

All notable changes, grouped by milestone.

## M5 — Tracking & release (2026-07-09) → v0.1

### Added
- **Capabilities**: `TrackApplication` — the single write path for the application lifecycle (auto-creates the application on first track, one per job; transition / note / attach-document / add-contact), all state-machine and event-log integrity enforced by the M1 repository; `QueryApplications` — read helpers for `hunt list` (jobs with fit score + tracking status, filterable) and `hunt show` (a job's analysis, documents, and full application timeline; resolves a job id or an application id).
- **Storage**: `backup(destDir)` on `HuntStorage` — a consistent `VACUUM INTO` database snapshot plus the raw vault and rendered documents, guarded by a `PRAGMA integrity_check` and a refuse-to-overwrite check (SDD §14, §23).
- **CLI**: `hunt track <job-id>` (`--status` / `--note` / `--attach` / `--contact`), `hunt list [--status <s>]`, `hunt show <job-id|app-id>`, `hunt backup [<dir>]`. Usage text lists the full lifecycle. `--attach` verifies the document exists first.
- **Docs**: `docs/user-guide.md` (complete workflow + command reference + grounding + troubleshooting), `docs/data-format.md` (`~/.hunt` layout, SQLite schema, profile.yaml reference), `docs/adapter-authoring.md` (adding a job source); README updated to link them and show the tracking commands.
- Full V1-loop E2E: import → analyze → resume → approve → track → attach → show in one test (SDD §26 "one test that proves the product works"). Tests 243 → 263.

### Changed
- `CLI_VERSION` now reads from the package manifest instead of a hardcoded string (clears M0 technical debt); version bumped to **0.1.0**.
- `HuntStorage` exposes `backup`; the composition root wires `TrackApplication` and `QueryApplications`.

### Fixed
- Nothing (no reported bugs).

### Deferred
- Distribution / bundling for `npm i -g` or a single binary — packages are `private` with `workspace:*` deps; a real install path needs a bundler (maintainer action, decisions #20).
- FTS surfacing, analytics dashboards, and `ghosted` staleness auto-suggestion remain post-V1 (SDD §26).

### Breaking Changes
- None.

## M4 — Generation (2026-07-07)

### Added
- **Core**: `ResumeDocument` / `CoverLetterDocument` canonical models — structured content whose every bullet carries `sourceFactIds` (min 1), immutable `draft`→`approved` status, and a `generationMeta` reproducibility record (model, task version, candidate fact IDs, repair rounds); `CandidateFact` (the flattened, ID'd view of a profile fact the composer may cite); AI draft schemas (`ResumeDraft`/`CoverLetterDraft` — grounding is schema-required, system fields impossible to emit); `selectCandidateFacts` — deterministic relevance ranking (skill overlap · recency · kind weight, SDD §17 step 1); `traceClaims` — deterministic claim tracing (fact-ID validity + conservative lexical check on numbers/dictionary-skills + format lint) with a repair-feedback formatter; ports `ComposeResumePort`, `ComposeCoverLetterPort` (domain-shaped, ADR-0013), `RenderPort`, `DocumentRepository`.
- **`@hunt/ai`**: `draft-resume` and `draft-cover-letter` tasks — composition constrained to the provided candidate fact IDs, with explicit anti-fabrication instructions; prompt locks extended to all four tasks.
- **`@hunt/render`** (new package): implements `RenderPort` → self-contained HTML with embedded print CSS; all document text HTML-escaped (SDD §21); depends only on `@hunt/core`. Automated PDF deferred behind the port (ADR-0014).
- **Storage**: migration 4 (`documents`) + repository (upsert by id; latest-per-job-and-kind).
- **Capabilities**: `GenerateResume` / `GenerateCoverLetter` — select → compose → claim-trace → **bounded 2-round repair loop** → render → persist as a `draft` returning `needsReview` (never sendable without review); `ApproveDocument` — the one-way human-review gate, immutable thereafter; shared `composeGroundedDraft` loop.
- **CLI**: `hunt resume <job-id>` / `hunt letter <job-id>` — generate, write rendered HTML into `documents/<company>-<role>-<date>/`, print a fact-grounding summary and the review/approve next step; `hunt approve <doc-id>` — mark a reviewed document sendable. Render port + composers wired in the composition root.
- Tests 198 → 243, including a full generation E2E through the real gateway and a fake Ollama that grounds its draft in a candidate fact id parsed from the prompt (clean path and the repair-loop path), plus HTML injection-escaping and the immutability/approval invariants.

### Changed
- `AiSetup` now also produces the two composer ports; `HuntStorage` exposes `documents`; the CLI usage text documents the generation and approval commands.

### Fixed
- Nothing (no reported bugs).

### Deferred
- Automated PDF rendering (ADR-0014) — HTML + browser print covers V1.
- Attaching approved documents to a tracked application — the model link exists; wiring lands with `hunt track` in M5.
- Behavioral eval of the two composer tasks against live models (maintainer action; prompt locks cover the offline invariant).

### Breaking Changes
- None.

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
