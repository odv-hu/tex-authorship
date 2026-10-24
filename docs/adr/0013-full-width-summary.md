# 0013. Opt-in full-width summary in document flow

Status: Accepted
Date: 2026-10-24

## Decision

Add `\AuthorshipSummaryFullWidth[<heading>]` for use at document level after
references. The owner clarified that the summary should appear directly after
references, not at the page bottom. The existing `\AuthorshipSummary` retains
its inline layout (ADR-0008).

The new command stretches the table to the text width and keeps heading and
rows together. Its default heading is “Authorship summary”; an empty optional
argument omits it. The entire block is excluded from attribution counts,
including the heading. Hide mode and pdfLaTeX consume the command and its optional
argument without producing output.

## Consequences

This is an in-flow block, not a footer or float. If it does not fit, TeX moves
it to a following page. Two-column documents switch to a fresh single-column
page to provide full width without replacing the class output routine; use it
at the end of the document. Arbitrary two-column journal classes cannot be
promised a same-page full-width insertion.

Use outside lists, boxes, floats and `multicols`. The table must fit on one page;
very long author names can still exceed its width. No marker, colour, citation
or counting semantics change. No release or installation is part of this change.
