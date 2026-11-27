// @ts-check
'use strict';

/**
 * Pure marker logic, no VS Code dependency, so it can be unit-tested with plain Node.
 *
 * Marker syntax (each marker on its own line, optional leading whitespace):
 *
 *   %[&AI: Claude]        opens a passage by an AI author
 *   %[/&AI: Claude]       closes it
 *
 * Prefixes follow iA Writer's Markdown Annotations:  @ human   & AI   * reference
 * Everything outside a marked passage is the writer's own text ("Mine").
 */

const MARKER_RE = /^\s*%\[(\/?)([@&*])([^\]\r\n]+)\]\s*$/;

/** @typedef {'human'|'ai'|'reference'} AuthorKind */
/** @type {Record<string, AuthorKind>} */
const PREFIX_KIND = { '@': 'human', '&': 'ai', '*': 'reference' };
/** @type {Record<AuthorKind, string>} */
const KIND_PREFIX = { human: '@', ai: '&', reference: '*' };

/**
 * @param {string} line
 * @returns {{close: boolean, prefix: string, label: string, key: string, kind: AuthorKind} | null}
 */
function parseMarkerLine(line) {
  const m = MARKER_RE.exec(line);
  if (!m) return null;
  const label = m[3].trim();
  return { close: m[1] === '/', prefix: m[2], label, key: m[2] + label, kind: PREFIX_KIND[m[2]] };
}

/** @param {AuthorKind} kind @param {string} label */
function authorKey(kind, label) {
  return KIND_PREFIX[kind] + label.trim();
}

/** @param {string} key */
function openTag(key) { return `%[${key}]`; }
/** @param {string} key */
function closeTag(key) { return `%[/${key}]`; }

/** @param {string} key */
function sourceComment(key) { return '% authorship-source: ' + JSON.stringify({version: 1, citekey: key}); }
/** @param {string} line */
function isSourceComment(line) { return /^\s*%\s*authorship-source:/.test(line); }
/** @param {string} line @returns {string | null} */
function sourceKey(line) {
  try {
    const data = JSON.parse(line.replace(/^\s*%\s*authorship-source:\s*/, ''));
    return data.version === 1 && typeof data.citekey === 'string' && data.citekey.trim() && !/[\r\n]/.test(data.citekey) ? data.citekey : null;
  } catch { return null; }
}

/**
 * @typedef {Object} Block
 * @property {string} key       author key, e.g. "&AI: Claude"
 * @property {AuthorKind} kind
 * @property {string} label
 * @property {number} openLine
 * @property {number} closeLine  -1 if never closed
 * @property {number} depth
 *
 * @typedef {Object} Problem
 * @property {number} line
 * @property {string} message
 *
 * @typedef {Object} Parsed
 * @property {Block[]} blocks
 * @property {(string|null)[]} lineAuthor   innermost author key per line (null = mine); marker lines get the author they open/close
 * @property {boolean[]} isMarker
 * @property {Problem[]} problems
 */

/**
 * Parse a whole document into marked blocks.
 * @param {string[]} lines
 * @returns {Parsed}
 */
