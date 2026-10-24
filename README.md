<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/logo-dark.png">
    <img alt="TeX Authorship" src="images/logo.png" width="480">
  </picture>
</p>

<p align="center"><a href="https://doi.org/10.5281/zenodo.23607060">DOI: 10.5281/zenodo.23607060</a></p>

```The tool is built for our own writing, it is maintained as we need it.```

Authorship tracking for LaTeX in VS Code.
Mark text you paste in as written by your AI assistant (Claude, ChatGPT, Gemini, etc.), taken from a reference, or written by a co-author.
Marked passages get a tinted background in the editor, and a coloured LuaLaTeX draft PDF shows the same split.
Your own text stays plain.
Inspired by iA Writer's Authorship feature; an independent project, not affiliated with iA.
Developed by Balázs Fürtön with AI coding assistance (Claude); the commit history records which changes were made with it.

The record is a pair of comment lines around each passage, so it travels with the file:
formatters, undo, git and other editors all keep it intact, and LaTeX ignores it.

```latex
The linear thermal transmittance of the junction is
%[&AI: Claude]
dominated by the two-dimensional heat flux around the slab edge, where $\psi$ captures%
%[/&AI: Claude]
. This sentence is mine again.
```

| Prefix | Meaning | Default colour |
|---|---|---|
| `&` | AI | magenta (optional gradient in the PDF) |
| `@` | human co-author | blue |
| `*` | reference / quoted material | grey |
| *(no marker)* | you | unchanged |

The prefixes follow iA Writer's [Markdown Annotations](https://github.com/iainc/Markdown-Annotations), so a later converter to iA's format should be easy to implement.

## Install

**VS Code extension.**
Search "TeX Authorship" in VS Code's Extensions panel.
Or download `tex-authorship-<version>.vsix` from Releases and run *Extensions: Install from VSIX…* from the Command Palette.
Needs VS Code 1.100 or newer.

**LaTeX package.**
The extension installs it for you: on startup it puts `authorship.sty` and `authorship.lua` in your personal TeX folder (`~/Library/texmf/tex/latex/authorship/` on macOS, `~/texmf/…` on Linux) and keeps them up to date when the extension updates.
Every document on your computer can then just say:

```latex
\usepackage{authorship}            % coloured under LuaLaTeX, does nothing under pdfLaTeX
```

A copy of the two files next to a document takes precedence over the installed one, which is how to freeze a version for one paper.
To install by hand, copy both files from `latex/` into that folder.

**Shared papers and submissions.**
Co-authors on Overleaf and journal systems compile without your TeX folder.
Run *Authorship: Copy LaTeX Package into This Project* to include the two files with the paper, or guard the line so the paper compiles without them (the markers stay comments):

```latex
\IfFileExists{authorship.sty}{\usepackage{authorship}}{%
  \providecommand\AuthorshipOwner[1]{}\providecommand\AuthorshipColor[2]{}%
  \providecommand\AuthorshipGradient[2]{}\providecommand\AuthorshipSummary{}}
```

## Use

**Pasting.** Paste as usual (⌘V).
A small paste-options button appears next to the pasted text: click it, or press ⌘. (Ctrl+. on Windows/Linux), and choose *Paste as AI: Claude*, *Paste as Reference* and so on.
If you ignore it, the paste stays plain and counts as yours.
To choose before pasting, use **⌘⌥V** (Ctrl+Alt+V) or right-click → *Paste as…*.

**Existing text.** Select it, right-click → *Mark Selection as…*.

**Reference sources.** When you choose a reference author in *Mark Selection as…*
or explicit *Paste as…*, a second picker searches citation keys, authors, years
and titles from the document's bibliography. Choose an entry, or choose
*Reference without a source*. Selecting a source **does not insert a citation**;
add `\cite{key}` separately when needed.

The extension follows `% !TeX root = ../main.tex`, or discovers the main file
through literal `\input{...}` and `\include{...}` links. It reads
`\bibliography{one,two}` and `\addbibresource[options]{file.bib}` from that
project, including unsaved editor buffers. Paths resolve from the main file's
folder. If several roots match, choose one. For macros, custom build directories
or missing declarations, use *Choose bibliography files…* in the picker.
Manual choices apply to that selection only. Missing files and duplicate keys
are shown under *Bibliography warnings*; duplicate keys cannot be selected.

