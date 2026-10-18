# 0005. Colour the PDF in LuaLaTeX at shipout; do nothing under pdfLaTeX

Status: Accepted
Date: 2026-10-18

## Context

The markers are comments, and TeX discards comments when it reads a line, so ordinary LaTeX never sees them.
Wrapping passages in `\textcolor` breaks when a passage starts in one group or environment and ends in another, and colour commands can change spacing.
The owner normally builds with pdfLaTeX.

## Decision

`authorship.sty` with `authorship.lua`, active only under LuaLaTeX:

1. A `process_input_buffer` callback sees each source line before TeX does and rewrites marker lines into `\AuthorshipOpen{<hex>}%` / `\AuthorshipClose{<hex>}%` (hex keeps any author label safe from TeX).
2. Those set a global attribute to the current passage; every glyph and rule typeset while it is set carries it, wherever it ends up (footnotes, floats).
3. A `pre_shipout_filter` walks each finished page and wraps runs of tagged glyphs in PDF colour-stack push/pop, solid or as a gradient.
4. The output routine clears the attribute locally, so running heads and page numbers stay black.
5. Under pdfLaTeX, or with the `hide` option, the package stops immediately and the markers stay plain comments.
6. The `.sty` loads `authorship.lua` from its own folder first, then from TeX's search paths, so it also works when loaded by path (`\usepackage{../latex/authorship}`).

## Consequences

- Line and page breaks are identical with colouring on and off, because colour is added after layout.
- The coloured draft needs a LuaLaTeX build; LuaLaTeX and pdfLaTeX fonts can differ slightly, so drafts may not match a pdfLaTeX build page for page.
- `\AuthorshipOpen`/`\AuthorshipClose` are expandable so markers inside tables do not start a new cell.
- Known gaps: a `\textcolor` that spans a line break inside a passage can lose its colour on the second line; `multicol` replaces the output routine, so running heads inside `multicols` may be coloured.

## Alternatives considered

- **`\textcolor` or `soul`-style wrapping.** Breaks across groups and environments; can change spacing.
- **pdfLaTeX support.** pdfTeX has no hook to see comments; it would need a preprocessing step that writes a modified copy of every file.
- **Running a script before LaTeX** to generate coloured sources. Works with any engine but adds a build step and duplicates files.
