# ADR-0010: Event sourcing for applications only

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §12, §19

## Context
Career analytics (funnel conversion, time-in-stage, ghosting detection) requires application *history*, not just current state. But event-sourcing every aggregate adds ceremony with no payoff elsewhere.

## Decision
Applications are the single event-sourced aggregate: an append-only `application_events` log is the source of truth; `status` is a materialized convenience column, always rebuildable. All other models are current-state + provenance. State transitions are validated by a core state machine.

## Consequences
Analytics comes free from the domain's own record; the rest of the system stays simple. Cost: one aggregate with two representations to keep consistent — localized in the storage package.

## Alternatives
Event-source everything (ceremony without payoff); status-only tracking (destroys the history that analytics — a headline capability — depends on).
