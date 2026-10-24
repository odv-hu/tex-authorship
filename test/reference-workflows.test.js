'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('../src/markers');

function harness(text, source = 'smith2024') {
  const edits = [], warnings = [];
  class Position { constructor(line,character) { this.line=line;this.character=character; } }
  class Range { constructor(a,b,c,d) { if (typeof a === 'number') {this.start=new Position(a,b);this.end=new Position(c,d);} else {this.start=a;this.end=b;} } }
  const lines = text.split('\n');
  const doc = {version:1,isClosed:false,eol:1,uri:{scheme:'file',fsPath:'/paper/main.tex'},lineCount:lines.length,
    getText:()=>text,
    lineAt:i=>({text:lines[i],range:new Range(i,0,i,lines[i].length),rangeIncludingLineBreak:new Range(i,0,i+1,0)})};
  const selection = new Range(0,0,0,lines[0].length);selection.isEmpty=false;selection.active=new Position(0,0);
  const editor = {document:doc,selection,selections:[selection],edit:async fn=>{fn({replace:(range,text)=>edits.push({range,text}),insert:(position,text)=>edits.push({position,text}),delete:range=>edits.push({range,deleted:true})});return true;}};
  const kind = {append:()=>kind};
  const vscode = {Position,Range,EndOfLine:{CRLF:2},DocumentDropOrPasteEditKind:{Empty:kind},
    env:{clipboard:{readText:async()=> 'Pasted text.'}},
    workspace:{getConfiguration:()=>({get:key=>key==='authors'?[{label:'Custom reference',kind:'reference',color:'#888888'}]:undefined})},
    window:{activeTextEditor:editor,showQuickPick:async items=>items.find(i=>i.author?.kind==='reference'),showWarningMessage:msg=>warnings.push(msg),showInformationMessage:msg=>warnings.push(msg)}};
  const context={module:{exports:{}},require:name=>name==='vscode'?vscode:name==='./references'?{pickSource:async()=> typeof source === 'function'?source(doc):source}:require(name.startsWith('.')?path.resolve(__dirname,'../src',name):name),console,Buffer,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/extension.js'),'utf8')+'\nmodule.exports={cmdMarkSelection,cmdPasteAs,cmdAssociateSource,cmdUnmark};',context);
  return {...context.module.exports,edits,warnings,editor,doc};
}

test('reference marking and explicit paste include metadata in one edit, no citation',async()=>{
  for (const command of ['cmdMarkSelection','cmdPasteAs']) {
    const h=harness('Passage.');await h[command]();
    assert.equal(h.edits.length,1);
    assert.match(h.edits[0].text,/%\[\*Custom reference\]\n% authorship-source:/);
    assert.match(h.edits[0].text,/smith2024/);
    assert.ok(!h.edits[0].text.includes('\\cite'));
    assert.deepEqual(M.parseDocument(h.edits[0].text.split('\n')).problems,[]);
  }
});

test('source cancellation and stale document leave text untouched',async()=>{
  const cancelled=harness('Text',()=>undefined);await cancelled.cmdMarkSelection();assert.equal(cancelled.edits.length,0);
  const stale=harness('Text',doc=>{doc.version++;return 'key';});await stale.cmdPasteAs();assert.equal(stale.edits.length,0);assert.equal(stale.warnings.length,1);
});

test('source-free reference marking retains legacy syntax',async()=>{
  const h=harness('Text',null);await h.cmdMarkSelection();assert.equal(h.edits[0].text,'%[*Custom reference]\nText\n%[/*Custom reference]');
});

test('associate replaces metadata only, remove source keeps passage, unmark removes source',async()=>{
  const text=['%[*Reference]',M.sourceComment('old'),'Text','%[/*Reference]'].join('\n');
  const h=harness(text,'new');await h.cmdAssociateSource();assert.equal(h.edits.length,1);assert.equal(h.edits[0].text,M.sourceComment('new')+'\n');assert.equal(h.edits[0].range.start.line,1);
  const remove=harness(text,null);await remove.cmdAssociateSource();assert.equal(remove.edits[0].text,'');
  const unmark=harness(text);await unmark.cmdUnmark();assert.deepEqual(unmark.edits.map(e=>e.range.start.line),[3,1,0]);
});

test('selection crossing marker lines or verbatim does not open an edit',async()=>{
  const h=harness('%[*Reference]\nText\n%[/*Reference]');await h.cmdMarkSelection();assert.equal(h.edits.length,0);
  const v=harness('\\verb|text|');await v.cmdMarkSelection();assert.equal(v.edits.length,0);
});

function sourcePicker(files, active, choices, candidates = []) {
  const prompts=[],warnings=[];
  const documents=Object.entries(files).map(([file,text])=>({uri:{scheme:'file',fsPath:file},getText:()=>text}));
  const vscode={
    RelativePattern:class {}, Uri:{file:fsPath=>({fsPath})},
    workspace:{textDocuments:documents,getWorkspaceFolder:()=>({uri:{fsPath:'/paper'}}),findFiles:async()=>candidates.map(fsPath=>({fsPath})),asRelativePath:p=>p,
      fs:{stat:async()=>{throw Error('missing');}}},
    window:{showWarningMessage:async m=>warnings.push(m),showQuickPick:async(items,opts)=>{prompts.push({items,opts});const pick=choices.shift();if (pick===undefined) return undefined;return typeof pick==='function'?pick(items):items.find(i=>i.key===pick||i.action===pick||i.file===pick);},showOpenDialog:async()=>undefined},
  };
  const context={module:{exports:{}},Buffer,require:name=>name==='vscode'?vscode:require(name.startsWith('.')?path.resolve(__dirname,'../src',name):name)};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/references.js'),'utf8'),context);
  return {run:()=>context.module.exports.pickSource(documents.find(d=>d.uri.fsPath===active)),prompts,warnings};
}

test('picker uses unsaved root/include buffers and searches description and title',async()=>{
  const h=sourcePicker({'/paper/chapters/a.tex':'% !TeX root = ../main.tex','/paper/main.tex':'\\documentclass{article}\n\\bibliography{refs}', '/paper/refs.bib':'@book{key,author={Jane},year=2024,title={Title}}'},'/paper/chapters/a.tex',['key']);
  assert.equal(await h.run(),'key');
  assert.equal(h.prompts[0].opts.matchOnDescription,true);assert.equal(h.prompts[0].opts.matchOnDetail,true);
  assert.equal(h.prompts[0].items.find(i=>i.key==='key').description,'Jane · 2024');
});

test('ambiguous roots require selection and do not mix resources',async()=>{
  const h=sourcePicker({'/paper/a.tex':'Text','/paper/one.tex':'\\documentclass{article}\\input{a}\\bibliography{one}','/paper/two.tex':'\\documentclass{article}\\input{a}\\bibliography{two}','/paper/one.bib':'@book{one}','/paper/two.bib':'@book{two}'},'/paper/a.tex',['/paper/two.tex','two'],['/paper/one.tex','/paper/two.tex']);
  assert.equal(await h.run(),'two');assert.ok(!h.prompts[1].items.some(i=>i.key==='one'));
});

test('duplicate selection cannot return a key; missing resources do not hide usable entries',async()=>{
  const h=sourcePicker({'/paper/main.tex':'\\documentclass{article}\\bibliography{refs,missing}','/paper/refs.bib':'@book{duplicate}\n@book{duplicate}\n@book{good}'},'/paper/main.tex',['duplicate','good']);
  assert.equal(await h.run(),'good');assert.equal(h.warnings.length,1);assert.ok(h.prompts[0].items.some(i=>i.action==='warnings'));
});

test('root cycle and picker cancellation perform no mutation',async()=>{
  const h=sourcePicker({'/paper/main.tex':'% !TeX root = main.tex'},'/paper/main.tex',[]);
  assert.equal(await h.run(),undefined);assert.equal(h.warnings.length,1);
});
