import {
  createRoom, joinRoom, startMatch, submitAnswer, movePlayer, sendEmote, leaveRoom,
  publicSnapshot, GameError,
} from '../game/engine.ts';
import { MathInputError } from '../game/math.ts';
import { cleanup, insertRoom, mutateRoom, randomCode, randomToken, rateLimit, saveSession, session, hashToken } from './store.ts';

declare const __STATIC_FILES__: Record<string, {body:string; type:string}>;
interface Env { DB:D1Database }
const COOKIE='mb_guest';
const securityHeaders = {
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
};
function json(value:unknown, status=200, headers:Record<string,string>={}) {
  return new Response(JSON.stringify(value), {status, headers:{...securityHeaders, 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie',...headers}});
}
function cookie(request:Request):string|null {
  return request.headers.get('Cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1) || null;
}
async function body(request:Request):Promise<Record<string,unknown>> {
  if (Number(request.headers.get('Content-Length')||0)>4096) throw new GameError('Permintaan terlalu besar.',413);
  const reader=request.body?.getReader();
  if (!reader) throw new GameError('Data permintaan kosong.');
  let text='', length=0, timedOut=false; const decoder=new TextDecoder();
  const timer=setTimeout(()=>{timedOut=true;void reader.cancel();},8_000);
  try {
    while(true){const {done,value}=await reader.read();if(done)break; length+=value.byteLength;
      if(length>4096){await reader.cancel();throw new GameError('Permintaan terlalu besar.',413);}text+=decoder.decode(value,{stream:true});}
    if(timedOut)throw new GameError('Pengiriman terlalu lama. Coba lagi.',408,'BODY_TIMEOUT');
    text+=decoder.decode();
  } finally {clearTimeout(timer);}
  try {const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}
  catch {throw new GameError('Format permintaan tidak valid.');}
}
function codeFrom(value:unknown):string {
  if(typeof value!=='string'||!/^[A-Z2-9]{6}$/.test(value.trim().toUpperCase()))throw new GameError('Kode room berisi 6 huruf atau angka.');
  return value.trim().toUpperCase();
}

async function api(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url);const now=Date.now();
  if(!env.DB) return json({error:'Penyimpanan room belum tersedia. Coba lagi sebentar.',code:'STORAGE_UNAVAILABLE'},503);
  if(request.method!=='GET'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin){
    throw new GameError('Permintaan dari alamat lain tidak diizinkan.',403,'INVALID_ORIGIN');
  }
  if(request.method!=='GET'&&!request.headers.get('Content-Type')?.includes('application/json'))throw new GameError('Gunakan format JSON.',415);
  const token=cookie(request);const player=await session(env.DB,token,now);
  if(url.pathname==='/api/session'){
    if(request.method==='GET')return json({player:player?{id:player.id,name:player.name,avatar:player.avatar}:null});
    if(request.method!=='POST')return json({error:'Metode tidak didukung.'},405);
    const data=await body(request);const name=typeof data.name==='string'?data.name.trim():'';
    if(Array.from(name).length<2||Array.from(name).length>16||/[\u0000-\u001f\u007f]/.test(name))throw new GameError('Nama panggilan harus 2–16 karakter.');
    if(!Number.isInteger(data.avatar)||Number(data.avatar)<0||Number(data.avatar)>5)throw new GameError('Pilih salah satu avatar.');
    const ipHash=await hashToken(request.headers.get('CF-Connecting-IP')||'local');
    await rateLimit(env.DB,`session:${ipHash}`,120,now);
    const identity={id:player?.id||crypto.randomUUID(),name,avatar:Number(data.avatar)};
    const nextToken=player&&token?token:randomToken();await saveSession(env.DB,identity,nextToken,now);
    return json({player:identity},200,{'Set-Cookie':`${COOKIE}=${nextToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${url.protocol==='https:'?'; Secure':''}`});
  }
  if(!player)throw new GameError('Isi nama dan pilih avatar untuk mulai bermain.',401,'SESSION_REQUIRED');
  if(url.pathname==='/api/rooms'&&request.method==='POST'){
    const data=await body(request);await rateLimit(env.DB,`rooms:${player.id}`,20,now);
    if(data.action==='create'){
      for(let attempt=0;attempt<5;attempt++){
        const room=createRoom(player,randomCode(),now);
        if(await insertRoom(env.DB,room,now))return json({snapshot:publicSnapshot(room,player.id,now)},201);
      }
      throw new GameError('Belum bisa membuat kode room. Coba lagi.',503);
    }
    if(data.action==='join'){
    const code=codeFrom(data.code);
      return json({snapshot:await mutateRoom(env.DB,code,player,(room,t)=>{joinRoom(room,player,t);},Date.now(),true)});
    }
    throw new GameError('Pilih buat room atau gabung room.');
  }
  const match=/^\/api\/rooms\/([A-Z2-9]{6})$/.exec(url.pathname);
  if(match){
    const code=match[1];
    if(request.method==='GET')return json({snapshot:await mutateRoom(env.DB,code,player,null,Date.now())});
    if(request.method!=='POST')return json({error:'Metode tidak didukung.'},405);
    const data=await body(request);
    await rateLimit(env.DB,`action:${player.id}`,200,now);
    const snapshot=await mutateRoom(env.DB,code,player,(room,t)=>{
      switch(data.action){
        case 'start': case 'rematch': startMatch(room,player.id,t);break;
        case 'answer':
          if(typeof data.value!=='string'||typeof data.requestId!=='string'||typeof data.turnId!=='string')throw new GameError('Jawaban atau identitas giliran belum lengkap.');
          submitAnswer(room,player.id,data.value,data.requestId,t,data.turnId);break;
        case 'move':
          if(typeof data.x!=='number'||typeof data.z!=='number')throw new GameError('Posisi tidak valid.');
          movePlayer(room,player.id,data.x,data.z,t);break;
        case 'emote':
          if(typeof data.emoteId!=='string')throw new GameError('Emote tidak valid.');
          sendEmote(room,player.id,data.emoteId,t);break;
        case 'leave': leaveRoom(room,player.id,t);break;
        default:throw new GameError('Aksi tidak dikenali.');
      }
    },Date.now());
    if(crypto.getRandomValues(new Uint8Array(1))[0]===0)ctx.waitUntil(cleanup(env.DB,now));
    return json({snapshot});
  }
  return json({error:'Alamat tidak ditemukan.'},404);
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    try{
      if(url.pathname.startsWith('/api/'))return await api(request,env,ctx);
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      const file=__STATIC_FILES__[url.pathname]||(url.pathname==='/'?__STATIC_FILES__['/index.html']:null);
      if(!file)return new Response('Not found',{status:404});
      return new Response(request.method==='HEAD'?null:file.body,{headers:{...securityHeaders,'Content-Type':file.type,'Cache-Control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'}});
    }catch(error){
      if(error instanceof GameError)return json({error:error.message,code:error.code},error.status);
      if(error instanceof MathInputError)return json({error:error.message,code:'INVALID_ANSWER'},400);
      console.error('Math Bee request failed',error instanceof Error?error.name:'UnknownError');
      return json({error:'Ada gangguan sementara. Jawabanmu tidak akan dihitung dua kali. Coba lagi.',code:'SERVER_ERROR'},500);
    }
  },
};
