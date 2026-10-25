import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const extension=path.join(repo,'extension');
const result=spawnSync(process.execPath,[path.join(extension,'node_modules/typescript/bin/tsc'),'-p',path.join(repo,'config/tsconfig.json')],{cwd:repo,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
for(const directory of ['test/tmp','log/results','log/host','dist','extension/docs'])await fs.mkdir(path.join(repo,directory),{recursive:true});
await fs.copyFile(path.join(repo,'README.md'),path.join(extension,'README.md'));
await fs.copyFile(path.join(repo,'LICENSE'),path.join(extension,'LICENSE'));
await fs.copyFile(path.join(repo,'docs/ERROR_MESSAGES.md'),path.join(extension,'docs/ERROR_MESSAGES.md'));
await fs.copyFile(path.join(repo,'CHANGELOG.md'),path.join(extension,'CHANGELOG.md'));
