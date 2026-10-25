import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),extension=path.join(repo,'extension');
const manifest=JSON.parse(await fs.readFile(path.join(extension,'package.json'),'utf8'));
await fs.mkdir(path.join(repo,'dist'),{recursive:true});
const vsix=path.join(repo,'dist',manifest.name+'-'+manifest.version+'.vsix');
const result=spawnSync(process.execPath,[path.join(extension,'node_modules/@vscode/vsce/vsce'),'package','--no-dependencies','--allow-missing-repository','--out',vsix],{cwd:extension,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
