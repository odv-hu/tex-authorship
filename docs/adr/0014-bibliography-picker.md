# 0014. Implement the bibliography source picker

Status: Accepted
Date: 2026-10-24

## Decision

Implement the source-only workflow proposed in ADR-0012. Choosing a reference
in Mark Selection or explicit Paste as opens a searchable bibliography picker.
Keep generic reference marking available as “Reference without a source”.
The new `texAuthorship.associateReference` command associates, changes or removes
sources in an existing reference passage, including one made through the normal
paste-options button. The paste provider itself does not open modal pickers.
No citation command is inserted or modified.

Store a versioned JSON comment immediately after the opening reference marker:

```latex
%[*Reference]
% authorship-source: {"version":1,"citekey":"smith2024"}
Passage.
%[/*Reference]
```

The author key remains `*Reference` (or the configured reference author label).
The Lua parser ignores the metadata as an ordinary comment. Marker matching,
colours, editor counts and PDF attribution therefore retain their meaning.
Unmark also removes adjacent source metadata. Invalid and orphan metadata appear
in Problems; missing bibliographic entries are reported when associating again.
No automatic migration of old markers or guessed citation keys is performed.

## Discovery and boundaries

Use explicit `% !TeX root` chains first, then a document with `\documentclass`,
then workspace roots whose literal include graph reaches the current file.
Multiple matching roots require a choice; their bibliographies are never merged.
Read unsaved buffers first. Support braced `\input`/`\include`, comma-separated
`\bibliography`, and repeated `\addbibresource` declarations with optional
arguments. Resolve paths from the main document directory. Missing/unreadable
files are warnings, while remaining readable files still supply entries.

Search matches citation key, author, year/date, title and bibliography filename.
Parse nested braced/quoted fields, string definitions before use, concatenation,
comments and non-entry records. Unknown macros remain display text, and TeX
markup is simplified for display only. Keys retain exact spelling. Duplicate
keys, even identical entries, are visible but cannot be selected. Manual file
selection explicitly replaces the discovered resource set for that operation.

This first implementation intentionally differs from the proposal in these ways:

- Re-read on each invocation rather than maintaining a persistent bibliography
  cache or background diagnostics; edits are immediately visible next time.
- Manual file/root choices apply only to the current operation. Use an explicit
  root directive for persistent root selection.
- Limit individual files to 2 MB, candidate roots to 100, include graphs to 200
  files and explicit root chains to 100. Report these limits when encountered.
- Files are deduplicated by resolved path; symlink aliases are not canonicalised.
- No arbitrary TeX expansion, unbraced input syntax, custom build directories,
  refsection visibility, crossref/xdata field inheritance, or forward string
  expansion. Complex projects can select their `.bib` files explicitly.
- Metadata diagnostics are immediate; unresolved citation keys are checked on
  picker invocation, not continuously against the whole workspace.

## Verification

Node tests cover the parser, literal graphs, missing resources, duplicates,
unsaved buffers, root ambiguity/cycles, metadata/count compatibility and command
edits through a mocked VS Code API. Source selection cancellation and changed
editor/document state must produce no edit; insertion uses a single undoable
edit. Selection ranges crossing marker or verbatim lines are rejected.
Real extension-host UI/undo interaction still requires a development-host check.
PDF regression checks compare source-only annotations with otherwise identical
standard/natbib documents, including ordinary, citation-emphasis, hidden,
pdfLaTeX and no-package modes. This is an extension change; no Lua behaviour or
release artifact is changed.