function parseDocument(lines) {
  /** @type {Block[]} */
  const blocks = [];
  /** @type {Block[]} */
  const stack = [];
  /** @type {(string|null)[]} */
  const lineAuthor = new Array(lines.length).fill(null);
  const isMarker = new Array(lines.length).fill(false);
  /** @type {Problem[]} */
  const problems = [];

  for (let i = 0; i < lines.length; i++) {
    const mk = parseMarkerLine(lines[i]);
    if (!mk) {
      lineAuthor[i] = stack.length ? stack[stack.length - 1].key : null;
      continue;
    }
    isMarker[i] = true;
    if (!mk.close) {
      const b = { key: mk.key, kind: mk.kind, label: mk.label, openLine: i, closeLine: -1, depth: stack.length };
      blocks.push(b);
      stack.push(b);
      lineAuthor[i] = mk.key;
      continue;
    }
    // closing marker: find the matching open block, innermost first
    let idx = -1;
    for (let s = stack.length - 1; s >= 0; s--) {
      if (stack[s].key === mk.key) { idx = s; break; }
    }
    if (idx === -1) {
      problems.push({ line: i, message: `Closing marker ${closeTag(mk.key)} has no matching ${openTag(mk.key)} above it.` });
      lineAuthor[i] = stack.length ? stack[stack.length - 1].key : null;
      continue;
    }
    for (let s = stack.length - 1; s > idx; s--) {
      problems.push({ line: stack[s].openLine, message: `${openTag(stack[s].key)} is not closed before ${closeTag(mk.key)} (line ${i + 1}).` });
      stack[s].closeLine = i;
    }
    stack[idx].closeLine = i;
    lineAuthor[i] = mk.key;
    stack.length = idx;
  }
  for (const b of stack) {
    problems.push({ line: b.openLine, message: `${openTag(b.key)} is never closed.` });
  }
  for (let i = 0; i < lines.length; i++) {
    if (!isSourceComment(lines[i])) continue;
    const preceding = i > 0 ? parseMarkerLine(lines[i - 1]) : null;
    if (!preceding || preceding.close || preceding.kind !== 'reference') problems.push({line: i, message: 'Source metadata must immediately follow an opening reference marker.'});
    if (!sourceKey(lines[i])) problems.push({line: i, message: 'Invalid or unsupported reference source metadata.'});
  }
  return { blocks, lineAuthor, isMarker, problems };
}

/**
 * Innermost block containing a line (marker lines included).
 * @param {Parsed} parsed @param {number} line
 */
function blockAt(parsed, line) {
  /** @type {Block|null} */
  let best = null;
  for (const b of parsed.blocks) {
    const end = b.closeLine === -1 ? Infinity : b.closeLine;
    if (line >= b.openLine && line <= end && (!best || b.depth > best.depth)) best = b;
  }
  return best;
}

/**
 * Build the replacement text that wraps `text` in markers at a position.
 *
 * `before` is what sits on the line left of the insertion point, `after` what sits right of it.
 * Markers must be on their own lines; this adds the line breaks, and a trailing `%`
 * where a line break would otherwise turn into a space TeX did not have before.
 *
 * @param {string} before
 * @param {string} after
 * @param {string} text
 * @param {string} key
 * @param {string} [eol]
 */
function wrapText(before, after, text, key, eol = '\n') {
  let s = '';
  if (before.trim().length > 0) {
    // "foo|" -> "foo%\n" keeps foo glued to the pasted text; "foo |" needs no %
    s += (/\s$/.test(before) ? '' : '%') + eol;
  }
  s += openTag(key) + eol;
  s += text;
  const endsWithBreak = /\r?\n$/.test(text);
  if (!endsWithBreak) {
    const afterHasContent = after.trim().length > 0;
    s += (afterHasContent && !/^\s/.test(after) ? '%' : '') + eol;
  }
  s += closeTag(key);
  if (after.length > 0) s += eol;
  return s;
}

/**
 * Remove an unescaped % comment from a line.
 * @param {string} line
 */
function stripComment(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') { i++; continue; }
    if (line[i] === '%') return line.slice(0, i);
  }
  return line;
}

/**
 * Lines that count: the body between \begin{document} and \end{document} when the file
 * has one, otherwise the whole file (an included fragment).
 * @param {string[]} lines
 * @returns {[number, number]}  start (inclusive), end (exclusive)
 */
function bodyRange(lines) {
  let start = 0, end = lines.length;
  const b = lines.findIndex(l => /\\begin\{document\}/.test(stripComment(l)));
  if (b !== -1) {
    start = b + 1;
    const e = lines.findIndex((l, i) => i > b && /\\end\{document\}/.test(stripComment(l)));
    if (e !== -1) end = e;
  }
  return [start, end];
}

