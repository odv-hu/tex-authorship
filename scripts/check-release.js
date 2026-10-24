'use strict';
const fs = require('node:fs');
const path = require('node:path');

function validate(root, tag) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  const sty = fs.readFileSync(path.join(root,'latex/authorship.sty'),'utf8');
  const version = pkg.version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw Error('package.json must have a stable MAJOR.MINOR.PATCH version');
  if (tag !== undefined && tag !== `v${version}`) throw Error(`Tag ${tag} must exactly match v${version}; commit the version bump before tagging. No files were changed.`);
  if (lock.version !== version || lock.packages?.['']?.version !== version) throw Error('Both root package-lock.json versions must match package.json');
  const metadata = /\\ProvidesPackage\{authorship\}\[(\d{4}\/\d{2}\/\d{2}) v([^\s]+)\s/.exec(sty);
  if (!metadata || metadata[2] !== version) throw Error('authorship.sty version must match package.json');
  const date = metadata[1].replaceAll('/','-');
  const parsed = new Date(date+'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date) throw Error('Invalid authorship.sty release date');
  if (pkg.publisher !== 'odv-hu') throw Error('Unexpected extension publisher');
  return version;
}
if (require.main === module) {
  try { console.log(validate(path.resolve(__dirname,'..'), process.argv[2])); }
  catch (e) { console.error(`Release validation failed: ${e.message}`); process.exitCode=1; }
}
module.exports={validate};
