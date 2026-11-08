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
/** @typedef {{unreviewed:number, reviewed:number, revised:number, changed:number, total:number}} Progress */
/**
 * Review progress of AI-origin words as a source estimate (ADR-0021). Each word belongs to
 * its innermost passage, as in the authorship counts; an AI word takes that passage's state:
 * unreviewed, reviewed or revised with a current fingerprint, or changed since review.
 * A review on an enclosing passage does not cover a nested AI passage, matching the tints.
 * The states never overlap and add up to `total`, the AI-origin word estimate.
 * @param {string[]} lines @param {import('./markers').Parsed} [parsed] @param {ReturnType<typeof collect>} [info]
 * @returns {Progress}
 */
function progress(lines,parsed,info) {
  parsed = parsed || M.parseDocument(lines);
  info = info || collect(lines,parsed);
  /** @type {(import('./markers').Block|null)[]} */ const own = new Array(lines.length).fill(null);
  for (const b of [...parsed.blocks].sort((a,b)=>a.depth-b.depth)) {
    const end = b.closeLine===-1 ? lines.length : b.closeLine;
    for (let i=b.openLine+1;i<end;i++) own[i]=b;
  }
  const counts = {unreviewed:0,reviewed:0,revised:0,changed:0,total:0};
  const [start,end] = M.bodyRange(lines);
  for (let i=start;i<end;i++) {
    const key = parsed.lineAuthor[i];
    if (parsed.isMarker[i] || !key || M.parseMarkerLine(M.openTag(key))?.kind!=='ai') continue;
    const n = M.countWords(lines[i]);
    if (!n) continue;
    const b = own[i], r = b ? info.reviews.get(b.openLine) : undefined;
    counts[!r ? 'unreviewed' : r.stale ? 'changed' : r.review.status] += n;
    counts.total += n;
  }
  return counts;
}
/** Labels shared by the editor views, in the order of ADR-0021. */
const PROGRESS_LABELS = /** @type {const} */ ([
  ['unreviewed','Unreviewed'],
  ['reviewed','Reviewed, unchanged since review'],
  ['revised','Revised, unchanged since review'],
  ['changed','Changed since review'],
]);
module.exports={isReview,parse,fingerprint,comment,collect,progress,PROGRESS_LABELS};