// Commands whose braced argument is a key, label, path or environment name, not prose.
const NON_TEXT_ARGUMENT = /\\(?:[a-zA-Z]*cite[a-zA-Z]*|(?:eq|page|auto|name)?ref|[cC]ref|label|url|href|includegraphics|input|include|begin|end|bibliography(?:style)?|usepackage|documentclass)\*?(?:\s*\[[^\]]*\])*\s*\{[^{}]*\}/g;

/**
 * Estimate the words a source line contributes (ADR-0021). Comments, control sequences
 * and the arguments of citation, reference, label, URL, file and environment commands
 * are dropped; a word is then a whitespace-separated run containing a letter or digit.
 * This is a source estimate: it does not expand macros or follow TeX's typesetting.
 * @param {string} line
 */
function countWords(line) {
  const text = stripComment(line)
    .replace(NON_TEXT_ARGUMENT, ' ')
    .replace(/\\[a-zA-Z@]+\*?/g, ' ')   // control words separate words: \emph{x}
    .replace(/\\./g, '')                // control symbols join: caf\'e, \%, \,
    .replace(/[{}]/g, '')
    .replace(/[~$&^_#]/g, ' ');
  let n = 0;
  for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) n++;
  return n;
}

/**
 * Count visible (non-whitespace, non-comment) characters per author.
 * Only the body between \begin{document} and \end{document} counts when the file has one.
 * @param {string[]} lines
 * @param {Parsed} [parsed]
 * @returns {{counts: Map<string, number>, total: number}}  key null -> "Mine" stored under ''
 */
function countByAuthor(lines, parsed) {
  parsed = parsed || parseDocument(lines);
  const [start, end] = bodyRange(lines);
  /** @type {Map<string, number>} */
  const counts = new Map();
  let total = 0;
  for (let i = start; i < end; i++) {
    if (parsed.isMarker[i]) continue;
    const n = stripComment(lines[i]).replace(/\s+/g, '').length;
    if (!n) continue;
    const k = parsed.lineAuthor[i] || '';
    counts.set(k, (counts.get(k) || 0) + n);
    total += n;
  }
  return { counts, total };
}

const VERBATIM_ENVS = ['verbatim', 'Verbatim', 'BVerbatim', 'LVerbatim', 'lstlisting', 'minted', 'comment', 'alltt', 'filecontents', 'tcblisting'];

/** Strip TeX comments from a line (an unescaped % starts one). @param {string} line */
function uncommented(line) {
  const m = /(?:^|[^\\])(?:\\\\)*%/.exec(line);
  return m ? line.slice(0, m.index + m[0].length - 1) : line;
}

/**
 * Names of verbatim-like environments: the built-in ones, those the document defines
 * (\newminted, \lstnewenvironment, fancyvrb's \DefineVerbatimEnvironment and
 * \RecustomVerbatimEnvironment, tcolorbox's \newtcblisting and \NewTCBListing), and
 * extra names, for example from the texAuthorship.verbatimEnvironments setting.
 * @param {string[]} lines @param {string[]} [extra] @returns {Set<string>}
 */
function verbatimEnvironments(lines, extra = []) {
  const names = new Set(VERBATIM_ENVS);
  for (const name of extra) if (typeof name === 'string' && name.trim()) names.add(name.trim());
  for (const raw of lines) {
    const line = uncommented(raw);
    for (const m of line.matchAll(/\\newminted\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/g)) names.add((m[1] || m[2] + 'code').trim());
    for (const m of line.matchAll(/\\(?:lstnewenvironment|DefineVerbatimEnvironment|RecustomVerbatimEnvironment|newtcblisting|renewtcblisting|NewTCBListing|RenewTCBListing|DeclareTCBListing)\s*(?:\[[^\]]*\]\s*)?\{\s*\\?([^{}\s]+)\s*\}/g)) names.add(m[1]);
  }
  return names;
}

