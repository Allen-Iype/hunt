# Hunt — Project Handoff

The canonical entry point for a **new contributor or a fresh Claude session**.
Read this first; it tells you what to read next and in what order, flags what is
missing, and captures knowledge that until now lived only in working sessions.

Project status: **v0.1 + post-V1 milestones** — all V1 milestones (M0–M5)
complete, plus Discovery ATS tier (M8+M9: Greenhouse/Lever/Ashby) and Resume
Import (M6 incl. Phase 2 PDF/DOCX). 321 tests green; 4 core runtime dependencies
plus 2 CLI-only, lazily-imported resume parsers (`mammoth`, `pdf-parse`); 0
code-debt markers. Next planned: M7 (Profile Augment). See the Starter Pack at
the bottom.

---

## 1. Document catalog

Legend — **Essential** (read to be productive), **Recommended** (read before
touching that area), **Optional** (reference).

### Product & vision
| File | Read | Up to date? | What it contains |
|---|---|---|---|
| `README.md` | Essential | ✅ | The pitch, quick-start commands, AI config, doc links. Newcomer's first page. |
| `docs/architecture/software-design.md` (the SDD) | **Essential** | ✅ (V1 truth; §26/§27 predate the reassessment) | The 27-section source of truth: vision, non-goals, architecture, canonical models, capability specs, the resume-generation pipeline (§17), AI strategy (§15), storage (§14), risks, V1 scope, roadmap seeds. **The single most important document.** |
| `docs/implementation/reassessment-2026-07.md` | **Essential** | ✅ (newest strategic view) | First-principles evaluation at v0.1: current state, architecture strengths/weaknesses, capability maturity, resume-optimization gap analysis, tech debt, and a **redesigned roadmap** (proposal). Read for "where are we really and where should we go." |
| `docs/architecture/platform-strategy.md` | **Essential** | ✅ (adopted 3–5-yr direction) | The long-term platform strategy: the **two co-equal entry points** (job **Discovery** and job-description-in), the capability hierarchy, the long-term architecture (⊕ `DiscoveryPort`, `OpportunityRef`/`SavedSearch`, the shared matching primitive), and a **capability-based roadmap**. Extends the SDD; builds on the reassessment. Read for "where is Hunt going and why." Companion: ADR-0015. |

### Governance & process
| File | Read | Up to date? | What it contains |
|---|---|---|---|
| `docs/engineering-contract.md` | **Essential** | ✅ | **Binding rules.** Milestone workflow (explain→plan→implement→test→validate→document→STOP), git prohibitions (never run state-changing git; only suggest a clean conventional commit, no AI attribution), YAGNI, completion checklist, documentation duties. Anyone (human or AI) implementing Hunt must follow this. |
| `docs/contributing.md` | Recommended | ✅ | Setup (Node ≥22, corepack pnpm), the package dependency map (who may import what), commit conventions, testing expectations, the "docs are part of done" policy. |
| `docs/testing.md` | Recommended | ✅ | Test strategy by layer, conventions (Zod v4 idioms, deterministic tests, the **no-AI suite** invariant, prompt locks, record/replay). |

### Architecture decisions (ADRs — `docs/architecture/adr/`)
15 ADRs, each ~1 page: context → decision → consequences → alternatives. **Read
these before changing the area they govern.** Load-bearing ones:
| ADR | Governs |
|---|---|
| 0002 Hexagonal + dependency rule | Why `@hunt/core` imports nothing; the whole module structure |
| 0015 Platform capabilities & discovery | The 3–5-yr direction: two entry points, discovery-as-refs, the shared matching primitive (companion to `platform-strategy.md`) |
| 0006 Fact-ID grounding & claim tracing | The anti-fabrication core of generation |
| 0007 Deterministic fit scoring | Why the AI never emits the fit number |
| 0011 Deterministic content-derived fact IDs | Why profile facts get stable IDs from content |
| 0012 Raw-HTTP providers | Why no vendor SDKs |
| 0013 Domain-shaped AI ports | Why capabilities never see "an LLM," only domain tasks |
| 0004/0005 Envelope + tiered normalization | The ingestion pattern (reused for resume import) |
| 0014 HTML render, PDF deferred | Why no headless browser |
Others (0001, 0003, 0008, 0009, 0010) cover monorepo, SQLite+vault, plugin
stance, paste path, event-sourcing-for-applications-only. All **Accepted** and
current; 0015 is **Proposed** (the adopted long-term direction, awaiting its
first implementing milestone).

