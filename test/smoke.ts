import {RESULT_ROOT,EXTENSION_ID} from './paths';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {strict as assert} from 'node:assert';

interface PublicApi {checkProject(root?:string):Promise<number>}
export async function run() {
  const root=vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(root,'Smoke test requires the demo workspace');
  const extension=vscode.extensions.getExtension<PublicApi>(EXTENSION_ID);
  assert.ok(extension);const api=await extension.activate();
  await fs.writeFile(path.join(RESULT_ROOT,'smoke-result.json'),JSON.stringify({passed:false,status:'running'}));
  const file=vscode.Uri.file(path.join(root,'Stories','main.astoryx'));
  const doc=await vscode.workspace.openTextDocument(file);await vscode.window.showTextDocument(doc);
  assert.equal(doc.languageId,'astoryx');
  const messages:string[]=[];
  const record=(message:string)=>{messages.push(message);console.log('ASTORYX_SMOKE '+message);};
  assert.equal(await api.checkProject(root),0);record('Project baseline check passes');
  const tasks=await new Promise<vscode.Task[]>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Task discovery timed out; use a trusted demo workspace in the test profile.')),10000);
    void vscode.tasks.fetchTasks({type:'astoryx'}).then(value=>{clearTimeout(timeout);resolve(value);},error=>{clearTimeout(timeout);reject(error);});
  });assert.ok(tasks.length);record('Build task provider is available');
  const scratch=vscode.Uri.file(path.join(root,'Stories','smoke-test.astoryx'));
  const content='测试\n#useRule:BaseRule\n背景：none/abc\n背景：none/\n遮罩：\n变量：计数=计数+1\n分支：_/结束\n标记：结束\n背\n';
  await vscode.workspace.fs.writeFile(scratch,Buffer.from(content,'utf8'));
  try {
    const document=await vscode.workspace.openTextDocument(scratch);await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('astoryx.checkFile');
    const diagnostics=vscode.languages.getDiagnostics(scratch);
    assert.ok(diagnostics.some(d=>d.code==='E3006'&&d.range.start.line===2));record('Diagnostics use correct source line');
    const values=await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider',scratch,new vscode.Position(4,3));
    assert.ok(values.items.some(i=>i.label==='true'));record('Boolean value completion works');
    const heads=await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider',scratch,new vscode.Position(8,1));
    assert.ok(heads.items.some(i=>String(i.label).includes('Background')));record('Custom-language header completion works');
    const signature=await vscode.commands.executeCommand<vscode.SignatureHelp>('vscode.executeSignatureHelpProvider',scratch,new vscode.Position(3,8));
    assert.ok(signature.signatures[0].label.includes('FadeInTime'));assert.equal(signature.activeParameter,1);record('Signature help locates the correct parameter');
    const definitions=await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeDefinitionProvider',scratch,new vscode.Position(6,6));
    assert.ok(definitions.some(d=>d.range.start.line===7));record('Branch target definition works');
    assert.equal(await api.checkProject(root),1);record('Project check returns nonzero for errors');
    const edit=new vscode.WorkspaceEdit();edit.replace(scratch,new vscode.Range(2,8,2,11),'1');
    await vscode.workspace.applyEdit(edit);await vscode.commands.executeCommand('astoryx.checkFile');
    assert.ok(!vscode.languages.getDiagnostics(scratch).some(d=>d.range.start.line===2));record('Unsaved edits clear fixed diagnostics');
    assert.equal(await api.checkProject(root),1); // Mask still lacks its required boolean.
    const rule=vscode.Uri.file(path.join(root,'Rules','BaseRule.json'));
    const ruleDocument=await vscode.workspace.openTextDocument(rule),raw=ruleDocument.getText(),changed=raw.replace('"header": "背景："','"header": "BG "');
    const changeRule=new vscode.WorkspaceEdit();changeRule.replace(rule,new vscode.Range(ruleDocument.positionAt(0),ruleDocument.positionAt(raw.length)),changed);
    await vscode.workspace.applyEdit(changeRule);
    try {
      const custom=await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider',scratch,new vscode.Position(8,1));
      assert.ok(custom.items.some(i=>i.insertText==='BG '));record('Unsaved custom rule changes update completions');
    }finally{const restore=new vscode.WorkspaceEdit();restore.replace(rule,new vscode.Range(ruleDocument.positionAt(0),ruleDocument.positionAt(ruleDocument.getText().length)),raw);await vscode.workspace.applyEdit(restore);await ruleDocument.save();}
    const named=vscode.Uri.file(path.join(root,'Stories','named-smoke.astoryx'));
    await vscode.workspace.fs.writeFile(named,Buffer.from('测试\n#useRule:AdvanceRule\n背景：none,@Fa'));
    try{
      const list=await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider',named,new vscode.Position(2,11));
      assert.ok(list.items.some(i=>i.insertText===',@FadeInTime='));record('AdvanceRule named parameter completion works');
    }finally{await vscode.workspace.fs.delete(named,{useTrash:false});}
  } finally {
    const editor=vscode.window.visibleTextEditors.find(e=>e.document.uri.toString()===scratch.toString());
    if(editor){await vscode.window.showTextDocument(editor.document);await vscode.commands.executeCommand('workbench.action.closeActiveEditor');}
    await vscode.workspace.fs.delete(scratch,{useTrash:false});
  }
  await vscode.window.showTextDocument(doc);
  assert.equal(await api.checkProject(root),0);record('Project check passes after deleting error fixture');
  await fs.writeFile(path.join(RESULT_ROOT,'smoke-result.json'),JSON.stringify({passed:true,messages},null,2));
}
