# 0012. Link reference passages to bibliography entries

Status: Proposed (source-only interaction confirmed; implementation pending)
Date: 2026-10-24

## Context

`cmdMarkSelection` and `cmdPasteAs` in `src/extension.js` share an author
picker and wrap text using `wrapText` in `src/markers.js`. Reference is an
author kind, including user-defined reference labels, not a dedicated command.
The automatic paste provider constructs alternatives for every author without
opening a picker. Plain paste remains the default.

Both the JavaScript parser and Lua input callback use the complete prefix and
label as the author identity. Putting a citation key into that label would
create a different author, change exact-label colour lookup and split counts.
Appending metadata after a marker's closing bracket would make existing parsers
reject that marker. The current same-folder/ancestor search for owner and colour
settings is not a document dependency graph and must not determine bibliographies.

## Confirmed interaction

Selecting a bibliography entry records the passage's source only. It does not
insert `\cite`, `\nocite`, or any other LaTeX command, and does not cause an
otherwise uncited entry to appear in the bibliography. Citation insertion is a
separate explicit action, outside this feature's initial scope.

## Proposed discovery

1. Resolve explicit `% !TeX root = ...` directives relative to the file that
   contains them, following chains with cycle detection. Honour a user-selected
   root for otherwise ambiguous projects. If the active file contains
   `\documentclass`, it can be its own root. Otherwise find candidate roots in
   its workspace folder whose literal `\input`/`\include` graph reaches it;
   ask when more than one qualifies. Never merge unrelated papers' resources.
   An optional LaTeX Workshop adapter can be added only after verifying a
   supported public interface; it must not be a required dependency.
2. Traverse the chosen root's literal includes, with cycle detection, bounded
   work and cancellation. Read open, unsaved buffers before disk contents.
   Recognise `\bibliography{a,b}` and repeated
   `\addbibresource[options]{file.bib}` declarations across that graph, including
   multiline arguments. Ignore commented code and verbatim-like environments.
3. Resolve ordinary relative paths from the root's compilation directory;
   use `.bib` when omitted by `\bibliography`. Canonicalise resource URIs and
   read each file once. File-relative paths and custom build directories must
   be explicit overrides, not silent alternate matches. Do not attempt arbitrary
   TeX macro expansion or execute TeX to discover paths. Report unresolved macros,
   special import commands, remote resources and scoped biblatex resources as
   limitations, and offer manual bibliography selection for this root.
4. Cache entries by resource URI and document version/file change; invalidate on
   root/include/resource changes. Bound reads and report truncated discovery.
   No workspace, an unsaved root, or missing declarations should offer file
   selection or an unattributed-to-source Reference passage, not an empty mystery
   picker. The existing inline `thebibliography` citation fixture has no `.bib`
   resource and is not a bibliography-discovery fixture.

Initial scope is literal BibTeX/biblatex resource declarations and ordinary
includes. Conditional TeX and per-refsection visibility cannot be inferred
reliably by a static scanner: flag those cases instead of claiming an exact
compiler view. Resource discovery for biblatex does not imply citation-emphasis
support for biblatex commands.

## Proposed picker and workflows

- Preserve the existing public command IDs and plain-paste default. After a
  reference author is selected in Mark Selection or explicit Paste as, offer a
  searchable source picker with a clear “Reference without a source” choice.
  Cancellation makes no edit. Preserve custom reference labels and colours.
- Show the citation key as the label, author and year as the description, and
  title plus relative bibliography filename as detail. Search all three fields.
  Missing fields have explicit placeholders; use `date` when `year` is absent.
  A brace-aware BibTeX reader should handle nested braces, quoted values,
  concatenation, string definitions and non-entry records. Preserve the exact
  key; normalise TeX markup only for display. Unresolved display fields should
  not make an otherwise valid key unselectable.
