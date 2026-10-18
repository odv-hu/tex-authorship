// @ts-check
'use strict';

const vscode = require('vscode');
const path = require('path');
const M = require('./markers');

/** @typedef {{label: string, kind: import('./markers').AuthorKind, color: string, key: string}} Author */

const DEFAULT_COLORS = { ai: '#e0218a', human: '#2f6fdd', reference: '#8a8a8a' };
const KIND_ICON = { ai: '$(sparkle)', human: '$(person)', reference: '$(book)' };

/** @type {Map<string, vscode.TextEditorDecorationType>} */
let authorDecorations = new Map();
/** @type {vscode.TextEditorDecorationType | undefined} */
let markerDecoration;
/** @type {vscode.DiagnosticCollection} */
let diagnostics;
/** @type {vscode.StatusBarItem} */
let statusItem;
/** @type {NodeJS.Timeout | undefined} */
let refreshTimer;

function cfg() { return vscode.workspace.getConfiguration('texAuthorship'); }

/** @returns {string[]} */
function languages() { return cfg().get('languages') || ['latex', 'tex']; }

/** @param {vscode.TextDocument | undefined} doc */
function isTex(doc) { return !!doc && languages().includes(doc.languageId); }

/** Authors from the settings. @returns {Author[]} */
function configuredAuthors() {
  /** @type {any[]} */
  const raw = cfg().get('authors') || [];
  /** @type {Author[]} */
  const out = [];
  for (const a of raw) {
    if (!a || typeof a.label !== 'string' || !a.label.trim()) continue;
    /** @type {import('./markers').AuthorKind} */
    const kind = ['ai', 'human', 'reference'].includes(a.kind) ? a.kind : 'human';
    out.push({ label: a.label.trim(), kind, color: a.color || DEFAULT_COLORS[kind], key: M.authorKey(kind, a.label) });
  }
  return out;
}

/** Find an author by key, falling back to a default colour for authors only found in the file. */
function authorFor(/** @type {string} */ key) {
  const known = configuredAuthors().find(a => a.key === key);
  if (known) return known;
  const mk = M.parseMarkerLine(M.openTag(key));
  const kind = mk ? mk.kind : 'human';
  return { label: mk ? mk.label : key, kind, color: DEFAULT_COLORS[kind], key };
}

/** "#rrggbb" + opacity -> rgba(); anything else is passed through. */
function tint(/** @type {string} */ color, /** @type {number} */ alpha) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!m) return color;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function disposeDecorations() {
  for (const d of authorDecorations.values()) d.dispose();
  authorDecorations.clear();
  if (markerDecoration) markerDecoration.dispose();
  markerDecoration = undefined;
}

function decorationFor(/** @type {string} */ key) {
  let d = authorDecorations.get(key);
  if (!d) {
    const a = authorFor(key);
    const alpha = /** @type {number} */ (cfg().get('backgroundOpacity')) ?? 0.14;
    d = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: tint(a.color, alpha),
      overviewRulerColor: tint(a.color, 0.8),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    authorDecorations.set(key, d);
  }
  return d;
}

function getMarkerDecoration() {
  if (!markerDecoration) {
    markerDecoration = vscode.window.createTextEditorDecorationType({
      opacity: String(cfg().get('markerOpacity') ?? 0.4),
      fontStyle: 'italic',
    });
  }
  return markerDecoration;
}

/** @param {vscode.TextDocument} doc */
function docLines(doc) {
  const lines = new Array(doc.lineCount);
  for (let i = 0; i < doc.lineCount; i++) lines[i] = doc.lineAt(i).text;
  return lines;
}

/** @param {vscode.TextEditor} editor */
function decorate(editor) {
  const doc = editor.document;
  const enabled = cfg().get('highlight') !== false;
  const lines = docLines(doc);
  const parsed = M.parseDocument(lines);

  /** @type {Map<string, vscode.Range[]>} */
  const byAuthor = new Map();
  /** @type {vscode.Range[]} */
  const markerRanges = [];
  for (let i = 0; i < lines.length; i++) {
    const key = parsed.lineAuthor[i];
    if (parsed.isMarker[i]) markerRanges.push(doc.lineAt(i).range);
    if (!key) continue;
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    /** @type {vscode.Range[]} */ (byAuthor.get(key)).push(new vscode.Range(i, 0, i, 0));
  }
  for (const [key, d] of authorDecorations) if (!byAuthor.has(key) || !enabled) editor.setDecorations(d, []);
  if (enabled) for (const [key, ranges] of byAuthor) editor.setDecorations(decorationFor(key), ranges);
  editor.setDecorations(getMarkerDecoration(), enabled ? markerRanges : []);

  diagnostics.set(doc.uri, parsed.problems.map(p => {
    const d = new vscode.Diagnostic(doc.lineAt(p.line).range, p.message, vscode.DiagnosticSeverity.Warning);
    d.source = 'authorship';
    return d;
  }));
  return { lines, parsed };
}

