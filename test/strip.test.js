'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {stripAuthorship:strip} = require('../src/strip');

test('remove markers and metadata including unmatched markers, preserving joins and paragraphs', () => {
  const source = 'Before%\r\n%[&AI: Claude]\r\n% authorship-review: invalid\r\nText%\r\n%[/&AI: Claude]\r\nafter.\r\n\r\n% authorship-source: {}\r\n%[*Reference]\r\nEnd';
  assert.equal(strip(source),'Before%\r\nText%\r\nafter.\r\n\r\nEnd');
});
test('remove settings, nested arguments and both summary layouts', () => {
  const source = String.raw`\usepackage[hide]{authorship}
\AuthorshipOwner{A {B}}
\AuthorshipColor{ai}{1 0 0}
\AuthorshipGradient{ai}{red, blue}
\AuthorshipCitationColor{red}
Text\AuthorshipSummary{}.
\AuthorshipSummaryFullWidth[An {optional]} heading]
\AuthorshipReviewLegend
`;
  assert.equal(strip(source), 'Text{}.\n');
});
test('package lists, relative paths, multiline commands, options and version', () => {
  assert.equal(strip(String.raw`\usepackage[foo]{x,authorship,y}`), String.raw`\usepackage[foo]{x,y}`);
  assert.equal(strip('\\RequirePackage\n[hide]\n{../latex/authorship}[2026/10/24]\nText'), 'Text');
  assert.equal(strip(String.raw`\PassOptionsToPackage{hide}{authorship}`), '');
});
test('documented optional package guard and fallback definitions disappear', () => {
  const source = String.raw`\IfFileExists{authorship.sty}{\usepackage{authorship}}{%
  \providecommand\AuthorshipOwner[1]{}\providecommand\AuthorshipColor[2]{}%
  \providecommand\AuthorshipGradient[2]{}\providecommand\AuthorshipSummary{}}
Text`;
  assert.equal(strip(source),'Text');
  assert.throws(() => strip(String.raw`\IfFileExists{authorship.sty}{Important text}{}`));
});
test('literal examples, ordinary comments, escaped percent and citations remain intact', () => {
  const source = String.raw`% An ordinary comment: \AuthorshipSummary
\begin{verbatim}
%[&AI: Claude]
\usepackage{authorship}
\end{verbatim}
\verb|\AuthorshipSummary| \url{https://example.org/\AuthorshipSummary}
Cost 10\% \citep[see][p. 1]{key}.
`;
  assert.equal(strip(source),source);
});
test('malformed or unknown commands fail atomically and cleanup is idempotent', () => {
  for (const source of [String.raw`\AuthorshipOwner{broken`, String.raw`\AuthorshipUnknown{a}`]) assert.throws(() => strip(source));
  const clean = strip('\\AuthorshipSummary\nHello');
  assert.equal(strip(clean),clean);
});
