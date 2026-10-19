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
 * Count visible (non-whitespace, non-comment) characters per author.
 * Only the body between \begin{document} and \end{document} counts when the file has one.
 * @param {string[]} lines
 * @param {Parsed} [parsed]
 * @returns {{counts: Map<string, number>, total: number}}  key null -> "Mine" stored under ''
 */
function countByAuthor(lines, parsed) {
  parsed = parsed || parseDocument(lines);
  let start = 0, end = lines.length;
  const b = lines.findIndex(l => /\\begin\{document\}/.test(stripComment(l)));
  if (b !== -1) {
    start = b + 1;
    const e = lines.findIndex((l, i) => i > b && /\\end\{document\}/.test(stripComment(l)));
    if (e !== -1) end = e;
  }
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

const VERBATIM_ENVS = ['verbatim', 'Verbatim', 'lstlisting', 'minted', 'comment', 'alltt', 'filecontents'];

/**
 * Is a line inside a verbatim-like environment, where % is not a comment?
 * @param {string[]} lines @param {number} line
 */
function insideVerbatim(lines, line) {
  const re = new RegExp(`\\\\(begin|end)\\{(${VERBATIM_ENVS.join('|')})\\*?\\}`, 'g');
  let open = null;
  for (let i = 0; i < line; i++) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(lines[i]))) open = m[1] === 'begin' ? m[2] : null;
  }
  return open !== null;
}

/**
 * Find colour values on one line, in \AuthorshipColor{<who>}{<colour>} and in every stop of
 * \AuthorshipGradient{<who>}{<colour>, <colour>, ...}.
 * A colour is either three numbers 0–1 ("0.80 0.05 0.45", commas allowed) or hex ("#cc0d73").
 * Gradient stops are separated by commas, or by semicolons when the numbers themselves use commas.
 * @param {string} line
 * @returns {{name: string, start: number, end: number, rgb: number[], stop: number}[]}
 *   start/end delimit the colour text; stop is -1 for \AuthorshipColor, else the stop's index
 */
function findAuthorshipColors(line) {
  /** @type {{name: string, start: number, end: number, rgb: number[], stop: number}[]} */
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
  return out;
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
    for (const c of findAuthorshipColors(stripComment(line))) if (c.stop <= 0) map.set(c.name, c.rgb);
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
  parseMarkerLine, parseDocument, blockAt, wrapText, countByAuthor, insideVerbatim,
  authorKey, openTag, closeTag, stripComment,
};
