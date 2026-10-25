import {RESULT_ROOT,EXTENSION_ID} from './paths';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {strict as assert} from 'node:assert';

export async function run(){
  const messages:string[]=[],resultFile=path.join(RESULT_ROOT,'project-tab-result.json');
  try{
    await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
    const root=vscode.workspace.workspaceFolders![0].uri;
    const document=await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root,'Stories','main.astoryx'));
    const editor=await vscode.window.showTextDocument(document,{preview:false});
    const config=vscode.workspace.getConfiguration('editor',{uri:document.uri,languageId:'astoryx'});
    assert.equal(config.inspect<boolean>('insertSpaces')?.globalLanguageValue,true);
    assert.equal(config.inspect<boolean>('detectIndentation')?.globalLanguageValue,true);
    assert.equal(config.get('insertSpaces'),false);assert.equal(config.get('detectIndentation'),false);
    assert.equal(editor.options.insertSpaces,false);
    messages.push('Opening a generated project applies its Tab settings over an explicit user preference for spaces');
    const edit=new vscode.WorkspaceEdit();edit.insert(document.uri,document.positionAt(document.getText().length),'角色');
    assert.ok(await vscode.workspace.applyEdit(edit));
    const end=document.positionAt(document.getText().length);editor.selection=new vscode.Selection(end,end);
    await vscode.commands.executeCommand('tab');
    assert.ok(document.getText().endsWith('角色\t'));
    messages.push('The native Tab command inserts an actual tab in the generated project');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await fs.writeFile(resultFile,JSON.stringify({passed:true,messages},null,2));
  }catch(error){await fs.writeFile(resultFile,JSON.stringify({passed:false,messages,error:String(error),stack:(error as Error).stack},null,2));throw error;}
}
