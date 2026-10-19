# 0008. Install the LaTeX package into TEXMFHOME; keep the format backward compatible

Status: Accepted
Date: 2026-10-19

## Context

Every paper needed its own copy of `authorship.sty` and `authorship.lua`.
Copies were easy to forget or get wrong: a paper copied the example's `\usepackage{../latex/authorship}` line and stopped compiling.
TeX cannot fetch packages from the internet, and the extension's own install folder changes name with every version, so LaTeX cannot point at it.
Every TeX installation searches a personal folder, TEXMFHOME (`~/Library/texmf` with MacTeX, `~/texmf` with TeX Live on Linux), without needing a file database refresh.

## Decision

- On startup the extension asks `kpsewhich -var-value=TEXMFHOME` where that folder is (trying the usual install locations when TeX is not on VS Code's PATH, and falling back to TeX Live's default) and copies its bundled `authorship.sty` and `authorship.lua` to `TEXMFHOME/tex/latex/authorship/` whenever they differ.
- It reports only when something was installed or updated. The setting `texAuthorship.installLatexPackage` turns this off; the command *Install LaTeX Package for All Documents* runs it on demand.
- The `.sty` loads `authorship.lua` from its own folder (see [0005](0005-pdf-colouring-in-luatex.md)), so the pair always matches.
- *Copy LaTeX Package into This Project* stays, for papers shared with people or systems without the extension (Overleaf, journal submission). The README also gives a guarded `\IfFileExists` line that compiles without the package.
- **Compatibility rule:** the marker syntax ([0002](0002-inline-comment-markers.md)) and the documented commands and options (`\AuthorshipOwner`, `\AuthorshipColor`, `\AuthorshipSummary`, `show`, `hide`, `gradient`, `solid`) are only ever extended, never renamed or removed. An update of the installed package must keep every older document compiling with the same meaning.

## Consequences

- New papers need one line, `\usepackage{authorship}`, and no files.
- The installed package follows the extension version; a copy next to a document still wins (TeX searches the document's folder first), which is how to freeze a version for one paper.
- Behaviour changes that would alter older documents need a new option, not a changed default.

## Alternatives considered

- **Copies in every project.** The previous state; error-prone and drifts out of date.
- **Pointing LaTeX Workshop at the extension's folder** through environment variables. The folder name changes with every version, and other ways of building (terminal, latexmk) would not see it.
- **CTAN.** The right answer for everyone, including Overleaf, but slower and needs CTAN-style documentation; kept on the roadmap.
