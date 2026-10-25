import {createIssue} from './diagnostic-codes';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Analysis, analyze, Issue, parseRules, RuleSet, ruleDeclaration } from './core';
import { WritingOptions, writingIssues } from './writing-checks';
import { ResourceCategory, ResourceIndex } from './resources';

export interface FileAccess { readText(file: string): Promise<string>; exists(file: string): Promise<boolean> }
export const diskAccess: FileAccess = {
  readText: file => fs.readFile(file,'utf8'),
  async exists(file) { try { await fs.stat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }
};
export interface DocumentResult { root?: string; ruleFile?: string; rules?: RuleSet; analysis?: Analysis; issues: Issue[]; failure?: string; incomplete?:string[]; notes?:string[] }
/** 标准规则明确分支，自定义名称仍按项目中的实际 JSON 加载。 */
export function selectedRuleFile(name:string):string{
  const stem=name.replace(/\.json$/i,'');
  switch(stem.toLowerCase()){
    case 'baserule':return 'BaseRule.json';
    case 'advancerule':return 'AdvanceRule.json';
    default:return /\.json$/i.test(name)?name:name+'.json';
  }
}
export function inside(root: string, file: string): boolean { const relative = path.relative(root,file); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); }

export async function discoverRoot(file: string, folders: string[] = [], configured = '', io = diskAccess): Promise<string | undefined> {
  if (configured) {
    const folder = folders.filter(f=>inside(f,file)).sort((a,b)=>b.length-a.length)[0];
    return path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(folder ?? path.dirname(file),configured);
  }
  let directory = path.dirname(file);
  while (true) {
    if (await io.exists(path.join(directory,'Rules'))) return directory;
    // Loose scripts beside a rule file are useful during language authoring.
    if (await io.exists(path.join(directory,'BaseRule.json'))) return directory;
    const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
  }
  return undefined;
}

export async function loadDocument(file: string, text: string, folders: string[] = [], configured = '', io = diskAccess, options:WritingOptions={}): Promise<DocumentResult> {
  const declaration = ruleDeclaration(text), issues: Issue[] = [];
  const location={line:declaration.line,start:0,end:Math.max(1,text.split(/\r?\n/)[declaration.line]?.length??1)};
  const fail = (diagnostic:Issue): DocumentResult => ({issues:[...issues,diagnostic],failure:diagnostic.message});
  if (!declaration.name) return fail(createIssue('ruleLoad','declaration',location));
  if (/[\\/\u0000]/.test(declaration.name) || declaration.name === '..' || declaration.name === '.') return fail(createIssue('ruleLoad','invalidName',location));
  if (declaration.misplaced) issues.push(createIssue('rulePosition','default',{line:declaration.line,start:0,end:text.split(/\r?\n/)[declaration.line].length}));
  let root:string|undefined;
  try {
    root = await discoverRoot(file,folders,configured,io);
    if (!root || !await io.exists(root)) return fail(createIssue('projectPath','notFound',location));
  }catch(error){return fail(createIssue('projectPath','inaccessible',location,{reason:String(error)}));}
  try {
    const name = selectedRuleFile(declaration.name);
    const candidates = [path.join(root,'Rules',name),path.join(root,name)];
    let ruleFile: string | undefined;
    for (const candidate of candidates) if (await io.exists(candidate)) {ruleFile=candidate;break;}
    if (!ruleFile) return {...fail(createIssue('ruleLoad','missing',location,{name})),root};
    const rules = parseRules(await io.readText(ruleFile)), analysis = analyze(text,rules);
    const version = text.split(/\r?\n/).find(s=>/^#version\s*:/i.test(s));
    if (version && version.replace(/^#version\s*:/i,'').trim() !== '2') analysis.incomplete.push('当前仅按 AStoryX version 2 的资料检查，其他版本尚未核实。');
    const writing=writingIssues(analysis,options);
    return {root,ruleFile,rules,analysis,issues:[...issues,...analysis.issues,...writing],notes:options.maxLineLength===null?['字数检查未启用。']:[]};
  } catch (error) { return {...fail(createIssue('ruleLoad','failed',location,{reason:error instanceof Error?error.message:String(error)})),root}; }
}

export async function storyFiles(root: string, maxFiles: number, cancelled: () => boolean = () => false): Promise<{files:string[];truncated:boolean}> {
  const directory = path.join(root,'Stories'), files: string[] = [];
  if (!await diskAccess.exists(directory)) throw new Error(`找不到 Stories 目录：${directory}`);
  let truncated = false;
  async function walk(folder: string): Promise<void> {
    for (const entry of await fs.readdir(folder,{withFileTypes:true})) {
      if (cancelled() || truncated) return;
      const file = path.join(folder,entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && /\.astoryx$/i.test(entry.name)) {
        if (files.length === maxFiles) {truncated=true;return;} files.push(file);
      }
    }
  }
  await walk(directory); return {files:files.sort(),truncated};
}

export async function resourceNames(root: string, category: string, character?: string): Promise<string[]> {
  if(!['Background','Char_Picture','Music','SoundEffect','VisualEffect'].includes(category))return [];
  return new ResourceIndex(root).names(category as ResourceCategory,character);
}
