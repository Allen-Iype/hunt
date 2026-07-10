# M6 — Resume Import (Seed)

> **Status:** Planned and approved; awaiting explicit go-ahead to implement.
> This is the next milestone after v0.1. Promoted into the repo from the
> approved plan (previously only in an agent plan directory) so it survives
> across sessions/clones. Companion: [m7-profile-augment.md](m7-profile-augment.md).

## Context

**The problem.** Hunt's profile is the source of truth for all generation, but
today the only way to create one is to hand-author `profile.yaml`. A real job
hunter doesn't want to write YAML — they already have a resume (usually PDF/DOCX).
Asking them to transcribe it is exactly the onboarding friction the product
exists to remove. This is SDD §27's #1 post-V1 item ("biggest onboarding
friction"); F11 in §4; a named capability in §13.

**Why this shape (the design already leans our way):**
- Deterministic content-based fact IDs (ADR-0011): resume-extracted facts get the
  same stable IDs as YAML-authored ones.
- The `profile.yaml` is the chosen editable, git-versionable surface (SDD §12).
- Every fact carries a `verified` flag (SDD §11): AI-seeded facts start
  `verified: false`; the user vouches for their record on review.
- AI stays an inert proposal a human confirms (SDD §15) — no new trust surface.

**Intended outcome.** `hunt profile from-resume <file>` → extracts facts → writes a
ready-to-edit `profile.yaml` (facts marked unverified) → the user reviews/edits →
the existing `hunt profile import` confirms it into their profile. The manual YAML
path remains the always-available fallback.

## Approach

Reuse the M2 ingestion pattern (envelope→normalize) and the ADR-0013 domain-shaped
AI-port pattern. The resume file → text step is a "receive" that produces a
`RawEnvelope`; the text → facts step is a new AI task. Output is a `profile.yaml`
the user reviews — so the *existing* `hunt profile import` path (`resolveProfileInput`
+ `ImportProfile`) is the confirmation step, untouched. This deliberately avoids
building a new interactive confirm subsystem.

## New artifacts (mirroring existing patterns)

| Layer | New thing | Mirrors |
|---|---|---|
| core model | `ExtractedResumeDraft` (Zod: basics + experience/skills/projects/education/certifications, **no IDs/timestamps**, arrays `.default([])`) | `packages/core/src/models/extracted-job.ts` |
| core port | `ExtractResumePort { extractResume({text}): Promise<ExtractResumeResult> }` | `ExtractJobPort` in `packages/core/src/ports.ts` |
| ai task | `EXTRACT_RESUME_TASK` + `createAiResumeExtractor(options)` | `packages/ai/src/tasks/extract-job.ts` |
| ai lock | `extract-resume@1` entry in `prompt-locks.json` + task added to `prompt-locks.test.ts` | existing prompt-lock guard |
| capability | `ImportResume({ resumeExtractor })` — text in → `ExtractedResumeDraft` → shape into `ProfileInput` with **`verified: false` on every fact** → serialize to YAML string | `packages/capabilities/src/import-profile.ts` (staged errors, adds an `"extract"` stage) |
| cli | `hunt profile from-resume <path>` / `--file` / `-` (paste) → read file → extract text → capability → **write `my-profile.yaml`** + print a summary and the `hunt profile import` next-step | `runProfile` / `runImport` in `packages/cli/src/run.ts` |
| wiring | add `resumeExtractor` to `AiSetup` + `noAi()` (ai-config.ts) and inject in container.ts | existing `extractor`/composer wiring |

## File-format phasing (minimal-dependency policy, SDD §21)

- **Phase 1 (this milestone): plain text + paste — ZERO new dependencies.** Proves
  the AI extraction end to end and ships value immediately. `--file resume.txt` and
  `-` (stdin) reuse the existing file-read/stdin CLI plumbing.
- **PDF** (`pdf-parse`, small) and **DOCX** (`mammoth`) are added as follow-on work
  behind the same `hunt profile from-resume` command — the text-extraction step is
  isolated (one function: bytes+contentType → text), so adding a format is one
  parser + a content-type branch, no pipeline change. Each parser dependency is
  justified per SDD §21 when added.

## The `verified` mechanic (the crux of M6)

Every fact schema defaults `verified: true` (built for the YAML-author path). The
resume extractor **must set `verified: false` explicitly** on every proposed fact.
`ProfileBasicsSchema` has no `verified` field — acceptable for M6 (basics are
name/email, low-risk; the user sees them in the YAML). Note this gap in docs.

Confirmed by code: `ProfileInputSchema` uses `.omit({ id: true })` on each fact
schema, so `verified` flows through `resolveProfileInput` unchanged.

## Key reuse (do NOT rebuild)

`RawEnvelope`/vault/`persistEnvelope` two-phase discipline; the whole AI gateway
(`runStructuredTask`, cache/replay); `resolveProfileInput` (deterministic IDs +
`verified` passthrough); `ImportProfile` + `hunt profile import` as the confirm step.

## Verification

- Unit: `ExtractedResumeDraft` schema (accept/reject at expected path); the
  capability sets `verified:false` on all facts; YAML serialization round-trips back
  through `ProfileInputSchema`.
- Prompt-lock test stays green (new task registered + locked).
- AI record/replay: an `extract-resume` fixture; capability test via the replay
  gateway (no live provider in CI) — mirrors the extract-job E2E.
- No-AI suite: `hunt profile from-resume` fails fast with clear guidance when no
  provider is configured (extraction needs a model), like `hunt resume`.
- Manual (like the M4 manual test): a real resume text → `qwen3:14b` via Ollama →
  inspect the generated `my-profile.yaml` → `hunt profile import` it → `hunt profile show`.
