# Hunt Roadmap

Source of truth for milestone sequencing. Derived from SDD §27; statuses updated as milestones complete.

## V1 milestones

| Milestone | Objective | Depends on | Status |
|-----------|-----------|------------|--------|
| M0 — Skeleton | Monorepo, dependency-rule lint, CI, drafted core schemas (Job/Profile/Application), docs tree, ADR log, `hunt --version` | — | ✅ Complete |
| M1 — Models & storage | Finalize V1 canonical models, SQLite repositories, migrations, file vault, `profile.yaml` import, application state machine | M0 | ✅ Complete |
| M2 — Ingestion | Raw-envelope pipeline, paste adapter, LinkedIn adapter, tiered normalization (JSON-LD → DOM → AI), dedup, AI gateway (first use), fixtures + contract tests | M1 | ✅ Complete |
| M3 — Analysis | Skill dictionary, deterministic matching, AI requirement extraction, merge + deterministic fit scoring, `hunt analyze` | M2 | ✅ Complete |
| M4 — Generation | Resume pipeline (select → compose → claim-trace → render → review), cover letters, HTML rendering | M3 | ✅ Complete |
| M5 — Tracking & release | `hunt track/list/show`, event log surfacing, backup, packaging, docs → **v0.1** | M4 | ✅ Complete |

## V1 exit criteria

The complete loop — LinkedIn URL (or pasted posting) → import → normalize → analyze → resume → cover letter → track — run end-to-end on a real job search.

## Post-V1

> **The authoritative long-term direction is
> [`docs/architecture/platform-strategy.md`](../architecture/platform-strategy.md)
> + [ADR-0015](../architecture/adr/0015-platform-capabilities-and-discovery.md)**,
> which frame Hunt as a capability platform with **two co-equal entry points** —
> job **Discovery** and job-description-in — and sequence the work around
> capabilities. It builds on the redesigned roadmap in
> [reassessment-2026-07.md](reassessment-2026-07.md) §10 (onboarding + AI-hardening
> first, then near-free loop-closing analytics, then a refactor before new
> surfaces, then breadth) and **elevates discovery to a Phase-1 headline**: the
> legal, deterministic ATS tier ships in parallel with onboarding (peer, not gated
> behind it), while the best-effort web tier waits behind the eval harness. The
> list below is the near-term head of that plan. Milestone specs live in
> [plans/](plans/).

The two highest-leverage near-term items (SDD §27 named the *seed* but not the
*augment* loop — see below). Full specs: **[plans/m6-resume-import.md](plans/m6-resume-import.md)**,
**[plans/m7-profile-augment.md](plans/m7-profile-augment.md)**.

