// @ts-check
'use strict';

const vscode = require('vscode');
const path = require('path');
const M = require('./markers');
const T = require('./texinstall');
const R = require('./references');
const V = require('./reviews');

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

// ---------- \AuthorshipColor and \AuthorshipOwner from the files ----------

/** @typedef {{colors: Map<string, number[]>, owner: string | null}} FileInfo */
/** Settings found per .tex file (fsPath -> info), kept current as files change. */
/** @type {Map<string, FileInfo>} */
const fileInfo = new Map();

/** @param {string} fsPath @param {string[]} lines */
function rememberFile(fsPath, lines) {
  const colors = M.collectColors(lines);
  const owner = M.findOwner(lines);
  if (colors.size || owner) fileInfo.set(fsPath, { colors, owner }); else fileInfo.delete(fsPath);
}

/**
 * Other .tex files whose settings apply to a document: those in the same folder or any folder
 * above it (where a main file usually sits), nearest first.
 * @param {vscode.TextDocument} doc @returns {FileInfo[]}
 */
function relatedFiles(doc) {
  if (doc.uri.scheme !== 'file') return [];
  const dir = path.dirname(doc.uri.fsPath);
  return [...fileInfo]
    .filter(([p]) => p !== doc.uri.fsPath)
    .map(([p, info]) => ({ dir: path.dirname(p), info }))
    .filter(f => dir === f.dir || dir.startsWith(f.dir + path.sep))
    .sort((a, b) => b.dir.length - a.dir.length)
    .map(f => f.info);
}

/** Name for your own text: \AuthorshipOwner in this file or a related one, then the setting. */
function ownerFor(/** @type {vscode.TextDocument | undefined} */ doc) {
  if (doc) {
    const own = M.findOwner(docLines(doc));
    if (own) return own;
    for (const f of relatedFiles(doc)) if (f.owner) return f.owner;
  }
  return /** @type {string} */ (cfg().get('ownerName')) || 'Mine';
}

async function scanWorkspaceColors() {
  try {
    const uris = await vscode.workspace.findFiles('**/*.tex', '**/node_modules/**', 1000);
    for (const uri of uris) {
      try {
        const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
        if (text.includes('\\Authorship')) rememberFile(uri.fsPath, text.split(/\r?\n/));
      } catch { /* unreadable file: skip */ }
    }
  } catch { /* no workspace */ }
  scheduleRefresh();
}

/**
 * Colour sources for a document, most specific first: the document itself, then .tex files
 * in the same folder or any folder above it (where a main file usually sits).
 * @param {vscode.TextDocument} doc @param {string[]} lines
 */
function colorMapsFor(doc, lines) {
  return [M.collectColors(lines), ...relatedFiles(doc).map(f => f.colors)];
}

/** Hex colour for an author: \AuthorshipColor in the files, then settings, then the default. */
function resolveColor(/** @type {string} */ key, /** @type {Map<string, number[]>[]} */ maps) {
  for (const map of maps) {
    const rgb = M.lookupColor(map, key);
    if (rgb) return M.formatColor(rgb, 'hex');
  }
  return authorFor(key).color;
}

