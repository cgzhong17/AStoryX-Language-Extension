import * as fs from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),extension=path.join(repo,'extension');
const suites={diagnostics:['live-diagnostics','diagnostics-result'],highlighting:['live-highlighting','live-result'],official:['live-official','official-result'],'new-file':['live-new-file','new-file-result'],'project-tab':['live-project-tab','project-tab-result'],smoke:['smoke','smoke-result']};
const suite=process.argv[2]??'diagnostics';
if(!Object.hasOwn(suites,suite))throw new Error('未知宿主测试组：'+suite);
const flag=process.argv.indexOf('--vscode');
const executable=flag>=0?process.argv[flag+1]:process.env.VSCODE_EXECUTABLE;
if(!executable)throw new Error('请通过 --vscode 指定 Code.exe 路径，或设置 VSCODE_EXECUTABLE。');
await fs.access(executable);
const [moduleName,resultName]=suites[suite];
const resultFile=path.join(repo,'log/results',resultName+'.json');
for(const directory of ['log/host','log/results','test/extensions','test/tmp'])await fs.mkdir(path.join(repo,directory),{recursive:true});
let workspace=path.join(repo,suite==='smoke'?'examples/demo':'test/fixtures/language-demo');
let temporaryProject,settingsFile,previousSettings;
if(suite==='project-tab'){
  const {createProject}=await import('../extension/out/src/project-template.js');
  temporaryProject=await fs.mkdtemp(path.join(repo,'test/tmp/.test-project-tab-'));
  workspace=await createProject(temporaryProject,'TabProject',path.join(extension,'templates/project'));
  settingsFile=path.join(repo,'test/profiles/project-tab/User/settings.json');
  try{previousSettings=await fs.readFile(settingsFile);}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.mkdir(path.dirname(settingsFile),{recursive:true});
  await fs.writeFile(settingsFile,JSON.stringify({'[astoryx]':{'editor.insertSpaces':true,'editor.detectIndentation':true}},null,2));
}
const args=['--new-window','--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes',
  '--user-data-dir='+path.join(repo,'test/profiles',suite),'--extensions-dir='+path.join(repo,'test/extensions'),
  '--extensionDevelopmentPath='+extension,'--extensionTestsPath='+path.join(extension,'out/test',moduleName+'.js'),workspace];
await fs.writeFile(resultFile,JSON.stringify({passed:false,status:'running'},null,2));
const stdout=openSync(path.join(repo,'log/host',suite+'-stdout.log'),'w');
const stderr=openSync(path.join(repo,'log/host',suite+'-stderr.log'),'w');
let code;
try{
  code=await new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd:repo,windowsHide:true,stdio:['ignore',stdout,stderr]});
    child.once('error',reject);child.once('exit',value=>resolve(value));
  });
}finally{
  closeSync(stdout);closeSync(stderr);
  if(settingsFile){if(previousSettings)await fs.writeFile(settingsFile,previousSettings);else await fs.unlink(settingsFile);}
  if(temporaryProject){
    const resolved=await fs.realpath(temporaryProject),tempRoot=await fs.realpath(path.join(repo,'test/tmp'));
    if(!resolved.toLowerCase().startsWith((tempRoot+path.sep+'.test-project-tab-').toLowerCase()))throw new Error('Unsafe temporary project cleanup path');
    await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
const result=JSON.parse(await fs.readFile(resultFile,'utf8'));
console.log(JSON.stringify({suite,...result},null,2));
if(code!==0||result.passed!==true)process.exitCode=1;
