'use strict';
const vscode=require('vscode');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const M=require('../../src/markers'),V=require('../../src/reviews');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message) {
 for(let i=0;i<100;i++){if(await fn())return;await wait(50);}
 throw Error(message);
}
async function run() {
 const dir=process.env.AUTHORSHIP_TEST_WORKSPACE;
 assert.ok(dir);assert.equal(vscode.workspace.getConfiguration('texAuthorship').get('installLatexPackage'),false);
 const extension=vscode.extensions.getExtension('odv-hu.tex-authorship');assert.ok(extension);await extension.activate();
 const registered=new Set(await vscode.commands.getCommands(true));
 const manifest=require('../../package.json');
 const declared=new Set(manifest.contributes.commands.map(c=>c.command));
 for(const item of manifest.contributes.menus['editor/context']) {
  assert.ok(declared.has(item.command), 'Context menu command missing declaration: '+item.command);
  assert.ok(registered.has(item.command), 'Context menu command missing handler: '+item.command);
 }
 const uri=vscode.Uri.file(path.join(dir,'main.tex'));
 const text='%[&AI: ChatGPT]\n'+('Long wrapped AI passage. '.repeat(25))+'\n%[/&AI: ChatGPT]\n';
 await vscode.workspace.fs.writeFile(uri,Buffer.from(text));
 const doc=await vscode.workspace.openTextDocument(uri);const editor=await vscode.window.showTextDocument(doc);
 editor.selection=new vscode.Selection(1,0,1,0);
 await vscode.commands.executeCommand('texAuthorship.unmark');
 assert.ok(!doc.getText().includes('%[&'));assert.ok(doc.getText().includes('Long wrapped'));
 await vscode.commands.executeCommand('undo');assert.equal(doc.getText(),text);
 await vscode.commands.executeCommand('redo');assert.ok(!doc.getText().includes('%[&'));
 await vscode.commands.executeCommand('undo');assert.equal(doc.getText(),text);
 console.log('PASS: actual editor unmark and undo/redo');
 const lines=text.trimEnd().split('\n'),block=M.parseDocument(lines).blocks[0];
 const review=V.comment({version:1,status:'reviewed',by:'Test Owner',color:'#000000',hash:V.fingerprint(lines,block)});
 await editor.edit(edit=>edit.insert(new vscode.Position(1,0),review+'\n'));
 editor.selection=new vscode.Selection(2,0,2,0);
 await editor.edit(edit=>edit.insert(new vscode.Position(2,0),'Changed '));
 await until(()=>vscode.languages.getDiagnostics(uri).some(d=>d.message.includes('Changed since')), 'Stale review diagnostic missing');
 await vscode.commands.executeCommand('texAuthorship.clearReview');assert.ok(!doc.getText().includes('authorship-review:'));
 await until(()=>!vscode.languages.getDiagnostics(uri).some(d=>d.message.includes('Changed since')), 'Stale diagnostic not cleared');
 console.log('PASS: document events, stale review diagnostics and remove-review command');
 await editor.edit(edit=>edit.insert(new vscode.Position(0,0),'\\AuthorshipCitationColor{#ff0000}\n'));
 const colors=await vscode.commands.executeCommand('vscode.executeDocumentColorProvider',uri);
 assert.equal(colors.length,1);assert.equal(colors[0].color.red,1);
 const presentations=await vscode.commands.executeCommand('vscode.executeColorPresentationProvider',new vscode.Color(0,1,0,1),{uri,range:colors[0].range});
 assert.ok(presentations.some(p=>(p.textEdit?.newText ?? p.label).toLowerCase()==='#00ff00'));
 for (const theme of ['Default Light Modern','Default Dark Modern']) {
  await vscode.workspace.getConfiguration('workbench').update('colorTheme',theme,vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('texAuthorship.toggleHighlight');
  await vscode.commands.executeCommand('texAuthorship.toggleHighlight');
 }
 assert.equal(vscode.workspace.getConfiguration('texAuthorship').get('highlight'),true);
 assert.ok(!fs.existsSync(process.env.TEXMFHOME),'Tests must not install the LaTeX package');
 console.log('PASS: real colour provider/presentations; theme and highlighting smoke checks');
 await interactiveFlows(dir);
 console.log('Visual inspection of borders/labels and the paste-options button itself remains on the manual checklist.');
}

/** Replace a window function for one flow; the answers come from the test (#2). */
function stub(name,fn) {
 const original=vscode.window[name];
 vscode.window[name]=fn;
 if (vscode.window[name]!==fn) Object.defineProperty(vscode.window,name,{value:fn,configurable:true,writable:true});
 return ()=>{vscode.window[name]=original;if(vscode.window[name]!==original)Object.defineProperty(vscode.window,name,{value:original,configurable:true,writable:true});};
}
/** Answer quick picks in order. Each answer gets (items, options) and returns the item to pick, or undefined to cancel. */
function answerPicks(answers) {
 const seen=[];
 const restore=stub('showQuickPick',async(items,options)=>{
  const list=await items;seen.push({items:list,options});
  const answer=answers.shift();assert.ok(answer,'Unexpected quick pick: '+(options?.title||''));
  return answer(list,options);
 });
 return {seen,done:()=>{restore();assert.equal(answers.length,0,'Quick picks not shown: '+answers.length);}};
}
const byLabel=text=>items=>{const item=items.find(i=>i.label.includes(text));assert.ok(item,'No quick pick item '+text+' in '+items.map(i=>i.label).join(', '));return item;};
const cancel=()=>undefined;

async function open(dir,name,text) {
 const uri=vscode.Uri.file(path.join(dir,name));
 await vscode.workspace.fs.writeFile(uri,Buffer.from(text));
 const doc=await vscode.workspace.openTextDocument(uri);
 const editor=await vscode.window.showTextDocument(doc);
 assert.equal(doc.languageId,'latex');
 return {uri,doc,editor};
}

async function interactiveFlows(dir) {
 const warnings=[];
 const restoreWarning=stub('showWarningMessage',async(message)=>{warnings.push(String(message));return undefined;});
 const restoreInfo=stub('showInformationMessage',async(message)=>{warnings.push(String(message));return undefined;});
 try {
  // Normal paste stays plain; the paste options offer each author (the button UI itself is manual).
  await vscode.env.clipboard.writeText('Pasted words.');
  let {doc,editor}=await open(dir,'paste.tex','Before after.\n');
  editor.selection=new vscode.Selection(0,7,0,7);
  await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
  await until(()=>doc.getText().includes('Pasted words.'),'Normal paste did not insert text');
  assert.equal(doc.getText(),'Before Pasted words.after.\n');
  await vscode.commands.executeCommand('undo');assert.equal(doc.getText(),'Before after.\n');
  // editor.action.pasteAs picks a paste option by kind. Its argument changed between VS
  // Code versions ({kind} earlier, {preferences} later), so try both and report which.
  const wrapped='Before \n%[&AI: ChatGPT]\nPasted words.%\n%[/&AI: ChatGPT]\nafter.\n',kind='authorship.ai-chatgpt';
  let used=null;
  for (const args of [{preferences:[kind]},{kind}]) {
   editor.selection=new vscode.Selection(0,7,0,7);
   await vscode.commands.executeCommand('editor.action.pasteAs',args);
   for (let i=0;i<40 && doc.getText()==='Before after.\n';i++) await wait(50);
   await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
   if (doc.getText()===wrapped) { used=Object.keys(args)[0]; break; }
   for (let i=0;i<5 && doc.getText()!=='Before after.\n';i++) await vscode.commands.executeCommand('undo');
   assert.equal(doc.getText(),'Before after.\n');
  }
  assert.ok(used,'No editor.action.pasteAs argument applied the AI: ChatGPT paste option');
  console.log('editor.action.pasteAs argument used: '+used);
  console.log('PASS: normal paste stays plain; paste option for an author wraps the text');

  // Explicit paste (Paste as…, ⌘⌥V): author, owner, cancel.
  ({doc,editor}=await open(dir,'explicit.tex','Start end.\n'));
  for (const [answer,check] of [
   [byLabel('AI: ChatGPT'),text=>assert.equal(text,'Start \n%[&AI: ChatGPT]\nPasted words.%\n%[/&AI: ChatGPT]\nend.\n')],
   [byLabel('Test Owner'),text=>assert.equal(text,'Start Pasted words.end.\n')],
   [cancel,text=>assert.equal(text,'Start end.\n')],
  ]) {
   editor.selection=new vscode.Selection(0,6,0,6);
   const picks=answerPicks([answer]);
   await vscode.commands.executeCommand('texAuthorship.pasteAs');picks.done();
   assert.equal(picks.seen[0].options.title,'Paste as…');
   check(doc.getText());
   if (doc.getText()!=='Start end.\n') await vscode.commands.executeCommand('undo');
   assert.equal(doc.getText(),'Start end.\n');
  }
  console.log('PASS: explicit paste as an author, as the owner, and cancelled');

  // Mark Selection: choose an author, or cancel the picker.
  ({doc,editor}=await open(dir,'mark.tex','Keep this sentence. Mark this one.\n'));
  editor.selection=new vscode.Selection(0,20,0,34);
  let picks=answerPicks([cancel]);
  await vscode.commands.executeCommand('texAuthorship.markSelection');picks.done();
  assert.equal(doc.getText(),'Keep this sentence. Mark this one.\n');
  picks=answerPicks([byLabel('AI: ChatGPT')]);
  await vscode.commands.executeCommand('texAuthorship.markSelection');picks.done();
  assert.equal(doc.getText(),'Keep this sentence. \n%[&AI: ChatGPT]\nMark this one.\n%[/&AI: ChatGPT]\n');
  console.log('PASS: mark selection with an author; cancelling leaves the text');

  // Bibliography picker: search fields, a missing file, a duplicate key, choosing other
  // files, and reassigning the source of an existing reference passage.
  await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(dir,'refs.bib')),Buffer.from([
   '@article{smith2024, author={Smith, Ann}, year={2024}, title={A Title}}',
   '@book{dup, author={One}, year={2001}, title={First}}',
   '@book{dup, author={Two}, year={2002}, title={Second}}',''].join('\n')));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(dir,'other.bib')),Buffer.from('@misc{jones2020, author={Jones}, year={2020}, title={Other}}\n'));
  ({doc,editor}=await open(dir,'paper.tex','\\documentclass{article}\n\\begin{document}\nQuoted text.\n\\bibliography{refs,missing}\n\\end{document}\n'));
  editor.selection=new vscode.Selection(2,0,2,12);
  picks=answerPicks([byLabel('Reference'),
   (items,options)=>{
    assert.ok(options.matchOnDescription && options.matchOnDetail,'search covers author, year and title');
    const smith=items.find(i=>i.label==='smith2024');assert.match(smith.description,/Smith, Ann · 2024/);assert.match(smith.detail,/A Title/);
    const problems=items.find(i=>i.label.startsWith('Bibliography warnings'));
    assert.match(problems.detail,/missing\.bib/);assert.match(problems.detail,/Duplicate key dup/);
    return items.find(i=>i.label==='dup');
   },
   byLabel('smith2024')]);
  await vscode.commands.executeCommand('texAuthorship.markSelection');picks.done();
  assert.ok(warnings.some(w=>w.includes('dup occurs more than once')),'duplicate key refused with a warning');
  assert.equal(doc.getText().split('\n').slice(2,6).join('\n'),['%[*Reference]',M.sourceComment('smith2024'),'Quoted text.','%[/*Reference]'].join('\n'));
  editor.selection=new vscode.Selection(4,0,4,0);
  const restoreDialog=stub('showOpenDialog',async()=>[vscode.Uri.file(path.join(dir,'other.bib'))]);
  try {
   picks=answerPicks([
    (items)=>{assert.ok(items.some(i=>i.label==='smith2024'),'current source listed');return items.find(i=>i.action==='files');},
    (items)=>{assert.ok(!items.some(i=>i.label==='smith2024'),'files replaced');return items.find(i=>i.label==='jones2020');}]);
   await vscode.commands.executeCommand('texAuthorship.associateReference');picks.done();
  } finally { restoreDialog(); }
  assert.equal(doc.lineAt(3).text,M.sourceComment('jones2020'));
  picks=answerPicks([byLabel('Remove source association')]);
  await vscode.commands.executeCommand('texAuthorship.associateReference');picks.done();
  assert.equal(doc.getText().split('\n').slice(2,5).join('\n'),['%[*Reference]','Quoted text.','%[/*Reference]'].join('\n'));
  console.log('PASS: bibliography picker search fields, missing file, duplicate key, choosing files, reassignment and removal');
 } finally { restoreWarning(); restoreInfo(); }
}
module.exports={run};