### Roadmap & state
| File | Read | Up to date? | What it contains |
|---|---|---|---|
| `docs/implementation/progress.md` | **Essential** | ✅ | Milestone status table, chronological work log, current focus, next steps, **technical-debt table**, risks, blockers. The "where exactly are we" doc. |
| `docs/implementation/roadmap.md` | Essential | ⚠️ Revise | Milestone sequencing. Records M6/M7 but **predates and does not yet reflect the reassessment's redesigned roadmap** (which pulls analytics + an eval harness forward). Reconcile before Phase-1 work. |
| `docs/implementation/decisions.md` | Recommended | ✅ | 20 implementation-level judgment calls (deviations/refinements of the SDD) with date, reason, alternatives, impact. Explains "why is it built this way and not the SDD's way." |
| `docs/implementation/changelog.md` | Optional | ✅ | Added/Changed/Fixed/Deferred per milestone. |
| `docs/implementation/known-issues.md` | Optional | ⚠️ Thin | Says "no known issues"; the real debt lives in progress.md's table. |

### User-facing & operational
| File | Read | Up to date? | What it contains |
|---|---|---|---|
| `docs/user-guide.md` | Recommended | ✅ | The complete workflow and every command, the review/approve flow, the **Grounding** explanation, troubleshooting. Read to understand what the product *does* end to end. |
| `docs/data-format.md` | Recommended | ✅ | The `~/.hunt` layout, SQLite schema, `profile.yaml` reference. Read before touching storage or the profile. |
| `docs/adapter-authoring.md` | Optional | ✅ | How to add a job source (relevant for board-adapter work). |
| `examples/profile.example.yaml` | Essential (to run) | ✅ | The documented profile template — copy it to create a profile. |

### Non-canonical (do not treat as project docs)
- `resume-prompt.md` (repo root) — a scratch session-resume prompt; **git-ignored/personal**, not part of the canonical set.
- `~/.claude/plans/cozy-conjuring-aurora.md` — the approved M6/M7 design, **outside the repo** (see gap G2 below).

---

## 2. Recommended reading order

For a human contributor or an agent that will implement:

1. **`README.md`** — orient: what is this, how do I run it.
2. **`docs/engineering-contract.md`** — the rules you must obey (before writing anything).
3. **`docs/architecture/software-design.md`** — the architectural source of truth (skim all 27 sections; deep-read §6 architecture, §11 models, §15 AI, §17 generation).
4. **`docs/implementation/reassessment-2026-07.md`** — the current honest state + redesigned roadmap.
5. **`docs/architecture/platform-strategy.md`** + **ADR-0015** — the adopted 3–5-yr direction (two entry points, discovery, capability roadmap).
6. **`docs/implementation/progress.md`** — exactly where we are + the debt table.
7. **ADRs** 0002, 0006, 0007, 0011, 0013 — the load-bearing decisions.
8. **`docs/contributing.md`** + **`docs/testing.md`** — how to work and test.
9. **`docs/user-guide.md`** + **`docs/data-format.md`** — what it does + where data lives.
10. **`examples/profile.example.yaml`** — create a profile and run the loop.
11. Area-specific ADRs + `decisions.md` — as you touch each subsystem.

---

## 3. Missing documents to create (before significant new development)

These eliminate tribal knowledge or fill real onboarding holes. Priority: P0
(create before Phase-1 work), P1 (soon), P2 (nice-to-have).

### G1 — `CLAUDE.md` (repo root) · **P0**
- **Why it should exist:** there is no agent-specific onboarding file. A fresh
  Claude session currently has to reconstruct the guardrails from scratch. This
  is the highest-leverage missing file for session-to-session continuity.
- **Why missing:** the project was built in continuous sessions where the rules
  were carried in conversation context, never distilled into a repo file.
