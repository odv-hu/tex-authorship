# Roadmap

Updated for **0.1.20**, 2026-10-24.
Reliability is the next priority, before adding more attribution features.
Future items below are proposals, not shipped functionality; significant implementation
decisions get an [ADR](adr/README.md).
Open work is tracked in the [GitHub issues](https://github.com/odv-hu/tex-authorship/issues);
this page explains the direction and the order of priorities.

## Current baseline: 0.1.20

Already implemented:

- Passage-level AI, human and reference markers, editor tints and LuaLaTeX colouring.
- Character/word attribution summaries and an opt-in full-width summary command.
- Opt-in standard/natbib citation emphasis, configurable citation colour and editor colour pickers.
- Bibliography source selection for reference marking and explicit paste, plus source
  reassignment for existing passages. Source selection does not insert a citation.
- Reviewed/Revised AI passages with a recorded reviewer, softened tint and stale-review
  detection. AI origin and attribution totals remain unchanged.
- Reviewer labels in the editor and reviewer bars/legend in the PDF. **Editor line
  borders were removed in 0.1.20**; they are not a future feature to restore.
- Marketplace distribution, citation metadata (`CITATION.cff`) and Zenodo DOI links.

The test suite includes marker, bibliography, review and installation logic, plus
command tests using a mocked VS Code API. LaTeX fixtures and manual PDF comparisons
exist. The first reliability tranche now adds an isolated extension-host suite, a
repeatable PDF regression runner and CI definitions; see [TESTING.md](TESTING.md).
CI execution and the remaining visual/interactive cases still need verification.

## Next: reliability

### 1. Release consistency and reproducibility

Implemented in the first tranche: strict version/tag checks, archive inspection,
release CI gates and refusal to replace published assets. Remaining: changelog,
an observed CI run and a future authorised release through the new gates.

- Fail before packaging or publishing if the tag, `package.json`, both root version
  fields in `package-lock.json`, and `authorship.sty` disagree. Remove the workflow's
  silent extension-only version correction.
- Validate tag syntax and package metadata before running publication steps.
- Verify the VSIX and matching LaTeX ZIP against the tagged source, including version,
  publisher, release channel and bundled files. Preserve published artifacts and tags.
- Make the release sequence explicit: align versions, verify, commit, build from that
  commit, then tag that commit and publish only when authorised.
- Add a `CHANGELOG.md` and keep the local release checklist and CI aligned.

Done when deliberately mismatched versions fail before publication and a clean,
version-aligned tagged commit produces both inspected artifacts reproducibly.

### 2. Real VS Code integration and visual checks

Initial suite covers unmark/undo/redo, stale diagnostics, review removal, colour
providers and theme/highlighting smoke checks in an isolated editor. A manual
checklist is documented. Picker/clipboard automation and visual assertions remain.

- Run tests in an actual extension host, for example with `@vscode/test-electron`.
- Exercise normal paste options, explicit paste, marking/unmarking, bibliography
  selection, reassignment, cancellation, stale edits and undo/redo.
- Check review state transitions, reviewer selection, colour pickers and highlighting
  toggles in light and dark themes, with word wrap on and off.
- Verify decorations visually, including long wrapped passages and nested markers.
  The line-border regression showed that mocked API assertions alone cannot establish
  that the editor remains readable.
- Use isolated test settings and temporary TeX directories so tests do not change the
  user's installed extension or personal TeX package.

Done when the main editing workflows run in the extension host and the supported
visual cases have repeatable checks or an explicit manual release checklist.

### 3. Automated PDF regression checks

Initial runner covers review metadata across rendering/citation modes, legends,
footnotes, included/nested multi-page text, floats and full-width-summary counts.
Source metadata, broader layout assertions and automated bar/colour inspection
remain; generated previews support manual review.

- Turn the existing fixture compilations and comparisons into a repository-owned runner
  and CI checks, with temporary outputs outside tracked sources.
- Cover ordinary, hidden, gradient and citation-emphasis modes; standard/natbib
  citations; review/source metadata; and full-width summaries.
- Compare glyph positions and attribution counts where layout should be unchanged.
  Treat bold citation emphasis separately because it can legitimately change wrapping.
- Exercise nested passages, included files, page breaks, footnotes, floats and legends.
  Check reviewer bars/legends visually as well as checking text geometry.
- Compile relevant fixtures with pdfLaTeX and without the package where applicable.
  Verify that hidden mode produces ordinary styling and legends do not enter counts.

Done when these checks run automatically and produce useful diagnostics and preview
artifacts on failure, rather than depending on one-off local scripts.

### 4. LaTeX and document-discovery robustness

- Improve and test consistent protection against markers in inline verbatim, URLs and
  custom verbatim environments across all editing workflows.
- Address known PDF gaps: explicit `\textcolor` spanning line breaks and running heads
  inside `multicols` (ADR-0005).
- Test and document narrow margins, two-column layouts and reviewer bars near other
  marginal content; keep unsupported layout cases explicit.
- Harden bibliography/root discovery, cancellation and large-project behaviour. Make
  unsupported macro-generated paths and scoped bibliographies clear rather than guessing.
- Investigate biblatex citation emphasis separately from bibliography discovery;
  recognising `\addbibresource` does not imply support for biblatex citation styling.

## After reliability: statistics and reporting

### Review progress statistics

Show **AI-origin words** split into mutually exclusive states:

- Unreviewed.
- Reviewed and unchanged since review.
- Revised and unchanged since review.
- Changed since review (stale Reviewed or Revised passages).

Keep this separate from authorship totals: reviewing a passage must not transfer its
words to the reviewer. Define the denominator and nesting rules explicitly, avoid
counting nested text twice, and make the state totals reconcile with the AI-origin
word total. Optional per-reviewer breakdowns can follow. Distinguish the editor's
source-based estimates from the PDF's typeset counts.

The current reviewer legend identifies people/states; it is **not** a review-progress
word-count breakdown.

### Project-wide counts

Aggregate files reachable from a selected main document instead of reporting only
the active file in VS Code. Reuse bibliography discovery where suitable without
claiming static parsing reproduces all TeX expansion.

Consider separate main-text, reference-list and other-material counts. Define what
each includes; do not present a generic count as automatic journal-policy compliance.

### Per-section breakdown

Report attribution per sectioning unit as well as for the whole document: for each
`\section` and `\subsection`, the words (and characters) inside each author's markers
and the unmarked remainder, with shares, for example:

| Section | Author | Claude | ChatGPT |
|---|---|---|---|
| 2.4 Surface fitting | 10 % | 75 % | 15 % |

Two uses: it shows a writer which sections still need their own revision pass, and it
gives the disclosure helper concrete, located figures instead of a single total.

Take the counts from the LuaLaTeX run, like the existing summary, so that headings
follow the typeset numbering. Define how passages that cross a heading are split,
whether captions, floats and footnotes count toward the section they appear in, and
how the unit level is chosen. Keep the output optional (a separate command or an
option of the summary) and leave the existing totals unchanged.

### Localised summary labels

Configurable column headings, review-state labels and “Total”, for example
*Szerző*, *Karakterek*, *Szavak*, *Összesen*.

### Disclosure helper

Draft an editable AI-use statement from attribution and review information.
Describe what the records actually establish; percentages and review labels do not
certify factual accuracy or journal-policy compliance.

## Longer-term attribution work

### Git-based human authorship

Explore attributing otherwise unmarked text to human collaborators using Git history,
while retaining explicit AI/reference provenance. Decide first whether “author” means
original contributor or last editor; `git blame` supplies the latter, not necessarily
the former.

Possible stages: editor display, a shared author/name/colour mapping, then a PDF mapping
produced before compilation. Account for whitespace-only changes, moved text, squash
merges and Overleaf identities. Do not expose email addresses in PDFs. Word-level
history is a later investigation, not a promised extension of line-level blame.

### Finer attribution inside passages

Explore storing an original-text snapshot and comparing it with subsequent edits to
identify retained AI text and human changes. This is separate from Reviewed/Revised,
which records human review while keeping the whole passage's AI-origin attribution.

Decide storage, matching, nesting, privacy and counting semantics before implementation.
Do not encode identifiers in author labels if that would split author identities or
change colour lookup. Any new format must preserve existing document behaviour.

## Interoperability and distribution

- Import/export iA Writer Markdown Annotations, with explicit handling of differences
  in passage, character and review semantics.
- Open VSX distribution and possible CTAN packaging/documentation. Marketplace
  publication and citation/DOI setup are already in place.
- Revisit automated Marketplace authentication against current supported publisher
  options when implementing it; do not rely on an old migration date in this roadmap.

## Exploratory, not prioritised

- An optional coding-agent hook for explicitly recording text inserted by an agent.
- Coloured pdfLaTeX output through preprocessing, if a demonstrated need justifies the
  additional build steps and generated sources.
