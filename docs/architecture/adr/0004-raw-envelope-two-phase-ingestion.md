# ADR-0004: Raw-envelope preservation and two-phase ingestion

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §8, §9

## Context
Fetching is flaky and sometimes unrepeatable; parsers improve over time; sources change markup without notice.

## Decision
Ingestion is split into fetch → immutable, content-addressed **raw envelope** → normalize → canonical model + provenance. The verbatim payload is always persisted before any parsing.

## Consequences
Broken normalizers are repairable by re-running over stored envelopes (no data loss, no re-fetch); normalizers are testable against offline fixtures; pasted text, files, and fetched URLs converge on one pipeline. Cost: vault storage space — negligible at single-user scale.

## Alternatives
Parse-on-fetch without preservation (adapter bugs become permanent data loss); storing only parsed output plus URL (re-fetch is often impossible: postings expire).
