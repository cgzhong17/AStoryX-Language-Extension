import {REPO_ROOT,TEMP_ROOT} from './paths';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import * as fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {analyze,parseRules} from '../src/core';
import {parseOfficialCatalog,loadOfficialCatalog} from '../src/official-assets';
import {ResourceIndex} from '../src/resources';
import {aliasTable,writingIssues} from '../src/writing-checks';

const project=REPO_ROOT;
const base=parseRules(readFileSync(path.join(project,'test/fixtures/language-demo/Rules/BaseRule.json'),'utf8'));
const advanced=parseRules(readFileSync(path.join(project,'test/fixtures/language-demo/Rules/AdvanceRule.json'),'utf8'));
const source=(...lines:string[])=>['说明','#useRule:BaseRule',...lines].join('\n');
const collections={characterTachies:{avg_003_kalts_1:'kalts.ab',avg_4179_monstr_1:'monstr.ab',avg_uncollected_1:'raw.ab'},characterDynamics:{'dyn_uncollected#16':'dyn.ab'},backgrounds:{bg_remote:'bg.ab'},musics:{m_remote:'m.ab'},soundEffects:{s_remote:'s.ab'},visualEffects:{fx_remote:'fx.ab'}};
const configs={characterTachieOfficialConfigs:{avg_003_kalts_1:{name:'凯尔希',variationNames:{'#1$1':'默认','#12$1':'wink'}},avg_4179_monstr_1:{name:'mon3tr',variationNames:{'#1$1':'默认','#5$1':'疑惑','#1$2':'#1$2'}}},characterSpineOfficialConfigs:{}};
const catalog=()=>parseOfficialCatalog(collections,configs);
test('a full-width character colon warns without cascading into missing resource or variant errors',async()=>sandbox(async root=>{
  const analysis=analyze(source('--mon3tr：疑惑/1','--mon3tr：不存在/1'),base);
  const result=await new ResourceIndex(root,[catalog()]).check(analysis);
  assert.deepEqual(analysis.issues.filter(i=>i.code==='W1006').map(i=>i.line),[2,3]);
  assert.deepEqual(result.issues.map(i=>[i.line,i.code]),[[3,'W1004']]);
}));
test('userConfigs names are valid dialogue speakers before any script alias declaration',()=>{
  const index=new ResourceIndex('',[catalog()]);
  const analysis=analyze(source('mon3tr\t对话','凯尔希\t对话','未收录\t对话','#aliases','avg_003_kalts_1->后来声明','#endaliases','后来声明\t对话'),base);
  assert.deepEqual(writingIssues(analysis,{knownSpeakers:index.configuredNames()}).map(i=>[i.line,i.code]),[[4,'W1001']]);
  const spaces=writingIssues(analyze(source('mon3tr  对话'),base),{knownSpeakers:index.configuredNames()});
  assert.deepEqual(spaces.map(i=>i.code),['W1003']);
});
test('configured names take precedence over conflicting script aliases and local variants',async()=>sandbox(async root=>{
  await fs.mkdir(path.join(root,'Resources/Char_Picture/mon3tr'),{recursive:true});
  await fs.writeFile(path.join(root,'Resources/Char_Picture/mon3tr/local.png'),'fixture');
  const index=new ResourceIndex(root,[catalog()]);
  const analysis=analyze(source('#aliases','avg_uncollected_1->mon3tr','#endaliases','--mon3tr:疑惑/1'),base);
  assert.equal(index.resolveCharacter(aliasTable(analysis),'mon3tr',5).name,'mon3tr');
  assert.deepEqual((await index.check(analysis)).issues,[]);
  assert.deepEqual(await index.names('Char_Picture','mon3tr'),['#1$2','疑惑','默认']);
}));
test('script aliases resolve through multiple parents to configured names and preserve raw-ID warnings',async()=>sandbox(async root=>{
  const index=new ResourceIndex(root,[catalog()]);
  const analysis=analyze(source('#aliases','凯尔希->一层','一层->二层','avg_uncollected_1->原始一层','原始一层->原始二层','#endaliases','--二层:wink/0','--原始二层:#1$1/1'),base);
  const resolved=index.resolveCharacter(aliasTable(analysis),'二层',8);
  assert.equal(resolved.name,'凯尔希');assert.equal(resolved.chain.length,2);
  assert.deepEqual(await index.names('Char_Picture',resolved.name),['wink','默认']);
  assert.deepEqual((await index.check(analysis)).issues.map(i=>[i.line,i.code]),[[9,'W1005']]);
}));
test('a name present only in userConfigs remains valid while its missing raw-ID declaration still errors',async()=>sandbox(async root=>{
  const index=new ResourceIndex(root,[parseOfficialCatalog({},configs)]);
  const analysis=analyze(source('--mon3tr:疑惑/1','mon3tr\t对话','#aliases','avg_4179_monstr_1->另一个名字','#endaliases'),base);
  assert.deepEqual(writingIssues(analysis,{knownSpeakers:index.configuredNames()}),[]);
  assert.deepEqual((await index.check(analysis)).issues.map(i=>[i.line,i.code]),[[5,'E2001']]);
  assert.deepEqual(await index.names('Char_Picture','mon3tr'),['#1$2','疑惑','默认']);
}));
test('cyclic alias parents terminate with declaration errors',async()=>sandbox(async root=>{
  const index=new ResourceIndex(root,[catalog()]);
  const analysis=analyze(source('#aliases','甲->乙','乙->甲','#endaliases','--甲:默认/0'),base);
  assert.equal(index.resolveCharacter(aliasTable(analysis),'甲',6).cycle,true);
  assert.deepEqual((await index.check(analysis)).issues.map(i=>i.code),['E3020','E3020']);
}));
async function sandbox(run:(root:string)=>Promise<void>){
  const root=await fs.mkdtemp(path.join(TEMP_ROOT,'.test-official-'));
  try{await run(root);}finally{assert.ok(path.resolve(root).startsWith(TEMP_ROOT+path.sep+'.test-official-'));await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
async function write(root:string,name:string,value:unknown){const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));return file;}

