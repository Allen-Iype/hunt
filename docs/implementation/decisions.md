# Implementation Decision Log

Deviations from, or refinements of, the SDD made during implementation. Architectural decisions get ADRs; this log records implementation-level judgment calls.

---

## 1. Create packages only when their milestone needs them

- **Date**: 2026-07-03
- **Decision**: M0 creates only `@hunt/core` and `@hunt/cli`. The remaining SDD §6 packages (`capabilities`, `storage`, `ai`, `ingestion`, `render`) are created in the milestones that first need them (storage → M1; ai/ingestion → M2; capabilities → M2; render → M4).
- **Reason**: YAGNI (engineering principle 10). Empty stub packages document nothing the SDD doesn't already document, and would need speculative interfaces.
- **Alternatives considered**: scaffolding all seven packages empty (rejected: dead weight, invites premature interfaces).
- **Impact**: none on architecture; the SDD layout is reached incrementally.
- **Affected SDD section**: §6 (package layout) — sequencing only, not structure.

## 2. `ExtractionTier` includes `"user"`

- **Date**: 2026-07-03
- **Decision**: The provenance extraction-tier enum is `structured | dom | ai | user`, adding `user` to the SDD §9 tiers.
- **Reason**: pasted/manually-entered data needs honest provenance; "user" is not an extraction pipeline but is a real origin, and modeling it now avoids a migration in M2.
- **Alternatives considered**: separate `origin` field alongside tier (rejected: two fields describing one fact).
- **Impact**: none; §9's tiered normalization is unaffected.
- **Affected SDD section**: §9, §11 (provenance).

## 3. `@hunt/capabilities` created in M1, not M2

- **Date**: 2026-07-05
- **Decision**: The capabilities package arrives with M1 (revising the prediction in decision #1) because profile import is a capability per SDD §13, and putting it anywhere else (CLI, storage) would violate layer responsibilities.
- **Impact**: none; earlier than predicted, exactly where the SDD says it belongs.
- **Affected SDD section**: §6, §7.

## 4. `profile_facts` table deferred; profile stored as a single row

- **Date**: 2026-07-05
- **Decision**: SDD §12 sketches a `profile_facts` table. M1 stores the whole profile as one row (full model in the JSON column). Facts remain individually addressable by ID within the parsed model.
- **Reason**: a profile is small enough to always load whole; fact-level rows have no consumer until M4 claim tracing, which also works fine against the in-memory model. YAGNI.
- **Alternatives considered**: implementing the table now (dead weight + duplicate write path to keep consistent).
- **Impact**: if fact-level SQL querying is ever needed, adding the table is a forward-only migration plus a projection at save time.
- **Affected SDD section**: §12.

## 5. `jobs.status` column omitted

- **Date**: 2026-07-05
- **Decision**: SDD §12's sketch lists a `status` column on `jobs`, but the canonical Job model (§11) defines no such field — lifecycle status belongs to Applications. Column omitted until a Job-level status (e.g. posting open/expired) is added to the canonical model deliberately.
- **Impact**: none; schema follows the model, not the sketch.
- **Affected SDD section**: §11, §12.

## 6. `raw_envelopes` table deferred to M2; vault is file-only in M1

- **Date**: 2026-07-05
- **Decision**: M1 ships the content-addressed file vault (an SDD M1 deliverable); the envelope *index table* ships with M2 ingestion, when the envelope shape is finalized by its actual consumer.
- **Impact**: avoids guessing columns that M2 would immediately migrate.
- **Affected SDD section**: §8, §12.

## 7. Capabilities take content, not file paths

- **Date**: 2026-07-05
- **Decision**: `ImportProfile` accepts YAML *text*; reading the user-supplied file is the presentation layer's job.
- **Reason**: keeps the capability free of filesystem concerns (testable with plain strings) and consistent with SDD §7 (capabilities are non-interactive orchestrations over ports).
- **Affected SDD section**: §7, §13.

## 8. Storage ports are synchronous

- **Date**: 2026-07-05
- **Decision**: Repository/vault port methods are synchronous, matching better-sqlite3 and the single-user CLI reality.
- **Reason**: async signatures today would be ceremony for a backend that doesn't exist; widening sync → async later is mechanical and contained at the port boundary.
- **Affected SDD section**: §14 (repository discipline).

## 9. `Job.requirements` stays empty at structured/DOM tiers

- **Date**: 2026-07-07
- **Decision**: JSON-LD and DOM extraction populate identity fields and description only; `requirements[]` is filled by the AI tier when used, otherwise left empty for M3's AnalyzeJob to extract into the JobAnalysis.
- **Reason**: requirements live in prose; extracting them deterministically from arbitrary description text isn't possible, and pretending otherwise would produce junk. Honest empty beats fabricated structure (Principle 5/6).
- **Affected SDD section**: §9, §11, §18.

## 10. AI configuration via environment variables; config.toml deferred

- **Date**: 2026-07-07
- **Decision**: Provider selection via `ANTHROPIC_API_KEY` / `HUNT_AI_PROVIDER` / `HUNT_AI_MODEL` / `HUNT_OLLAMA_URL`. No config file yet.
- **Reason**: three settings don't justify a config file format plus a TOML dependency (YAGNI). SDD §12's config.toml arrives when per-task model routing (SDD §15) creates real config surface — likely M3/M4.
- **Alternatives considered**: config.toml now (dependency + format churn before the schema is known); JSON config (worse ergonomics for hand-editing).
- **Impact**: env-var names become a small compatibility surface to honor when config.toml lands.
- **Affected SDD section**: §12, §15.

## 11. Response cache and test replay are one mechanism

- **Date**: 2026-07-07
- **Decision**: The gateway's content-keyed response cache (SDD §15) doubles as the record/replay store (SDD §20): "record" is a live run with a cache, "replay" is a gateway mode where a cache miss errors instead of calling the provider.
- **Reason**: identical key structure and semantics; two mechanisms would drift.
- **Affected SDD section**: §15, §20.

## 12. Generic-URL fallback adapter included in M2

- **Date**: 2026-07-07
- **Decision**: Alongside the planned LinkedIn and paste adapters, a `generic-url` adapter claims any http(s) URL and relies on the shared JSON-LD/AI tiers (no DOM tier).
- **Reason**: it is ~15 lines reusing the entire pipeline, and it makes the M2 exit criterion (multiple sites) real for URL input, not just paste. Scope addition consciously logged rather than silently slipped in.
- **Alternatives considered**: LinkedIn-only URL support (rejects Greenhouse/Lever URLs users will paste on day one for no technical reason).
- **Affected SDD section**: §9, §26.
