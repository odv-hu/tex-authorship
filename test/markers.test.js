'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/markers');

const K = '&AI: Claude';

test('parses marker lines', () => {
  assert.deepEqual(M.parseMarkerLine('%[&AI: Claude]'), { close: false, prefix: '&', label: 'AI: Claude', key: K, kind: 'ai' });
  assert.equal(M.parseMarkerLine('  %[/&AI: Claude]  ').close, true);
  assert.equal(M.parseMarkerLine('%[*Reference]').kind, 'reference');
  assert.equal(M.parseMarkerLine('%[@Anna]').kind, 'human');
  assert.equal(M.parseMarkerLine('% just a comment'), null);
  assert.equal(M.parseMarkerLine('text %[&AI: Claude]'), null, 'marker must be alone on its line');
});

test('parses nested blocks and assigns lines to the innermost author', () => {
  const lines = ['mine', '%[&AI: Claude]', 'ai', '%[*Ref]', 'ref', '%[/*Ref]', 'ai again', '%[/&AI: Claude]', 'mine'];
  const p = M.parseDocument(lines);
  assert.deepEqual(p.lineAuthor, [null, K, K, '*Ref', '*Ref', '*Ref', K, K, null]);
  assert.equal(p.problems.length, 0);
  assert.equal(p.blocks.length, 2);
  assert.equal(M.blockAt(p, 4).key, '*Ref');
  assert.equal(M.blockAt(p, 2).key, K);
  assert.equal(M.blockAt(p, 0), null);
});

test('reports unmatched markers', () => {
  assert.equal(M.parseDocument(['%[&AI: Claude]', 'x']).problems.length, 1);
  assert.equal(M.parseDocument(['x', '%[/&AI: Claude]']).problems.length, 1);
  const p = M.parseDocument(['%[&A]', '%[*R]', 'x', '%[/&A]']);
  assert.equal(p.problems.length, 1, 'inner *R never closed');
});

test('wrapText: paste into an empty line', () => {
  assert.equal(M.wrapText('', '', 'Hello world.', K), '%[&AI: Claude]\nHello world.\n%[/&AI: Claude]');
});

test('wrapText: paste text that ends with a newline at line start', () => {
  assert.equal(M.wrapText('', 'Next line', 'Para.\n', K), '%[&AI: Claude]\nPara.\n%[/&AI: Claude]\n');
});

test('wrapText: paste after a space, before a space', () => {
  assert.equal(M.wrapText('The ', ' end.', 'middle', K), '\n%[&AI: Claude]\nmiddle\n%[/&AI: Claude]\n');
});

test('wrapText: glued on both sides gets % so TeX adds no spaces', () => {
  assert.equal(M.wrapText('captures', '.', ' the flux', K), '%\n%[&AI: Claude]\n the flux%\n%[/&AI: Claude]\n');
});

test('wrapText: CRLF documents', () => {
  assert.equal(M.wrapText('', '', 'x', K, '\r\n'), '%[&AI: Claude]\r\nx\r\n%[/&AI: Claude]');
});

test('stripComment respects \\%', () => {
  assert.equal(M.stripComment('50\\% of it % note'), '50\\% of it ');
});

test('countByAuthor counts only the document body, without comments or markers', () => {
  const lines = ['\\documentclass{article}', '\\begin{document}', 'abc', '%[&AI: Claude]', 'de f % hidden', '%[/&AI: Claude]', '\\end{document}', 'zzz'];
  const { counts, total } = M.countByAuthor(lines);
  assert.equal(counts.get(''), 3);
  assert.equal(counts.get(K), 3);
  assert.equal(total, 6);
});

test('insideVerbatim', () => {
  const lines = ['a', '\\begin{lstlisting}', 'code', '\\end{lstlisting}', 'b'];
  assert.equal(M.insideVerbatim(lines, 2), true);
  assert.equal(M.insideVerbatim(lines, 4), false);
  assert.equal(M.insideVerbatim(lines, 0), false);
});

test('findAuthorshipColors: decimal and hex', () => {
  const line = '\\AuthorshipColor{AI: Claude}{0.80 0.05 0.45}   % per-author colour override';
  const [c] = M.findAuthorshipColors(line);
  assert.equal(line.slice(c.start, c.end), '0.80 0.05 0.45');
  assert.deepEqual(c.rgb, [0.8, 0.05, 0.45]);
  const hexLine = '\\AuthorshipColor{AI: ChatGPT}{ #7a3cff }';
  const [h] = M.findAuthorshipColors(hexLine);
  assert.equal(hexLine.slice(h.start, h.end), '#7a3cff');
  assert.equal(Math.round(h.rgb[0] * 255), 0x7a);
  assert.equal(M.findAuthorshipColors('\\AuthorshipColor{x}{2 3 4}').length, 0, 'out of range');
  assert.equal(M.findAuthorshipColors('% \\AuthorshipColor{a}{0 0 0} \\AuthorshipColor{b}{1,1,1}').length, 2);
});

test('formatColor keeps the style', () => {
  assert.equal(M.formatColor([0.8, 0.05, 0.45], 'decimal'), '0.80 0.05 0.45');
  assert.equal(M.formatColor([122 / 255, 60 / 255, 1], 'hex'), '#7a3cff');
});

test('collectColors skips commented lines; lookupColor follows key > label > kind', () => {
  const lines = [
    '% \\AuthorshipColor{AI: Claude}{1 1 0}',
    '\\AuthorshipColor{ai}{0 0 1}',
    '\\AuthorshipColor{AI: ChatGPT}{#ff0000}   % note',
  ];
  const map = M.collectColors(lines);
  assert.equal(map.has('AI: Claude'), false);
  assert.deepEqual(M.lookupColor(map, '&AI: ChatGPT'), [1, 0, 0]);
  assert.deepEqual(M.lookupColor(map, '&AI: Claude'), [0, 0, 1], 'falls back to kind');
  assert.equal(M.lookupColor(map, '*Reference'), undefined);
});

test('findOwner reads the last active \\AuthorshipOwner', () => {
  assert.equal(M.findOwner(['% \\AuthorshipOwner{Nope}', '\\AuthorshipOwner{Balázs Fürtön} % me']), 'Balázs Fürtön');
  assert.equal(M.findOwner(['\\usepackage{authorship}']), null);
});

test('findAuthorshipColors reads every gradient stop with its own position', () => {
  const line = '\\AuthorshipGradient{AI: ChatGPT}{#2ecc71, #00b3b3,#2f6fdd}';
  const c = M.findAuthorshipColors(line);
  assert.deepEqual(c.map(x => line.slice(x.start, x.end)), ['#2ecc71', '#00b3b3', '#2f6fdd']);
  assert.deepEqual(c.map(x => x.stop), [0, 1, 2]);
  const dec = '\\AuthorshipGradient{AI: Gemini}{0.9 0.2 0.5; 0.2,0.3,0.9}';
  const d = M.findAuthorshipColors(dec);
  assert.deepEqual(d.map(x => dec.slice(x.start, x.end)), ['0.9 0.2 0.5', '0.2,0.3,0.9']);
});

test('collectColors uses a gradient\'s first stop, and the last line wins', () => {
  const map = M.collectColors([
    '\\AuthorshipColor{AI: ChatGPT}{#ff0000}',
    '\\AuthorshipGradient{AI: ChatGPT}{#00ff00, #0000ff}',
  ]);
  assert.deepEqual(M.lookupColor(map, '&AI: ChatGPT'), [0, 1, 0]);
});
