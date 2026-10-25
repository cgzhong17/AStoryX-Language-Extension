export const richTextTag=/^<\/?(?:color|size|b|i|u|s|alpha|font|material|mark|cspace|mspace|voffset|indent|line-indent|link|align|width|margin|line-height|noparse|nobr|sub|sup|br)(?:=[^<>]*|\s[^<>]*)?\s*\/?\s*>/i;

/** 从显示名中提取实际人物名，保留源位置；标签和多人分隔符不属于别名。 */
export function dialogueNames(value:string):{name:string;start:number;end:number}[]{
  const result:{name:string;start:number;end:number}[]=[];
  let chars:{value:string;start:number;end:number}[]=[],depth=0;
  const flush=()=>{
    while(chars.length&&/\s/u.test(chars[0].value))chars.shift();
    while(chars.length&&/\s/u.test(chars.at(-1)!.value))chars.pop();
    if(chars.length)result.push({name:chars.map(c=>c.value).join(''),start:chars[0].start,end:chars.at(-1)!.end});
    chars=[];
  };
  for(let i=0;i<value.length;){
    if(value.startsWith('&{',i)){depth++;i+=2;continue;}
    if(value[i]==='}'&&depth){depth--;i++;continue;}
    const tag=richTextTag.exec(value.slice(i));if(tag){i+=tag[0].length;continue;}
    if(value[i]==='&'&&!depth){flush();i++;continue;}
    const character=String.fromCodePoint(value.codePointAt(i)!);
    chars.push({value:character,start:i,end:i+character.length});i+=character.length;
  }
  flush();return result;
}
