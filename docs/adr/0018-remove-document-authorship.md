# 0018. Explicit, undoable document authorship removal

Status: Accepted
Date: 2026-10-24

## Context

Writers may keep attribution during drafting but need a source document without
tracking syntax or the printed summary. Hidden mode only changes PDF display.

## Decision

Add a Command Palette action, `texAuthorship.stripDocument`, that cleans the
active TeX buffer in a single undoable editor edit. Remove marker and metadata
lines, package loading, configuration commands, summary commands and the review
legend. Retain passage content, citations, other packages and TeX comment joins.
Parse balanced arguments rather than removing arbitrary lines. Preserve literal
examples and ordinary comments. Recognise the documented optional-package guard
only when its branches contain no unrelated content after cleanup. Fail without
editing for unsupported authorship commands or malformed arguments.

This is opt-in and does not change package behaviour or existing commands
(ADR-0008). No automatic save, project traversal, file deletion or installation
is involved. Included files require separate invocation. Custom macros,
handwritten summary headings and surrounding layout require manual review;
arbitrary TeX expansion is outside the command's scope.

## Alternatives

Hidden mode leaves source attribution and the package dependency in place.
Automatic project-wide removal would require a separate workflow for ambiguous
roots, includes, unsaved files and undo across multiple documents.