test('official character completion uses userConfigs.name and variationNames values',async()=>sandbox(async root=>{
  const index=new ResourceIndex(root,[catalog()]);
  assert.ok((await index.names('Char_Picture')).includes('mon3tr'));
  assert.deepEqual(await index.names('Char_Picture','mon3tr'),['#1$2','疑惑','默认']);
  assert.deepEqual(await index.names('Char_Picture','avg_003_kalts_1'),['wink','默认']);
  assert.ok(!(await index.names('Char_Picture','mon3tr')).includes('#1$1'));
  assert.deepEqual(await index.names('Char_Picture','avg_uncollected_1'),[]);
  assert.deepEqual(await index.names('Background'),['bg_remote']);
}));
test('unknown configured variants warn on the variant value while valid values and dynamic values pass',async()=>sandbox(async root=>{
  const result=await new ResourceIndex(root,[catalog()]).check(analyze(source('--mon3tr:疑惑/1','--mon3tr:不存在/1','--mon3tr:#1$1/1','--mon3tr:#1$2/1','--mon3tr:$[差分]/1'),base));
  assert.deepEqual(result.issues.map(i=>[i.line,i.start,i.end,i.code,i.severity]),[[3,9,12,'W1004','warning'],[4,9,13,'W1004','warning']]);
  assert.ok(result.issues.every(i=>i.message.includes('差分不存在')));
  assert.ok(result.incomplete.includes('动态角色差分未验证。'));
}));
test('an explicitly empty variationNames map warns about missing values rather than pretending the raw ID is uncollected',async()=>sandbox(async root=>{
  const data=parseOfficialCatalog(collections,{characterTachieOfficialConfigs:{avg_4179_monstr_1:{name:'mon3tr',variationNames:{}}}});
  const result=await new ResourceIndex(root,[data]).check(analyze(source('--mon3tr:疑惑/1'),base));
  assert.deepEqual(result.issues.map(i=>i.code),['W1004']);
}));
test('incomplete raw-ID warnings survive declared alias mapping without inventing variant candidates',async()=>sandbox(async root=>{
  const result=await new ResourceIndex(root,[catalog()]).check(analyze(source('#aliases','avg_uncollected_1->凯尔希alts_1','#endaliases','--avg_uncollected_1:#1$1/0','--凯尔希alts_1:#1$1/1','--avg_003_kalts_1:wink/0'),base));
  assert.deepEqual(result.issues.map(i=>[i.line,i.code,i.severity]),[[5,'W1005','warning'],[6,'W1005','warning']]);
  assert.equal(result.issues[0].message,result.issues[1].message);
  assert.ok(result.issues[1].message.includes('建议使用收录后的别名'));
  assert.equal(result.incomplete.length,0,'A warning alone must not make the project fail with partial coverage');
}));
test('nonexistent raw alias sources error at the declaration, with no cascade at later uses',async()=>sandbox(async root=>{
  const text=source('#aliases','avg_missing->角色/另一个角色','avg_003_kalts_1->凯尔希','#endaliases','--角色:0/1','--另一个角色:0/1','--凯尔希:不存在/0');
  const result=await new ResourceIndex(root,[catalog()]).check(analyze(text,base));
  assert.deepEqual(result.issues.map(i=>[i.line,i.start,i.end,i.code]),[[3,0,11,'E2001'],[8,6,9,'W1004']]);
  assert.ok(result.issues[0].message.includes('officialAssets_collections'));
}));
test('ordinary local aliases remain valid while missing generic sources error at their declaration',async()=>sandbox(async root=>{
  await fs.mkdir(path.join(root,'Resources/Char_Picture/local'),{recursive:true});await fs.writeFile(path.join(root,'Resources/Char_Picture/local/normal.png'),'fixture');
  const result=await new ResourceIndex(root,[catalog()]).check(analyze(source('#aliases','local->本地角色','unlisted_resource->未知角色','#endaliases','--本地角色:normal/0','--未知角色:normal/1'),base));
  assert.deepEqual(result.issues.map(i=>[i.line,i.code]),[[4,'E2001']]);
}));
test('configured aliases retain raw identity under custom and advanced separators',async()=>sandbox(async root=>{
  const index=new ResourceIndex(root,[catalog()]);
  const named=await index.check(analyze(source('--mon3tr:不存在,@SlotIndex=1'),advanced));
  assert.deepEqual(named.issues.map(i=>[i.start,i.end,i.code]),[[9,12,'W1004']]);
  const custom={rules:base.rules.map(r=>r.id==='Character'?{...r,requiredParametersSeparator:'：'}:r),warnings:[]};
  const result=await index.check(analyze(source('#aliases','avg_uncollected_1->凯尔希alts_1','#endaliases','--凯尔希alts_1：#1$1/0'),custom));
  assert.deepEqual(result.issues.map(i=>i.code),['W1005']);
}));
test('project userConfigs overrides global data as a whole and read overlays support unsaved edits',async()=>sandbox(async root=>{
  const directory=path.join(root,'global');
  await write(directory,'officialAssets_collections.json',collections);await write(directory,'officialAssets_userConfigs.json',configs);
  const local=await write(root,'Configs/officialAssets_userConfigs.json',{characterTachieOfficialConfigs:{avg_4179_monstr_1:{name:'新名称',variationNames:{'#1$1':'新差分'}}}});
  const loaded=await loadOfficialCatalog(root,directory);
  const index=new ResourceIndex(root,loaded);
  assert.deepEqual(await index.names('Char_Picture','新名称'),['新差分']);
  const result=await index.check(analyze(source('--avg_003_kalts_1:wink/0'),base));assert.equal(result.issues[0].code,'W1005');
  const edited=await loadOfficialCatalog(root,directory,{exists:async file=>{try{await fs.stat(file);return true;}catch{return false;}},readText:async file=>file===local?JSON.stringify(configs):fs.readFile(file,'utf8')});
  assert.deepEqual(await new ResourceIndex(root,edited).names('Char_Picture','mon3tr'),['#1$2','疑惑','默认']);
}));
test('failed official configuration reports E1003 without speculative source/variant errors',async()=>sandbox(async root=>{
  const directory=path.join(root,'global');await write(directory,'officialAssets_collections.json',collections);
  await fs.writeFile(await write(directory,'officialAssets_userConfigs.json',{}),'{');
  const loaded=await loadOfficialCatalog(root,directory);
  const result=await new ResourceIndex(root,loaded).check(analyze(source('#aliases','avg_missing->角色','#endaliases','--角色:差分/1'),base));
  assert.deepEqual(result.issues.map(i=>i.code),['E1003']);
  assert.deepEqual(await loadOfficialCatalog(root,path.join(root,'missing')),[]);
  assert.ok((await loadOfficialCatalog(root,path.join(root,'missing'),undefined,true))[0].failure);
}));