After the normal paste-options button's *Paste as Reference*, put the cursor
inside the passage and use **Authorship: Associate Reference Source…** from the
context menu or Command Palette. This also changes or removes an existing source.
Source information stays in a readable comment alongside the original markers:

```latex
%[*Reference]
% authorship-source: {"version":1,"citekey":"smith2024"}
Text from the source.
%[/*Reference]
```

Reference colours and attribution totals keep their existing meaning. Removing
an association leaves the reference attribution intact; *Unmark Passage* removes
both. Cancelling a picker leaves the text unchanged. This does not automatically
add an uncited source to the printed bibliography.

**Reviewing AI passages.** Put the cursor inside an AI passage and choose
*Authorship: Mark AI Passage as Reviewed…* or *Mark AI Passage as Revised…*.
Choose the reviewer: the document owner is offered first, followed by configured
human co-authors. Reviewed means read and accepted, with at most minor edits;
Revised means edited but still based on the AI text. Both retain AI attribution.

Current reviews soften the AI tint. The editor shows the status and reviewer name
beside the opening marker and on hover, without borders around text lines. In the
PDF, a single bar means Reviewed and a double bar means Revised; the authorship
summary includes a reviewer legend. `\AuthorshipReviewLegend` prints the legend
on its own. Bars mark affected lines, including lines shared with other text;
very narrow margins or gutters may need layout adjustment.

A readable `% authorship-review: {...}` comment stores the reviewer, state,
colour and a fingerprint of the passage. Editing the source makes the review
stale: the original AI colour returns, with “Changed since review” in the editor
and a short bar in the PDF. Re-run the review command to confirm the updated text.
Changes to external macro definitions or included files are not detected by this
fingerprint. Save the document before comparing editor and PDF review states.

*Remove AI Passage Review* removes the review only. *Unmark Passage* removes the
AI markers and review together when you consider the text fully rewritten.
Reviewer names/colours are snapshots; later owner changes do not rewrite them.
Hidden mode and pdfLaTeX omit review display. Update both package files for PDF
support; old packages ignore these comments safely. Review does not certify
factual accuracy or change the AI-origin word/character totals.

**Making a passage yours.** Once you've rewritten a Claude passage enough, put the cursor inside it, right-click → *Unmark Passage*.
The two marker lines are removed and the text stays as it is.

**Status bar.** Shows your share and each author's share of the file, counting visible characters and skipping comments and the preamble.
Click it for the exact numbers.

**Coloured PDF.** Your normal pdfLaTeX build stays as it is.
When you want the coloured draft, run *Authorship: Build Coloured Draft (LuaLaTeX)*, or pick LaTeX Workshop's `latexmk (lualatex)` recipe yourself. 
By default, line and page breaks are identical to the uncoloured build: colour is applied after TeX has laid out each page.
The optional `citations` emphasis uses bold type and can change line wrapping.

Package options:

```latex
\usepackage[gradient]{authorship}               % AI text in a magenta → orange → violet gradient
\usepackage[hide]{authorship}                   % switch colouring off without removing markers
\usepackage[citations]{authorship}              % bold red citations in the coloured draft
\AuthorshipColor{AI: Claude}{0.10 0.55 0.45}    % RGB 0–1, by label…
\AuthorshipColor{AI: ChatGPT}{#7a3cff}          % …or hex, same as in the VS Code settings
\AuthorshipColor{human}{0.2 0.3 0.9}            % …or by kind: ai, human, reference
\AuthorshipGradient{AI: Gemini}{#e6157f, #2f6fdd}            % a gradient for one author: two or more colours
\AuthorshipGradient{AI: ChatGPT}{0.18 0.80 0.44; 0 0.7 0.7}  % numbers work too; separate with ; then
```

Your own text is called "Mine" by default.
To use your name in the summary table, the status bar and the paste menu:

```latex
\AuthorshipOwner{John Doe}
```

VS Code reads this line too (from the file itself or a `.tex` file in a folder above it).
For files without it, the `texAuthorship.ownerName` setting is used.

`[gradient]` gives every AI author the default magenta → orange → violet gradient; `\AuthorshipGradient` gives one author its own. For each author, the last `\AuthorshipColor` or `\AuthorshipGradient` line wins.

VS Code shows a colour swatch in front of each `\AuthorshipColor` value and each `\AuthorshipGradient` stop.
Click it to open a colour picker; the value is rewritten in the same format (hex or decimal) it was written in.

The editor tint follows these lines too, so the editor and the PDF match.
Colours are looked up in the same order as in the PDF: exact author, then label, then kind.
`\AuthorshipColor` lines in the current file come first, then those in `.tex` files in the same folder or any folder above it (so a colour set in `main.tex` also applies while you edit `chapters/intro.tex`).
Only when none of these sets a colour does the `color` from the VS Code settings apply.

`\AuthorshipSummary` prints a table of characters and words per author, with shares and a total row, from the previous LuaLaTeX run.
A colour square in front of each author works as a legend.
It's handy for an AI-use disclosure.
Counts come from the PDF: characters are letters, digits and symbols without spaces. 
A word is a run of characters between spaces, and a hyphenated word split across lines counts once.
Headings, captions, running heads and the bibliography count too, so "Mine" is slightly generous.
The summary table itself is left out.

For a summary spanning the text width directly after the references, replace
your summary heading and `\AuthorshipSummary` with:

```latex
\AuthorshipSummaryFullWidth % immediately before \end{document}, after references
```

This includes the heading “Authorship summary”; use
`\AuthorshipSummaryFullWidth[Your heading]` to change it, or `[]` to omit it.
The heading and table are excluded from counts. The block appears where called;
if it does not fit, it moves to the next page. Two-column documents switch to a
fresh single-column page.
Use it at document level, outside lists, boxes, floats and `multicols`.
The table must fit on one page. Hidden mode and pdfLaTeX omit it entirely.
The existing `\AuthorshipSummary` keeps its inline layout.

## Settings

| Setting | Default | |
|---|---|---|
| `texAuthorship.authors` | AI: Claude, Reference | Authors offered in menus: `label`, `kind` (`ai`, `human`, `reference`), `color` |
| `texAuthorship.ownerName` | `Mine` | Name for your own text when no `\AuthorshipOwner` line sets one |
| `texAuthorship.highlight` | `true` | Tint marked passages (also: *Authorship: Toggle Highlighting*) |
| `texAuthorship.backgroundOpacity` | `0.14` | Strength of the tint |
| `texAuthorship.markerOpacity` | `0.4` | How faded the marker lines are |
| `texAuthorship.installLatexPackage` | `true` | Keep the LaTeX package installed and up to date in your personal TeX folder (also: *Authorship: Install LaTeX Package for All Documents*) |
| `texAuthorship.draftRecipe` | `latexmk (lualatex)` | LaTeX Workshop recipe for the coloured draft |

Adding a co-author:

```json
"texAuthorship.authors": [
  { "label": "AI: Claude", "kind": "ai", "color": "#e0218a" },
  { "label": "Reference", "kind": "reference", "color": "#8a8a8a" },
  { "label": "Anna", "kind": "human", "color": "#2f6fdd" }
]
```

## How it works and its limits

- **Marking is per passage, not per character.** Edits you make inside an AI (e.g. Claude) passage stay attributed to that AI until you unmark it.
Treat a marked passage as "AI-originated, possibly edited by me".
- Markers sit on their own lines. Where a line break would add a space TeX didn't have before, the extension ends the line with `%`, so the PDF reads exactly as if you had pasted inline.
- Markers can't go inside `verbatim`, `lstlisting`, `minted` and similar environments, where `%` isn't a comment.
The extension refuses to put them there.
- Unmatched or mismatched markers show up as warnings in the Problems panel.
- In the PDF, LuaLaTeX reads each marker line before TeX discards the comment and tags every character in the passage with its author.
Footnotes and floats keep their colour wherever they land. Running heads and page numbers stay black.
- Text coloured explicitly (`\textcolor`) inside a marked passage keeps its own colour.

