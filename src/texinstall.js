// @ts-check
'use strict';

/**
 * Installs the bundled LaTeX package (authorship.sty + authorship.lua) into the user's
 * personal TeX tree (TEXMFHOME), so every document finds \usepackage{authorship} without
 * copies next to it. No VS Code dependency, so it can be tested with plain Node.
 *
 * TeX searches the document's own folder first, so a paper that keeps its own copy
 * keeps using that copy (a way to pin a version).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const FILES = ['authorship.sty', 'authorship.lua'];

/** Where kpsewhich usually lives when VS Code was not started from a shell with TeX on PATH. */
function kpsewhichCandidates(platform = process.platform) {
  const list = ['kpsewhich'];
  if (platform === 'darwin') list.push('/Library/TeX/texbin/kpsewhich', '/opt/homebrew/bin/kpsewhich', '/usr/local/bin/kpsewhich');
  if (platform === 'linux') list.push('/usr/bin/kpsewhich', '/usr/local/bin/kpsewhich');
  if (platform === 'win32') list.push('kpsewhich.exe');
  return list;
}

/** TEXMFHOME when kpsewhich cannot be asked: TeX Live's defaults. */
function defaultTexmfHome(platform = process.platform, home = os.homedir()) {
  return platform === 'darwin' ? path.join(home, 'Library', 'texmf') : path.join(home, 'texmf');
}

/**
 * Turn kpsewhich's answer into a usable folder. It may contain several paths ({a,b} or
 * a list separated by : or ;), a leading ~, or $HOME. Returns null when it is unusable.
 * @param {string} out @param {string} [home] @param {string} [platform]
 */
function parseTexmfHome(out, home = os.homedir(), platform = process.platform) {
  let s = (out || '').trim();
  if (!s) return null;
  s = s.replace(/^\{/, '').replace(/\}$/, '');
  s = s.split(platform === 'win32' ? /[;,]/ : /[:,;]/)[0].trim();
  s = s.replace(/^!!/, '');
  s = s.replace(/^~(?=$|[\\/])/, home).replace(/\$HOME|\$\{HOME\}/g, home);
  if (!s || s.includes('$')) return null;
  return path.resolve(s);
}

/** @param {string} cmd @returns {Promise<string|null>} */
function run(cmd) {
  return new Promise(resolve => {
    execFile(cmd, ['-var-value=TEXMFHOME'], { timeout: 5000 }, (err, stdout) => resolve(err ? null : String(stdout)));
  });
}

/**
 * Find TEXMFHOME: ask kpsewhich (from PATH or the usual install places), else the TeX Live default.
 * @returns {Promise<{dir: string, source: string}>}
 */
async function findTexmfHome(platform = process.platform, home = os.homedir()) {
  for (const cmd of kpsewhichCandidates(platform)) {
    const out = await run(cmd);
    const dir = out && parseTexmfHome(out, home, platform);
    if (dir) return { dir, source: cmd };
  }
  return { dir: defaultTexmfHome(platform, home), source: 'default' };
}

/** Folder inside TEXMFHOME where the package goes. @param {string} texmfHome */
function packageDir(texmfHome) {
  return path.join(texmfHome, 'tex', 'latex', 'authorship');
}

/**
 * Copy the bundled files into the package folder when they differ (or are missing).
 * @param {string} sourceDir  folder with the bundled authorship.sty and authorship.lua
 * @param {string} targetDir
 * @returns {{changed: string[], targetDir: string}}
 */
function syncFiles(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const changed = [];
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(sourceDir, f));
    const dst = path.join(targetDir, f);
    let same = false;
    try { same = fs.readFileSync(dst).equals(src); } catch { /* missing */ }
    if (!same) { fs.writeFileSync(dst, src); changed.push(f); }
  }
  return { changed, targetDir };
}

/** Read the package date/version from \ProvidesPackage, for messages. @param {string} styPath */
function packageVersion(styPath) {
  try {
    const m = /\\ProvidesPackage\{authorship\}\[([^\]]*)\]/.exec(fs.readFileSync(styPath, 'utf8'));
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

module.exports = { FILES, kpsewhichCandidates, defaultTexmfHome, parseTexmfHome, findTexmfHome, packageDir, syncFiles, packageVersion };
