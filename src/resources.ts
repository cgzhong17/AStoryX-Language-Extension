import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {Dirent} from 'node:fs';
import {Analysis, Issue, parameterInfo, splitTopLevel,requiredParts} from './core';
import {createIssue} from './diagnostic-codes';
import {AliasTable,aliasTable,resolveAliasDetails} from './writing-checks';

export type ResourceCategory='Background'|'Char_Picture'|'Music'|'SoundEffect'|'VisualEffect';
export interface ResourceRecord {name:string;variants?:string[];rawId?:string;configuredName?:string;variantsCollected?:boolean}
/** Normalized adapter output; no assumptions about a future third-party JSON schema. */
export interface ResourceCatalog {
  source:string;
  resources:Partial<Record<ResourceCategory,ResourceRecord[]>>;
  failure?:string;
  official?:boolean;
  officialRawIds?:Partial<Record<ResourceCategory,string[]>>;
}
export interface ResourceAccess {
  readDirectory(directory:string):Promise<Dirent[]>;
  readText(file:string):Promise<string>;
}
const disk:ResourceAccess={readDirectory:directory=>fs.readdir(directory,{withFileTypes:true}),readText:file=>fs.readFile(file,'utf8')};
const image=/\.(png|jpe?g|webp)$/i,audio=/\.(ogg|mp3|wav|flac)$/i;
const formats:Record<Exclude<ResourceCategory,'Char_Picture'>,RegExp>={Background:image,Music:audio,SoundEffect:audio,VisualEffect:/\.(png|jpe?g|webp|prefab|asset)$/i};
interface CategoryIndex {records:Map<string,ResourceRecord>;failures:{source:string;message:string}[]}

