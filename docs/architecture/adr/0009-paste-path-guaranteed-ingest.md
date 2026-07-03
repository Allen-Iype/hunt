# ADR-0009: Paste path as the guaranteed ingest route

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §9, §21, §23

## Context
LinkedIn URL fetching is inconsistent (auth walls, anti-bot) and ToS-gray. Betting the only V1 ingest path on it risks shipping something that fails for most users, and credentialed scraping endangers users' accounts.

## Decision
Two V1 ingest paths sharing the full downstream pipeline: LinkedIn URL fetch (best-effort, JSON-LD-first, honest user-agent) and paste/text import (**guaranteed**: works for every site, forever, zero legal exposure). No browser automation; no credentialed scraping, ever.

## Consequences
V1 is usable regardless of LinkedIn's posture; source-agnosticism is pressure-tested from day one. Cost: one copy-paste of friction on the fallback path.

## Alternatives
LinkedIn-only (fragile, legally exposed); browser automation (out of V1 scope by design, and an arms race).
