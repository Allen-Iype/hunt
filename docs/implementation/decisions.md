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

## 13. Prompt locks as the offline form of "eval fixtures locked"

- **Date**: 2026-07-07
- **Decision**: Every AI task's instructions are SHA-256-locked in `packages/ai/src/tasks/prompt-locks.json`; a test fails when a prompt changes without a task-version bump. The *behavioral* eval set (real inputs → expected outputs against a live model) remains a maintainer action requiring an API key.
- **Reason**: CI is offline by design (SDD §20); the enforceable invariant offline is "prompt changes are versioned and deliberate", which is what flows into artifact provenance. Behavioral regression needs live calls.
- **Impact**: prompt edits force a conscious version bump → cache keys change → stale cached responses can't masquerade as the new prompt's output.
- **Affected SDD section**: §15, §20.

## 14. Candidate seniority derived from experience span

- **Date**: 2026-07-07
- **Decision**: The scoring input "candidate seniority" is derived deterministically from the profile's total experience span (<2y junior, <5 mid, <9 senior, <13 staff, else principal); management-track job levels score neutral.
- **Reason**: the SDD's scoring function (§18 D) needs a candidate level, but Profile intentionally has no self-declared seniority field (facts, not self-assessment). Years-of-experience is crude but deterministic, explainable, and stable.
- **Alternatives considered**: a self-declared profile field (invites inflation, another thing to maintain); AI inference (violates ADR-0007's determinism for score inputs that code can compute).
- **Impact**: revisit if calibration analytics (§19) show the neutral/management handling skews scores.
- **Affected SDD section**: §11, §18.

## 15. Render is HTML + print CSS only; PDF deferred behind the port (M4)

- **Date**: 2026-07-07
- **Decision**: `@hunt/render` produces self-contained HTML with print CSS; automated PDF is out of V1. See **ADR-0014** for the architectural rationale.
- **Reason**: avoids a heavy headless-browser dependency the SDD itself defers (§23); the port makes automated PDF a contained, additive change later.
- **Impact**: the user prints to PDF from the browser; the `RenderPort` shape is unchanged when a PDF adapter arrives.
- **Affected SDD section**: §17, §21, §23.

## 16. Claim tracing runs on the AI draft before persistence, not on the stored document

- **Date**: 2026-07-07
- **Decision**: The claim tracer (`traceClaims`) validates the composer's *draft* (bullets + cited ids) against the candidate set inside the generation capability's repair loop. Only a draft that passes becomes a persisted `ResumeDocument`/`CoverLetterDocument`. The canonical document schema still requires `sourceFactIds` (min 1) so grounding is also a property of stored data.
- **Reason**: violations must be caught *before* anything sendable exists, and the repair loop needs to feed them back to the composer (SDD §17). Tracing the stored document instead would let an ungrounded artifact exist transiently.
- **Alternatives considered**: trace after persisting then delete on failure (an ungrounded document briefly exists — wrong for a trust-fatal invariant).
- **Affected SDD section**: §11, §17.

## 17. Conservative lexical claim check: numbers and dictionary skills only

- **Date**: 2026-07-07
- **Decision**: The lexical half of claim tracing checks two things beyond fact-id validity: (a) significant numbers in a bullet (metrics/percentages/magnitudes, ignoring bare 4-digit years) must appear in the cited facts, and (b) dictionary skills named in a bullet must be evidenced by the cited facts. It deliberately does not attempt general semantic entailment.
- **Reason**: SDD §17 states the check "can't prove semantic faithfulness perfectly, but ID validity + lexical checks catch the dangerous failures (invented employers, inflated metrics)"; mandatory human review (step 5) covers the rest. Over-reaching lexical rules would produce false rejections and erode trust in the tool.
- **Alternatives considered**: AI fact-checking the AI (ADR-0006 rejects this — AI checking AI compounds the failure mode); full NLI entailment (a model dependency and nondeterminism inside a deterministic gate).
- **Impact**: the check's boundary is documented; if real usage surfaces a dangerous pattern it misses, the rule set grows (pure code, versioned with the generator).
- **Affected SDD section**: §17.

## 18. Bounded repair loop: 2 rounds, then surface violations (no persistence)

- **Date**: 2026-07-07
- **Decision**: `composeGroundedDraft` invokes the composer, traces, and on failure re-invokes with the violations, up to `MAX_REPAIR_ROUNDS = 2` (3 total attempts). If the final attempt still fails, generation returns a typed `grounding` error listing the surviving violations and persists nothing.
- **Reason**: SDD §17 specifies "bounded repair loop … else surface to user". A small bound keeps cost and latency predictable; an unbounded loop against a stubborn model is a cost/hang risk.
- **Affected SDD section**: §15 (bounded repair mirrors the gateway's own retry stance), §17.
