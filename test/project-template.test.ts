import {PACKAGE_ROOT,TEMP_ROOT} from './paths';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {createProject,projectFolderName,PROJECT_DIRECTORIES} from '../src/project-template';
import {loadDocument} from '../src/project';

const templates=path.join(PACKAGE_ROOT,'templates/project');
async function sandbox(run:(parent:string)=>Promise<void>){
  const parent=await fs.mkdtemp(path.join(TEMP_ROOT,'.test-project-template-'));
  try{await run(parent);}finally{
    assert.ok(path.resolve(parent).startsWith(TEMP_ROOT+path.sep+'.test-project-template-'));
    await fs.rm(parent,{recursive:true,force:true});
  }
}
test('new projects contain the standard empty resource structure and usable rules',async()=>sandbox(async parent=>{
  const root=await createProject(parent,'我的剧情',templates);
  for(const directory of PROJECT_DIRECTORIES)assert.ok((await fs.stat(path.join(root,directory))).isDirectory(),directory);
  for(const category of ['Background','Char_Picture','Char_Spine','Music','SoundEffect','VisualEffect'])assert.deepEqual(await fs.readdir(path.join(root,'Resources',category)),['.gitkeep']);
  const script=path.join(root,'Stories/main.astoryx'),text=await fs.readFile(script,'utf8');
  assert.equal(text,'由VSCode Extension编辑\n#useRule:BaseRule\n#version:2\n\n#aliases\n#endaliases\n');
  for(const rule of ['BaseRule','AdvanceRule']){
    const loaded=await loadDocument(script,text.replace('BaseRule',rule),[root]);
    assert.equal(loaded.ruleFile,path.join(root,'Rules',rule+'.json'));assert.deepEqual(loaded.issues,[]);
  }
  assert.deepEqual((await fs.readdir(root)).sort(),['.vscode','Configs','Resources','Rules','Stories']);
  const settings=JSON.parse(await fs.readFile(path.join(root,'.vscode/settings.json'),'utf8'));
  assert.deepEqual(settings,{'[astoryx]':{'editor.insertSpaces':false,'editor.detectIndentation':false}});
}));
test('an existing project folder or file is never overwritten, including empty folders',async()=>sandbox(async parent=>{
  for(const name of ['已存在','空目录'])await fs.mkdir(path.join(parent,name));
  await fs.writeFile(path.join(parent,'已存在','keep.txt'),'保持原样');await fs.writeFile(path.join(parent,'同名文件'),'保持原样');
  for(const name of ['已存在','空目录','同名文件'])await assert.rejects(createProject(parent,name,templates),/同名文件或文件夹已存在/);
  assert.equal(await fs.readFile(path.join(parent,'已存在','keep.txt'),'utf8'),'保持原样');
  assert.deepEqual(await fs.readdir(path.join(parent,'空目录')),[]);assert.equal(await fs.readFile(path.join(parent,'同名文件'),'utf8'),'保持原样');
}));
test('project names cannot escape the chosen parent or use invalid system names',async()=>sandbox(async parent=>{
  assert.equal(projectFolderName(' 中文项目 '),'中文项目');
  for(const name of ['', '..','../逃逸','a/b','a\\b','con','NUL.txt','末尾.','a:'])await assert.rejects(createProject(parent,name,templates));
  assert.deepEqual(await fs.readdir(parent),[]);
}));
test('missing bundled template files fail before a project directory is created',async()=>sandbox(async parent=>{
  await assert.rejects(createProject(parent,'不完整模板',path.join(parent,'missing')));
  assert.deepEqual(await fs.readdir(parent),[]);
}));
