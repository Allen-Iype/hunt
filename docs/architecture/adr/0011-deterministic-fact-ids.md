# ADR-0011: Deterministic content-derived fact IDs

- **Status**: Accepted · **Date**: 2026-07-05 · **SDD**: §11, §12, §17

## Context
Grounded generation (ADR-0006) requires every profile fact to have a stable, citable ID. But the profile's editing surface is a human-written `profile.yaml`, and forcing users to invent and maintain IDs by hand would make the file miserable to author.

## Decision
IDs in `profile.yaml` are optional. When omitted, the ID is derived deterministically from the fact's identifying content (e.g. `exp_<fnv1a(company|role|startDate)>`; achievements hash their parent ID plus text). Identical duplicate facts get a deterministic ordinal suffix. Explicit `id:` values are honored, letting users create stable handles (e.g. for `evidenceFactIds`).

## Consequences
Re-importing an unchanged file yields a byte-identical profile — imports are idempotent and diff-friendly. Editing a fact's identifying content changes its ID, which is acceptable: generated documents snapshot the fact IDs they cite at generation time (documents are immutable versions, SDD §11), so a changed ID simply reads as "new fact" going forward. Hashing is FNV-1a 32-bit — pure, dependency-free, collision-safe at profile scale (hundreds of facts, kind-prefixed namespaces); it is *not* used for cross-corpus dedup (that is SHA-256 in ingestion, M2).

## Alternatives
Mandatory hand-written IDs (hostile authoring); random UUIDs assigned on first import + write-back into the user's file (mutating a user-owned file on import is surprising, breaks the "YAML is the source, DB is the runtime" direction, and fights git); position-based IDs (reordering a list would silently re-identify every fact).
