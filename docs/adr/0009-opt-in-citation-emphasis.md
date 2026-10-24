# 0009. Opt-in citation emphasis in coloured drafts

Status: Accepted
Date: 2026-10-24

## Decision

Add a `citations` option for bold red standard/natbib citations in LuaLaTeX coloured drafts. A separate glyph attribute gives citation red priority at shipout without changing author attribution. A begin-document hook wraps the citation dispatcher, using natbib’s existing citation group (or a local group for standard LaTeX) to scope bold type and the attribute, including notes and punctuation. Hide mode and pdfLaTeX stop before installing these hooks.

## Consequences

The default remains unchanged, as required by ADR-0008. Opting in can change line wrapping because bold fonts have different metrics; this qualifies ADR-0005's layout-invariance guarantee for this option only. Citation hyperlinks are preserved. Biblatex-specific commands are outside this initial implementation.

## Alternatives

Changing hyperref citecolor alone cannot override the later authorship colouring and does not make citations bold. Clearing the authorship attribute would incorrectly attribute citation text to the owner.
