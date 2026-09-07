/** Budget fairness without a GPU: idle or disposed clients must not reserve frame time. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=await build({stdin:{contents:"export { mapWork, registerMapWork } from './src/scenes/map/mapWorkBudget.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,
  plugins:[{name:'fixed-test-profile',setup(build){
    build.onResolve({filter:/qualityLadder$/},()=>({path:'profile',namespace:'test-profile'}));
    build.onLoad({filter:/.*/,namespace:'test-profile'},()=>({contents:'export function qualityLadder(){return {targetFps:()=>globalThis.testFps};}',loader:'js'}));
  }}]});
const {mapWork,registerMapWork}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
for(const [fps,allowance] of [[60,3],[40,4.5],[30,6],[Infinity,3]]) {
  globalThis.testFps=fps;
  const scene={time:{now:0}};let second=false,quota=0;
  const stopFirst=registerMapWork(scene,()=>true),stopSecond=registerMapWork(scene,()=>second);
  const next=()=>{scene.time.now++;mapWork(scene,remaining=>quota=remaining);return quota;};
  assert.equal(next(),allowance,'one active queue receives the full budget');
  second=true;assert.equal(next(),allowance/2,'two active queues share it');
  stopSecond();assert.equal(next(),allowance,'shutdown releases its reservation');
  stopFirst();
}
console.log('PASS active-queue fairness and cleanup at 30/40/60 FPS and full refresh');
