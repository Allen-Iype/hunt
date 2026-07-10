# M7 — Profile Augment (re-import an edited profile.yaml)

> **Status:** Planned and approved; awaiting explicit go-ahead. Depends on M6.
> Promoted into the repo from the approved plan. Companion:
> [m6-resume-import.md](m6-resume-import.md).

## Context

Once a profile is seeded (M6) from an often-**outdated** resume, the user needs to
*add* newer roles, skills, and achievements over time. Re-importing an edited
`profile.yaml` should **merge** into the existing profile — add new facts, keep
confirmed ones — instead of clobbering it.

**This augment loop was a GAP in the original SDD §27** — it named resume *seeding*
but not the edit-and-re-import loop. Today `ProfileRepository.save` is a
full-replace upsert on one `DEFAULT_PROFILE_ID`; there is no merge path.

## The key design finding — M7 is far simpler than "build a merge engine"

Because the `profile.yaml` is the authoritative source of truth (SDD §12), "merge"
for identity is actually **full-replace done correctly**. What the YAML contains,
exists; what it omits, is deleted (otherwise you could never remove a fact by
editing the file). And the one piece of state that seemed to need preserving across
re-import — `verified` — is **expressible in the YAML itself**, so it needs no
special handling: a fact present in the human-authored YAML is confirmed by
definition, so re-import naturally promotes AI-seeded `verified:false` facts to
`verified:true`. **No `profile_facts` table, no merge engine, no schema change** —
the current `save()` already does the right thing.

## Merge rules (the whole model)

| Case | Rule |
|---|---|
| Fact ID unchanged (content maybe edited) | Keep; YAML content wins; `verified` = YAML value (default true) |
| New fact ID | Append; `verified` default true |
| In DB, **absent from re-imported YAML** | **Delete** (YAML is authoritative) |
| `verified:false` seeded fact, kept in YAML | Becomes `verified:true` (appearing in human-authored YAML = confirmed) |
| `verified:true` in DB, YAML omits the field | Stays true (schema default) |
| `evidenceFactIds` integrity | Already validated in-input by `resolveProfileInput`; full-replace keeps it consistent for free |

Deterministic content IDs (ADR-0011) make this work: an edited fact that still
hashes to the same ID is recognized as the same fact; a fact whose identity-bearing
content changed (company/role/startDate) gets a new ID and is correctly a
delete-old + add-new.

## What M7 actually builds (small)

1. **Delta summary on `hunt profile import`** — the only real change. Load the
   existing profile read-only, diff it against the resolved import by fact ID, and
   report **added / updated / removed / newly-confirmed** counts. This gives the
   "merge" *feel* and — critically — surfaces **deletions so absence is never
   silent**. Report-only; does not change what is saved (still full-replace).
   - `packages/capabilities/src/import-profile.ts`: load previous profile for the
     diff; extend the result `summary` with delta counts.
   - `packages/cli/src/run.ts` `runProfile`: render the delta line.

2. **(Optional, follow-on) `hunt profile import --add-only`** — an opt-in escape
   hatch for "append a few items without maintaining my whole file." Loads the
   existing profile and *unions* the input onto it (case-3 becomes KEEP, not
   delete). This is the ONLY mode needing true in-memory merge, and where a future
   `profile_facts` table would ever matter. **Deferred** — it reintroduces the
   consistency hazards (un-deletable facts, dangling evidence refs) the
   source-of-truth model exists to avoid; ship only if the workflow is wanted.
   Note: under `--add-only`, `evidenceFactIds` validation must re-run against the
   post-union fact set, not the input alone.

## Storage decision (explicit)

**Keep the single-JSON-blob profile. No `profile_facts` table, no migration.** It
only earns its keep when facts have independent lifecycles from the YAML (in-app
editing, AI enrichment persisting across re-imports) — a real future concern (SDD
§12 rightly defers it), not this milestone.

## Verification

- Unit: import over an existing profile — a fact removed from the YAML is gone; a
  new fact appears; a `verified:false` fact kept in the YAML becomes `verified:true`;
  the delta summary reports added/updated/removed/newly-confirmed correctly.
- Regression: existing `ImportProfile` tests stay green (behavior is additive — the
  save is still full-replace; only the summary is enriched).
