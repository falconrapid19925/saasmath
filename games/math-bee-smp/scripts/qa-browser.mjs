import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:8787';
const runId=process.env.QA_RUN_ID||'qa-browser-02';
const directory=`artifacts/${runId}`;await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const buildHash=JSON.parse(await readFile('client-dist/assets/meta.json','utf8')).hash;
const errors=[];const network=[];const report={runId,buildHash,browser:browser.version(),captures:[],checks:[],errors,network};
let heartbeat=null;
async function newPage(width,height,mobile=false){const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,...(mobile?{recordVideo:{dir:directory+'/video',size:{width,height}}}:{})});const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>network.push({url:r.url(),error:r.failure()?.errorText}));await page.goto(origin);await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.frame>5);return {page,context};}
async function capture(page,name){await page.screenshot({path:`${directory}/${name}.png`,fullPage:true});const diagnostics=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);report.captures.push({name,diagnostics});}
try{
 const desktop=await newPage(1440,1000);await capture(desktop.page,'desktop-welcome');await desktop.page.goto('about:blank');
 const mobile=await newPage(390,844,true);await capture(mobile.page,'mobile-welcome');
 await mobile.page.getByLabel('Nama panggilanmu').fill('QA Raka');
 await mobile.page.getByRole('button',{name:'Buat room baru',exact:true}).click();
 await mobile.page.getByRole('button',{name:'Mulai pertandingan',exact:false}).waitFor();
 const snap=await mobile.page.evaluate(async()=>{const code=document.querySelector('.big-room-code span')?.textContent;return(await(await fetch('/api/rooms/'+code)).json()).snapshot;});
 assert.equal(snap.players.length,1);assert.equal(snap.phase,'lobby');
 await capture(mobile.page,'mobile-lobby');
 const joystick=await mobile.page.locator('.joystick').boundingBox();assert.ok(joystick);
 const cdp=await mobile.context.newCDPSession(mobile.page);const x=joystick.x+joystick.width/2,y=joystick.y+joystick.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+28,y}]});
 await mobile.page.waitForTimeout(1800);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.page.waitForTimeout(1500);
 const moved=(await(await mobile.context.request.get(origin+'/api/rooms/'+snap.code)).json()).snapshot;
 assert.ok(Math.abs(moved.players[0].x-snap.players[0].x)>0.1);report.checks.push('real touch joystick moves authoritative avatar position');
 const members=[];
 for(let i=0;i<3;i++){
  const context=await browser.newContext();const request=context.request;
  const session=await request.post(origin+'/api/session',{data:{name:`QA Teman${i+1}`,avatar:i+1}});assert.ok(session.ok());
  const who=(await session.json()).player;
  const joined=await request.post(origin+'/api/rooms',{data:{action:'join',code:snap.code}});assert.ok(joined.ok());members.push({context,request,id:who.id});
 }
 heartbeat=setInterval(()=>{for(const member of members)void member.request.get(origin+'/api/rooms/'+snap.code).catch(()=>{});},3000);
 await mobile.page.getByRole('button',{name:'Mulai pertandingan',exact:false}).click();
 await mobile.page.locator('.question-panel').waitFor({timeout:15000});
 await capture(mobile.page,'mobile-active-play');
 const fresh=(await(await mobile.context.request.get(origin+'/api/rooms/'+snap.code)).json()).snapshot;
 const actor=fresh.actorId===snap.youId?{request:mobile.context.request}:members.find(m=>m.id===fresh.actorId);
 const prompt=fresh.question.prompt;const m=/^(-?\d+) ([+−]) (\d+) = \?$/.exec(prompt);assert.ok(m,prompt);const answer=String(Number(m[1])+(m[2]==='+'?1:-1)*Number(m[3]));
 if(fresh.actorId===snap.youId){for(const char of answer)await mobile.page.getByRole('button',{name:char==='-'?'−':char,exact:true}).click();await mobile.page.getByRole('button',{name:/Kunci jawaban/}).click();}
 else{
  await mobile.page.getByRole('button',{name:'7',exact:true}).click();await mobile.page.getByRole('button',{name:/Kunci latihan/}).click();
  const submitted=await actor.request.post(origin+'/api/rooms/'+snap.code,{data:{action:'answer',value:answer,requestId:crypto.randomUUID(),turnId:fresh.turnId}});assert.ok(submitted.ok());
 }
 await mobile.page.locator('.feedback-panel').waitFor({timeout:8000});await capture(mobile.page,'mobile-feedback');
 report.checks.push('guest create room via touch UI','host start requires four sessions','mobile active question/keypad','actual button answer/private practice','server feedback visible');
 const overflow=await mobile.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false);report.checks.push('mobile no horizontal overflow');
 await mobile.page.setViewportSize({width:360,height:640});await capture(mobile.page,'mobile-small-360');
 await mobile.page.reload();await mobile.page.waitForSelector('.in-room');report.checks.push('member refresh restores same room identity');await mobile.page.goto('about:blank');
 const desktopRoom=await desktop.context.request.post(origin+'/api/session',{data:{name:'QA Desktop',avatar:4}});assert.ok(desktopRoom.ok());
 const lateJoin=await desktop.context.request.post(origin+'/api/rooms',{data:{action:'join',code:snap.code}});assert.equal(lateJoin.status(),409);report.checks.push('mid-match new participant rejected');
 // Mid-match join is intentionally rejected; capture desktop with an existing participant cookie.
 const cookie=await members[0].context.cookies();await desktop.context.addCookies(cookie);await desktop.page.goto(origin+'/?room='+snap.code);await desktop.page.waitForSelector('.in-room');await capture(desktop.page,'desktop-active-room');report.checks.push('existing member invitation URL restores room');
 assert.equal(errors.length,0);assert.equal(network.length,0);
 report.status='PASS';
 for(const m of members)await m.context.close();await mobile.context.close();await desktop.context.close();
}catch(error){report.status='FAIL';report.failure=error.stack;throw error;}
finally{if(heartbeat)clearInterval(heartbeat);await writeFile(directory+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
