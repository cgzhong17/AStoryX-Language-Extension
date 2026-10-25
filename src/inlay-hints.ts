import {Analysis,parameterInfo,splitTopLevel} from './core';

export interface ParameterHint {line:number;character:number;name:string;description?:string}

/** 只生成显示标签，不编辑参数值；位置沿用解析器的 UTF-16 偏移。 */
export function parameterHints(analysis:Analysis,startLine=0,endLine=Number.POSITIVE_INFINITY):ParameterHint[]{
  const hints:ParameterHint[]=[];
  const add=(line:number,start:number,value:string,name:string,description?:string)=>{
    if(/^(Character|Variant)$/i.test(name))return;
    if(value.trim())hints.push({line,character:start+value.search(/\S/u),name,description});
  };
  for(const [line,parsed]of analysis.parsed){
    if(line<startLine||line>endLine)continue;
    const required=parsed.segments[0];
    // 普通对白的人物与正文保持阅读体验，可选参数仍然显示参数名。
    if(parsed.rule.id!=='Dialog'){
      const names=required.name.split('&'),parts=names.length>1?splitTopLevel(required.value,parsed.rule.requiredParametersSeparator):[{value:required.value,start:0}];
      for(let i=0;i<Math.min(names.length,parts.length);i++){
        const part=parts[i];add(line,required.start+part.start,part.value,names[i],parameterInfo(parsed.rule.id,required.name)?.description);
      }
    }
    for(const segment of parsed.segments.slice(1)){
      if(segment.index<0)continue;
      const prefix=analysis.lines[line].slice(segment.prefixStart,segment.start);
      // 命名参数已经在源码中标明名称，不重复添加相同标签。
      if(prefix.includes(segment.name))continue;
      add(line,segment.start,segment.value,segment.name,parameterInfo(parsed.rule.id,segment.name)?.description);
    }
  }
  return hints;
}
