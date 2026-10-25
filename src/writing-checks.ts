import {scanAliases,AliasDeclaration,AliasTable} from './aliases';
import {Analysis, Issue, ParsedLine, protection, requiredParts} from './core';
import {createIssue} from './diagnostic-codes';

export type {AliasDeclaration,AliasTable} from './aliases';
export interface WritingOptions {maxLineLength?:number|null;knownSpeakers?:ReadonlySet<string>;namesUnverified?:boolean}
export const DEFAULT_MAX_LINE_LENGTH=60;
export interface AliasResolution {name:string;chain:AliasDeclaration[];cycle:boolean}

export function aliasTable(analysis:Analysis):AliasTable {
  return analysis.aliasData??scanAliases(analysis.lines);
}

export function resolveAlias(table:AliasTable,name:string,line:number):string {
  return resolveAliasDetails(table,name,line).name;
}

/** 优先接受已收录名称，未命中时再逐级查找使用位置之前的脚本别名。 */
export function resolveAliasDetails(table:AliasTable,name:string,line:number,preferred:(name:string)=>boolean=()=>false):AliasResolution {
  const chain:AliasDeclaration[]=[],seen=new Set<string>();
  let current=name;
  while(true){
    if(preferred(current))return {name:current,chain,cycle:false};
    if(seen.has(current))return {name:current,chain,cycle:true};
    seen.add(current);
    const parent=[...table.entries].reverse().find(e=>e.name===current&&e.availableAfter<line);
    if(!parent)return {name:current,chain,cycle:false};
    chain.push(parent);current=parent.target;
  }
}

/** Find the first unprotected required separator, including custom rule separators. */
export function dialogueSplit(parsed:ParsedLine):number {
  const value=parsed.segments[0].value,separator=parsed.rule.requiredParametersSeparator,{mask}=protection(value);
  if(!separator)return -1;
  for(let i=0;i<value.length;i++)if(!mask[i]&&value.startsWith(separator,i))return i;
  return -1;
}

function visibleCharacters(value:string,offset:number):{start:number;end:number}[]|undefined {
  if(/\$[([]/.test(value))return undefined;
  const characters:{value:string;start:number;end:number}[]=[];
  const tags=/^<\/?(?:color|size|b|i|u|s|alpha|font|material|mark|cspace|mspace|voffset|indent|line-indent|link|align|width|margin|line-height|noparse|nobr|sub|sup|br)(?:=[^<>]*|\s[^<>]*)?\s*\/?\s*>/i;
  let protectedDepth=0;
  for(let i=0;i<value.length;){
    if(value.startsWith('&{',i)){protectedDepth++;i+=2;continue;}
    if(value[i]==='}'&&protectedDepth){protectedDepth--;i++;continue;}
    const tag=tags.exec(value.slice(i));if(tag){i+=tag[0].length;continue;}
    const character=String.fromCodePoint(value.codePointAt(i)!);
    characters.push({value:character,start:offset+i,end:offset+i+character.length});i+=character.length;
  }
  const text=characters.map(c=>c.value).join(''),result:{start:number;end:number}[]=[];
  let cursor=0,index=0;
  for(const segment of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)){
    const begin=index;
    while(cursor<segment.index+segment.segment.length){cursor+=characters[index].value.length;index++;}
    if(begin<index)result.push({start:characters[begin].start,end:characters[index-1].end});
  }
  return result;
}

export function writingIssues(analysis:Analysis,options:WritingOptions={}):Issue[] {
  const issues:Issue[]=[],table=aliasTable(analysis);
  const uncertain=!!options.namesUnverified||table.incomplete||analysis.incomplete.some(reason=>reason.includes('置换文块'));
  const known=new Set([...table.entries.map(e=>e.name),...(options.knownSpeakers??[])]);
  for(const [line,parsed]of analysis.parsed){
    if(parsed.rule.id==='Character'){
      const name=requiredParts(parsed)[0].value.trim();
      if(name&&!/^无$|^none$/i.test(name)&&!/[&$]/.test(name))known.add(name);
    }
    if(parsed.rule.id==='Dialog'){
      const split=dialogueSplit(parsed);
      if(split>0)known.add(parsed.segments[0].value.slice(0,split).trim());
    }
  }
  const sortedNames=[...known].filter(Boolean).sort((a,b)=>b.length-a.length);
  let depth=0;const deferred=new Set<number>();
  analysis.lines.forEach((value,line)=>{if(/^#block\b/i.test(value))depth++;if(depth)deferred.add(line);if(/^#endblock\b/i.test(value))depth=Math.max(0,depth-1);});
  for(const [line,parsed]of analysis.parsed){
    if(deferred.has(line)||!['Dialog','FreeText','Narration'].includes(parsed.rule.id))continue;
    const required=parsed.segments[0];
    let body=required.value,bodyStart=required.start,hasSpeaker=false;
    if(parsed.rule.id==='Dialog'){
      const split=dialogueSplit(parsed);
      if(split<0&&parsed.rule.requiredParametersSeparator==='\t'){
        const name=sortedNames.find(name=>required.value.startsWith(name)&&/^[ \u3000]+\S/u.test(required.value.slice(name.length)));
        if(name){
          const spaces=/^[ \u3000]+/u.exec(required.value.slice(name.length))![0];
          issues.push(createIssue('dialogueSpaces','default',{line,start:required.start+name.length,end:required.start+name.length+spaces.length}));
          continue;
        }
      }
      if(split>=0){
        const raw=body.slice(0,split),name=raw.trim();hasSpeaker=!!name;
        if(name&&!uncertain&&!/\$[([]/.test(name)&&!options.knownSpeakers?.has(name)&&!table.entries.some(e=>e.name===name&&e.availableAfter<line)){
          const start=required.start+raw.search(/\S/u);
          issues.push(createIssue('aliasUndeclared','default',{line,start,end:start+name.length},{name}));
        }
        const from=split+parsed.rule.requiredParametersSeparator.length;
        body=body.slice(from);bodyStart+=from;
      }
    }
    const limit=options.maxLineLength===undefined?DEFAULT_MAX_LINE_LENGTH:options.maxLineLength;
    if(limit==null||!Number.isInteger(limit)||limit<1)continue;
    const characters=visibleCharacters(body,bodyStart);
    if(!characters){if(!analysis.incomplete.includes('动态文本字数未验证。'))analysis.incomplete.push('动态文本字数未验证。');continue;}
    if(characters.length>limit)issues.push(createIssue('lineLength',hasSpeaker?'dialogue':'narration',{line,start:0,end:analysis.lines[line].length},{count:characters.length,limit}));
  }
  return issues;
}