/** @param {Set<string>} names */
function envPattern(names) {
  const alternatives = [...names].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\\\(begin|end)\\s*\\{(${alternatives})\\*?\\}`, 'g');
}

/**
 * For each line, the verbatim-like environment it lies inside, or null.
 * The \begin and \end lines themselves count as outside.
 * @param {string[]} lines @param {string[]} [extra] @returns {(string|null)[]}
 */
function verbatimLines(lines, extra = []) {
  const re = envPattern(verbatimEnvironments(lines, extra));
  /** @type {(string|null)[]} */
  const out = [];
  /** @type {string|null} */
  let open = null;
  for (const line of lines) {
    out.push(open);
    re.lastIndex = 0;
    /** @type {RegExpExecArray | null} */
    let m;
    // Inside verbatim only the matching \end counts; outside, comments hide \begin.
    const text = open ? line : uncommented(line);
    while ((m = re.exec(text))) {
      if (open === null && m[1] === 'begin') open = m[2];
      else if (open !== null && m[1] === 'end' && m[2] === open) open = null;
    }
  }
  return out;
}

/**
 * Is a line inside a verbatim-like environment, where % is not a comment?
 * @param {string[]} lines @param {number} line @param {string[]} [extra]
 */
function insideVerbatim(lines, line, extra = []) {
  return verbatimLines(lines.slice(0, line + 1), extra)[line] != null;
}

/**
 * Inline material on one line where % is not a comment: \verb, \lstinline, \mintinline,
 * and the URL argument of \url, \path, \nolinkurl and \href. An argument left open runs
 * to the end of the line.
 * @param {string} line
 * @returns {{command: string, start: number, end: number}[]} start at the backslash, end after the closing delimiter
 */
function inlineVerbatimSpans(line) {
  /** @type {{command: string, start: number, end: number}[]} */
  const spans = [];
  const re = /\\(verb\*?|lstinline|mintinline|url|path|nolinkurl|href)(?![A-Za-z@])/g;
  /** @type {RegExpExecArray | null} */
  let m;
  while ((m = re.exec(line))) {
    // An odd run of backslashes before it makes this \\ followed by letters, not a command.
    if ((/\\*$/.exec(line.slice(0, m.index)) || [''])[0].length % 2) continue;
    const command = m[1].replace('*', '');
    let i = m.index + m[0].length;
    const skipSpaces = () => { if (command !== 'verb') while (line[i] === ' ' || line[i] === '\t') i++; };
    const optional = () => { skipSpaces(); if (line[i] === '[') { const e = line.indexOf(']', i); i = e < 0 ? line.length : e + 1; } };
    /** Braced argument without nesting (verbatim) or with nesting (URLs). @param {boolean} nested */
    const braced = nested => {
      let depth = 0;
      for (; i < line.length; i++) {
        if (nested && line[i] === '\\') { i++; continue; }
        if (line[i] === '{') { if (nested || depth === 0) depth++; }
        else if (line[i] === '}' && --depth === 0) { i++; return; }
      }
    };
    const delimited = () => {
      if (i >= line.length) return;
      if (line[i] === '{' && command !== 'verb') { braced(command === 'url' || command === 'path' || command === 'nolinkurl' || command === 'href'); return; }
      const d = line[i], e = line.indexOf(d, i + 1);
      i = e < 0 ? line.length : e + 1;
    };
    if (command === 'lstinline') optional();
    if (command === 'mintinline') { optional(); skipSpaces(); if (line[i] === '{') braced(false); }
    if (command === 'href') { optional(); }
    skipSpaces();
    delimited();
    spans.push({ command: '\\' + command, start: m.index, end: Math.max(i, m.index + m[0].length) });
    re.lastIndex = Math.max(re.lastIndex, i);
  }
  return spans;
}

/**
 * Why markers can't go at a position or around a range, or null when they can.
 * Checks verbatim-like environments (built-in, document-defined and extra names)
 * on every line of the range, and inline verbatim and URL arguments at both ends.
 * @param {string[]} lines
 * @param {{line: number, character: number}} start
 * @param {{line: number, character: number}} [end]
 * @param {string[]} [extra]
 * @returns {string | null}
 */
function verbatimProblem(lines, start, end = start, extra = []) {
  const inside = verbatimLines(lines.slice(0, end.line + 1), extra);
  for (let i = start.line; i <= end.line; i++) {
    if (inside[i]) return `this spot is inside the ${inside[i]} environment, where % is not a comment. Markers can't go here.`;
  }
  for (const pos of start === end ? [start] : [start, end]) {
    for (const s of inlineVerbatimSpans(lines[pos.line] || '')) {
      if (pos.character > s.start && pos.character < s.end) {
        return `this spot is inside a ${s.command} argument, where % is not a comment. Markers can't go here.`;
      }
    }
  }
  return null;
}

