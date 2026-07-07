# ADR-0012: Provider adapters use raw HTTP, not vendor SDKs

- **Status**: Accepted · **Date**: 2026-07-07 · **SDD**: §15, §21 (supply chain)

## Context
Each LLM provider needs exactly one call shape from Hunt: (system, user, maxTokens) → text. Vendor SDKs bring transitive dependency trees, their own retry/stream abstractions, and churn on the very axis (provider APIs) the gateway exists to absorb.

## Decision
Provider adapters are direct HTTP calls via the built-in `fetch` (~50 lines each: Anthropic Messages API, Ollama chat API). Retries, validation, repair, and caching live in the gateway, provider-agnostically. Structured output is enforced by schema-in-prompt + validate + one repair attempt — the lowest common denominator that works identically across providers; provider-native JSON modes can be adopted inside an adapter later without any interface change.

## Consequences
Zero AI dependencies beyond `zod`; the supply-chain surface of the most privacy-sensitive package stays auditable at a glance. Cost: we own ~100 lines of wire format per provider and track API version headers ourselves — acceptable, they change rarely and fixture tests pin them.

## Alternatives
Official SDKs per provider (dependency weight, abstraction mismatch with our thin port); a multi-provider framework like the Vercel AI SDK or LangChain (rejected in SDD §15 — orchestration is deliberately our own deterministic code).
