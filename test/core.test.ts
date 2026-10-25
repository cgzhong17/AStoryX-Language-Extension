import {REPO_ROOT,PACKAGE_ROOT,TEMP_ROOT,sampleDirectory} from './paths';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { analyze, currentSegment, expressionError, parameterInfo, parseLine, parseRules, ruleDeclaration, splitTopLevel,requiredParts } from '../src/core';
import { discoverRoot, loadDocument, resourceNames, storyFiles } from '../src/project';
import { HIGHLIGHT_COLORS, highlightSpans } from '../src/highlighting';

const project=REPO_ROOT;
const game=sampleDirectory(project);
const languageFixture=path.join(project,'test/fixtures/language-demo');
const base=parseRules(readFileSync(path.join(languageFixture,'Rules/BaseRule.json'),'utf8'));
const advanced=parseRules(readFileSync(path.join(languageFixture,'Rules/AdvanceRule.json'),'utf8'));
const source=(...lines:string[])=>['说明','#useRule:BaseRule',...lines].join('\n');
const errors=(text:string,rules=base)=>analyze(text,rules).issues.filter(i=>i.severity==='error');

test('only a mistyped character name separator warns and recovery preserves source offsets',()=>{
  const lines=['--mon3tr：疑惑/1','--mon3tr:疑惑/1','背景：bg','凯尔希\t旁白：正文','// --mon3tr：疑惑','--&{名字：内部}:疑惑/1'];
  const result=analyze(source(...lines),base),warnings=result.issues.filter(i=>i.code==='W1006');
  assert.deepEqual(warnings.map(i=>[i.line,i.start,i.end,i.severity]),[[2,8,9,'warning']]);
  assert.equal(result.lines[2].slice(warnings[0].start,warnings[0].end),'：');
  assert.deepEqual(requiredParts(result.parsed.get(2)!).map(p=>p.value),['mon3tr','疑惑']);
  const custom={...base,rules:base.rules.map(r=>r.id==='Character'?{...r,requiredParametersSeparator:'：'}:r)};
  assert.ok(!analyze(source('--mon3tr：疑惑/1'),custom).issues.some(i=>i.code==='W1006'));
});

