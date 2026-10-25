import {dialogueNames} from './rich-text';
import {scanAliases,AliasTable} from './aliases';
import {createIssue,diagnosticMessage} from './diagnostic-codes';
import type {Issue} from './diagnostic-codes';
export type {Issue,Severity} from './diagnostic-codes';
/** Pure analysis code: no VS Code or filesystem dependency. All offsets are UTF-16. */
export interface OptionalParameter { parameterName: string; prefix: string }
export interface Rule { id: string; header: string | null; requiredParametersName: string; requiredParametersSeparator: string; optionalParameters: OptionalParameter[]; advanced: boolean }
export interface RuleSet { rules: Rule[]; warnings: string[] }
export interface Segment { name: string; start: number; end: number; prefixStart: number; index: number; value: string }
export interface ParsedLine { rule: Rule; segments: Segment[]; issues: Issue[]; headerEnd: number }
export interface SymbolEntry { name: string; line: number; start: number; end: number }
export interface BlockEntry extends SymbolEntry { parameters: string[] }
export interface Analysis { aliasData?:AliasTable; lines: string[]; parsed: Map<number, ParsedLine>; issues: Issue[]; labels: SymbolEntry[]; variables: SymbolEntry[]; speakers: string[]; blocks: BlockEntry[]; incomplete: string[] }
export interface ParameterInfo { type: 'text' | 'number' | 'integer' | 'boolean' | 'vector' | 'expression' | 'expressions' | 'labels' | 'curves' | 'effects'; description: string; defaultValue?: string; min?: number; max?: number; dimensions?: number[]; suggestions?: string[]; resource?: string }

export const CONTROLLERS: Record<string, string> = {
  Background: '背景', Music: '音乐', SoundEffect: '音效', Mask: '遮罩', Character: '角色', Choice: '选项', Delay: '延迟', VisualEffect: '特效', Interlude: '插播', ColorMask: '色层', Shake: '抖动', FreeText: '自由文本', Cut: '裁切', Filter: '滤镜', AnimatedText: '动态文本', Sign: '标记', Variable: '变量', Judge: '判断', Branch: '分支', Narration: '旁白', Dialog: '对话'
};
export const CURVES = ['Linear', ...['Sine', 'Quad', 'Cubic', 'Quart', 'Quint', 'Expo', 'Circ', 'Elastic', 'Back', 'Bounce'].flatMap(s => ['In', 'Out', 'InOut'].map(p => p + s))];
const numeric = (description: string, defaultValue?: string, min?: number, max?: number): ParameterInfo => ({ type: 'number', description, defaultValue, min, max });
const bool = (description: string, defaultValue = 'true'): ParameterInfo => ({ type: 'boolean', description, defaultValue, suggestions: ['true', 'false'] });
const vector = (description: string, dimensions: number[], defaultValue?: string): ParameterInfo => ({ type: 'vector', description, dimensions, defaultValue });

