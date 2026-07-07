# Hunt

**A Local-First AI Career Operating System.**

Hunt helps software engineers run their entire job search — importing and analyzing jobs, generating grounded resumes and cover letters, and tracking applications — with all data on your machine and AI as a replaceable enhancement, never the source of truth.

> **Status: pre-alpha.** Milestones M0–M3 complete: canonical models, SQLite storage with a content-addressed raw vault, profile management, job import with tiered extraction, and job analysis — deterministic skill matching and fit scoring, with optional AI-classified requirements, red flags, and gap narratives. Resume generation arrives with M4.

## Principles

1. **Local-first** — your data lives in `~/.hunt`, in SQLite and plain files you can inspect and take with you.
2. **AI-agnostic** — Claude, OpenAI, Gemini, or fully offline via Ollama; switching is config.
3. **Source-agnostic** — jobs enter through adapters; the core never knows where data came from.
4. **Deterministic core** — AI is used only where reasoning over language genuinely helps. Everything else is ordinary, testable software.
5. **Grounded generation** — resumes can only be built from your verified profile facts; every bullet cites its sources and is verified deterministically.

## Repository layout

```
packages/
  core/          canonical models, schemas, state machine, ports (no I/O, no SDKs)
  capabilities/  use-case orchestrations (ImportProfile, …)
  storage/       SQLite repositories, migrations, content-addressed raw vault
  cli/           command-line interface + composition root
examples/        profile.example.yaml
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

## Usage (so far)

```sh
cp examples/profile.example.yaml my-profile.yaml   # edit with your real facts
hunt profile import my-profile.yaml
hunt profile show

hunt import https://www.linkedin.com/jobs/view/…   # or any job page URL
hunt import -                                      # paste a posting, Ctrl-D (works for every site)
hunt import --file saved-posting.html

hunt analyze <job-id>                              # fit score, matched/missing skills, gaps
```

Data lives in `~/.hunt` (override with `HUNT_HOME`). Your profile is the single source of truth for everything Hunt will ever generate — only facts recorded there can appear in a resume.

**AI is optional.** Pages with structured data (most job boards) import with no AI at all. Postings that are plain prose need a provider:

```sh
export ANTHROPIC_API_KEY=sk-...      # cloud (Anthropic), or:
export HUNT_AI_PROVIDER=ollama       # fully local via Ollama
```

`HUNT_AI_MODEL` and `HUNT_OLLAMA_URL` override the defaults. Job postings never leave your machine except to the provider you configured, and raw pages are always preserved locally in the vault.

## Documentation

- [Software Design Document](docs/architecture/software-design.md) — the architectural source of truth
- [ADRs](docs/architecture/adr/) — architectural decision records
- [Roadmap](docs/implementation/roadmap.md) · [Progress](docs/implementation/progress.md) · [Changelog](docs/implementation/changelog.md)
- [Contributing](docs/contributing.md) · [Testing](docs/testing.md)

## License

MIT
