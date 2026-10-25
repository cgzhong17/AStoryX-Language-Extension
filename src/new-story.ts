import * as vscode from 'vscode';

import {NEW_STORY_TEMPLATE} from './story-template';
export {NEW_STORY_TEMPLATE} from './story-template';

export function storyFileName(value:string):string {
  const name=value.trim();
  if(!name||name==='.'||name==='..'||name.toLowerCase()==='.astoryx')throw new Error('请输入文件名。');
  if(/[<>:"/\\|?*\u0000-\u001f]/.test(name)||name.endsWith('.'))throw new Error('文件名不能包含路径或系统不允许的字符。');
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw new Error('此名称为系统保留名称，请换一个名称。');
  return /\.astoryx$/i.test(name)?name:name+'.astoryx';
}

export async function createStoryFile(uri:vscode.Uri):Promise<vscode.TextDocument> {
  const edit=new vscode.WorkspaceEdit();
  edit.createFile(uri,{overwrite:false,ignoreIfExists:false,contents:Buffer.from(NEW_STORY_TEMPLATE,'utf8')});
  if(!await vscode.workspace.applyEdit(edit))throw new Error('无法创建文件，请确认目录可写且没有同名文件。');
  const document=await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document,{preview:false});
  return document;
}

export async function newStoryFile(resource?:vscode.Uri):Promise<void> {
  try {
    let directory:vscode.Uri|undefined;
    if(resource){
      const stat=await vscode.workspace.fs.stat(resource);
      directory=stat.type&vscode.FileType.Directory?resource:vscode.Uri.joinPath(resource,'..');
    }else{
      const active=vscode.window.activeTextEditor?.document.uri;
      if(active?.scheme==='file')directory=vscode.Uri.joinPath(active,'..');
      else if(vscode.workspace.workspaceFolders?.length===1)directory=vscode.workspace.workspaceFolders[0].uri;
      else if(vscode.workspace.workspaceFolders?.length)directory=(await vscode.window.showWorkspaceFolderPick({placeHolder:'选择新建 AStoryX 文件的工作区'}))?.uri;
      if(vscode.workspace.workspaceFolders?.length&&!directory)return;
    }
    let target:vscode.Uri|undefined;
    if(directory){
      const folder=directory;
      const name=await vscode.window.showInputBox({
        title:'新建 AStoryX 文件',prompt:'输入文件名，自动补上 .astoryx 后缀',value:'新建剧本.astoryx',valueSelection:[0,4],
        async validateInput(value){
          let name:string;
          try{name=storyFileName(value);}catch(error){return (error as Error).message;}
          try{await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder,name));return '同名文件已存在，请换一个名称。';}
          catch(error){return error instanceof vscode.FileSystemError&&error.code==='FileNotFound'?undefined:'无法检查文件，请确认目录可访问。';}
        }
      });
      if(name===undefined)return;
      target=vscode.Uri.joinPath(folder,storyFileName(name));
    }else{
      target=await vscode.window.showSaveDialog({title:'新建 AStoryX 文件',filters:{'AStoryX 剧本':['astoryx']},saveLabel:'新建'});
      if(!target)return;
      if(!/\.astoryx$/i.test(target.path))target=target.with({path:target.path+'.astoryx'});
    }
    await createStoryFile(target);
  }catch(error){void vscode.window.showErrorMessage('AStoryX：'+(error instanceof Error?error.message:String(error)));}
}
