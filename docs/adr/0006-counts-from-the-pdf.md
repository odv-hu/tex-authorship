# 0006. Count characters and words from the typeset PDF

Status: Accepted
Date: 2026-10-18

## Context

The summary is meant for AI-use disclosure, so its numbers should describe the document a reader sees, across all `\input` files.
Counting the source would include commands, maths markup and comments.

## Decision

- Counting happens in the same shipout pass that colours the page.
- A character is a glyph (ligatures count their components); spaces are not characters.
- A word is a run of glyphs between spaces that contains at least one letter or digit; it counts for the author of its first such glyph; a word hyphenated across lines counts once.
- Totals are written to the `.aux` file and typeset by `\AuthorshipSummary` on the next run, with a legend square per author, shares, a bold total row, and the owner's name from `\AuthorshipOwner`.
- The summary table itself is excluded from the counts.
- The VS Code status bar counts the source instead (non-comment characters between `\begin{document}` and `\end{document}`), per file, as a quick indicator.

## Consequences

- Numbers match what the PDF contains, including headings, captions, running heads and the bibliography, which all count as the owner's.
- The summary lags one LuaLaTeX run behind, like a table of contents.
- Editor and PDF numbers differ by design.

## Alternatives considered

- **Counting the source** (as texcount does). Closer to what was typed, but needs a LaTeX parser and misses how text actually renders.
