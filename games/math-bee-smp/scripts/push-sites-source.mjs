import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// Repository credential is accepted only through stdin and is never persisted.
// The official source-workflow helper was unavailable in this environment.
const terminal=process.stdin.isTTY;
if(terminal)process.stdin.setRawMode(true);
process.stdout.write('Ready for Sites source credential JSON on stdin (input is hidden).\n');
let input='';
const credential=await new Promise((resolve,reject)=>{
  process.stdin.on('data',chunk=>{
    input+=chunk.toString();
    if(input.includes('\n')){
      try{resolve(JSON.parse(input.slice(0,input.indexOf('\n'))));}catch(error){reject(error);}
      process.stdin.pause();
    }
  });
  process.stdin.on('end',()=>{if(!input.includes('\n'))reject(new Error('Missing credential input'));});
});
if(terminal)process.stdin.setRawMode(false);
const remote=new URL(credential.remote_url);
if(remote.protocol!=='https:'||remote.username||remote.password)throw new Error('Expected credential-free HTTPS remote');
if(!/^[A-Za-z0-9_./-]+$/.test(credential.branch))throw new Error('Invalid source branch');
const env={...process.env,GIT_TERMINAL_PROMPT:'0'};
if(credential.token){
  const configIndex=Number(env.GIT_CONFIG_COUNT||0);
  if(!Number.isInteger(configIndex)||configIndex<0||configIndex>100)throw new Error('Invalid inherited Git configuration');
  env.GIT_CONFIG_COUNT=String(configIndex+1);
  env[`GIT_CONFIG_KEY_${configIndex}`]=`http.${remote.origin}/.extraheader`;
  env[`GIT_CONFIG_VALUE_${configIndex}`]=`Authorization: Bearer ${credential.token}`;
}
function git(args,timeout=60_000){return new Promise((resolve,reject)=>{
  const child=spawn('git',args,{env,stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',data=>output+=data.toString());child.stderr.on('data',data=>output+=data.toString());
  const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);const safe=credential.token?output.split(credential.token).join('[REDACTED]'):output;
    if(code!==0)reject(new Error(`Git operation failed (${code}): ${safe.slice(-2500)}`));else resolve(safe.trim());});
});}
if(!existsSync('.git')){await git(['init','-b',credential.branch]);await git(['config','user.name','Math Bee Builder']);await git(['config','user.email','mathbee@local.invalid']);}
const remotes=await git(['remote']);
if(!remotes.split('\n').includes('origin'))await git(['remote','add','origin',credential.remote_url]);
else if(await git(['remote','get-url','origin'])!==credential.remote_url)throw new Error('Origin does not match this Site');
// Check transport before creating a local commit, so an infrastructure error is explicit.
const head=await git(['ls-remote','origin',`refs/heads/${credential.branch}`]);
await git(['add','.']);
const changes=await git(['status','--porcelain']);
if(changes)await git(['commit','-m','Build Math Bee SMP multiplayer garden game']);
if(head){await git(['fetch','origin',credential.branch]);await git(['merge','--allow-unrelated-histories','--no-edit',`origin/${credential.branch}`]);}
await git(['push','-u','origin',`HEAD:refs/heads/${credential.branch}`]);
const sha=await git(['rev-parse','HEAD']);
if(!/^[0-9a-f]{40}$/.test(sha))throw new Error('Unexpected source SHA');
console.log(JSON.stringify({commit_sha:sha,branch:credential.branch,remote_url:credential.remote_url}));