export function parameterInfo(id: string, name: string): ParameterInfo | undefined {
  // Overrides are controller-specific: Position, Intensity, Type, etc. are not global types.
  if (name === 'Position') {
    if (id === 'Music' || id === 'SoundEffect') return numeric('声道位置：-1 为左，1 为右，0 为居中。', '0', -1, 1);
    if (['VisualEffect', 'Interlude', 'FreeText'].includes(id)) return vector('场景显示位置。', [3], '0,0,10');
  }
  if (name === 'Intensity' && id === 'Shake') return vector('抖动强度向量。', [2, 3]);
  if (name === 'Intensity' && id === 'Cut') return numeric('裁切强度，0～1。', undefined, 0, 1);
  if (name === 'Color' && id === 'ColorMask') return vector('颜色分量。', [3, 4]);
  if (name === 'Type' && ['AnimatedText', 'Interlude'].includes(id)) return { type: 'integer', description: '显示类型编号。', defaultValue: '0', suggestions: id === 'Interlude' ? ['0', '1'] : ['0'] };
  if (name === 'Type&Intensity') return { type: 'text', description: '滤镜类型与强度，使用首项内分隔符连接；类型 0 褪色、1 黑白、2 辉光、3 失焦。' };
  if (name === 'Character&Variant') return { type: 'text', description: '角色素材与差分，按当前规则的首项内分隔符连接。', resource: 'Char_Picture' };
  if (name === 'Speaker&Content') return { type: 'text', description: '人物与台词以真实 Tab 分隔；也可直接书写无人物名的独白。' };
  if (name === 'ChoiceContent') return { type: 'text', description: '选项内容，使用首项内分隔符分开多个选项。' };
  if (name === 'ImageName') return { type: 'text', description: '背景素材名，可用首项内分隔符拼贴多张图片；无/none 用于清空。', resource: 'Background', suggestions: ['无', 'none'] };
  if (name === 'AudioName') return { type: 'text', description: '音频素材名。', resource: id === 'Music' ? 'Music' : 'SoundEffect', suggestions: ['无', 'none'] };
  if (name === 'VisualEffectName') return { type: 'text', description: '视觉特效资源名。', resource: 'VisualEffect' };
  if (name === 'Expression') return { type: 'expression', description: '四则运算、括号和随机运算 ~（最高优先级）；变量首次使用可自动创建。' };
  if (name === 'Expressions') return { type: 'expressions', description: '分号分隔判断表达式；结果大于 0 时判断通过。' };
  if (name === 'Branches') return { type: 'labels', description: '逗号分隔目标标记名。' };
  if (name === 'MoveCurve') return { type: 'curves', description: '移动曲线，可按维度用英文逗号组合。枚举仅提供候选，未对运行时扩展值做严格限制。', defaultValue: 'Linear', suggestions: CURVES };
  if (name === 'Effects') return { type: 'effects', description: '位标识整数，或用 | / 逗号连接 halfsilhouette、fullsilhouette、glitch、mirror。', defaultValue: '0', suggestions: ['0', 'halfsilhouette', 'fullsilhouette', 'glitch', 'mirror'] };
  if (name === 'StartPosition' || name === 'EndPosition') return vector('位置向量；角色可含旋转 w。角色槽位 1/2 的默认位置与居中槽不同。', id === 'Character' ? [3, 4] : [3], id === 'Character' ? '0,0,10,0（随槽位变化）' : '0,0,10');
  if (['IsBlocker', 'IsOn', 'ModifyCharacters', 'StitchVertically'].includes(name)) return bool(name === 'IsBlocker' ? '是否等待该控制器的动画完成。' : '开关状态。', name === 'IsOn' && id === 'Interlude' ? 'false' : 'true');
  if (['IsAdditional', 'Immediate', 'AsSceneObject', 'AsVoice'].includes(name)) return bool('是否启用此选项。', 'false');
  if (name === 'Volume' || name === 'Alpha') return numeric(name === 'Volume' ? '音量，0～1。' : '不透明度，0～1。', '1', 0, 1);
  if (name === 'SlotIndex' || name === 'Steps' || name === 'RenderOrder' || name === 'StitchColumnCount') return { type: 'integer', description: name === 'RenderOrder' ? '渲染顺序，数值越大越靠前。' : '整数值。', defaultValue: name === 'StitchColumnCount' ? '2147483647' : name === 'Steps' && id === 'VisualEffect' ? '1' : '0' };
  if (name === 'Alignment') return { type: 'text', description: '文本对齐方式。', defaultValue: 'left', suggestions: ['left', 'center', 'right'] };
  if (name === 'Angle') return numeric('角度，单位为度。', '0');
  if (['FadeInTime', 'StayTime', 'FadeOutTime', 'MoveTime', 'DelayTime', 'BasicStayTime', 'Interval', 'ExtraStayTime'].includes(name)) {
    const defaults: Record<string, string> = { BasicStayTime: '1.75', Interval: '0.04', ExtraStayTime: '0.05' };
    return numeric('时间，单位为秒。', name === 'DelayTime' ? undefined : name === 'FadeInTime' && id === 'Filter' ? '1' : defaults[name] ?? '0');
  }
  if (name === 'OutputVariable') return { type: 'text', description: '接收选项结果的变量名，从 0 开始编号。', defaultValue: 'choice' };
  if (name === 'Name') return { type: 'text', description: id === 'Sign' ? '标记名，作用域为当前剧本。' : '变量名；Branch 中 _ 表示直接跳转。' };
  if (name === 'Content') return { type: 'text', description: '文本内容；需要时用 &{...} 保护其中的语法字符。' };
  return undefined;
}

