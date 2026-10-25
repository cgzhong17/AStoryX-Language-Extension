import {REPO_ROOT} from './paths';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {CODES,createIssue,diagnosticMessage,DIAGNOSTICS,validateDiagnosticDefinitions} from '../src/diagnostic-codes';
import {analyze,parseRules} from '../src/core';
import {ResourceIndex} from '../src/resources';
import {parseOfficialCatalog} from '../src/official-assets';

const location={line:2,start:9,end:12};
test('diagnostic factory preserves positions and formats named local values with central severity and code',()=>{
  const issue=createIssue('variantUnknown','default',location,{character:'mon3tr',variant:'疑惑'});
  assert.deepEqual(issue,{...location,severity:'warning',code:CODES.variantUnknown,message:'差分不存在：“疑惑”未收录在角色“mon3tr”的 userConfigs.variationNames 值中。'});
  assert.equal(diagnosticMessage('blockArity','default',{name:'示例',expected:2,actual:0}),'示例 需要 2 个参数，实际 0 个。');
});
test('locals remain literal data, including dollar signs, braces, newlines and Windows paths',()=>{
  const reason='D:\\角色\\$&\\{name}\n{source}';
  assert.equal(diagnosticMessage('catalogLoad','default',{source:'JSON',reason}),'无法加载资源清单“JSON”：'+reason);
  assert.equal(diagnosticMessage('ruleMode','default',{reason:false}),'false');
  assert.equal(diagnosticMessage('parameterType','range',{parameter:'Volume',min:0,max:1}),'Volume：取值应在 0～1 之间。');
});
test('shortened templates ignore spare context, including templates with no remaining placeholders',()=>{
  assert.equal(diagnosticMessage('variantUnknown','default',{character:'角色',variant:'差分',searched:'unused'}),
    '差分不存在：“差分”未收录在角色“角色”的 userConfigs.variationNames 值中。');
  assert.deepEqual(createIssue('characterColon','default',location,{oldName:'角色'}),createIssue('characterColon','default',location));
  const messages=DIAGNOSTICS.variantUnknown.messages as {default:string},original=messages.default;
  try{
    messages.default='角色“{character}”的差分不存在。';
    assert.equal(diagnosticMessage('variantUnknown','default',{character:'角色',variant:'旧上下文'}),'角色“角色”的差分不存在。');
    messages.default='差分不存在。';
    assert.equal(diagnosticMessage('variantUnknown','default',{character:'角色',variant:'旧上下文'}),'差分不存在。');
  }finally{messages.default=original;}
});
test('runtime consumers cannot silently omit required context or reference nonexistent scenes',()=>{
  const unsafe=diagnosticMessage as (...args:unknown[])=>string;
  assert.throws(()=>unsafe('variantUnknown','default',{character:'mon3tr'}),/缺少变量 variant/);
  assert.throws(()=>unsafe('variantUnknown','default',{character:'mon3tr',variant:undefined}),/缺少变量 variant/);
  assert.throws(()=>unsafe('variantUnknown','typo',{}),/不存在场景/);
});
test('definition validation rejects duplicate codes, invalid severity prefixes and empty messages',()=>{
  assert.doesNotThrow(()=>validateDiagnosticDefinitions(DIAGNOSTICS));
  assert.throws(()=>validateDiagnosticDefinitions({a:DIAGNOSTICS.variantUnknown,b:DIAGNOSTICS.variantUnknown}),/重复/);
  assert.throws(()=>validateDiagnosticDefinitions({a:{code:'E1001',severity:'warning',messages:{default:'提示'}}}),/不匹配/);
  assert.throws(()=>validateDiagnosticDefinitions({a:{code:'W9001',severity:'warning',messages:{}}}),/缺少提示/);
  assert.throws(()=>validateDiagnosticDefinitions({a:{code:'W9001',severity:'warning',messages:{default:'{record.name}'}}}),/变量名无效/);
});
test('editing only a central message updates real resource diagnostics while keeping the detector and range',async()=>{
  const base=parseRules(readFileSync(path.resolve(REPO_ROOT,'test/fixtures/language-demo/Rules/BaseRule.json'),'utf8'));
  const catalog=parseOfficialCatalog({characterTachies:{avg_fixture:'fixture.ab'}},{characterTachieOfficialConfigs:{avg_fixture:{name:'角色',variationNames:{'#1':'正常'}}}});
  const index=new ResourceIndex('fixture',[catalog],{readDirectory:async()=>[],readText:async()=>''});
  const messages=DIAGNOSTICS.variantUnknown.messages as {default:string},original=messages.default;
  try{
    messages.default='角色 {character} 的差分 {variant} 未收录，请检查 {character}。';
    const result=await index.check(analyze('说明\n#useRule:BaseRule\n--角色:错误/1',base));
    assert.deepEqual(result.issues,[{line:2,start:5,end:7,severity:'warning',code:CODES.variantUnknown,message:'角色 角色 的差分 错误 未收录，请检查 角色。'}]);
  }finally{messages.default=original;}
});

// These examples are checked by tsc but never executed. Adding/removing placeholders updates the required context automatically.
function verifyCompileTimeContract(){
  // @ts-expect-error missing required variant context
  createIssue('variantUnknown','default',location,{character:'mon3tr'});
  // @ts-expect-error unknown scene
  createIssue('variantUnknown','missingScene',location,{character:'mon3tr',variant:'疑惑'});
  // @ts-expect-error misspelled variable name
  createIssue('variantUnknown','default',location,{character:'mon3tr',varaint:'疑惑'});
  // @ts-expect-error nonprimitive context must be prepared explicitly by the detector
  diagnosticMessage('variantUnknown','default',{character:{name:'mon3tr'},variant:'疑惑'});
  // Unused primitive context is intentionally allowed after removing placeholders.
  createIssue('characterColon','default',location,{unused:'x'});
  // @ts-expect-error unused context must still consist of primitive values
  createIssue('characterColon','default',location,{unused:{name:'x'}});
}
