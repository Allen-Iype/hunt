# Authoring a Job Source Adapter

Adding a job source to Hunt is deliberately small: **one adapter file plus one
registry line.** The cost of a new source is one adapter, and the blast radius
of a broken source is one adapter (SDD §8). This guide shows how.

In V1, adapters are in-repo (Tier 0, [ADR-0008](architecture/adr/0008-tier0-plugin-stance.md)).
The interfaces are designed as if out-of-repo plugins exist, so what you write
here ports cleanly if Hunt later publishes a plugin API.

## The two-phase model

Hunt separates **fetching** (I/O — flaky, rate-limited, sometimes impossible)
from **normalization** (parsing — mostly pure), with the raw payload persisted
verbatim between them. This is why a source change is recoverable: fix the
parser, re-run it over stored payloads, no re-fetch and no data loss.

Normalization is **tiered, cheapest first** (SDD §9):

1. **Structured** — schema.org `JobPosting` JSON-LD or a JSON API. Deterministic,
   exact, free. Handled generically — most boards (Greenhouse, Lever, Ashby,
   public LinkedIn) already embed this, so **you may not need to write anything
   but a URL matcher.**
2. **DOM** — per-source CSS selectors, for sites without structured data.
3. **AI** — the fallback for unstructured prose. Also generic; not per-source.

Your adapter contributes to tiers 1–2 (via fetching + optional DOM extraction);
the tiers themselves are owned by the pipeline.

## The `SourceAdapter` contract

From `packages/ingestion/src/adapters/types.ts`:

```ts
export interface SourceAdapter {
  id: string;                      // stable id, e.g. "greenhouse"
  version: string;                 // adapter version, e.g. "1.0.0"
  matchesUrl(url: string): boolean;        // claim URLs you handle
  fetchUrl(url: string): Promise<string>;  // fetch a claimed URL (throw FetchError on failure)
  domExtract?(html: string):               // optional tier-2 extraction
    { draft: ExtractedJobDraft; descriptionText: string } | null;
}
```

- **`matchesUrl`** — return true for URLs this adapter handles. Adapters are
  tried in registry order, first match wins, so be specific.
- **`fetchUrl`** — fetch the page. Identify honestly (no user-agent spoofing).
  On failure throw `FetchError` with a user-facing hint (e.g. "auth-walled — try
  pasting the posting instead"). Never scrape credentialed content.
- **`domExtract`** (optional) — only needed if the site lacks JSON-LD. Return a
  validated `ExtractedJobDraft` + clean description text, or `null` to fall
  through to the AI tier. Return honest empties over fabricated structure —
  `requirements` may stay empty; analysis extracts them later.

Most new sources that publish JSON-LD need **only** `matchesUrl` + `fetchUrl` —
the structured tier does the rest.

## Steps

1. **Create the adapter** in `packages/ingestion/src/adapters/<source>.ts`
   implementing `SourceAdapter`. Look at `linkedin.ts` (fetch + auth-wall
   detection + DOM tier) and `generic-url.ts` (fetch only, relies on shared
   tiers) as templates.

2. **Register it** in `packages/ingestion/src/registry.ts` — add it to
   `SOURCE_ADAPTERS`, **before** the generic fallback:

   ```ts
   export const SOURCE_ADAPTERS: readonly SourceAdapter[] = [
     linkedinAdapter,
     myAdapter,          // ← specific adapters first
     genericUrlAdapter,  // ← generic fallback last
   ];
   ```

   This registry file is the *only* existing file you change.

3. **Add a fixture** — commit a real saved page under
   `packages/ingestion/src/testing/fixtures/` and a test that runs your
   normalizer against it, fully offline. When a source changes its markup, the
   fix ships with a new fixture. Adapters must be individually deletable:
   removing yours must not break a test outside its own area.

## What your adapter must never do

- Import `@hunt/ai` — the AI tier arrives by port injection; adapters don't know
  AI exists.
- Branch on the source anywhere outside the ingestion package — the canonical
  `Job` carries source only as opaque `provenance`. A `switch (job.source)` in
  core or capabilities is an architecture violation.
- Mutate the raw payload — it is stored verbatim and immutable.
- Scrape behind a login or spoof a user agent.

## Testing

Run the ingestion tests: `pnpm --filter @hunt/ingestion test` (or the whole
suite with `pnpm test`). Your adapter's fixture test is its acceptance
criteria; the shared normalizer contract (preserve provenance, produce
schema-valid output or a typed error, be idempotent) applies to every adapter.
See [testing.md](testing.md).
