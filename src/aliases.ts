import {createIssue,Issue} from './diagnostic-codes';

export interface AliasDeclaration {name:string;target:string;line:number;availableAfter:number;targetStart:number;targetEnd:number}
export interface AliasTable {entries:AliasDeclaration[];incomplete:boolean}
export interface AliasScan extends AliasTable {issues:Issue[];bodyLines:Set<number>;directiveLines:Set<number>}

/** 空格可放在箭头或斜杠两侧；名字本身不可为空或含空白，问号等普通标点允许使用。 */
export function parseAliasEntry(value:string):{target:string;names:string[];targetStart:number;targetEnd:number}|undefined{
  const parts=value.split('->');if(parts.length!==2)return;
  const target=parts[0].trim(),names=parts[1].split('/').map(name=>name.trim());
  if(!target||/[\s/]/u.test(target)||names.some(name=>!name||/\s/u.test(name)))return;
  const targetStart=value.indexOf(target);
  return {target,names,targetStart,targetEnd:targetStart+target.length};
}

interface AliasBlock {line:number;end?:number;valid:boolean;body:number[];malformedDirectives:{line:number;directive:string}[]}

/** 先配对区块，再检查闭合区块的内容；未闭合区块仅检查结束标记的位置。 */
export function scanAliases(lines:readonly string[]):AliasScan{
  const result:AliasScan={entries:[],incomplete:false,issues:[],bodyLines:new Set(),directiveLines:new Set()};
  const stack:AliasBlock[]=[],closed:AliasBlock[]=[];
  let macroDepth=0;
  const location=(line:number)=>({line,start:0,end:lines[line].length});
  // 第一阶段只判断边界，不对未配对的区块做映射格式或重复检查。
  for(let line=1;line<lines.length;line++){
    const value=lines[line];if(!value.trim()||/^\s*\/\//.test(value))continue;
    if(!stack.length){
      if(/^#block\b/i.test(value)){macroDepth++;continue;}
      if(/^#endblock\b/i.test(value)){macroDepth=Math.max(0,macroDepth-1);continue;}
    }
    if(macroDepth)continue;
    const directive=/^\s*#(aliases|endaliases)\b(.*)$/i.exec(value);
    if(directive){
      result.directiveLines.add(line);
      const opening=directive[1].toLowerCase()==='aliases',validFormat=!directive[2].trim();
      if(opening){
        if(stack.length){
          result.issues.push(createIssue('aliasStructure','nested',location(line)));
          result.incomplete=true;for(const frame of stack)frame.valid=false;
        }
        stack.push({line,valid:validFormat&&stack.length===0,body:[],malformedDirectives:validFormat?[]:[{line,directive:'#'+directive[1]}]});
      }else{
        const frame=stack.pop();
        if(!frame){result.issues.push(createIssue('aliasStructure','unmatchedEnd',location(line)));result.incomplete=true;continue;}
        if(!validFormat){frame.valid=false;frame.malformedDirectives.push({line,directive:'#'+directive[1]});}
        frame.end=line;closed.push(frame);
      }
      continue;
    }
    if(!stack.length)continue;
    result.bodyLines.add(line);
    stack[stack.length-1].body.push(line);
  }
  // 未闭合时，连续合法映射后的第一条正文才是应补上结束标记的位置。
  for(const frame of stack){
    let lastAliasLine=frame.line,warningLine:number|undefined;
    for(let line=frame.line+1;line<lines.length;line++){
      if(!lines[line].trim()||/^\s*\/\//.test(lines[line]))continue;
      if(parseAliasEntry(lines[line]))lastAliasLine=line;
      else{warningLine=line;break;}
    }
    if(warningLine===undefined&&lastAliasLine+1<lines.length)warningLine=lastAliasLine+1;
    const at=warningLine===undefined
      ?{line:lines.length-1,start:lines.at(-1)!.length,end:lines.at(-1)!.length}
      :location(warningLine);
    result.issues.push(createIssue('aliasStructure','unclosed',at));result.incomplete=true;
    if(warningLine!==undefined)for(const line of frame.body)if(line>=warningLine)result.bodyLines.delete(line);
  }
  // 第二阶段：只有配对成功的区块才检查格式和重复别名。
  const initializedNames=new Set<string>();
  for(const frame of closed.sort((a,b)=>a.line-b.line)){
    const names=new Set<string>(),pending:Omit<AliasDeclaration,'availableAfter'>[]=[];
    for(const malformed of frame.malformedDirectives){
      result.issues.push(createIssue('aliasFormat','directive',location(malformed.line),{directive:malformed.directive}));result.incomplete=true;
    }
    for(const line of frame.body){
      const entry=parseAliasEntry(lines[line]);
      if(!entry){result.issues.push(createIssue('aliasFormat','entry',location(line)));result.incomplete=true;continue;}
      const duplicates=new Set<string>();
      for(const name of entry.names){
        if(initializedNames.has(name)||names.has(name))duplicates.add(name);
        names.add(name);pending.push({name,target:entry.target,line,targetStart:entry.targetStart,targetEnd:entry.targetEnd});
      }
      if(duplicates.size)result.issues.push(createIssue('aliasDuplicate','default',location(line),{name:[...duplicates].join('、')}));
    }
    if(frame.valid){
      result.entries.push(...pending.map(entry=>({...entry,availableAfter:frame.end!})));
      for(const name of names)initializedNames.add(name);
    }
  }
  result.issues.sort((a,b)=>a.line-b.line);
  return result;
}
