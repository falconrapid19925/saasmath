import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRoom, joinRoom, startMatch, submitAnswer, advanceRoom, GameError } from '../src/game/engine.ts';
import type { Identity, Room } from '../src/game/types.ts';
import { hashToken, session, saveSession, insertRoom, mutateRoom, rateLimit, cleanup } from '../src/server/store.ts';

/** Uses real SQLite semantics. Keep tables aligned with db/schema.ts/migrations. */
export class SQLiteD1 {
  raw = new DatabaseSync(':memory:');
  constructor() {
    this.raw.exec(`
      CREATE TABLE guest_sessions(token_hash TEXT PRIMARY KEY,id TEXT NOT NULL UNIQUE,name TEXT NOT NULL,avatar INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE game_rooms(code TEXT PRIMARY KEY,version INTEGER NOT NULL,state TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE api_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    `);
  }
  prepare(sql: string): SQLiteStatement { return new SQLiteStatement(this, sql); }
  async batch(statements: SQLiteStatement[]) {
    this.raw.exec('BEGIN');
    try { const values = []; for (const statement of statements) values.push(await statement.run()); this.raw.exec('COMMIT'); return values; }
    catch (error) { this.raw.exec('ROLLBACK'); throw error; }
  }
  get d1(): D1Database { return this as unknown as D1Database; }
  close() { this.raw.close(); }
}
class SQLiteStatement {
  private owner: SQLiteD1;
  private sql: string;
  private values: (string|number|null)[];
  constructor(owner: SQLiteD1, sql: string, values: (string|number|null)[] = []) { this.owner=owner; this.sql=sql; this.values=values; }
  bind(...values: (string|number|null)[]) { return new SQLiteStatement(this.owner, this.sql, values); }
  async first<T>(column?: string): Promise<T|null> {
    const row = this.owner.raw.prepare(this.sql).get(...this.values) as Record<string,unknown>|undefined;
    return row ? (column ? row[column] : { ...row }) as T : null;
  }
  async run() {
    const result = this.owner.raw.prepare(this.sql).run(...this.values);
    return { success:true, meta:{ changes:Number(result.changes), last_row_id:Number(result.lastInsertRowid) }, results:[] };
  }
}

const T=1_000_000;
const ids:Identity[] = Array.from({length:16},(_,i)=>({id:`student-${i}`,name:`Siswa ${i}`,avatar:i%6}));
async function seedRoom(db:SQLiteD1,code='MATH42',players=ids.slice(0,4)) {
  const room=createRoom(players[0],code,T,{},`test-secret-${code}`);
  for(const identity of players.slice(1))joinRoom(room,identity,T);
  assert.equal(await insertRoom(db.d1,room,T),true);
  return room;
}
function stored(db:SQLiteD1,code='MATH42'):Room {
  const row=db.raw.prepare('SELECT state FROM game_rooms WHERE code=?').get(code) as {state:string};
  return JSON.parse(row.state);
}

test('session credential is hashed, validated, expiry-bound, and not client-selected playerId', async()=>{
  const db=new SQLiteD1();
  try{
    const token='a'.repeat(64);
    await saveSession(db.d1,ids[0],token,T);
    const value=await session(db.d1,token,T+1);
    assert.equal(value?.id,ids[0].id);
    assert.equal(await session(db.d1,'b'.repeat(64),T+1),null);
    assert.equal(await session(db.d1,"' OR 1=1 --",T+1),null);
    assert.equal(await session(db.d1,token,T+24*60*60*1000),null);
    const saved=db.raw.prepare('SELECT token_hash FROM guest_sessions').get() as {token_hash:string};
    assert.equal(saved.token_hash,await hashToken(token));
    assert.notEqual(saved.token_hash,token);
  }finally{db.close();}
});

