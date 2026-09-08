/** OffscreenCanvas prototype using the game's actual prepared chunk commands. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {startWorld,resolveOpening} from './_boot.mjs';
const out=process.env.OUT??'output/a9-performance/canvas-worker';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1280,height:800}});
try{
 await page.routeWebSocket('**/*',s=>s.close());await page.goto('http://127.0.0.1:5179/?bench=1');await page.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
 await startWorld(page,{mode:'ascent',seed:20260812});await resolveOpening(page);await page.evaluate(()=>window.__mandateState.isStrategyPause=true);
 await page.waitForFunction(()=>{const p=window.__phaserGame.scene.getScene('ConquestScene').performanceStats();return !p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending;},null,{timeout:180000});
 const results=await page.evaluate(async()=>{
  const {rasterChunk}=await import('/src/scenes/map/ChunkRaster.ts');const {default:WorkerClass}=await import('/src/scenes/map/mapPreparation.worker.ts?worker');
  const worker=new WorkerClass(),s=window.__phaserGame.scene.getScene('ConquestScene'),layer=s.groundChunks,rows=[];
  const ask=chunk=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('worker timeout')),10000);worker.onmessage=e=>{clearTimeout(timeout);resolve(e.data)};worker.onerror=reject;worker.postMessage({kind:'raster',id:1,generation:1,revision:1,chunk});});
  // Separate staging GL context: uploading a prototype must not corrupt Phaser's state.
  const staging=new OffscreenCanvas(1,1),gl=staging.getContext('webgl2');
  try{for(const [key,tile] of layer.tiles){
   const parts=layer.plans.get(key);if(!parts.length||parts.some(p=>!p.commands)){rows.push({key,unsupported:'non-Graphics part'});continue;}
   const box=layer.rectangle(key),scale=layer.scale,pad=2;
   const chunk={width:tile.target.width,height:tile.target.height,parts:parts.map(p=>{const m=p.source.getWorldTransformMatrix(),matrix=[m.a*scale,m.b*scale,m.c*scale,m.d*scale,m.tx*scale+pad-box.x*scale,m.ty*scale+pad-box.y*scale];m.destroy();return {matrix,alpha:p.source.alpha,commands:p.commands};})};
   const runs=[];
   for(let run=0;run<5;run++){
    let bitmap,canvas;
    try{
     const t0=performance.now();canvas=rasterChunk(chunk);const mainRasterMs=performance.now()-t0;
     const t1=performance.now(),reply=await ask(chunk);const roundTripMs=performance.now()-t1;
     if(reply.error){runs.push({error:reply.error});break;}bitmap=reply.bitmap;
     const t2=performance.now(),texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);const uploadSubmissionMs=performance.now()-t2;gl.deleteTexture(texture);
     // Pixel comparison is outside the timing samples and includes Canvas vs Phaser WebGL.
     const ctx=canvas.getContext('2d'),main=ctx.getImageData(0,0,chunk.width,chunk.height).data;ctx.clearRect(0,0,chunk.width,chunk.height);ctx.drawImage(bitmap,0,0);const off=ctx.getImageData(0,0,chunk.width,chunk.height).data;
     const reference=await new Promise(resolve=>tile.target.texture.snapshot(image=>resolve(image)));
     ctx.clearRect(0,0,chunk.width,chunk.height);ctx.drawImage(reference,0,0);const webgl=ctx.getImageData(0,0,chunk.width,chunk.height).data;
     let workerDiff=0,webglDiff=0,maxDelta=0;for(let i=0;i<main.length;i++){workerDiff+=main[i]!==off[i]?1:0;webglDiff+=Math.abs(main[i]-webgl[i])>2?1:0;maxDelta=Math.max(maxDelta,Math.abs(main[i]-webgl[i]));}
     runs.push({mainRasterMs,rasterMs:reply.rasterMs,roundTripMs,transferAndSchedulingMs:roundTripMs-reply.rasterMs,uploadSubmissionMs,completionMs:roundTripMs+uploadSubmissionMs,workerDiff,webglDiff,maxDelta,stagingBytes:chunk.width*chunk.height*8});
    }catch(e){runs.push({error:String(e)});break;}finally{bitmap?.close();}
   }
   rows.push({key,width:chunk.width,height:chunk.height,runs});if(rows.filter(r=>r.runs).length>=8)break;
  }}finally{worker.terminate();gl.getExtension('WEBGL_lose_context')?.loseContext();}
  return rows;
 });
 await writeFile(`${out}/results.json`,JSON.stringify({results,enabled:false,decision:'Experimental only; require visual parity with Phaser WebGL and end-to-end preparation gates before enabling.'},null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
