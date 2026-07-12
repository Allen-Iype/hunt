# Hunt User Guide

Hunt runs your job search on your own machine: import and analyze jobs,
generate grounded resumes and cover letters, and track applications. This
guide walks the complete workflow and every command.

- New here? Do the [Quick start](#quick-start) top to bottom once.
- Looking up one command? Jump to the [Command reference](#command-reference).
- Curious how grounding works? See [Grounding](#grounding).

## Install & setup

Requires Node ≥ 22.

```sh
corepack enable
pnpm install && pnpm build
# during development, invoke via: pnpm hunt <args>   (or node packages/cli/dist/index.js)
```

Your data lives in `~/.hunt` (override with `HUNT_HOME`). See
[data-format.md](data-format.md) for the exact layout.

## Two ways to start

Hunt has two equally native starting points:

- **"Help me find jobs."** — set up a search and let Hunt discover openings for you
  (see [Discover](#discover)). Works with no profile and no AI.
- **"I already have a job description."** — import a posting you found and analyze
  it against your profile (the quick start below).

Both flow into the same core — fit scoring and grounded generation.

## Quick start

The complete loop, in order (you can start at step 2 with discovery instead):

```sh
# 1. Author your profile (the source of truth for everything Hunt generates)
cp examples/profile.example.yaml my-profile.yaml     # then edit with your real facts
hunt profile import my-profile.yaml

# 2a. Find jobs (no profile or AI needed) — or skip to 2b if you already have a posting
hunt searches add "backend remote" --board stripe --role engineer --skill go
hunt discover <search-id>                               # ranked openings from the board
hunt discover --import <opp-id>                          # pull one in as a job

# 2b. Or import a specific posting you already have
hunt import https://boards.greenhouse.io/acme/jobs/123   # a URL, or:
hunt import -                                            # paste the posting, then Ctrl-D
hunt import --file saved-posting.html                    # a saved file

# 3. Analyze it against your profile
hunt analyze <job-id>

# 4. Generate application materials (needs an AI provider — see below)
hunt resume <job-id>
hunt letter <job-id>

# 5. Review the rendered HTML, then approve
hunt approve <doc-id>

# 6. Track the application as it progresses
hunt track <job-id> --status applied
hunt track <job-id> --attach <doc-id>
hunt list
hunt show <job-id>

# 7. Back up your data any time
hunt backup ~/hunt-backup
```

Each command prints the id you need for the next step (`hunt import` prints the
job id, `hunt resume` prints the document id, and so on).

## AI configuration

Hunt uses AI only where genuine language reasoning is needed. **Job import and
analysis work with no AI at all** for postings that carry structured data (most
job boards). AI is needed for:

- extracting a posting that is plain prose (no structured data), and
- **generating** resumes and cover letters (`hunt resume` / `hunt letter`).

Configure a provider by environment variable:

```sh
export ANTHROPIC_API_KEY=sk-...      # Anthropic (cloud), or:
export HUNT_AI_PROVIDER=ollama       # Ollama (fully local, offline)
```

Optional overrides: `HUNT_AI_MODEL` (model name), `HUNT_OLLAMA_URL` (default
`http://localhost:11434`). With Ollama, pull a capable instruct model first
(e.g. `ollama pull qwen3:14b`) — tiny models often can't satisfy the strict
output and grounding rules.

**What leaves your machine:** only the URL you asked Hunt to fetch, and the job
+ profile text sent to the provider you configured. Nothing else. With Ollama,
nothing leaves at all.

## The workflow in depth

### Profile

Your `profile.yaml` is the single source of truth. Edit it, then
`hunt profile import <path>` to load it (idempotent — re-importing an unchanged
file changes nothing). `hunt profile show` summarizes what's loaded. Fact ids
are assigned automatically; see [data-format.md](data-format.md#the-profile-yaml).

**Keeping it current (re-import).** The file *is* your profile: what it contains
exists, what you delete from it goes away. Re-importing an edited file reports
what changed — `Changes: +2 added · 1 updated · 1 newly confirmed` — so you can
see the effect. Because deletion is permanent, an import that would **remove**
facts (things in your saved profile but no longer in the file) is **refused**
unless you confirm:

```sh
hunt profile import my-profile.yaml                  # add/edit freely; deletions are blocked
hunt profile import my-profile.yaml --allow-removals # …confirm you meant to delete
```

The refusal names exactly which facts would be removed, so nothing disappears
silently. (Facts you seeded from a resume as `verified: false` and then keep in
the file are counted as *newly confirmed* — appearing in your own file is how you
vouch for them.)

**Seed it from an existing resume** (so you don't hand-write YAML):

```sh
hunt profile from-resume resume.pdf          # PDF, DOCX, or text; or --file <path>, or - to paste text on stdin
#   → wrote my-profile.yaml (facts marked UNVERIFIED)
#     review & edit it, then: hunt profile import my-profile.yaml
hunt profile from-resume resume.docx -o me.yaml  # choose the output path
```

`from-resume` uses AI to extract structured facts and writes a **reviewable
`my-profile.yaml`** — it does **not** touch your profile. Every fact comes out
`verified: false`: AI proposes, you vouch. Review the file, fix anything wrong,
flip facts to `verified: true` as you confirm them (optional — generation just
*prefers* verified facts), then `hunt profile import` it like any profile.yaml.
It won't overwrite an existing `my-profile.yaml` — remove it or pass `-o`. This
step needs an AI provider (see [AI configuration](#ai-configuration)); the manual YAML path
always works without one. Dates the resume states loosely (e.g. "Mar 2021",
"2019") are normalized to full ISO dates you can adjust. **Accepts PDF, DOCX, and
plain text** (format is auto-detected); stdin paste (`-`) is text only. A scanned
image-only PDF has no extractable text — export or paste a text version instead.

### Discover

Discovery is the "help me find jobs" entry point. You tell Hunt which sources to
watch and what you're looking for; it fetches the openings across all of them in
parallel and ranks them to your intent — **with no profile and no AI needed**. One
slow or failing source never sinks the run: you get the leads that came back, plus
a note on any source that was skipped ([sources](#sources) below).

```sh
# Save a standing search: which sources to watch + your intent.
hunt searches add "senior backend, remote" \
  --board stripe --board figma \        # Greenhouse board slugs (repeatable)
  --lever palantir \                    # Lever board slugs (repeatable)
  --ashby Ramp \                        # Ashby board slugs (repeatable)
  --source remoteok:global \            # any other source: --source <id>:<board>
  --role "backend engineer" \           # role keywords (repeatable)
  --skill go --skill kubernetes \       # skills you want (repeatable)
  --location remote                     # locations (repeatable)

hunt searches list                      # your saved searches (with ids)
hunt discover <search-id>               # find + rank openings now
hunt discover --import <opp-id>         # pull a chosen lead in as a job
hunt searches remove <search-id>        # delete a search
```

`hunt discover` returns **leads**, ranked most-relevant-first, each with an id. A
lead is just a pointer to a posting — Hunt does not store the full job until you
import it. Ranking uses your search intent; if you have a profile, it's used as an
extra signal, but it's never required. Re-running a search won't resurface leads
you've already imported.

#### Sources

Hunt discovers from **13 sources across four tiers**. Each source is a
`<id>:<board>` pair. The three ATS platforms have their own shorthand flags for
back-compat; everything else is added with the generic **`--source <id>:<board>`**
flag (repeatable, and you can mix any sources in one search):

**Tier 1 — ATS boards** (structured, no key, addressed by a company's board slug):

| Add with | Source id | Board example | Where to find the slug |
|---|---|---|---|
| `--board <slug>` or `--source greenhouse:<slug>` | `greenhouse` | `stripe` | `boards.greenhouse.io/`**`stripe`** |
| `--lever <slug>` or `--source lever:<slug>` | `lever` | `palantir` | `jobs.lever.co/`**`palantir`** |
| `--ashby <slug>` or `--source ashby:<slug>` | `ashby` | `Ramp` | `jobs.ashbyhq.com/`**`Ramp`** |

**Tier 2 — aggregator feeds** (broad reach, no key; one global feed each, so the
board is `global` — except Hacker News, whose board is the monthly thread id):

| Add with | What it covers |
|---|---|
| `--source remoteok:global` | RemoteOK — thousands of remote roles |
| `--source arbeitnow:global` | Arbeitnow — European + remote |
| `--source weworkremotely:global` | We Work Remotely |
| `--source hackernews:<thread-id>` | HN "Who is hiring?" — the item id of that month's thread (from its `news.ycombinator.com/item?id=` URL) |

**Tier 3 — aggregator APIs** (widest reach; each needs a free API key — see
[API keys](#discovery-api-keys); a source with no key is **skipped with a clear
warning**, never a crash):

| Add with | What it covers | Board |
|---|---|---|
| `--source adzuna:<country>` | Adzuna — indexes Indeed, Monster, etc. | country code: `us`, `gb`, `de`, … |
| `--source findwork:<mode>` | Findwork — developer-focused | `all` or `remote` |
| `--source jsearch:global` | JSearch (RapidAPI) — **aggregates LinkedIn, Indeed, Glassdoor** through an official API | `global` |

**Tier 4 — best-effort web** (public listings only; **brittle** — see
[Web-tier limits](#web-tier-limits)):

| Add with | Board example |
|---|---|
| `--source linkedin:<location>` | `Remote`, `United States` |
| `--source indeed:<location>` | `Remote` |
| `--source glassdoor:<location>` | `Remote` |

Saved searches show their sources as `id:board` (e.g. `greenhouse:stripe`,
`remoteok:global`). A typo'd source id is rejected when you add the search, with
the list of valid ids. Hunt is **not** a job board: it fetches, on-demand, only
what you asked for, into your local store.

<a id="discovery-api-keys"></a>
#### API keys (Tier 3)

Tier-3 sources need a free API key, set as an environment variable (like AI
config — never stored in Hunt's database or logs). A source whose key is unset is
simply **skipped**; the run continues and tells you which key to set:

```sh
export HUNT_ADZUNA_APP_ID=...      # + HUNT_ADZUNA_APP_KEY   → https://developer.adzuna.com/
export HUNT_ADZUNA_APP_KEY=...
export HUNT_FINDWORK_API_KEY=...   #                         → https://findwork.dev/developers/
export HUNT_JSEARCH_API_KEY=...    # RapidAPI key             → https://rapidapi.com/ (search "JSearch")
```

```
$ hunt discover <search-id>
… 42 new opportunities …
⚠ 1 source skipped:
  - jsearch/global: "jsearch" is not configured — set HUNT_JSEARCH_API_KEY to enable this source
```

<a id="web-tier-limits"></a>
#### Web-tier limits (Tier 4) — read this before using LinkedIn/Indeed/Glassdoor

The web tier is **best-effort and honest by design**. Hunt fetches only public,
un-authenticated listing pages with an identified user-agent — it will **never**
log into your account, spoof a browser, or try to evade a site's bot defenses
(that line protects your accounts). In practice LinkedIn, Indeed, and Glassdoor
usually serve a login or challenge wall to automated requests, so these sources
**often fail on purpose** — you'll see a clear message, not missing jobs:

```
⚠ 1 source skipped:
  - linkedin/Remote: LinkedIn served a login/challenge wall
    (use the JSearch source (official API) or paste the posting: hunt import -)
```

**The reliable way to reach LinkedIn/Indeed/Glassdoor listings is the JSearch
source (Tier 3)** — it aggregates all three through an official API, no account
risk. For any single posting a web source can't reach, the paste path always
works: `hunt import -`.

To act on a lead: `hunt discover --import <opp-id>` runs it through the normal
import pipeline (so a prose-only posting may need an AI provider, exactly like
`hunt import`), then you `analyze`, `resume`, `letter`, and `track` as usual.

#### Example searches by reach

```sh
# Zero-setup, no keys: ATS boards + free feeds
hunt searches add "remote backend" \
  --board stripe --lever palantir \
  --source remoteok:global --source arbeitnow:global --source weworkremotely:global \
  --role "backend engineer" --skill go --skill kubernetes --location remote

# Widest reach: add the aggregator APIs (needs the Tier-3 keys above)
hunt searches add "backend everywhere" \
  --source remoteok:global \
  --source adzuna:us --source findwork:remote --source jsearch:global \
  --role "backend engineer" --skill typescript

# This month's HN "Who is hiring?" (grab the thread's item id from its URL)
hunt searches add "hn hiring" --source hackernews:12345678 --role "senior engineer"
```

### Import

`hunt import` turns a URL, pasted text, or a file into a canonical job. It
preserves the raw payload verbatim (so re-parsing is always possible) and
normalizes it — preferring structured data (JSON-LD), then known-site
selectors, then AI extraction only for unstructured prose. Re-importing the
same posting updates it in place rather than duplicating.

If a URL is auth-walled (LinkedIn sometimes is), Hunt tells you and suggests the
paste path (`hunt import -`), which works for any site.

### Analyze

`hunt analyze <job-id>` scores fit against your profile and extracts
requirements. The **fit score is deterministic** — a stable function over skill
overlap, must-have coverage, and seniority — so scores are comparable across
jobs and stable across runs. A low score is information, not a bug: it means a
real gap (the example profile scores 28/100 against a Go/Kubernetes job because
it genuinely lacks those skills). The output shows the breakdown, matched and
missing skills, and per-requirement coverage.

### Generate (resume & cover letter)

`hunt resume <job-id>` and `hunt letter <job-id>` produce a **draft** grounded
strictly in your profile facts. The output reports how many bullets were
generated, how many candidate facts were considered, and how many repair rounds
the grounding check needed. The rendered HTML is written under
`~/.hunt/documents/<company>-<role>-<date>/`.

If generation can't ground a claim, it says so and produces nothing sendable —
see [Grounding](#grounding).

### Review & approve

Open the rendered HTML, read it, print to PDF if you want a PDF. When you're
satisfied, `hunt approve <doc-id>` marks it sendable. This review is
**mandatory** — Hunt never marks a document sendable on its own, and an approved
document is immutable (re-approval is refused).

### Track

`hunt track <job-id>` records the application's progress:

```sh
hunt track <job-id> --status applied         # move through the lifecycle
hunt track <job-id> --note "Referred by Sam"  # add a note
hunt track <job-id> --attach <doc-id>         # attach a generated document
hunt track <job-id> --contact "Jane (recruiter)"
```

The application is **created automatically** the first time you track a job.
Status transitions are validated against the lifecycle state machine — an
illegal jump (e.g. `applied → accepted`) is rejected with the allowed options.

Lifecycle: `discovered → interested → preparing → applied → screen → tech →
onsite → offer_pending → offer → accepted | declined`, with
`rejected | withdrawn | ghosted` reachable from the active states.

### List & show

- `hunt list` — every imported job with its fit score and tracking status.
  Filter with `hunt list --status applied`.
- `hunt show <job-id>` — one job's full picture: analysis, generated documents,
  and the application timeline. Also accepts an application id.

### Backup

`hunt backup [<dir>]` writes a consistent snapshot (database + raw vault +
rendered documents) to `<dir>` (default `~/.hunt/backups/latest`). It runs an
integrity check first and refuses to overwrite an existing snapshot. Point it at
a directory under Time Machine / restic / a git repo for durable backups.

## Grounding

This is Hunt's core promise: **a generated document never contains a claim that
can't be traced to a fact in your profile.** It is enforced structurally, not by
asking the model nicely:

1. **Select** — deterministic code picks the profile facts most relevant to the
   job. The model only ever sees these.
2. **Compose** — the model writes bullets, and every bullet must cite the fact
   ids it drew from.
3. **Verify** — deterministic claim tracing checks each bullet: it must cite a
   real selected fact, and any number or technology in the text must appear in
   the cited facts. Fabricated employers, inflated metrics, and unsupported
   skills are rejected.
4. **Repair** — if verification fails, the violations are fed back and the model
   tries again, up to a bounded number of rounds.
5. **Review** — you approve before anything is sendable.

If the model keeps reaching for something your profile doesn't support (say a
skill the job wants that you don't have), generation **fails rather than
fabricates**, and tells you which claim it couldn't ground:

```
Generation failed (grounding): generated content still contained ungrounded
claims after 2 repair round(s); nothing sendable was produced
Ungrounded claims that could not be repaired:
  [body[1]] technology "distributed systems" is not evidenced by the cited facts
```

That's working as intended. Either add the skill to your profile if you truly
have it, or accept a document that doesn't claim it.

## Command reference

| Command | Purpose | AI |
|---------|---------|:--:|
| `hunt --version` | Print the version | — |
| `hunt profile from-resume <path> [-o <out>]` | Seed a reviewable profile.yaml from a resume (text/paste) | required |
| `hunt profile import <path> [--allow-removals]` | Import/update your profile from YAML (reports changes; blocks silent deletions) | — |
| `hunt profile show` | Summarize the imported profile | — |
| `hunt searches add <name> [--board/--lever/--ashby <slug>]... [--source <id>:<board>]... [--role/--skill/--location ...]` | Save a standing job search (mix any [sources](#sources)) | — |
| `hunt searches list` | List saved searches | — |
| `hunt searches remove <id>` | Delete a saved search | — |
| `hunt discover <search-id>` | Find + rank openings across the search's sources | — |
| `hunt discover --import <opp-id>` | Import a discovered lead into a job | if unstructured |
| `hunt import <url>` | Import a job from a URL | if unstructured |
| `hunt import --file <path>` | Import a job from a saved file | if unstructured |
| `hunt import -` | Import a job pasted on stdin | if unstructured |
| `hunt analyze <job-id>` | Score fit and extract requirements | optional |
| `hunt resume <job-id>` | Generate a grounded resume draft | **required** |
| `hunt letter <job-id>` | Generate a grounded cover letter draft | **required** |
| `hunt approve <doc-id>` | Mark a reviewed document sendable | — |
| `hunt track <job-id> --status <s>` | Transition the application | — |
| `hunt track <job-id> --note "..."` | Add a note | — |
| `hunt track <job-id> --attach <doc-id>` | Attach a document | — |
| `hunt track <job-id> --contact "..."` | Record a contact | — |
| `hunt list [--status <s>]` | List jobs with fit + status | — |
| `hunt show <job-id\|app-id>` | Full detail for a job/application | — |
| `hunt backup [<dir>]` | Snapshot your Hunt home | — |

## Troubleshooting

- **"no AI provider configured"** on `hunt resume`/`letter` — set
  `ANTHROPIC_API_KEY` or `HUNT_AI_PROVIDER=ollama`. Import/analyze usually don't
  need this; generation always does.
- **A URL import fails / is auth-walled** — paste the posting instead:
  `hunt import -`, then Ctrl-D. This works for every site.
- **A generation "grounding" failure** — expected when the job wants something
  your profile lacks; see [Grounding](#grounding). Not a crash.
- **"database schema version … is newer than this build supports"** — the data
  was written by a newer Hunt. Upgrade Hunt.
- **Low fit scores** — usually correct (a real skills gap), not a bug. Check the
  breakdown in `hunt analyze` output.
