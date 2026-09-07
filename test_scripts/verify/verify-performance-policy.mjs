import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ stdin: { contents: "export { FramePacer } from './src/game/framePacer.ts'; export { ViewIndex } from './src/scenes/map/ViewIndex.ts'; export { selectLaunchProfile } from './src/game/launchGraphics.ts'; export { RUNGS } from './src/game/qualityRungs.ts';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const { FramePacer, ViewIndex, selectLaunchProfile, RUNGS } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
for (const hz of [60, 90, 120, 144]) for (const fps of [30, 40, 60]) {
  const pacer = new FramePacer(); let elapsed = 0, frames = 0, last = 0;
  pacer.next(0, fps);
  for (let i = 1; i <= hz * 60; i++) { const time = i * 1000 / hz, delta = pacer.next(time, fps); if (delta !== undefined) { elapsed += delta; frames++; last = time; } }
  assert.ok(Math.abs(frames - fps * 60) <= 1, `${hz}/${fps}: ${frames} frames`);
  assert.ok(Math.abs(elapsed - last) < .001, `${hz}/${fps}: ${elapsed} elapsed vs ${last}`);
  assert.ok(60000 - elapsed < 1000 / fps + 1);
  console.log(`${hz} Hz -> ${fps} FPS: ${frames} frames; ${elapsed.toFixed(3)} ms simulation`);
  pacer.reset(); assert.equal(pacer.next(900000, fps), 0, 'resume excludes background time');
}
const index = new ViewIndex(256), changes = [];
index.set('wide', { kind: 'node', x: 600, y: 600, radius: 10, bounds: { left: 100, right: 700, top: 100, bottom: 700 }, setCulled: c => changes.push(c) });
index.apply({ x: 0, y: 0, right: 200, bottom: 200 }); assert.equal(index.culledCount, 0, 'full bounds cross grid cells');
index.apply({ x: 900, y: 900, right: 950, bottom: 950 }); assert.equal(index.culledCount, 1);
index.apply({ x: 900, y: 900, right: 950, bottom: 950 }); assert.deepEqual(changes, [true], 'no repeat callbacks');
index.apply({ x: 0, y: 0, right: 200, bottom: 200 }); assert.deepEqual(changes, [true, false]);
index.setSuppressed(['node']); index.apply({ x: 0, y: 0, right: 200, bottom: 200 }); assert.equal(index.culledCount, 1);
index.remove('wide'); assert.equal(index.size, 0);
const fit = profile => ({ profile, frames: 30, gapP90: 16.7, workP90: 8 });
assert.equal(selectLaunchProfile([fit('high'), fit('medium')], true), 'high');
assert.equal(selectLaunchProfile([fit('high'), fit('medium')], false), 'medium');
assert.equal(selectLaunchProfile([{...fit('high'),gapP90:25},fit('medium')], true), 'medium');
assert.equal(selectLaunchProfile([{...fit('medium'),workP90:18}], true), 'clarity');
assert.equal(selectLaunchProfile([], true), 'clarity');
const clarity = RUNGS.find(r => r.id === 'clarity'), medium = RUNGS.find(r => r.id === 'medium');
assert.equal(clarity.scale,medium.scale); assert.equal(clarity.bakeScale,medium.bakeScale); assert.equal(clarity.fps,40);
console.log('PASS: pacing, elapsed clock, bounds, visibility transitions and clarity floor');

// Use prototype getters, as Phaser Rectangle does, rather than a plain edge object.
class Rectangle { constructor(x,y,w,h){Object.assign(this,{x,y,width:w,height:h});} get left(){return this.x;} get right(){return this.x+this.width;} get top(){return this.y;} get bottom(){return this.y+this.height;} }
const precise = new ViewIndex(256), rect = new Rectangle(200,200,20,20), object = {}, calls = [];
precise.set('tree',{kind:'node',object,x:210,y:210,radius:10,bounds:rect,setCulled:c=>calls.push(c)});
precise.apply(new Rectangle(0,0,50,50));
assert.deepEqual(calls,[true],'a rectangle in the same cell but outside the viewport must be culled');
rect.x = 0; // Registration owns its bounds snapshot.
precise.apply(new Rectangle(0,0,50,50)); assert.equal(precise.culledCount,1);
precise.apply(new Rectangle(205,205,30,30)); assert.deepEqual(calls,[true,false]);
precise.apply(new Rectangle(0,0,50,50));
let replacementHidden = false;
precise.set('tree',{kind:'node',object,x:210,y:210,radius:10,bounds:new Rectangle(200,200,20,20),setCulled:c=>replacementHidden=c});
assert.equal(replacementHidden,true,'retained bounds must apply culling to replacement ink');
precise.apply(new Rectangle(205,205,30,30)); assert.equal(replacementHidden,false);
console.log('PASS: Phaser rectangle getters, owned bounds, replacement ink');
// Compare the optimized grid against a brute-force viewport oracle across pans,
// moves, removals, LOD changes and re-registration of a previously removed id.
const sweep = new ViewIndex(64), records = new Map();
let seed = 1337; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2**32; };
const place = id => {
 const data = { object: {}, bounds: new Rectangle(Math.floor(random()*1400)-200, Math.floor(random()*1400)-200, 15+random()*220, 15+random()*220), hidden: false, kind: random()<.2?'label':'node' };
 records.set(id,data);
 sweep.set(id,{kind:data.kind,object:data.object,x:data.bounds.x,y:data.bounds.y,radius:5,bounds:data.bounds,setCulled:c=>data.hidden=c});
};
for(let i=0;i<300;i++)place(String(i));
for(let frame=0;frame<100;frame++){
 const view=new Rectangle(Math.floor(random()*1000),Math.floor(random()*1000),200+random()*350,180+random()*280);
 const suppress=frame%9===0; sweep.setSuppressed(suppress?['label']:[]);
 if(frame%5===0){const id=String(frame);sweep.remove(id);records.delete(id);place(id);}
 if(frame%7===0){const id=String(frame+150),r=records.get(id);r.bounds.x+=300;sweep.set(id,{kind:r.kind,object:r.object,x:r.bounds.x,y:r.bounds.y,radius:5,bounds:r.bounds,setCulled:c=>r.hidden=c});}
 if(frame%13===0)sweep.showAll();
 sweep.apply(view,8);
 for(const [id,r]of records){const b=r.bounds;const expected=(suppress&&r.kind==='label')||b.right<view.left-8||b.left>view.right+8||b.bottom<view.top-8||b.top>view.bottom+8;assert.equal(r.hidden,expected,`sweep ${frame}, object ${id}`);}
}
console.log('PASS: 30,000 spatial-query checks against brute-force visibility');

assert.equal(selectLaunchProfile([{...fit('high'),workP90:8,workScale:2.5},{...fit('medium'),workP90:4,workScale:2.5}],true),'medium','launch rendering must leave headroom for the full scene');
assert.equal(selectLaunchProfile([{...fit('medium'),workP90:7,workScale:2.5}],true),'clarity','an overloaded Balanced probe chooses the clear 40 FPS profile');
