<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/logo-dark.png">
    <img alt="TeX Authorship" src="images/logo.png" width="480">
  </picture>
</p>

```The tool is built for our own writing, it is maintained as we need it.```

iA Writer-style authorship for LaTeX in VS Code.
Mark text you paste in as written by your AI assistant (Claude, ChatGPT, Gemini, etc.), taken from a reference, or written by a co-author.
Marked passages get a tinted background in the editor, and a coloured LuaLaTeX draft PDF shows the same split.
Your own text stays plain.

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
Search "TeX Authorship" in VS Code's Extensions panel (it is a pre-release, so choose *Install Pre-Release Version* if asked).
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
  \providecommand\AuthorshipOwner[1]{}\providecommand\AuthorshipColor[2]{}\providecommand\AuthorshipSummary{}}
```

## Use

**Pasting.** Paste as usual (⌘V).
A small paste-options button appears next to the pasted text: click it, or press ⌘. (Ctrl+. on Windows/Linux), and choose *Paste as AI: Claude*, *Paste as Reference* and so on.
If you ignore it, the paste stays plain and counts as yours.
To choose before pasting, use **⌘⌥V** (Ctrl+Alt+V) or right-click → *Paste as…*.

**Existing text.** Select it, right-click → *Mark Selection as…*.

**Making a passage yours.** Once you've rewritten a Claude passage enough, put the cursor inside it, right-click → *Unmark Passage*.
The two marker lines are removed and the text stays as it is.

**Status bar.** Shows your share and each author's share of the file, counting visible characters and skipping comments and the preamble.
Click it for the exact numbers.

**Coloured PDF.** Your normal pdfLaTeX build stays as it is.
When you want the coloured draft, run *Authorship: Build Coloured Draft (LuaLaTeX)*, or pick LaTeX Workshop's `latexmk (lualatex)` recipe yourself. 
Line and page breaks are identical to the uncoloured build: colour is applied after TeX has laid out each page.

Package options:

```latex
\usepackage[gradient]{authorship}               % AI text in a magenta → orange → violet gradient
\usepackage[hide]{authorship}                   % switch colouring off without removing markers
\AuthorshipColor{AI: Claude}{0.10 0.55 0.45}    % RGB 0–1, by label…
\AuthorshipColor{AI: ChatGPT}{#7a3cff}          % …or hex, same as in the VS Code settings
\AuthorshipColor{human}{0.2 0.3 0.9}            % …or by kind: ai, human, reference
```

Your own text is called "Mine" by default.
To use your name in the summary table, the status bar and the paste menu:

```latex
\AuthorshipOwner{John Doe}
```

VS Code reads this line too (from the file itself or a `.tex` file in a folder above it).
For files without it, the `texAuthorship.ownerName` setting is used.

VS Code shows a colour swatch in front of each `\AuthorshipColor` value.
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

```sh
npm install
npm test            # marker logic unit tests
npm run check       # type-check against the VS Code API
npm run package     # build the .vsix
```

Open the folder in VS Code and press F5 to try it in a development window with `examples/sample.tex`.

**Releasing.** Push a tag like `v0.1.9` (in Fork: right-click the commit → *New Tag…*, tick *Push*).
The [release workflow](.github/workflows/release.yml) runs the tests, builds the `.vsix` and the LaTeX zip, creates the GitHub release with notes from the commit messages since the previous tag, and publishes to the VS Code Marketplace.
The tag sets the version; odd minor versions (0.1.x) go out as pre-releases.
To repeat a release, run the workflow by hand from the Actions tab with the tag name.

Design decisions are recorded in [`docs/adr/`](docs/adr/), and likely next features in [`docs/roadmap.md`](docs/roadmap.md).
