'use strict';
const fs = require('node:fs');
const path = require('node:path');

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SECTION = /^## \[([^\]]*)\](.*)$/;
const LINK = /^\[[^\]]+\]:\s/;

/**
 * Return the date and notes of one released version from Keep a Changelog text.
 * @param {string} text
 * @param {string} version
 */
function releaseNotes(text, version) {
  if (!VERSION.test(version)) throw Error(`Expected a MAJOR.MINOR.PATCH version, got ${JSON.stringify(version)}`);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const starts = lines.flatMap((line, i) => SECTION.exec(line)?.[1] === version ? [i] : []);
  const heading = `"## [${version}] - YYYY-MM-DD"`;
  if (starts.length === 0) throw Error(`CHANGELOG.md has no ${heading} section; move the Unreleased entries into it`);
  if (starts.length > 1) throw Error(`CHANGELOG.md has more than one section for ${version}`);
  const start = starts[0];
  const date = /^ - (\d{4}-\d{2}-\d{2})$/.exec(SECTION.exec(lines[start])?.[2] ?? '')?.[1];
  const parsed = date ? new Date(date + 'T00:00:00Z') : undefined;
  if (!date || !parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
    throw Error(`CHANGELOG.md section ${version} needs a valid date: ${heading}`);
  let end = lines.findIndex((line, i) => i > start && (line.startsWith('## ') || LINK.test(line)));
  if (end < 0) end = lines.length;
  const notes = lines.slice(start + 1, end).join('\n').trim();
  if (!/^[-*] \S/m.test(notes)) throw Error(`CHANGELOG.md section ${version} has no entries`);
  return { date, notes };
}

/**
 * Join hard-wrapped Markdown lines, because GitHub release notes render each newline
 * as a line break. Blank lines, headings, list items, quotes, tables and code fences stay.
 * @param {string} markdown
 */
function unwrap(markdown) {
  /** @type {string[]} */
  const out = [];
  let fenced = false, joinable = false;
  for (const line of markdown.split('\n')) {
    const fence = /^\s*(```|~~~)/.test(line);
    if (!fenced && !fence && joinable && line.trim() && !/^\s*([-*+>|#]|\d+[.)])(\s|$)/.test(line)) {
      out[out.length - 1] += ' ' + line.trim();
      continue;
    }
    out.push(line);
    if (fence) fenced = !fenced;
    joinable = !fenced && !fence && line.trim() !== '' && !/^\s*(#|\|)/.test(line);
  }
  return out.join('\n');
}

/** @param {string} root @param {string} version */
function validate(root, version) {
  const file = path.join(root, 'CHANGELOG.md');
  if (!fs.existsSync(file)) throw Error('CHANGELOG.md is missing');
  return releaseNotes(fs.readFileSync(file, 'utf8'), version);
}

if (require.main === module) {
  // Prints the notes for a version (default: package.json's) for use as GitHub release notes.
  try {
    const root = path.resolve(__dirname, '..');
    const version = process.argv[2] ?? JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    process.stdout.write(unwrap(validate(root, version).notes) + '\n');
  } catch (e) { console.error(`Changelog check failed: ${/** @type {Error} */ (e).message}`); process.exitCode = 1; }
}
module.exports = { releaseNotes, unwrap, validate };