test('room membership is checked before mutation and snapshots do not leak private state',async()=>{
  const db=new SQLiteD1();
  try{
    await seedRoom(db);
    await assert.rejects(mutateRoom(db.d1,'MATH42',ids[9],null,T+1),(e:unknown)=>e instanceof GameError&&e.status===403);
    const begun=await mutateRoom(db.d1,'MATH42',ids[0],(r,t)=>startMatch(r,ids[0].id,t),T+2);
    const open=await mutateRoom(db.d1,'MATH42',ids[0],null,begun.transitionEndsAt!);
    const room=stored(db); const actor=ids.find(p=>p.id===open.actorId)!;
    const observer=ids.find(p=>p.id!==actor.id)!;
    const other=ids.find(p=>p.id!==actor.id&&p.id!==observer.id)!;
    const mine=await mutateRoom(db.d1,'MATH42',observer,(r,t)=>submitAnswer(r,observer.id,room.question!.expected,'spectator-key',t,r.turnId),room.startsAt!+500);
    assert.equal(mine.yourAnswer.submitted,true);
    assert.equal(mine.feedback,null);
    const theirs=await mutateRoom(db.d1,'MATH42',other,null,room.startsAt!+600);
    assert.equal(theirs.yourAnswer.submitted,false);
    assert.ok(!('secretSeed'in theirs));
    assert.ok(!('expected'in theirs.question!));
    assert.ok(!('steps'in theirs.question!));
    assert.ok(!JSON.stringify(theirs).includes('spectator-key'));
    assert.equal(stored(db).outcomes.length,0);
    assert.ok(stored(db).players.every(p=>p.score===0&&p.lives===3));
  }finally{db.close();}
});

test('concurrent joins use CAS and never allow a ninth participant',async()=>{
  const db=new SQLiteD1();
  try{
    await seedRoom(db,'MATH42',ids.slice(0,1));
    const results=await Promise.allSettled(ids.slice(1,9).map((identity)=>mutateRoom(db.d1,'MATH42',identity,(r,t)=>joinRoom(r,identity,t),T+1,true)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,7);
    const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason.code,'ROOM_FULL');
    assert.equal(stored(db).players.length,8);
    assert.equal(new Set(stored(db).players.map(p=>p.id)).size,8);
  }finally{db.close();}
});

