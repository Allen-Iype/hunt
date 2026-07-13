# Resume-Planning Prompt

A ready-to-paste prompt for starting a **fresh planning session** on Hunt. Copy
the block below into a new session whenever you want to pick up planning the next
phase of work. It orients the session on the system, points it at the
authoritative docs in reading order, restates the hard boundaries already decided,
and constrains it to **plan, not build** (stop for your approval).

Keep this file current: when a candidate below ships or a boundary changes, update
the "Where the project stands" and "Boundaries" sections so the prompt never hands
a fresh session a stale summary. (It already tells the session to verify against
`progress.md`, but accurate is better.)

---

```
I'm resuming work on Hunt, a local-first AI Career Operating System
(TypeScript, pnpm-workspaces monorepo, SQLite). This session is for
PLANNING the next phase of work — not implementing. Do not write or edit
any code until we've agreed on a plan and I've explicitly approved it.

## First, understand the system — read these in order
1. CLAUDE.md — agent onboarding + the non-negotiable rules
2. docs/HANDOFF.md — the full document map and reading order
3. docs/engineering-contract.md — the binding rules (milestone workflow,
   YAGNI, dependency rule, no-AI suite, never run state-changing git)
4. docs/architecture/software-design.md — source of truth for the design;
   note §21 (honest fetching, no credentialed scraping, no evasion)
5. docs/architecture/adr/0015-platform-capabilities-and-discovery.md —
   the discovery tiering + lead-vs-job invariant
6. docs/implementation/reassessment-2026-07.md — honest current-state
   assessment + the redesigned roadmap
7. docs/implementation/progress.md — exact status, changelog, tech-debt
   table (read the latest changelog row and "Current Focus" / "Next Steps")

## Where the project stands (verify against progress.md, don't trust this blindly)
- All V1 milestones (M0–M5) complete → v0.1. Post-V1 shipped: M6 (resume
  import incl. PDF/DOCX), M7 (profile augment), M8/M9 (ATS discovery), and
  the full internet-wide discovery expansion.
- Discovery now spans 13 sources across 4 tiers: ATS (greenhouse, lever,
  ashby) · feeds (remoteok, arbeitnow, weworkremotely, hackernews) ·
  aggregator APIs with injected keys + skip-with-warning (adzuna, findwork,
  jsearch) · best-effort web, honest-HTTP-only + eval-gated (linkedin,
  indeed, glassdoor). CLI reaches every adapter via `--source <id>:<board>`.
- There's a 9th package, @hunt/eval, scoped to DISCOVERY-EXTRACTION quality
  only (gates the Tier-4 scrapers). It is NOT the AI-output eval.
- 8 packages + eval; ~397 tests passing; working tree clean; the no-AI
  suite is green. The core surface holds a tight dependency budget.

## Boundaries already decided (honor unless I explicitly reverse them)
- Tier-4 scraping is honest public HTTP only: no login/credentials, no
  browser/fingerprint evasion (SDD §21). Sites needing those (e.g. Naukri)
  are out; reach them via aggregator APIs (JSearch etc.) or the paste path.
- Adapters emit LEADS only, never job structure (ADR-0015 invariant).
- packages/core imports no other @hunt/* and does no I/O (ESLint-enforced).

## What I want from this session
The reassessment (doc #6) names the TOP remaining gap as an AI-OUTPUT eval
(expected extractions + claim-trace pass-rate + fit-score assertions), which
is different from the discovery-extraction eval we already have — the
@hunt/eval machinery is ready to host a second scorer. Other candidates in
the roadmap: analytics + FTS, a `hunt discover --all` convenience, a web UI,
MCP server, and a discovery agent.

Start by: (a) confirming the current state from the docs above and telling
me if anything in my summary is stale, then (b) laying out the realistic
next-work options with tradeoffs and a recommendation. Follow the milestone
workflow: explain → plan → STOP for my approval. Ask me clarifying questions
where a decision is genuinely mine to make. Do not begin implementation.
```
