# ADR-0005: Tiered normalization — deterministic before AI

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §9

## Context
Many job pages carry schema.org `JobPosting` JSON-LD or a JSON API; only unstructured prose genuinely needs an LLM. AI extraction costs money, adds latency, and introduces nondeterminism.

## Decision
Normalization tries tiers in order: (1) structured data (JSON-LD/API), (2) per-source DOM selectors, (3) AI extraction against the Job JSON schema. Every AI-extracted field is provenance-stamped with tier and confidence. (Implementation adds a `user` tier for manually-entered data — decisions.md #2.)

## Consequences
Deterministic and free where possible, universal via the AI fallback; extraction quality is auditable per field.

## Alternatives
AI-extract everything (simple but slow, costly, nondeterministic, and worse than JSON-LD where JSON-LD exists); deterministic-only (fails on pasted prose — kills the universal paste path, ADR-0009).
