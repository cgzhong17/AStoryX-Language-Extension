import {REPO_ROOT,RESULT_ROOT,EXTENSION_ID} from './paths';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {strict as assert} from 'node:assert';

interface Api {checkProject(root?:string):Promise<number>}
export async function run(){
  const extension=vscode.extensions.getExtension<Api>(EXTENSION_ID)!;
  const resultFile=path.join(RESULT_ROOT,'diagnostics-result.json'),messages:string[]=[];
  const record=(message:string)=>{messages.push(message);console.log('ASTORYX_DIAGNOSTICS '+message);};
  const workspace=vscode.workspace.workspaceFolders![0].uri.fsPath;
  const root=await fs.mkdtemp(path.join(workspace,'.test-diag-'));
  const script=vscode.Uri.file(path.join(root,'Stories/main.astoryx'));
  const config=vscode.workspace.getConfiguration('astoryx');
  const previous=config.inspect<number|null>('validation.maxLineLength')?.globalValue;
  try{
    const api=await extension.activate();
    await config.update('validation.maxLineLength',null,vscode.ConfigurationTarget.Global);
    const write=async(name:string,text:string)=>{
      const uri=vscode.Uri.file(path.join(root,name));await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
      await vscode.workspace.fs.writeFile(uri,Buffer.from(text));return uri;
    };
    const ruleText=await fs.readFile(path.join(REPO_ROOT,'test/fixtures/language-demo/Rules/BaseRule.json'),'utf8');
    const rule=await write('Rules/BaseRule.json',ruleText);
    await write('Rules/AdvanceRule.json',await fs.readFile(path.join(REPO_ROOT,'test/fixtures/language-demo/Rules/AdvanceRule.json'),'utf8'));
    await write('Resources/Char_Picture/char/normal.png','fixture');
    const prefix='诊断测试\n#useRule:BaseRule\n#aliases\nchar->凯尔希\n#endaliases\n';
    await write('Stories/main.astoryx',prefix+'背景：missing\n凯尔希  正文\n未声明\t正文\n--ghost:normal/1');
    const document=await vscode.workspace.openTextDocument(script);await vscode.window.showTextDocument(document);
    const wait=async(predicate:(diagnostics:vscode.Diagnostic[])=>boolean)=>{
      const deadline=Date.now()+10000;
      while(Date.now()<deadline){const diagnostics=vscode.languages.getDiagnostics(script);if(predicate(diagnostics))return diagnostics;await new Promise(r=>setTimeout(r,30));}
      throw new Error('Diagnostics timeout: '+JSON.stringify(vscode.languages.getDiagnostics(script).map(d=>({code:d.code,line:d.range.start.line,message:d.message}))));
    };
    const replace=async(text:string)=>{
      const edit=new vscode.WorkspaceEdit();edit.replace(script,new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),text);
      assert.ok(await vscode.workspace.applyEdit(edit));
    };
    let diagnostics=await wait(ds=>ds.some(d=>d.code==='E2001'&&d.range.start.line===8)&&ds.some(d=>d.code==='W1003')&&ds.some(d=>d.code==='W1001'));
    const missing=diagnostics.find(d=>d.code==='E2001'&&d.range.start.line===5)!;
    assert.equal(document.getText(missing.range),'missing');assert.equal(missing.severity,vscode.DiagnosticSeverity.Error);
    const spaces=diagnostics.find(d=>d.code==='W1003')!;
    assert.equal(document.getText(spaces.range),'  ');assert.equal(spaces.severity,vscode.DiagnosticSeverity.Warning);
    const alias=diagnostics.find(d=>d.code==='W1001')!;
    assert.equal(document.getText(alias.range),'未声明');assert.equal(alias.severity,vscode.DiagnosticSeverity.Warning);
    record('Real VS Code Error/Warning diagnostics use exact resource/alias/space ranges');
    assert.equal(await api.checkProject(root),1);record('Project check returns 1 for resource errors');
    const background=await write('Resources/Background/missing.png','fixture');
    await wait(ds=>!ds.some(d=>d.code==='E2001'&&d.range.start.line===5)&&ds.some(d=>d.code==='W1003'));
    await write('Resources/Char_Picture/ghost/normal.png','fixture');
    await wait(ds=>!ds.some(d=>d.code==='E2001')&&ds.some(d=>d.code==='W1003'));
    record('Creating image resources clears errors automatically without editing the script');
    await replace(prefix+'背景：missing\n凯尔希  正文\n凯尔希\t正文\n--ghost:normal/1');
    diagnostics=await wait(ds=>!ds.some(d=>d.code==='W1001')&&ds.some(d=>d.code==='W1003'));
    assert.ok(document.isDirty);record('Unsaved text fixes clear undeclared-alias warnings');
    const warning=diagnostics.find(d=>d.code==='W1003')!;
    const actions=await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider',script,warning.range,vscode.CodeActionKind.QuickFix.value);
    const action=actions.find(a=>a.edit&&a.title.includes('Tab'))!;assert.ok(action);
    assert.ok(await vscode.workspace.applyEdit(action.edit!));await wait(ds=>ds.length===0);
    record('The space-to-Tab quick fix changes only the marked separator and clears its warning');
    await replace(prefix+'未声明\t正文');await wait(ds=>ds.some(d=>d.code==='W1001'));
    assert.equal(await api.checkProject(root),0);record('Warnings remain visible but do not fail a project check');
    await replace(prefix+'背景：missing\n凯尔希\t😀甲乙丙');
    await config.update('validation.maxLineLength',3,vscode.ConfigurationTarget.Global);
    diagnostics=await wait(ds=>ds.some(d=>d.code==='W1002'));
    const length=diagnostics.find(d=>d.code==='W1002')!;
    assert.equal(document.getText(length.range),'凯尔希\t😀甲乙丙');assert.equal(length.range.start.character,0);assert.equal(length.severity,vscode.DiagnosticSeverity.Warning);assert.equal(length.message,'超出3字，显示效果可能会受到影响。');
    await config.update('validation.maxLineLength',null,vscode.ConfigurationTarget.Global);await wait(ds=>ds.length===0);
    record('Configured length warnings count emoji correctly and disappear when disabled');
    await config.update('validation.maxLineLength',undefined,vscode.ConfigurationTarget.Global);
    assert.equal(vscode.workspace.getConfiguration('astoryx',script).get('validation.maxLineLength'),60);
    await replace(prefix+'凯尔希\t'+'中'.repeat(60)+'。');
    diagnostics=await wait(ds=>ds.some(d=>d.code==='W1002'));
    const defaultLength=diagnostics.find(d=>d.code==='W1002')!;
    assert.equal(defaultLength.message,'超出60字，显示效果可能会受到影响。');assert.equal(defaultLength.range.start.character,0);assert.equal(document.getText(defaultLength.range),'凯尔希\t'+'中'.repeat(60)+'。');
    assert.equal(await api.checkProject(root),0);
    await replace(prefix+'背景：missing\n凯尔希\t'+'中'.repeat(60));await wait(ds=>ds.length===0);
    record('Sixty Chinese characters are accepted by default; longer lines are fully underlined with the unified warning and remain warning-only');
    const ruleDocument=await vscode.workspace.openTextDocument(rule);
    const changeRule=async(text:string)=>{const edit=new vscode.WorkspaceEdit();edit.replace(rule,new vscode.Range(ruleDocument.positionAt(0),ruleDocument.positionAt(ruleDocument.getText().length)),text);await vscode.workspace.applyEdit(edit);};
    await changeRule('{');diagnostics=await wait(ds=>ds.some(d=>d.code==='E1002'));
    assert.ok(!diagnostics.some(d=>d.code==='E2001'));await changeRule(ruleText);await ruleDocument.save();
    await wait(ds=>ds.length===0);record('Unsaved invalid rule JSON produces E1002 without cascaded resource errors; restoring clears it');
    await vscode.workspace.fs.delete(background,{useTrash:false});await wait(ds=>ds.some(d=>d.code==='E2001'));
    await write('Resources/Background/missing.png','fixture');await wait(ds=>ds.length===0);
    record('Deleting and restoring a resource refreshes diagnostics without saving the script');
    await replace(prefix+'背景：missing/abc');await replace(prefix+'背景：missing\n凯尔希\t短句');
    await wait(ds=>ds.length===0);assert.equal(await api.checkProject(root),0);
    record('The latest edit wins over obsolete async checks and a repaired project passes');
    const scenario=(name:string,...lines:string[])=>['别名与规则测试','#useRule:'+name,...lines].join('\n');
    await replace(scenario('BaseRule','--char:normal/1'));
    await wait(ds=>ds.length===0);
    const baseSignature=await vscode.commands.executeCommand<vscode.SignatureHelp>('vscode.executeSignatureHelpProvider',script,new vscode.Position(2,document.lineAt(2).text.length));
    assert.ok(baseSignature.signatures[0].label.includes('/SlotIndex'));
    await replace(scenario('AdvanceRule','--char:normal,@IsBlocker=true,@SlotIndex=1'));
    await wait(ds=>ds.length===0);
    const advanceSignature=await vscode.commands.executeCommand<vscode.SignatureHelp>('vscode.executeSignatureHelpProvider',script,new vscode.Position(2,document.lineAt(2).text.length));
    assert.ok(advanceSignature.signatures[0].label.includes(',@SlotIndex='));
    const documentation=advanceSignature.signatures[0].documentation;
    const signatureText=typeof documentation==='string'?documentation:documentation?.value??'';
    assert.ok(signatureText.includes('当前规则：')&&signatureText.includes('AdvanceRule'));assert.ok(!signatureText.includes('规则目录')&&!signatureText.includes(root));
    const hover=await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider',script,new vscode.Position(2,4));
    const hoverText=hover.flatMap(h=>h.contents).map(c=>typeof c==='string'?c:c.value).join('\n');
    assert.ok(hoverText.includes('当前规则：')&&hoverText.includes('AdvanceRule'));assert.ok(!hoverText.includes('规则目录')&&!hoverText.includes(root));
    await replace(scenario('AdvanceRule','--char:normal,@SlotIndex=bad'));
    diagnostics=await wait(ds=>ds.some(d=>d.code==='E3006'));
    assert.equal(diagnostics.find(d=>d.code==='E3006')!.relatedInformation?.length??0,0);
    record('Changing useRule selects positional/named parsing; hover and signature retain the current rule while diagnostics omit rule links');
    await replace(scenario('MissingRule','--char:normal/1'));
    diagnostics=await wait(ds=>ds.some(d=>d.code==='E1002'));
    assert.equal(diagnostics.find(d=>d.code==='E1002')!.message,'在 Rules/ 找不到 MissingRule.json。');assert.ok(!diagnostics.some(d=>d.code==='E2001'));
    record('Missing selected rules report E1002 with a relative Rules/ filename');
    for(const name of ['BaseRule','AdvanceRule']){
      await replace(scenario(name,'#aliases','char->凯尔希','凯尔希\t直接对话'));
      diagnostics=await wait(ds=>ds.length===1&&ds[0].code==='W1007'&&ds[0].range.start.line===4);
      assert.ok(diagnostics.every(d=>d.severity===vscode.DiagnosticSeverity.Warning));
      const dialogueWarning=diagnostics.find(d=>d.code==='W1007')!;
      assert.equal(dialogueWarning.range.start.line,4);assert.equal(dialogueWarning.range.start.character,0);assert.equal(document.getText(dialogueWarning.range),'凯尔希\t直接对话');
      assert.equal(dialogueWarning.message,'缺少 #endaliases。');assert.ok(!diagnostics.some(d=>d.code==='W1008'));
      assert.equal(await api.checkProject(root),0);
      await replace(scenario(name,'#aliases','char->凯尔希','凯尔希\t直接对话','#endaliases'));
      diagnostics=await wait(ds=>ds.length===1&&ds[0].code==='W1008'&&ds[0].range.start.line===4);
      assert.ok(!diagnostics.some(d=>d.code==='W1007'));
      assert.equal(document.getText(diagnostics[0].range),'凯尔希\t直接对话');
      assert.ok(!diagnostics[0].message.includes('#endaliases'));
    }
    record('Missing endaliases produces only W1007 after valid aliases; adding the end switches illegal-entry checks to W1008 in both rule modes');
    await replace(scenario('BaseRule','#endaliases'));
    diagnostics=await wait(ds=>ds.length===1&&ds[0].code==='W1007');
    assert.equal(document.getText(diagnostics[0].range),'#endaliases');assert.equal(diagnostics[0].message,'上方没有 #aliases。');
    record('An unmatched endaliases warns on its own whole line with the missing opener message');
    await replace(scenario('AdvanceRule','#aliases','char->','#endaliases'));
    diagnostics=await wait(ds=>ds.length===1&&ds[0].code==='W1008');
    assert.equal(document.getText(diagnostics[0].range),'char->');
    await replace(scenario('AdvanceRule','#aliases','char->凯尔希','char->凯尔希','#endaliases'));
    diagnostics=await wait(ds=>ds.length===1&&ds[0].code==='W1009');
    assert.equal(diagnostics[0].range.start.line,4);assert.equal(document.getText(diagnostics[0].range),'char->凯尔希');assert.equal(diagnostics[0].message,'重复指定的别名');
    await replace(scenario('AdvanceRule','#aliases','char->凯尔希/医生/???/a?/e/f','#endaliases'));
    await wait(ds=>ds.length===0);
    record('Invalid mappings and later duplicate aliases get whole-line warnings; valid multi-alias question-mark names clear them');
  }catch(error){await fs.writeFile(resultFile,JSON.stringify({passed:false,messages,error:String(error),stack:(error as Error).stack},null,2));throw error;}
  finally{
    await config.update('validation.maxLineLength',previous,vscode.ConfigurationTarget.Global);
    for(const document of vscode.workspace.textDocuments.filter(d=>d.uri.fsPath.startsWith(root+path.sep)&&!d.isClosed)){
      await vscode.window.showTextDocument(document);await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }
    assert.ok(path.resolve(root).startsWith(path.resolve(workspace)+path.sep+'.test-diag-'));
    await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
  await fs.writeFile(resultFile,JSON.stringify({passed:true,messages},null,2));
}
