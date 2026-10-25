import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { localD1 } from './local-d1.mjs';
import worker from '../dist/server/index.js';
await mkdir('.sites-runtime',{recursive:true});
const DB=localD1('.sites-runtime/game.sqlite');
DB.sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
for(const entry of journal.entries){
  if(!DB.sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(entry.tag)){
    DB.sqlite.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));
    DB.sqlite.prepare('INSERT INTO _local_migrations(name) VALUES (?)').run(entry.tag);
  }
}
const port=Number(process.env.PORT||8787);
const server=createServer(async(req,res)=>{
  try{
    const origin=`http://127.0.0.1:${port}`;
    let length=0;const chunks=[];
    for await(const chunk of req){length+=chunk.length;if(length>4096){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
    const request=new Request(new URL(req.url||'/',origin),{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    const response=await worker.fetch(request,{DB},{waitUntil(p){p.catch(()=>{});}});
    const headers=Object.fromEntries(response.headers.entries());
    res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local server error'}));}
});
server.requestTimeout=12_000;
server.listen(port,'127.0.0.1',()=>console.log(`Math Bee local production preview: http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{DB.sqlite.close();process.exit(0);}));