test('loads all 21 rules and derives unique-prefix mode',()=>{
  assert.equal(base.rules.length,21);assert.equal(base.rules.find(r=>r.id==='Background')?.advanced,false);
  assert.equal(base.rules.find(r=>r.id==='Variable')?.advanced,true);assert.equal(advanced.rules.find(r=>r.id==='Background')?.advanced,true);
});
test('rejects malformed, duplicate and overlapping rule definitions',()=>{
  assert.throws(()=>parseRules('{}'));assert.throws(()=>parseRules('{'));
  const original=JSON.parse(readFileSync(path.join(languageFixture,'Rules/BaseRule.json'),'utf8'));
  original.rules.push(original.rules[0]);assert.throws(()=>parseRules(JSON.stringify(original)),/重复/);
  original.rules.pop();original.rules[0].Value.optionalParameters[0].prefix='/';original.rules[0].Value.optionalParameters[1].prefix='//';
  assert.throws(()=>parseRules(JSON.stringify(original)),/重叠/);
});
test('isAdvanced is not blindly trusted',()=>{
  const original=JSON.parse(readFileSync(path.join(languageFixture,'Rules/BaseRule.json'),'utf8'));
  original.rules[0].Value.isAdvanced=true;
  const result=parseRules(JSON.stringify(original));assert.equal(result.rules[0].advanced,false);assert.equal(result.warnings.length,1);
});
test('custom headers and parameter order drive parsing',()=>{
  const original=JSON.parse(readFileSync(path.join(languageFixture,'Rules/BaseRule.json'),'utf8'));
  original.rules[0].Value.header='BG ';original.rules[0].Value.optionalParameters.reverse();
  const parsed=parseLine('BG room/4',2,parseRules(JSON.stringify(original)))!;
  assert.equal(parsed.rule.id,'Background');assert.equal(parsed.segments[1].name,'StitchColumnCount');
});
test('required separator is internal, not an extra required colon',()=>{
  assert.equal(errors(source('音乐：none','+1','遮罩：true')).length,0);
  assert.equal(parseLine('--角色:normal/0',2,base)?.segments[0].value,'角色:normal');
});
test('empty positional slots preserve their index and default',()=>{
  const parsed=parseLine('背景：bg//0,0,10',2,base)!;
  assert.equal(parsed.segments[1].name,'FadeInTime');assert.equal(parsed.segments[1].value,'');assert.equal(parsed.segments[2].name,'StartPosition');
  assert.equal(currentSegment(parsed,7).name,'StartPosition');assert.equal(errors(source('背景：bg//0,0,10')).length,0);
});
test('protection keeps division and rich text out of parameter splitting',()=>{
  const text='人物\t&{10/2=5 <color=red>文字</color>}/true';
  const result=parseLine(text,2,base)!;assert.equal(result.segments.length,2);assert.equal(result.segments[1].name,'IsAdditional');
  assert.equal(errors(source(text)).length,0);
});
test('unclosed protection is diagnosed at its original position',()=>{
  const issues=errors(source('人物\t&{10/2'));
  assert.equal(issues[0].code,'E3001');assert.equal(issues[0].line,2);assert.equal(issues[0].start,3);
});
test('plain dialogue, real tabs, comments and file description are distinct',()=>{
  const result=analyze(source('独白没有人物名','人物\t台词','// 注释',''),base);
  assert.equal(result.parsed.has(0),false);assert.equal(result.parsed.get(2)?.rule.id,'Dialog');assert.deepEqual(result.speakers,['人物']);assert.equal(result.parsed.has(4),false);
});
test('wrong-looking ordinary text is not an unknown-command error',()=>assert.equal(errors(source('背影：这也可能是合法台词。')).length,0));
test('division and random expressions do not become optional slash parameters',()=>{
  const result=analyze(source('变量：A=3/1~10*2','判断：B/A-1;A/2'),base);
  assert.equal(result.issues.filter(i=>i.severity==='error').length,0);assert.equal(result.parsed.get(2)?.segments[1].value,'3/1~10*2');
});
test('expression parser checks syntax without requiring declared variables',()=>{
  for(const text of ['计数+1','3/1~10*2','-(A+2)*.5','1e-3+2'])assert.equal(expressionError(text),undefined,text);
  for(const text of ['3+','(3*2','3 4','A==2','1;2'])assert.ok(expressionError(text),text);
  assert.equal(errors(source('变量：计数=计数+1','分支：_/终点','标记：终点')).length,0);
});
test('unique prefixes may be out of order, duplicates and unknown names are errors',()=>{
  assert.equal(errors(source('背景：none,@IsBlocker=false,@FadeInTime=2'),advanced).length,0);
  assert.ok(errors(source('背景：none,@FadeInTime=1,@FadeInTime=2'),advanced).some(i=>i.code==='E3004'));
  assert.ok(errors(source('背景：none,@Bogus=2'),advanced).some(i=>i.code==='E3003'));
});
test('extra positional parameters cannot silently pass',()=>assert.ok(errors(source('遮罩：maybe','音乐：none/1/0/0/0/99')).some(i=>i.code==='E3002')));
test('types are scoped by controller and accept sample-compatible values',()=>{
  assert.equal(parameterInfo('Music','Position')?.type,'number');assert.equal(parameterInfo('VisualEffect','Position')?.type,'vector');
  assert.equal(errors(source('音乐：none/0.5/0/0/-1','--无/0','遮罩：0','自由文本：////false////0')).length,0);
  assert.ok(errors(source('音乐：none/2')).length);assert.ok(errors(source('背景：bg/abc')).length);assert.ok(errors(source('背景：bg//1,2')).length);
});
test('local branch labels, duplicates and auto-created variables',()=>{
  assert.equal(errors(source('分支：新变量/落点','标记：落点')).length,0);
  assert.ok(errors(source('分支：_/不存在')).some(i=>i.code==='E3031'));
  assert.ok(errors(source('标记：x','标记：x')).some(i=>i.code==='E3030'));
});
test('alias blocks are not parsed as dialogue and missing boundaries are warnings',()=>{
  const result=analyze(source('#aliases','mon3tr->Mon3tr/？？？','#endaliases','Mon3tr\t台词'),base);
  assert.equal(result.parsed.has(3),false);assert.ok(result.speakers.includes('Mon3tr'));assert.equal(errors(source('#endaliases')).length,0);
  assert.ok(analyze(source('#aliases','a->b'),base).issues.some(i=>i.code==='W1007'&&i.severity==='warning'));
});
test('macro structure and arity are checked while expansion coverage is explicit',()=>{
  const result=analyze(source('#block 测试(x,y)','背景：$(x)/$(y)','#endblock','#use 测试(bg,2)'),base);
  assert.equal(result.issues.filter(i=>i.severity==='error').length,0);assert.ok(result.incomplete.length);
  assert.ok(errors(source('#use 不存在()')).some(i=>i.code==='E3014'));
  assert.ok(errors(source('#block f(x)','#endblock','#use f()')).some(i=>i.code==='E3015'));
});
test('nested arguments and protected commas stay together',()=>assert.equal(splitTopLevel('a,(1,2),&{x,y}',',').length,3));
test('emoji offsets remain native UTF-16 and CRLF/BOM are supported',()=>{
  const issue=errors('\uFEFF说明\r\n#useRule:BaseRule\r\n😀\t&{x')[0];assert.equal(issue.start,3);assert.equal(issue.line,2);
});
test('rule declaration is case-insensitive and legacy missing version is accepted',()=>{
  assert.equal(ruleDeclaration('说明\n#userule:BaseRule').name,'BaseRule');assert.equal(ruleDeclaration('说明\n\n#useRule:BaseRule').misplaced,true);
});

