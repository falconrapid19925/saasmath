import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:8787';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let requests=0;
async function call(path,body,cookie){
  requests++;
  const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','Origin':origin}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json();assert.ok(r.ok,`${path}: ${r.status} ${JSON.stringify(data)}`);
  return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};
}
function oracle(prompt){
  const fractions=[...prompt.matchAll(/(\d+)\/(\d+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
  if(prompt.includes('Rani')||prompt.includes('Teko')){
    const whole=Number(prompt.match(/(?:punya|berisi) (\d+)/)[1]);
    const [[a,d],[b,e]]=fractions;assert.equal(d,e);return `${whole*d-a-b}/${d}`;
  }
  if(fractions.length===2){const [[a,d],[b,e]]=fractions;assert.equal(d,e);return `${prompt.includes('−')?a-b:a+b}/${d}`;}
  const cleaned=prompt.replace(/[()= ?]/g,'');
  const m=/^(-?\d+)([+−])(\d+)(?:×(\d+))?$/.exec(cleaned);assert.ok(m,`Unknown prompt ${prompt}`);
  const a=Number(m[1]), b=Number(m[3])*(m[4]?Number(m[4]):1);return String(m[2]==='+'?a+b:a-b);
}
async function makeRoom(label){
  const members=[];
  for(let i=0;i<8;i++){
    const r=await call('/api/session',{name:`${label}${i+1}`,avatar:i%6});
    members.push({cookie:r.cookie,id:r.data.player.id});
  }
  let {data}=await call('/api/rooms',{action:'create'},members[0].cookie);const code=data.snapshot.code;
  for(let i=1;i<8;i++)await call('/api/rooms',{action:'join',code},members[i].cookie);
  await call(`/api/rooms/${code}`,{action:'start'},members[0].cookie);
  return {code,members,handled:new Set(),feedbacks:new Set(),turns:0,tiebreaks:0,firstScoreAt:null};
}
await mkdir('artifacts',{recursive:true});
const started=Date.now();const rooms=await Promise.all([makeRoom('QA-A'),makeRoom('QA-B')]);
console.log('Running two actual HTTP rooms with 16 isolated guest sessions.');
const result=[];
await Promise.all(rooms.map(async room=>{
  for(let tick=0;tick<600;tick++){
    const snapshots=await Promise.all(room.members.map(async member=>(await call(`/api/rooms/${room.code}`,null,member.cookie)).data.snapshot));
    const latest=snapshots.reduce((a,b)=>a.version>b.version?a:b);
    assert.equal(latest.players.length,8);assert.ok(latest.players.every(p=>room.members.some(m=>m.id===p.id)));
    assert.ok(!JSON.stringify(latest).includes('secretSeed'));assert.ok(!JSON.stringify(latest.question).includes('expected'));
    if(['answering','tiebreak'].includes(latest.phase)&&!room.handled.has(latest.turnId)){
      room.handled.add(latest.turnId);
      const actors=latest.phase==='tiebreak'?latest.tiebreakPlayers:[latest.actorId];
      if(latest.phase==='tiebreak')room.tiebreaks++;else room.turns++;
      const spectators=room.members.filter(m=>!actors.includes(m.id));
      await Promise.all(spectators.map(m=>call(`/api/rooms/${room.code}`,{action:'answer',value:'999',requestId:crypto.randomUUID(),turnId:latest.turnId},m.cookie)));
      for(const id of actors){
        const member=room.members.find(m=>m.id===id);
        const answer=oracle(latest.question.prompt);
        const requestId=crypto.randomUUID();
        const answered=await call(`/api/rooms/${room.code}`,{action:'answer',value:answer,requestId,turnId:latest.turnId},member.cookie);
        if(latest.phase==='answering'){
          assert.equal(answered.data.snapshot.feedback.actorCorrect,true);
          assert.equal(answered.data.snapshot.players.find(p=>p.id===id).lives,3);
          room.firstScoreAt??=Date.now()-started;
          const repeated=await call(`/api/rooms/${room.code}`,{action:'answer',value:answer,requestId,turnId:latest.turnId},member.cookie);
          assert.equal(repeated.data.snapshot.players.find(p=>p.id===id).score,answered.data.snapshot.players.find(p=>p.id===id).score);
        }
      }
      console.log(room.code,`round ${latest.round}`,latest.phase,`turns ${room.turns}`);
    }
    if(latest.phase==='results'){
      assert.equal(room.turns,32);assert.ok(room.tiebreaks<=1);assert.ok(latest.winners.length>=1);
      assert.ok(latest.players.every(p=>p.lives===3&&p.score>=400&&p.score<=480));
      result.push({room:room.code,turns:room.turns,tiebreaks:room.tiebreaks,winners:latest.winners.length,scores:latest.players.map(p=>p.score),firstScoreMs:room.firstScoreAt});return;
    }
    await pause(900);
  }
  throw new Error('Match did not finish within bounded QA window');
}));
const report={status:'PASS',buildHash:JSON.parse(await readFile('client-dist/assets/meta.json','utf8')).hash,kind:'real HTTP session simulation; not human/device trial',rooms:2,guestSessions:16,requests,durationMs:Date.now()-started,result};
await writeFile('artifacts/multiplayer-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
