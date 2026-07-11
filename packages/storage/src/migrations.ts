/**
 * Forward-only migrations (SDD §14). Applied in order; the database's
 * PRAGMA user_version records the last applied index. Never edit a shipped
 * migration — append a new one.
 *
 * Embedded as strings (not .sql files) so builds need no asset copying.
 */
export const MIGRATIONS: readonly string[] = [
  // 1 — initial schema (SDD §12). Hot columns promoted; full canonical
  // model in the `data` JSON column. `profile_facts` and `raw_envelopes`
  // tables are deferred until their consumers exist (decisions log #4, #6).
  `
  CREATE TABLE profiles (
    id          TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    data        TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE companies (
    id             TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    name           TEXT NOT NULL,
    normalized_key TEXT NOT NULL UNIQUE,
    data           TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE jobs (
    id             TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    dedup_hash     TEXT NOT NULL UNIQUE,
    company_id     TEXT REFERENCES companies(id),
    company_name   TEXT NOT NULL,
    title          TEXT NOT NULL,
    seniority      TEXT NOT NULL,
    posted_at      TEXT,
    data           TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  CREATE INDEX idx_jobs_company_name ON jobs(company_name);

  CREATE TABLE applications (
    id             TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    job_id         TEXT NOT NULL REFERENCES jobs(id),
    status         TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  CREATE INDEX idx_applications_status ON applications(status);

  CREATE TABLE application_events (
    id             TEXT PRIMARY KEY,
    application_id TEXT NOT NULL REFERENCES applications(id),
    seq            INTEGER NOT NULL,
    kind           TEXT NOT NULL,
    data           TEXT NOT NULL,
    occurred_at    TEXT NOT NULL,
    UNIQUE (application_id, seq)
  );
  `,
  // 2 — raw envelope index (SDD §8, §12). The payload itself is in the file
  // vault under `hash`; vault_path is derivable from the hash and not stored.
  `
  CREATE TABLE raw_envelopes (
    hash            TEXT PRIMARY KEY,
    source_id       TEXT NOT NULL,
    adapter_version TEXT NOT NULL,
    content_type    TEXT NOT NULL,
    input_ref       TEXT NOT NULL,
    fetched_at      TEXT NOT NULL,
    source_meta     TEXT
  );
  `,
  // 3 — job analyses (SDD §12, §18): derived, versioned artifacts.
  `
  CREATE TABLE job_analyses (
    id               TEXT PRIMARY KEY,
    job_id           TEXT NOT NULL REFERENCES jobs(id),
    profile_version  TEXT NOT NULL,
    analyzer_version INTEGER NOT NULL,
    fit_score        INTEGER NOT NULL,
    data             TEXT NOT NULL,
    created_at       TEXT NOT NULL
  );
  CREATE INDEX idx_job_analyses_job ON job_analyses(job_id, created_at DESC);
  `,
  // 4 — generated documents (SDD §12, §17): resumes and cover letters, each
  // an immutable version. Hot columns promoted (job, kind, status); the full
  // canonical document lives in the `data` JSON column. application_id is
  // nullable — documents can be generated before an application is tracked.
  `
  CREATE TABLE documents (
    id             TEXT PRIMARY KEY,
    job_id         TEXT NOT NULL REFERENCES jobs(id),
    application_id TEXT REFERENCES applications(id),
    kind           TEXT NOT NULL,
    status         TEXT NOT NULL,
    render_path    TEXT,
    data           TEXT NOT NULL,
    created_at     TEXT NOT NULL
  );
  CREATE INDEX idx_documents_job ON documents(job_id, kind, created_at DESC);
  `,
  // 5 — discovery (ADR-0015, M8). Saved searches (stated intent) and the
  // discovered leads they produce. OpportunityRefs are LEADS, never jobs — the
  // full canonical model lives in `data`; hot columns support the seen/
  // dismissed lifecycle and per-search, relevance-ordered listing.
  `
  CREATE TABLE saved_searches (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    data        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE opportunity_refs (
    id           TEXT PRIMARY KEY,
    source_id    TEXT NOT NULL,
    url          TEXT NOT NULL UNIQUE,
    query_id     TEXT NOT NULL,
    status       TEXT NOT NULL,
    relevance    REAL NOT NULL,
    data         TEXT NOT NULL,
    discovered_at TEXT NOT NULL
  );
  CREATE INDEX idx_opportunity_refs_search
    ON opportunity_refs(query_id, status, relevance DESC);
  `,
];
