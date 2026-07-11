# Hunt Data Format

Hunt keeps everything on your machine in inspectable formats (SDD N4). This
document is the reference for what lives where, so you can read, back up, or
leave Hunt at any time and keep your data.

Nothing here is a private binary format: the database is standard SQLite, raw
pages are stored verbatim, and generated documents are plain HTML.

## The Hunt home

Everything lives under one directory, `~/.hunt` by default. Override it with
the `HUNT_HOME` environment variable (useful for testing or multiple data
sets). The layout:

```
~/.hunt/
  hunt.db                     SQLite database (the runtime source of truth)
  hunt.db.backup-v<N>         automatic pre-migration backups (one per schema version bump)
  vault/
    raw/<hh>/<sha256>         raw ingested payloads, content-addressed, immutable
  documents/
    <company>-<role>-<date>/  rendered resumes & cover letters (HTML)
      resume.html
      cover_letter.html
  cache/
    ai/                       cached AI responses, keyed by (task, version, input, model)
  backups/
    latest/                   default target for `hunt backup` (or a dir you name)
```

Your `profile.yaml` is **not** stored here — it lives wherever you keep it and
is imported into the database. The database is the runtime source of truth; the
YAML is your editing surface (see below).

## The database

Standard SQLite (open it with any SQLite tool: `sqlite3 ~/.hunt/hunt.db`). The
schema follows a consistent pattern — **hot columns promoted, full model in a
JSON column**: fields you filter or sort on are real indexed columns, and the
complete validated model lives in a `data` (or `content`) JSON column.

Tables:

| Table | What it holds |
|-------|---------------|
| `profiles` | Your profile (one row); full model in `data` |
| `profile` facts | Facts are addressable by id *within* the profile JSON (no separate table in V1) |
| `companies` | Companies, deduplicated by `normalized_key` |
| `jobs` | Canonical job postings; `dedup_hash` is unique; `data` holds the full model |
| `applications` | Tracked pursuits; `status` is the materialized current state |
| `application_events` | **Append-only** event log (status changes, notes, attachments, contacts); the true source of an application's history |
| `raw_envelopes` | Index of raw ingested payloads; the bytes are in `vault/raw/` |
| `job_analyses` | Derived analyses, versioned against (job, profile, analyzer) |
| `documents` | Generated resumes & cover letters; `status` is `draft` or `approved` |
| `saved_searches` | Standing job searches (`hunt searches`): which boards to watch + your intent (roles/skills/locations) |
| `opportunity_refs` | Discovered **leads** (`hunt discover`) — a pointer to a posting (source, url, title, snippet, relevance), never the full job; `status` is `new`, `imported`, or `dismissed` |

A row in `opportunity_refs` is a *lead*, not a job: it holds only what's needed to
identify and rank a posting. Its `source_id` records which discovery adapter found
it — `greenhouse`, `lever`, or `ashby` today (a `saved_searches` row lists its
boards as `adapterId:board`). Nothing there contains a normalized job (requirements,
compensation, description) — that's created only when you `hunt discover --import`
a lead, which runs the normal import pipeline and writes a `jobs` row.

**Applications are event-sourced** (the only aggregate that is): the
`application_events` log is authoritative and `applications.status` is a
convenience rebuildable from it. Everything else is current-state with
provenance.

### Migrations

Schema changes are forward-only, numbered, and applied automatically on
startup. Before any migration runs on an existing database, Hunt writes a
`hunt.db.backup-v<N>` copy. `PRAGMA user_version` records the applied count.
Hunt refuses to open a database newer than the build understands.

## The raw vault

Every ingested payload (a fetched page, a pasted posting, a file) is stored
**verbatim and immutable**, content-addressed by SHA-256 under
`vault/raw/<first-two-hex>/<full-hash>`. This is what makes re-normalization
possible when parsers improve, and adapter bugs recoverable — the original is
never mutated. The `raw_envelopes` table indexes these by hash with their
source metadata.

## Generated documents

Resumes and cover letters render to **self-contained HTML** (styles embedded,
no external assets) under `documents/<company>-<role>-<date>/`. Open one in a
browser to read it; print to PDF from there (`Cmd/Ctrl-P`). Each document is an
immutable version — regenerating produces a fresh file, and approval
(`hunt approve`) marks it sendable without altering the bytes.

## The profile YAML

Your profile is authored as a human-writable YAML file, validated against the
schema and imported into the database on `hunt profile import`. Re-importing an
unchanged file is idempotent (identical facts → identical ids). See
[`examples/profile.example.yaml`](../examples/profile.example.yaml) for a
documented starting point. Key points:

- **Fact ids are automatic.** Every entry (experience, achievement, skill,
  project, …) gets a stable id derived from its content. You may set an
  explicit `id:` if you want a stable handle (e.g. to reference from a skill's
  `evidenceFactIds`).
- **Dates are quoted ISO strings** (`"YYYY-MM-DD"`).
- **`verified:` marks a fact you vouch for.** Facts you author are `verified: true`
  by default. Facts produced by `hunt profile from-resume` come out
  `verified: false` — AI proposed them; you confirm by reviewing (and optionally
  flipping to `true`). Generation *prefers* verified facts; the flag is your trust
  record, not a gate. (Basics — name/email — carry no `verified` field.)
- **The profile is the single source of truth for generation.** Only facts
  present here can ever appear in a generated resume or cover letter — this is
  enforced structurally (see [user-guide.md](user-guide.md#grounding)).

You don't have to start from a blank file: `hunt profile from-resume <resume>`
extracts your resume into a ready-to-edit `my-profile.yaml` (every fact
`verified: false`), which you review and then `hunt profile import` like any
other profile.yaml. See [user-guide.md](user-guide.md#profile).

## Leaving Hunt

There is no lock-in. Copy `~/.hunt` and you have everything: a standard SQLite
database, your raw pages, and your rendered documents as HTML. `hunt backup`
produces a clean, consistent snapshot of exactly this.
