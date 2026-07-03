# Contributing to Hunt

## Setup

Requires Node ≥ 22. Enable pnpm via corepack:

```sh
corepack enable
pnpm install
pnpm build && pnpm test && pnpm lint
```

## Ground rules

1. **The SDD is the architectural source of truth** — [docs/architecture/software-design.md](architecture/software-design.md). Architectural changes require an ADR, never a silent drift.
2. **The dependency rule is non-negotiable**: `packages/core` imports nothing from other Hunt packages and performs no I/O. ESLint enforces this; don't work around it.
3. **Deterministic first**: reach for AI only where reasoning over language is genuinely required (SDD §15 has the table). AI output is always schema-validated and never writes to storage directly.
4. **YAGNI**: no abstractions "for the future", no dependencies without demonstrated need. Every new dependency must be justified in the PR description.
5. **Milestone discipline**: work lands within the current milestone's scope (see [implementation/roadmap.md](implementation/roadmap.md)); no drive-by refactors.

## Package map

| Package | Role | May depend on |
|---------|------|---------------|
| `@hunt/core` | Canonical models, schemas, pure domain logic, port interfaces | `zod` only |
| `@hunt/cli` | Presentation + composition root | everything |
| (future) `capabilities`, `storage`, `ai`, `ingestion`, `render` | See SDD §6 | `core` + own external deps |

## Testing expectations

Every module has tests; every adapter passes the shared contract suite for its port; every bug fix includes a regression test. See [testing.md](testing.md).

## Commits

Conventional commits (`feat(core): …`, `fix(ingestion): …`, `docs: …`, `chore(repo): …`). Keep subjects imperative and scoped by package or area.

## Documentation duty

A change is complete only when the relevant docs under `docs/implementation/` are updated (progress, changelog, decisions/ADRs when applicable). This repository is self-documenting by policy.
