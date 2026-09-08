/** Static scenery bounds captured from the production conquest harness.
 * This microbenchmark cannot satisfy the separate whole-frame adoption gate. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';
const out=process.env.OUT??'output/a9-performance/spatial';await mkdir(out,{recursive:true});
const data=JSON.parse(await readFile(process.env.INPUT??'output/a9-performance/initial/results.json','utf8'));
const fixture=data.results.find(r=>r.bounds?.length);
const records=fixture.bounds;
const code=ts.transpileModule(await readFile('src/scenes/map/ViewIndex.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
await writeFile(`${out}/ViewIndex.mjs`,code);const {ViewIndex}=await import(pathToFileURL(path.resolve(`${out}/ViewIndex.mjs`)).href);
const overlaps=(a,b)=>!(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom);
const contains=(a,b)=>a.left<=b.left&&a.right>=b.right&&a.top<=b.top&&a.bottom>=b.bottom;
class LooseNode{
 constructor(cx,cy,size,depth=0){this.cx=cx;this.cy=cy;this.size=size;this.depth=depth;const h=size*.75;this.bounds={left:cx-h,right:cx+h,top:cy-h,bottom:cy+h};this.records=[];this.children=[];}
 add(r){
  if(this.depth<8&&this.size>128){const half=this.size/2,dx=r.x<this.cx?-1:1,dy=r.y<this.cy?-1:1,key=(dx+1)+(dy+1)/2;
   let child=this.children[key];if(!child)child=this.children[key]=new LooseNode(this.cx+dx*half/2,this.cy+dy*half/2,half,this.depth+1);
   if(contains(child.bounds,r.bounds)){child.add(r);return;}}
  this.records.push(r);
 }
 query(b,out){if(!overlaps(this.bounds,b))return;for(const r of this.records)if(overlaps(r.bounds,b))out.push(r);for(const c of this.children)if(c)c.query(b,out);}
}
const rect=(x,y,w,h)=>({x,y,width:w,height:h,left:x,top:y,right:x+w,bottom:y+h});
const entries=records.map((b,i)=>({id:String(i),kind:'node',object:{},x:b.x+b.width/2,y:b.y+b.height/2,radius:0,bounds:rect(b.x,b.y,b.width,b.height),setCulled(){}}));
const root=new LooseNode(4096,4096,16384);for(const e of entries)root.add(e);
const paths=fixture.samples.flatMap(s=>s.raw?.poses??[]).map(([x,y,w,h])=>rect(x,y,w,h));
if(!paths.length)for(let i=0;i<360;i++)paths.push(rect(400+Math.sin(i/40)*350,1100+Math.sin(i/31)*600,1920/.72,1080/.72));
const indices=[128,256,512].map(size=>{const grid=new ViewIndex(size);for(const e of entries)grid.set(e.id,e);return {name:`grid-${size}`,build:()=>{},query:b=>{grid.apply(b);return grid.visible;}}});
const visible=[];indices.push({name:'loose-quadtree',query:b=>{visible.length=0;root.query(b,visible);return visible;}});
const expected=paths.map(b=>entries.filter(e=>overlaps(e.bounds,b)).map(e=>e.id).sort());
for(const index of indices)for(let i=0;i<paths.length;i++)assert.deepEqual(index.query(paths[i]).map(e=>e.id).sort(),expected[i],`${index.name} visibility ${i}`);
const q=(a,p)=>a.sort((a,b)=>a-b)[Math.floor(a.length*p)];const results=[];
for(let run=0;run<5;run++)for(const index of run%2?[...indices].reverse():indices){
 for(let i=0;i<paths.length*2;i++)index.query(paths[i%paths.length]);
 const ms=[];let count=0;for(let i=0;i<paths.length*10;i++){const start=performance.now();count+=index.query(paths[i%paths.length]).length;ms.push(performance.now()-start);}
 results.push({run,index:index.name,p50:q(ms,.5),p95:q(ms,.95),count});
}
const result={bounds:records.length,views:paths.length,fixture:{pair:fixture.pair,quality:fixture.quality,version:fixture.version},recordedPaths:fixture.samples.some(s=>s.raw?.poses?.length),results,decision:'Keep grid-256 until a candidate also passes the whole-frame CPU p95 >=5% gate. Quadtree timing excludes grid visibility transition bookkeeping.'};
await writeFile(`${out}/results.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
