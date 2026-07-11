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

## 19. One application per job, auto-created on first track (M5)

- **Date**: 2026-07-09
- **Decision**: `hunt track <job-id>` creates the application if none exists (starting at `discovered`, then applying the requested action), and there is exactly one application per job (id derived deterministically as `app_<fnv1a(jobId)>`). No separate `create` step.
- **Reason**: SDD §13 frames TrackApplication's input as "application ID (or job ID to create)". A single command with auto-create is the least-friction path and matches how a user thinks ("I applied to this job"). One-app-per-job fits V1's single-user, single-pursuit-per-posting reality; the deterministic id makes re-tracking idempotent in its resolution.
- **Alternatives considered**: an explicit `--create` step (extra ceremony, easy to forget); multiple applications per job (no V1 use case — re-applying to the same posting is rare and can be a note; revisit if it arises).
- **Impact**: if multiple pursuits per job are ever needed, the id scheme changes to include a discriminator — a forward migration plus a resolution change, contained in TrackApplication/QueryApplications.
- **Affected SDD section**: §12, §13.

## 20. Distribution/bundling deferred; v0.1 ships runnable-from-source

- **Date**: 2026-07-09
- **Decision**: M5 completes the v0.1 feature set and the `hunt` bin (with a `files` allowlist and a package-manifest-derived version), but does **not** produce a published `npm i -g` package or a single binary. Hunt runs from a built checkout (`pnpm build` → `node packages/cli/dist/index.js` / `pnpm hunt`).
- **Reason**: the workspace packages are `private` with `workspace:*` dependencies, which cannot publish as-is; a real install path needs a bundler (esbuild/tsup) or npm publishing of every `@hunt/*` package — a packaging project with its own decisions (bundle vs. publish-graph, binary targets) that shouldn't be rushed into the milestone that finishes the product. YAGNI until there's a distribution channel to serve.
- **Alternatives considered**: bundle now with tsup (real work + config churn for a decision better made deliberately); publish all packages to npm (premature for a pre-1.0 single-app monorepo).
- **Impact**: "run the loop in anger" (SDD §26 exit) works from source today; a maintainer picks the distribution mechanism when there are users to install for.
- **Affected SDD section**: §26.

## 21. Discovery adapter registry is separate from the source-adapter registry

- **Date**: 2026-07-11 (M8)
- **Decision**: discovery adapters (`DiscoveryAdapter`, produce-many) live in their own registry (`buildDiscoveryRegistry`), distinct from `SOURCE_ADAPTERS` (`SourceAdapter`, fetch-and-normalize one URL). The `DiscoveryPort` is async; the discoverer fans out over a search's sources and dedups leads by URL.
- **Reason**: the two contracts have inverse shapes (ADR-0015): a source adapter turns one known reference into a canonical Job; a discovery adapter turns a query into many leads. Mixing them in one registry would conflate the contracts and tempt `switch`-on-shape logic. Kept a separate ADR unnecessary — ADR-0015 already governs the discovery layer; this is the implementation-level placement call.
- **Alternatives considered**: one unified adapter interface with optional `discover`/`fetchUrl` methods (rejected — fattens both contracts, blurs the produce-many vs. fetch-one distinction); putting discovery adapters in a new package (rejected — they belong with ingestion, sharing `fetchJson`/`FetchError`).
- **Impact**: adding a discovery source (Lever/Ashby) touches only the discovery registry; the source-adapter path is untouched.
- **Affected SDD section**: §8, §9; ADR-0015.

## 22. One shared `skillOverlap` primitive under both scoring and ranking

- **Date**: 2026-07-11 (M8)
- **Decision**: opportunity ranking (`rankOpportunity`, leads) and fit scoring (`computeFitScore`, jobs) sit on one shared `skillOverlap(have, want)` helper in `@hunt/core`'s matching module — not two independent skill-comparison implementations.
- **Reason**: ADR-0015 decision #5 — reuse the trust core's matching engine, never fork a parallel scorer. `rankOpportunity` operates on the thin text a lead carries (title + snippet), `computeFitScore` on a normalized Job + Profile; both express "how much do these skills overlap the target" through the same primitive, at different altitudes.
- **Alternatives considered**: reuse `computeFitScore` directly for ranking (impossible — it needs a normalized Job a lead does not have, ADR-0015); a bespoke ranking skill-comparison (rejected — duplicates matching logic, drifts from scoring over time).
- **Impact**: matching-logic changes propagate to both scoring and ranking from one place; a future contributor is steered to `skillOverlap`/`rankOpportunity`, not a second scorer.
- **Affected SDD section**: §16, §18; ADR-0007, ADR-0015.

