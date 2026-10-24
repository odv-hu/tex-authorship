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
