import {REPO_ROOT,TEMP_ROOT} from './paths';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import * as fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {analyze,parseRules} from '../src/core';
import {writingIssues,aliasTable,resolveAlias} from '../src/writing-checks';
import {ResourceIndex,ResourceAccess} from '../src/resources';
import {loadDocument} from '../src/project';

const project=REPO_ROOT;
const base=parseRules(readFileSync(path.join(project,'test/fixtures/language-demo/Rules/BaseRule.json'),'utf8'));
const advanced=parseRules(readFileSync(path.join(project,'test/fixtures/language-demo/Rules/AdvanceRule.json'),'utf8'));
const source=(...lines:string[])=>['说明','#useRule:BaseRule',...lines].join('\n');
const inspect=(lines:string[],limit:number|null=null)=>writingIssues(analyze(source(...lines),base),{maxLineLength:limit});
async function sandbox(run:(root:string)=>Promise<void>){
  const root=await fs.mkdtemp(path.join(TEMP_ROOT,'.test-report-'));
  try{await run(root);}finally{assert.ok(path.resolve(root).startsWith(path.resolve(TEMP_ROOT)+path.sep+'.test-report-'));await fs.rm(root,{recursive:true,force:true});}
}
async function file(root:string,name:string,text='fixture'){
  const target=path.join(root,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,text);return target;
}

