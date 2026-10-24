'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validate}=require('../scripts/check-release');
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'authorship-versions-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'latex'));
 const write=(file,data)=>fs.writeFileSync(path.join(root,file),typeof data==='string'?data:JSON.stringify(data));
 write('package.json',{version:'1.2.3',publisher:'odv-hu'});write('package-lock.json',{version:'1.2.3',packages:{'':{version:'1.2.3'}}});
 write('latex/authorship.sty',String.raw`\ProvidesPackage{authorship}[2026/10/24 v1.2.3 Description]`);
 return {root,write};
}
test('matching release and tag pass without modifying sources',t=>{
 const {root}=fixture(t);const before=fs.readFileSync(path.join(root,'package.json'));
 assert.equal(validate(root,'v1.2.3'),'1.2.3');assert.equal(validate(root),'1.2.3');
 assert.deepEqual(fs.readFileSync(path.join(root,'package.json')),before);
});
test('malformed or mismatched tags fail instead of rewriting versions',t=>{
 const {root}=fixture(t);for(const tag of ['v.1.2.3','v1.2.4','1.2.3','v01.2.3','main','v1.2.3\n']) assert.throws(()=>validate(root,tag),/Tag/);
});
test('each lockfile root version and LaTeX version is enforced',t=>{
 for(const lock of [{version:'1.2.2',packages:{'':{version:'1.2.3'}}},{version:'1.2.3',packages:{'':{version:'1.2.2'}}},{version:'1.2.3'}]) {
  const {root,write}=fixture(t);write('package-lock.json',lock);assert.throws(()=>validate(root,'v1.2.3'),/lock/);
 }
 const {root,write}=fixture(t);write('latex/authorship.sty',String.raw`\ProvidesPackage{authorship}[2026/10/24 v1.2.2 Description]`);assert.throws(()=>validate(root),/sty/);
});
test('invalid date and wrong publisher fail',t=>{
 const {root,write}=fixture(t);write('latex/authorship.sty',String.raw`\ProvidesPackage{authorship}[2026/02/31 v1.2.3 Description]`);assert.throws(()=>validate(root),/date/);
 write('latex/authorship.sty',String.raw`\ProvidesPackage{authorship}[2026/10/24 v1.2.3 Description]`);
 write('package.json',{version:'1.2.3',publisher:'other'});assert.throws(()=>validate(root),/publisher/i);
});
