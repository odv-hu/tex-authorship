# 0020. Take release notes from a required CHANGELOG.md section

Status: Accepted
Date: 2026-11-08

Extends the release gates of ADR-0017.

## Context

GitHub release notes listed every commit subject since the previous tag. Test,
documentation and release-preparation commits appeared next to user-visible
changes, and the notes could not be reviewed before the tag was pushed. There was
no changelog in the repository or on the Marketplace page.

## Decision

Keep a `CHANGELOG.md` in the Keep a Changelog format, with an *Unreleased* section
and one dated section per released version, back-filled from 0.1.20. Contributors
add user-visible changes to *Unreleased*; release preparation moves them into the
new version's section.

The release validator requires a single `## [VERSION] - YYYY-MM-DD` section with at
least one entry for the package version, so CI, the local check and the release
preflight fail without it. The release workflow uses that section, with hard-wrapped
lines joined, as the GitHub release notes, followed by the install instructions and
compare link. The packaged VSIX includes the changelog, and the archive inspection
checks it against the source.

## Consequences

Release notes are written and reviewed with the version bump, before tagging, and
the Marketplace shows a Changelog tab. A version bump without a changelog section
fails `npm run check:release` on every push. Notes for releases before 0.1.20 stay
on the GitHub releases page. Generating notes from commit messages, or keeping the
changelog optional, was rejected because neither separates user-visible changes
from development work.
