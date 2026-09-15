import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';

// Mechanical crop, alignment and resize of the generated sheet. Preserve its RGBA pixels.
const source=process.argv[2];
if(!source)throw Error('Pass the generated butterfly PNG.');
const target='public/art/life/dongho-butterflies-v1.png';
if(existsSync(target))throw Error('Version the target before replacing an accepted asset.');
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 const result=await page.evaluate(async url=>{
  const image=new Image();image.src=url;await image.decode();
  const source=document.createElement('canvas');source.width=image.width;source.height=image.height;
  const s=source.getContext('2d',{willReadFrequently:true});s.drawImage(image,0,0);
  const data=s.getImageData(0,0,source.width,source.height).data;
  const counts={zero:0,partial:0,opaque:0};
  for(let i=3;i<data.length;i+=4)counts[data[i]===0?'zero':data[i]===255?'opaque':'partial']++;
  if(counts.zero<data.length/4*.5)throw Error('Expected genuinely transparent background.');
  const bounds=[];
  // The source columns have different wing widths. Crop by whitespace, not an equal grid
  // which would cut the open wings; each runtime frame then has the same body pivot.
  const columns=[[0,640],[640,1120],[1120,1536]];
  for(let row=0;row<2;row++)for(let col=0;col<3;col++) {
   const [left,right]=columns[col];
   let x0=right,x1=left,y0=(row+1)*512,y1=row*512;
   for(let y=row*512;y<(row+1)*512;y++)for(let x=left;x<right;x++) {
    // Ignore near-invisible distant specks when measuring the silhouette, but
    // preserve the source alpha in the cropped image itself.
    if(data[(y*source.width+x)*4+3]>32) {x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
   }
   if(x0>=x1||y0>=y1)throw Error('Empty sprite.');
   bounds.push({x:x0,y:y0,w:x1-x0+1,h:y1-y0+1});
  }
  const atlas=document.createElement('canvas');atlas.width=192;atlas.height=128;
  const g=atlas.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';
  const frames=[];
  for(let row=0;row<2;row++) {
   const scale=52/bounds[row*3].w;
   for(let col=0;col<3;col++) {
    const b=bounds[row*3+col],w=b.w*scale,h=b.h*scale;
    g.drawImage(source,b.x,b.y,b.w,b.h,col*64+(64-w)/2,row*64+(64-h)/2,w,h);
    frames.push({row,col,width:w,height:h});
   }
  }
  const pixels=g.getImageData(0,0,192,128).data;
  let gutterInk=0;
  for(let y=0;y<128;y++)for(let x=0;x<192;x++)if((x%64<3||x%64>60||y%64<3||y%64>60)&&pixels[(y*192+x)*4+3])gutterInk++;
  if(gutterInk)throw Error('Non-transparent frame gutter.');
  return {png:atlas.toDataURL().split(',')[1],bounds,frames,alpha:counts,gutterInk};
 },'data:image/png;base64,'+readFileSync(source).toString('base64'));
 mkdirSync('public/art/life',{recursive:true});mkdirSync('output/butterflies',{recursive:true});
 const png=Buffer.from(result.png,'base64');writeFileSync(target,png);delete result.png;
 result.bytes=png.length;result.source=source;
 writeFileSync('output/butterflies/packing.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
