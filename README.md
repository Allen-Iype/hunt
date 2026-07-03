# Hunt

**A Local-First AI Career Operating System.**

Hunt helps software engineers run their entire job search — importing and analyzing jobs, generating grounded resumes and cover letters, and tracking applications — with all data on your machine and AI as a replaceable enhancement, never the source of truth.

> **Status: pre-alpha.** Milestone M0 (skeleton) complete. Nothing user-facing yet beyond `hunt --version`.

## Principles

1. **Local-first** — your data lives in `~/.hunt`, in SQLite and plain files you can inspect and take with you.
2. **AI-agnostic** — Claude, OpenAI, Gemini, or fully offline via Ollama; switching is config.
3. **Source-agnostic** — jobs enter through adapters; the core never knows where data came from.
4. **Deterministic core** — AI is used only where reasoning over language genuinely helps. Everything else is ordinary, testable software.
5. **Grounded generation** — resumes can only be built from your verified profile facts; every bullet cites its sources and is verified deterministically.

## Repository layout

```
packages/
  core/    canonical models, schemas, pure domain logic (no I/O, no SDKs)
  cli/     command-line interface
docs/
  architecture/   software design document + ADRs
  implementation/ roadmap, progress, changelog, decisions, known issues
```

## Development

Requires Node ≥ 22 and pnpm (via `corepack enable`).

```sh
pnpm install
pnpm build      # compile all packages
pnpm test       # run all tests
pnpm lint       # includes the core dependency-rule check
pnpm hunt --version
```

## Documentation

- [Software Design Document](docs/architecture/software-design.md) — the architectural source of truth
- [ADRs](docs/architecture/adr/) — architectural decision records
- [Roadmap](docs/implementation/roadmap.md) · [Progress](docs/implementation/progress.md) · [Changelog](docs/implementation/changelog.md)
- [Contributing](docs/contributing.md) · [Testing](docs/testing.md)

## License

MIT
