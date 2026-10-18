<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/logo-dark.png">
    <img alt="TeX Authorship" src="images/logo.png" width="480">
  </picture>
</p>

iA Writer-style authorship for LaTeX in VS Code. Mark text you paste in as written by Claude, taken from a reference, or written by a co-author. Marked passages get a tinted background in the editor, and a coloured LuaLaTeX draft PDF shows the same split. Your own text stays plain.

The record is a pair of comment lines around each passage, so it travels with the file: formatters, undo, git and other editors all keep it intact, and LaTeX ignores it.

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

The prefixes follow iA Writer's [Markdown Annotations](https://github.com/iainc/Markdown-Annotations), so a later converter to iA's format would be straightforward.

## Install

**VS Code extension.** Download `tex-authorship-<version>.vsix` (from Releases, or build it with `npm run package`), then in VS Code: Command Palette → *Extensions: Install from VSIX…*. Needs VS Code 1.100 or newer.

**LaTeX package.** Open a `.tex` file and run *Authorship: Copy LaTeX Package into This Project*. That puts `authorship.sty` and `authorship.lua` next to your file. Then add to the preamble:

```latex
\usepackage{authorship}            % coloured under LuaLaTeX, does nothing under pdfLaTeX
```

To use it in every project instead, copy both files from `latex/` to `~/Library/texmf/tex/latex/authorship/` (macOS) or `~/texmf/tex/latex/authorship/` (Linux).

## Use

**Pasting.** Paste as usual (⌘V). A small paste-options button appears next to the pasted text: click it, or press ⌘. (Ctrl+. on Windows/Linux), and choose *Paste as AI: Claude*, *Paste as Reference* and so on. If you ignore it, the paste stays plain and counts as yours. To choose before pasting, use **⌘⌥V** (Ctrl+Alt+V) or right-click → *Paste as…*.

**Existing text.** Select it, right-click → *Mark Selection as…*.

**Making a passage yours.** Once you've rewritten a Claude passage enough, put the cursor inside it, right-click → *Unmark Passage*. The two marker lines are removed and the text stays as it is.

**Status bar.** Shows your share and each author's share of the file, counting visible characters and skipping comments and the preamble. Click it for the exact numbers.

**Coloured PDF.** Your normal pdfLaTeX build stays as it is. When you want the coloured draft, run *Authorship: Build Coloured Draft (LuaLaTeX)*, or pick LaTeX Workshop's `latexmk (lualatex)` recipe yourself. Line and page breaks are identical to the uncoloured build: colour is applied after TeX has laid out each page.

Package options:

```latex
\usepackage[gradient]{authorship}  % AI text in a magenta → orange → violet gradient
\usepackage[hide]{authorship}      % switch colouring off without removing markers
\AuthorshipColor{AI: Claude}{0.10 0.55 0.45}   % RGB 0–1, by label…
\AuthorshipColor{AI: ChatGPT}{#7a3cff}         % …or hex, same as in the VS Code settings
\AuthorshipColor{human}{0.2 0.3 0.9}           % …or by kind: ai, human, reference
```

Your own text is called "Mine" by default. To use your name in the summary table, the status bar and the paste menu:

```latex
\AuthorshipOwner{Balázs Fürtön}
```

VS Code reads this line too (from the file itself or a `.tex` file in a folder above it). For files without it, the `texAuthorship.ownerName` setting is used.

VS Code shows a colour swatch in front of each `\AuthorshipColor` value. Click it to open a colour picker; the value is rewritten in the same format (hex or decimal) it was written in.

The editor tint follows these lines too, so the editor and the PDF match. Colours are looked up in the same order as in the PDF: exact author, then label, then kind. `\AuthorshipColor` lines in the current file come first, then those in `.tex` files in the same folder or any folder above it (so a colour set in `main.tex` also applies while you edit `chapters/intro.tex`). Only when none of these sets a colour does the `color` from the VS Code settings apply.

`\AuthorshipSummary` prints a table of characters and words per author, with shares and a total row, from the previous LuaLaTeX run. A colour square in front of each author works as a legend. It's handy for an AI-use disclosure. Counts come from the PDF: characters are letters, digits and symbols without spaces; a word is a run of characters between spaces, and a hyphenated word split across lines counts once. Headings, captions, running heads and the bibliography count too, so "Mine" is slightly generous. The summary table itself is left out.

## Settings

| Setting | Default | |
|---|---|---|
| `texAuthorship.authors` | AI: Claude, Reference | Authors offered in menus: `label`, `kind` (`ai`, `human`, `reference`), `color` |
| `texAuthorship.ownerName` | `Mine` | Name for your own text when no `\AuthorshipOwner` line sets one |
| `texAuthorship.highlight` | `true` | Tint marked passages (also: *Authorship: Toggle Highlighting*) |
| `texAuthorship.backgroundOpacity` | `0.14` | Strength of the tint |
| `texAuthorship.markerOpacity` | `0.4` | How faded the marker lines are |
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

- **Marking is per passage, not per character.** Edits you make inside a Claude passage stay attributed to Claude until you unmark it. Treat a marked passage as "Claude-originated, possibly edited by me".
- Markers sit on their own lines. Where a line break would add a space TeX didn't have before, the extension ends the line with `%`, so the PDF reads exactly as if you had pasted inline.
- Markers can't go inside `verbatim`, `lstlisting`, `minted` and similar environments, where `%` isn't a comment. The extension refuses to put them there.
- Unmatched or mismatched markers show up as warnings in the Problems panel.
- In the PDF, LuaLaTeX reads each marker line before TeX discards the comment and tags every character in the passage with its author. Footnotes and floats keep their colour wherever they land. Running heads and page numbers stay black.
- Text coloured explicitly (`\textcolor`) inside a marked passage keeps its own colour.

## Development

```sh
npm install
npm test            # marker logic unit tests
npm run check       # type-check against the VS Code API
npm run package     # build the .vsix
```

Open the folder in VS Code and press F5 to try it in a development window with `examples/sample.tex`.
