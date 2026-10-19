'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../src/texinstall');

test('parseTexmfHome handles plain paths, ~, $HOME, braces and lists', () => {
  assert.equal(T.parseTexmfHome('/Users/fb/Library/texmf\n', '/Users/fb', 'darwin'), '/Users/fb/Library/texmf');
  assert.equal(T.parseTexmfHome('~/Library/texmf', '/Users/fb', 'darwin'), '/Users/fb/Library/texmf');
  assert.equal(T.parseTexmfHome('$HOME/texmf', '/home/a', 'linux'), '/home/a/texmf');
  assert.equal(T.parseTexmfHome('{/home/a/texmf,/home/a/other}', '/home/a', 'linux'), '/home/a/texmf');
  assert.equal(T.parseTexmfHome('', '/home/a', 'linux'), null);
  assert.equal(T.parseTexmfHome('$TEXMFUNSET/x', '/home/a', 'linux'), null);
});

test('defaultTexmfHome follows TeX Live', () => {
  assert.equal(T.defaultTexmfHome('darwin', '/Users/fb'), '/Users/fb/Library/texmf');
  assert.equal(T.defaultTexmfHome('linux', '/home/a'), '/home/a/texmf');
});

test('syncFiles copies only when something changed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-'));
  const src = path.join(tmp, 'src'); fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'authorship.sty'), '\\ProvidesPackage{authorship}[2026/10/19 v0.2 test]');
  fs.writeFileSync(path.join(src, 'authorship.lua'), 'return {}');
  const target = T.packageDir(path.join(tmp, 'texmf'));
  assert.deepEqual(T.syncFiles(src, target).changed, ['authorship.sty', 'authorship.lua']);
  assert.deepEqual(T.syncFiles(src, target).changed, []);
  fs.writeFileSync(path.join(src, 'authorship.lua'), 'return {1}');
  assert.deepEqual(T.syncFiles(src, target).changed, ['authorship.lua']);
  assert.equal(T.packageVersion(path.join(target, 'authorship.sty')), '2026/10/19 v0.2 test');
});
