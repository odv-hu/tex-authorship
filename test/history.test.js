'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function historyHarness(outputs) {
  const calls=[];
  const execFile=(file,args,options,callback)=> {
    calls.push({file,args,options});
    const value=outputs.shift();
    callback(value instanceof Error ? value : null,{stdout:value instanceof Error ? '' : value});
  };
  const context={module:{exports:{}},process,require:name=>name==='child_process'?{execFile}:require(name)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/history.js'),'utf8'),context);
  return {...context.module.exports,calls};
}
test('history searches messages case-insensitively for the exact file and reads its parent snapshot',async()=>{
  const hash='a'.repeat(40);
  const h=historyHarness(['/paper\n',hash+'\0'+'2026-10-24\0[submission] Removed Authorship\n','Attributed text']);
  const history=await h.removalHistory('/paper/a manuscript.tex');
  assert.equal(history.entries[0].hash,hash);
  assert.equal(history.relative,'a manuscript.tex');
  assert.ok(h.calls[1].args.includes('--grep=Removed Authorship'));
  assert.ok(h.calls[1].args.includes('--regexp-ignore-case'));
  assert.equal(h.calls[1].args.at(-1),'a manuscript.tex');
  assert.equal(await h.beforeRemoval(history.root,history.relative,hash),'Attributed text');
  assert.equal(h.calls[2].args.at(-1),hash+'^:a manuscript.tex');
  for(const call of h.calls) {
    assert.equal(call.file,'git');assert.equal(call.options.env.GIT_OPTIONAL_LOCKS,'0');
    assert.ok(['rev-parse','log','show'].includes(call.args[1]));
  }
});
test('missing history and Git errors are handled, invalid revisions never execute',async()=>{
  const empty=historyHarness(['/paper\n','']);
  assert.equal((await empty.removalHistory('/paper/main.tex')).entries.length,0);
  const failed=historyHarness([new Error('not a repository')]);
  await assert.rejects(()=>failed.removalHistory('/paper/main.tex'),/not a repository/);
  await assert.rejects(()=>failed.beforeRemoval('/paper','main.tex','--option'),/Invalid history/);
  assert.equal(failed.calls.length,1);
});
