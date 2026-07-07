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
| `@hunt/core` | Canonical models, schemas, state machine, pure domain logic, port interfaces | `zod` only |
| `@hunt/capabilities` | Use-case orchestrations over core + ports; no filesystem/network of their own | `core`, `yaml`, `zod` |
| `@hunt/storage` | SQLite repositories, migrations, raw vault (implements core ports) | `core`, `better-sqlite3` |
| `@hunt/ai` | AI gateway + provider adapters (raw HTTP, ADR-0012); implements core's domain-shaped AI ports (ADR-0013) | `core`, `zod` |
| `@hunt/ingestion` | Source adapters, envelopes, tiered normalization; never imports `@hunt/ai` — AI arrives by port injection | `core`, `node-html-parser` |
| `@hunt/render` | Document renderers behind core's `RenderPort`; HTML + print CSS in V1 (ADR-0014) | `core` only |
| `@hunt/cli` | Presentation + composition root | everything |

Adapter packages (`storage`, `ai`, `ingestion`, `render`) must stay **mutually deletable**: none may import another; they meet only through core ports, wired in the CLI's composition root.

## Testing expectations

Every module has tests; every adapter passes the shared contract suite for its port; every bug fix includes a regression test. See [testing.md](testing.md).

## Commits

Conventional commits (`feat(core): …`, `fix(ingestion): …`, `docs: …`, `chore(repo): …`). Keep subjects imperative and scoped by package or area.

## Documentation duty

A change is complete only when the relevant docs under `docs/implementation/` are updated (progress, changelog, decisions/ADRs when applicable). This repository is self-documenting by policy.