const colored=(line:string,rules=base)=>highlightSpans(analyze(source(line),rules)).map(span=>({role:span.role,text:line.slice(span.start,span.end)}));
test('dialogue speaker, content and optional parameters have distinct color roles',()=>{
  assert.deepEqual(colored('凯尔希\t你好/true'),[
    {role:'speaker',text:'凯尔希'},{role:'parameter',text:'\t'},
    {role:'dialogue',text:'你好'},{role:'parameter',text:'/'}
  ]);
});
test('character image declarations keep header/name/variant together and parameters neutral',()=>{
  assert.deepEqual(colored('--凯尔希:wink/0'),[{role:'character',text:'--凯尔希:wink'},{role:'parameter',text:'/0'}]);
  assert.deepEqual(colored('--凯尔希:wink/0//1'),[{role:'character',text:'--凯尔希:wink'},{role:'parameter',text:'/0//1'}]);
});
test('unnamed dialogue, explicit FreeText and Narration are all narration',()=>{
  assert.deepEqual(colored('一段旁白'),[{role:'narration',text:'一段旁白'}]);
  assert.deepEqual(colored('\t只有正文'),[{role:'narration',text:'\t只有正文'}]);
  assert.deepEqual(colored('自由文本：文字//true'),[{role:'narration',text:'自由文本：文字'},{role:'parameter',text:'//'}]);
  assert.deepEqual(colored('*只供阅读的旁白'),[{role:'narration',text:'*只供阅读的旁白'}]);
});
test('protected separators and rich text remain in their dialogue color range',()=>{
  assert.deepEqual(colored('凯尔希\t&{10/2=5 <color=red>文字</color>}/true'),[
    {role:'speaker',text:'凯尔希'},{role:'parameter',text:'\t'},
    {role:'dialogue',text:'&{10/2=5 <color=red>文字</color>}'},{role:'parameter',text:'/'}
  ]);
});
test('AdvanceRule named parameters use neutral color after the character declaration',()=>{
  assert.deepEqual(colored('--凯尔希:wink,@SlotIndex=0,@IsBlocker=false',advanced),[
    {role:'character',text:'--凯尔希:wink'},{role:'parameter',text:',@SlotIndex=0,@IsBlocker='}
  ]);
});

