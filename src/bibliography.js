// @ts-check
'use strict';
const path = require('path');
const M = require('./markers');

/** @typedef {{key: string, author: string, year: string, title: string, file: string, line: number}} Entry */
/** Parse BibTeX values without executing TeX. @param {string} text @param {string} [file] */
function parseBib(text, file = '') {
  /** @type {Entry[]} */ const entries = [];
  /** @type {string[]} */ const warnings = [];
  /** @type {Map<string,string>} */ const strings = new Map();
  let i = 0;
  const skip = () => {
    while (i < text.length) {
      if (/\s/.test(text[i])) i++;
      else if (text[i] === '%') { while (i < text.length && text[i] !== '\n') i++; }
      else break;
    }
  };
  const value = () => {
    let result = '';
    do {
      skip();
      if (text[i] === '#') { i++; skip(); }
      if (text[i] === '{' || text[i] === '"') {
        const quoted = text[i++] === '"';
        let depth = quoted ? 0 : 1, part = '', closed = false;
        while (i < text.length) {
          const c = text[i++];
          if (c === '\\') { part += c + (text[i++] || ''); continue; }
          if (quoted && c === '"' && depth === 0) { closed = true; break; }
          if (c === '{') depth++;
          if (c === '}') { depth--; if (!quoted && depth === 0) { closed = true; break; } }
          part += c;
        }
        if (!closed) throw new Error('Unterminated field');
        result += part;
      } else {
        const start = i;
        while (i < text.length && !/[\s,#})]/.test(text[i])) i++;
        if (i === start) throw new Error('Missing field value');
        const word = text.slice(start, i);
        result += strings.get(word.toLowerCase()) ?? word;
      }
      skip();
    } while (text[i] === '#');
    return result;
  };
  while (i < text.length) {
    skip();
    if (text[i] !== '@') { i++; continue; }
    const start = i++;
    const type = /^[A-Za-z]+/.exec(text.slice(i));
    if (!type) continue;
    i += type[0].length; skip();
    const open = text[i++];
    if (open !== '{' && open !== '(') continue;
    const close = open === '{' ? '}' : ')';
    const kind = type[0].toLowerCase();
    try {
      if (kind === 'comment') {
        let depth = 1;
        while (i < text.length && depth) { const c = text[i++]; if (c === '\\') i++; else if (c === open) depth++; else if (c === close) depth--; }
        continue;
      }
      if (kind === 'preamble') { value(); skip(); if (text[i] === ',') i++; skip(); if (text[i++] !== close) throw new Error('Invalid preamble'); continue; }
      skip();
      let key = '';
      if (kind !== 'string') {
        const begin = i;
        while (i < text.length && text[i] !== ',' && text[i] !== close) i++;
        key = text.slice(begin, i).trim();
        if (!key || /\s/.test(key)) throw new Error('Invalid entry key');
        if (text[i] === ',') i++;
      }
      /** @type {Record<string,string>} */ const fields = {};
      let closed = false;
      while (i < text.length) {
        skip(); if (text[i] === close) { i++; closed = true; break; }
        if (text[i] === ',') { i++; continue; }
        const field = /^[\w-]+/.exec(text.slice(i));
        if (!field) throw new Error('Invalid field name');
        i += field[0].length; skip();
        if (text[i++] !== '=') throw new Error('Missing =');
        fields[field[0].toLowerCase()] = value();
        skip();
        if (text[i] !== ',' && text[i] !== close) throw new Error('Missing field separator');
      }
      if (!closed) throw new Error('Unterminated entry');
      if (kind === 'string') for (const [k,v] of Object.entries(fields)) strings.set(k,v);
      else entries.push({key, author: display(fields.author || fields.editor || ''), year: display(fields.year || fields.date || ''), title: display(fields.title || ''), file, line: text.slice(0,start).split('\n').length});
    } catch (e) {
      warnings.push(`${file}:${text.slice(0,start).split('\n').length}: ${e instanceof Error ? e.message : e}`);
      const next = text.indexOf('\n@', start + 1); i = next < 0 ? text.length : next + 1;
    }
  }
  return {entries, warnings};
}
/** @param {string} s */
function display(s) { return s.replace(/[{}]/g, '').replace(/\\(?:[A-Za-z]+|.)\s*/g, '').replace(/\s+/g, ' ').trim(); }

/** @param {string} text */
function texInfo(text) {
  const lines = text.split(/\r?\n/);
  let verbatim = '';
  const clean = lines.map(line => {
    const stripped = M.stripComment(line);
    if (verbatim) { if (stripped.includes('\\end{' + verbatim + '}')) verbatim = ''; return ''; }
    const start = /\\begin\{(verbatim\*?|Verbatim\*?|lstlisting\*?|minted\*?|comment|alltt|filecontents\*?)\}/.exec(stripped);
    if (start) { if (!stripped.includes('\\end{' + start[1] + '}')) verbatim = start[1]; return stripped.slice(0,start.index); }
    return stripped.replace(/\\verb\*?([^\w\s])[^\n]*?\1/g,'');
  }).join('\n');
  const root = /^\s*%\s*!\s*TeX\s+root\s*=\s*(.+?)\s*$/im.exec(text)?.[1];
  /** @type {string[]} */ const includes = [], bibs = [], warnings = [];
  const re = /\\(input|include|bibliography|addbibresource)\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g;
  for (const m of clean.matchAll(re)) {
    const names = m[1] === 'bibliography' ? m[2].split(',') : [m[2]];
    for (let name of names) {
      name = name.trim();
      if (!name || /[\\#{}]/.test(name) || /^\w+:\/\//.test(name)) { warnings.push(`Unresolved resource: ${name}`); continue; }
      if (m[1] === 'input' || m[1] === 'include') includes.push(path.extname(name) ? name : name + '.tex');
      else bibs.push(m[1] === 'bibliography' && !path.extname(name) ? name + '.bib' : name);
    }
  }
  if (/\\(?:import\b|subimport\b|subfile\b|begin\s*\{refsection\}|if\w*\b)/.test(clean)) warnings.push('Conditional TeX, special imports or scoped bibliographies may need manual file selection.');
  return {root, main: /\\documentclass\b/.test(clean), includes, bibs, warnings};
}

/** Literal include graph; paths are relative to the compilation root.
 * @param {string} root @param {(file: string) => Promise<string>} read
 */
async function discover(root, read) {
  const base = path.dirname(root), visited = new Set();
  /** @type {Set<string>} */ const bibs = new Set();
  /** @type {string[]} */ const warnings = [];
  const queue = [root];
  while (queue.length && visited.size < 200) {
    const file = path.resolve(/** @type {string} */ (queue.shift()));
    if (visited.has(file)) continue;
    visited.add(file);
    try {
      const info = texInfo(await read(file));
      warnings.push(...info.warnings.map(w => `${file}: ${w}`));
      for (const b of info.bibs) bibs.add(path.resolve(base,b));
      for (const inc of info.includes) queue.push(path.resolve(base,inc));
    } catch { warnings.push(`Cannot read ${file}`); }
  }
  if (queue.length) warnings.push('Stopped after 200 TeX files; select bibliography files manually if needed.');
  return {bibs: [...bibs], visited, warnings};
}
/** @param {Entry[]} entries */
function duplicateKeys(entries) {
  const seen = new Set(), duplicates = new Set();
  for (const e of entries) { if (seen.has(e.key)) duplicates.add(e.key); seen.add(e.key); }
  return duplicates;
}
module.exports = {parseBib, texInfo, discover, duplicateKeys};
