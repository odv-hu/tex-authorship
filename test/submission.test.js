'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {totalsFromAux,prepareSubmission} = require('../src/submission');

test('submission totals aggregate all authors and use the latest complete snapshot', () => {
  const aux = '\\AuthorshipSetSummary{Mine=1,1}\n\\AuthorshipSetSummary{Mine=80,15|&AI: Test=20,5|*Reference=10,2}';
  assert.deepEqual(totalsFromAux(aux),{characters:110,words:22});
  for (const invalid of ['', '\\AuthorshipSetSummary{Mine=10}', '\\AuthorshipSetSummary{Mine=1,2|bad}', '\\AuthorshipSetSummary{Mine=999999999999999999,1}']) {
    assert.throws(()=>totalsFromAux(invalid));
  }
});
test('plain static table appears at document end after references, with no attribution or dependency', () => {
  const source = String.raw`\documentclass{article}
\usepackage{authorship}
\begin{document}
%[&AI: Test]
Text.
%[/&AI: Test]
\AuthorshipSummaryFullWidth[Old summary]
\begin{thebibliography}{1}
\bibitem{a} Reference.
\end{thebibliography}
\end{document}
`;
  const clean = prepareSubmission(source, String.raw`\AuthorshipSetSummary{Mine=10,2|&AI: Test=20,4}`);
  assert.match(clean,/Words & 6/);
  assert.match(clean,/Characters \(excluding spaces\) & 30/);
  assert.ok(clean.indexOf('Document counts') > clean.indexOf('\\end{thebibliography}'));
  assert.ok(clean.indexOf('Document counts') < clean.indexOf('\\end{document}'));
  assert.doesNotMatch(clean,/authorship|Authorship|AI: Test|Old summary/);
});
test('footer ignores literal document ends, retains CRLF and rejects fragments', () => {
  const aux = String.raw`\AuthorshipSetSummary{Mine=10,2}`;
  const text = '\\begin{verbatim}\r\n\\end{document}\r\n\\end{verbatim}\r\n\\end{document}';
  const clean = prepareSubmission(text,aux);
  assert.ok(clean.indexOf('Document counts') > clean.indexOf('\\end{verbatim}'));
  assert.equal(clean.replace(/\r\n/g,'').includes('\n'),false);
  assert.throws(()=>prepareSubmission('Fragment',aux),/No document end/);
});
