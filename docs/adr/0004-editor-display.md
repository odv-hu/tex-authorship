# 0004. Show authorship in the editor as whole-line background tints

Status: Accepted
Date: 2026-10-18

## Context

iA Writer recolours the text itself.
In LaTeX, recolouring would hide syntax colouring (commands, maths, citations) inside marked passages.

## Decision

- Marked passages get a light background tint across the full line, in the author's colour, plus a mark on the scrollbar.
- Marker lines are faded and italic.
- Colours are resolved in the same order as in the PDF: exact author, then label, then kind; first from `\AuthorshipColor` lines in the current file, then from `.tex` files in the same or a parent folder, then from the `texAuthorship.authors` setting, then a default per kind.
- `\AuthorshipColor` values get VS Code's colour picker; picking rewrites the value in its original format (decimal or hex).
- The owner's name comes from `\AuthorshipOwner{…}`, found the same way, with the `texAuthorship.ownerName` setting as fallback.

## Consequences

- Syntax colouring stays intact.
- Because markers always occupy whole lines (see [0002](0002-inline-comment-markers.md)), passages always start and end on line boundaries, so whole-line tints are exact.
- Editor and PDF colours match when colours are set in the document; per-user settings only fill gaps.
- Files are scanned once at startup for `\AuthorshipColor` and `\AuthorshipOwner`, then kept current as they change.

## Alternatives considered

- **Recolouring text** (iA style). Loses syntax colours.
- **Fading non-owner text.** Keeps syntax colours but makes AI text harder to read, which is the text most in need of reading.
