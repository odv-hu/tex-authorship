'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/bibliography');
const M = require('../src/markers');

test('BibTeX nested fields, strings, concatenation, dates, comments and exact keys', () => {
  const result = B.parseBib(String.raw`
% @book{ignored, title={No}}
@string{prefix = "Building "}
@preamble{"ignored"}
@comment{ arbitrary { nested } text }
@article{Smith:2024,
 author = {Smith, Jane and {Research Group}},
 title = prefix # {and {Environment}}, date = {2024-05-01}
}
@book(Other, title="A {Quoted} title", year=2020)
`, 'refs.bib');
  assert.deepEqual(result.warnings,[]);
  assert.equal(result.entries.length,2);
  assert.deepEqual(result.entries[0],{key:'Smith:2024',author:'Smith, Jane and Research Group',title:'Building and Environment',year:'2024-05-01',file:'refs.bib',line:6});
  assert.equal(result.entries[1].year,'2020');
});

test('malformed entries report locations and recover at subsequent entries', () => {
  const result = B.parseBib('@article{bad, title ? {oops}}\n@book{good,title={Works}}','x.bib');
  assert.equal(result.warnings.length,1);
  assert.equal(result.entries[0].key,'good');
  assert.equal(B.parseBib('@article{bad,title={unfinished').entries.length,0);
});

test('duplicate keys include identical entries; case remains significant', () => {
  const entries = B.parseBib('@book{same}\n@book{same}\n@book{Same}').entries;
  assert.deepEqual([...B.duplicateKeys(entries)],['same']);
});

test('TeX declarations ignore comments and verbatim, support multiline and multiple bibs', () => {
  const info = B.texInfo(String.raw`% !TeX root = ../main.tex
% \bibliography{wrong}
\begin{verbatim}
\addbibresource{wrong.bib}
\end{verbatim}
\bibliography{
 first, second.bib}
\addbibresource[encoding=utf8]{third.bib}
\input{chapters/intro}
\include{methods.tex}
\bibliography{\dynamic}
`);
  assert.equal(info.root,'../main.tex');
  assert.deepEqual(info.bibs,['first.bib','second.bib','third.bib']);
  assert.deepEqual(info.includes,['chapters/intro.tex','methods.tex']);
  assert.equal(info.warnings.length,1);
});

test('graph follows only root includes, handles cycles and missing files, deduplicates bibs', async () => {
  const files = new Map([
    ['/paper/main.tex',String.raw`\input{chapters/a}\bibliography{refs}\include{missing}`],
    ['/paper/chapters/a.tex',String.raw`\input{main}\addbibresource{refs.bib}\bibliography{more}`],
  ]);
  const result = await B.discover('/paper/main.tex',async file => { if (!files.has(file)) throw Error(); return files.get(file); });
  assert.deepEqual(result.bibs,['/paper/refs.bib','/paper/more.bib']);
  assert.equal(result.visited.size,3);
  assert.equal(result.warnings.length,1);
});

test('source comments preserve author identity, matching and counts with CRLF and nesting', () => {
  const plain = ['%[*Custom reference]','A quoted sentence.','%[&AI: Claude]','Nested text.','%[/&AI: Claude]','%[/*Custom reference]'];
  const linked = [plain[0],M.sourceComment('Smith:2024'),...plain.slice(1)];
  assert.deepEqual(M.countByAuthor(linked).counts,M.countByAuthor(plain).counts);
  const parsed = M.parseDocument(linked.join('\r\n').split('\r\n'));
  assert.equal(parsed.blocks[0].key,'*Custom reference');
  assert.deepEqual(parsed.problems,[]);
  assert.equal(M.sourceKey(linked[1]),'Smith:2024');
  assert.equal(M.sourceKey(M.sourceComment('a"b\\c')),'a"b\\c');
});

test('invalid, unsupported and orphan metadata do not affect marker parsing', () => {
  for (const text of ['% authorship-source: nope','% authorship-source: {"version":2,"citekey":"x"}']) {
    const parsed=M.parseDocument(['%[*Reference]',text,'Text','%[/*Reference]']);
    assert.equal(parsed.problems.length,1);assert.equal(parsed.blocks.length,1);
  }
  assert.equal(M.parseDocument([M.sourceComment('x')]).problems.length,1);
});
