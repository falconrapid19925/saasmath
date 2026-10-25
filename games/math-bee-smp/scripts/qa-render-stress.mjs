import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:8787';
const dir='artifacts/qa-render-01';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
let heartbeat;const contexts=[];const errors=[];
try{
 for(let i=0;i<8;i++){
  const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(c);
  const r=await c.request.post(origin+'/api/session',{data:{name:`QA View${i+1}`,avatar:i%6}});assert.ok(r.ok());
 }
 let r=await contexts[0].request.post(origin+'/api/rooms',{data:{action:'create'}});assert.ok(r.ok());const code=(await r.json()).snapshot.code;
 for(let i=1;i<8;i++){r=await contexts[i].request.post(origin+'/api/rooms',{data:{action:'join',code}});assert.ok(r.ok());}
 heartbeat=setInterval(()=>{for(const c of contexts)void c.request.get(origin+'/api/rooms/'+code).catch(()=>{});},3000);
 const page=await contexts[0].newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?room='+code);await page.waitForSelector('.in-room');
 await page.getByRole('button',{name:'Mulai pertandingan'}).click();await page.waitForSelector('.question-panel');
 await page.waitForFunction(()=>Object.keys(window.__THREE_GAME_DIAGNOSTICS__?.playerPositions||{}).length===8);
 await page.screenshot({path:dir+'/mobile-eight-players.png',fullPage:true});
 const diagnostics=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
 assert.equal(Object.keys(diagnostics.playerPositions).length,8);assert.ok(diagnostics.info.render.calls<=150);assert.ok(diagnostics.info.render.triangles<=300000);assert.ok(diagnostics.info.memory.geometries<=200);assert.ok(diagnostics.info.memory.textures<=40);assert.equal(errors.length,0);
 const report={status:'PASS',buildHash:JSON.parse(await readFile('client-dist/assets/meta.json','utf8')).hash,viewport:{width:390,height:844},avatarCount:8,diagnostics,errors,limitation:'SwiftShader software rendering; FPS is not evidence of physical phone performance.'};
 await writeFile('artifacts/render-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(heartbeat)clearInterval(heartbeat);await browser.close();}
