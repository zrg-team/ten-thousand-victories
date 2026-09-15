import {chromium} from 'playwright';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const source=process.argv[2],target='public/art/ground/dongho-rice-seasons-v3.webp';
if(!source)throw Error('Pass the generated four-season 2x2 material sheet.');
if(existsSync(target))throw Error('Version a replacement; preserve the current asset.');
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 const data=await page.evaluate(async url=>{
  const image=new Image();image.src=url;await image.decode();
  const c=document.createElement('canvas');c.width=768;c.height=512;
  const g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(image,0,0,c.width,c.height);
  return c.toDataURL('image/webp',.94).split(',')[1];
 },'data:image/png;base64,'+readFileSync(source).toString('base64'));
 writeFileSync(target,Buffer.from(data,'base64'));console.log(target);
}finally{await browser.close();}
