'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../src/markers');
const V=require('../src/reviews');
function passage() {return ['%[&AI: ChatGPT]','A passage with café and \\cite{x}.','%[/&AI: ChatGPT]'];}
function mark(lines,status='reviewed') {const b=M.parseDocument(lines).blocks[0];return [lines[0],V.comment({version:1,status,by:'Balázs',color:'#3278aa',hash:V.fingerprint(lines,b)}),...lines.slice(1)];}
test('review/revision retains author identity and counts',()=>{
 for(const status of ['reviewed','revised']) {
  const lines=mark(passage(),status),p=M.parseDocument(lines),r=V.collect(lines,p);
  assert.equal(r.reviews.get(0).stale,false);assert.deepEqual(r.problems,[]);
  assert.equal(p.blocks[0].key,'&AI: ChatGPT');assert.deepEqual(M.countByAuthor(lines).counts,M.countByAuthor(passage()).counts);
 }
});
test('text, whitespace, citation or author changes stale a review; CRLF does not',()=>{
 const original=mark(passage());
 for(const change of [s=>s+' ',s=>s.replace('passage','paragraph'),s=>s.replace('{x}','{y}')]) {
  const lines=[...original];lines[2]=change(lines[2]);assert.equal(V.collect(lines,M.parseDocument(lines)).reviews.get(0).stale,true);
 }
 const changed=original.map(l=>l.replace('AI: ChatGPT','AI: Claude'));assert.equal(V.collect(changed,M.parseDocument(changed)).reviews.get(0).stale,true);
 const crlf=original.join('\r\n').split(/\r?\n/);assert.equal(V.collect(crlf,M.parseDocument(crlf)).reviews.get(0).stale,false);
});
test('malformed, orphan and non-AI review data fail closed',()=>{
 const lines=mark(passage());
 for(const input of [[lines[1]],['%[&AI: ChatGPT]','% authorship-review: {}','Text','%[/&AI: ChatGPT]'],lines.map(l=>l.replace('&AI: ChatGPT','*Reference'))]) {
  const r=V.collect(input,M.parseDocument(input));assert.equal(r.reviews.size,0);assert.equal(r.problems.length,1);
 }
});
test('nested review metadata does not invalidate outer review; nested text does',()=>{
 const inner=mark(['%[&AI: Claude]','Inner text.','%[/&AI: Claude]']);
 const outer=mark(['%[&AI: ChatGPT]',...inner,'%[/&AI: ChatGPT]']);
 assert.equal(V.collect(outer,M.parseDocument(outer)).reviews.get(0).stale,false);
 const modified=outer.map(l=>l.replace('"status":"reviewed"','"status":"revised"'));
 assert.equal(V.collect(modified,M.parseDocument(modified)).reviews.get(0).stale,false);
 modified[4]='Changed inner text.';
 assert.equal(V.collect(modified,M.parseDocument(modified)).reviews.get(0).stale,true);
});
test('source word estimate drops comments, commands and non-prose arguments',()=>{
 assert.equal(M.countWords("Hello \\emph{world}, caf\\'e! % not counted"),3);
 assert.equal(M.countWords('See \\cite[p.~3]{smith2020} and Fig.~\\ref{fig:a}.'),3);
 assert.equal(M.countWords('\\begin{itemize} -- \\end{itemize}'),0);
 assert.equal(M.countWords('Árvíztűrő tükörfúrógép 2026'),3);
});
test('review progress splits AI-origin words into states that add up to the AI total',()=>{
 const p1=mark(['%[&AI: ChatGPT]','one two three','%[/&AI: ChatGPT]']);
 const p2=mark(['%[&AI: ChatGPT]','four five','%[/&AI: ChatGPT]'],'revised');
 const p3=mark(['%[&AI: Claude]','six seven','%[/&AI: Claude]']);p3[2]='six seven eight';
 const lines=['\\documentclass{article}','\\title{Preamble words are ignored}','\\begin{document}','Owner words here.',...p1,...p2,...p3,
  '%[&AI: Claude]','nine','%[@Anna]','Human words inside are not AI.','%[/@Anna]','%[/&AI: Claude]',
  '%[*Smith]','Reference words.','%[/*Smith]','\\end{document}','after end'];
 const parsed=M.parseDocument(lines);
 assert.deepEqual(V.progress(lines,parsed),{unreviewed:1,reviewed:3,revised:2,changed:3,total:9});
 // reviewing moves no words between authors
 const plain=lines.filter(l=>!V.isReview(l));
 assert.deepEqual(M.countByAuthor(lines).counts,M.countByAuthor(plain).counts);
 assert.deepEqual(V.progress(plain),{unreviewed:9,reviewed:0,revised:0,changed:0,total:9});
});
test('nested AI passages count once, under their own review state',()=>{
 const inner=['%[&AI: Claude]','inner words','%[/&AI: Claude]'];
 const outer=mark(['%[&AI: ChatGPT]','outer',...inner,'more outer','%[/&AI: ChatGPT]']);
 assert.deepEqual(V.progress(outer),{unreviewed:2,reviewed:3,revised:0,changed:0,total:5});
 const both=mark(['%[&AI: ChatGPT]','outer',...mark(inner,'revised'),'more outer','%[/&AI: ChatGPT]']);
 assert.deepEqual(V.progress(both),{unreviewed:0,reviewed:3,revised:2,changed:0,total:5});
});
test('malformed review metadata leaves words unreviewed',()=>{
 const lines=['%[&AI: ChatGPT]','% authorship-review: {"version":1}','three more words','%[/&AI: ChatGPT]'];
 assert.deepEqual(V.progress(lines),{unreviewed:3,reviewed:0,revised:0,changed:0,total:3});
});
