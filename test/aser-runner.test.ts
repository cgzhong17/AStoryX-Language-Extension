import {strict as assert} from 'node:assert';
import {test,mock} from 'node:test';
import {EventEmitter} from 'node:events';
import childProcess = require('node:child_process');
import net = require('node:net');
import * as path from 'node:path';
import {ASERPlayback,ASERRunner,ASER_PIPE} from '../src/aser-runner';

for(const state of ['Done','Skipped'])test('ASER '+state+' waits for project opening before playing exactly once',()=>{
  const sent:string[]=[],exited:number[]=[];
  const playback=new ASERPlayback('官方演示',command=>sent.push(command),()=>exited.push(1));
  playback.receive('OfficialBundleManagerInitializ');
  assert.deepEqual(sent,[]);
  playback.receive('ation:'+state+'\r\n');
  assert.deepEqual(sent,['switch storyset']);
  playback.receive('StorySetOpened:D:/项目\r\nStoryStarted:官方演示\r\nStorySetOpened:D:/项目\r\n');
  assert.deepEqual(sent,['switch storyset','play 官方演示']);
  playback.receive('StoryExited:官方演示\r\n');assert.equal(exited.length,1);
});
test('a project already opened before initialization can play immediately',()=>{
  const sent:string[]=[],playback=new ASERPlayback('demo',command=>sent.push(command),()=>{});
  playback.receive('StorySetOpened:project\r\n');assert.deepEqual(sent,[]);
  playback.receive('OfficialBundleManagerInitialization:Done\r\n');
  assert.deepEqual(sent,['play demo']);
});

class FakeProcess extends EventEmitter {
  exitCode:number|null=null;
  killed=false;
  kill(){this.killed=true;this.exitCode=0;this.emit('close',0);return true;}
}
class FakeSocket extends EventEmitter {
  sent:string[]=[];
  destroyed=false;
  setEncoding(){return this;}
  write(data:string){this.sent.push(data);return true;}
  destroy(){this.destroyed=true;return this;}
}
test('runner launches with one JSON argument, connects the YSS pipe and stops on story exit',async()=>{
  const child=new FakeProcess(),socket=new FakeSocket(),states:boolean[]=[],failures:Error[]=[],calls:unknown[][]=[];
  const spawnMock=mock.method(childProcess,'spawn',((...args:unknown[])=>{calls.push(args);return child;}) as unknown as typeof childProcess.spawn);
  const pipeMock=mock.method(net,'createConnection',((...args:unknown[])=>{calls.push(args);return socket;}) as unknown as typeof net.createConnection);
  const runner=new ASERRunner(value=>states.push(value),error=>failures.push(error));
  const executable=path.resolve('ASER 程序/ASE-Remake.exe'),root=path.resolve('项目目录'),file=path.join(root,'Stories/官方 演示.astoryx');
  try{
    await runner.start(executable,root,file,5);child.emit('spawn');socket.emit('connect');
    assert.equal(calls[0][0],executable);
    assert.deepEqual(calls[0][1],[JSON.stringify({storySetPath:root,SizeMode:5})]);
    assert.deepEqual(calls[0][2],{cwd:path.dirname(executable),shell:false,stdio:'ignore'});
    assert.deepEqual(calls[1],[ASER_PIPE]);assert.equal(ASER_PIPE,String.raw`\\.\pipe\ASERDebugPipe`);
    socket.emit('data','OfficialBundleManagerInitialization:Done\r\nStorySetOpened:项目\r\n');
    assert.deepEqual(socket.sent,['switch storyset\r\n','play 官方 演示\r\n']);
    socket.emit('data','StoryExited:官方 演示\r\n');
    assert.equal(child.killed,true);assert.equal(socket.destroyed,true);assert.deepEqual(states,[true,false]);assert.deepEqual(failures,[]);
  }finally{await runner.stop();spawnMock.mock.restore();pipeMock.mock.restore();}
});
test('runner retries the pipe while ASER starts and closes the previous process on restart',async()=>{
  const first=new FakeProcess(),second=new FakeProcess(),sockets:FakeSocket[]=[],order:string[]=[];
  const spawnMock=mock.method(childProcess,'spawn',(()=>{order.push('spawn');return order.length===1?first:second;}) as unknown as typeof childProcess.spawn);
  const pipeMock=mock.method(net,'createConnection',(()=>{const socket=new FakeSocket();sockets.push(socket);return socket;}) as unknown as typeof net.createConnection);
  const runner=new ASERRunner(()=>{},()=>{});
  try{
    await runner.start('ASER.exe','project','story.astoryx',0);first.emit('spawn');
    sockets[0].emit('error',new Error('not ready'));
    await new Promise(resolve=>setTimeout(resolve,230));
    assert.equal(sockets.length,2);sockets[1].emit('connect');
    await runner.start('ASER.exe','project','next.astoryx',0);
    assert.equal(first.killed,true);assert.equal(sockets[1].destroyed,true);
    second.emit('spawn');sockets[2].emit('connect');await runner.stop();assert.equal(second.killed,true);
  }finally{await runner.stop();spawnMock.mock.restore();pipeMock.mock.restore();}
});
test('process launch errors release the session and are reported once',async()=>{
  const child=new FakeProcess(),errors:Error[]=[],states:boolean[]=[];
  const spawnMock=mock.method(childProcess,'spawn',(()=>child) as unknown as typeof childProcess.spawn);
  const runner=new ASERRunner(value=>states.push(value),error=>errors.push(error));
  try{
    await runner.start('missing.exe','project','story.astoryx',5);
    const error=new Error('spawn ENOENT');child.emit('error',error);child.emit('close',-1);
    assert.deepEqual(errors,[error]);assert.deepEqual(states,[false]);
  }finally{await runner.stop();spawnMock.mock.restore();}
});
