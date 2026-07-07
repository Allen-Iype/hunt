# ADR-0014: HTML + print CSS rendering in V1; PDF deferred behind the Render port

- **Status**: Accepted · **Date**: 2026-07-07 · **SDD**: §6, §17, §23

## Context
SDD §17 step 4 renders generated documents to "HTML (+ print-CSS PDF)". A
fully-automated PDF requires a headless browser (Puppeteer/Playwright) or a
typesetting engine (Typst) — a large binary dependency. The SDD itself flags
this as a risk ("PDF rendering dependency weight (headless browser)") and
calls PDF "an implementation detail behind the Render port", with Typst named
as a swap candidate. Hunt's supply-chain stance (§21) is a minimal, justified
dependency surface.

## Decision
The new `@hunt/render` package renders `ResumeDocument` / `CoverLetterDocument`
to **self-contained HTML with embedded print CSS**, and nothing else, in V1.
The user obtains a PDF by opening the HTML and printing to PDF from the
browser (Cmd/Ctrl-P). No headless-browser or typesetting dependency is added.
`@hunt/render` depends only on `@hunt/core`.

Rendering sits behind core's `RenderPort` (`renderResume` / `renderCoverLetter`
→ `{ contentType, content, extension }`). A future automated-PDF renderer is a
new adapter implementing the same port, wired in the composition root — no
consumer changes.

## Consequences
Zero new runtime dependencies for the render layer; the HTML is inspectable,
printable, and git-friendly, consistent with local-first (N4). Cost: the user
performs one manual print step for a PDF file. The port keeps automated PDF a
contained, additive change when it earns its keep. All interpolated document
text is HTML-escaped (job/profile text is effectively untrusted — §21).

## Alternatives
Headless-browser PDF now (rejected: heavy dependency the SDD defers, on the
critical path of a milestone that is really about grounding, not typesetting);
Typst now (same dependency-weight objection, and a new toolchain); a bespoke
PDF writer (large surface for a cosmetic gain). All remain open behind the port.