| Milestone | Objective | Depends on | Status |
|-----------|-----------|------------|--------|
| M6 — Resume Import (Seed) | `hunt profile from-resume <file>`: extract facts from an existing resume into proposed `unverified` facts → write a reviewable `profile.yaml`; the existing `hunt profile import` is the confirm step. New `ExtractedResumeDraft` + `ExtractResumePort` (ADR-0013), `EXTRACT_RESUME_TASK`, `ImportResume`. **Phase 1** (text/paste, zero deps) + **Phase 2** (PDF/DOCX via lazily-imported CLI-only `pdf-parse`/`mammoth`). (SDD F11 §4, §13, §27 #1) | M5 | ✅ Complete |
| M7 — Profile Augment | Re-importing an edited `profile.yaml` reports what changed and never deletes silently. Design finding: for a source-of-truth YAML this is **full-replace done correctly** (absence = deletion; `verified` is expressible in YAML so AI-seeded facts promote to confirmed on re-import) — no `profile_facts` table, no merge engine. Pure `diffProfiles` in core; delta summary + a `--allow-removals` guard on `hunt profile import`; `--add-only` union mode deferred. No storage/AI/deps change. | M6 | ✅ Complete |
| **M8 — Discovery: ATS tier** | The first "help me find jobs" entry point (ADR-0015, Phase-1 item 1.1). `hunt discover` runs a `SavedSearch` against ATS boards (Greenhouse first; Lever/Ashby fast follows) → `OpportunityRef` **leads** in the local store → deterministic intent-first ranking (profile optional) → import chosen leads via the existing pipeline. No profile, no AI. Introduces `DiscoveryPort`, `OpportunityRef`/`SavedSearch`, `rankOpportunity` on a shared matching primitive. | v0.1 | ✅ Complete |
| **M9 — Discovery ATS fast-follows** | Same-tier fast-follows (ADR-0015): **Lever** + **Ashby** discovery adapters over their public JSON APIs (no auth, no AI, no new deps), registered into the M8 discovery registry. `hunt searches add` gains per-source flags (`--board`/`--lever`/`--ashby`, repeatable + mixable). ATS tier now spans three platforms. No core/storage/capability change. | M8 | ✅ Complete |

Then, per the reassessment's redesigned roadmap (in recommended order): **eval
harness** (safe AI iteration) · **analytics + FTS** (near-free, closes the fit-score
loop) · **presentation refactor** (before a 2nd surface) · **distribution** (when
real users arrive) · then breadth: board adapters (Greenhouse/Lever/Ashby),
browser extension, web UI, company research, interview prep, MCP server, discovery
agent, semantic search. (The old SDD §27 order — extension → web UI → analytics →
prep → MCP → agent — is superseded; see the reassessment for why.)

> **The augment gap (M7) was not in the original SDD.** §27 anticipated resume
> *seeding*; it did not capture that a seeded profile is then edited over time
> and re-imported. M7 records that loop. Full design in the approved plan file.

## Roadmap updates

| Date | Change |
|------|--------|
| 2026-07-03 | Initial roadmap created from SDD §27. M0 completed. |
| 2026-07-05 | M1 completed. Models for JobAnalysis (M3) and generated documents (M4) intentionally remain with their consuming milestones (decisions log #4–#6 record the M1 scope calls). |
| 2026-07-07 | M2 completed. Generic-URL fallback adapter added beyond plan (decisions #12). Anthropic + Ollama providers both landed in M2 (SDD §26 slated them "at launch"); config.toml deferred in favor of env vars (decisions #10). Maintainer action outstanding: validate 10 real postings via paste and record live AI fixtures. |
| 2026-07-07 | M3 completed. "Eval fixtures locked" delivered as prompt-hash locks (decisions #13); behavioral eval against live models remains a maintainer action. Analysis works fully without AI (deterministic matching + scoring). |
| 2026-07-07 | M4 completed. New `@hunt/render` package (decisions #1 predicted it here). Rendering is HTML + print CSS; automated PDF deferred behind `RenderPort` (ADR-0014, decisions #15). The grounding invariant is enforced structurally: deterministic selection → composition constrained to candidate fact IDs → claim tracing with a bounded 2-round repair loop (decisions #16–#18) → mandatory `hunt approve` gate. Generation requires an AI provider; the rest of the surface stays no-AI. Behavioral eval of the two composer tasks remains a maintainer action. |
| 2026-07-09 | **M5 completed → v0.1.** `hunt track/list/show/backup` as a capability + CLI layer over M1's state machine and event log — no core changes. Applications auto-create on first track (decisions #19); one application per job. Backup is a `VACUUM INTO` snapshot + vault/documents copy with an integrity check. Release docs written (user-guide, data-format, adapter-authoring). Distribution/bundling deferred as a maintainer action (decisions #20). All V1 milestones complete; the full loop runs end to end in the E2E suite. |
| 2026-07-09 | Post-V1 planning: split the #1 leverage item into **M6 — Resume Import (Seed)** and **M7 — Profile Augment**, and recorded that the augment loop (edit a seeded profile.yaml + re-import) was a gap in the original SDD §27. Both designed and approved (plan file); implementation awaits explicit go-ahead, M6 first. |
| 2026-07-10 | Adopted the long-term **platform strategy** ([platform-strategy.md](../architecture/platform-strategy.md) + [ADR-0015](../architecture/adr/0015-platform-capabilities-and-discovery.md)): Hunt as a capability platform with **two co-equal entry points** (job **Discovery** + JD-in). Discovery elevated to a **Phase-1 headline** (ATS tier ships in parallel with onboarding, intent-first ranking, no profile/no AI required); best-effort web/LinkedIn tier deferred behind the eval harness. Introduces `DiscoveryPort`, `OpportunityRef`/`SavedSearch`, and a shared matching primitive (`rankOpportunity` beside `computeFitScore`). No architecture rewrite; extends the SDD and reassessment §10. |
| 2026-07-11 | **M8 — Discovery: ATS tier complete** (ADR-0015 Phase-1 item 1.1). Greenhouse-first vertical slice: `hunt searches` + `hunt discover`, `OpportunityRef` leads (lead-invariant enforced by `.strict()`), intent-first `rankOpportunity` (profile optional), migration 5, three capabilities. No profile / no AI for the ATS tier. Tests 263 → 288; validated live against a real Greenhouse board. Lever/Ashby are fast follows. Sequencing note: discovery's ATS tier shipped first (it needs only the existing ingestion pipeline); onboarding (M6) and the eval harness remain the other Phase-1 peers. |
| 2026-07-12 | **M9 — Discovery ATS fast-follows complete** (ADR-0015 same tier). **Lever** + **Ashby** adapters over their public JSON APIs (no auth, no AI, no new deps), registered into the M8 discovery registry; shared `teaser` helper extracted; `hunt searches add` generalized to per-source flags (`--board`/`--lever`/`--ashby`, mixable). No core/storage/capability change. Tests 288 → 297; validated live (Lever `palantir` + Ashby `Ramp` → 400 leads, deduped + ranked, persisted per `source_id`). ATS discovery tier now spans three platforms. |
| 2026-07-12 | **M6 — Resume Import (Seed) complete** (SDD §27 #1, F11 §4). `hunt profile from-resume` extracts facts from a resume (Phase 1: text/paste, **zero new deps**) into a reviewable `profile.yaml` with **every fact `verified: false`**; the existing `hunt profile import` confirms — AI proposes, a human vouches (SDD §15). New `ExtractedResumeDraft` + `ExtractResumePort` (ADR-0013), `EXTRACT_RESUME_TASK` + prompt lock, `ImportResume` (with a deterministic resume-date normalizer). Tests 297 → 313; validated live (real resume → `gemma4:26b` → import → show round-trip). PDF/DOCX are Phase 2; M7 (Profile Augment) is the next designed milestone. |
| 2026-07-12 | **M6 Phase 2 — PDF/DOCX resume input complete** (SDD §21, §27 #1). `hunt profile from-resume` now accepts PDF and DOCX via a CLI-only `resume-reader.ts` (extension + magic-byte detection; empty-text guard). `pdf-parse` + `mammoth` are the first new runtime deps since v0.1 — both **lazily imported and CLI-only**, so they never load on the text/paste path and `core`/`capabilities` stay parser-free (deps 4 → 6, optional-at-runtime). Committed sample.pdf/.docx fixtures; offline reader tests. Tests 313 → 321; validated live (real PDF + DOCX → import → show). |
| 2026-07-12 | **M7 — Profile Augment complete** (SDD §12, §27). Re-importing an edited `profile.yaml` now reports added/updated/removed/newly-confirmed and **refuses silent deletions** (`--allow-removals` to confirm). Pure `diffProfiles` in core (by stable fact id, ADR-0011); `ImportProfile` returns the delta + a `removals` guard; CLI renders the change summary. Full-replace save unchanged — **no `profile_facts` table, no migration, no AI, no new deps**. `--add-only` union mode stays deferred. Tests 321 → 335; validated live (seed → edit → refused removal → allow → correct delta → idempotent). The onboarding arc (seed → confirm → augment) is complete. |
