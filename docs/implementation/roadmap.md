# Hunt Roadmap

Source of truth for milestone sequencing. Derived from SDD §27; statuses updated as milestones complete.

## V1 milestones

| Milestone | Objective | Depends on | Status |
|-----------|-----------|------------|--------|
| M0 — Skeleton | Monorepo, dependency-rule lint, CI, drafted core schemas (Job/Profile/Application), docs tree, ADR log, `hunt --version` | — | ✅ Complete |
| M1 — Models & storage | Finalize V1 canonical models, SQLite repositories, migrations, file vault, `profile.yaml` import, application state machine | M0 | ✅ Complete |
| M2 — Ingestion | Raw-envelope pipeline, paste adapter, LinkedIn adapter, tiered normalization (JSON-LD → DOM → AI), dedup, AI gateway (first use), fixtures + contract tests | M1 | ✅ Complete |
| M3 — Analysis | Skill dictionary, deterministic matching, AI requirement extraction, merge + deterministic fit scoring, `hunt analyze` | M2 | ✅ Complete |
| M4 — Generation | Resume pipeline (select → compose → claim-trace → render → review), cover letters, HTML/PDF rendering | M3 | ⬜ Not started |
| M5 — Tracking & release | `hunt track/list/show`, event log surfacing, backup, packaging, docs → **v0.1** | M4 | ⬜ Not started |

## V1 exit criteria

The complete loop — LinkedIn URL (or pasted posting) → import → normalize → analyze → resume → cover letter → track — run end-to-end on a real job search.

## Post-V1 (leverage order, SDD §27)

1. Resume-PDF import → profile seeding
2. Browser extension capture + Greenhouse/Lever/Ashby adapters
3. Local web UI over capabilities
4. Analytics + FTS surfacing
5. Interview prep + company research
6. MCP server exposure
7. Discovery agent

## Roadmap updates

| Date | Change |
|------|--------|
| 2026-07-03 | Initial roadmap created from SDD §27. M0 completed. |
| 2026-07-05 | M1 completed. Models for JobAnalysis (M3) and generated documents (M4) intentionally remain with their consuming milestones (decisions log #4–#6 record the M1 scope calls). |
| 2026-07-07 | M2 completed. Generic-URL fallback adapter added beyond plan (decisions #12). Anthropic + Ollama providers both landed in M2 (SDD §26 slated them "at launch"); config.toml deferred in favor of env vars (decisions #10). Maintainer action outstanding: validate 10 real postings via paste and record live AI fixtures. |
| 2026-07-07 | M3 completed. "Eval fixtures locked" delivered as prompt-hash locks (decisions #13); behavioral eval against live models remains a maintainer action. Analysis works fully without AI (deterministic matching + scoring). |
