import * as vscode from 'vscode';
import * as path from 'node:path';
import {createProject,projectFolderName} from './project-template';

export async function newProject(templateRoot:string,resource?:vscode.Uri):Promise<void> {
  try{
    let parent:vscode.Uri|undefined;
    if(resource){
      const stat=await vscode.workspace.fs.stat(resource);
      parent=stat.type&vscode.FileType.Directory?resource:vscode.Uri.joinPath(resource,'..');
    }else{
      parent=(await vscode.window.showOpenDialog({title:'选择新项目的存放目录',canSelectFolders:true,canSelectFiles:false,canSelectMany:false,openLabel:'选择目录',defaultUri:vscode.workspace.workspaceFolders?.[0]?.uri}))?.[0];
    }
    if(!parent)return;
    if(parent.scheme!=='file')throw new Error('请在本地文件系统中创建项目。');
    const folder=parent;
    const name=await vscode.window.showInputBox({title:'新建 AStoryX 项目',prompt:'输入项目名称，将在所选目录中新建同名文件夹',value:'新建项目',valueSelection:[0,4],
      async validateInput(value){
        let name:string;
        try{name=projectFolderName(value);}catch(error){return (error as Error).message;}
        try{await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder,name));return '同名文件或文件夹已存在，请换一个项目名称。';}
        catch(error){return error instanceof vscode.FileSystemError&&error.code==='FileNotFound'?undefined:'无法检查目录，请确认目录可访问。';}
      }
    });
    if(name===undefined)return;
    const project=await createProject(parent.fsPath,name,templateRoot),uri=vscode.Uri.file(project);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(uri,'Stories','main.astoryx')),{preview:false});
    void vscode.window.showInformationMessage('AStoryX 项目已创建：'+path.basename(project),'在新窗口打开项目').then(action=>{
      if(action)void vscode.commands.executeCommand('vscode.openFolder',uri,{forceNewWindow:true});
    });
  }catch(error){void vscode.window.showErrorMessage('AStoryX：'+(error instanceof Error?error.message:String(error)));}
}