test('controller headers share the character color and boolean values keep theme syntax colors',()=>{
  assert.equal(HIGHLIGHT_COLORS.controller,HIGHLIGHT_COLORS.character);
  assert.deepEqual(colored('背景：bg/0'),[{role:'controller',text:'背景：'}]);
  assert.deepEqual(colored('--mon3tr:疑惑/1'),[{role:'character',text:'--mon3tr:疑惑'},{role:'parameter',text:'/1'}]);
  assert.deepEqual(colored('凯尔希\ttrue 与 false 是台词/ true /false'),[
    {role:'speaker',text:'凯尔希'},{role:'parameter',text:'\t'},{role:'dialogue',text:'true 与 false 是台词'},
    {role:'parameter',text:'/ '},{role:'parameter',text:' /'}
  ]);
  assert.deepEqual(colored('--凯尔希:true/0'),[{role:'character',text:'--凯尔希:true'},{role:'parameter',text:'/0'}]);
  assert.deepEqual(colored('凯尔希\t台词/1/0'),[{role:'speaker',text:'凯尔希'},{role:'parameter',text:'\t'},{role:'dialogue',text:'台词'},{role:'parameter',text:'/1/0'}]);
});
test('color ranges follow custom controller headers, parameter prefixes and dialogue separators',()=>{
  const raw=JSON.parse(readFileSync(path.join(languageFixture,'Rules/BaseRule.json'),'utf8'));
  const character=raw.rules.find((r:{Key:string})=>r.Key==='Character').Value;
  character.header='角色=>';character.optionalParameters=[{parameterName:'SlotIndex',prefix:'|槽='}];
  raw.rules.find((r:{Key:string})=>r.Key==='Dialog').Value.requiredParametersSeparator='::';
  const custom=parseRules(JSON.stringify(raw));
  assert.deepEqual(colored('角色=>凯尔希:wink|槽=0',custom),[{role:'character',text:'角色=>凯尔希:wink'},{role:'parameter',text:'|槽=0'}]);
  assert.deepEqual(colored('&{组织::甲}::台词',custom),[{role:'speaker',text:'&{组织::甲}'},{role:'parameter',text:'::'},{role:'dialogue',text:'台词'}]);
});
test('coloring skips file descriptions, directives, alias entries and comments',()=>{
  assert.deepEqual(highlightSpans(analyze('角色\t文件描述\n#useRule:BaseRule\n#aliases\n凯尔希->医生\n#endaliases\n//凯尔希\t注释',base)),[]);
});
test('color ranges keep emoji UTF-16 offsets and handle partially typed lines',()=>{
  const ranges=highlightSpans(analyze(source('😀\t你好/'),base));
  assert.deepEqual(ranges.map(s=>[s.start,s.end,s.role]),[[0,2,'speaker'],[2,3,'parameter'],[3,5,'dialogue'],[5,6,'parameter']]);
  assert.deepEqual(colored('--凯尔希:'),[{role:'character',text:'--凯尔希:'}]);
});
test('every color role has dark, light and high contrast theme defaults',()=>{
  const manifest=JSON.parse(readFileSync(path.join(PACKAGE_ROOT,'package.json'),'utf8'));
  const colors=manifest.contributes.colors as {id:string;defaults:Record<string,string>}[];
  for(const id of Object.values(HIGHLIGHT_COLORS))for(const kind of ['dark','light','highContrast','highContrastLight'])assert.ok(colors.find(c=>c.id===id)?.defaults[kind],`${id}.${kind}`);
  assert.equal(colors.find(c=>c.id===HIGHLIGHT_COLORS.narration)?.defaults.dark,'editor.foreground');
  assert.equal(colors.find(c=>c.id===HIGHLIGHT_COLORS.parameter)?.defaults.light,'editor.foreground');
  assert.notEqual(colors.find(c=>c.id===HIGHLIGHT_COLORS.dialogue)?.defaults.dark,colors.find(c=>c.id===HIGHLIGHT_COLORS.dialogue)?.defaults.light);
});