test('warnings require prior closed alias declarations, including secondary aliases',()=>{
  const issues=inspect(['凯尔希\t之前','#aliases','char->凯尔希/医生','#endaliases','凯尔希\t之后','医生\t之后','阿米娅\t未声明']);
  assert.deepEqual(issues.map(i=>[i.line,i.start,i.end,i.code,i.severity]),[[2,0,3,'W1001','warning'],[8,0,3,'W1001','warning']]);
  const table=aliasTable(analyze(source('#aliases','char->凯尔希','#endaliases','--凯尔希:normal'),base));
  assert.equal(resolveAlias(table,'凯尔希',5),'char');assert.equal(resolveAlias(table,'凯尔希',2),'凯尔希');
});
test('invalid alias blocks and macro scopes do not produce speculative undeclared warnings',()=>{
  for(const lines of [ ['#aliases','char->凯尔希'],['#aliases','->凯尔希','#endaliases','凯尔希\t正文'],['#block m(x)','$(x)\t正文','#endblock','#use m(凯尔希)','凯尔希\t正文'] ]){
    const analysis=analyze(source(...lines),base);
    assert.ok(!writingIssues(analysis).some(i=>i.code==='W1001'));
  }
});
test('space warnings mark only separators and take precedence over inferred dialogue warnings',()=>{
  const issues=inspect(['#aliases','char->凯尔希/凯尔希医生','#endaliases','凯尔希医生  很长的一句话','风 从远处吹来。','陌生名字 普通旁白','凯尔希\t正文 中的空格'],1);
  const spaces=issues.filter(i=>i.code==='W1003');
  assert.equal(spaces.length,1);assert.deepEqual([spaces[0].line,spaces[0].start,spaces[0].end],[5,5,7]);
  assert.equal(issues.filter(i=>i.line===5).length,1);
  assert.ok(!issues.some(i=>i.code==='W1003'&&i.line!==5));
});
test('custom dialogue separators and unprotected separators obey the project rule',()=>{
  const rules={rules:base.rules.map(r=>r.id==='Dialog'?{...r,requiredParametersSeparator:'::'}:r),warnings:[]};
  const issues=writingIssues(analyze(source('#aliases','char->凯尔希','#endaliases','凯尔希  正文','凯尔希::正文'),rules));
  assert.ok(!issues.some(i=>i.code==='W1003'||i.code==='W1001'));
});
test('length checks count visible content while marking the entire source line, including names and parameters',()=>{
  const lines=['#aliases','char->凯尔希','#endaliases','凯尔希\t&{<color=red>你😀好</color>}/true'];
  assert.equal(inspect(lines).length,0);assert.equal(inspect(lines,3).length,0);
  const warning=inspect(lines,2).find(i=>i.code==='W1002')!;
  assert.equal(warning.message,'超出2字，显示效果可能会受到影响。');
  const text=lines[3];assert.equal(warning.start,0);assert.equal(warning.end,text.length);assert.equal(text.slice(warning.start,warning.end),text);
  const protectedText=inspect(['&{甲😀乙}'],2)[0];assert.equal(protectedText.code,'W1002');assert.equal(protectedText.start,0);assert.equal(protectedText.end,'&{甲😀乙}'.length);
  const narration=inspect(['甲乙丙'],2)[0];assert.ok(!narration.message.includes('差分'));
  assert.ok(!inspect(['$[运行时文本]'],1).some(i=>i.code==='W1002'));
});
test('all text controllers default to sixty visible Chinese characters and underline the entire long line',()=>{
  for(const id of ['Dialog','FreeText','Narration']){
    const header=id==='Dialog'?'凯尔希\t':base.rules.find(rule=>rule.id===id)!.header!;
    const check=(body:string)=>writingIssues(analyze(source(header+body),base),{knownSpeakers:new Set(['凯尔希'])});
    assert.ok(!check('中'.repeat(60)).some(issue=>issue.code==='W1002'));
    const body='中'.repeat(60)+'。',warning=check(body).find(issue=>issue.code==='W1002')!;
    assert.ok(warning);assert.equal(warning.message,'超出60字，显示效果可能会受到影响。');
    assert.equal(warning.start,0);assert.equal(warning.end,(header+body).length);
    assert.equal((header+body).slice(warning.start,warning.end),header+body);
    assert.ok(!check('😀'.repeat(60)).some(issue=>issue.code==='W1002'));
  }
});
test('background resources report exact names; shared names in another category do not count',async()=>sandbox(async root=>{
  await file(root,'Resources/Background/bg.png');await file(root,'Resources/Music/music.ogg');
  const index=new ResourceIndex(root),result=await index.check(analyze(source('背景：bg+music+lost/1','音乐：music'),base));
  assert.deepEqual(result.issues.map(i=>[i.line,i.start,i.end,i.code,i.severity]),[[2,6,11,'E2001','error'],[2,12,16,'E2001','error']]);
  assert.deepEqual(await index.names('Background'),['bg']);
}));
test('characters must have actual config/media; aliases resolve before resource validation',async()=>sandbox(async root=>{
  await file(root,'Resources/Char_Picture/char/normal.png');
  await fs.mkdir(path.join(root,'Resources/Char_Picture/empty'),{recursive:true});
  const result=await new ResourceIndex(root).check(analyze(source('#aliases','char->凯尔希','#endaliases','--凯尔希:normal/1','--empty:normal/0','--unknown:normal/1'),base));
  assert.deepEqual(result.issues.map(i=>[i.line,i.start,i.end,i.code]),[[6,2,7,'E2001'],[7,2,9,'E2001']]);
  assert.deepEqual(await new ResourceIndex(root).names('Char_Picture'),['char']);
}));
test('normalized third-party catalogs union with local records without requiring local downloads',async()=>sandbox(async root=>{
  const index=new ResourceIndex(root,[{source:'future-adapter',resources:{Background:[{name:'bg'}],Char_Picture:[{name:'remote'}]}}]);
  const result=await index.check(analyze(source('背景：bg','--remote:unknown-variant/0','背景：remote'),base));
  assert.equal(result.issues.length,1);assert.equal(result.issues[0].code,'E2001');assert.equal(result.issues[0].line,4);
  assert.deepEqual(await index.names('Char_Picture'),['remote']);assert.deepEqual(await index.names('Char_Picture','remote'),[]);
}));
test('catalog and directory failures report the root cause without cascaded missing errors',async()=>sandbox(async root=>{
  const brokenCatalog=await new ResourceIndex(root,[{source:'bad.json',resources:{},failure:'Invalid JSON'}]).check(analyze(source('背景：a','背景：b'),base));
  assert.deepEqual(brokenCatalog.issues.map(i=>i.code),['E1003']);assert.ok(brokenCatalog.incomplete.length);
  const access:ResourceAccess={readText:async()=>'',readDirectory:async()=>{throw Object.assign(new Error('Access denied'),{code:'EACCES'});}};
  const denied=await new ResourceIndex(root,[],access).check(analyze(source('背景：a','背景：b'),base));
  assert.deepEqual(denied.issues.map(i=>i.code),['E1004']);
  await file(root,'Resources/Char_Picture/broken/broken_config.json','{');
  const invalid=await new ResourceIndex(root).check(analyze(source('--broken:0/0','--another:0/1'),base));
  assert.deepEqual(invalid.issues.map(i=>i.code),['E1004']);
}));
test('clearing resources, dynamic references, protected literals and advanced rules are distinct',async()=>sandbox(async root=>{
  const result=await new ResourceIndex(root).check(analyze(source('背景：none','音乐：无','--none/0','背景：$[name]','背景：&{missing}','特效：none'),base));
  assert.deepEqual(result.issues.map(i=>i.code),['E2001','E2001']);assert.ok(result.incomplete.includes('动态资源名未验证。'));
  const custom=await new ResourceIndex(root).check(analyze(source('背景：bg,@FadeInTime=1'),advanced));
  assert.deepEqual([custom.issues[0].start,custom.issues[0].end],[3,5]);
}));
test('Music null clears music in both rule formats without suppressing other resource or parameter errors',async()=>sandbox(async root=>{
  for(const [name,rules,music] of [
    ['BaseRule',base,'音乐：null/1/3'],
    ['AdvanceRule',advanced,'音乐：null,@FadeInTime=3']
  ] as const){
    const text=['说明','#useRule:'+name,music,'音乐：null_missing','背景：null','音效：null'].join('\n');
    const analysis=analyze(text,rules);
    const result=await new ResourceIndex(root).check(analysis);
    assert.deepEqual(result.issues.map(i=>[i.line,i.code]),[[3,'E2001'],[4,'E2001'],[5,'E2001']]);
    const invalid=analyze(['说明','#useRule:'+name,music.replace(/3$/,'null')].join('\n'),rules);
    assert.ok(invalid.issues.some(i=>i.code==='E3006'));
  }
}));
test('project/config errors use E1001/E1002 and syntax errors retain stable E/W codes',async()=>sandbox(async root=>{
  const script=path.join(root,'Stories/main.astoryx');
  assert.equal((await loadDocument(script,source(),[],path.join(root,'missing'))).issues[0].code,'E1001');
  await fs.mkdir(path.join(root,'Rules'));assert.equal((await loadDocument(script,source(),[],root)).issues[0].code,'E1002');
  await file(root,'Rules/BaseRule.json',readFileSync(path.join(project,'test/fixtures/language-demo/Rules/BaseRule.json'),'utf8'));
  const result=await loadDocument(script,source('背景：bg/abc','未声明\t正文'),[],root);
  assert.ok(result.issues.some(i=>i.code==='E3006'&&i.severity==='error'));
  assert.ok(result.issues.some(i=>i.code==='W1001'&&i.severity==='warning'));
  assert.ok(result.issues.every(i=>i.code.startsWith({error:'E',warning:'W',information:'I'}[i.severity])));
}));