function decorationFor(/** @type {string} */ key, /** @type {string} */ color, /** @type {{review:import('./reviews').Review, stale:boolean} | undefined} */ review) {
  const id = `${key}|${color}|${JSON.stringify(review)}`;
  let d = authorDecorations.get(id);
  if (!d) {
    const alpha = /** @type {number} */ (cfg().get('backgroundOpacity')) ?? 0.14;
    d = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: tint(color, review && !review.stale ? alpha * 0.4 : alpha),
      overviewRulerColor: tint(color, 0.8),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    authorDecorations.set(id, d);
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

/** @param {vscode.TextEditor} editor @param {Set<vscode.TextEditorDecorationType>} used */
function decorate(editor, used) {
  const doc = editor.document;
  const enabled = cfg().get('highlight') !== false;
  const lines = docLines(doc);
  const parsed = M.parseDocument(lines);
  const maps = colorMapsFor(doc, lines);
  const reviewInfo = V.collect(lines,parsed);
  const styles = new Map();

  /** @type {Map<string, vscode.DecorationOptions[]>} */
  const byAuthor = new Map();
  /** @type {vscode.Range[]} */
  const markerRanges = [];
  for (let i = 0; i < lines.length; i++) {
    const key = parsed.lineAuthor[i];
    if (parsed.isMarker[i]) markerRanges.push(doc.lineAt(i).range);
    if (!key) continue;
    const block = M.blockAt(parsed,i);
    const review = block ? reviewInfo.reviews.get(block.openLine) : undefined;
    const id = key + '|' + (review ? JSON.stringify(review) : '');
    styles.set(id,{key,review});
    if (!byAuthor.has(id)) byAuthor.set(id, []);
    const label = review ? `${review.stale ? 'Changed since review' : review.review.status === 'revised' ? 'Revised' : 'Reviewed'} · ${review.review.by} (AI origin retained)` : undefined;
    const option = {range: doc.lineAt(i).range, hoverMessage:label,
      renderOptions: review && block && i === block.openLine ? {after:{contentText:'  ' + label,color:review.review.color === '#000000' ? new vscode.ThemeColor('editor.foreground') : review.review.color}} : undefined};
    /** @type {vscode.DecorationOptions[]} */ (byAuthor.get(id)).push(option);
  }
  /** @type {Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>} */
  const wanted = new Map();
  if (enabled) {
    for (const [key, ranges] of byAuthor) {
      const style = styles.get(key);
      const d = decorationFor(style.key, resolveColor(style.key, maps), style.review);
      wanted.set(d, ranges);
      used.add(d);
    }
  }
  for (const d of authorDecorations.values()) editor.setDecorations(d, wanted.get(d) || []);
  editor.setDecorations(getMarkerDecoration(), enabled ? markerRanges : []);

  diagnostics.set(doc.uri, [...parsed.problems,...reviewInfo.problems].map(p => {
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
  tip.push(`${ownerFor(editor.document)}: ${mine.toLocaleString()} characters (${pct(mine)})`);
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
  /** @type {Set<vscode.TextEditorDecorationType>} */
  const used = new Set();
  for (const ed of vscode.window.visibleTextEditors) if (isTex(ed.document)) decorate(ed, used);
  // drop tints for colours nobody uses any more (e.g. after picking a new colour)
  for (const [id, d] of authorDecorations) if (!used.has(d)) { d.dispose(); authorDecorations.delete(id); }
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

/** @param {Author[]} list @param {string} title @param {string | null} ownerName  null = don't offer plain */
async function pickAuthor(list, title, ownerName) {
  /** @type {(vscode.QuickPickItem & {author?: Author})[]} */
  const items = [];
  if (ownerName) items.push({ label: `$(edit) ${ownerName}`, description: 'plain paste, no markers' });
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

/** Refuse stale edits after an asynchronous picker. */
function currentDocument(/** @type {vscode.TextEditor} */ editor, /** @type {number} */ version) {
  if (editor.document.isClosed || editor.document.version !== version || vscode.window.activeTextEditor !== editor) {
    vscode.window.showWarningMessage('Authorship: the document changed while choosing a source. Please select the passage again.');
    return false;
  }
  return true;
}

/** @param {vscode.TextDocument} doc @param {vscode.Range} range */
function safeRange(doc, range) {
  const lines = docLines(doc);
  const end = range.end.character === 0 && range.end.line > range.start.line ? range.end.line - 1 : range.end.line;
  for (let i = range.start.line; i <= end; i++) {
    if (verbatimGuard(doc, i)) return false;
    if (M.parseMarkerLine(lines[i]) || M.isSourceComment(lines[i]) || V.isReview(lines[i]) || /\\(?:begin|end)\{(?:verbatim|Verbatim|lstlisting|minted|comment|alltt|filecontents)\*?\}/.test(lines[i]) || /\\(?:verb\*?|url)\b/.test(lines[i])) {
      vscode.window.showWarningMessage('Authorship: select passage text without marker lines or verbatim commands.');
      return false;
    }
  }
  return true;
}

/** @param {string} text @param {string | null} source @param {string} eol */
function withSource(text, source, eol) { return source ? M.sourceComment(source) + eol + text : text; }

async function cmdPasteAs() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document, version = doc.version;
  const selections = [...editor.selections], sel = editor.selection;
  const text = await vscode.env.clipboard.readText();
  if (!text) { vscode.window.showInformationMessage('Authorship: the clipboard has no text.'); return; }
  const author = await pickAuthor(authorChoices(doc), 'Paste as…', ownerFor(doc));
  if (author === undefined || !currentDocument(editor, version)) return;
  if (author === null) {
    await editor.edit(eb => { for (const selection of selections) eb.replace(selection, text); });
    return;
  }
  if (selections.length > 1) { vscode.window.showWarningMessage('Authorship: paste as an author works with a single cursor.'); return; }
  if (!safeRange(doc, sel)) return;
  const source = author.kind === 'reference' ? await R.pickSource(doc) : null;
  if (source === undefined || !currentDocument(editor,version)) return;
  await editor.edit(eb => eb.replace(sel, wrappedFor(doc, sel, withSource(text,source,eolOf(doc)), author.key)));
}

async function cmdMarkSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document, version = doc.version, sel = editor.selection;
  if (editor.selections.length !== 1) { vscode.window.showWarningMessage('Authorship: mark a single selection at a time.'); return; }
  if (sel.isEmpty) { vscode.window.showInformationMessage('Authorship: select the text to mark first.'); return; }
  if (!safeRange(doc, sel)) return;
  const text = doc.getText(sel);
  const author = await pickAuthor(authorChoices(doc), 'Mark selection as…', null);
  if (!author || !currentDocument(editor, version)) return;
  const source = author.kind === 'reference' ? await R.pickSource(doc) : null;
  if (source === undefined || !currentDocument(editor,version)) return;
  await editor.edit(eb => eb.replace(sel, wrappedFor(doc, sel, withSource(text,source,eolOf(doc)), author.key)));
}

async function cmdAssociateSource() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document, version = doc.version, lines = docLines(doc);
  const block = M.blockAt(M.parseDocument(lines), editor.selection.active.line);
  if (!block || block.kind !== 'reference' || block.closeLine < 0) {
    vscode.window.showInformationMessage('Authorship: place the cursor inside a closed reference passage first.'); return;
  }
  const line = block.openLine + 1, hasSource = M.isSourceComment(lines[line] || '');
  const source = await R.pickSource(doc, hasSource ? M.sourceKey(lines[line]) : null);
  if (source === undefined || !currentDocument(editor,version)) return;
  await editor.edit(eb => {
    const replacement = source ? M.sourceComment(source) + eolOf(doc) : '';
    if (hasSource) eb.replace(doc.lineAt(line).rangeIncludingLineBreak,replacement);
    else if (source) eb.insert(new vscode.Position(line,0),replacement);
  });
}

/** @param {'reviewed'|'revised'|'remove'} status */
async function cmdReview(status) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isTex(editor.document)) return;
  const doc=editor.document, version=doc.version, lines=docLines(doc);
  const parsed=M.parseDocument(lines), block=M.blockAt(parsed,editor.selection.active.line);
  if (!block || block.kind!=='ai' || block.closeLine<0 || parsed.problems.some(p=>p.line>=block.openLine && p.line<=block.closeLine)) {
    vscode.window.showInformationMessage('Authorship: place the cursor inside a correctly closed AI passage.');return;
  }
  const line=block.openLine+1, hasReview=V.isReview(lines[line] || '');
  let replacement='';
  if (status!=='remove') {
    const owner=ownerFor(doc), maps=colorMapsFor(doc,lines);
    const reviewers=[{label:owner,description:'Document owner (default)',key:'@'+owner}];
    for (const a of authorChoices(doc)) if (a.kind==='human' && !reviewers.some(r=>r.label===a.label)) reviewers.push({label:a.label,description:'Co-author',key:a.key});
    const reviewer=await vscode.window.showQuickPick(reviewers,{title:`Mark AI passage as ${status}`,placeHolder:'Who reviewed this passage?'});
    if (!reviewer || !currentDocument(editor,version)) return;
    const configured=M.lookupColor(maps[0],reviewer.key) || maps.slice(1).map(m=>M.lookupColor(m,reviewer.key)).find(Boolean);
    const color=configured ? M.formatColor(configured,'hex') : reviewer.label===owner ? '#000000' : resolveColor(reviewer.key,maps);
    replacement=V.comment({version:1,status,by:reviewer.label,color:M.formatColor(M.parseColor(color) || [0,0,0],'hex'),hash:V.fingerprint(lines,block)})+eolOf(doc);
  }
  if (!currentDocument(editor,version)) return;
  await editor.edit(eb=>{
    if (hasReview) eb.replace(doc.lineAt(line).rangeIncludingLineBreak,replacement);
    else if (replacement) eb.insert(new vscode.Position(line,0),replacement);
  });
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
    if (b.kind === 'reference' && b.openLine + 1 < doc.lineCount && M.isSourceComment(doc.lineAt(b.openLine + 1).text)) eb.delete(fullLine(b.openLine + 1));
    if (b.kind === 'ai' && b.openLine + 1 < doc.lineCount && V.isReview(doc.lineAt(b.openLine + 1).text)) eb.delete(fullLine(b.openLine + 1));
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
    .map(([k, n]) => `${k ? authorFor(k).label : ownerFor(editor.document)}: ${pct(n)} (${n.toLocaleString()})`);
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

/**
 * Install or update the bundled LaTeX package in the user's TeX folder (TEXMFHOME).
 * @param {vscode.ExtensionContext} context @param {boolean} explicit  run from the command palette
 */
async function installLatexPackage(context, explicit) {
  try {
    const { dir: home, source } = await T.findTexmfHome();
    const target = T.packageDir(home);
    const sourceDir = vscode.Uri.joinPath(context.extensionUri, 'latex').fsPath;
    const { changed } = T.syncFiles(sourceDir, target);
    const version = T.packageVersion(path.join(target, 'authorship.sty'));
    const wasInstalled = context.globalState.get('latexPackageInstalled');
    await context.globalState.update('latexPackageInstalled', target);
    if (changed.length || explicit) {
      const what = !changed.length ? 'is up to date' : wasInstalled ? 'was updated' : 'was installed';
      const where = source === 'default' ? `${target} (TeX's default location; kpsewhich was not found)` : target;
      vscode.window.showInformationMessage(
        `TeX Authorship: the LaTeX package ${version ? `(${version}) ` : ''}${what} in ${where}. ` +
        '\\usepackage{authorship} now works in every document; a copy next to a document still takes precedence.');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (explicit) vscode.window.showWarningMessage(`TeX Authorship: could not install the LaTeX package (${msg}). Use "Copy LaTeX Package into This Project" instead.`);
    else console.warn('TeX Authorship: LaTeX package install failed:', msg);
  }
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
    const owner = ownerFor(doc);
    const mine = new vscode.DocumentPasteEdit(text, owner === 'Mine' ? 'Paste as mine' : `Paste as ${owner}`, PASTE_KIND.append('mine'));
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

// ---------- colour picker for \AuthorshipColor ----------

/** Pure parsing lives in markers.js; this only adapts it to VS Code. */
/** @type {vscode.DocumentColorProvider} */
const colorProvider = {
  provideDocumentColors(doc) {
    /** @type {vscode.ColorInformation[]} */
    const out = [];
    for (let i = 0; i < doc.lineCount; i++) {
      for (const c of M.findAuthorshipColors(doc.lineAt(i).text)) {
        out.push(new vscode.ColorInformation(
          new vscode.Range(i, c.start, i, c.end),
          new vscode.Color(c.rgb[0], c.rgb[1], c.rgb[2], 1)));
      }
    }
    return out;
  },
  provideColorPresentations(color, context) {
    const original = context.document.getText(context.range);
    const rgb = [color.red, color.green, color.blue];
    return [new vscode.ColorPresentation(M.formatColor(rgb, M.isHexColor(original) ? 'hex' : 'decimal'))];
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
    vscode.languages.registerColorProvider(selector, colorProvider),
    // Menu aliases delegate to native clipboard handling, including paste providers.
    vscode.commands.registerCommand('texAuthorship.clipboardCut', () => vscode.commands.executeCommand('editor.action.clipboardCutAction')),
    vscode.commands.registerCommand('texAuthorship.clipboardCopy', () => vscode.commands.executeCommand('editor.action.clipboardCopyAction')),
    vscode.commands.registerCommand('texAuthorship.clipboardPaste', () => vscode.commands.executeCommand('editor.action.clipboardPasteAction')),
    vscode.commands.registerCommand('texAuthorship.pasteAs', cmdPasteAs),
    vscode.commands.registerCommand('texAuthorship.markSelection', cmdMarkSelection),
    vscode.commands.registerCommand('texAuthorship.unmark', cmdUnmark),
    vscode.commands.registerCommand('texAuthorship.associateReference', cmdAssociateSource),
    vscode.commands.registerCommand('texAuthorship.reviewed', () => cmdReview('reviewed')),
    vscode.commands.registerCommand('texAuthorship.revised', () => cmdReview('revised')),
    vscode.commands.registerCommand('texAuthorship.clearReview', () => cmdReview('remove')),
    vscode.commands.registerCommand('texAuthorship.showStats', cmdStats),
    vscode.commands.registerCommand('texAuthorship.toggleHighlight', cmdToggle),
    vscode.commands.registerCommand('texAuthorship.copyLatexPackage', () => cmdCopyPackage(context)),
    vscode.commands.registerCommand('texAuthorship.installLatexPackage', () => installLatexPackage(context, true)),
    vscode.commands.registerCommand('texAuthorship.buildDraft', cmdBuildDraft),
    vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh()),
    vscode.window.onDidChangeVisibleTextEditors(() => scheduleRefresh()),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (!isTex(e.document)) return;
      if (e.document.uri.scheme === 'file') rememberFile(e.document.uri.fsPath, docLines(e.document));
      scheduleRefresh();
    }),
    vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri)),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('texAuthorship')) { disposeDecorations(); refreshAll(); }
    }),
    { dispose: disposeDecorations },
  );
  refreshAll();
  scanWorkspaceColors();
  if (cfg().get('installLatexPackage') !== false) installLatexPackage(context, false);
}

function deactivate() {}

module.exports = { activate, deactivate };
