import {RESULT_ROOT,EXTENSION_ID} from './paths';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {strict as assert} from 'node:assert';
import {HighlightSpan} from '../src/highlighting';

interface Applied {uri:vscode.Uri;version:number;spans:HighlightSpan[]}
interface Api {onDidApplyHighlighting:vscode.Event<Applied>}

/** Drive VS Code's real edit/undo/redo events; never manually request a repaint. */
export async function run() {
  const extension=vscode.extensions.getExtension<Api>(EXTENSION_ID)!;
  const resultFile=path.join(RESULT_ROOT,'live-result.json');
  const messages:string[]=[];
  const record=(message:string)=>{messages.push(message);console.log('ASTORYX_LIVE '+message);};
  let subscription:vscode.Disposable|undefined;
  let scratch:vscode.Uri|undefined;
  try {
    const api=await extension.activate();
    const root=vscode.workspace.workspaceFolders![0].uri;
    const file=scratch=vscode.Uri.joinPath(root,'Stories',`live-test-${process.pid}.astoryx`);
    await vscode.workspace.fs.writeFile(file,Buffer.from('实时测试\n#useRule:BaseRule\n    // 空格缩进\n        // 缩进检测\n    // 空格缩进\n        // 缩进检测\n'));
    const document=await vscode.workspace.openTextDocument(file);
    const applied=new Map<string,Applied>();
    subscription=api.onDidApplyHighlighting(event=>applied.set(event.uri.toString(),event));
    const editor=await vscode.window.showTextDocument(document);
    const waitForPaint=async()=>{
      const deadline=Date.now()+5000;
      while(Date.now()<deadline){
        const state=applied.get(file.toString());
        if(state?.version===document.version)return state.spans;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      throw new Error(`No decorations applied for live document version ${document.version}; last ${applied.get(file.toString())?.version}`);
    };
    const replace=async(text:string)=>{
      const edit=new vscode.WorkspaceEdit();
      edit.replace(file,new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),text);
      assert.ok(await vscode.workspace.applyEdit(edit));
      return waitForPaint();
    };
    const commandEdit=async(command:string,...args:unknown[])=>{
      await new Promise<void>((resolve,reject)=>{
        const timeout=setTimeout(()=>{listener.dispose();reject(new Error(`No content edit from ${command}`));},5000);
        const listener=vscode.workspace.onDidChangeTextDocument(event=>{
          if(event.document===document&&event.contentChanges.length){clearTimeout(timeout);listener.dispose();resolve();}
        });
        void vscode.commands.executeCommand(command,...args).then(undefined,error=>{clearTimeout(timeout);listener.dispose();reject(error);});
      });
      return waitForPaint();
    };
    const has=(spans:HighlightSpan[],line:number,role:string,start:number,end:number)=>assert.ok(spans.some(s=>s.line===line&&s.role===role&&s.start===start&&s.end===end),JSON.stringify({line,role,start,end,spans}));
    await waitForPaint();record(`Initial editor decoration application; insertSpaces=${editor.options.insertSpaces}`);
    assert.equal(editor.options.insertSpaces,false,'Language defaults must prevent indentation detection from replacing the dialogue Tab');
    const prefix='实时测试\n#useRule:BaseRule\n';
    let spans=await replace(prefix+'--凯尔希:wink/0\n凯尔希\t新增对话\n新增旁白');
    assert.ok(document.isDirty);has(spans,2,'character',0,10);has(spans,2,'parameter',10,12);
    has(spans,3,'speaker',0,3);has(spans,3,'dialogue',4,8);has(spans,4,'narration',0,4);
    record('New unsaved image/dialogue/narration lines receive decorations');
    editor.selection=new vscode.Selection(3,8,3,8);
    let dialogueEnd=8;
    for(const character of '继续输入'){
      spans=await commandEdit('type',{text:character});
      has(spans,3,'dialogue',4,++dialogueEnd);
    }
    record('Actual type command recolors after every character');
    spans=await replace(prefix+'凯尔希\t一句新对话');has(spans,2,'dialogue',4,9);
    spans=await replace(prefix+'凯尔希一句新对话');has(spans,2,'narration',0,8);
    assert.ok(!spans.some(s=>s.role==='speaker'||s.role==='dialogue'));
    record('Removing the dialogue separator clears previous colors');
    spans=await commandEdit('undo');has(spans,2,'dialogue',4,9);
    spans=await commandEdit('redo');has(spans,2,'narration',0,8);
    record('Undo and redo refresh decorations');
    for(let i=0;i<12;i++){
      const edit=new vscode.WorkspaceEdit();
      edit.replace(file,new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),prefix+`角色${i}\t台词${i}`);
      await vscode.workspace.applyEdit(edit);
    }
    spans=await waitForPaint();has(spans,2,'speaker',0,4);has(spans,2,'dialogue',5,9);
    record('Rapid successive edits paint the final version');
    await replace(prefix+'凯尔希');
    editor.selection=new vscode.Selection(document.positionAt(document.getText().length),document.positionAt(document.getText().length));
    await vscode.commands.executeCommand('hideSuggestWidget');
    await commandEdit('tab');
    assert.equal(document.lineAt(2).text,'凯尔希\t','Tab must insert the real dialogue separator, even in a file with space indentation');
    await commandEdit('type',{text:'按键输入'});spans=await waitForPaint();has(spans,2,'dialogue',4,8);
    record('Native Tab command inserts a real separator and typed dialogue is colored');
    await commandEdit('type',{text:'\n--新角色:wink/1\n新角色'});
    await vscode.commands.executeCommand('hideSuggestWidget');
    spans=await commandEdit('tab');has(spans,4,'speaker',0,3);
    spans=await commandEdit('type',{text:'新建台词'});
    has(spans,3,'character',0,10);has(spans,3,'parameter',10,12);has(spans,4,'dialogue',4,8);
    record('Typing new lines after existing content colors them without saving or reopening');
    spans=await replace(prefix+'--mon3tr:疑惑/1\n背景：bg/1\n凯尔希\t台词/true/false');
    has(spans,2,'character',0,11);has(spans,2,'parameter',11,13);has(spans,3,'controller',0,3);
    for(const [start,end]of [[7,11],[12,17]])assert.ok(!spans.some(s=>s.line===4&&s.start<end&&s.end>start),'Boolean keyword must not be covered by a foreground decoration');
    record('Image declarations and background headers use the shared color; booleans retain theme syntax colors');
    const hovers=await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider',file,new vscode.Position(3,4));
    const hoverText=hovers.flatMap(h=>h.contents).map(c=>typeof c==='string'?c:c.value).join('\n');
    assert.ok(hoverText.includes('当前规则：')&&hoverText.includes('BaseRule'));assert.ok(!hoverText.includes('规则目录')&&!hoverText.includes('BaseRule.json'));
    const signature=await vscode.commands.executeCommand<vscode.SignatureHelp>('vscode.executeSignatureHelpProvider',file,new vscode.Position(3,7));
    const documentation=signature.signatures[0].documentation;
    const signatureText=typeof documentation==='string'?documentation:documentation?.value??'';
    assert.ok(signatureText.includes('当前规则：')&&signatureText.includes('BaseRule'));assert.ok(!signatureText.includes('规则目录')&&!signatureText.includes('BaseRule.json'));
    record('Hover and signature documentation show only the current rule name');
    await document.save();await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.workspace.fs.delete(file,{useTrash:false});
    await fs.writeFile(resultFile,JSON.stringify({passed:true,messages},null,2));
  }catch(error){
    await fs.writeFile(resultFile,JSON.stringify({passed:false,messages,error:String(error),stack:(error as Error).stack},null,2));
    throw error;
  }finally{
    subscription?.dispose();
    if(scratch){
      const document=vscode.workspace.textDocuments.find(d=>d.uri.toString()===scratch!.toString());
      if(document&&!document.isClosed){
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      }
      await vscode.workspace.fs.delete(scratch,{useTrash:false}).then(undefined,()=>{});
    }
  }
}
