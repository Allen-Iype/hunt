# ADR-0007: Deterministic fit scoring

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §13, §18, §19

## Context
Fit scores must be comparable across jobs and over time, and calibratable against outcomes (analytics). An AI-emitted score drifts by model and prompt version and is uninterpretable.

## Decision
The fit score comes from one stable, versioned function over deterministic inputs (must/nice coverage, seniority delta, skill recency). AI contributes *inputs* (requirement classification) and *commentary*, never the number.

## Consequences
Scores are explainable, stable across runs, and auditable via fit-vs-outcome analytics. Cost: less situational nuance — recovered as AI narrative alongside the score.

## Alternatives
LLM-judged scoring (incomparable, drifting); hybrid AI-adjusted scores (worst of both: nondeterministic *and* opaque).