export function parseRules(source: string): RuleSet {
  const raw: unknown = JSON.parse(source.replace(/^\uFEFF/, ''));
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as {rules?: unknown}).rules)) throw new Error('规则文件必须包含 rules 数组。');
  const rules: Rule[] = [], warnings: string[] = [], ids = new Set<string>(), headers = new Set<string>();
  for (const entry of (raw as {rules: unknown[]}).rules) {
    if (!entry || typeof entry !== 'object') throw new Error('规则条目必须为 Key/Value 对象。');
    const { Key: id, Value: value } = entry as {Key: unknown; Value: Record<string, unknown>};
    if (typeof id !== 'string' || !id || !value || typeof value !== 'object') throw new Error('控制器 Key/Value 无效。');
    if (ids.has(id)) throw new Error(`控制器 ${id} 重复。`);
    ids.add(id);
    if (!(value.header === null || typeof value.header === 'string') || value.header === '') throw new Error(`${id} 的 header 应为非空字符串或 null。`);
    if (value.header === null && id !== 'Dialog') throw new Error(`${id} 不能使用空行首；仅 Dialog 可回退匹配。`);
    if (typeof value.header === 'string') { if (headers.has(value.header)) throw new Error(`行首 ${value.header} 重复。`); headers.add(value.header); }
    if (typeof value.requiredParametersName !== 'string' || typeof value.requiredParametersSeparator !== 'string' || !Array.isArray(value.optionalParameters)) throw new Error(`${id} 的参数配置无效。`);
    const optionalParameters: OptionalParameter[] = [], names = new Set<string>();
    for (const p of value.optionalParameters) {
      if (!p || typeof p !== 'object' || typeof p.parameterName !== 'string' || !p.parameterName || typeof p.prefix !== 'string' || !p.prefix) throw new Error(`${id} 的可选参数需要非空 parameterName 和 prefix。`);
      if (names.has(p.parameterName)) throw new Error(`${id}.${p.parameterName} 重复。`);
      names.add(p.parameterName); optionalParameters.push({ parameterName: p.parameterName, prefix: p.prefix });
    }
    const advanced = new Set(optionalParameters.map(p => p.prefix)).size === optionalParameters.length;
    if (typeof value.isAdvanced === 'boolean' && value.isAdvanced !== advanced) warnings.push(diagnosticMessage('ruleMode','prefixMismatch',{controller:id}));
    const prefixes = [...new Set(optionalParameters.map(p => p.prefix))];
    if (prefixes.some(a => prefixes.some(b => a !== b && b.startsWith(a)))) throw new Error(`${id} 存在互相重叠的参数前缀，第一版无法可靠解析。`);
    rules.push({ id, header: value.header, requiredParametersName: value.requiredParametersName, requiredParametersSeparator: value.requiredParametersSeparator, optionalParameters, advanced });
  }
  if (!rules.length) throw new Error('规则文件未定义任何控制器。');
  return { rules, warnings };
}

export function ruleDeclaration(text: string): {name?: string; line: number; misplaced: boolean} {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const line = lines.findIndex((s, i) => i > 0 && /^#userule\s*:/i.test(s));
  const name = line >= 0 ? lines[line].replace(/^#userule\s*:/i, '').trim() : undefined;
  return { name, line: line >= 0 ? line : 1, misplaced: line > 1 };
}

export function protection(text: string): {mask: boolean[]; unclosed: number} {
  const mask = Array<boolean>(text.length).fill(false);
  let depth = 0, unclosed = -1;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('&{', i)) { if (!depth) unclosed = i; depth++; mask[i] = mask[i + 1] = true; i++; continue; }
    if (depth) { mask[i] = true; if (text[i] === '}') { depth--; if (!depth) unclosed = -1; } }
  }
  return { mask, unclosed };
}