test('two concurrent starts commit only one match',async()=>{
  const db=new SQLiteD1();
  try{
    await seedRoom(db);
    const start=()=>mutateRoom(db.d1,'MATH42',ids[0],(r,t)=>startMatch(r,ids[0].id,t),T+1);
    const results=await Promise.allSettled([start(),start()]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(stored(db).matchNumber,1);
    assert.equal(stored(db).phase,'transition');
  }finally{db.close();}
});

test('concurrent repeated answer commits exactly one score event',async()=>{
  const db=new SQLiteD1();
  try{
    const room=await seedRoom(db);
    startMatch(room,room.hostId,T);advanceRoom(room,room.transitionEndsAt!);
    db.raw.prepare('UPDATE game_rooms SET version=?,state=? WHERE code=?').run(room.version,JSON.stringify(room),room.code);
    const actor=ids.find(p=>p.id===room.actorId)!;
    const send=()=>mutateRoom(db.d1,room.code,actor,(r,t)=>submitAnswer(r,actor.id,room.question!.expected,'same-answer-request',t,room.turnId),room.startsAt!+7500);
    const results=await Promise.all([send(),send(),send()]);
    assert.ok(results.every(result=>result.phase==='feedback'));
    const saved=stored(db);
    assert.equal(saved.outcomes.length,1);
    assert.equal(saved.players.find(p=>p.id===actor.id)!.score,115);
    assert.equal(saved.players.find(p=>p.id===actor.id)!.lives,3);
  }finally{db.close();}
});

test('timeout and predeadline answer cannot commit conflicting outcomes',async()=>{
  const db=new SQLiteD1();
  try{
    const room=await seedRoom(db);
    startMatch(room,room.hostId,T);advanceRoom(room,room.transitionEndsAt!);
    db.raw.prepare('UPDATE game_rooms SET version=?,state=? WHERE code=?').run(room.version,JSON.stringify(room),room.code);
    const actor=ids.find(p=>p.id===room.actorId)!;
    await Promise.allSettled([
      mutateRoom(db.d1,room.code,actor,(r,t)=>submitAnswer(r,actor.id,room.question!.expected,'race-answer-request',t,room.turnId),room.deadlineAt!-1),
      mutateRoom(db.d1,room.code,ids[1],null,room.deadlineAt!),
    ]);
    const saved=stored(db);const p=saved.players.find(p=>p.id===actor.id)!;
    assert.equal(saved.outcomes.length,1);
    assert.equal(saved.phase,'feedback');
    if(saved.outcomes[0].correct){assert.equal(p.score,100);assert.equal(p.lives,3);}
    else{assert.equal(p.score,0);assert.equal(p.lives,2);}
  }finally{db.close();}
});

test('two rooms with sixteen identities remain isolated during concurrent polling and answers',async()=>{
  const db=new SQLiteD1();
  try{
    const one=await seedRoom(db,'MATH42',ids.slice(0,8));
    const two=await seedRoom(db,'BEE234',ids.slice(8,16));
    for(const room of [one,two]){
      startMatch(room,room.hostId,T);advanceRoom(room,room.transitionEndsAt!);
      db.raw.prepare('UPDATE game_rooms SET version=?,state=? WHERE code=?').run(room.version,JSON.stringify(room),room.code);
    }
    const snapshots=await Promise.all(ids.map((identity,i)=>mutateRoom(db.d1,i<8?'MATH42':'BEE234',identity,null,T+2500)));
    assert.ok(snapshots.slice(0,8).every(s=>s.players.length===8&&s.players.every(p=>ids.slice(0,8).some(i=>i.id===p.id))));
    assert.ok(snapshots.slice(8).every(s=>s.players.length===8&&s.players.every(p=>ids.slice(8).some(i=>i.id===p.id))));
    const actor=ids.find(p=>p.id===one.actorId)!;
    await mutateRoom(db.d1,one.code,actor,(r,t)=>submitAnswer(r,actor.id,one.question!.expected,'room-one-answer',t,one.turnId),T+3000);
    assert.equal(stored(db,one.code).outcomes.length,1);
    assert.equal(stored(db,two.code).outcomes.length,0);
    assert.ok(stored(db,two.code).players.every(p=>p.score===0&&p.lives===3));
    await assert.rejects(mutateRoom(db.d1,two.code,ids[0],null,T+3500),(e:unknown)=>e instanceof GameError&&e.status===403);
  }finally{db.close();}
});

test('rate buckets reset and cleanup removes expired temporary rows',async()=>{
  const db=new SQLiteD1();
  try{
    await rateLimit(db.d1,'test',2,T);await rateLimit(db.d1,'test',2,T+1);
    await assert.rejects(rateLimit(db.d1,'test',2,T+2),(e:unknown)=>e instanceof GameError&&e.status===429);
    await rateLimit(db.d1,'test',2,T+60_000);
    await saveSession(db.d1,ids[0],'a'.repeat(64),T);
    await seedRoom(db);
    await cleanup(db.d1,T+25*60*60*1000);
    for(const table of ['guest_sessions','game_rooms','api_limits'])assert.equal((db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n,0);
  }finally{db.close();}
});


test('late CAS retry cannot regress presence timestamps from a newer request',async()=>{
  const db=new SQLiteD1();
  try{
    await seedRoom(db);
    await mutateRoom(db.d1,'MATH42',ids[0],null,T+2000);
    await mutateRoom(db.d1,'MATH42',ids[0],null,T+1000);
    const saved=stored(db);
    assert.equal(saved.players[0].lastSeenAt,T+2000);
    assert.equal(saved.updatedAt,T+2000);
  }finally{db.close();}
});

// Full Worker API tests exercise actual Request/Response authorization and streaming timestamps.
import worker from '../src/server/worker.ts';
function context(): ExecutionContext {
  return {waitUntil(promise:Promise<unknown>){void promise.catch(()=>{});},passThroughOnException(){}} as unknown as ExecutionContext;
}
async function requestWorker(db:SQLiteD1,path:string,body?:Record<string,unknown>,cookie?:string,origin='https://mathbee.test') {
  const request=new Request(`https://mathbee.test${path}`,{
    method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','Origin':origin}:{}),...(cookie?{'Cookie':cookie}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  const response=await worker.fetch(request,{DB:db.d1},context());
  return {response,data:await response.json() as Record<string,any>};
}
async function guest(db:SQLiteD1,index:number) {
  const {response,data}=await requestWorker(db,'/api/session',{name:`Peserta ${index}`,avatar:index%6});
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie')!.split(';')[0];
  assert.ok(response.headers.get('set-cookie')!.includes('HttpOnly'));
  assert.ok(response.headers.get('set-cookie')!.includes('Secure'));
  return {cookie,player:data.player as Identity};
}

test('Worker authenticates actual guest cookie and rejects forged role/score/member payloads',async()=>{
  const db=new SQLiteD1();const realNow=Date.now;let now=T;Date.now=()=>now;
  try{
    const unauthorized=await requestWorker(db,'/api/rooms',{action:'create'});
    assert.equal(unauthorized.response.status,401);
    const guests=[];for(let i=0;i<5;i++)guests.push(await guest(db,i));
    const host=guests[0];
    const created=await requestWorker(db,'/api/rooms',{action:'create'},host.cookie);
    assert.equal(created.response.status,201);
    const code=created.data.snapshot.code as string;
    const route=`/api/rooms/${code}`;
    assert.equal((await requestWorker(db,route,{action:'start'},host.cookie)).response.status,409);
    for(const g of guests.slice(1,4))assert.equal((await requestWorker(db,'/api/rooms',{action:'join',code},g.cookie)).response.status,200);
    assert.equal((await requestWorker(db,route,{action:'start',playerId:host.player.id,host:true},guests[1].cookie)).response.status,403);
    assert.equal((await requestWorker(db,route,undefined,guests[4].cookie)).response.status,403);
    assert.equal((await requestWorker(db,route,{action:'start'},host.cookie,'https://evil.example')).response.status,403);
    assert.equal((await requestWorker(db,route,{action:'start'},host.cookie)).response.status,200);
    now+=2000;
    const open=await requestWorker(db,route,undefined,host.cookie);
    assert.equal(open.data.snapshot.phase,'answering');
    assert.equal(open.data.snapshot.feedback,null);
    assert.ok(!('expected'in open.data.snapshot.question));
    const saved=stored(db,code);
    const actor=guests.find(g=>g.player.id===saved.actorId)!;
    const spectator=guests.find(g=>g.player.id!==saved.actorId)!;
    now+=1000;
    assert.equal((await requestWorker(db,route,{action:'answer',value:'999999',turnId:saved.turnId,requestId:'worker-private-answer',score:999999,role:'competitor'},spectator.cookie)).response.status,200);
    const snap=await requestWorker(db,route,undefined,actor.cookie);
    assert.equal(snap.data.snapshot.yourAnswer.submitted,false);
    assert.ok(!JSON.stringify(snap.data.snapshot).includes('999999'));
    now=saved.startsAt!+7500;
    const payload={action:'answer',value:saved.question!.expected,turnId:saved.turnId,requestId:'worker-main-answer',score:999999,lives:999,elapsedMs:0};
    assert.equal((await requestWorker(db,route,payload,actor.cookie)).response.status,200);
    assert.equal((await requestWorker(db,route,payload,actor.cookie)).response.status,200);
    const result=stored(db,code);
    assert.equal(result.outcomes.length,1);
    assert.equal(result.players.find(p=>p.id===actor.player.id)!.score,115);
    assert.equal(result.players.find(p=>p.id===actor.player.id)!.lives,3);
    assert.equal(result.players.find(p=>p.id===spectator.player.id)!.score,0);
  }finally{Date.now=realNow;db.close();}
});

test('Worker timestamp is captured after complete streaming body, not request headers',async()=>{
  const db=new SQLiteD1();const realNow=Date.now;let now=T;Date.now=()=>now;
  try{
    const guests=[];for(let i=0;i<4;i++)guests.push(await guest(db,i));
    const room=await seedRoom(db,'LATE42',guests.map(g=>g.player));
    startMatch(room,room.hostId,T);advanceRoom(room,room.transitionEndsAt!);
    db.raw.prepare('UPDATE game_rooms SET version=?,state=? WHERE code=?').run(room.version,JSON.stringify(room),room.code);
    const actor=guests.find(g=>g.player.id===room.actorId)!;
    const payload=JSON.stringify({action:'answer',value:room.question!.expected,turnId:room.turnId,requestId:'streaming-delayed-answer'});
    const split=Math.floor(payload.length/2);const encoder=new TextEncoder();
    now=room.deadlineAt!-1;
    const stream=new ReadableStream<Uint8Array>({
      start(controller){controller.enqueue(encoder.encode(payload.slice(0,split)));},
      pull(controller){now=room.deadlineAt!+1000;controller.enqueue(encoder.encode(payload.slice(split)));controller.close();},
    });
    const init={method:'POST',headers:{'Content-Type':'application/json','Origin':'https://mathbee.test','Cookie':actor.cookie},body:stream,duplex:'half'};
    const response=await worker.fetch(new Request('https://mathbee.test/api/rooms/LATE42',init),{DB:db.d1},context());
    assert.equal(response.status,409);
    assert.equal((await response.json() as {code:string}).code,'TURN_CLOSED');
    const polled=await requestWorker(db,'/api/rooms/LATE42',undefined,actor.cookie);
    assert.equal(polled.data.snapshot.phase,'feedback');
    const result=stored(db,'LATE42');
    assert.equal(result.outcomes.length,1);
    assert.equal(result.players.find(p=>p.id===actor.player.id)!.score,0);
    assert.equal(result.players.find(p=>p.id===actor.player.id)!.lives,2);
  }finally{Date.now=realNow;db.close();}
});
