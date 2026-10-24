// @ts-check
'use strict';
const {execFile} = require('child_process');
const {promisify} = require('util');
const path = require('path');
const run = promisify(execFile);
/** @param {string} cwd @param {string[]} args */
async function git(cwd, args) {
  const result = await run('git', ['--no-pager', ...args], {
    cwd, encoding:'utf8', maxBuffer:16*1024*1024, timeout:15000,
    env:{...process.env, GIT_OPTIONAL_LOCKS:'0', GIT_LITERAL_PATHSPECS:'1'}
  });
  return result.stdout;
}
/** Read removal points for this exact path on the current branch. No Git writes.
 * @param {string} filename
 */
async function removalHistory(filename) {
  const root = (await git(path.dirname(filename), ['rev-parse','--show-toplevel'])).trim();
  const relative = path.relative(root,filename).split(path.sep).join('/');
  const log = await git(root, ['log','--format=%H%x00%cs%x00%s','--fixed-strings',
    '--regexp-ignore-case','--grep=Removed Authorship','--',relative]);
  const entries = log.trim().split('\n').filter(Boolean).map(line => {
    const [hash,date,subject] = line.split('\0');
    return {hash,date,subject};
  });
  return {root, relative, entries};
}
/** @param {string} root @param {string} relative @param {string} hash */
async function beforeRemoval(root, relative, hash) {
  if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new Error('Invalid history revision.');
  return git(root,['show',hash+'^:'+relative]);
}
module.exports = {removalHistory,beforeRemoval};