export function splitTopLevel(text: string, separator: string): {value: string; start: number; end: number}[] {
  if (!separator) return [{ value: text, start: 0, end: text.length }];
  const { mask } = protection(text); const parts: {value: string; start: number; end: number}[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if (mask[i]) continue;
    if ('(['.includes(text[i])) depth++;
    if (')]'.includes(text[i])) depth = Math.max(0, depth - 1);
    if (!depth && text.startsWith(separator, i)) { parts.push({value: text.slice(start, i), start, end: i}); i += separator.length - 1; start = i + 1; }
  }
  parts.push({value: text.slice(start), start, end: text.length}); return parts;
}

/** Recover a mistyped full-width character colon without changing source offsets or other controllers. */
export function requiredParts(parsed:ParsedLine):{value:string;start:number;end:number}[]{
  const value=parsed.segments[0].value,separator=parsed.rule.requiredParametersSeparator;
  if(parsed.rule.id==='Character'&&separator===':'){
    const normal=splitTopLevel(value,':'),wide=splitTopLevel(value,'：');
    if(wide[0].end<normal[0].end)return wide;
    return normal;
  }
  return splitTopLevel(value,separator);
}


export function parseLine(text: string, line: number, rules: RuleSet): ParsedLine | undefined {
  if (!text.trim() || /^\s*\/\//.test(text) || text.startsWith('#')) return undefined;
  const rule = rules.rules.filter(r => r.header !== null && text.startsWith(r.header)).sort((a,b) => b.header!.length - a.header!.length)[0] ?? rules.rules.find(r => r.id === 'Dialog' && r.header === null);
  if (!rule) return undefined;
  const headerEnd = rule.header?.length ?? 0, { mask, unclosed } = protection(text), issues: Issue[] = [];
  if (unclosed >= 0) issues.push(createIssue('protection','default',{line,start:unclosed,end:Math.max((unclosed)+1,text.length)}));
  const matches: {start: number; length: number; index: number; name: string}[] = [];
  const prefixes = [...new Set(rule.optionalParameters.map(p => p.prefix))].sort((a,b) => b.length - a.length);
  let next = 0;
  for (let i = headerEnd; i < text.length; i++) {
    if (mask[i]) continue;
    const prefix = prefixes.find(p => text.startsWith(p, i));
    if (prefix) {
      let index:number;
      switch(rule.advanced){
        case true: index=rule.optionalParameters.findIndex(p=>p.prefix===prefix);break;
        case false: index=rule.optionalParameters.findIndex((p,j)=>j>=next&&p.prefix===prefix);break;
      }
      if (index < 0) { issues.push(createIssue('extraParameter','default',{line,start:i,end:Math.max((i)+1,i + prefix.length)})); matches.push({ start:i, length:prefix.length, index:-2, name:'<extra>' }); }
      else { matches.push({ start:i, length:prefix.length, index, name:rule.optionalParameters[index].parameterName }); next = index + 1; }
      i += prefix.length - 1;
      // A terminal expression owns the rest of the line. In Judge's BaseRule,
      // its introducing slash and an arithmetic division share the same text.
      if (index >= 0 && index === rule.optionalParameters.length - 1 && ['expression','expressions'].includes(parameterInfo(rule.id,rule.optionalParameters[index].parameterName)?.type ?? '')) break;
    } else if (prefixes.some(p => p.startsWith(',@')) && text.startsWith(',@', i)) {
      const unknown = /^,@[^=\s,]+=/u.exec(text.slice(i));
      if (unknown) { issues.push(createIssue('unknownParameter','default',{line,start:i,end:Math.max((i)+1,i + unknown[0].length)})); matches.push({start:i,length:unknown[0].length,index:-2,name:'<unknown>'}); i += unknown[0].length - 1; }
    }
  }
  const segments: Segment[] = [{name:rule.requiredParametersName,start:headerEnd,end:matches[0]?.start ?? text.length,prefixStart:headerEnd,index:-1,value:text.slice(headerEnd,matches[0]?.start)}];
  const seen = new Set<number>();
  matches.forEach((m,j) => {
    const end = matches[j+1]?.start ?? text.length;
    segments.push({name:m.name,start:m.start+m.length,end,prefixStart:m.start,index:m.index,value:text.slice(m.start+m.length,end)});
    if (m.index >= 0 && seen.has(m.index)) issues.push(createIssue('duplicateParameter','default',{line,start:m.start,end:Math.max((m.start)+1,m.start+m.length)},{parameter:m.name}));
    seen.add(m.index);
  });
  const parsed={rule,segments,issues,headerEnd};
  if(rule.id==='Character'&&rule.requiredParametersSeparator===':'){
    const separator=requiredParts(parsed)[0].end;
    if(segments[0].value[separator]==='：')issues.push(createIssue('characterColon','default',{line,start:headerEnd+separator,end:Math.max((headerEnd+separator)+1,headerEnd+separator+1)}));
  }
  return parsed;
}

export function currentSegment(parsed: ParsedLine, character: number): Segment {
  return [...parsed.segments].reverse().find(s => character >= s.prefixStart) ?? parsed.segments[0];
}

const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export function expressionError(text: string): string | undefined {
  const source = text.trim(); if (!source) return diagnosticMessage('parameterType','expressionEmpty');
  const tokens: string[] = []; let offset = 0;
  while (offset < source.length) {
    const rest = source.slice(offset);
    const m = /^(?:\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[\p{L}\p{N}_]+|[()+*/~\-])/u.exec(rest);
    if (!m) return diagnosticMessage('parameterType','expressionCharacter',{character:source[offset]});
    if (m[0].trim()) tokens.push(m[0]); offset += m[0].length;
  }
  let cursor = 0;
  function primary(): boolean {
    const t = tokens[cursor];
    if (t === '+' || t === '-') { cursor++; return primary(); }
    if (t === '(') { cursor++; if (!binary(0) || tokens[cursor] !== ')') return false; cursor++; return true; }
    if (t && (numberPattern.test(t) || /^[\p{L}_][\p{L}\p{N}_]*$/u.test(t))) { cursor++; return true; }
    return false;
  }
  function binary(min: number): boolean {
    if (!primary()) return false;
    const precedence: Record<string,number> = {'+':1,'-':1,'*':2,'/':2,'~':3};
    while ((precedence[tokens[cursor]] ?? -1) >= min) { const p = precedence[tokens[cursor++]]; if (!binary(p + 1)) return false; }
    return true;
  }
  try { return binary(0) && cursor === tokens.length ? undefined : diagnosticMessage('parameterType','expressionSyntax'); }
  catch { return diagnosticMessage('parameterType','expressionDepth'); }
}

function validateSegment(segment: Segment, parsed: ParsedLine, line: number): Issue[] {
  const info = parameterInfo(parsed.rule.id, segment.name), value = segment.value.trim(), issues: Issue[] = [];
  if (segment.index === -2) return issues;
  if (!value) {
    if (segment.index === -1 && !['Dialog','FreeText','Narration'].includes(parsed.rule.id)) issues.push(createIssue('required','default',{line,start:segment.start,end:Math.max((segment.start)+1,segment.end)},{parameter:segment.name}));
    return issues; // Omitted optional slots intentionally keep the runtime default.
  }
  if (!info || /\$\(|\$\[/.test(value)) return issues;
  const location={line,start:segment.start,end:Math.max(segment.start+1,segment.end)},parameter=segment.name;
  if (info.type === 'number' || info.type === 'integer') {
    if (!numberPattern.test(value) || !Number.isFinite(Number(value)) || (info.type === 'integer' && !/^[+-]?\d+$/.test(value))) issues.push(createIssue('parameterType',info.type==='integer'?'integer':'number',location,{parameter}));
    else if ((info.min !== undefined && Number(value) < info.min) || (info.max !== undefined && Number(value) > info.max)) issues.push(createIssue('parameterType','range',location,{parameter,min:info.min??'-∞',max:info.max??'∞'}));
  } else if (info.type === 'boolean' && !/^(true|false|0|1)$/i.test(value)) issues.push(createIssue('parameterType','boolean',location,{parameter}));
  else if (info.type === 'vector') {
    const values = value.split(',').map(s => s.trim());
    if (!info.dimensions?.includes(values.length) || values.some(s => !numberPattern.test(s) || !Number.isFinite(Number(s)))) issues.push(createIssue('parameterType','vector',location,{parameter,dimensions:String(info.dimensions?.join(' 或 '))}));
  } else if (info.type === 'expression' || info.type === 'expressions') {
    for (const part of info.type === 'expressions' ? splitTopLevel(value, ';') : [{value}]) { const error = expressionError(part.value); if (error) { issues.push(createIssue('parameterType','expression',location,{parameter,reason:error})); break; } }
  }
  return issues;
}

export function analyze(text: string, rules: RuleSet): Analysis {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/), parsed = new Map<number,ParsedLine>(), issues: Issue[] = [], labels: SymbolEntry[] = [], variables: SymbolEntry[] = [], speakers = new Set<string>(), blocks: BlockEntry[] = [], incomplete = new Set<string>();
  const labelRefs: {name:string; line:number; start:number; end:number; deferred:boolean}[] = [], uses: {name:string; count:number;line:number;start:number;end:number}[] = [];
  const aliasData=scanAliases(lines);issues.push(...aliasData.issues);
  for(const entry of aliasData.entries)speakers.add(entry.name);
  let block: BlockEntry | undefined;
  for (let line = 1; line < lines.length; line++) {
    const value = lines[line];
    if(aliasData.bodyLines.has(line)||aliasData.directiveLines.has(line))continue;
    if (!value.trim() || /^\s*\/\//.test(value)) continue;
    const directive = /^#([A-Za-z]+)\b(.*)$/.exec(value);
    if (directive) {
      const kind = directive[1].toLowerCase(), rest = directive[2].trim();
      if (kind === 'aliases'||kind === 'endaliases') {
        if(block&&kind==='aliases')issues.push(createIssue('aliasStructure','inMacro',{line,start:0,end:value.length}));
      } else if (kind === 'block') {
        if (block) issues.push(createIssue('block','nestedBlock',{line,start:0,end:Math.max(1,value.length)}));
        const m = /^([^\s(]+)\((.*)\)$/.exec(rest);
        if (!m) issues.push(createIssue('blockSignature','format',{line,start:0,end:Math.max(1,value.length)}));
        else {
          const parameters = m[2].trim() ? m[2].split(',').map(s=>s.trim()) : [];
          block = { name:m[1], parameters,line,start:value.indexOf(m[1]),end:value.indexOf(m[1])+m[1].length };
          if (blocks.some(b=>b.name===block!.name)) issues.push(createIssue('duplicateBlock','default',{line,start:block.start,end:Math.max((block.start)+1,block.end)},{name:block.name}));
          if (parameters.some(p=>!p) || new Set(parameters).size !== parameters.length) issues.push(createIssue('blockSignature','parameters',{line,start:0,end:Math.max(1,value.length)}));
          blocks.push(block); incomplete.add('置换文块仅检查结构、引用与参数数量，尚未展开校验。');
        }
      } else if (kind === 'endblock') {
        if (!block) issues.push(createIssue('block','missingBlock',{line,start:0,end:Math.max(1,value.length)}));
        block = undefined;
      } else if (kind === 'use') {
        const m = /^([^\s(]+)\((.*)\)$/.exec(rest);
        if (!m) issues.push(createIssue('blockCall','default',{line,start:0,end:Math.max(1,value.length)}));
        else uses.push({name:m[1],count:m[2].trim()?splitTopLevel(m[2],',').length:0,line,start:value.indexOf(m[1]),end:value.length});
        incomplete.add('置换文块仅检查结构、引用与参数数量，尚未展开校验。');
      } else if (!['userule','version'].includes(kind)) {
        issues.push(createIssue('unsupportedDirective','default',{line,start:0,end:Math.max(1,value.length)},{directive:directive[1]})); incomplete.add('存在尚未支持的预处理器。');
      }
      continue;
    }
    const result = parseLine(value,line,rules);
    if (!result) { issues.push(createIssue('unrecognized','default',{line,start:0,end:Math.max(1,value.length)})); continue; }
    parsed.set(line,result); issues.push(...result.issues);
    if (!CONTROLLERS[result.rule.id]) incomplete.add(`未知控制器 ${result.rule.id} 仅执行结构检查。`);
    for (const segment of result.segments) {
      if (segment.index === -2) continue;
      if (!parameterInfo(result.rule.id,segment.name)) incomplete.add(`参数 ${result.rule.id}.${segment.name} 缺少语义资料。`);
      issues.push(...validateSegment(segment,result,line));
    }
    const required = result.segments[0], name = required.value.trim();
    if (result.rule.id === 'Sign' && name) {
      const entry = {name,line,start:required.start,end:required.end};
      if (!block && labels.some(l=>l.name===name)) issues.push(createIssue('duplicateLabel','default',{line,start:entry.start,end:Math.max((entry.start)+1,entry.end)},{name}));
      if (!block) labels.push(entry);
    }
    if (['Variable','Judge','Branch'].includes(result.rule.id) && name && name !== '_') variables.push({name,line,start:required.start,end:required.end});
    if (result.rule.id === 'Choice') {
      const output = result.segments.find(s=>s.name==='OutputVariable');
      variables.push({name:output?.value.trim() || 'choice',line,start:output?.start??required.start,end:output?.end??required.end});
    }
    if (result.rule.id === 'Dialog') { const tab = required.value.indexOf(result.rule.requiredParametersSeparator); if (tab > 0) for(const entry of dialogueNames(required.value.slice(0,tab)))speakers.add(entry.name); }
    if (result.rule.id === 'Branch') {
      const branches = result.segments.find(s=>s.name==='Branches');
      if (branches) for (const part of splitTopLevel(branches.value,',')) if (part.value.trim()) labelRefs.push({name:part.value.trim(),line,start:branches.start+part.start,end:branches.start+part.end,deferred:!!block || /\$[([]/.test(part.value)});
    }
  }
  if (block) issues.push(createIssue('block','unclosedBlock',{line:block.line,start:0,end:Math.max(1,lines[block.line].length)}));
  for (const ref of labelRefs) if (!ref.deferred && !labels.some(l=>l.name===ref.name)) {
    if (blocks.length || uses.length) incomplete.add('存在置换文块，未对可能来自展开结果的标记进行缺失报错。');
    else issues.push(createIssue('labelNotFound','default',{line:ref.line,start:ref.start,end:Math.max((ref.start)+1,ref.end)},{name:ref.name}));
  }
  for (const use of uses) {
    const target = blocks.find(b=>b.name===use.name);
    if (!target) issues.push(createIssue('blockNotFound','default',{line:use.line,start:use.start,end:Math.max((use.start)+1,use.end)},{name:use.name}));
    else if (target.parameters.length !== use.count) issues.push(createIssue('blockArity','default',{line:use.line,start:use.start,end:Math.max((use.start)+1,use.end)},{name:use.name,expected:target.parameters.length,actual:use.count}));
  }
  for (const message of rules.warnings) issues.push(createIssue('ruleMode','default',{line:1,start:0,end:Math.max(1,lines[1]?.length??0)},{reason:message}));
  return {lines,parsed,issues,labels,variables,speakers:[...speakers],blocks,incomplete:[...incomplete],aliasData};
}
