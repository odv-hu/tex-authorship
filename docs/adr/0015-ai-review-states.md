# 0015. Separate human review from AI origin

Status: Accepted
Date: 2026-10-24

## Decision

Add explicit Reviewed and Revised states to existing AI passages, with a reviewer
picker defaulting to the document owner and offering configured human co-authors.
Reviewed means read and accepted (possibly with minor edits); Revised means edited
but still AI-originated. Neither state transfers authorship. Unmark remains the
separate action for fully rewritten text. A remove-review command retains AI
attribution and removes the review metadata only.

Persist one versioned JSON comment immediately after the opening AI marker. Store
`status`, `by` (the actual reviewer label), `color` (a hex snapshot) and `hash`.
The SHA-256 fingerprint covers the author key, a newline, and the source lines
inside the passage joined with LF; review comments are excluded, including nested
review comments. CRLF/LF conversion is harmless; all other source changes,
including whitespace, citations and nested text, require review again. No original
text copy or external sidecar is needed. The hash detects changes, not identity or
proof of human review. External macro definitions and included files are outside
its scope. Changing a review's reviewer/status alone does not stale an outer review.

The editor retains AI tint at 40% of its normal opacity for current reviews, adds
a reviewer-coloured border, and labels the opening marker with state and name.
Stale reviews use normal AI opacity, a dashed border, a “Changed since review”
label and a Problems warning. Malformed or orphaned metadata does not grant review.

LuaLaTeX validates metadata against the saved source before typesetting, including
passages spanning pages. It uses the existing lualibs JSON reader and LuaTeX SHA-2
support, loaded only for review comments. Unverifiable source is treated as stale;
invalid metadata is ignored with a warning. Reviewed AI glyph colours are mixed
55% toward white at shipout; citation emphasis keeps its existing priority.
Margin bars are zero-net-width additions to affected text lines: single for
Reviewed, double for Revised, short for changed-since-review. Multiple reviewers
on a line get separate bars. These bars indicate affected lines, not precise
character ranges. They can intrude into narrow gutters or existing marginalia.
No output routine or line-breaking algorithm is replaced.

Both summary commands append a textual reviewer/state legend when reviews have
been encountered. `\AuthorshipReviewLegend` prints this legend independently.
The legend and bars are excluded from counts; attribution tables remain per
origin, not reviewer. Hide mode/pdfLaTeX ignore review comments and the legend
command. Old packages safely ignore the new comments but cannot display reviews.
The editor and package should be updated together for consistent display.

## Consequences

Review is explicit per passage and stored with the source. Edits produce a derived
stale state, never silently clear the old reviewer or transfer authorship. The
reviewer name and colour are snapshots; renaming the owner later does not rewrite
history. Re-review records the current choice and source fingerprint. The UI is
not an identity-verification mechanism. These opt-in annotations extend the public
format without changing existing documents (ADR-0008).

Source files must remain available during compilation. Generated/macro-expanded
input or markers spanning files may not be verifiable and should be reviewed as
separate literal passages. PDF colour mixing assumes a white page, as the existing
colour palette does. Actual extension-host appearance/undo testing remains a
manual check; automated command tests use a VS Code API stub.
