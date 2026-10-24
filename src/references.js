// @ts-check
'use strict';
const vscode = require('vscode');
const path = require('path');
const B = require('./bibliography');

/** Prefer unsaved editor buffers. @param {string} file */
async function read(file) {
  const open = vscode.workspace.textDocuments.find(d => d.uri.scheme === 'file' && path.resolve(d.uri.fsPath) === path.resolve(file));
  if (open) { const text = open.getText(); if (text.length > 2000000) throw new Error('File exceeds 2 MB'); return text; }
  const uri = vscode.Uri.file(file);
  if ((await vscode.workspace.fs.stat(uri)).size > 2000000) throw new Error('File exceeds 2 MB');
  return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
}
/** @param {vscode.TextDocument} doc @returns {Promise<string | null | undefined>} */
async function chooseRoot(doc) {
  if (doc.uri.scheme !== 'file') return undefined;
  let current = doc.uri.fsPath;
  const seen = new Set();
  while (!seen.has(current)) {
    seen.add(current);
    try {
      const info = B.texInfo(await read(current));
      if (info.root) {
        current = path.resolve(path.dirname(current), info.root.replace(/^"(.*)"$/, '$1'));
        if (seen.has(current) || seen.size >= 100) { vscode.window.showWarningMessage('Authorship: cyclic or excessive TeX root directives. Select bibliography files manually.'); return undefined; }
        continue;
      }
      if (seen.size > 1 || info.main) return current;
      break;
    } catch { vscode.window.showWarningMessage(`Authorship: cannot read root ${current}. Select bibliography files manually.`); return undefined; }
  }
  if (seen.size > 1) { vscode.window.showWarningMessage('Authorship: cyclic TeX root directives. Select bibliography files manually.'); return undefined; }
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (!folder) return current;
  const candidates = await vscode.workspace.findFiles(new vscode.RelativePattern(folder,'**/*.tex'), '**/{node_modules,.git,dist}/**', 101);
  if (candidates.length > 100) vscode.window.showWarningMessage('Authorship: root search limited to 100 TeX files. Use a % !TeX root directive for large projects.');
  /** @type {string[]} */ const roots = [];
  for (const uri of candidates.slice(0,100)) {
    try {
      if (!B.texInfo(await read(uri.fsPath)).main) continue;
      if ((await B.discover(uri.fsPath,read)).visited.has(current)) roots.push(uri.fsPath);
    } catch { /* unrelated unreadable candidates do not block discovery */ }
  }
  if (roots.length === 1) return roots[0];
  if (!roots.length) return current;
  const picked = await vscode.window.showQuickPick(roots.map(file => ({label: path.relative(folder.uri.fsPath,file),file})), {title:'Choose the main TeX document',placeHolder:'Only this document’s bibliographies will be used'});
  return picked?.file ?? null;
}
/** Select a key; null removes/omits source; undefined cancels.
 * @param {vscode.TextDocument} doc @param {string | null} [existing]
 * @returns {Promise<string | null | undefined>}
 */
async function pickSource(doc, existing = null) {
  const root = await chooseRoot(doc);
  if (root === null) return undefined;
  /** @type {string[]} */ let files = [];
  /** @type {string[]} */ let warnings = [];
  if (root) { const found = await B.discover(root,read); files = found.bibs; warnings = found.warnings; }
  /** @type {import('./bibliography').Entry[]} */ let entries = [];
  const load = async () => {
    entries = [];
    for (const file of [...new Set(files)]) {
      try { const result = B.parseBib(await read(file),file); entries.push(...result.entries); warnings.push(...result.warnings); }
      catch { warnings.push(`Cannot read ${file} (missing, unreadable, or larger than 2 MB).`); }
    }
  };
  await load();
  while (true) {
    const duplicates = B.duplicateKeys(entries);
    const problems = [...warnings, ...[...duplicates].map(key => `Duplicate key ${key}: ${entries.filter(e => e.key === key).map(e => `${e.file}:${e.line}`).join(', ')}`)];
    if (existing && !entries.some(e => e.key === existing)) problems.push(`Current source ${existing} is unresolved. Cancel to keep it.`);
    /** @type {(vscode.QuickPickItem & {key?: string, action?: string})[]} */
    const items = [
      {label: existing ? 'Remove source association' : 'Reference without a source',action:'none'},
      {label:'Choose bibliography files…',description:'Replace the resource list for this selection',action:'files'},
    ];
    if (problems.length) items.push({label:`Bibliography warnings (${problems.length})`,detail: problems.join(' | '),action:'warnings'});
    items.push(...entries.sort((a,b) => a.key.localeCompare(b.key)).map(e => ({
      label:e.key, description:`${e.author || 'Unknown author'} · ${e.year || 'No year'}${duplicates.has(e.key) ? ' · DUPLICATE — unavailable' : ''}`,
      detail:`${e.title || 'Untitled'} — ${vscode.workspace.asRelativePath(e.file)}:${e.line}`,key:e.key,
    })));
    const picked = await vscode.window.showQuickPick(items,{title:'Reference source (no citation will be inserted)',placeHolder: entries.length ? 'Search citation key, author, year or title' : 'No entries found. Choose bibliography files or continue without a source.',matchOnDescription:true,matchOnDetail:true});
    if (!picked) return undefined;
    if (picked.action === 'none') return null;
    if (picked.action === 'warnings') { await vscode.window.showWarningMessage(problems.join('\n'),{modal:true}); continue; }
    if (picked.action === 'files') {
      const chosen = await vscode.window.showOpenDialog({canSelectMany:true,filters:{Bibliography:['bib']},title:'Choose bibliography files used by this document'});
      if (!chosen) continue;
      files = chosen.map(uri => uri.fsPath); warnings = []; await load(); continue;
    }
    if (picked.key && duplicates.has(picked.key)) { await vscode.window.showWarningMessage(`Authorship: ${picked.key} occurs more than once. Correct the bibliography or choose the intended resource files first.`); continue; }
    return picked.key;
  }
}
module.exports = {pickSource};