- **Sections:** (1) one-paragraph project summary; (2) the non-negotiables
  (never run state-changing git; follow the engineering-contract milestone
  workflow; YAGNI; no new deps without justification; the no-AI suite must stay
  green); (3) the exact commands (`corepack pnpm install/build/lint/typecheck/test`,
  how to run the CLI, how to run against an isolated `HUNT_HOME`); (4) the package
  map + dependency rule in two lines; (5) "read these first" pointer to this
  HANDOFF and the SDD; (6) where the current work stands and what's next.
- **Create before development:** **yes.**

### G2 — Promote the M6/M7 plan into the repo · **P0**
- Suggested path: `docs/implementation/plans/m6-resume-import.md` (+ `m7-profile-augment.md`).
- **Why:** the approved, designed M6/M7 plan lives in `~/.claude/plans/`, **outside
  git** — a fresh clone or a new session on another machine would never see it,
  losing real design work (the "merge = full-replace done right" finding, the
  verified-flag mechanic, the text-first dependency phasing).
- **Why missing:** plan-mode wrote it to the agent's plan directory, which is not
  the repo.
- **Sections:** exactly the current plan-file content (context, M6 artifacts +
  reuse seams, format phasing, the `verified` mechanic; M7 merge rules + delta
  summary; verification; sequencing). Copy it in verbatim, then keep it as the
  milestone's living plan.
- **Create before development:** **yes** — it *is* the next milestone's spec.

### G3 — `docs/architecture/system-overview.md` (or `ARCHITECTURE.md`) · **P1**
- **Why:** the SDD is 570 lines and mixes vision with detail. A newcomer needs a
  **one-page** "how the pieces fit + the data flow diagram + where each concern
  lives" map. The reassessment has a good version buried in §2; extract and
  canonicalize it.
- **Why missing:** the SDD was written as an RFC, not as a quick map; the concise
  overview only ever existed as an agent-generated summary.
- **Sections:** the module table (package → responsibility → deps), the data-flow
  diagram (the V1 loop), the LLM-pipeline diagram (gateway + two repair loops),
  the storage pattern in three sentences, and "start here for X" pointers.
- **Before development:** recommended, not blocking.

### G4 — `docs/glossary.md` · **P1**
- **Why:** Hunt has precise, non-obvious vocabulary — *envelope, fact, grounding,
  claim tracing, candidate fact, fit score, tier, capability, port, provenance,
  verified, dedup fingerprint, the two repair loops.* A newcomer conflates these.
- **Why missing:** the terms are defined *in situ* across the SDD/ADRs but never
  collected; consistent usage was maintained by conversational context.
- **Sections:** one line per term with a pointer to the authoritative doc/ADR.
- **Before development:** recommended.

### G5 — `docs/ai-pipeline.md` · **P1**
- **Why:** the AI/LLM design is the crown jewel but its full picture (the gateway,
  the `AiTask` contract, the **two distinct repair loops** — schema vs. grounding,
  cache/replay-as-one-mechanism, prompt-locks, the domain-port seam) is spread
  across §15, ADR-0012/0013, and code. Anyone touching AI needs it in one place.
  **Also the natural home for the eval-harness design** (currently unbuilt).
- **Why missing:** captured across code + ADRs + this session's analysis, never
  unified.
- **Sections:** gateway mechanics; the task registry + how to add a task
  (schema → instructions → renderer → prompt-lock); the grounding loop vs. schema
  loop; caching/replay/testing; provider adapters; **prompt-quality/eval strategy
  (to be built)**; the operational notes from G7.
- **Before development:** create before any prompt/model iteration or new AI task.

### G6 — `docs/domain-model.md` · **P2**
- **Why:** a single annotated map of the canonical models and their relationships
  (Profile↔facts, Job↔Company, JobAnalysis binding, Document grounding,
  Application event log). The SDD §11 lists them; a relationship diagram + the
  ID-derivation rules in one place would speed any data-touching work.
- **Why missing:** models are documented per-schema in code and listed in §11,
  but never drawn together.
- **Before development:** optional; helpful for the augment/analytics work.

### G7 — folded into G5, but noted: **Operational/provider knowledge** · **P1**
- **Why:** concrete runtime knowledge from this session exists nowhere in the repo
  (see §4 below): which local models actually work, the Ollama `format:"json"` +
  thinking-model interaction, timeout tuning, and how to run a manual grounded-
  generation test. New contributors will rediscover this painfully.

