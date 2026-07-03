# ADR-0002: Hexagonal architecture with an enforced dependency rule

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §6, §7

## Context
Job sources, LLM providers, storage engines, and UIs all churn on different timescales. The domain (canonical models, scoring, state machines) must not rot with any of them.

## Decision
Ports & adapters: a pure domain core (no I/O, no SDKs) defining port interfaces; capabilities orchestrate; adapters implement ports. Source-code dependencies point inward only. Enforced mechanically: ESLint blocks `@hunt/*` and I/O-builtin imports in `packages/core`; core's only dependency is `zod`.

## Consequences
Every external concern is swappable and deletable per package; core is exhaustively unit-testable without mocks. Cost: port indirection for each external concern — accepted as the project's core survival trait.

## Alternatives
Framework-centric MVC (fuses domain to delivery mechanism); event-driven core (deferred — see SDD §6; direct capability invocation until plugin demand is real); full Clean Architecture ceremony (dependency rule kept, DTO-per-layer and DI container dropped).