async function sandbox(run:(root:string)=>Promise<void>) {
  const root=await fs.mkdtemp(path.join(TEMP_ROOT,'.test-'));
  try {await run(root);}finally{assert.ok(path.resolve(root).startsWith(path.resolve(TEMP_ROOT)+path.sep+'.test-'));await fs.rm(root,{recursive:true,force:true});}
}
test('project roots isolate nested projects and rule name traversal is rejected',async()=>sandbox(async root=>{
  const a=path.join(root,'甲 项目');await fs.mkdir(path.join(a,'Rules'),{recursive:true});await fs.mkdir(path.join(a,'Stories'));
  assert.equal(await discoverRoot(path.join(a,'Stories','main.astoryx'),[root]),a);
  assert.ok((await loadDocument(path.join(a,'Stories','main.astoryx'),source().replace('BaseRule','../BaseRule'))).failure);
}));
test('missing or invalid rules never silently fall back',async()=>sandbox(async root=>{
  await fs.mkdir(path.join(root,'Rules'));const file=path.join(root,'main.astoryx');
  assert.ok((await loadDocument(file,source('背景：bg'))).failure);
  await fs.writeFile(path.join(root,'Rules/BaseRule.json'),'{');assert.ok((await loadDocument(file,source('背景：bg'))).failure);
}));
test('recursive scan only walks Stories and reports file limits',async()=>sandbox(async root=>{
  await fs.mkdir(path.join(root,'Stories','子目录'),{recursive:true});await fs.mkdir(path.join(root,'Resources'));
  await fs.writeFile(path.join(root,'Stories','a.astoryx'),source());await fs.writeFile(path.join(root,'Stories','子目录','b.ASTORYX'),source());await fs.writeFile(path.join(root,'Resources','not.astoryx'),source());
  const all=await storyFiles(root,10);assert.equal(all.files.length,2);assert.equal(all.truncated,false);assert.equal((await storyFiles(root,1)).truncated,true);
}));
test('unsaved rule contents supplied by the reader change parsing',async()=>{
  const root=path.join(project,'examples/demo');const raw=JSON.parse(readFileSync(path.join(root,'Rules/BaseRule.json'),'utf8'));raw.rules[0].Value.header='BG ';
  const result=await loadDocument(path.join(root,'Stories','main.astoryx'),source('BG room/1'),[],root,{readText:async()=>JSON.stringify(raw),exists:async()=>true});
  assert.equal(result.analysis?.parsed.get(2)?.rule.id,'Background');
});
test('language feature fixtures pass the declared baseline checks',async()=>{
  for(const name of ['main','advance']) {
    const file=path.join(languageFixture,'Stories',name+'.astoryx');const result=await loadDocument(file,await fs.readFile(file,'utf8'));
    assert.equal(result.failure,undefined);assert.deepEqual(result.issues.filter(i=>i.severity==='error'),[]);assert.deepEqual(result.analysis?.incomplete,[]);
  }
});
test('demo follows the extension project layout and loads its own rules',async()=>{
  const root=path.join(project,'examples/demo');
  for(const name of ['Configs','Stories','Rules','Resources/Background','Resources/Char_Picture','Resources/Char_Spine','Resources/Music','Resources/SoundEffect','Resources/VisualEffect'])assert.ok((await fs.stat(path.join(root,name))).isDirectory(),name);
  assert.equal(existsSync(path.join(root,'main.astoryx')),false);
  const file=path.join(root,'Stories','main.astoryx'),result=await loadDocument(file,await fs.readFile(file,'utf8'));
  assert.equal(result.root,root);assert.equal(result.failure,undefined);assert.deepEqual(result.issues.filter(i=>i.severity==='error'),[]);assert.deepEqual(result.analysis?.incomplete,[]);
  assert.equal(result.rules?.rules.find(r=>r.id==='SoundEffect')?.optionalParameters.some(p=>p.parameterName==='AsVoice'),false);
  assert.ok((await resourceNames(root,'Background')).includes('bg'));
  assert.ok((await resourceNames(root,'Char_Picture')).includes('tianyu'));
  assert.ok((await resourceNames(root,'Char_Picture','tianyu')).includes('0'));
});
test('resource completion works for Spine-only projects',async()=>sandbox(async root=>{
  await fs.mkdir(path.join(root,'Resources','Char_Spine','动态角色'),{recursive:true});
  await fs.writeFile(path.join(root,'Resources','Char_Spine','动态角色','动态角色.skel'),'fixture');
  assert.ok((await resourceNames(root,'Char_Picture')).includes('动态角色'));
}));
test('real ASER samples preserve their own rule variants',{skip:!existsSync(path.join(game,'Sample（ASER基础示例剧本集）','Sample'))},async()=>{
  const root=path.join(game,'Sample（ASER基础示例剧本集）','Sample');
  for(const name of ['基础示例上','基础示例下']) {
    const file=path.join(root,'Stories',name+'.astoryx');const result=await loadDocument(file,await fs.readFile(file,'utf8'));
    assert.equal(result.failure,undefined);assert.deepEqual(result.issues.filter(i=>i.severity==='error'),[],name);
    if(name==='基础示例上')assert.equal(result.rules?.rules.find(r=>r.id==='SoundEffect')?.optionalParameters.some(p=>p.parameterName==='AsVoice'),false);
    else assert.ok(result.analysis?.incomplete.length);
  }
  assert.ok((await resourceNames(root,'Background')).includes('bg_amb2026'));
  assert.ok((await resourceNames(root,'Char_Picture','mon3tr(amb2026)')).includes('normal'));
});
