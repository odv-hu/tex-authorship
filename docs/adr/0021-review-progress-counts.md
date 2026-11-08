# 0021. Review progress counts for AI-origin words

Status: Proposed
Date: 2026-11-08

Extends ADR-0006 (counts from the PDF) and ADR-0015 (AI review states).

## Context

ADR-0015 records per passage whether AI text was reviewed or revised, but the only
document-level output is the reviewer legend, which names people and states and
counts nothing. Writers preparing an AI-use disclosure want to know how much of the
AI-origin text a human has checked, without reviewing changing who wrote it.

## Decision

**What is counted.** The denominator is the AI-origin word total: the words that the
existing attribution counts already credit to AI authors. Each of those words falls
into exactly one state:

| State | Passage the word counts for |
|---|---|
| Unreviewed | has no valid review metadata |
| Reviewed, unchanged since review | `reviewed`, fingerprint current |
| Revised, unchanged since review | `revised`, fingerprint current |
| Changed since review | `reviewed` or `revised`, fingerprint stale or unverifiable |

The states add up to the AI-origin total by construction: the state is taken at the
moment the word is credited to its author. Words of the owner, human co-authors and
references are outside the denominator, including human or reference passages nested
inside a reviewed AI passage. Reviewing moves no words between authors; the author
table is unchanged.

**Nesting.** A word belongs to its innermost passage, as in ADR-0003 and ADR-0006, so
nested text is counted once. An AI word takes the review state of that innermost
passage only. A review on an enclosing AI passage does not cover a nested AI passage
that has no review of its own; this matches the editor tint, the PDF colour and the
margin bars, which also follow the innermost passage. Malformed or orphaned metadata
grants no review (ADR-0015), so those words are unreviewed.

**Typeset counts (PDF).** The LuaLaTeX package counts typeset words by state in the
same shipout pass as the attribution counts, with the same word definition
(ADR-0006): a word counts for the passage of its first letter or digit; the summary,
the progress table and the legend are excluded. The totals are written to the `.aux`
file as a separate `\AuthorshipSetReviewProgress{reviews=…|unreviewed=…|reviewed=…|
revised=…|changed=…}` line, so readers of `\AuthorshipSetSummary` (including the
submission cleanup of ADR-0019) are unaffected. `reviews` is the number of passages
with valid review metadata met in that run.

`\AuthorshipSummary` and `\AuthorshipSummaryFullWidth` append an *AI review progress
(typeset words)* table, before the legend, only when the previous run met review
metadata and AI-origin words. Documents without reviews keep their output (ADR-0008).
`\AuthorshipReviewProgress` prints the table on request, also without reviews. Like the
summary, it lags one run behind. Hidden mode and pdfLaTeX print nothing.

**Source estimate (editor).** The status-bar tooltip and *Show Authorship Statistics*
show *AI review progress (source estimate, words)* for the current file when it has
AI-origin words. The editor counts words in the source, between `\begin{document}` and
`\end{document}` when present: comments, marker and metadata lines, control sequences
and the arguments of citation, reference, label, URL, file and environment commands
are dropped; a word is then a whitespace-separated run containing a letter or digit.
Review states come from the same fingerprint check that drives the tints.

The two are labelled differently on purpose and are expected to differ: citation
labels, footnote marks, numbering and macro expansions exist only in the PDF;
optional arguments and maths source exist only in the source estimate.

## Consequences

The disclosure summary can state how much AI-origin text was reviewed, revised or has
changed since review, with numbers that reconcile with the author table. An outer
review does not raise the share of a nested AI passage; the writer reviews it
separately, as the tint already suggests. The editor reports one file at a time
(project-wide counts are a separate issue). Per-reviewer breakdowns are not included;
they can extend the aux line later without changing these four states.

## Alternatives considered

- **Inherit an enclosing review.** The outer fingerprint covers nested text, so an
  outer review could count for nested AI passages without their own review. Rejected
  for now because the counts would then disagree with the tint, colour and bars.
- **Extend `\AuthorshipSetSummary`.** Simpler aux, but the submission cleanup and other
  readers sum every entry, so review states would be counted as extra words.
- **Characters as well as words.** Cheap to add, but the issue asks for words, and a
  second column pair would crowd the summary in narrow layouts.
