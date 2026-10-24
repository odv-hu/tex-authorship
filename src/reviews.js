// @ts-check
'use strict';
const crypto = require('crypto');
const M = require('./markers');
/** @typedef {{version: number, status: 'reviewed'|'revised', by: string, color: string, hash: string}} Review */
/** @param {string} line */
function isReview(line) { return /^\s*%\s*authorship-review:/.test(line); }
/** @param {string} line @returns {Review|null} */
function parse(line) {
  try {
    const r = JSON.parse(line.replace(/^\s*%\s*authorship-review:\s*/,''));
    return r.version === 1 && ['reviewed','revised'].includes(r.status) && typeof r.by === 'string' && r.by.trim() && !/[\r\n]/.test(r.by) && /^#[0-9a-f]{6}$/i.test(r.color) && /^[0-9a-f]{64}$/.test(r.hash) ? r : null;
  } catch { return null; }
}
/** @param {string[]} lines @param {import('./markers').Block} block */
function fingerprint(lines,block) {
  return crypto.createHash('sha256').update(block.key + '\n' + lines.slice(block.openLine+1,block.closeLine).filter(l=>!isReview(l)).join('\n'),'utf8').digest('hex');
}
/** @param {Review} review */
function comment(review) { return '% authorship-review: ' + JSON.stringify(review); }
/** @param {string[]} lines @param {import('./markers').Parsed} parsed */
function collect(lines,parsed) {
  /** @type {Map<number, {review:Review, stale:boolean}>} */ const reviews = new Map();
  /** @type {{line:number,message:string}[]} */ const problems = [];
  for (let i=0;i<lines.length;i++) {
    if (!isReview(lines[i])) continue;
    const b = parsed.blocks.find(b=>b.openLine===i-1 && b.kind==='ai' && b.closeLine>i && !parsed.problems.some(p=>p.line>=b.openLine && p.line<=b.closeLine));
    const r = parse(lines[i]);
    if (!b || !r) {problems.push({line:i,message:'Review metadata must be valid version 1 data immediately after a closed AI passage’s opening marker.'});continue;}
    const stale = fingerprint(lines,b)!==r.hash;
    reviews.set(b.openLine,{review:r,stale});
    if (stale) problems.push({line:i,message:`Changed since ${r.status} by ${r.by}. Review this passage again.`});
  }
  return {reviews,problems};
}
module.exports={isReview,parse,fingerprint,comment,collect};
