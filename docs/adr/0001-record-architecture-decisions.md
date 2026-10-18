# 0001. Record architecture decisions

Status: Accepted
Date: 2026-10-18

## Context

TeX Authorship was designed in one long working session.
Most of its shape comes from choices between plausible alternatives (where to store authorship, how fine-grained it is, how the PDF gets coloured).
Without a record, those reasons are lost and the alternatives get re-argued.

## Decision

Keep short architecture decision records in `docs/adr/`, one decision per file, numbered in order, in the format: context, decision, consequences, alternatives considered.
Planned work that is not yet decided lives in [`docs/roadmap.md`](../roadmap.md).

## Consequences

A decision that changes gets a new record marked "Supersedes 000N", and the old one is marked "Superseded by".