/**
 * Why a passage can't be wrapped in markers at a range, or null. Shared by every command
 * that inserts markers, so they refuse the same places:
 * - a position inside a verbatim-like environment or an inline verbatim/URL argument
 *   (verbatimProblem);
 * - a selection containing marker, source or review lines, the \begin or \end of a
 *   verbatim-like environment, or inline verbatim/URL commands.
 * @param {string[]} lines
 * @param {{line: number, character: number}} start
 * @param {{line: number, character: number}} end
 * @param {string[]} [extra]
 * @returns {string | null}
 */
function markerRangeProblem(lines, start, end, extra = []) {
  const problem = verbatimProblem(lines, start, end, extra);
  if (problem) return problem;
  if (start.line === end.line && start.character === end.character) return null;
  const envs = envPattern(verbatimEnvironments(lines, extra));
  const last = end.character === 0 && end.line > start.line ? end.line - 1 : end.line;
  for (let i = start.line; i <= last; i++) {
    const line = lines[i] || '';
    const from = i === start.line ? start.character : 0, to = i === end.line ? end.character : line.length;
    envs.lastIndex = 0;
    if (parseMarkerLine(line) || isSourceComment(line) || /^\s*%\s*authorship-review:/.test(line) || envs.test(line) ||
        inlineVerbatimSpans(line).some(s => s.start < to && s.end > from)) {
      return 'select passage text without marker lines or verbatim commands.';
    }
  }
  return null;
}

/**
 * Find colour values on one line, in \AuthorshipColor{<who>}{<colour>} and in every stop of
 * \AuthorshipGradient{<who>}{<colour>, <colour>, ...}.
 * A colour is either three numbers 0–1 ("0.80 0.05 0.45", commas allowed) or hex ("#cc0d73").
 * Gradient stops are separated by commas, or by semicolons when the numbers themselves use commas.
 * @param {string} line
 * @returns {{name: string | null, start: number, end: number, rgb: number[], stop: number}[]}
 *   start/end delimit the colour text; stop is -1 for \AuthorshipColor, else the stop's index
 */
