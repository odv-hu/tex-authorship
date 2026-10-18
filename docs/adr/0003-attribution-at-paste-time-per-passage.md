# 0003. Attribute at paste time, per passage; unmarked text is the owner's

Status: Accepted
Date: 2026-10-18

## Context

The owner writes in VS Code and pastes text from AI assistants and references by hand; no agent edits the files.
Tools that classify text automatically guess from typing speed and insert size, and report roughly 80–90% accuracy.
iA Writer tracks per character, which requires following every keystroke, undo and external edit.

## Decision

The writer says who wrote a piece of text at the moment it enters the file:

- After every paste, VS Code's paste options offer *Paste as <author>*; plain paste stays the default and counts as the owner's.
- *Paste as…* (⌘⌥V) and *Mark Selection as…* do the same explicitly.
- *Unmark Passage* removes a pair of markers when the owner considers the passage their own.

A marked passage stays attributed to its author until unmarked, even after the owner edits inside it.

## Consequences

- No guessing and no keystroke tracking; the record is exactly what the writer decided.
- A marked passage means "originated with this author, possibly edited by the owner".
- Character-level detail can be added later without changing the file format, by storing the original pasted text and comparing it with the current passage (see the roadmap).

## Alternatives considered

- **Per-character tracking in memory** (iA's model). Exact, but undo, formatters and external edits silently misplace it, and it needs several times the code.
- **Splitting a passage on every edit inside it.** Per-character in effect, but fills the file with markers.
- **Automatic detection.** Unreliable, and unnecessary when the writer pastes by hand.
