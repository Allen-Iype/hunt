# ADR-0006: Fact-ID grounding and claim tracing for generated documents

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §11, §17

## Context
The known failure mode of AI resume tools is fabricated or inflated experience. One fabricated resume is trust-fatal for the project (SDD §23).

## Decision
The Profile is a set of atomic, stable-ID'd facts. Generation is a pipeline: deterministic fact selection → AI composes bullets that **must cite fact IDs from the candidate set** (schema-required) → deterministic claim tracing rejects uncited or unsupported content → mandatory human review before a document is sendable.

## Consequences
Grounding is a validation step, not a prompt hope. The AI's creative surface is phrasing and emphasis only. Cost: some prose fluidity — accepted as the product's trust proposition.

## Alternatives
Prompt-only guardrails (unverifiable); post-hoc AI fact-checking (AI checking AI compounds rather than bounds the failure mode).
