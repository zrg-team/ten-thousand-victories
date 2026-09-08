/** Budget fairness without a GPU: idle or disposed clients must not reserve frame time. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { EventEmitter } from 'node:events';
const bundle=await build({stdin:{contents:"export { mapWork, registerMapWork } from './src/scenes/map/mapWorkBudget.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,
  plugins:[{name:'fixed-test-profile',setup(build){
    build.onResolve({filter:/qualityLadder$/},()=>({path:'profile',namespace:'test-profile'}));
    build.onLoad({filter:/.*/,namespace:'test-profile'},()=>({contents:'export function qualityLadder(){return {targetFps:()=>globalThis.testFps};}',loader:'js'}));
  }}]});
const {mapWork,registerMapWork}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
for(const [fps,allowance] of [[60,3],[40,4.5],[30,6],[Infinity,3]]) {
  globalThis.testFps=fps;
  const scene={time:{now:0},game:{events:new EventEmitter()},events:new EventEmitter()};let second=false,quota=0;
  const realPerformance=globalThis.performance;let clock=0;
  globalThis.performance={now:()=>clock};
  const stopFirst=registerMapWork(scene,()=>true),stopSecond=registerMapWork(scene,()=>second);
  // A busy frame falls back to the original bounded allowance.
  scene.game.events.emit('prestep');clock+=40;scene.game.events.emit('postrender');
  const next=()=>{scene.time.now++;mapWork(scene,remaining=>quota=remaining);return quota;};
  assert.equal(next(),allowance,'one active queue receives the full budget');
  second=true;assert.equal(next(),allowance/2,'two active queues share it');
  stopSecond();assert.equal(next(),allowance,'shutdown releases its reservation');
  stopFirst();
  // Sustained spare headroom may finish useful work sooner, but cannot grow the
  // per-frame allowance without bound. Multiple clients still share one budget.
  const stop=registerMapWork(scene,()=>true);
  for(let i=0;i<80;i++){scene.time.now++;scene.game.events.emit('prestep');clock+=2;scene.game.events.emit('postrender');}
  const spare=next();assert(spare>=allowance&&spare<=8);
  if(Number.isFinite(fps))assert(spare>allowance,'spare headroom is used');
  scene.time.now++;
  mapWork(scene,()=>{clock+=12;});mapWork(scene,remaining=>assert.equal(remaining,0,'overshooting primitive exhausts shared frame allowance'));
  stop();scene.events.emit('shutdown');
  assert.equal(scene.game.events.listenerCount('prestep')+scene.game.events.listenerCount('postrender'),0,'scene shutdown releases timing hooks');
  globalThis.performance=realPerformance;
}
console.log('PASS busy-frame floor, bounded headroom, active-queue fairness, overshoot and cleanup at 30/40/60 FPS and full refresh');
