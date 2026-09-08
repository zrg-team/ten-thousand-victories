/** Run the installed web-game skill client against a seeded, settled conquest.
 * A loopback-only test proxy injects bootstrap hooks; production files stay intact. */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {FIRST_OPTION} from '../perf/_boot.mjs';
const upstream=process.env.DEV_URL??'http://127.0.0.1:5179/';
const out=process.env.OUT??'output/a9-performance/skill-client';await mkdir(out,{recursive:true});
const bootstrap=`<script type="module">
const wait=()=>new Promise(r=>setTimeout(r,20));
while(!window.__phaserGame?.scene.isActive('MenuScene'))await wait();
window.__startBenchGame(20260812,'ascent');
while(!window.__phaserGame.scene.getScene('ConquestUIScene')?.ui)await wait();
const first=${FIRST_OPTION};let n=0;while(window.__mandateState.pendingAscentPrompt&&n++<12)window.__performanceBench.resolve(first(window.__mandateState.pendingAscentPrompt));
const s=window.__phaserGame.scene.getScene('ConquestScene');s.state.isStrategyPause=true;s.refresh();
while(true){const p=s.performanceStats();if(!p.refreshPending&&!p.sceneryPending&&!p.ground.pending&&!p.fog.pending)break;await wait();}
const button=document.createElement('button');button.id='skill-ready';button.textContent='Ready';button.style='position:fixed;top:0;left:0;z-index:99999';button.onclick=()=>button.remove();document.body.appendChild(button);
</script>`;
const server=createServer(async(req,res)=>{try{const response=await fetch(new URL(req.url,upstream));res.statusCode=response.status;const type=response.headers.get('content-type')??'';res.setHeader('content-type',type);
 // The skill client first reads canvas.toDataURL. WebGL clears that backbuffer
 // after presentation; returning empty for the game canvas selects the client's
 // compositor screenshot fallback without changing WebGL context attributes.
 if(type.includes('text/html')){const html=(await response.text()).replace('<head>','<head><script>localStorage.setItem("mandate:graphics:v1","high");localStorage.setItem("mandate:layout:v1","desktop");const readCanvas=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(...args){return this===window.__phaserGame?.canvas?"":readCanvas.apply(this,args);};</script>');res.end(html.replace('</body>',bootstrap+'</body>'));}
 else res.end(Buffer.from(await response.arrayBuffer()));}catch(e){res.statusCode=502;res.end(String(e));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const actions={steps:[{buttons:[],frames:4},{buttons:['left_mouse_button'],frames:2,mouse_x:750,mouse_y:340},{buttons:['left_mouse_button'],frames:12,mouse_x:610,mouse_y:390},{buttons:[],frames:8},{buttons:['left'],frames:8},{buttons:['right'],frames:8}]};
await writeFile(`${out}/actions.json`,JSON.stringify(actions));
const client=process.env.WEB_GAME_CLIENT??path.join(process.env.USERPROFILE,'.codex','skills','develop-web-game','scripts','web_game_playwright_client.js');
try{const url=new URL(upstream);url.host=`127.0.0.1:${server.address().port}`;url.searchParams.set('bench','1');url.searchParams.set('retainedpaths','1');
 const child=spawn(process.execPath,[client,'--url',url.href,'--headless','false','--click-selector','#skill-ready','--actions-file',`${out}/actions.json`,'--iterations','2','--pause-ms','500','--screenshot-dir',`${out}/client`],{stdio:'inherit'});process.exitCode=await new Promise(resolve=>child.on('exit',resolve));
}finally{server.closeAllConnections();server.close();}