test('project overrides merge resource entries and aliases without dropping global names',async()=>sandbox(async root=>{
  const directory=path.join(root,'global');
  await write(directory,'officialAssets_collections.json',collections);
  await write(directory,'officialAssets_userConfigs.json',configs);
  await write(directory,'officialAssets_aliases.json',{musics:{m_remote:'旧音乐名'},soundEffects:{s_remote:'保留音效'}});
  await write(root,'Configs/override_userConfigs.json',{characterTachieOfficialConfigs:{avg_4179_monstr_1:{name:'新mon3tr',variationNames:{'#1$1':'新差分'}}},characterSpineOfficialConfigs:{}});
  const aliasFile=await write(root,'Configs/override_aliases.json',{musics:{m_remote:'已至'},soundEffects:{}});
  const index=new ResourceIndex(root,await loadOfficialCatalog(root,directory));
  assert.deepEqual(await index.names('Char_Picture','凯尔希'),['wink','默认']);
  assert.deepEqual(await index.names('Char_Picture','新mon3tr'),['新差分']);
  assert.ok((await index.names('SoundEffect')).includes('保留音效'));
  assert.ok(!(await index.names('Music')).includes('旧音乐名'));
  assert.deepEqual((await index.check(analyze(source('音乐：已至','音效：保留音效','--新mon3tr:新差分/0'),base))).issues,[]);
  const edited=await loadOfficialCatalog(root,directory,{exists:async file=>{try{await fs.stat(file);return true;}catch{return false;}},readText:async file=>file===aliasFile?JSON.stringify({musics:{m_remote:'未保存名'}}):fs.readFile(file,'utf8')});
  assert.ok((await new ResourceIndex(root,edited).names('Music')).includes('未保存名'));
}));
test('project aliases work for local resources without global collections and do not invent missing resources',async()=>sandbox(async root=>{
  await fs.mkdir(path.join(root,'Resources/Music'),{recursive:true});
  await fs.writeFile(path.join(root,'Resources/Music/song.wav'),'fixture');
  await write(root,'Configs/override_aliases.json',{musics:{song:'本地音乐',missing:'不存在音乐'}});
  const index=new ResourceIndex(root,await loadOfficialCatalog(root,undefined));
  assert.ok((await index.names('Music')).includes('本地音乐'));
  assert.ok(!(await index.names('Music')).includes('不存在音乐'));
  const result=await index.check(analyze(source('音乐：本地音乐','音乐：不存在音乐','音效：本地音乐'),base));
  assert.deepEqual(result.issues.map(i=>[i.line,i.code]),[[3,'E2001'],[4,'E2001']]);
}));
test('local and catalog resource names take precedence over conflicting script aliases',async()=>sandbox(async root=>{
  await fs.mkdir(path.join(root,'Resources/Music'),{recursive:true});
  await fs.writeFile(path.join(root,'Resources/Music/song.wav'),'fixture');
  const result=await new ResourceIndex(root,[catalog()]).check(analyze(source('#aliases','m_remote->song','m_remote->s_remote','#endaliases','音乐：song','音效：s_remote'),base));
  assert.deepEqual(result.issues,[]);
}));
test('malformed overrides report the configuration failure',async()=>sandbox(async root=>{
  await write(root,'Configs/override_aliases.json',{musics:{song:42}});
  const loaded=await loadOfficialCatalog(root,undefined);
  assert.ok(loaded[0].failure?.includes('aliases.musics.song'));
  const result=await new ResourceIndex(root,loaded).check(analyze(source('音乐：song'),base));
  assert.deepEqual(result.issues.map(i=>i.code),['E1003']);
}));

test('configured character aliases validate dialogue names only when their resource exists',async()=>sandbox(async root=>{
  await fs.mkdir(path.join(root,'Resources/Char_Picture/local'),{recursive:true});
  await fs.writeFile(path.join(root,'Resources/Char_Picture/local/normal.png'),'fixture');
  await write(root,'Configs/override_aliases.json',{characterTachies:{local:'本地别名',missing:'无来源别名'}});
  const index=new ResourceIndex(root,await loadOfficialCatalog(root,undefined));
  assert.deepEqual(await index.names('Char_Picture','本地别名'),['normal']);
  const analysis=analyze(source('本地别名<br>\t对话','无来源别名\t对话'),base);
  assert.deepEqual(writingIssues(analysis,{knownSpeakers:await index.speakerNames()}).map(i=>[i.line,i.code]),[[3,'W1001']]);
}));
