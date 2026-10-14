import { inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const repo='/sandbox/hide';
const binary=process.env.HIDE_SMOKE_BINARY ?? repo+'/dist-newstyle/build/aarch64-linux/ghc-9.14.1/hide-0.1.0.0/x/hide/build/hide/hide';
const state=mkdtempSync('/sandbox/hide-smoke-');
const env={...process.env,HOME:'/home/node',TERM:'xterm-256color',hide_datadir:repo,
  PATH:'/home/node/.ghcup/bin:/home/node/.cabal/bin:'+process.env.PATH};
for(const [key,dir] of Object.entries({XDG_DATA_HOME:'data',XDG_CONFIG_HOME:'config',XDG_STATE_HOME:'state',XDG_CACHE_HOME:'cache'})){
  env[key]=join(state,dir);mkdirSync(env[key],{recursive:true});
}
const child=spawn(binary,['--remote'],{cwd:repo,env,detached:true,stdio:['pipe','pipe','pipe']});
let text='',closed=false,exitCode,buffer=Buffer.alloc(0),rows=[],lastFrame=0,serial=0,received=0,protocolError;
function send(value){const data=Buffer.from(JSON.stringify(value));const header=Buffer.alloc(5);header.writeUInt32BE(data.length+1);child.stdin.write(Buffer.concat([header,data]));}
child.stdout.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  try {while(buffer.length>=4){
    const n=buffer.readUInt32BE(0);if(n<1||n>16777217) throw Error('Invalid packet size');
    if(buffer.length<4+n) break;
    const kind=buffer[4],payload=buffer.subarray(5,4+n);buffer=buffer.subarray(4+n);
    if(kind===0){const message=JSON.parse(payload);if(message.type==='error') throw Error(message.message);
      if(message.type==='frame-ready') received=message.seq;
    }else{
      const tag=payload[0],dictionary=Buffer.from(JSON.stringify(rows)).subarray(-32768);
      const frame=JSON.parse(inflateRawSync(payload.subarray(1),{...(tag?{dictionary}:{}),maxOutputLength:67108864}));
      if(tag!==2) rows=[];
      for(const [y,row] of frame.rows) rows[y]=row;
      lastFrame=Date.now();
      text=rows.map(row=>row.flatMap(span=>span[4].map(run=>typeof run==='string'?run:run[0])).join('')).join('\n');
    }
  }}catch(error){protocolError=error;}
});
send({type:'hello',version:1,session:randomBytes(24).toString('hex'),client:randomBytes(24).toString('hex'),ack:0,
  args:['--size=120x60','packages/hide-plugin-api/src/Hide/Plugin/Inspect.hs']});
child.stderr.on('data',chunk=>{text+=chunk;});
child.on('error',error=>{text+=error.message;closed=true;exitCode=1;});
child.on('close',code=>{closed=true;exitCode=code;});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function expect(pattern,label){
  const until=Date.now()+15000;
  // Only judge a settled display, so a stale or half-applied frame cannot satisfy a step.
  while(!(pattern.test(text)&&Date.now()-lastFrame>=200)){
    if(protocolError) throw protocolError;
    if(closed||Date.now()>until) throw Error(label+' not observed. Display tail: '+text.slice(-1800));
    await sleep(50);
  }
  console.log('PASS '+label);
}
async function expectAbsent(pattern,label){
  await sleep(300);if(protocolError) throw protocolError;
  if(closed) throw Error(label+' interrupted by exit');
  if(pattern.test(text)) throw Error(label+' failed. Display tail: '+text.slice(-1800));
  console.log('PASS '+label);
}
function input(events){text='';lastFrame=Date.now();for(const event of events) send({...event,seq:++serial,received});}
const key=(name,mods=[])=>[{type:'key',key:name,mods}];
const mouse=(button,x,y)=>['down','up'].map(action=>({type:'mouse',button,x:x-1,y:y-1,action,clicks:1,mods:[]}));
let passed=false;
try {
  await expect(/▶ hide/,'package sidebar appears');
  input(mouse(0,2,3));await expect(/▶ hide/,'collapse Files reveals package');
  input(mouse(2,7,8));await expect(/│ Inspect +│/,'package context menu exposes Inspect');
  input(mouse(0,12,11));await expect(/hide — \d+ components/,'package inspector opens');
  input(mouse(2,30,4));await expect(/Open/,'component row exposes Open');
  input(key('Enter'));await expect(/exe:hide — unconditional sources/,'component source view opens');
  input([...mouse(2,32,4),...key('Enter')]);await expect(/ComponentSources · Declaration/,'switch to Declaration');
  await expect(/Source directories: app/,'component facts rendered');
  input([...mouse(2,32,4),...key('Enter')]);await expect(/exe:hide — unconditional sources/,'switch back to Sources');
  input([...mouse(2,32,3),...key('Enter')]);await expect(/Source · Declaration/,'navigate to source declaration');
  await expect(/Kind: Main/,'source facts rendered');
  // Back from a source declaration to its component, which is a freshly resolved page.
  input([...mouse(2,32,4),...key('Enter')]);await expect(/exe:hide — unconditional sources/,'Back from source declaration returns to component');
  await expectAbsent(/Source · Declaration|Kind: Main/,'component page replaced the source page');
  // Switch the component's view after Back, then Back again reaches the package.
  input([...mouse(2,32,4),...key('Enter')]);await expect(/ComponentSources · Declaration/,'switch component view after Back');
  await expect(/Kind: executable/,'component declaration facts rendered after Back');
  input([...mouse(2,32,5),...key('Enter')]);await expect(/hide — \d+ components/,'Back after view switch returns to package');
  await expectAbsent(/ComponentSources|← Back/,'package page is the history root');
  passed=true;
} catch(error){console.error(error.message);process.exitCode=1;}
finally {
  if(!closed){input(key('Escape'));await sleep(150);input(key('x',['alt']));}
  const until=Date.now()+5000;while(!closed&&Date.now()<until) await sleep(50);
  if(!closed){try{process.kill(-child.pid,'SIGTERM');}catch{};process.exitCode=1;console.error('Display did not exit cleanly; retained state: '+state);}
  else {rmSync(state,{recursive:true,force:true});if(exitCode!==0){process.exitCode=1;console.error('Display exited with code '+exitCode);}}
}
if(passed&&!process.exitCode){console.log('PASS inspector runtime smoke; editor exited cleanly');console.log('PASS inspector history runtime');}
