# ADR-0008: Tier-0 plugin stance

- **Status**: Accepted · **Date**: 2026-07-03 · **SDD**: §10

## Context
Every integration must be replaceable (Principle 7), but plugin *distribution machinery* (dynamic loading, manifests, sandboxing) built before third-party demand exists is the most common over-engineering failure in tools like this.

## Decision
V1 ships Tier 0: in-repo adapter packages implementing stable ports, registered in one static registry file. Interfaces are designed as if Tier 1 (out-of-repo npm plugins) exists: no reaching into internals, versioned contracts, contract-test suites per port. Tier 1/2 (npm packages / out-of-process MCP-shaped plugins) arrive only on demonstrated demand.

## Consequences
"Plugin" is an architectural stance now and a distribution mechanism later, without rework. Cost: third-party adapters require a PR until Tier 1 — acceptable pre-1.0.

## Alternatives
Dynamic plugin system in V1 (speculative machinery); no plugin discipline at all (adapters would fuse to the core and never become extractable).
