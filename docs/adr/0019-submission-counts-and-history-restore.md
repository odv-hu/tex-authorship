# 0019. Submission totals and restoration from removal commits

Status: Accepted
Date: 2026-10-24

Extends ADR-0018; supersedes its removal of the summary without a replacement.

## Context

Submission source should omit attribution while retaining document totals.
Editor Undo is temporary; writers need a persistent restoration route and want
to manage commits themselves.

## Decision

The cleanup command adds a dependency-free, static total word/character table
before the main document's end. It reads the numeric snapshot from the main
LuaLaTeX auxiliary file, consistent with ADR-0006, rather than counting source.
It offers file selection for build-directory outputs. Missing or incomplete
counts abort cleanup; included fragments receive no table. Counts are explicitly
a snapshot: freshness depends on building the saved attributed draft first.
No package behaviour changes; no PDF author breakdown remains in the new table.

Add a restore command that searches the current branch's history for the exact
file path and commit messages containing “Removed Authorship” (case-insensitive).
The user chooses a commit, then either opens the first parent's file as an
unsaved recovered copy or replaces the entire current buffer in one undoable
edit. Detect buffer changes across asynchronous work. All Git access is read-only.
Do not auto-save, auto-commit, reset, switch branches, or merge historical markers
into later text. The attributed draft must be committed before removal.

## Limits and alternatives

File renames, other branches and multi-file transactions require manual recovery.
Whole-file recovery is explicit because merging passage attribution into edited
text can silently misattribute content. Automatic commits were rejected by the
user. A live counting package would retain a dependency in submission source;
fixed numeric totals avoid that dependency but need regeneration after edits.