test('nested resources and manifest bundle entries are indexed by actual assets',async()=>sandbox(async root=>{
  await file(root,'Resources/Music/sub/song.wav');
  await file(root,'Resources/SoundEffect/sub/hit.ogg');
  await file(root,'Resources/Background/sub/scene.png');
  await file(root,'Resources/VisualEffect/prefab/effect.ab');
  await file(root,'Resources/VisualEffect/texture/noise.ab');
  await file(root,'Resources/VisualEffect/manifest.json',JSON.stringify({
    present:{assetPath:'Assets/present.prefab',bundlePath:'prefab/effect.ab',dependencies:['texture/noise.ab']},
    absent:{assetPath:'Assets/absent.prefab',bundlePath:'prefab/missing.ab'},
    dependencyMissing:{assetPath:'Assets/other.prefab',bundlePath:'prefab/effect.ab',dependencies:['texture/missing.ab']}
  }));
  const index=new ResourceIndex(root);
  assert.ok((await index.names('Music')).includes('sub/song'));
  assert.deepEqual(await index.names('VisualEffect'),['present']);
  const result=await index.check(analyze(source('音乐：song','音效：hit','背景：scene','特效：present','特效：absent','特效：dependencyMissing','音乐：hit'),base));
  assert.deepEqual(result.issues.map(i=>[i.line,i.code]),[[6,'E2001'],[7,'E2001'],[8,'E2001']]);
  await fs.unlink(path.join(root,'Resources/VisualEffect/prefab/effect.ab'));
  assert.deepEqual(await new ResourceIndex(root).names('VisualEffect'),[]);
}));
test('invalid manifests report an index failure instead of speculative missing-resource errors',async()=>sandbox(async root=>{
  await file(root,'Resources/VisualEffect/manifest.json','{');
  const result=await new ResourceIndex(root).check(analyze(source('特效：present'),base));
  assert.deepEqual(result.issues.map(i=>i.code),['E1004']);
}));
test('dialogue aliases ignore rich-text tags and validate each speaker with source ranges',()=>{
  const text=source('#aliases','char->？？？/Stormeye/Pith','#endaliases',
    '？？？<br>\t对话','<color=#fff>？？？&{</color>}<br>\t对话',
    'Stormeye&Pith\t对话','Stormeye&未知<br>\t对话','// 未知<br>\t注释');
  const analysis=analyze(text,base),issues=writingIssues(analysis);
  assert.deepEqual(issues.map(i=>[i.line,i.code]),[[8,'W1001']]);
  assert.equal(analysis.lines[8].slice(issues[0].start,issues[0].end),'未知');
  assert.ok(issues[0].message.includes('未知'));
  assert.ok(!analysis.speakers.some(name=>name.includes('<br>')||name==='Stormeye&Pith'));
});
