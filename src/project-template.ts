import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {NEW_STORY_TEMPLATE} from './story-template';

export const PROJECT_DIRECTORIES=['.vscode','Configs','Rules','Stories','Resources/Background','Resources/Char_Picture','Resources/Char_Spine','Resources/Music','Resources/SoundEffect','Resources/VisualEffect'] as const;
export function projectFolderName(value:string):string {
  const name=value.trim();
  if(!name||name==='.'||name==='..')throw new Error('请输入项目名称。');
  if(/[<>:"/\\|?*\u0000-\u001f]/.test(name)||name.endsWith('.'))throw new Error('项目名称不能包含路径或系统不允许的字符。');
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw new Error('此名称为系统保留名称，请换一个名称。');
  return name;
}
export async function createProject(parent:string,value:string,templateRoot:string):Promise<string> {
  const name=projectFolderName(value),target=path.join(parent,name);
  // Read the bundled files first so an incomplete installation creates no project folder.
  const files=['Rules/BaseRule.json','Rules/AdvanceRule.json'];
  const reads=await Promise.allSettled(files.map(file=>fs.readFile(path.join(templateRoot,file))));
  const contents=reads.map(result=>{if(result.status==='rejected')throw result.reason;return result.value;});
  try{await fs.mkdir(target);}catch(error){
    if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error('同名文件或文件夹已存在，请换一个项目名称。');
    throw error;
  }
  try{
    for(const directory of PROJECT_DIRECTORIES)await fs.mkdir(path.join(target,directory),{recursive:true});
    for(const [i,file] of files.entries())await fs.writeFile(path.join(target,file),contents[i],{flag:'wx'});
    await fs.writeFile(path.join(target,'Stories/main.astoryx'),NEW_STORY_TEMPLATE,{flag:'wx'});
    const settings={'[astoryx]':{'editor.insertSpaces':false,'editor.detectIndentation':false}};
    await fs.writeFile(path.join(target,'.vscode/settings.json'),JSON.stringify(settings,null,2)+'\n',{flag:'wx'});
    for(const directory of PROJECT_DIRECTORIES.filter(dir=>dir==='Configs'||dir.startsWith('Resources/')))await fs.writeFile(path.join(target,directory,'.gitkeep'),'',{flag:'wx'});
    return target;
  }catch(error){throw new Error('项目创建未完成，部分文件保留在 '+target+'：'+(error instanceof Error?error.message:String(error)));}
}
