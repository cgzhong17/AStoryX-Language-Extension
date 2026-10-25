import {REPO_ROOT} from './paths';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {analyze,parseRules} from '../src/core';
import {parameterHints} from '../src/inlay-hints';

const base=parseRules(readFileSync(path.resolve(REPO_ROOT,'test/fixtures/language-demo/Rules/BaseRule.json'),'utf8'));
const advanced=parseRules(readFileSync(path.resolve(REPO_ROOT,'test/fixtures/language-demo/Rules/AdvanceRule.json'),'utf8'));
const source=(...lines:string[])=>['说明','#useRule:BaseRule',...lines].join('\n');
test('character and variant are omitted while optional values retain their parameter hints',()=>{
  const text='--mon3tr:疑惑/1/true',analysis=analyze(source(text),base);
  const hints=parameterHints(analysis);
  assert.deepEqual(hints.map(h=>[h.name,h.character]),[['SlotIndex',text.indexOf('/1')+1],['IsBlocker',text.indexOf('true')]]);
  assert.equal(analysis.lines[2],text);
});
test('empty positional slots preserve parameter names and vector values remain intact',()=>{
  const text='背景：bg//0,0,10',analysis=analyze(source(text),base),segments=analysis.parsed.get(2)!.segments;
  const hints=parameterHints(analysis);
  assert.equal(hints.length,2);
  assert.equal(hints[1].name,segments[2].name);
  assert.equal(hints[1].character,text.indexOf('0,0,10'));
});
test('named advanced parameters do not receive duplicate labels',()=>{
  const analysis=analyze(source('--mon3tr:疑惑,@SlotIndex=1,@IsBlocker=true'),advanced);
  assert.deepEqual(parameterHints(analysis),[]);
});
test('dialogue text stays readable while its optional values have labels',()=>{
  const analysis=analyze(source('凯尔希\t你好/true'),base);
  const hints=parameterHints(analysis);
  assert.equal(hints.length,1);assert.equal(hints[0].character,analysis.lines[2].indexOf('true'));
});
test('custom rule separators, UTF-16 offsets and range filtering follow the parser',()=>{
  const rules={...base,rules:base.rules.map(r=>r.id==='Character'?{...r,header:'角色：',requiredParametersSeparator:'：'}:r)};
  const text='角色：😀：微笑/2',analysis=analyze(source('// comment',text,'--其他:默认/1'),rules);
  const hints=parameterHints(analysis,3,3);
  assert.deepEqual(hints.map(h=>[h.line,h.character,h.name]),[[3,text.indexOf('2'),'SlotIndex']]);
  assert.deepEqual(parameterHints(analysis,0,2),[]);
});
