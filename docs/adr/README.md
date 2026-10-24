# Architecture decision records

Each file records one decision: the situation, what was decided, what follows from it, and what was considered instead.
Records are not edited after the fact; a changed decision gets a new record that supersedes the old one.

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-inline-comment-markers.md) | Store authorship as comment markers inside the `.tex` file | Accepted |
| [0003](0003-attribution-at-paste-time-per-passage.md) | Attribute at paste time, per passage; unmarked text is the owner's | Accepted |
| [0004](0004-editor-display.md) | Show authorship in the editor as whole-line background tints | Accepted |
| [0005](0005-pdf-colouring-in-luatex.md) | Colour the PDF in LuaLaTeX at shipout; do nothing under pdfLaTeX | Accepted |
| [0006](0006-counts-from-the-pdf.md) | Count characters and words from the typeset PDF | Accepted |
| [0007](0007-plain-javascript.md) | Plain JavaScript extension, no build step | Accepted |
| [0008](0008-install-package-in-texmfhome.md) | Install the LaTeX package into TEXMFHOME; keep the format backward compatible | Accepted |
| [0009](0009-opt-in-citation-emphasis.md) | Opt-in bold red citations in coloured drafts | Accepted |
| [0010](0010-configurable-citation-colour.md) | Citation colour command and editor picker, default red | Accepted |
| [0011](0011-normal-release-channel.md) | Use normal GitHub and Marketplace release channels by default | Accepted |
| [0012](0012-bibliography-linked-reference-passages.md) | Link reference passages to bibliography entries without inserting citations | Proposed |
| [0013](0013-full-width-summary.md) | Opt-in full-width summary in document flow | Accepted |
