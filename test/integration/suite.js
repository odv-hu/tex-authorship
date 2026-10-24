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
 console.log('Visual inspection of borders/labels, picker interaction and clipboard paste remains on the manual checklist.');
}
module.exports={run};
