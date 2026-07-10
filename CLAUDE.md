# CLAUDE.md — Agent Onboarding for Hunt

You are working on **Hunt**, a local-first AI Career Operating System (TypeScript,
pnpm-workspaces monorepo, SQLite). This file is your quick-start. **Read
`docs/HANDOFF.md` next** — it maps every document and gives the reading order.

## What Hunt is (one paragraph)

Hunt manages a software engineer's job search on their own machine: import and
analyze jobs, generate **grounded** resumes and cover letters (every claim must
trace to a verified profile fact — no fabrication), and track applications
through a lifecycle state machine. AI is an optional enhancement, never required
for the core; the product's moat is **provable truthfulness**. Status: **v0.1**,
all V1 milestones (M0–M5) complete.

## Non-negotiables (read `docs/engineering-contract.md` for the full rules)

- **Never run state-changing git commands** (commit, push, merge, rebase, reset,
  stash, tag, add). Read-only git (status/diff/log) is fine. At a milestone's end,
  only *suggest* a clean conventional commit message — **no AI attribution** of any
  kind (no "Co-authored-by", no "Generated with").
- **Follow the milestone workflow exactly:** explain → plan → implement → test →
  validate → document → **STOP for approval**. Never start the next milestone
  automatically; never work outside the current milestone's scope.
- **YAGNI.** No abstractions "for the future," no new dependencies without a
  demonstrated need (the whole project has **4** external runtime deps — keep it
  that way; justify any addition).
- **The dependency rule is enforced:** `packages/core` imports nothing from other
  `@hunt/*` packages and does no I/O (ESLint blocks violations). Adapter packages
  (`storage`, `ai`, `ingestion`, `render`) never import each other — they meet only
  through core ports, wired in the CLI composition root.
- **The no-AI suite must always stay green.** Import/analyze/track work with no
  provider configured; only generation requires AI. Run the suite with all AI env
  vars unset to confirm you didn't sneak an AI dependency into the core surface.
- **Zod is v4** — use `z.iso.datetime()`, `z.email()`, `z.url()` (not v3 idioms).
- **Every bug fix ships a regression test.** Every module has tests. AI tests use
  record/replay — never a live provider in CI.

## Commands

```sh
corepack pnpm install         # setup (Node ≥ 22, pnpm via corepack)
corepack pnpm build           # tsc across packages
corepack pnpm lint            # eslint incl. the core dependency-rule check
corepack pnpm typecheck       # tsc --noEmit across packages
corepack pnpm test            # vitest (expect 263 passing at v0.1)

# Run the CLI (built):
node packages/cli/dist/index.js <args>     # or: corepack pnpm hunt <args>

# ALWAYS test against an isolated data dir so real ~/.hunt is never touched:
HUNT_HOME=/tmp/hunt-eval node packages/cli/dist/index.js <args>
```

**Verify the baseline before any change:** `install && build && lint && typecheck
&& test` must all pass, and the no-AI suite must be green.

## Environment variables (AI is configured via env, decisions #10)

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Selects Anthropic when `HUNT_AI_PROVIDER` is unset |
| `HUNT_AI_PROVIDER` | `anthropic` or `ollama` |
| `HUNT_AI_MODEL` | Model override (defaults: `claude-sonnet-5` / `llama3.2`) |
| `HUNT_OLLAMA_URL` | Ollama base URL (default `http://localhost:11434`) |
| `HUNT_OLLAMA_TIMEOUT_MS` | Ollama request timeout (default 120000); **raise it for large local models** |
| `HUNT_HOME` | Data dir (default `~/.hunt`) — set to a temp dir for tests |
| `HUNT_ENV_FILE` | Override the `.env` file path |

**Known-good local setup:** `HUNT_AI_PROVIDER=ollama HUNT_AI_MODEL=qwen3:14b`
(the provider sends `format:"json"`, which suppresses Qwen3's `<think>` blocks;
raise `HUNT_OLLAMA_TIMEOUT_MS` for a 14B model). See `docs/HANDOFF.md` §4 for the
worked manual-generation test.

## Package map (who does what)

| Package | Role | May import |
|---|---|---|
| `@hunt/core` | Canonical models, scoring, matching, grounding logic, state machine, **all port interfaces** | `zod` only |
| `@hunt/capabilities` | Use-case orchestrations over core + ports | `core`, `yaml`, `zod` |
| `@hunt/storage` | SQLite repos, migrations, vault, backup | `core`, `better-sqlite3` |
| `@hunt/ai` | AI gateway + raw-HTTP providers + tasks | `core`, `zod` |
| `@hunt/ingestion` | Source adapters, envelope pipeline, tiered normalization | `core`, `node-html-parser` |
| `@hunt/render` | Document → HTML behind `RenderPort` | `core` |
| `@hunt/cli` | Presentation + composition root (wires everything) | everything |

## Where things stand & what's next

- **Done:** the full V1 loop — profile import → job import → analyze → resume/letter
  generation (grounded, claim-traced, human-approved) → track → list → show → backup.
- **Next (planned, awaiting explicit go-ahead):** post-V1 work. The redesigned
  roadmap (`docs/implementation/reassessment-2026-07.md`) sequences: **resume
  import (M6) → profile augment (M7) → eval harness → analytics**, then breadth
  and surfaces. The M6/M7 spec is at `docs/implementation/plans/`.
- **Do not** begin a milestone without the user's explicit approval.

## Read next, in order
1. `docs/HANDOFF.md` — the full document map + New Session Starter Pack.
2. `docs/engineering-contract.md` — the binding rules.
3. `docs/architecture/software-design.md` — the source of truth.
4. `docs/implementation/reassessment-2026-07.md` — honest current state + roadmap.
5. `docs/implementation/progress.md` — exact status and tech-debt table.
