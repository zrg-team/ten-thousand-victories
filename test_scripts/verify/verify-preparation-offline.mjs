import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.DEV_URL??'http://127.0.0.1:5193/ten-thousand-victories/';
const manifest=JSON.parse(await readFile(process.env.MANIFEST??'output/a9-performance/release/manifest.json','utf8'));
const asset=manifest.build.find(f=>f.path.includes('mapPreparation.worker-')).path;
const browser=await chromium.launch({headless:false}),page=await browser.newPage(),responses=[];
try{
 page.on('response',r=>{if(r.url().includes('mapPreparation.worker-'))responses.push({url:r.url(),status:r.status(),serviceWorker:r.fromServiceWorker()})});
 await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
 await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const cached=await page.evaluate(async asset=>{const keys=await caches.keys();for(const key of keys){const cache=await caches.open(key);if(await cache.match(new URL(asset,location.href)))return key;}return null;},asset);
 assert(cached,'hashed worker exists in PWA shell cache');await page.context().setOffline(true);
 const reply=await page.evaluate(asset=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(asset,location.href),{type:'module'}),buffer=new Float64Array([7,0xff00ff,1,3,0,0,512,512]).buffer;
  const timeout=setTimeout(()=>{worker.terminate();reject(Error('offline worker timeout'))},10000);
  worker.onerror=()=>{clearTimeout(timeout);worker.terminate();reject(Error('offline worker failed'))};
  worker.onmessage=e=>{clearTimeout(timeout);worker.terminate();resolve({id:e.data.id,generation:e.data.generation,revision:e.data.revision,cells:e.data.cells?.length,error:e.data.error})};
  worker.postMessage({kind:'partition',id:73,generation:5,revision:8,buffer,matrix:[1,0,0,1,0,0]},[buffer]);
 }),asset);
 assert(reply.cells>0&&!reply.error);assert.equal(reply.id,73);assert.equal(reply.generation,5);assert.equal(reply.revision,8);
 await mkdir('output/a9-performance/offline',{recursive:true});await writeFile('output/a9-performance/offline/results.json',JSON.stringify({cached,asset,reply,responses},null,2));console.log(JSON.stringify({cached,asset,reply,responses}));
}finally{await browser.close();}
