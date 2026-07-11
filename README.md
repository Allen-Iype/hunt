# Hunt

**A Local-First AI Career Operating System.**

Hunt helps software engineers run their entire job search — **finding** relevant openings, importing and analyzing jobs, generating grounded resumes and cover letters, and tracking applications — with all data on your machine and AI as a replaceable enhancement, never the source of truth. You can start either way: *"help me find jobs"* (discovery) or *"I already have this job description."*

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

hunt searches add "backend remote" --board stripe --role engineer --skill go
hunt discover <search-id>                          # find + rank openings (no profile/AI needed)
hunt discover --import <opp-id>                     # pull a discovered lead in as a job

hunt import https://www.linkedin.com/jobs/view/…   # or import a specific posting by URL
hunt import -                                      # paste a posting, Ctrl-D (works for every site)
hunt import --file saved-posting.html

hunt analyze <job-id>                              # fit score, matched/missing skills, gaps

hunt resume <job-id>                               # tailored, fact-grounded resume (draft)
hunt letter <job-id>                               # tailored, fact-grounded cover letter (draft)
hunt approve <doc-id>                              # after you review the rendered HTML → sendable

hunt track <job-id> --status applied               # track the application through its lifecycle
hunt track <job-id> --attach <doc-id>              # attach a generated document
hunt list                                          # all jobs with fit score + status
hunt show <job-id>                                 # analysis, documents, and application timeline
hunt backup ~/hunt-backup                          # snapshot database + vault + documents
```

The **full user guide** ([docs/user-guide.md](docs/user-guide.md)) walks every
command and the review flow; the **data format** ([docs/data-format.md](docs/data-format.md))
documents exactly what lives in `~/.hunt`.

Data lives in `~/.hunt` (override with `HUNT_HOME`). Your profile is the single source of truth for everything Hunt will ever generate — only facts recorded there can appear in a resume.

**Grounded generation.** `hunt resume`/`hunt letter` never invent experience: deterministic selection picks candidate facts from your profile, the model may only phrase and emphasize them (every bullet must cite the fact IDs it draws from), and a deterministic claim tracer rejects any uncited claim, invented employer, or inflated metric before anything is written. The result is a **draft** rendered to self-contained HTML in `~/.hunt/documents/…`; you review it (open it, print to PDF), then `hunt approve` marks it sendable. Nothing is sendable without that review.

**AI is optional — except for generation.** Pages with structured data (most job boards) import with no AI at all, and analysis, tracking, and search never use it. Prose-only postings and resume/cover-letter composition need a provider:

```sh
export ANTHROPIC_API_KEY=sk-...      # cloud (Anthropic), or:
export HUNT_AI_PROVIDER=ollama       # fully local via Ollama
```

`HUNT_AI_MODEL` and `HUNT_OLLAMA_URL` override the defaults. Job postings and profile facts never leave your machine except to the provider you configured, and raw pages are always preserved locally in the vault.

## Documentation

**New here (contributor or AI session)? Start with [docs/HANDOFF.md](docs/HANDOFF.md)** —
it catalogs every document, gives a reading order, and lists the minimal
"starter pack." Agents: also read [CLAUDE.md](CLAUDE.md) for guardrails and commands.

- [Handoff](docs/HANDOFF.md) — the map of all docs + New Session Starter Pack
- [User Guide](docs/user-guide.md) — the complete workflow and every command
- [Data Format](docs/data-format.md) — what lives in `~/.hunt`, and how to leave with your data
- [Adapter Authoring](docs/adapter-authoring.md) — add a new job source
- [Software Design Document](docs/architecture/software-design.md) — the architectural source of truth
- [Platform Strategy](docs/architecture/platform-strategy.md) — the adopted 3–5-yr direction: two entry points (job discovery + JD-in), the capability roadmap ([ADR-0015](docs/architecture/adr/0015-platform-capabilities-and-discovery.md))
- [Reassessment (2026-07)](docs/implementation/reassessment-2026-07.md) — current-state analysis + redesigned roadmap
- [ADRs](docs/architecture/adr/) — architectural decision records
- [Roadmap](docs/implementation/roadmap.md) · [Progress](docs/implementation/progress.md) · [Changelog](docs/implementation/changelog.md) · [Plans](docs/implementation/plans/)
- [Contributing](docs/contributing.md) · [Testing](docs/testing.md) · [Engineering Contract](docs/engineering-contract.md)

## License

MIT
