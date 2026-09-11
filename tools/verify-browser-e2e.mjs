#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {spawn,spawnSync} from "node:child_process";

const root=process.cwd();
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml"};

function findChrome(){
  if(process.env.CHROME_BIN&&fs.existsSync(process.env.CHROME_BIN))return process.env.CHROME_BIN;
  for(const name of ["google-chrome-stable","google-chrome","chromium","chromium-browser"]){
    const found=spawnSync("which",[name],{encoding:"utf8"});
    if(found.status===0&&found.stdout.trim())return found.stdout.trim();
  }
  for(const candidate of ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"]){if(fs.existsSync(candidate))return candidate;}
  throw new Error("Headless Chrome/Chromium not found. Set CHROME_BIN to certify browser flow.");
}

async function freePort(){
  return new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const address=server.address();const port=typeof address==="object"&&address?address.port:0;server.close(()=>resolve(port));});});
}

async function startServer(){
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url??"/","http://127.0.0.1");
      const relative=decodeURIComponent(url.pathname).replace(/^\/+/,"")||"tools/e2e/browser-fixture.html";
      const file=path.resolve(root,relative);
      if(!file.startsWith(root+path.sep))throw new Error("outside root");
      const stat=await fsp.stat(file);if(!stat.isFile())throw new Error("not file");
      res.writeHead(200,{"content-type":mime[path.extname(file)]??"application/octet-stream","cache-control":"no-store"});
      fs.createReadStream(file).pipe(res);
    }catch{res.writeHead(404,{"content-type":"text/plain"});res.end("not found");}
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const address=server.address();const port=typeof address==="object"&&address?address.port:0;
  return{server,origin:`http://127.0.0.1:${port}`};
}

class CDP{
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.listeners=new Map();ws.addEventListener("message",event=>{const message=JSON.parse(String(event.data));if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result??{});return;}for(const listener of this.listeners.get(message.method)??[])listener(message.params??{});});}
  send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.id;this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});}
  on(method,listener){const list=this.listeners.get(method)??[];list.push(listener);this.listeners.set(method,list);}
  async eval(expression){const out=await this.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(out.exceptionDetails)throw new Error(out.exceptionDetails.text??"browser evaluation failed");return out.result?.value;}
}

async function connect(url){
  const ws=new WebSocket(url);
  await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",()=>reject(new Error("DevTools websocket failed")),{once:true});});
  return new CDP(ws);
}

async function waitFor(fn,label,timeout=6000){
  const started=Date.now();let last;
  while(Date.now()-started<timeout){try{last=await fn();if(last)return last;}catch(error){last=error;}await sleep(40);}
  throw new Error(`Timed out waiting for ${label}${last instanceof Error?`: ${last.message}`:""}`);
}

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

const serverInfo=await startServer();
const chromePath=findChrome();
const debugPort=await freePort();
const userData=await fsp.mkdtemp(path.join(os.tmpdir(),"slu-e2e-chrome-"));
const chrome=spawn(chromePath,["--headless=new","--disable-gpu","--no-sandbox","--disable-dev-shm-usage",`--remote-debugging-port=${debugPort}`,`--user-data-dir=${userData}`,"about:blank"],{stdio:"ignore"});
let cdp;
const browserErrors=[];

try{
  const targets=await waitFor(async()=>{const response=await fetch(`http://127.0.0.1:${debugPort}/json/list`).catch(()=>null);if(!response?.ok)return null;const list=await response.json();return list.find(item=>item.type==="page"&&item.webSocketDebuggerUrl)??null;},"Chrome DevTools target",8000);
  cdp=await connect(targets.webSocketDebuggerUrl);
  cdp.on("Runtime.exceptionThrown",params=>browserErrors.push(params.exceptionDetails?.text??"uncaught exception"));
  cdp.on("Log.entryAdded",params=>{if(["error","warning"].includes(params.entry?.level))browserErrors.push(`${params.entry.level}: ${params.entry.text}`);});
  await cdp.send("Runtime.enable");await cdp.send("Page.enable");await cdp.send("Log.enable");
  await cdp.send("Page.navigate",{url:`${serverInfo.origin}/tools/e2e/browser-fixture.html`});
  await waitFor(()=>cdp.eval("globalThis.__SLU_E2E__?.ready===true"),"SLU fixture boot");

  const screen=()=>cdp.eval("document.querySelector('[data-screen-id]')?.dataset.screenId");
  const waitScreen=(id)=>waitFor(async()=>await screen()===id,`screen ${id}`);
  const click=async(id)=>{const ok=await cdp.eval(`(()=>{const el=document.querySelector('[data-choice-id=\"${id}\"]');if(!el)return false;el.click();return true;})()`);assert(ok,`choice ${id} missing`);};
  const key=async(keyName,code=keyName)=>{await cdp.send("Input.dispatchKeyEvent",{type:"keyDown",key:keyName,code});await cdp.send("Input.dispatchKeyEvent",{type:"keyUp",key:keyName,code});await sleep(80);};

  assert(await screen()==="title","fixture did not begin on title");
  await click("start");await waitScreen("main-menu");

  // Real keyboard path into Settings and back.
  await key("ArrowDown","ArrowDown");await key("ArrowDown","ArrowDown");await key("Enter","Enter");await waitScreen("settings");
  await key("Escape","Escape");await waitScreen("main-menu");

  await click("play");await waitScreen("mode-select");
  await click("score-attack");await waitScreen("stage-select");
  await click("stage-01");await waitScreen("gameplay-placeholder");
  assert(await cdp.eval("globalThis.__SLU_E2E__.app.shell.session.phase")==="playing","session did not enter playing");

  // Pause/settings/resume path using actual browser key events.
  await key("Escape","Escape");await waitScreen("pause");
  await click("settings");await waitScreen("settings");
  assert(await cdp.eval("document.querySelector('[data-back]')?.click(),true"),"settings back missing");await waitScreen("pause");
  await click("resume");await waitScreen("gameplay-placeholder");

  // Portrait and landscape viewport regression.
  await cdp.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
  assert(await cdp.eval("document.documentElement.clientWidth===390"),"portrait viewport mismatch");
  await cdp.send("Emulation.setDeviceMetricsOverride",{width:844,height:390,deviceScaleFactor:2,mobile:true});
  assert(await cdp.eval("document.documentElement.clientWidth===844"),"landscape viewport mismatch");
  await cdp.send("Emulation.clearDeviceMetricsOverride");

  await cdp.eval("globalThis.__SLU_E2E__.app.flow.showResults(),true");await waitScreen("results");
  await click("retry");await waitScreen("gameplay-placeholder");
  await key("Escape","Escape");await waitScreen("pause");
  await click("quit");await waitScreen("main-menu");
  assert(await cdp.eval("globalThis.__SLU_E2E__.app.shell.session.phase")==="menu","quit did not return session to menu");

  if(browserErrors.length)throw new Error(`Browser console/runtime errors:\n${browserErrors.join("\n")}`);
  console.log("PASS browser-e2e: title -> settings -> play -> pause -> settings -> resume -> results -> retry -> quit");
  console.log("PASS browser-e2e: portrait + landscape viewport overrides");
}catch(error){
  console.error("BROWSER E2E FAILED");console.error(error);process.exitCode=1;
}finally{
  try{cdp?.ws?.close();}catch{}
  chrome.kill("SIGKILL");
  await new Promise(resolve=>serverInfo.server.close(resolve));
  await fsp.rm(userData,{recursive:true,force:true});
}
