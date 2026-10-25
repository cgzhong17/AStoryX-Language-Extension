import * as path from 'node:path';
import {existsSync,readFileSync} from 'node:fs';

export const REPO_ROOT=path.resolve(__dirname,'../../..');
export const PACKAGE_ROOT=path.join(REPO_ROOT,'extension');
export const TEMP_ROOT=path.join(REPO_ROOT,'test/tmp');
export const RESULT_ROOT=path.join(REPO_ROOT,'log/results');
const manifest=JSON.parse(readFileSync(path.join(PACKAGE_ROOT,'package.json'),'utf8'));
export const EXTENSION_ID=manifest.publisher+'.'+manifest.name;
export function sampleDirectory(start:string):string{
  let directory=start;
  while(true){
    if(existsSync(path.join(directory,'Sample（ASER基础示例剧本集）','Sample')))return directory;
    const parent=path.dirname(directory);if(parent===directory)return start;directory=parent;
  }
}