> **Note:** the repo also lacks a root `CONTRIBUTING.md` and a `.env.example`. The
> contributing content exists at `docs/contributing.md` (fine — just add a root
> pointer or symlink for discoverability); a `.env.example` documenting
> `ANTHROPIC_API_KEY` / `HUNT_AI_PROVIDER` / `HUNT_AI_MODEL` / `HUNT_OLLAMA_URL` /
> `HUNT_OLLAMA_TIMEOUT_MS` / `HUNT_HOME` / `HUNT_ENV_FILE` is a quick P1 win.

---

## 4. Knowledge currently trapped in conversations (promote to permanent docs)

This is the crux of the handoff — information that exists **only in working
sessions** and will be lost:

1. **The M6/M7 design & rationale** — the entire approved plan, incl. the key
   finding that profile "merge" is *full-replace done correctly* (absence =
   deletion, `verified` promotes on re-import, no `profile_facts` table needed),
   and the text/paste-first dependency phasing. → **Promote via G2.**
2. **The M4 manual-validation results** — resume generation grounded cleanly
   (0 repair rounds) against qwen3:14b; the cover letter for the same low-fit job
   **hit the repair budget and was refused** ("distributed systems" unsupported),
   with nothing persisted. This is *live proof the grounding invariant holds under
   adversarial pressure* — the product's core claim, currently only in chat and a
   one-line progress.md note. → **Promote to `docs/ai-pipeline.md` (G5) as a
   worked example**, and keep the reproduction steps.
3. **Local-provider operational knowledge:** qwen3:14b via Ollama is a known-good
   model; the provider sends `format:"json"` which suppresses Qwen3 `<think>`
   blocks; large local models need a raised `HUNT_OLLAMA_TIMEOUT_MS`; the manual
   test uses an isolated `HUNT_HOME=/tmp/...` so real data is never touched.
   → **Promote to G5 + `.env.example`.**
4. **The redesigned roadmap's reasoning** — *why* onboarding + eval + analytics
   should precede breadth/surfaces. It's in the reassessment doc (good), but
   `roadmap.md` still shows the old order. → **Reconcile roadmap.md (revise).**
5. **Verified corrections to the docs:** the skill dictionary is **57 entries**
   (docs say "~55"); there are **14 ADRs**. Minor, but worth fixing when touched.
6. **Tech-debt specifics** surfaced this session that aren't all in the debt table:
   `renderFacts` duplicated across composers; ~630 lines of presentation logic in
   `run.ts` (blocks a 2nd surface); staged-error shape duplicated across 8
   capabilities; the Anthropic provider pins an old API version and uses prompt-
   instructed JSON not native structured outputs; the cache key hashes the user
   string only. → **Add to progress.md's debt table (revise).**

---

## 5. New Session Starter Pack

The minimum a fresh Claude session should read to be productive **and** keep the
long-term vision — in order.

1. **`CLAUDE.md`** — the guardrails and commands. First stop.
2. **`docs/HANDOFF.md`** (this file) — the map of everything.
3. **`docs/engineering-contract.md`** — the binding workflow/rules.
4. **`docs/architecture/software-design.md`** — the source of truth (skim; deep-read §6, §11, §15, §17).
5. **`docs/implementation/reassessment-2026-07.md`** — honest current state + redesigned roadmap.
6. **`docs/architecture/platform-strategy.md`** + **ADR-0015** — the adopted 3–5-yr direction: two entry points (discovery + JD-in), the capability hierarchy, the long-term architecture, the capability roadmap.
7. **`docs/implementation/progress.md`** — exact status, debt, next steps.
8. **ADR-0006 & ADR-0013** — the grounding invariant and the AI-port seam (the two ideas that define the product).
9. **`docs/implementation/plans/m6-resume-import.md`** — the next milestone's spec.
10. **`docs/user-guide.md`** — what the product actually does end to end.

With those, a new session understands the vision, the rules, the architecture, the
current state, the moat, the long-term direction, and the immediate next task — the
maximum context-per-document for the minimum reading.
