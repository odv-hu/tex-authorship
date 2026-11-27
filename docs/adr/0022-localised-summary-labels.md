# 0022. Localised summary labels

Status: Proposed
Date: 2026-11-27

Refs #14. Extends ADR-0006 (counts from the PDF), ADR-0013 (full-width summary) and
ADR-0021 (review progress counts).

## Context

The summary table, the review-progress table and the review legend print fixed English
labels. Papers in other languages need them in the document's language, for example
*Szerző*, *Karakterek*, *Szavak*, *Összesen*. Existing documents must print the same
table (ADR-0008).

## Decision

One command sets one label: `\AuthorshipLabel{<key>}{<text>}`. The keys are

| Key | Default |
|---|---|
| `author` | Author |
| `characters` | Characters |
| `words` | Words |
| `total` | Total |
| `progress` | AI review progress (typeset words) |
| `unreviewed` | Unreviewed |
| `reviewed` | Reviewed, unchanged since review |
| `revised` | Revised, unchanged since review |
| `changed` | Changed since review |
| `aitotal` | AI-origin total |
| `legend` | AI review legend (origin unchanged) |
| `legendreviewed` | Reviewed (single bar) |
| `legendrevised` | Revised (double bar) |
| `legendchanged` | Changed since review (short bar) |

Each label is a TeX macro (`\authorship@label@<key>`) that the Lua side prints by name,
like `\AuthorshipOwnerName`. Labels can therefore contain accents and TeX markup, and
the defaults live in one place, `authorship.sty`. The legend adds `: ` and the
reviewer's name after its label, and `:` after the legend heading. An unknown key gives
a package warning and changes nothing.

The command is defined before the pdfLaTeX and `hide` exits, so a document that sets
labels compiles in every mode. The tables stay in the excluded attribute group, so a
label never enters the counts.

Not covered: the first-run placeholders, the "no AI-origin words" note, the
full-width heading (already its optional argument) and the owner name (already
`\AuthorshipOwner`). The editor's status bar and statistics view stay English.

## Consequences

- Default output is unchanged: compiling `test/reviews.tex` before and after the change
  gives the same glyphs at the same positions.
- The PDF runner sets every label to Hungarian, checks that no English label is left
  in the PDF, that the counts match the English build, and that an unknown key warns.
- A document that defines the summary labels needs this package version or the
  `\providecommand\AuthorshipLabel[2]{}` fallback.