## Related tools

Nothing else we know of combines LaTeX in VS Code, marking at paste time and a coloured PDF, but several tools cover part of it:

- [iA Writer](https://ia.net/writer/support/editor/authorship) is the original: authorship for Markdown, stored as character ranges at the end of the file ([Markdown Annotations](https://github.com/iainc/Markdown-Annotations)).
- [Authorship for Obsidian](https://www.obsidianstats.com/plugins/authorship) brings iA's format to Obsidian, with typed, pasted and AI text highlighted in Markdown notes.
- [AI Co-Authoring Tracker](https://marketplace.visualstudio.com/items?itemName=CodeMaman.ai-coauthoring-tracker) classifies each character in VS Code as typed, AI or pasted by timing heuristics and reports it in commit messages; aimed at code.
- [DifAI](https://marketplace.visualstudio.com/items?itemName=Ph03n1x.difai), [Provenance Code History](https://marketplace.visualstudio.com/items?itemName=lucastaylr.code-provenance) and [Code Measure](https://marketplace.visualstudio.com/items?itemName=AIvsHumanCodeMeasure.code-measure) track AI-generated code in VS Code.
- [git-ai](https://usegitai.com/docs/cli/how-git-ai-works) has coding agents record the lines they write, stored in git notes.
- The [changes](https://ctan.org/pkg/changes) LaTeX package colours text per author with commands like `\added[id=BF]{…}`, for revisions between co-authors.
- [aidisclose.org](https://aidisclose.org/) writes an AI-use disclosure statement in LaTeX; it pairs well with `\AuthorshipSummary`.

How TeX Authorship differs:
it works on LaTeX, keeps the record as comment lines inside the file (so formatters, undo, git and other editors can't misplace it), asks you at paste time instead of guessing from typing speed, and carries the same colours into the PDF with a per-author summary.

## Development

Shared agent instructions are in [AGENTS.md](AGENTS.md). For versioned artifacts and release preparation, follow [docs/RELEASING.md](docs/RELEASING.md).

```sh
npm ci              # use Node.js 22
npm test            # unit and mocked-command tests
npm run check       # type-check against the VS Code API
npm run check:release # validate paired package versions
npm run test:integration # isolated real VS Code tests
npm run test:pdf     # requires TeX, Poppler and Python dependencies
```

See [docs/TESTING.md](docs/TESTING.md) for dependencies, coverage and the manual visual checklist.

Open the folder in VS Code and press F5 to try it in a development window with `examples/sample.tex`.

Design decisions are recorded in [`docs/adr/`](docs/adr/), and likely next features in [`docs/roadmap.md`](docs/roadmap.md).

## Citing

If you use TeX Authorship in your work, cite it via Zenodo: [10.5281/zenodo.23607060](https://doi.org/10.5281/zenodo.23607060) always resolves to the latest version, and each release has its own DOI on the Zenodo record (version 0.1.13: [10.5281/zenodo.23607061](https://doi.org/10.5281/zenodo.23607061)). GitHub's "Cite this repository" button gives the same metadata from `CITATION.cff`.

### Citation emphasis

The opt-in `citations` option makes standard `\cite` and natbib citations (`\citep`, `\citet`, `\citealt`, `\citealp`, `\citeauthor`, `\citeyear`, `\citeyearpar`) bold red, including their punctuation and optional notes. Red takes precedence over author colours and gradients; attribution counts still belong to the surrounding author. Hyperlinks remain active. `[hide]` and pdfLaTeX retain normal citation styling. Biblatex-specific commands are not covered.

Override the citation colour in the preamble (red is the default):

```latex
\AuthorshipCitationColor{#ff0000}
```

The extension shows a colour swatch beside this value; click it to open the colour picker, just as for author colours. Hex and RGB triples such as `1 0 0` are supported. This changes citation emphasis only, retaining bold type and author attribution. Requires the `citations` option; hidden mode remains unchanged.