function findAuthorshipColors(line) {
  /** @type {{name: string | null, start: number, end: number, rgb: number[], stop: number}[]} */
  const out = [];
  const re = /\\Authorship(Color|Gradient)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/dg;
  /** @type {RegExpExecArray | null} */
  let m;
  while ((m = re.exec(line))) {
    const match = m;
    const name = match[2].trim();
    const arg = match[3];
    const base = match.indices && match.indices[3] ? match.indices[3][0] : -1;
    if (base < 0) continue;
    const isColor = match[1] === 'Color';
    const pieces = isColor ? [arg] : arg.split(arg.includes(';') ? ';' : ',');
    let offset = 0;
    pieces.forEach((piece, i) => {
      const lead = piece.length - piece.trimStart().length;
      const text = piece.trim();
      const rgb = text ? parseColor(text) : null;
      if (rgb) {
        const start = base + offset + lead;
        out.push({ name, start, end: start + text.length, rgb, stop: isColor ? -1 : i });
      }
      offset += piece.length + 1;
    });
  }
  // Citation colour is a presentation override, never an author palette entry.
  const citationRe = /\\AuthorshipCitationColor\s*\{([^{}]*)\}/dg;
  while ((m = citationRe.exec(line))) {
    const arg = m[1];
    const text = arg.trim();
    const rgb = parseColor(text);
    const base = m.indices && m.indices[1] ? m.indices[1][0] : -1;
    if (rgb && base >= 0) {
      const start = base + arg.length - arg.trimStart().length;
      out.push({ name: null, start, end: start + text.length, rgb, stop: -1 });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Active (not commented-out) \AuthorshipColor / \AuthorshipGradient settings in a file: name -> rgb
 * (a gradient counts with its first colour).
 * The name is whatever the first argument says: a full key ("&AI: Claude"), a label ("AI: Claude")
 * or a kind ("ai", "human", "reference"). Later lines win, as in LaTeX.
 * @param {string[]} lines
 * @returns {Map<string, number[]>}
 */
function collectColors(lines) {
  /** @type {Map<string, number[]>} */
  const map = new Map();
  for (const line of lines) {
    if (!line.includes('\\AuthorshipColor') && !line.includes('\\AuthorshipGradient')) continue;
    // a gradient tints the editor with its first stop
    for (const c of findAuthorshipColors(stripComment(line))) if (c.name !== null && c.stop <= 0) map.set(c.name, c.rgb);
  }
  return map;
}

/**
 * Name set with \AuthorshipOwner{...} for your own (unmarked) text, if any. Last active line wins.
 * @param {string[]} lines
 * @returns {string | null}
 */
function findOwner(lines) {
  let owner = null;
  for (const line of lines) {
    if (!line.includes('\\AuthorshipOwner')) continue;
    const m = /\\AuthorshipOwner\s*\{([^{}]*)\}/.exec(stripComment(line));
    if (m && m[1].trim()) owner = m[1].trim();
  }
  return owner;
}

/**
 * Colour for an author from \AuthorshipColor settings, using the same order as the LaTeX package:
 * full key, then label, then kind.
 * @param {Map<string, number[]>} map @param {string} key
 * @returns {number[] | undefined}
 */
function lookupColor(map, key) {
  const mk = parseMarkerLine(openTag(key));
  if (!mk) return map.get(key);
  return map.get(key) || map.get(mk.label) || map.get(mk.kind);
}

/** @param {string} text */
function isHexColor(text) { return /^#?[0-9a-f]{6}$/i.test(text.trim()); }

/** @param {string} text @returns {number[] | null} */
function parseColor(text) {
  const t = text.trim();
  if (isHexColor(t)) {
    const h = t.replace('#', '');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const m = /^([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)$/.exec(t);
  if (!m) return null;
  const rgb = [m[1], m[2], m[3]].map(Number);
  return rgb.every(v => v >= 0 && v <= 1) ? rgb : null;
}

/** @param {number[]} rgb @param {'hex'|'decimal'} style */
function formatColor(rgb, style) {
  const c = rgb.map(v => Math.min(1, Math.max(0, v)));
  if (style === 'hex') return '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  return c.map(v => v.toFixed(2)).join(' ');
}

module.exports = {
  findAuthorshipColors, collectColors, lookupColor, findOwner, parseColor, formatColor, isHexColor,
  MARKER_RE, PREFIX_KIND, KIND_PREFIX,
  parseMarkerLine, parseDocument, blockAt, wrapText, countByAuthor, bodyRange, countWords, insideVerbatim, verbatimEnvironments, verbatimLines, inlineVerbatimSpans, verbatimProblem, markerRangeProblem,
  authorKey, openTag, closeTag, stripComment,
  sourceComment, sourceKey, isSourceComment,
};