/** @param {vscode.TextEditor | undefined} editor */
function updateStatus(editor) {
  if (!editor || !isTex(editor.document)) { statusItem.hide(); return; }
  const lines = docLines(editor.document);
  const { counts, total } = M.countByAuthor(lines);
  if (!total) { statusItem.hide(); return; }
  const parts = [];
  const tip = [];
  const pct = (/** @type {number} */ n) => `${Math.round((100 * n) / total)}%`;
  const mine = counts.get('') || 0;
  parts.push(`$(edit) ${pct(mine)}`);
  tip.push(`Mine: ${mine.toLocaleString()} characters (${pct(mine)})`);
  for (const [key, n] of [...counts].filter(([k]) => k).sort((a, b) => b[1] - a[1])) {
    const a = authorFor(key);
    parts.push(`${KIND_ICON[a.kind]} ${pct(n)}`);
    tip.push(`${a.label}: ${n.toLocaleString()} characters (${pct(n)})`);
  }
  statusItem.text = parts.join('  ');
  statusItem.tooltip = `Authorship in this file (visible characters, comments excluded)\n\n${tip.join('\n')}`;
  statusItem.show();
}

function refreshAll() {
  for (const ed of vscode.window.visibleTextEditors) if (isTex(ed.document)) decorate(ed);
  updateStatus(vscode.window.activeTextEditor);
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshAll, 120);
}

/** Authors offered when pasting or marking: the configured ones plus any already used in this file. */
function authorChoices(/** @type {vscode.TextDocument | undefined} */ doc) {
  const list = configuredAuthors();
  if (doc) {
    for (const b of M.parseDocument(docLines(doc)).blocks) {
      if (!list.some(a => a.key === b.key)) list.push(authorFor(b.key));
    }
  }
  return list;
}

/** @param {Author[]} list @param {string} title @param {boolean} includeMine */
async function pickAuthor(list, title, includeMine) {
  /** @type {(vscode.QuickPickItem & {author?: Author})[]} */
  const items = [];
  if (includeMine) items.push({ label: '$(edit) Mine', description: 'plain paste, no markers' });
  for (const a of list) items.push({ label: `${KIND_ICON[a.kind]} ${a.label}`, description: a.kind, author: a });
  const picked = await vscode.window.showQuickPick(items, { title, placeHolder: 'Who wrote this text?' });
  if (!picked) return undefined;
  return picked.author || null; // null = mine
}

/** @param {vscode.TextDocument} doc */
function eolOf(doc) { return doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'; }

/** @param {string} text @param {string} eol */
function normalizeEol(text, eol) { return text.replace(/\r?\n/g, eol); }

/** Build the wrapped replacement for a range. */
function wrappedFor(/** @type {vscode.TextDocument} */ doc, /** @type {vscode.Range} */ range, /** @type {string} */ text, /** @type {string} */ key) {
  const before = doc.lineAt(range.start.line).text.slice(0, range.start.character);
  const after = doc.lineAt(range.end.line).text.slice(range.end.character);
  const eol = eolOf(doc);
  return M.wrapText(before, after, normalizeEol(text, eol), key, eol);
}

function verbatimGuard(/** @type {vscode.TextDocument} */ doc, /** @type {number} */ line) {
  if (M.insideVerbatim(docLines(doc), line)) {
    vscode.window.showWarningMessage('Authorship: this spot is inside a verbatim-like environment, where % is not a comment. Markers can\'t go here.');
    return true;
  }
  return false;
}

// ---------- commands ----------

async function cmdPasteAs() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const text = await vscode.env.clipboard.readText();
  if (!text) { vscode.window.showInformationMessage('Authorship: the clipboard has no text.'); return; }
  const author = await pickAuthor(authorChoices(doc), 'Paste as…', true);
  if (author === undefined) return;
  if (author === null) {
    await editor.edit(eb => { for (const sel of editor.selections) eb.replace(sel, text); });
    return;
  }
  if (editor.selections.length > 1) { vscode.window.showWarningMessage('Authorship: paste as an author works with a single cursor.'); return; }
  const sel = editor.selection;
  if (verbatimGuard(doc, sel.start.line)) return;
  await editor.edit(eb => eb.replace(sel, wrappedFor(doc, sel, text, author.key)));
}

async function cmdMarkSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const sel = editor.selection;
  if (sel.isEmpty) { vscode.window.showInformationMessage('Authorship: select the text to mark first.'); return; }
  if (verbatimGuard(doc, sel.start.line)) return;
  const author = await pickAuthor(authorChoices(doc), 'Mark selection as…', false);
  if (!author) return;
  const text = doc.getText(sel);
  await editor.edit(eb => eb.replace(sel, wrappedFor(doc, sel, text, author.key)));
}

async function cmdUnmark() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const parsed = M.parseDocument(docLines(doc));
  const b = M.blockAt(parsed, editor.selection.active.line);
  if (!b) { vscode.window.showInformationMessage('Authorship: the cursor is not inside a marked passage.'); return; }
  const fullLine = (/** @type {number} */ i) =>
    i + 1 < doc.lineCount ? new vscode.Range(i, 0, i + 1, 0) : doc.lineAt(i).rangeIncludingLineBreak;
  await editor.edit(eb => {
    if (b.closeLine !== -1) eb.delete(fullLine(b.closeLine));
    eb.delete(fullLine(b.openLine));
  });
}

