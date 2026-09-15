import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const source=process.argv[2];
if(!source)throw Error('Pass the generated opaque wet-paddy material.');
const targets=[0,1].map(page=>`public/art/ground/dongho-wet-rice-v2-${page}.webp`);
if(targets.some(existsSync))throw Error('Version a replacement; preserve the existing atlas.');
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 const result=await page.evaluate(async url=>{
  const image=new Image();image.src=url;await image.decode();
  const R=64,fw=128,fh=144,dx=Math.sqrt(3)*R,dy=1.5*R;
  const dirs=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  const centre=([q,r])=>[dx*(q+r/2),dy*r];
  const corners=([cx,cy],radius=R)=>Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return[cx+Math.cos(a)*radius,cy+Math.sin(a)*radius];});
  const key=([q,r])=>q+','+r;
  const distance=(x,y,a,b)=>{const vx=b[0]-a[0],vy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy)));return Math.hypot(x-a[0]-t*vx,y-a[1]-t*vy);};
  const atlas=document.createElement('canvas');atlas.width=2048;atlas.height=2304;
  const a=atlas.getContext('2d',{willReadFrequently:true});
  const cell=document.createElement('canvas');cell.width=fw;cell.height=fh;
  const g=cell.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';
  const phases=[];
  for(let phase=0;phase<4;phase++){
   const col=phase%2,row=Math.floor(phase/2),wx=(col+row/2)*dx,wy=row*dy;
   g.clearRect(0,0,fw,fh);g.save();g.beginPath();
   corners([fw/2,fh/2],R+0.65).forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.clip();
   for(let ry=-1;ry<=1;ry++)for(let rx=-1;rx<=1;rx++)g.drawImage(image,fw/2-wx+rx*dx*2,fh/2-wy+ry*dy*2,dx*2,dy*2);
   g.restore();phases.push(g.getImageData(0,0,fw,fh));
  }
  // Each mask removes the fade on shared field edges. Only the perimeter of
  // the union fades into surrounding earth; an interior tile has no border.
  for(let mask=0;mask<64;mask++){
   const cells=[[0,0],...dirs.filter((_,i)=>mask&(1<<i))],members=new Set(cells.map(key));
   const edges=[];
   for(const c of cells){const p=corners(centre(c));for(let e=0;e<6;e++)if(!members.has(key([c[0]+dirs[e][0],c[1]+dirs[e][1]])))edges.push([p[e],p[(e+1)%6]]);}
   const fade=new Float32Array(fw*fh);
   for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
    let d=Infinity;for(const [p,q]of edges)d=Math.min(d,distance(x+.5-fw/2,y+.5-fh/2,p,q));
    const t=Math.min(1,d/14);fade[y*fw+x]=t*t*(3-2*t);
   }
   for(let phase=0;phase<4;phase++){
    const pixels=new ImageData(new Uint8ClampedArray(phases[phase].data),fw,fh);
    for(let i=0;i<fade.length;i++)pixels.data[i*4+3]=Math.round(pixels.data[i*4+3]*fade[i]);
    const frame=mask*4+phase;a.putImageData(pixels,frame%16*fw,Math.floor(frame/16)*fh);
   }
  }
  const p=a.getImageData(0,0,atlas.width,atlas.height).data;
  let gutterInk=0;for(let y=0;y<atlas.height;y++)for(let x=0;x<atlas.width;x++)if((x%fw<2||x%fw>=fw-2||y%fh<2||y%fh>=fh-2)&&p[(y*atlas.width+x)*4+3])gutterInk++;
  if(gutterInk)throw Error('Frame gutters must remain transparent.');
  const pages=[];
  for(let i=0;i<2;i++){const p=document.createElement('canvas');p.width=2048;p.height=1152;p.getContext('2d').drawImage(atlas,0,i*1152,2048,1152,0,0,2048,1152);pages.push(p.toDataURL('image/webp',.96).split(',')[1]);}
  return {pages,pageSize:[2048,1152],frame:[fw,fh],frames:256,decodedBytes:atlas.width*atlas.height*4,gutterInk};
 },'data:image/png;base64,'+readFileSync(source).toString('base64'));
 const pages=result.pages.map(data=>Buffer.from(data,'base64'));delete result.pages;
 mkdirSync('public/art/ground',{recursive:true});mkdirSync('output/rice-ground',{recursive:true});
 pages.forEach((bytes,i)=>writeFileSync(targets[i],bytes));Object.assign(result,{source,targets,bytes:pages.reduce((n,b)=>n+b.length,0)});
 writeFileSync('output/rice-ground/packing.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
