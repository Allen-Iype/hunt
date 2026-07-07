# ADR-0013: Domain-shaped AI ports in core; the LLM seam stays inside @hunt/ai

- **Status**: Accepted · **Date**: 2026-07-07 · **SDD**: §6, §15

## Context
SDD §15 defines an LLMProvider port and named AI tasks. If capabilities and ingestion called the gateway by task name (`runTask("extract-job", …)`), they would import @hunt/ai types, creating a sideways dependency between adapter packages and leaking "there is an LLM here" into business logic.

## Decision
Core defines **domain-shaped ports per AI task** — e.g. `ExtractJobPort { extractJob({text}) }` with its output schema (`ExtractedJobDraft`) as a core model. @hunt/ai implements these ports via its gateway; the `LLMProvider` wire-format interface is **internal to @hunt/ai** and may not be imported elsewhere. Consumers (ingestion tier 3, future generation capabilities) receive the port by injection at the composition root.

## Consequences
Ingestion and capabilities never know AI exists behind the port — a deterministic implementation, a human, or a different gateway would satisfy the same interface. Adapter packages stay mutually deletable. Cost: one small port + schema in core per AI task (~6 total for V1) — bounded and self-documenting.

## Alternatives
Gateway-as-port in core with string task names (stringly-typed contracts, @hunt/ai types leak); AI calls inlined in each consumer (untestable, violates provider independence); tasks defined in core (would pull prompt text into the no-I/O domain core — prompts are adapter concerns).
