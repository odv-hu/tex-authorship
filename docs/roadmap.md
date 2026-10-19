# Roadmap

Features likely to be needed, roughly in order.
Nothing here is decided; when something is, it gets an [ADR](adr/README.md).

## Next

### Localised summary labels
Configurable column titles and "Total" (e.g. Szerző, Karakterek, Szavak, Összesen), for documents not written in English.

### Release hygiene
A `CHANGELOG.md`, compiling `examples/sample.tex` with LuaLaTeX and pdfLaTeX in the release workflow, Marketplace publishing without a personal access token (Microsoft retires global Azure DevOps tokens on 1 December 2026; the replacement is Entra ID workload identity federation), and a `CITATION.cff` (with ORCID) so the repository can be cited; Zenodo can then archive releases with a DOI.

## Git-based authorship

For documents written with co-authors in a shared repository, unmarked text should belong to whoever wrote it, not automatically to the owner.
Markers keep their role for what git cannot see (AI and reference text), so a passage could read "AI: ChatGPT, pasted by Anna".

Likely steps:

1. **Editor:** `git blame` (ignoring whitespace, following moved lines, honouring `.git-blame-ignore-revs` for reformatting commits) to tint co-authors' lines; uncommitted lines and the local `git config user.name` are the owner.
2. **Shared authors file** in the repository (email → display name, GitHub handle, colour), so every collaborator sees the same names and colours. GitHub handles filled in from no-reply emails or the GitHub API (`gh`).
3. **PDF:** before a LuaLaTeX build, the extension writes a small file listing each source line's author; the package already sees file names and line numbers as TeX reads them.
4. **Word-level origin** instead of line-level blame, by replaying the file's history word by word, if line blame proves too coarse.

Open question to settle first: does "author" mean the last person to change the text (what `git blame` reports) or the person who first wrote it?
Known limits: squash merges credit everything to one person; Overleaf's git integration may record a single identity; emails must not end up in the PDF.
[git notes](https://git-scm.com/docs/git-notes) (as used by git-ai) are an option for storing attribution alongside commits without touching the `.tex` files.

## Finer attribution inside passages

Store the original text of each paste (keyed by an id in the marker, e.g. `%[&AI: Claude #7f3a]`) and compare it with the current passage on demand.
Characters still matching the original stay with the pasted author; added or changed ones are the owner's.
This gives per-character colouring and figures like "62% of this passage is still Claude's original" without tracking keystrokes, and keeps the file format (see [ADR 0003](adr/0003-attribution-at-paste-time-per-passage.md)).

## Project-wide view in VS Code

The status bar counts the current file only.
A project view would sum all files reachable from the main file (`\input`, `\include`, LaTeX Workshop's root), closer to the PDF summary.

## Interoperability

- Import and export iA Writer's [Markdown Annotations](https://github.com/iainc/Markdown-Annotations), e.g. for text drafted in iA Writer or Obsidian and moved into LaTeX.
- A disclosure-statement helper: turn the summary numbers into a sentence for a journal's AI-use statement, possibly using the task categories from [aidisclose.org](https://aidisclose.org/).
- Publish the extension on the VS Code Marketplace and Open VSX; consider submitting the LaTeX package to CTAN (needs documentation in CTAN's format).

## Robustness and testing

- Integration tests that run inside a real VS Code (`@vscode/test-electron`) for the paste options, colour picker and decorations.
- PDF regression tests: compile the sample and compare text positions with colouring on and off.
- Known LaTeX gaps from [ADR 0005](adr/0005-pdf-colouring-in-luatex.md): `\textcolor` spanning a line break inside a passage, running heads inside `multicols`.
- Better detection of places where markers cannot go (`\verb`, `\url`, custom verbatim environments).

## Possibly

- An optional Claude Code hook that marks text an agent writes, if agents ever edit the documents.
- Colouring under pdfLaTeX via a preprocessing step, if LuaLaTeX drafts prove too different from pdfLaTeX output.
