import {REPO_ROOT} from './paths';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {scanAliases,parseAliasEntry} from '../src/aliases';
import {analyze,parseRules} from '../src/core';
import {loadDocument,selectedRuleFile} from '../src/project';
import {aliasTable,resolveAlias} from '../src/writing-checks';

const fixture=path.resolve(REPO_ROOT,'test/fixtures/language-demo');
const source=(...lines:string[])=>['说明','#useRule:BaseRule',...lines].join('\n');
const base=parseRules(readFileSync(path.join(fixture,'Rules/BaseRule.json'),'utf8'));
const advanced=parseRules(readFileSync(path.join(fixture,'Rules/AdvanceRule.json'),'utf8'));
function inspect(...lines:string[]){return scanAliases(source(...lines).split('\n'));}

test('multiple aliases allow question marks and surrounding separator spaces',()=>{
  assert.deepEqual(parseAliasEntry('a -> b / c')?.names,['b','c']);
  const result=inspect('#aliases','a->b/c/d/???/a?/e/f','#endaliases');
  assert.deepEqual(result.issues,[]);assert.equal(result.incomplete,false);
  assert.deepEqual(result.entries.map(entry=>entry.name),['b','c','d','???','a?','e','f']);
});
test('malformed entries and dialogue inside alias blocks warn on the entire offending line',()=>{
  for(const value of ['a->','->b','a->b/','a->/b','a->b//c','a->b->c','a->b c','凯尔希\t你好','直接对话']){
    const result=inspect('#aliases',value,'#endaliases');
    assert.deepEqual(result.issues.map(issue=>[issue.code,issue.line,issue.start,issue.end,issue.severity]),[['W1008',3,0,value.length,'warning']]);
    assert.deepEqual(result.entries,[]);
  }
});
test('missing end emits only W1007 after the valid alias prefix and leaves dialogue readable',()=>{
  for(const rules of [base,advanced]){
    const analysis=analyze(source('#aliases','a->b','b\t直接对话'),rules);
    assert.deepEqual(analysis.issues.map(issue=>[issue.code,issue.line]),[['W1007',4]]);
    assert.ok(analysis.issues.every(issue=>issue.severity==='warning'));
    assert.deepEqual([analysis.issues.find(i=>i.line===4)!.start,analysis.issues.find(i=>i.line===4)!.end],[0,'b\t直接对话'.length]);
    assert.equal(aliasTable(analysis).entries.length,0);
    assert.equal(analysis.parsed.get(4)?.rule.id,'Dialog');
  }
});
test('an unmatched end warns at itself and reversed blocks do not initialize aliases',()=>{
  const unmatched=inspect('#endaliases');assert.equal(unmatched.issues[0].message,'上方没有 #aliases。');
  assert.deepEqual(unmatched.issues[0],{line:2,start:0,end:11,code:'W1007',severity:'warning',message:'上方没有 #aliases。'});
  const reversed=inspect('#endaliases','#aliases','a->b');
  assert.deepEqual(reversed.issues.map(issue=>[issue.code,issue.line]),[['W1007',2],['W1007',4]]);
  assert.deepEqual(reversed.entries,[]);
});
test('only closed blocks validate entries or duplicates; unclosed blocks only locate a missing end',()=>{
  for(const value of ['a->','直接对话','凯尔希\t你好']){
    const unclosed=inspect('#aliases','a->b',value,'后续文本');
    assert.deepEqual(unclosed.issues.map(issue=>[issue.code,issue.line,issue.message]),[['W1007',4,'缺少 #endaliases。']]);
    const closed=inspect('#aliases','a->b',value,'#endaliases');
    assert.deepEqual(closed.issues.map(issue=>[issue.code,issue.line]),[['W1008',4]]);
  }
  assert.deepEqual(inspect('#aliases','a->b','c->b','正文').issues.map(i=>[i.code,i.line]),[['W1007',5]]);
  assert.deepEqual(inspect('#aliases extra','a->b','正文').issues.map(i=>[i.code,i.line]),[['W1007',4]]);
});
test('unclosed prefix skips comments and blank lines, with a safe EOF position when no next line exists',()=>{
  assert.deepEqual(inspect('#aliases','a->b','// 注释','','正文').issues.map(i=>[i.code,i.line]),[['W1007',6]]);
  const withEmptyNext=inspect('#aliases','a->b','').issues[0];
  assert.deepEqual([withEmptyNext.line,withEmptyNext.start,withEmptyNext.end],[4,0,0]);
  const eof=inspect('#aliases','a->b').issues[0];
  assert.deepEqual([eof.line,eof.start,eof.end],[3,4,4]);
});
test('duplicate right-hand aliases warn only on the later full line, including later blocks',()=>{
  const result=inspect('#aliases','a->b','c->b','a->d/e','#endaliases','#aliases','a->e','#endaliases');
  assert.deepEqual(result.issues.map(issue=>[issue.code,issue.line,issue.start,issue.end,issue.message]),[
    ['W1009',4,0,4,'重复指定的别名'],['W1009',8,0,4,'重复指定的别名']
  ]);
  assert.equal(result.incomplete,false);
  assert.equal(resolveAlias(result,'b',10),'c');
  assert.deepEqual(inspect('#aliases','a->b','a->c','#endaliases').issues,[]);
  assert.equal(inspect('#aliases','a->b/b','#endaliases').issues.filter(i=>i.code==='W1009').length,1);
});
test('nested blocks and malformed directive lines warn without initializing invalid declarations',()=>{
  const nested=inspect('#aliases','a->b','#aliases','c->d','#endaliases','#endaliases');
  assert.ok(nested.issues.some(i=>i.code==='W1007'&&i.line===4));assert.deepEqual(nested.entries,[]);
  const malformed=inspect('#aliases a->b','a->b','#endaliases extra');
  assert.deepEqual(malformed.issues.map(i=>[i.code,i.line]),[['W1008',2],['W1008',4]]);
  assert.deepEqual(malformed.entries,[]);
});
test('closed valid mappings survive an invalid line but incomplete/macro declarations do not leak',()=>{
  const result=inspect('#aliases','a->b','直接对话','#endaliases');
  assert.equal(result.entries[0].name,'b');assert.equal(result.incomplete,true);
  assert.deepEqual(inspect('#block m(x)','#aliases','a->b','#endaliases','#endblock').entries,[]);
});
test('useRule explicitly selects BaseRule or AdvanceRule and missing files remain E1002',async()=>{
  assert.equal(selectedRuleFile('baseRULE.json'),'BaseRule.json');assert.equal(selectedRuleFile('AdvanceRule'),'AdvanceRule.json');
  assert.equal(selectedRuleFile('CustomRule'),'CustomRule.json');
  for(const [name,line,expected]of [
    ['BaseRule','--mon3tr:疑惑/1/true',['Character&Variant','SlotIndex','IsBlocker']],
    ['AdvanceRule','--mon3tr:疑惑,@IsBlocker=true,@SlotIndex=1',['Character&Variant','IsBlocker','SlotIndex']]
  ] as const){
    const result=await loadDocument(path.join(fixture,'Stories/audit.astoryx'),'说明\n#useRule:'+name+'\n'+line,[fixture]);
    assert.ok(!result.failure);assert.equal(result.ruleFile,path.join(fixture,'Rules',name+'.json'));
    assert.deepEqual(result.analysis?.parsed.get(2)?.segments.map(s=>s.name),expected);assert.deepEqual(result.issues,[]);
  }
  for(const name of ['MissingRule','MissingRule.json']){
    const missing=await loadDocument(path.join(fixture,'Stories/audit.astoryx'),'说明\n#useRule:'+name+'\n--mon3tr:疑惑/1',[fixture]);
    assert.equal(missing.issues[0].code,'E1002');
    assert.equal(missing.issues[0].message,'在 Rules/ 找不到 MissingRule.json。');
    assert.equal(missing.analysis,undefined);
  }
});
