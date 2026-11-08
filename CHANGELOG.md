# Changelog

User-visible changes to the TeX Authorship extension and its LaTeX package, newest
first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
each version matches a `vMAJOR.MINOR.PATCH` tag. The section for a version becomes
the notes of its GitHub release, so write entries for users, not for contributors.
Versions before 0.1.20 are listed on the
[GitHub releases page](https://github.com/odv-hu/tex-authorship/releases).

## [Unreleased]

### Added

- Review progress for AI-origin words. When a document contains reviewed or revised
  AI passages, `\AuthorshipSummary` and `\AuthorshipSummaryFullWidth` add a table of
  AI-origin words that are unreviewed, reviewed, revised, or changed since review;
  the rows add up to the AI words in the author table, and reviewing still moves no
  words to the reviewer. `\AuthorshipReviewProgress` prints the table on its own.
  Documents without reviews keep their current summary.
- The status-bar tooltip and *Show Authorship Statistics* show the same split for
  the current file as a source-based word estimate.

### Changed

- GitHub release notes now come from this changelog instead of the list of commits
  since the previous tag.

## [0.1.22] - 2026-10-24

### Added

- *Authorship: Remove Authorship from This Document* prepares a submission copy in
  one undoable edit. It removes passage markers, source and review metadata,
  loading of the `authorship` package, owner and colour settings, summary commands
  and the review legend. In a main document it adds a plain *Document counts* table
  (total words and characters excluding spaces) from the last LuaLaTeX build, before
  `\end{document}`. Missing or incomplete counts stop the operation.
- *Authorship: Restore Authorship from Git History* recovers the current file from
  the parent of a commit whose message contains **Removed Authorship**. You can
  open the recovered copy separately or replace the current buffer in one undoable
  edit. Git history is not changed and nothing is saved automatically.

## [0.1.21] - 2026-10-24

### Changed

- In LaTeX editors, Cut, Copy, Paste and the authorship commands (*Paste as…*,
  *Mark Selection as…*, *Unmark Passage*, *Associate Reference Source…* and the
  review commands) now appear at the top of the right-click menu. The new
  clipboard entries run VS Code's own clipboard commands, so paste options still
  appear after pasting.
- Releases now stop before packaging if the tag, the extension version and the
  LaTeX package version disagree, and the VSIX and LaTeX ZIP are checked against
  the tagged source before publication. Published release assets are never
  replaced.

## [0.1.20] - 2026-10-24

### Removed

- The coloured line borders beside reviewed and revised AI passages in the editor.
  Reviews still soften the AI tint, and the review status and reviewer name still
  appear beside the opening marker and on hover. Review bars in the PDF are
  unchanged.

[Unreleased]: https://github.com/odv-hu/tex-authorship/compare/v0.1.22...HEAD
[0.1.22]: https://github.com/odv-hu/tex-authorship/compare/v0.1.21...v0.1.22
[0.1.21]: https://github.com/odv-hu/tex-authorship/compare/v0.1.20...v0.1.21
[0.1.20]: https://github.com/odv-hu/tex-authorship/compare/v0.1.19...v0.1.20
