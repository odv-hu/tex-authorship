'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runTests}=require('@vscode/test-electron');
async function main() {
 const root=path.resolve(__dirname,'../..');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'authorship-vscode-'));
 const workspace=path.join(temp,'workspace'),user=path.join(temp,'user');
 fs.mkdirSync(path.join(user,'User'),{recursive:true});fs.mkdirSync(workspace);
 fs.writeFileSync(path.join(user,'User/settings.json'),JSON.stringify({
  'texAuthorship.installLatexPackage':false,'texAuthorship.ownerName':'Test Owner',
  'texAuthorship.authors':[{label:'AI: ChatGPT',kind:'ai',color:'#cc0099'},{label:'Reference',kind:'reference',color:'#888888'}],
  'editor.wordWrap':'on','workbench.startupEditor':'none','security.workspace.trust.enabled':false,
  'update.mode':'none','extensions.autoUpdate':false,'telemetry.telemetryLevel':'off'
 }));
 console.log(`Isolated VS Code test files and logs: ${temp}`);
 await runTests({
  version:process.env.VSCODE_TEST_VERSION || '1.100.0',
  ...(process.env.VSCODE_TEST_EXECUTABLE ? {vscodeExecutablePath:process.env.VSCODE_TEST_EXECUTABLE} : {}),
  cachePath:path.join(os.tmpdir(),'tex-authorship-vscode-cache'),
  extensionDevelopmentPath:root,extensionTestsPath:path.join(__dirname,'suite.js'),
  extensionTestsEnv:{AUTHORSHIP_TEST_WORKSPACE:workspace,TEXMFHOME:path.join(temp,'texmf')},
  launchArgs:[workspace,'--user-data-dir',user,'--extensions-dir',path.join(temp,'extensions'),'--disable-extensions','--skip-welcome','--skip-release-notes','--disable-workspace-trust', ...(process.platform==='linux'?['--no-sandbox','--disable-gpu']:[])],
 });
}
main().catch(error=>{console.error(error);process.exitCode=1;});
