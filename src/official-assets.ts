import * as path from 'node:path';
import * as os from 'node:os';
import {FileAccess,diskAccess} from './project';
import type {ResourceCatalog,ResourceCategory,ResourceRecord} from './resources';

type JsonObject=Record<string,unknown>;
const object=(value:unknown):value is JsonObject=>!!value&&typeof value==='object'&&!Array.isArray(value);
const sections:{key:string;category:ResourceCategory;config?:string}[]=[
  {key:'characterTachies',category:'Char_Picture',config:'characterTachieOfficialConfigs'},
  {key:'characterDynamics',category:'Char_Picture',config:'characterSpineOfficialConfigs'},
  {key:'backgrounds',category:'Background'},{key:'musics',category:'Music'},
  {key:'soundEffects',category:'SoundEffect'},{key:'visualEffects',category:'VisualEffect'}
];
export function defaultOfficialConfigDirectory():string|undefined {
  return process.platform==='win32'?path.join(os.homedir(),'AppData','LocalLow','Gradus','ASE-Remake','Configs'):undefined;
}
/** 元数据来自官方清单；name 与 variationNames 的值来自 userConfigs。 */
export function parseOfficialCatalog(collections:unknown,userConfigs:unknown={},aliases:unknown={},source='officialAssets'):ResourceCatalog {
  if(!object(collections)||!object(userConfigs)||!object(aliases))throw new Error('官方资源配置必须是 JSON 对象。');
  const resources:ResourceCatalog['resources']={},rawIds:ResourceCatalog['officialRawIds']={},resourceAliases:ResourceCatalog['aliases']={};
  const tables=new Map<ResourceCategory,Map<string,ResourceRecord>>();
  for(const section of sections){
    const values=collections[section.key]===undefined?{}:collections[section.key];
    if(!object(values))throw new Error(`collections.${section.key} 必须是对象。`);
    const names=aliases[section.key];if(names!==undefined&&!object(names))throw new Error(`aliases.${section.key} 必须是对象。`);
    if(object(names))for(const [target,name]of Object.entries(names)){
      if(typeof name!=='string'||!name.trim())throw new Error(`aliases.${section.key}.${target} 必须是非空名称。`);
      (resourceAliases[section.category]??=[]).push({name:name.trim(),target});
    }
    const configs=section.config?userConfigs[section.config]:undefined;
    if(configs!==undefined&&!object(configs))throw new Error(`userConfigs.${section.config} 必须是对象。`);
    let table=tables.get(section.category);if(!table){table=new Map();tables.set(section.category,table);}
    for(const [rawId,bundle]of Object.entries(values)){
      if(typeof bundle!=='string')throw new Error(`collections.${section.key}.${rawId} 必须是资源包路径。`);
      (rawIds[section.category]??=[]).push(rawId);
    }
    // 名称以 userConfigs 为准；清单只决定原始 ID 声明是否确实有资源包。
    for(const rawId of new Set([...Object.keys(values),...Object.keys(object(configs)?configs:{})])){
      const config=object(configs)?configs[rawId]:undefined;
      if(config!==undefined&&!object(config))throw new Error(`userConfigs 中 ${rawId} 的配置无效。`);
      const configuredName=object(config)&&typeof config.name==='string'?config.name.trim():'';
      const variations=object(config)?config.variationNames:undefined;
      if(variations!==undefined&&(!object(variations)||Object.values(variations).some(v=>typeof v!=='string'||!v.trim())))throw new Error(`${rawId}.variationNames 必须是差分编号到非空名称的映射。`);
      const variants=object(variations)?[...new Set(Object.values(variations) as string[])]:undefined;
      const assetAlias=object(names)&&typeof names[rawId]==='string'?(names[rawId] as string).trim():'';
      const metadata:Omit<ResourceRecord,'name'>={rawId,configuredName:configuredName||undefined,variants,variantsCollected:!!configuredName&&object(variations)};
      // 原始 ID 仍可引用；建议和校验使用同一个原始身份，避免剧本别名掩盖缺失资料。
      for(const name of new Set([rawId,configuredName,assetAlias].filter(Boolean)))table.set(name,{name,...metadata});
    }
  }
  for(const [category,table]of tables)resources[category]=[...table.values()];
  return {source,resources,aliases:resourceAliases,official:true,officialRawIds:rawIds};
}

/** override 按分类下的资源 ID 覆盖；空分类保留原有条目。 */
function mergeOverrides(base:unknown,override:unknown):JsonObject {
  if(!object(base)||!object(override))throw new Error('资源配置及 override 必须是 JSON 对象。');
  const result:JsonObject={...base};
  for(const [section,entries]of Object.entries(override)){
    if(!object(entries)||(result[section]!==undefined&&!object(result[section])))throw new Error(`配置分类 ${section} 必须是对象。`);
    result[section]={...(result[section] as JsonObject??{}),...entries};
  }
  return result;
}

export async function loadOfficialCatalog(root:string,directory:string|undefined,io:FileAccess=diskAccess,explicit=false):Promise<ResourceCatalog[]> {
  const collectionFile=directory?path.join(directory,'officialAssets_collections.json'):undefined;
  let source=collectionFile??path.join(root,'Configs');
  try{
    const hasCollections=!!collectionFile&&await io.exists(collectionFile);
    if(!hasCollections&&explicit)throw new Error(`找不到官方资源清单：${collectionFile}`);
    const read=async(file:string):Promise<unknown>=>{
      source=file;
      try{return JSON.parse((await io.readText(file)).replace(/^\uFEFF/,''));}
      catch(error){throw new Error(`${file}：${error instanceof Error?error.message:String(error)}`);}
    };
    let hasConfig=false;
    const preferred=async(name:string):Promise<unknown>=>{
      const local=path.join(root,'Configs',name),global=directory?path.join(directory,name):undefined;
      if(await io.exists(local)){hasConfig=true;return read(local);}
      if(global&&await io.exists(global)){hasConfig=true;return read(global);}
      return {};
    };
    const overridden=async(name:string,base:unknown):Promise<unknown>=>{
      const file=path.join(root,'Configs',name);
      if(!await io.exists(file))return base;
      hasConfig=true;return mergeOverrides(base,await read(file));
    };
    const collections=hasCollections?await read(collectionFile!):{};
    const userConfigs=await overridden('override_userConfigs.json',await preferred('officialAssets_userConfigs.json'));
    const aliases=await overridden('override_aliases.json',await preferred('officialAssets_aliases.json'));
    if(!hasCollections&&!hasConfig)return [];
    const catalog=parseOfficialCatalog(collections,userConfigs,aliases,collectionFile??path.join(root,'Configs'));
    catalog.official=hasCollections;
    return [catalog];
  }catch(error){return [{source,resources:{},official:true,failure:error instanceof Error?error.message:String(error)}];}
}
