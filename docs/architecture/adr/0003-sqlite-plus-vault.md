# ADR-0003: SQLite + content-addressed file vault storage

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §12, §14

## Context
Local-first (N1) with zero setup (N9), but analytics, FTS, dedup, and relational queries need a real query engine.

## Decision
Single SQLite database (hot columns promoted, full model in a JSON column) plus a content-addressed file vault for raw payloads and user-facing folders for rendered documents and `profile.yaml`. Repositories expose intent-level methods; SQLite-specific features (FTS5, JSON functions, later sqlite-vec) are used freely inside the storage package — no database-agnosticism beyond the repository port.

## Consequences
Zero-setup, single-file backup, real queries. Inspectability preserved via documented schema, JSON columns, and a planned full plain-file `export` capability.

## Alternatives
Plain JSON/Markdown files as the database (hand-rolled slow queries); Postgres (violates zero-setup); embedded KV/document stores (weaker querying and tooling than SQLite).