/** One category scan per index; the extension invalidates indexes on resource changes. */
export class ResourceIndex {
  private readonly categories=new Map<ResourceCategory,Promise<CategoryIndex>>();
  private readonly configured=new Map<string,ResourceRecord>();
  constructor(readonly root:string,readonly catalogs:ResourceCatalog[]=[],private readonly access:ResourceAccess=disk){
    const records=catalogs.filter(c=>c.official&&!c.failure).flatMap(c=>c.resources.Char_Picture??[]).filter(r=>r.configuredName);
    for(const record of records)if(record.rawId)this.configured.set(record.rawId,record);
    for(const record of records)this.configured.set(record.configuredName!,record);
  }
  configuredCharacter(name:string):ResourceRecord|undefined {
    return this.configured.get(name);
  }
  configuredNames():ReadonlySet<string>{
    return new Set(this.configured.keys());
  }
  resolveCharacter(table:AliasTable,name:string,line:number){
    const resolved=resolveAliasDetails(table,name,line,candidate=>!!this.configuredCharacter(candidate));
    return {...resolved,record:this.configuredCharacter(resolved.name)};
  }
  private async entries(directory:string):Promise<Dirent[]>{
    try{return await this.access.readDirectory(directory);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  }
  private load(category:ResourceCategory):Promise<CategoryIndex>{
    let pending=this.categories.get(category);
    if(!pending){pending=this.scan(category);this.categories.set(category,pending);}
    return pending;
  }
  private async scan(category:ResourceCategory):Promise<CategoryIndex>{
    const records=new Map<string,ResourceRecord>(),failures:CategoryIndex['failures']=[];
    const directory=path.join(this.root,'Resources',category);
    try{
      const entries=await this.entries(directory);
      if(category!=='Char_Picture'){
        for(const entry of entries)if(entry.isFile()&&formats[category].test(entry.name)){
          const name=path.parse(entry.name).name;records.set(name,{name});
        }
      }else{
        for(const entry of entries.filter(e=>e.isDirectory())){
          const folder=path.join(directory,entry.name);
          try{
            const files=await this.entries(folder),configuration=files.find(e=>e.isFile()&&e.name===entry.name+'_config.json');
            const images=files.filter(e=>e.isFile()&&image.test(e.name));
            if(configuration){
              const raw:unknown=JSON.parse((await this.access.readText(path.join(folder,configuration.name))).replace(/^\uFEFF/,''));
              if(!raw||typeof raw!=='object'||!('variations'in raw)||!raw.variations||typeof raw.variations!=='object'||Array.isArray(raw.variations))throw new Error('角色配置缺少有效 variations 对象。');
              const variants=Object.keys(raw.variations);
              if(variants.length)records.set(entry.name,{name:entry.name,variants});
            }else if(images.length)records.set(entry.name,{name:entry.name,variants:images.map(e=>path.parse(e.name).name)});
          }catch(error){failures.push({source:folder,message:String(error)});}
        }
        const spine=path.join(this.root,'Resources','Char_Spine');
        for(const entry of (await this.entries(spine)).filter(e=>e.isDirectory())){
          const folder=path.join(spine,entry.name);
          try{
            const files=await this.entries(folder);
            let valid=files.some(e=>e.isFile()&&/\.skel$/i.test(e.name));
            if(!valid)for(const file of files.filter(e=>e.isFile()&&/\.json$/i.test(e.name))){
              const raw=JSON.parse((await this.access.readText(path.join(folder,file.name))).replace(/^\uFEFF/,''));
              if(raw&&typeof raw==='object'&&('skeleton'in raw||Array.isArray(raw.bones))){valid=true;break;}
            }
            if(valid&&!records.has(entry.name))records.set(entry.name,{name:entry.name});
          }catch(error){failures.push({source:folder,message:String(error)});}
        }
      }
    }catch(error){failures.push({source:directory,message:String(error)});}
    return {records,failures};
  }
  async names(category:ResourceCategory,character?:string):Promise<string[]>{
    const local=await this.load(category);
    if(character){
      const configured=this.configuredCharacter(character);
      if(category==='Char_Picture'&&configured)return [...new Set(configured.variants??[])].sort();
      const values=[...(local.records.get(character)?.variants??[])];
      for(const catalog of this.catalogs)if(!catalog.failure)values.push(...(catalog.resources[category]?.find(r=>r.name===character)?.variants??[]));
      return [...new Set(values)].sort();
    }
    const values=[...local.records.keys()];
    for(const catalog of this.catalogs)if(!catalog.failure)values.push(...(catalog.resources[category]??[]).map(r=>r.name));
    return [...new Set(values)].sort();
  }
  async check(analysis:Analysis):Promise<{issues:Issue[];incomplete:string[]}>{
    const issues:Issue[]=[],incomplete=new Set<string>(),table=aliasTable(analysis),reported=new Set<string>();
    const official=this.catalogs.filter(c=>c.official),validOfficial=official.filter(c=>!c.failure);
    const badAliases=new Set<string>();
    const rawIdPattern=/^(?:avg_|dyn_|sp_dyn_)/i;
    for(const entry of table.entries){
      if(/\$[([]/.test(entry.target)){incomplete.add('动态别名来源未验证。');continue;}
      if(!official.length){if(rawIdPattern.test(entry.target))incomplete.add('官方清单未加载，原始 ID 别名来源未验证。');continue;}
      if(official.some(c=>c.failure))continue;
      const resolution=this.resolveCharacter(table,entry.target,entry.availableAfter+1);
      if(resolution.cycle){
        badAliases.add(entry.line+':'+entry.target);
        const key='alias:'+entry.line+':'+entry.targetStart;
        if(!reported.has(key)){reported.add(key);issues.push(createIssue('alias','cycle',{line:entry.line,start:entry.targetStart,end:entry.targetEnd}));}
        continue;
      }
      let exists=validOfficial.some(c=>Object.values(c.officialRawIds??{}).some(ids=>ids?.includes(entry.target)));
      if(!exists&&!rawIdPattern.test(entry.target)){
        exists=!!resolution.record||validOfficial.some(c=>Object.values(c.resources).some(records=>records?.some(r=>r.name===resolution.name)));
        if(!exists){
          const local=await Promise.all((['Background','Char_Picture','Music','SoundEffect','VisualEffect'] as ResourceCategory[]).map(category=>this.load(category)));
          exists=local.some(index=>index.records.has(resolution.name));
          if(!exists&&local.some(index=>index.failures.length)){
            for(const failure of local.flatMap(index=>index.failures)){
              const key='local:'+failure.source;
              if(!reported.has(key)){reported.add(key);issues.push(createIssue('resourceIndex','default',{line:entry.line,start:entry.targetStart,end:entry.targetEnd},{source:failure.source,reason:failure.message}));}
            }
            incomplete.add('本地资源索引未完成。');continue;
          }
        }
      }
      if(!exists){
        badAliases.add(entry.line+':'+entry.target);
        const key='alias:'+entry.line+':'+entry.targetStart;
        if(!reported.has(key)){reported.add(key);issues.push(createIssue('resourceMissing',rawIdPattern.test(entry.target)?'rawAliasSource':'aliasSource',{line:entry.line,start:entry.targetStart,end:entry.targetEnd},{name:entry.target}));}
      }
    }
    for(const catalog of official.filter(c=>c.failure)){
      reported.add(catalog.source);issues.push(createIssue('catalogLoad','default',{line:1,start:0,end:Math.max(1,analysis.lines[1]?.length??1)},{source:catalog.source,reason:String(catalog.failure)}));incomplete.add('官方资源清单未完成。');
    }
    let macroDepth=0;
    const deferred=new Set<number>();
    analysis.lines.forEach((value,line)=>{if(/^#block\b/i.test(value))macroDepth++;if(macroDepth)deferred.add(line);if(/^#endblock\b/i.test(value))macroDepth=Math.max(0,macroDepth-1);});
    for(const [line,parsed]of analysis.parsed){
      const required=parsed.segments[0],category=parameterInfo(parsed.rule.id,required.name)?.resource as ResourceCategory|undefined;
      if(!category||deferred.has(line))continue;
      const local=await this.load(category);
      for(const failure of local.failures){
        const key='local:'+failure.source;
        if(!reported.has(key)){reported.add(key);issues.push(createIssue('resourceIndex','default',{line,start:required.start,end:Math.max(required.start+1,required.end)},{source:failure.source,reason:failure.message}));}
        incomplete.add('本地资源索引未完成。');
      }
      for(const catalog of this.catalogs.filter(c=>c.failure)){
        if(!reported.has(catalog.source)){reported.add(catalog.source);issues.push(createIssue('catalogLoad','default',{line,start:required.start,end:Math.max(required.start+1,required.end)},{source:catalog.source,reason:String(catalog.failure)}));}
        incomplete.add('第三方资源清单未完成。');
      }
      const parts=parsed.rule.id==='Background'?splitTopLevel(required.value,parsed.rule.requiredParametersSeparator):[{value:required.value,start:0,end:required.value.length}];
      for(const part of parts){
        const resource=category==='Char_Picture'?requiredParts(parsed)[0]:{value:part.value,start:0,end:part.value.length};
        const raw=resource.value.trim();if(!raw)continue;
        const clearAllowed=['Background','Music','SoundEffect','Character','Interlude'].includes(parsed.rule.id);
        if(clearAllowed&&/^(无|none)$/i.test(raw))continue;
        if(/\$[([]/.test(raw)){incomplete.add('动态资源名未验证。');continue;}
        const literal=raw.startsWith('&{')&&raw.endsWith('}')?raw.slice(2,-1):raw;
        const resolution=category==='Char_Picture'?this.resolveCharacter(table,literal,line):resolveAliasDetails(table,literal,line);
        if(resolution.chain.some(declaration=>badAliases.has(declaration.line+':'+declaration.target)))continue;
        const name=resolution.name,configured=category==='Char_Picture'?this.configuredCharacter(name):undefined;
        if(resolution.cycle){const start=required.start+part.start+resource.start+resource.value.search(/\S/u);issues.push(createIssue('alias','cycle',{line,start,end:start+raw.length}));continue;}
        const found=!!configured||local.records.has(name)||this.catalogs.some(c=>!c.failure&&c.resources[category]?.some(r=>r.name===name));
        if(category==='Char_Picture'&&found&&(!!configured||!local.records.has(name))&&!official.some(c=>c.failure)){
          const record=configured??validOfficial.flatMap(c=>c.resources.Char_Picture??[]).find(r=>r.name===name);
          if(record){
            const start=required.start+part.start+resource.start+resource.value.search(/\S/u);
            if(!record.variantsCollected){
              issues.push(createIssue('rawCharacterIncomplete','default',{line,start,end:start+raw.length},{rawId:String(record.rawId)}));
            }else{
              const parts=requiredParts(parsed),variant=parts[1];
              if(variant){
                const value=variant.value.trim(),literalVariant=value.startsWith('&{')&&value.endsWith('}')?value.slice(2,-1):value;
                if(value&&!/\$[([]/.test(value)&&!record.variants?.includes(literalVariant)){
                  const variantStart=required.start+part.start+variant.start+variant.value.search(/\S/u);
                  issues.push(createIssue('variantUnknown','default',{line,start:variantStart,end:variantStart+value.length},{variant:literalVariant,character:String(record.configuredName)}));
                }else if(/\$[([]/.test(value))incomplete.add('动态角色差分未验证。');
              }
            }
          }
        }
        if(!found&&table.incomplete){incomplete.add('别名配置无效，相关资源名未验证。');continue;}
        if(!found&&analysis.incomplete.some(reason=>reason.includes('置换文块'))){incomplete.add('置换文块可能影响资源别名，相关引用未验证。');continue;}
        if(!found&&!local.failures.length&&!this.catalogs.some(c=>c.failure)){
          const start=required.start+part.start+resource.start+resource.value.search(/\S/u);
          const searched=category==='Char_Picture'?'Resources/Char_Picture、Resources/Char_Spine':`Resources/${category}`;
          const external=this.catalogs.length?`第三方清单：${this.catalogs.map(c=>c.source).join('、')}`:'第三方清单未配置';
          issues.push(createIssue('resourceMissing','reference',{line,start,end:start+raw.length},{category,name:literal,searched,external}));
        }
      }
    }
    return {issues,incomplete:[...incomplete]};
  }
}
