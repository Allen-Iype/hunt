# Implementation Decision Log

Deviations from, or refinements of, the SDD made during implementation. Architectural decisions get ADRs; this log records implementation-level judgment calls.

---

## 1. Create packages only when their milestone needs them

- **Date**: 2026-07-03
- **Decision**: M0 creates only `@hunt/core` and `@hunt/cli`. The remaining SDD §6 packages (`capabilities`, `storage`, `ai`, `ingestion`, `render`) are created in the milestones that first need them (storage → M1; ai/ingestion → M2; capabilities → M2; render → M4).
- **Reason**: YAGNI (engineering principle 10). Empty stub packages document nothing the SDD doesn't already document, and would need speculative interfaces.
- **Alternatives considered**: scaffolding all seven packages empty (rejected: dead weight, invites premature interfaces).
- **Impact**: none on architecture; the SDD layout is reached incrementally.
- **Affected SDD section**: §6 (package layout) — sequencing only, not structure.

## 2. `ExtractionTier` includes `"user"`

- **Date**: 2026-07-03
- **Decision**: The provenance extraction-tier enum is `structured | dom | ai | user`, adding `user` to the SDD §9 tiers.
- **Reason**: pasted/manually-entered data needs honest provenance; "user" is not an extraction pipeline but is a real origin, and modeling it now avoids a migration in M2.
- **Alternatives considered**: separate `origin` field alongside tier (rejected: two fields describing one fact).
- **Impact**: none; §9's tiered normalization is unaffected.
- **Affected SDD section**: §9, §11 (provenance).
