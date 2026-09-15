import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

// Pack a continuous world-sampled material into shared hex frames. This is texture
// slicing for the engine, not independently authored hex tiles or random decals.
const source = process.argv[2];
if (!source) throw Error('Pass the generated seamless grass PNG.');
const version = process.argv[3] ?? 'v1';
if (!/^v[1-9][0-9]*$/.test(version)) throw Error('Use a version such as v2.');
const target = `public/art/ground/dongho-grass-${version}.webp`;
const output = version === 'v1' ? 'output/dongho-grass-ground' : `output/dongho-grass-${version}`;
if (existsSync(target)) throw Error(`Preserve the existing asset: ${target}. Use a new version.`);
const browser = await chromium.launch();
try {
 const page = await browser.newPage();
 const result = await page.evaluate(async url => {
  const image = new Image(); image.src = url; await image.decode();
  const R = 64, fw = 128, fh = 144, dx = Math.sqrt(3) * R, dy = 1.5 * R;
  const texture = document.createElement('canvas'); texture.width = texture.height = 512;
  texture.getContext('2d').drawImage(image, 0, 0, 512, 512);
  const atlas = document.createElement('canvas'); atlas.width = fw * 4; atlas.height = fh * 4;
  const g = atlas.getContext('2d', {willReadFrequently:true});
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const cx = col * fw + fw / 2, cy = row * fh + fh / 2;
    const wx = (col + (row % 2) / 2) * dx, wy = row * dy;
    g.save(); g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (60 * i - 30) * Math.PI / 180;
      const x = cx + Math.cos(a) * (R + 0.85), y = cy + Math.sin(a) * (R + 0.85);
      if (i) g.lineTo(x,y); else g.moveTo(x,y);
    }
    g.closePath(); g.clip();
    for(let ry=-1;ry<=1;ry++) for(let rx=-1;rx<=1;rx++)
      g.drawImage(texture, cx - wx + rx * dx * 4, cy - wy + ry * dy * 4, dx * 4, dy * 4);
    g.restore();
  }
  const data = g.getImageData(0,0,atlas.width,atlas.height).data;
  let gutterInk=0;
  for(let y=0;y<atlas.height;y++)for(let x=0;x<atlas.width;x++)
    if((x%fw<2||x%fw>=fw-2||y%fh<2||y%fh>=fh-2)&&data[(y*atlas.width+x)*4+3])gutterInk++;
  return { atlas:atlas.toDataURL('image/webp',1).split(',')[1], tile:texture.toDataURL('image/webp',1).split(',')[1], gutterInk, master:[image.width,image.height], size:[atlas.width,atlas.height], frame:[fw,fh], radius:R };
 }, `data:image/png;base64,${readFileSync(source).toString('base64')}`);
 if(result.gutterInk) throw Error('Atlas frame gutter is not transparent.');
 mkdirSync('public/art/ground',{recursive:true}); mkdirSync(output,{recursive:true});
 const atlas=Buffer.from(result.atlas,'base64'), tile=Buffer.from(result.tile,'base64');
 writeFileSync(target,atlas);
 writeFileSync(`${output}/grass-tile-${version}.webp`,tile);
 delete result.atlas;delete result.tile;
 result.bytes=atlas.length;
 writeFileSync(`${output}/packing.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
} finally {await browser.close();}