## 23. Shared `teaser` helper; per-source `--board`/`--lever`/`--ashby` flags

- **Date**: 2026-07-12 (M9)
- **Decision**: (a) the snippet/teaser logic is extracted from the Greenhouse adapter into a shared `discovery/adapters/teaser.ts` with two functions — `htmlTeaser` (unescape + strip tags, for Greenhouse's escaped `content`) and `plainTeaser` (normalize + cap, for Lever/Ashby `descriptionPlain`). (b) `hunt searches add` names a discovery source with per-platform repeatable flags: `--board <slug>` (defaults to Greenhouse, back-compat), `--lever <slug>`, `--ashby <slug>`, all mixable in one search; boards render as `adapterId:board`.
- **Reason**: with three adapters, three copies of the teaser truncation/normalization would drift; the two variants differ only in HTML handling, so one module keeps the lead-invariant cap (200 chars, teaser-only) in a single place. For the CLI, per-source flags read naturally and reuse M8's repeatable-flag idiom (`collectFlag`); the `adapterId:board` rendering disambiguates the same slug on two platforms. Rejected `--board <adapterId>:<slug>` (noisier values, still needs a default) — chosen shape confirmed with the maintainer.
- **Alternatives considered**: duplicate the teaser per adapter (rejected — three copies of an invariant-bearing helper); a single `--board <adapterId>:<slug>` flag (rejected — see above).
- **Impact**: a new ATS adapter reuses `plainTeaser`/`htmlTeaser` and registers one flag; the lead teaser cap lives in one file. No core/storage/capability change — `createDiscoverer()` picks up registry additions automatically.
- **Affected SDD section**: §8, §20; ADR-0015. Extends decision #21.

## 24. Resume-import: `verified:false` in the capability, deterministic date normalization, refuse-to-overwrite output

- **Date**: 2026-07-12 (M6)
- **Decision**: three implementation calls for `hunt profile from-resume`:
  1. **The extractor never asserts `verified`** — `ExtractedResumeDraft` has no `verified` field at all; the `ImportResume` capability stamps `verified: false` on every fact when shaping the draft into `ProfileInput`. (Basics carry no `verified` field because `ProfileBasicsSchema` has none — an accepted, documented M6 limitation.)
  2. **A deterministic resume-date normalizer lives in the capability** (`"Mar 2021"`/`"2019"`/`"2021-03"` → ISO `YYYY-MM-DD`, filling missing month/day with `01`; unparseable values like `"Present"` → omitted, which for an end date correctly means "current position"). The `ExtractedResumeDraft` accepts loose date *strings*; the strict `ProfileInputSchema` (`z.iso.date()`) does not, so normalization is what makes the generated YAML immediately importable. A round-trip guard (re-validate through `ProfileInputSchema`) turns any residual bad date into a clear `shape`-stage error rather than a broken file.
  3. **The CLI writes `./my-profile.yaml` and refuses to overwrite** (`-o <path>` to choose; write uses the `wx` flag so there is no check-then-write race).
- **Reason**: (1) keeps AI an inert proposal a human confirms (SDD §15) and puts the trust decision in one place, not scattered across the extractor prompt. (2) resumes state imprecise dates; filling `-01` is the one deliberate, transparent inference in M6 — the user sees and can fix it in the reviewable YAML before importing, and it's strictly better than either rejecting the whole import or asking the LLM to invent ISO precision. (3) never clobber a file the tool didn't create (engineering-contract stance on destructive actions).
- **Alternatives considered**: relax `ProfileInputSchema` to accept loose dates (rejected — weakens the canonical Profile's date contract for every path, not just resume import); have the AI emit ISO dates directly (rejected — unreliable, and it would push inference into the model); overwrite `my-profile.yaml` silently or default to stdout (rejected — clobbers user edits / poor first-run UX; maintainer chose refuse-with-`-o`).
- **Impact**: adding PDF/DOCX (Phase 2) touches only the CLI's bytes→text step; the capability, normalizer, and guard are format-agnostic. The `verified:false` stamping and round-trip guard are the load-bearing correctness seams for any future resume-seeding path.
- **Affected SDD section**: §11, §12, §15, §27; ADR-0011, ADR-0013.

## 25. PDF/DOCX parsing lives in the CLI, behind lazy imports (M6 Phase 2)

- **Date**: 2026-07-12 (M6 Phase 2)
- **Decision**: PDF (`pdf-parse`) and DOCX (`mammoth`) support is added as a single CLI-layer module (`resume-reader.ts`, `readResumeText(path)`), and the two parser libraries are imported with `await import()` **only when a PDF/DOCX is actually read** — never at module load, never on the text/paste path. Format is chosen by file extension with a magic-byte fallback (`%PDF-`, `PK\x03\x04`). The `@hunt/capabilities` `ImportResume` and `@hunt/core` are untouched — they still speak `resumeText: string`.
- **Reason**: (a) the dependency rule — `core`/`capabilities` must not depend on document parsers; the CLI is the composition root and the only layer allowed heavy/native deps. (b) `pdf-parse` pulls `pdfjs-dist` and a native canvas binary, and `mammoth` ~10 transitive deps; lazy loading keeps them off the hot path so the common text/paste flow and every other command pay nothing, and a broken native install only degrades `from-resume <pdf>` rather than the whole CLI. (c) these are the first new runtime deps since v0.1 — SDD §21 demands each be justified and contained; CLI-only + lazy is the maximal containment. Maintainer chose "both, lazy-loaded" over DOCX-only / PDF-only / reconsider.
- **Alternatives considered**: parse inside `ImportResume` (rejected — drags parsers into `@hunt/capabilities`, violating the dependency rule and the no-AI/core-surface discipline); eager top-level imports (rejected — loads pdfjs+native canvas for every `hunt` invocation); a lighter `pdf-parse@1` or hand-rolled extractor (rejected — unmaintained / lower fidelity; revisit only if the native dep proves a real install problem); committing binary fixtures vs. generating at test time (chose committed — deterministic, fast, decouples tests from parser internals).
- **Impact**: adding another resume format is one branch in `readResumeText` + one lazy import; the capability, date normalizer, and `verified:false` guard are format-agnostic. The "4 core runtime deps" invariant is now stated as "4 core + 2 CLI-only optional-at-runtime" (see CLAUDE.md).
- **Affected SDD section**: §8 (dependency rule), §20, §21, §27. Extends decision #24.

## 26. Profile re-import guards deletions with `--allow-removals` (M7)

- **Date**: 2026-07-12 (M7)
- **Decision**: `hunt profile import` diffs the edited YAML against the stored profile and, when the import would **delete** existing facts (present in the DB, absent from the YAML), **refuses to save** unless `--allow-removals` (alias `-y`) is passed — naming the facts it would remove. Adds/updates/newly-confirmed always proceed and are reported; the diff itself (`diffProfiles`) is a pure core function keyed on stable fact ids (ADR-0011). The save remains a full replace; the guard runs in `ImportProfile` before `save`, returning a typed `removals` failure.
- **Reason**: the M7 plan proposed a report-only delta; the maintainer chose the stronger guard. Because the profile is full-replace (SDD §12), an accidental omission in a hand-edited YAML would silently delete real career facts — the highest-consequence footgun in the augment loop. Requiring an explicit opt-in for deletion (while leaving the common add/confirm edits frictionless) makes data loss a deliberate act, matching the engineering-contract stance on hard-to-reverse actions. The guard lives in the capability (not just the CLI) so any future surface inherits it.
- **Alternatives considered**: report-only, proceed always (rejected — silent deletion is the whole risk); count-only without naming (rejected — a skimming user can't see *what* vanished); interactive y/N prompt (rejected — keeps import non-interactive/scriptable; a flag composes better). `--add-only` union mode remains deferred (SDD §12) — it, not this guard, is where a `profile_facts` table would ever matter.
- **Impact**: re-importing an edited profile is safe by default; deleting a stale role is a one-flag action. `diffProfiles` also powers the change summary and is reusable by any later profile surface (web UI, audit view).
- **Affected SDD section**: §12, §13, §27; ADR-0011. Builds on decision #24 (`verified` semantics).
