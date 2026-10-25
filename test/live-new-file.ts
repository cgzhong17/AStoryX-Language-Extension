import {RESULT_ROOT,EXTENSION_ID} from './paths';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {strict as assert} from 'node:assert';
import {createStoryFile,storyFileName} from '../src/new-story';
import {DocumentResult} from '../src/project';
import {createProject} from '../src/project-template';

export async function run(){
  const extension=vscode.extensions.getExtension<{analyzeDocument(document:vscode.TextDocument):Promise<DocumentResult>}>(EXTENSION_ID)!;
  const resultFile=path.join(RESULT_ROOT,'new-file-result.json'),messages:string[]=[];
  const workspace=vscode.workspace.workspaceFolders![0].uri.fsPath;
  const directory=await fs.mkdtemp(path.join(workspace,'.test-new-file-'));
  const record=(message:string)=>messages.push(message);
  try{
    const api=await extension.activate();
    const commands=await vscode.commands.getCommands(true);
    assert.ok(commands.includes('astoryx.newFile'));assert.ok(commands.includes('astoryx.newProject'));
    record('The new-file command is registered in the extension host');
    await fs.mkdir(path.join(directory,'Rules'));await fs.mkdir(path.join(directory,'Stories'));
    await fs.copyFile(path.join(workspace,'Rules/BaseRule.json'),path.join(directory,'Rules/BaseRule.json'));
    assert.equal(storyFileName('测试'), '测试.astoryx');assert.equal(storyFileName('测试.astoryx'),'测试.astoryx');
    for(const name of ['', '../escape','folder/file','con'])assert.throws(()=>storyFileName(name));
    const target=vscode.Uri.file(path.join(directory,'Stories',storyFileName('新建剧本')));
    const document=await createStoryFile(target);
    const expected='由VSCode Extention编辑\n#useRule:BaseRule\n#version:2\n\n#aliases\n#endaliases\n';
    assert.equal(document.getText(),expected);assert.equal(await fs.readFile(target.fsPath,'utf8'),expected);
    assert.equal(document.languageId,'astoryx');assert.equal(vscode.window.activeTextEditor?.document.uri.toString(),target.toString());
    record('Creating a Chinese-named file saves the exact UTF-8 template and opens it as AStoryX');
    const parsed=await api.analyzeDocument(document);assert.deepEqual(parsed.issues,[]);
    assert.equal(parsed.ruleFile,path.join(directory,'Rules/BaseRule.json'));
    record('The generated template loads BaseRule and passes static syntax and alias checks');
    const existing=vscode.Uri.file(path.join(directory,'Stories/existing.astoryx'));
    await vscode.workspace.fs.writeFile(existing,Buffer.from('已有内容','utf8'));
    await assert.rejects(createStoryFile(existing));assert.equal(await fs.readFile(existing.fsPath,'utf8'),'已有内容');
    record('A duplicate filename is rejected without changing existing content');
    const project=await createProject(directory,'完整项目',path.join(extension.extensionPath,'templates/project'));
    const entry=await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(project,'Stories/main.astoryx')));
    await vscode.window.showTextDocument(entry,{preview:false});
    assert.equal(entry.languageId,'astoryx');assert.equal(entry.getText(),expected);
    const analysis=await api.analyzeDocument(entry);assert.deepEqual(analysis.issues,[]);
    assert.equal(analysis.root,project);assert.equal(analysis.ruleFile,path.join(project,'Rules/BaseRule.json'));
    record('A scaffolded project opens its entry as AStoryX and resolves its own bundled BaseRule without setup');
  }catch(error){await fs.writeFile(resultFile,JSON.stringify({passed:false,messages,error:String(error),stack:(error as Error).stack},null,2));throw error;}
  finally{
    for(const document of vscode.workspace.textDocuments.filter(d=>d.uri.fsPath.startsWith(directory+path.sep)&&!d.isClosed)){
      await vscode.window.showTextDocument(document);await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }
    assert.ok(path.resolve(directory).startsWith(path.resolve(workspace)+path.sep+'.test-new-file-'));
    await fs.rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
  await fs.writeFile(resultFile,JSON.stringify({passed:true,messages},null,2));
}
