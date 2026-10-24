// @ts-check
'use strict';
const {stripAuthorship} = require('./strip');
/** Read the package's numeric snapshot without executing any auxiliary TeX.
 * @param {string} aux
 */
function totalsFromAux(aux) {
  const matches = [...aux.matchAll(/\\AuthorshipSetSummary\{([^{}]*)\}/g)];
  if (!matches.length) throw new Error('No word and character counts found. Build the attributed document with LuaLaTeX first.');
  const entries = matches[matches.length-1][1].split('|');
  let characters = 0, words = 0;
  for (const entry of entries) {
    const match = /^.+=(\d+),(\d+)$/.exec(entry);
    if (!match) throw new Error('Incomplete counts. Rebuild the attributed document with the current LuaLaTeX package.');
    characters += Number(match[1]); words += Number(match[2]);
  }
  if (!Number.isSafeInteger(characters) || !Number.isSafeInteger(words)) throw new Error('Invalid document counts.');
  return {characters,words};
}
/** @param {{characters:number,words:number}} totals @param {string} eol */
function countsTable(totals,eol) {
  return [
    '% Document counts: fixed snapshot from the last attributed LuaLaTeX build.',
    '\\par\\medskip',
    '\\noindent\\begin{tabular}{@{}lr@{}}',
    '\\multicolumn{2}{@{}l}{Document counts}\\\\\\hline',
    'Words & '+totals.words+'\\\\',
    'Characters (excluding spaces) & '+totals.characters+'\\\\',
    '\\end{tabular}\\par', ''
  ].join(eol);
}
/** @param {string} text @param {string} aux */
function prepareSubmission(text,aux) {
  const clean = stripAuthorship(text);
  const table = countsTable(totalsFromAux(aux),text.includes('\r\n')?'\r\n':'\n');
  return stripAuthorship(clean,table);
}
module.exports = {totalsFromAux,countsTable,prepareSubmission};
