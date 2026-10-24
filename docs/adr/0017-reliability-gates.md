# 0017. Validate tagged source and isolate reliability tests

Status: Accepted
Date: 2026-10-24

Supersedes the existing-release upload behaviour described in ADR-0011.

## Context

The release workflow silently changed the extension version to match a tag without
aligning the paired LaTeX package. Mocked editor tests also failed to establish that
review decorations were readable in an actual editor (ADR-0016). PDF comparisons
were previously one-off local checks.

## Decision

Reject inconsistent tag, package, lockfile and LaTeX versions before packaging.
Validate stable tag syntax, publisher and package date without rewriting sources.
Check archive metadata, allowed files and bundled sources before publication.
Fail when a GitHub release already exists; remove automatic asset replacement.
A partial publication requires explicit recovery rather than blindly rerunning it.

Add reusable CI checks invoked against the release tag: unit/type/version checks,
actual VS Code extension-host tests on the minimum and stable versions, and an
isolated PDF regression runner. Keep editor profiles, workspaces and TeX caches
separate from the owner's installation. Retain diagnostics and rendered previews.
Compare PDF counts and geometry within a mode, rather than assuming citation
emphasis cannot change layout. Keep a manual visual checklist for cases that the
automated suite does not inspect.

## Consequences

No marker, attribution or document-rendering behaviour changes. New test tooling
is development-only and excluded from the extension. Releases take longer and may
fail on a newly incompatible stable VS Code version, making that incompatibility
visible before publication. Local checks do not establish that the Linux CI run
passed. Builds preserve source contents; byte-identical ZIP timestamps are not a
goal. Broader picker, clipboard, source-metadata and layout coverage remains on the
roadmap. Silently correcting versions or relying only on mocks was rejected.
