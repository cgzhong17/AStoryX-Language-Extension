import {spawn,ChildProcess} from 'node:child_process';
import {createConnection,Socket} from 'node:net';
import * as path from 'node:path';

export const ASER_PIPE='\\\\.\\pipe\\ASERDebugPipe';

/** 按 YSS 的初始化、项目打开、播放顺序发送管道命令。 */
export class ASERPlayback {
  private buffer='';
  private initialized=false;
  private projectOpened=false;
  private requested=false;
  constructor(private readonly story:string,private readonly send:(command:string)=>void,private readonly exited:()=>void){}
  receive(data:string):void {
    this.buffer+=data;
    let end:number;
    while((end=this.buffer.indexOf('\r\n'))>=0){
      const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+2);
      if(/^OfficialBundleManagerInitialization:(Done|Skipped)$/.test(line)){
        this.initialized=true;
        if(!this.projectOpened)this.send('switch storyset');
      }else if(line.startsWith('StorySetOpened:'))this.projectOpened=true;
      else if(line.startsWith('StoryExited:'))this.exited();
      if(this.initialized&&this.projectOpened&&!this.requested){
        this.requested=true;this.send('play '+this.story);
      }
    }
  }
}

export class ASERRunner {
  private process?:ChildProcess;
  private socket?:Socket;
  private retry?:ReturnType<typeof setInterval>;
  constructor(private readonly running:(value:boolean)=>void,private readonly failed:(error:Error)=>void){}
  async start(executable:string,project:string,file:string,sizeMode:number):Promise<void>{
    await this.stop();
    const child=spawn(executable,[JSON.stringify({storySetPath:project,SizeMode:sizeMode})],{
      cwd:path.dirname(executable),shell:false,stdio:'ignore'
    });
    this.process=child;
    const playback=new ASERPlayback(path.basename(file).replace(/\.astoryx$/i,''),command=>{
      this.socket?.write(command+'\r\n','utf8');
    },()=>{void this.stop();});
    const cleanup=()=>{
      if(this.process!==child)return;
      if(this.retry)clearInterval(this.retry);
      this.retry=undefined;this.socket?.destroy();this.socket=undefined;this.process=undefined;
      this.running(false);
    };
    child.once('error',error=>{cleanup();this.failed(error);});
    child.once('close',cleanup);
    child.once('spawn',()=>{
      this.running(true);
      const connect=()=>{
        if(this.process!==child||this.socket)return;
        const socket=createConnection(ASER_PIPE);this.socket=socket;
        socket.setEncoding('utf8');
        socket.on('connect',()=>{if(this.retry)clearInterval(this.retry);this.retry=undefined;});
        socket.on('data',data=>playback.receive(String(data)));
        socket.on('error',()=>{socket.destroy();if(this.socket===socket)this.socket=undefined;});
      };
      this.retry=setInterval(connect,200);connect();
    });
  }
  async stop():Promise<void>{
    const child=this.process;if(!child)return;
    if(this.retry)clearInterval(this.retry);this.retry=undefined;
    this.socket?.destroy();this.socket=undefined;
    if(child.exitCode!==null)return;
    await new Promise<void>(resolve=>{child.once('close',()=>resolve());child.kill();});
  }
  dispose():void{void this.stop();}
}
