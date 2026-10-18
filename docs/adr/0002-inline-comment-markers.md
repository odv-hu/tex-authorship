# 0002. Store authorship as comment markers inside the `.tex` file

Status: Accepted
Date: 2026-10-18

## Context

iA Writer stores authorship as character ranges in a block at the end of the file ([Markdown Annotations](https://github.com/iainc/Markdown-Annotations)), protected by a hash.
Any edit made outside the editor shifts the text under those ranges; the spec's answer is to warn that "annotations may be misplaced".
LaTeX files are routinely touched by other tools: latexindent on save, `git pull`, merges, other editors, Overleaf.

## Decision

Each marked passage is wrapped in a pair of comment lines:

```latex
%[&AI: Claude]
text Claude wrote
%[/&AI: Claude]
```

Each marker sits alone on its line.
The prefix gives the kind, following iA's prefixes: `@` human, `&` AI, `*` reference.
The closing marker repeats the author so passages can nest.
Unmarked text belongs to the document's owner.

## Consequences

- The record moves with the text: formatters, undo/redo, git diffs and merges, and editors without the extension all keep it intact.
- LaTeX ignores the markers, so documents compile anywhere, with or without the package.
- Markers need their own lines. Where the line break would add a space TeX did not have before, the extension ends the preceding line with `%` (see `wrapText` in `src/markers.js`).
- Markers cannot go where `%` is not a comment (`verbatim`, `lstlisting`, `minted`, `\verb`, `\url`); the extension refuses to place them inside verbatim-like environments.
- Granularity is the passage, not the character (see [0003](0003-attribution-at-paste-time-per-passage.md)).
- Converting to iA's format is mechanical: each passage becomes a range.

## Alternatives considered

- **iA's end-of-file range block.** Character precision, but breaks under any external edit and makes every git diff touch the block.
- **A sidecar file** next to the `.tex`. Keeps the source clean, but has the same drift problem and is easy to lose.
- **LaTeX commands** (`\ai{…}`, as in the `changes` package). Visible to TeX, but braces cannot span paragraphs or environments, and the source no longer compiles without the package.
