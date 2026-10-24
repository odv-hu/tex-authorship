// @ts-check
'use strict';
const M = require('./markers');
const V = require('./reviews');

/** Remove this package's source syntax, without interpreting arbitrary TeX.
 * Throw before editing for unsupported/malformed authorship commands.
 * @param {string} text @param {string} [footer] @returns {string}
 */
function stripAuthorship(text, footer = '') {
  let insertedFooter = false;
  /** @type {Record<string, number>} */
  const arity = {AuthorshipOwner:1, AuthorshipColor:2, AuthorshipGradient:2,
    AuthorshipCitationColor:1, AuthorshipSummary:0, AuthorshipSummaryFullWidth:0,
    AuthorshipReviewLegend:0, AuthorshipSetSummary:1};
  let i = 0, out = '';
  const fail = () => new Error('Unsupported or incomplete authorship syntax. No changes were made.');
  function skip() {
    while (i < text.length) {
      if (/\s/.test(text[i])) { i++; continue; }
      if (text[i] === '%') { const end = text.indexOf('\n',i); i = end < 0 ? text.length : end+1; continue; }
      break;
    }
  }
  /** @param {string} open @returns {string} */
  function group(open = '{') {
    skip();
    if (text[i] !== open) throw fail();
    const close = open === '{' ? '}' : ']';
    const start = ++i;
    let depth = 1, braces = 0;
    while (i < text.length) {
      const c = text[i++];
      if (c === '\\') { i++; continue; }
      if (c === '%') { const end = text.indexOf('\n',i); i = end < 0 ? text.length : end+1; continue; }
      if (open === '[') {
        if (c === '{') braces++;
        if (c === '}') braces--;
        if (braces) continue;
      }
      if (c === open) depth++;
      if (c === close && --depth === 0) return text.slice(start,i-1);
    }
    throw fail();
  }
  function optional() {
    const saved = i;
    skip();
    if (text[i] === '[') group('['); else i = saved;
  }
  /** Preserve surrounding text; omit a whole command-only line without adding a paragraph. */
  function removeLineRemainder() {
    const lineStart = out.lastIndexOf('\n') + 1;
    const rest = /^[ \t]*(?:\r?\n|$)/.exec(text.slice(i));
    if (/^[ \t]*$/.test(out.slice(lineStart)) && rest) {
      out = out.slice(0,lineStart); i += rest[0].length;
    }
  }
  while (i < text.length) {
    if (i === 0 || text[i-1] === '\n') {
      const end = text.indexOf('\n',i), stop = end < 0 ? text.length : end;
      const line = text.slice(i,stop);
      if (M.parseMarkerLine(line) || M.isSourceComment(line) || V.isReview(line)) {
        i = end < 0 ? stop : stop+1; continue;
      }
    }
    if (text[i] === '%') {
      const end = text.indexOf('\n',i), stop = end < 0 ? text.length : end+1;
      out += text.slice(i,stop); i = stop; continue;
    }
    if (text[i] !== '\\') { out += text[i++]; continue; }
    const start = i;
    const command = /^\\([A-Za-z@]+|[^\r\n])/.exec(text.slice(i));
    if (!command) { out += text[i++]; continue; }
    const name = command[1]; i += command[0].length;
    if (name === 'end' && footer) {
      const saved = i;
      if (group() === 'document') {
        if (insertedFooter) throw fail();
        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        out += eol + footer; insertedFooter = true;
      }
      i = saved;
    }
    if (name === 'begin') {
      const saved = i;
      skip();
      if (text[i] === '{') {
        const env = group();
        if (/^(?:verbatim|Verbatim|lstlisting|minted|comment|alltt|filecontents)\*?$/.test(env)) {
          const close = '\\end{' + env + '}', end = text.indexOf(close,i);
          i = end < 0 ? text.length : end+close.length;
          out += text.slice(start,i); continue;
        }
      }
      i = saved;
    }
    if (name === 'verb') {
      if (text[i] === '*') i++;
      const delimiter = text[i++], end = text.indexOf(delimiter,i);
      i = end < 0 ? text.length : end+1;
      out += text.slice(start,i); continue;
    }
    if (name === 'url' || name === 'path' || name === 'nolinkurl') {
      group(); out += text.slice(start,i); continue;
    }
    if (name === 'IfFileExists') {
      const saved = i, file = group();
      if (/(?:^|\/)authorship\.sty$/.test(file.trim())) {
        const yes = group(), no = group();
        // Only the package guard is disposable; never discard unrelated branch content.
        if ([yes,no].some(branch => stripAuthorship(branch).replace(/%[^\r\n]*/g,'').trim())) throw fail();
        removeLineRemainder(); continue;
      }
      i = saved;
    }
    if (['providecommand','newcommand','renewcommand','DeclareRobustCommand'].includes(name)) {
      const saved = i;
      if (text[i] === '*') i++;
      skip();
      let target;
      if (text[i] === '{') target = group().trim();
      else { target = (/^\\[A-Za-z@]+/.exec(text.slice(i)) || [''])[0]; i += target.length; }
      if (/^\\Authorship/.test(target)) {
        optional(); optional(); group(); removeLineRemainder(); continue;
      }
      i = saved;
    }
    if (name === 'usepackage' || name === 'RequirePackage' || name === 'PassOptionsToPackage') {
      const saved = i;
      if (name === 'PassOptionsToPackage') group(); else optional();
      skip(); const listStart = i, packages = group();
      const remaining = packages.split(',').filter(p => !/(?:^|\/)authorship$/.test(p.trim()));
      if (remaining.length !== packages.split(',').length) {
        if (remaining.length) out += text.slice(start,listStart) + '{' + remaining.join(',') + '}';
        else { if (name !== 'PassOptionsToPackage') optional(); removeLineRemainder(); }
        continue;
      }
      i = saved;
    }
    if (Object.hasOwn(arity,name)) {
      if (name === 'AuthorshipSummaryFullWidth') optional();
      for (let n = 0; n < arity[name]; n++) group();
      removeLineRemainder(); continue;
    }
    if (name.startsWith('Authorship') || name.startsWith('authorship@')) throw fail();
    out += text.slice(start,i);
  }
  if (footer && !insertedFooter) throw new Error('No document end found. Run submission cleanup on the main document.');
  return out;
}
module.exports = {stripAuthorship};
