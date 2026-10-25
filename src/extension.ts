import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Analysis, CONTROLLERS, currentSegment, Issue, parameterInfo, ParsedLine, Segment, splitTopLevel,requiredParts } from './core';
import { discoverRoot, diskAccess, DocumentResult, inside, loadDocument, storyFiles } from './project';
import { HIGHLIGHT_COLORS, HighlightRole, HighlightSpan, highlightSpans } from './highlighting';
import {ResourceCategory, ResourceIndex} from './resources';
import {aliasTable,writingIssues,DEFAULT_MAX_LINE_LENGTH} from './writing-checks';
import {CODES} from './diagnostic-codes';
import {defaultOfficialConfigDirectory,loadOfficialCatalog} from './official-assets';
import {parameterHints} from './inlay-hints';
import {newStoryFile} from './new-story';
import {newProject} from './new-project';

const selector: vscode.DocumentSelector = {language:'astoryx',scheme:'file'};
const directives = ['useRule','version','aliases','endaliases','block','endblock','use'];
const legend = new vscode.SemanticTokensLegend(['function','parameter','variable','number','keyword']);
const documentation = 'https://www.yuque.com/tsingyayin/aser';

export function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection('astoryx');
  const output = vscode.window.createOutputChannel('AStoryX');
  output.appendLine(`AStoryX ${context.extension.packageJSON.version} 已加载：${context.extensionPath}`);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,80);
  status.command = 'astoryx.checkProject';
  const tokensChanged = new vscode.EventEmitter<void>();
  const highlightingApplied = new vscode.EventEmitter<{uri:vscode.Uri;version:number;spans:HighlightSpan[]}>();
  const highlightRoles=Object.keys(HIGHLIGHT_COLORS) as HighlightRole[];
  const decorations=Object.fromEntries(highlightRoles.map(role=>[role,vscode.window.createTextEditorDecorationType({
    color:new vscode.ThemeColor(HIGHLIGHT_COLORS[role]),rangeBehavior:vscode.DecorationRangeBehavior.ClosedClosed
  })])) as Record<HighlightRole,vscode.TextEditorDecorationType>;
  let colorTimer:ReturnType<typeof setTimeout>|undefined;
  const cache = new Map<string,{version:number;epoch:number;result:Promise<DocumentResult>}>();
  type Report=DocumentResult&{version:number;generation:number};
  const reports=new Map<string,{version:number;epoch:number;result:Promise<Report>}>();
  const indexes=new Map<string,Promise<ResourceIndex>>();
  const officialWatchers=new Map<string,vscode.FileSystemWatcher>();
  const pending = new Map<string,ReturnType<typeof setTimeout>>();
  const owned = new Map<string,string>();
  let epoch=0, revision=0, checking=false, disposed=false, checkSequence=0;
  let last: {root:string;label:string;detail:string;color?:string} | undefined;
  const folders = () => (vscode.workspace.workspaceFolders??[]).filter(f=>f.uri.scheme==='file').map(f=>f.uri.fsPath);
  const configuration = (uri?:vscode.Uri) => vscode.workspace.getConfiguration('astoryx',uri);
  const io = {
    ...diskAccess,
    async readText(file:string) {
      const key=vscode.Uri.file(file).toString();
      const open=vscode.workspace.textDocuments.find(d=>d.uri.toString()===key);
      return open?open.getText():diskAccess.readText(file);
    }
  };

  function updateStatus() {
    const document=vscode.window.activeTextEditor?.document;
    if (document?.languageId!=='astoryx' && !checking) {status.hide();return;}
    status.show();
    if (checking) {status.text='$(sync~spin) AStoryX: Checking…';status.color=undefined;status.tooltip='正在进行项目基础静态检查。';}
    else if (last && document && inside(last.root,document.uri.fsPath)) {status.text=last.label;status.tooltip=last.detail;status.color=last.color?new vscode.ThemeColor(last.color):undefined;}
    else {status.text='$(circle-outline) AStoryX: 未检查';status.color=undefined;status.tooltip='点击检查当前项目。编辑后的旧检查结果已过期。';}
  }

  async function data(document:vscode.TextDocument):Promise<DocumentResult> {
    const key=document.uri.toString(), existing=cache.get(key);
    if (existing?.version===document.version && existing.epoch===epoch) return existing.result;
    const config=configuration(document.uri);
    const result=loadDocument(document.uri.fsPath,document.getText(),folders(),config.get<string>('projectRoot',''),io,{maxLineLength:config.get<number|null>('validation.maxLineLength',DEFAULT_MAX_LINE_LENGTH)});
    cache.set(key,{version:document.version,epoch,result}); return result;
  }
  function resourceIndex(root:string):Promise<ResourceIndex> {
    let index=indexes.get(root);
    if(!index){
      const config=configuration(vscode.Uri.file(root));
      const configured=config.get<string>('resources.officialConfigDirectory','').trim();
      const directory=configured?path.resolve(root,configured):defaultOfficialConfigDirectory();
      const enabled=config.get<boolean>('resources.officialAssetsEnabled',true);
      if(enabled&&directory&&!officialWatchers.has(directory)){
        const watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(directory),'officialAssets_*.json'));
        officialWatchers.set(directory,watcher);
        context.subscriptions.push(watcher,watcher.onDidChange(rulesChanged),watcher.onDidCreate(rulesChanged),watcher.onDidDelete(rulesChanged));
      }
      index=(async()=>new ResourceIndex(root,enabled?await loadOfficialCatalog(root,directory,io,!!configured):[],{readDirectory:directory=>fs.readdir(directory,{withFileTypes:true}),readText:io.readText}))();
      indexes.set(root,index);
    }
    return index;
  }
  function report(document:vscode.TextDocument):Promise<Report>{
    const key=document.uri.toString(),version=document.version,generation=epoch,existing=reports.get(key);
    if(existing?.version===version&&existing.epoch===generation)return existing.result;
    const result=(async():Promise<Report>=>{
      const parsed=await data(document),notes=[...(parsed.notes??[])];
      if(!parsed.root||!parsed.analysis)return {...parsed,version,generation};
      const index=await resourceIndex(parsed.root);
      const writing=writingIssues(parsed.analysis,{maxLineLength:configuration(document.uri).get<number|null>('validation.maxLineLength',DEFAULT_MAX_LINE_LENGTH),knownSpeakers:index.configuredNames(),namesUnverified:index.catalogs.some(c=>c.official&&c.failure)});
      const writingCodes=new Set<string>([CODES.aliasUndeclared,CODES.dialogueSpaces,CODES.lineLength]);
      const issues=[...parsed.issues.filter(issue=>!writingCodes.has(issue.code)),...writing];
      if(!configuration(document.uri).get<boolean>('validation.resourceChecks',true)){
        notes.push('资源检查未启用。');return {...parsed,issues,notes,version,generation};
      }
      const extra=await index.check(parsed.analysis);
      const failure=extra.issues.some(i=>i.code===CODES.resourceIndex||i.code===CODES.catalogLoad)?'资源索引未完成。':parsed.failure;
      return {...parsed,issues:[...issues,...extra.issues],incomplete:extra.incomplete,notes,failure,version,generation};
    })();
    reports.set(key,{version,epoch:generation,result});return result;
  }
  async function colorEditor(editor:vscode.TextEditor) {
    const document=editor.document;
    if(document.languageId!=='astoryx'||document.uri.scheme!=='file') {
      for(const role of highlightRoles)editor.setDecorations(decorations[role],[]);
      return;
    }
    const version=document.version,generation=epoch;
    const ranges:Record<HighlightRole,vscode.Range[]>={speaker:[],dialogue:[],character:[],controller:[],narration:[],parameter:[]};
    let spans:HighlightSpan[]=[];
    try {
      if(configuration(document.uri).get<boolean>('highlighting.enabled',true)) {
        const result=await data(document);
        if(result.analysis)spans=highlightSpans(result.analysis);
        for(const span of spans)ranges[span.role].push(new vscode.Range(span.line,span.start,span.line,span.end));
      }
      if(disposed||document.isClosed||version!==document.version||generation!==epoch)return;
      for(const role of highlightRoles)editor.setDecorations(decorations[role],ranges[role]);
      highlightingApplied.fire({uri:document.uri,version,spans});
    }catch(error){output.appendLine(`着色失败：${String(error)}`);}
  }
  function refreshColors(immediate=false) {
    if(colorTimer)clearTimeout(colorTimer);
    const paint=()=>{colorTimer=undefined;for(const editor of vscode.window.visibleTextEditors)void colorEditor(editor);};
    if(immediate)paint();else colorTimer=setTimeout(paint,80);
  }
  const diagnostic=(i:Issue,document:vscode.TextDocument) => {
    const line=Math.min(Math.max(0,i.line),document.lineCount-1), length=document.lineAt(line).text.length;
    const start=Math.min(i.start,length),end=Math.min(Math.max(start,i.end),length);
    const result=new vscode.Diagnostic(new vscode.Range(line,start,line,end),i.message,i.severity==='error'?vscode.DiagnosticSeverity.Error:i.severity==='warning'?vscode.DiagnosticSeverity.Warning:vscode.DiagnosticSeverity.Information);
    result.source='AStoryX'; result.code=i.code;
    return result;
  };
  async function publish(document:vscode.TextDocument,result:Report) {
    if (disposed || document.isClosed || document.version!==result.version || result.generation!==epoch) return;
    diagnostics.set(document.uri,result.issues.map(i=>diagnostic(i,document)));
    if (result.root) owned.set(document.uri.toString(),result.root);
  }
  async function validate(document:vscode.TextDocument) {
    if (document.languageId!=='astoryx' || document.uri.scheme!=='file' || document.isClosed) return;
    const version=document.version, generation=epoch;
    if (!configuration(document.uri).get<boolean>('validation.enabled',true)) {diagnostics.delete(document.uri);return;}
    try {
      const result=await report(document);
      if (version===document.version && generation===epoch) await publish(document,result);
    } catch(error) {output.appendLine(`检查失败：${String(error)}`);}
  }
  function schedule(document:vscode.TextDocument) {
    const key=document.uri.toString(); const timer=pending.get(key);if(timer)clearTimeout(timer);
    pending.set(key,setTimeout(()=>{pending.delete(key);void validate(document);},configuration(document.uri).get<number>('validation.delay',350)));
  }
  function invalidate(all=true) {
    revision++; last=undefined;
    if(all) {epoch++;cache.clear();reports.clear();indexes.clear();tokensChanged.fire();}
    updateStatus();
  }
  function rulesChanged() {
    invalidate();
    // Closed-file diagnostics are stale too; a project check will repopulate them.
    diagnostics.clear();owned.clear();
    for(const doc of vscode.workspace.textDocuments) schedule(doc);
    refreshColors();
  }

  function markdown(parsed:ParsedLine,segment:Segment,ruleFile?:string):vscode.MarkdownString {
    const info=parameterInfo(parsed.rule.id,segment.name), md=new vscode.MarkdownString();
    md.appendMarkdown(`**${CONTROLLERS[parsed.rule.id]??parsed.rule.id} · ${segment.name}**\n\n`);
    md.appendText(info?.description??'此参数由当前项目规则定义，尚无类型资料。');
    if(info) md.appendMarkdown(`\n\n类型：\`${info.type}\`${info.defaultValue!==undefined?`　默认：\`${info.defaultValue}\``:''}`);
    if(ruleFile) {
      md.appendMarkdown('\n\n当前规则：');md.appendText(path.basename(ruleFile,'.json'));
    }
    md.appendMarkdown(`\n\n[参数文档](${documentation})`);return md;
  }

  const completion:vscode.CompletionItemProvider={
    async provideCompletionItems(document,position,token) {
      const result=await data(document);if(token.isCancellationRequested)return [];
      const before=document.lineAt(position.line).text.slice(0,position.character), items:vscode.CompletionItem[]=[];
      if (position.line===1 && /^#userule\s*:/i.test(before)) {
        const root=result.root??await discoverRoot(document.uri.fsPath,folders(),configuration(document.uri).get('projectRoot',''),io);
        if(root) for(const dir of [path.join(root,'Rules'),root]) {
          const entries=await fs.readdir(dir,{withFileTypes:true}).catch(()=>[]);
          for(const e of entries)if(e.isFile()&&e.name.endsWith('.json')) {const item=new vscode.CompletionItem(path.parse(e.name).name,vscode.CompletionItemKind.Module);item.range=new vscode.Range(position.line,before.indexOf(':')+1,position.line,position.character);items.push(item);}
        }
        return items;
      }
      if (/^#[A-Za-z]*$/.test(before)) {
        for(const name of directives) {const item=new vscode.CompletionItem('#'+name,vscode.CompletionItemKind.Keyword);item.insertText='#'+name;item.range=new vscode.Range(position.line,0,position.line,position.character);items.push(item);}return items;
      }
      if (/^#use\s+[^()]*$/.test(before) && result.analysis) return result.analysis.blocks.map(block=>{
        const item=new vscode.CompletionItem(block.name,vscode.CompletionItemKind.Function);item.range=new vscode.Range(position.line,before.search(/\s/)+1,position.line,position.character);
        item.insertText=new vscode.SnippetString(block.name+'('+block.parameters.map((p,i)=>'${'+(i+1)+':'+p+'}').join(',')+')');return item;
      });
      if (!result.rules || !result.analysis || position.line===0 || /^\s*\/\//.test(before)) return [];
      const parsed=result.analysis.parsed.get(position.line);
      if (/^[^\s/：:,@=\t#{}()[\]]*$/.test(before)&&!(parsed?.rule.id==='Character'&&position.character>=parsed.headerEnd)) {
        for(const rule of result.rules.rules)if(rule.header) {
          const item=new vscode.CompletionItem(`${CONTROLLERS[rule.id]??rule.id} · ${rule.id}`,vscode.CompletionItemKind.Keyword);
          item.insertText=rule.header;item.filterText=`${rule.header} ${rule.id} ${CONTROLLERS[rule.id]??''}`;item.range=new vscode.Range(position.line,0,position.line,position.character);item.detail=`当前规则：${rule.header}`;item.sortText='0'+rule.id;items.push(item);
        }
      }
      if(!parsed)return items;
      const segment=currentSegment(parsed,position.character), info=parameterInfo(parsed.rule.id,segment.name);
      // Complete a partially typed named prefix, including the leading comma.
      const named=/(,@[^,=\s]*)$/.exec(before);
      if(named && parsed.rule.advanced) {
        for(const p of parsed.rule.optionalParameters.filter(p=>p.prefix.startsWith(',@'))) {
          if(parsed.segments.some(s=>s.name===p.parameterName && s.prefixStart < before.length-named[0].length))continue;
          const item=new vscode.CompletionItem(p.parameterName,vscode.CompletionItemKind.Property);item.insertText=p.prefix;item.filterText=p.prefix;
          item.range=new vscode.Range(position.line,before.length-named[0].length,position.line,position.character);item.documentation=parameterInfo(parsed.rule.id,p.parameterName)?.description;items.push(item);
        }return items;
      }
      let values=info?.suggestions?[...info.suggestions]:[];
      if(info?.type==='labels')values.push(...result.analysis.labels.map(s=>s.name));
      if(info?.type==='expression'||info?.type==='expressions'||/\$\[[^\]]*$/.test(before)||(segment.name==='Name'&&['Variable','Judge','Branch'].includes(parsed.rule.id)))values.push(...result.analysis.variables.map(s=>s.name),...(parsed.rule.id==='Branch'?['_']:[]));
      let characterNameCompletion=false,characterVariantRange:vscode.Range|undefined;
      if(info?.resource&&result.root) {
        let character:string|undefined;
        if(parsed.rule.id==='Character'&&segment.index===-1) {
          const parts=requiredParts(parsed),delimiter=parts[0].end;
          if(parts.length>1&&position.character>segment.start+delimiter){
            if(parsed.issues.some(issue=>issue.code===CODES.characterColon))return [];
            character=parts[0].value.trim();
            characterVariantRange=new vscode.Range(position.line,segment.start+parts[1].start,position.line,segment.start+parts[1].end);
          }else characterNameCompletion=true;
        }
        const index=await resourceIndex(result.root);
        const resolved=character?index.resolveCharacter(aliasTable(result.analysis),character,position.line):undefined;
        values.push(...await index.names(info.resource as ResourceCategory,resolved?.name));
      }
      if(parsed.rule.id==='Dialog'&&segment.index===-1&&!before.includes('\t'))values.push(...result.analysis.speakers);
      const word=document.getWordRangeAtPosition(position,/[^\s/：:,+`=;(){}\[\]@|]+/u);
      for(const value of new Set(values)) {
        const item=new vscode.CompletionItem(value,info?.resource?vscode.CompletionItemKind.File:info?.type==='boolean'?vscode.CompletionItemKind.Value:vscode.CompletionItemKind.Variable);
        item.range=characterVariantRange??word??new vscode.Range(position,position);
        if(characterNameCompletion&&parsed.rule.requiredParametersSeparator===':'){
          const start=segment.start,end=segment.start+requiredParts(parsed)[0].end,delimiter=document.lineAt(position.line).text[end];
          item.range=new vscode.Range(position.line,start,position.line,end+(/[:：]/.test(delimiter??'')?1:0));
          item.insertText=value+':';item.command={command:'editor.action.triggerSuggest',title:'选择差分'};
        }
        item.detail=characterVariantRange?'Variant':segment.name;item.documentation=info?.description;items.push(item);
      }
      return items;
    }
  };

  const signature:vscode.SignatureHelpProvider={
    async provideSignatureHelp(document,position,token) {
      const result=await data(document);if(token.isCancellationRequested)return;
      const before=document.lineAt(position.line).text.slice(0,position.character), call=/^#use\s+([^\s(]+)\((.*)$/.exec(before);
      if(call && result.analysis) {
        const block=result.analysis.blocks.find(b=>b.name===call[1]);if(!block)return;
        const help=new vscode.SignatureHelp(),sig=new vscode.SignatureInformation(block.name+'('+block.parameters.join(', ')+')');
        sig.parameters=block.parameters.map(p=>new vscode.ParameterInformation(p));help.signatures=[sig];help.activeSignature=0;help.activeParameter=Math.min(Math.max(0,block.parameters.length-1),splitTopLevel(call[2],',').length-1);return help;
      }
      const parsed=result.analysis?.parsed.get(position.line);if(!parsed)return;
      const required=parsed.segments[0],parts=requiredParts(parsed);
      if(parsed.rule.id==='Character'&&result.root&&parts.length>1&&position.character>required.start+parts[0].end&&position.character<=required.end){
        if(parsed.issues.some(issue=>issue.code===CODES.characterColon))return;
        const index=await resourceIndex(result.root),resolved=index.resolveCharacter(aliasTable(result.analysis!),parts[0].value.trim(),position.line);
        if(resolved.record)return;
      }
      const segment=currentSegment(parsed,position.character),help=new vscode.SignatureHelp();
      let label=`${CONTROLLERS[parsed.rule.id]??parsed.rule.id}  ${parsed.rule.header??''}`;
      const parameters:vscode.ParameterInformation[]=[];
      const add=(name:string,prefix:string)=>{label+=prefix;const start=label.length;label+=name;parameters.push(new vscode.ParameterInformation([start,label.length],parameterInfo(parsed.rule.id,name)?.description));};
      add(parsed.rule.requiredParametersName,'');for(const p of parsed.rule.optionalParameters)add(p.parameterName,p.prefix);
      const sig=new vscode.SignatureInformation(label,markdown(parsed,segment,result.ruleFile));sig.parameters=parameters;
      help.signatures=[sig];help.activeSignature=0;help.activeParameter=Math.max(0,segment.index+1);return help;
    }
  };

  const hover:vscode.HoverProvider={async provideHover(document,position){const result=await data(document),parsed=result.analysis?.parsed.get(position.line);if(!parsed)return;const segment=currentSegment(parsed,position.character);return new vscode.Hover(markdown(parsed,segment,result.ruleFile),new vscode.Range(position.line,position.character<parsed.headerEnd?0:segment.prefixStart,position.line,Math.max(parsed.headerEnd,segment.end)));}};
  const definitions:vscode.DefinitionProvider={async provideDefinition(document,position){
    const result=await data(document);if(!result.analysis)return;
    const line=document.lineAt(position.line).text,word=document.getText(document.getWordRangeAtPosition(position,/[^\s/：:,+`=;(){}\[\]@]+/u)??new vscode.Range(position,position));
    const candidates=/^#use\s/.test(line)?result.analysis.blocks:result.analysis.parsed.get(position.line)?.rule.id==='Branch'?result.analysis.labels:result.analysis.variables;
    const target=candidates.find(s=>s.name===word);if(target)return new vscode.Location(document.uri,new vscode.Range(target.line,target.start,target.line,target.end));
  }};
  const semantic:vscode.DocumentSemanticTokensProvider={onDidChangeSemanticTokens:tokensChanged.event,async provideDocumentSemanticTokens(document,token){
    const result=await data(document),builder=new vscode.SemanticTokensBuilder(legend);if(token.isCancellationRequested)return builder.build();
    for(const [line,p]of result.analysis?.parsed??[]) {
      if(p.headerEnd)builder.push(line,0,p.headerEnd,0,0);
      for(const s of p.segments) {
        if(s.start>s.prefixStart)builder.push(line,s.prefixStart,s.start-s.prefixStart,1,0);
        if(s.end>s.start&&['number','integer','boolean'].includes(parameterInfo(p.rule.id,s.name)?.type??''))builder.push(line,s.start,s.end-s.start,parameterInfo(p.rule.id,s.name)?.type==='boolean'?4:3,0);
      }
    }return builder.build();
  }};

  async function projectRoot(explicit?:string):Promise<string|undefined> {
    if(explicit)return path.resolve(explicit);
    const active=vscode.window.activeTextEditor?.document;
    if(active?.uri.scheme==='file') {const root=await discoverRoot(active.uri.fsPath,folders(),configuration(active.uri).get('projectRoot',''),io);if(root)return root;}
    const choices:string[]=[];
    for(const folder of folders()) {
      const configured=configuration(vscode.Uri.file(folder)).get<string>('projectRoot','');
      const root=configured?path.resolve(folder,configured):folder;
      if(await diskAccess.exists(path.join(root,'Stories')))choices.push(root);
    }
    if(choices.length===1)return choices[0];
    if(choices.length>1)return vscode.window.showQuickPick(choices,{placeHolder:'选择要检查的 AStoryX 项目'});
    throw new Error('未找到项目。请先打开项目内的 .astoryx 文件，或设置 astoryx.projectRoot。');
  }

  async function checkProject(rootArgument?:string,externalToken?:vscode.CancellationToken,write:(s:string)=>void=s=>output.appendLine(s)):Promise<number> {
    if(checking){write('已有项目检查正在运行。');return 2;}
    checking=true;last=undefined;const sequence=++checkSequence;updateStatus();
    let root:string|undefined;
    try {
      root=await projectRoot(rootArgument);if(!root)return 2;
      for(const doc of vscode.workspace.textDocuments.filter(d=>d.uri.scheme==='file'&&inside(root!,d.uri.fsPath)&&d.isDirty&&(d.languageId==='astoryx'||/\.json$/i.test(d.uri.fsPath)))) {
        if(!await doc.save())throw new Error('有文件未能保存，项目检查已停止。');
      }
      const startRevision=revision,project=root;
      return await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'AStoryX：检查项目',cancellable:true},async(progress,token)=>{
        const cancelled=()=>token.isCancellationRequested||!!externalToken?.isCancellationRequested;
        const max=configuration(vscode.Uri.file(project)).get<number>('validation.maxFiles',5000);
        const listed=await storyFiles(project,max,cancelled);
        if(!listed.files.length&&!cancelled())throw new Error('Stories 目录中没有 .astoryx 文件。');
        let errors=0,warnings=0,unverified=0,failed=false,checked=0;
        const coverage=new Set<string>(),notes=new Set<string>(), seen=new Set<string>();
        write(`\nAStoryX 基础静态检查：${project}`);
        for(const file of listed.files) {
          if(cancelled())break;
          const uri=vscode.Uri.file(file),key=uri.toString();seen.add(key);
          progress.report({message:path.relative(project,file),increment:100/listed.files.length});
          try {
            const document=await vscode.workspace.openTextDocument(uri),version=document.version;
            const result=await report(document);
            if(document.version!==version)coverage.add('检查期间文件发生变化。');
            if(startRevision===revision&&!cancelled())await publish(document,result);
            for(const i of result.issues) {
              if(i.severity==='error')errors++;else if(i.severity==='warning')warnings++;else unverified++;
              write(`${path.relative(project,file)}:${i.line+1}:${i.start+1} [${i.code}] ${i.message}`);
            }
            if(result.failure)failed=true;
            for(const reason of result.analysis?.incomplete??[])coverage.add(reason);
            for(const reason of result.incomplete??[])coverage.add(reason);
            for(const note of result.notes??[])notes.add(note);
            checked++;
          } catch(error) {failed=true;write(`${path.relative(project,file)}：工具失败 ${String(error)}`);}
          // Yield so typing/cancellation can be processed while scanning many files.
          await new Promise<void>(resolve=>setImmediate(resolve));
        }
        if(listed.truncated)coverage.add(`超出文件上限 ${max}，未检查全部文件。`);
        if(cancelled())coverage.add('检查已取消。');
        if(startRevision!==revision)coverage.add('检查期间项目发生变化，结果已过期。');
        const partial=coverage.size>0||unverified>0;
        if(!cancelled()&&startRevision===revision)for(const [key,owner]of owned)if(owner===project&&!seen.has(key)){diagnostics.delete(vscode.Uri.parse(key));owned.delete(key);}
        const label=failed?'$(error) AStoryX: 检查失败':errors?`$(error) AStoryX: ${errors} 个错误，${warnings} 个警告`:partial?'$(info) AStoryX: 检查不完整':warnings?`$(warning) AStoryX: ${warnings} 个警告`:'$(check) AStoryX: Complete';
        const detail=`基础静态检查：${checked} 个文件，${errors} 个错误，${warnings} 个警告。\n${[...coverage,...notes].join('\n')}\n范围：项目规则、资源名称、别名、控制器参数、表达式和区块引用；不验证演出结果。`;
        if(sequence===checkSequence){last={root:project,label,detail,color:failed||errors?'errorForeground':partial||warnings?'editorWarning.foreground':'testing.iconPassed'};updateStatus();}
        write(label.replace(/\$\([^)]*\)\s*/g,'')+`；${checked} 个文件，${errors} 个错误，${warnings} 个警告。`);
        for(const message of coverage)write('未验证：'+message);
        for(const note of notes)write('说明：'+note);
        return failed||partial?2:errors?1:0;
      });
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);write('检查失败：'+message);
      if(root)last={root,label:'$(error) AStoryX: 检查失败',detail:message,color:'errorForeground'};
      void vscode.window.showErrorMessage('AStoryX：'+message);return 2;
    } finally {checking=false;updateStatus();}
  }

  const taskProvider:vscode.TaskProvider={
    async provideTasks(){
      const tasks:vscode.Task[]=[];
      for(const folder of vscode.workspace.workspaceFolders??[]) {
        if(folder.uri.scheme!=='file')continue;
        const configured=configuration(folder.uri).get<string>('projectRoot',''),root=path.resolve(folder.uri.fsPath,configured||'.');
        if(await diskAccess.exists(path.join(root,'Stories')))tasks.push(makeTask({type:'astoryx',project:root},folder));
      }return tasks;
    },
    resolveTask(task){return makeTask(task.definition,typeof task.scope==='object'?task.scope:vscode.TaskScope.Workspace);}
  };
  function makeTask(definition:vscode.TaskDefinition,scope:vscode.WorkspaceFolder|vscode.TaskScope):vscode.Task {
    const task=new vscode.Task(definition,scope,'检查项目','AStoryX',new vscode.CustomExecution(async()=>{
      const writes=new vscode.EventEmitter<string>(),closes=new vscode.EventEmitter<number>(),cancel=new vscode.CancellationTokenSource();let closed=false;
      return {onDidWrite:writes.event,onDidClose:closes.event,
        open(){const base=typeof scope==='object'?scope.uri.fsPath:folders()[0];const configured=base?configuration(vscode.Uri.file(base)).get<string>('projectRoot',''):'';
          const root=definition.project?path.resolve(base??'',String(definition.project)):base?path.resolve(base,configured||'.'):undefined;
          void checkProject(root,cancel.token,s=>{if(!closed)writes.fire(s.replace(/\r?\n/g,'\r\n')+'\r\n');}).then(code=>{if(!closed)closes.fire(code);writes.dispose();closes.dispose();cancel.dispose();});},
        close(){closed=true;cancel.cancel();}
      };
    }),[]);task.group=vscode.TaskGroup.Build;return task;
  }

  context.subscriptions.push(diagnostics,output,status,tokensChanged,highlightingApplied,...Object.values(decorations),
    vscode.languages.registerCompletionItemProvider(selector,completion,'：',':','/','@','=','[','(',','),
    vscode.languages.registerSignatureHelpProvider(selector,signature,{triggerCharacters:['：',':','/','=','(',','],retriggerCharacters:[',','/']}),
    vscode.languages.registerHoverProvider(selector,hover),
    vscode.languages.registerInlayHintsProvider(selector,{onDidChangeInlayHints:tokensChanged.event,async provideInlayHints(document,range,token){
      if(!configuration(document.uri).get<boolean>('inlayHints.enabled',true))return [];
      const version=document.version,generation=epoch,result=await data(document);
      if(token.isCancellationRequested||document.isClosed||version!==document.version||generation!==epoch||!result.analysis)return [];
      return parameterHints(result.analysis,range.start.line,range.end.line).filter(spec=>range.contains(new vscode.Position(spec.line,spec.character))).map(spec=>{
        const hint=new vscode.InlayHint(new vscode.Position(spec.line,spec.character),spec.name+':',vscode.InlayHintKind.Parameter);
        hint.paddingRight=true;hint.tooltip=spec.description??`参数：${spec.name}`;return hint;
      });
    }}),
    vscode.languages.registerDefinitionProvider(selector,definitions),
    vscode.languages.registerCodeActionsProvider(selector,{provideCodeActions(document,_range,context){
      return context.diagnostics.filter(d=>d.code===CODES.dialogueSpaces||d.code===CODES.characterColon).map(d=>{
        const colon=d.code===CODES.characterColon;
        const action=new vscode.CodeAction(colon?'将角色名与差分之间的中文冒号替换为英文冒号':'将人物名与台词之间的空格替换为 Tab',vscode.CodeActionKind.QuickFix);
        action.edit=new vscode.WorkspaceEdit();action.edit.replace(document.uri,d.range,colon?':':'\t');action.diagnostics=[d];action.isPreferred=true;return action;
      });
    }},{providedCodeActionKinds:[vscode.CodeActionKind.QuickFix]}),
    vscode.languages.registerDocumentSemanticTokensProvider(selector,semantic,legend),
    vscode.tasks.registerTaskProvider('astoryx',taskProvider),
    vscode.commands.registerCommand('astoryx.newFile',newStoryFile),
    vscode.commands.registerCommand('astoryx.newProject',(resource?:vscode.Uri)=>newProject(path.join(context.extensionPath,'templates/project'),resource)),
    vscode.commands.registerCommand('astoryx.checkProject',()=>checkProject()),
    vscode.commands.registerCommand('astoryx.showOutput',()=>output.show()),
    vscode.commands.registerCommand('astoryx.checkFile',async()=>{
      const doc=vscode.window.activeTextEditor?.document;if(doc?.languageId!=='astoryx')return;
      const result=await report(doc);await publish(doc,result);const errors=result.issues.filter(i=>i.severity==='error').length;
      output.appendLine(`当前文件 ${doc.uri.fsPath}：${errors} 个错误（不代表全项目检查结果）。`);
      void vscode.window.showInformationMessage(`AStoryX 当前文件：${errors} 个错误。项目检查请使用右上角按钮。`);
    }),
    vscode.workspace.onDidOpenTextDocument(doc=>void validate(doc)),
    vscode.workspace.onDidChangeTextDocument(event=>{
      if(event.document.languageId==='astoryx'&&event.contentChanges.length){invalidate(false);schedule(event.document);tokensChanged.fire();refreshColors();}
      else if(/\.json$/i.test(event.document.uri.fsPath)&&event.contentChanges.length)rulesChanged();
    }),
    vscode.workspace.onDidSaveTextDocument(doc=>{if(doc.languageId==='astoryx')void validate(doc);else if(/\.json$/i.test(doc.uri.fsPath))rulesChanged();}),
    vscode.workspace.onDidCloseTextDocument(doc=>{const key=doc.uri.toString();cache.delete(key);reports.delete(key);const timer=pending.get(key);if(timer)clearTimeout(timer);pending.delete(key);}),
    vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('astoryx'))rulesChanged();else if(event.affectsConfiguration('workbench.colorCustomizations'))refreshColors(true);}),
    vscode.window.onDidChangeActiveTextEditor(()=>{updateStatus();refreshColors(true);}),
    vscode.window.onDidChangeVisibleTextEditors(()=>refreshColors(true)),
    vscode.window.onDidChangeActiveColorTheme(()=>refreshColors(true)),
    {dispose(){disposed=true;if(colorTimer)clearTimeout(colorTimer);for(const timer of pending.values())clearTimeout(timer);pending.clear();}}
  );
  const watcher=vscode.workspace.createFileSystemWatcher('**/*.{json,astoryx}');
  const changed=(uri:vscode.Uri)=>{
    if(/\.json$/i.test(uri.fsPath))rulesChanged();else {invalidate();const doc=vscode.workspace.textDocuments.find(d=>d.uri.toString()===uri.toString());if(doc)schedule(doc);refreshColors();}
  };
  context.subscriptions.push(watcher,watcher.onDidChange(changed),watcher.onDidCreate(changed),watcher.onDidDelete(uri=>{diagnostics.delete(uri);owned.delete(uri.toString());changed(uri);}));
  const resourceWatcher=vscode.workspace.createFileSystemWatcher('**/Resources/**');
  context.subscriptions.push(resourceWatcher,resourceWatcher.onDidChange(rulesChanged),resourceWatcher.onDidCreate(rulesChanged),resourceWatcher.onDidDelete(rulesChanged));
  for(const doc of vscode.workspace.textDocuments)void validate(doc);
  updateStatus();
  refreshColors(true);
  // Exposed for extension-host smoke tests and other extensions invoking this API.
  return {checkProject,analyzeDocument:data,reportDocument:report,onDidApplyHighlighting:highlightingApplied.event};
}

export function deactivate() {}
