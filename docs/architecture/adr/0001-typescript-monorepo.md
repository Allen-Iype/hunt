# ADR-0001: TypeScript pnpm-workspaces monorepo

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §6

## Context
Hunt needs one language across its eventual surfaces (CLI, local web UI, browser extension) and a large open-source contributor pool. Cross-package interfaces will churn heavily before 1.0.

## Decision
TypeScript everywhere; a pnpm-workspaces monorepo with one package per architectural concern (`core`, `capabilities`, `storage`, `ai`, `ingestion`, `render`, `cli`), created as milestones need them.

## Consequences
Atomic cross-package refactors while interfaces are young; single toolchain; weaker AI-library ecosystem than Python accepted because Hunt needs only a thin provider port (ADR-0002ff, SDD §15). Polyrepo split revisitable after interface freeze.

## Alternatives
Python (weak extension/UI story, worse end-user packaging); Rust/Go (unneeded performance, smaller pool / poor UI story); polyrepo (interface churn tax pre-1.0).