- Do not display a source picker while VS Code merely requests paste options.
  Retain the existing automatic “Paste as Reference” alternative, then offer an
  explicit “Associate Reference Source…” command for a passage. This command
  also supports changing/removing an existing source. A picker directly in the
  selected paste alternative is a later improvement, contingent on verifying
  the supported paste-resolution API and cancellation/undo behaviour.
- Snapshot the document version, target range and clipboard text before awaiting
  a picker; refuse a stale edit. Apply wrapping and metadata in one undoable
  edit. Guard the whole target range against verbatim-like content and unsupported
  overlapping markers. Associating a source with an existing reference block
  changes metadata, not its passage boundaries or attribution.

## Proposed storage

Keep the author marker pair intact and add one ordinary comment immediately
after the opening reference marker. Illustrative spelling (not implemented):

```latex
%[*Reference]
% authorship-source: {"version":1,"citekey":"smith2024"}
Passage.
%[/*Reference]
```

The metadata belongs only to the immediately preceding opening reference marker.
Store the exact key, not copied author/title/year metadata or an absolute path.
Resolve bibliographic display data against the document's current resources so
the annotation travels with the document. Use single-line JSON serialization
to escape unusual characters safely; do not interpolate keys into TeX commands.
The JSON line is readable without the extension and ignored by older packages.
Unknown versions, malformed metadata and orphaned metadata produce diagnostics
without changing author parsing. Never reinterpret arbitrary existing labels.

This is passage metadata, separate from `Block.key`. Colours, marker matching,
nesting, statistics and author menus continue to use the existing author key.
Unmark removes the associated metadata as well as its marker pair. Older
extensions may leave an orphan comment when unmarking; it is harmless but should
be diagnosed by the new extension. Multiple source keys per passage are deferred;
multiple bibliography files are supported from the start.

## Missing resources and duplicate keys

- Continue loading readable files when one is missing, unreadable or malformed;
  show an actionable warning with the declaration/resource location. Preserve
  existing annotations when a source disappears and mark them unresolved.
- Match keys exactly and retain all occurrences, including duplicates within a
  single file. Show their filenames and locations. Never silently use first or
  last match. Conflicting duplicates are not selectable until corrected or the
  resource set is explicitly corrected. Identical duplicates may share a display
  row but remain flagged and unselectable: bibliography processors can reject
  them too. A filename in our metadata would not disambiguate a LaTeX citation.
- Do not silently rename annotations when a bibliography key changes. Report
  unresolved keys and let the writer explicitly choose a replacement.

## Compatibility and verification before shipping

The companion comment is ignored by today's JavaScript author parser and Lua
marker rewriter. Source counts strip comments and PDF counts count glyphs, so
metadata alone should change neither totals nor author grouping. Exact-key,
label and kind colour overrides remain applicable. Hidden mode, ordinary
pdfLaTeX, and documents without the package continue to see only comments.
The metadata does not activate citation emphasis; real citations keep the
surrounding author attribute, as required by ADR-0009. These are code-inspection
expectations, not a substitute for regression tests.

Implementation should include:

- Unit fixtures for root resolution, cycles, multiple roots/files, multiline
  declarations, comments, unsaved buffers, missing files, duplicate keys and
  BibTeX field parsing; no arbitrary TeX execution.
- Marker tests for unchanged legacy documents, nested passages, metadata
  association, malformed/orphan comments, CRLF, inline spacing, unmark and
  unchanged counts/colour lookup.
- VS Code integration checks for mark, explicit paste, automatic paste then
  associate, cancellation, stale edits, undo and custom reference labels.
- LuaLaTeX fixtures comparing identical text with and without metadata in
  ordinary, hidden and citation-emphasis modes; check rendered spacing, colours
  and attribution counts, including standard/natbib citations. Check pdfLaTeX
  and no-package compilation. Bibliography discovery needs separate real `.bib`
  fixtures for both BibTeX and biblatex declarations.
- Node.js 22 `npm test`, `npm run check`, and `git diff --check`.

No release, installation or version bump is part of this proposal.