async function cmdStats() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isTex(editor.document)) return;
  const { counts, total } = M.countByAuthor(docLines(editor.document));
  if (!total) { vscode.window.showInformationMessage('Authorship: no text to count.'); return; }
  const pct = (/** @type {number} */ n) => `${((100 * n) / total).toFixed(1)}%`;
  const rows = [...counts].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k ? authorFor(k).label : 'Mine'}: ${pct(n)} (${n.toLocaleString()})`);
  vscode.window.showInformationMessage(`Authorship of ${path.basename(editor.document.fileName)} — ${rows.join(' · ')}`);
}

async function cmdToggle() {
  const on = cfg().get('highlight') !== false;
  await cfg().update('highlight', !on, vscode.ConfigurationTarget.Global);
}

/** @param {vscode.ExtensionContext} context */
async function cmdCopyPackage(context) {
  const editor = vscode.window.activeTextEditor;
  /** @type {vscode.Uri | undefined} */
  let dir;
  if (editor && editor.document.uri.scheme === 'file') dir = vscode.Uri.file(path.dirname(editor.document.uri.fsPath));
  else if (vscode.workspace.workspaceFolders) dir = vscode.workspace.workspaceFolders[0].uri;
  if (!dir) { vscode.window.showWarningMessage('Authorship: open a .tex file first.'); return; }
  for (const f of ['authorship.sty', 'authorship.lua']) {
    const src = vscode.Uri.joinPath(context.extensionUri, 'latex', f);
    await vscode.workspace.fs.copy(src, vscode.Uri.joinPath(dir, f), { overwrite: true });
  }
  vscode.window.showInformationMessage(`Authorship: copied authorship.sty and authorship.lua to ${dir.fsPath}. Add \\usepackage{authorship} to your preamble.`);
}

async function cmdBuildDraft() {
  const recipe = cfg().get('draftRecipe') || 'latexmk (lualatex)';
  try {
    await vscode.commands.executeCommand('latex-workshop.recipes', recipe);
  } catch (e) {
    vscode.window.showWarningMessage(`Authorship: could not run the LaTeX Workshop recipe "${recipe}". Is LaTeX Workshop installed?`);
  }
}

// ---------- paste options ----------

const PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append('authorship');

/** @type {vscode.DocumentPasteEditProvider} */
const pasteProvider = {
  async provideDocumentPasteEdits(doc, ranges, dataTransfer, _context, token) {
    if (ranges.length !== 1) return;
    const item = dataTransfer.get('text/plain');
    if (!item) return;
    const text = await item.asString();
    if (!text || token.isCancellationRequested) return;
    const range = ranges[0];
    if (M.insideVerbatim(docLines(doc), range.start.line)) return;

    // Plain paste stays first, so nothing changes unless you pick another option.
    const mine = new vscode.DocumentPasteEdit(text, 'Paste as mine', PASTE_KIND.append('mine'));
    mine.yieldTo = [vscode.DocumentDropOrPasteEditKind.Text];
    const edits = [mine];
    for (const a of authorChoices(doc)) {
      const slug = a.key.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'author';
      const e = new vscode.DocumentPasteEdit(wrappedFor(doc, range, text, a.key), `Paste as ${a.label}`, PASTE_KIND.append(slug));
      e.yieldTo = [vscode.DocumentDropOrPasteEditKind.Text, PASTE_KIND.append('mine')];
      edits.push(e);
    }
    return edits;
  },
};

// ---------- lifecycle ----------

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection('authorship');
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'texAuthorship.showStats';

  const selector = languages().map(language => ({ language }));
  context.subscriptions.push(
    diagnostics,
    statusItem,
    vscode.languages.registerDocumentPasteEditProvider(selector, pasteProvider, {
      providedPasteEditKinds: [PASTE_KIND],
      pasteMimeTypes: ['text/plain'],
    }),
    vscode.commands.registerCommand('texAuthorship.pasteAs', cmdPasteAs),
    vscode.commands.registerCommand('texAuthorship.markSelection', cmdMarkSelection),
    vscode.commands.registerCommand('texAuthorship.unmark', cmdUnmark),
    vscode.commands.registerCommand('texAuthorship.showStats', cmdStats),
    vscode.commands.registerCommand('texAuthorship.toggleHighlight', cmdToggle),
    vscode.commands.registerCommand('texAuthorship.copyLatexPackage', () => cmdCopyPackage(context)),
    vscode.commands.registerCommand('texAuthorship.buildDraft', cmdBuildDraft),
    vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh()),
    vscode.window.onDidChangeVisibleTextEditors(() => scheduleRefresh()),
    vscode.workspace.onDidChangeTextDocument(e => { if (isTex(e.document)) scheduleRefresh(); }),
    vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri)),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('texAuthorship')) { disposeDecorations(); refreshAll(); }
    }),
    { dispose: disposeDecorations },
  );
  refreshAll();
}

function deactivate() {}

module.exports = { activate, deactivate };
