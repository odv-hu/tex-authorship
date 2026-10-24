# Reliability checks

Use Node.js 22. Install locked dependencies with `npm ci`, then run:

```sh
npm test
npm run check
npm run check:release
python3 -B -m unittest discover -s test -p '*_test.py'
npm run test:integration
git diff --check
```

The release validator checks package.json, both lockfile root versions, the LaTeX
version/date and publisher without changing files. Pass an intended tag with
`npm run check:release -- vMAJOR.MINOR.PATCH` to enforce an exact match.

## Actual VS Code extension host

`test:integration` downloads VS Code 1.100.0 (the minimum supported version) into a
temporary cache. Set `VSCODE_TEST_VERSION=stable` to test the current stable release,
or `VSCODE_TEST_EXECUTABLE` to use a specific test executable. Linux CI uses Xvfb.

Each run uses a temporary workspace, settings profile, extension directory and
TEXMFHOME. Automatic LaTeX installation is disabled. It does not install into the
normal editor profile or personal TeX tree. The runner prints its retained log path.

Automated coverage: actual unmark and undo/redo commands; document-change events,
stale-review diagnostics and review removal; document colour providers and colour
presentations; theme changes and highlighting toggles. Theme smoke tests do not
establish visual readability. Interactive pickers and clipboard flows still need
manual coverage; mocked command tests remain useful alongside this suite.

## PDF regression runner

Install LuaLaTeX, pdfLaTeX and Poppler (`pdftoppm`), plus Python dependencies:

```sh
python3 -m pip install -r test/pdf-requirements.txt
npm run test:pdf
```

Use a virtual environment if required by your Python installation. Alternatively,
run `python3 test/pdf-regression.py --output /path/to/empty/directory`.
The runner copies the working package into an isolated temporary directory and uses
its own TeX cache. Logs, PDFs and PNG previews remain there for diagnosis.

It compares review metadata with the same document without review metadata,
checking glyph positions and attribution counts across ordinary, gradient,
citation-emphasis, natbib, hidden, pdfLaTeX and package-free variants. It also checks
stale warnings, review legends, footnotes, nested/included multi-page passages,
floats and full-width-summary counts. Comparisons stay within the same citation mode:
bold citation styling may legitimately change wrapping. These are semantic and
geometry checks, not pixel-perfect visual snapshots or a journal word-count audit.
Source-metadata coverage, more document classes and full-width layout assertions
remain follow-on work.

## Manual visual and interaction checklist

Before a release changing editor or PDF presentation:

- Test light and dark themes, word wrap on/off, long lines and nested passages.
  Unreviewed, Reviewed, Revised and stale passages must have readable tints/labels
  and no editor borders around text or wrapped lines.
- Mark and unmark passages, change reviewers, undo/redo, and toggle highlighting.
- Exercise normal paste options and explicit paste; select, search, cancel and
  reassign bibliography sources, including missing files and duplicate keys.
- Inspect rendered PDF previews: reviewer bars/legend, ordinary and hidden output,
  standard/natbib citations, footnotes and multi-page content. Check full-width
  summaries in single- and two-column documents and narrow margins.
- Record editor/TeX versions, tested cases and any failures. A passing command or
  unchanged glyph position alone is not proof that colours or bars look correct.

## CI and archive inspection

`checks.yml` runs unit/type/version checks, extension-host tests on minimum and
stable VS Code, and the PDF runner. It retains PDF previews/logs and failed editor
logs as Actions artifacts. The release workflow invokes these checks for its tag
before packaging and validates the resulting archives before publishing.

Run `python3 scripts/verify-artifacts.py dist` for locally built release pairs.
It checks archive contents, metadata, normal release channel and bundled sources
against this checkout. Use the exact intended source checkout; timestamp differences
between ZIP builds are not considered source differences. See [RELEASING.md](RELEASING.md).
