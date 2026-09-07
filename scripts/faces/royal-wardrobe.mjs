/** Authored vector extension in the portrait's original design space. No old assets replaced. */
import { mkdirSync, writeFileSync } from 'node:fs';
const out = 'public/faces-royal';
mkdirSync(out, { recursive: true });
const ink = '#302b26', gold = '#c9a05c', light = '#eed6a0';
const path = (d, fill = 'none', stroke = ink, width = 1) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle = (x,y,r,fill=gold) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${ink}" stroke-width=".65"/>`;
const cloud = (x,y,s=1) => `<g transform="translate(${x} ${y}) scale(${s})">${path('M-9 2Q-15-3-9-5Q-7-11-2-7Q4-12 7-5Q15-4 10 2Z',gold)}${path('M-6-2Q0-6 4-2', 'none',light,.7)}</g>`;
const lotus = (x,y,s=1) => `<g transform="translate(${x} ${y}) scale(${s})">${path('M0 7Q-15 4-12-5Q-5-4 0 7Q-7-5 0-13Q7-5 0 7Q5-4 12-5Q15 4 0 7Z',gold)}${path('M-11 8Q0 13 11 8','none',light)}</g>`;
const dragon = (x,y,s=1) => `<g transform="translate(${x} ${y}) scale(${s})">${path('M-18 15C-3 23 18 14 13 3C9-5-7 2-7-7Q-7-17 4-14','none',ink,7)}${path('M-18 15C-3 23 18 14 13 3C9-5-7 2-7-7Q-7-17 4-14','none',gold,5)}${path('M1-18L5-21L9-18L14-16L14-12L20-11L20-7L12-7L8-4L1-8L3-13L-2-14Z',gold)}${path('M4-19L0-25L0-21M9-18L12-24L12-20M-9-4L-15-7L-18-6M9 8L18 4L21 5M-3 16L-9 9L-12 10M13-9L19-9M13-7Q22-2 23-7','none',light,1.2)}${path('M-8-11L-12-9M-7-7L-11-5M-4-2L-5 2M2 0L2 4M8 1L8 5M12 9L8 8M5 15L3 11','none',ink,.65)}${circle(10,-14,1,ink)}</g>`;
const bird = (x,y,s=1) => `<g transform="translate(${x} ${y}) scale(${s})">${path('M-2 4Q-16 0-16-11Q-10-4-2-5Q-1-13 4-14L11-12L4-10Q8-3 3 3Q14 6 17 15Q5 11 0 7Q-6 14-16 16Q-13 7-2 4Z',gold)}${path('M-12-7L-3 0M3 6L12 11M-2 7L-11 12','none',light)}</g>`;
const eras = [
 ['dinh','Đinh', ['Mũ bình đính viền gấm','Khăn võ tướng','Khăn vấn lụa'], ['Giao lĩnh dệt ô','Giáp da buộc dây','Đối khâm viền gấm'], ['Đai dệt ô','Dải lụa thắt nút','Dây thao đôi']],
 ['ly','Lý', ['Phốc đầu viền hoa','Mũ võ quan','Khăn vấn hoa sen'], ['Viên lĩnh hoa sen','Giáp phiến buộc dây','Giao lĩnh dây hoa'], ['Đai hoa sen','Dải lụa mây','Đai hoa dây']],
 ['tran','Trần', ['Mũ đinh tự gấm','Mũ trận viền đồng','Đinh tự dải lụa'], ['Viên lĩnh mây','Giáp phiến vảy nhỏ','Giao lĩnh viền sóng'], ['Đai mây cuộn','Dây thao võ tướng','Đai viền sóng']],
 ['le','Lê', ['Mũ xung thiên','Phốc đầu võ quan','Phốc đầu thêu hoa'], ['Long bào Lê','Bào võ quan hổ','Bào văn quan hạc'], ['Đai ngọc chạm mây','Đai võ quan','Đai hoa mai']],
 ['tayson','Tây Sơn', ['Khăn vấn chỉ thêu','Mũ trận bọc vải','Khăn vấn nếp cao'], ['Giao lĩnh thêu mây','Áo trận buộc giáp','Giao lĩnh viền trúc'], ['Đai thao nút kép','Dải lụa chéo','Đai gấm hoa']],
 ['nguyen','Nguyễn', ['Cửu long thông thiên','Phốc đầu võ ban','Vành dây cung đình'], ['Hoàng bào thêu rồng','Bào võ quan kỳ lân','Nhật Bình hoa phượng'], ['Đai ngọc cung đình','Đai võ ban chạm hoa','Dải ngũ sắc']],
];
const colours = ['#785440','#7d4136','#415e60','#a17736','#79463a','#ae813d'];
const items = [], defs = [], frames = {}, cells = [];
function hat(e,v) {
 let art='';
 const cap = (e===0&&v===0)||(v===1&&e!==0);
 if ((e===3||e===5)&&v===0) {
  art += path('M-24-45L-28-76L-20-81L-16-58M24-45L28-76L20-81L16-58',ink,gold,1.4);
  art += path('M-29-36L-26-66Q0-77 26-66L29-36Q0-29-29-36Z',ink);
  art += dragon(0,-52,.62)+cloud(-17,-42,.35)+cloud(17,-42,.35);
  if(e===5) {
   for(const x of [-19,-7,7,19]) art+=dragon(x,-66,.15);
   for(const x of [-21,-10,10,21]) art+=dragon(x,-39,.14);
  }
 } else if(e===5&&v===2) {
  art+=path('M-34-35Q-47-62-23-72Q0-82 23-72Q47-62 34-35L27-35Q29-62 0-64Q-29-62-27-35Z', '#56394a');
  for(let x=-24;x<=24;x+=12) art+=lotus(x,-66+Math.abs(x)*.32,.26);
 } else if((e===1&&v===0)||(e===3&&v!==0)||(e===5&&v===1)) {
  art+=path(e===1?'M-23-46L-47-44L-49-38L-24-39M23-46L47-44L49-38L24-39':'M-23-46L-59-53L-61-47L-24-39M23-46L59-53L61-47L24-39',ink,gold);
  art+=path(v===1?'M-28-35L-25-64L25-64L28-35Q0-30-28-35Z':'M-28-35L-25-60Q0-76 25-60L28-35Q0-30-28-35Z',ink);
  art+=path('M-25-39Q0-34 25-39','none',gold,2)+lotus(0,-50,.45);
  if(e===5) art+=path('M-21-61H21M-23-57H23','none',gold,.8)+cloud(-16,-48,.25)+cloud(16,-48,.25);
 } else if(e===2&&v!==1) {
  art+=path('M-27-35L-27-61L-7-61L-7-73L14-73L14-54L28-54L28-35Z',ink);
  art+=path('M-23-40L-23-57L-3-57L-3-68L10-68','none',gold,1.5);
  if(v===2) art+=path('M24-42Q41-20 31-4L26-9Q32-23 19-40', '#a2533c');
 } else if(cap) {
  art+=path(e===0?'M-29-35L-24-64L24-64L29-35Z':'M-31-35Q-33-59-16-67Q0-75 16-67Q33-59 31-35Z',e===4?'#524640':'#535752');
  art+=path('M-28-39Q0-34 28-39M0-67L0-39','none',gold,2);
  if(e===1||e===2) {
   for(let x=-20;x<=20;x+=10) art+=circle(x,-42,1.6);
   if(e===2) art+=path('M-20-57L-16-47M-10-62L-7-47M10-62L7-47M20-57L16-47','none',gold,1.2);
  }
  else art+=path('M-15-60L15-60M-18-55L18-55','none',light,.8);
 } else {
  art+=path(`M-30-35Q-39-49-25-${v===2?66:60}Q0-${v===2?76:70} 26-61Q39-45 30-35Q0-28-30-35Z`,e===0?'#59423b':'#373d40');
  art+=path('M-29-44Q-4-59 27-47M-28-39Q0-50 29-40M-21-56Q0-66 20-57','none',gold,1.2);
  art+=v===1?path('M26-39Q44-26 35-7L28-13L28-31','#914735'):e===4
   ?path('M-24-52Q0-72 24-57M-22-48Q0-66 27-52','none',light,.7):lotus(0,-44,.32);
 }
 return art;
}
function robe(e,v) {
 const colour=colours[e], trim=v===1?'#514c42':'#d0ac69';
 let a=path('M-14 27Q-19 31-35 35L-46 43Q-51 60-54 94L54 94Q51 60 46 43L35 35Q19 31 14 27L11 36Q0 41-11 36Z',colour,ink,1.6);
 a+=path('M-34 41Q-30 65-35 91M-45 56L-43 83M34 41Q30 65 35 91M45 56L43 83M-21 64L-24 90M23 67L26 92','none', '#352f2b',1.2);
 a+=path('M-39 46Q-42 65-46 90M39 46Q42 65 46 90','none', '#c6ad82',.65);
 if(v===1&&e<3 || v===1&&e===4) {
  a+=path('M-22 39L22 39L29 84L-29 84Z','#6b6758');
  if(e===0) {
   a+=path('M-21 41H21L25 81H-25Z','#725342');
   for(let y=45;y<81;y+=7) a+=path(`M-18 ${y}l5 4-5 3m36-7l-5 4 5 3`,'none',light,.9);
   a+=path('M-9 43L-7 78M9 43L7 78','none',ink,1.4);
  } else for(let row=0;row<6;row++) for(let col=0;col<7;col++) {
   const x=-23+col*7+(row%2)*2, y=43+row*6;
   a+=path(`M${x} ${y}h5v5q-2 2-5 0Z`,row%2?'#8e8061':'#a29470',ink,.65)+circle(x+2.5,y+1.5,.55,light);
  }
  a+=path('M-20 32L-35 37L-42 57L-25 59L-18 38M20 32L35 37L42 57L25 59L18 38',trim);
  a+=path('M-34 40L-39 53M-29 39L-33 54M34 40L39 53M29 39L33 54','none',gold,1.1);
 } else if(e===0&&v===2) {
  a+=path('M-13 28L-9 94H9L13 28L7 34L4 90H-4L-7 34Z','#d5b681');
  a+=path('M-16 30L-23 91M16 30L23 91','none',gold,4);
  for(let y=46;y<90;y+=11) a+=lotus(-19,y,.22)+lotus(19,y,.22);
 } else if(e===5&&v===2) {
  a+=path('M-17 29L-20 63L20 63L17 29L10 33L12 55L-12 55L-10 33Z','#e2c584');
  a+=bird(0,76,.7)+lotus(-33,57,.48)+lotus(33,57,.48);
  for(let i=0;i<5;i++) a+=path(`M-49 ${82+i*2}L-34 ${82+i*2}M34 ${82+i*2}L49 ${82+i*2}`,'none',['#e9d7a5','#965143','#516f79','#637252','#d1a54e'][i],2);
 } else {
  const round=(e===1||e===2)&&v===0||e===3||e===5;
  a+=round?path('M-14 28Q-21 43 0 45Q21 43 14 28L11 30Q15 39 0 40Q-15 39-11 30Z',trim):path('M-14 28L20 64L26 59L-8 28M14 28L-8 49L-13 44L8 28',trim);
  if((e===3||e===5)&&v===0) a+=dragon(0,67,.95)+cloud(-33,54,.6)+cloud(33,54,.6);
  else if((e===3||e===5)&&v===1) {
   a+=path('M-17 49H17V80H-17Z','#384d59',gold,1.8);
   a+=path('M-11 69L-8 57L-3 62L6 61L10 57L13 65L7 69L7 76L3 76L2 70L-5 70L-7 76L-11 76Z',gold);
   a+=path('M-7 63L-3 66M1 63L4 66M-7 68L-3 69','none',ink)+cloud(0,54,.35);
  } else if(e===3&&v===2) a+=path('M-17 49H17V80H-17Z','#384d59',gold,1.8)+bird(0,65,.72);
  else {
   a+=(e+v)%2?lotus(0,67,.7):cloud(0,65,.8);
   if(e===0) for(let y=53;y<=78;y+=8) for(let x=-18;x<=18;x+=9)
    a+=path(`M${x} ${y}l3-3 3 3-3 3Z`,'none',gold,.65);
   for(const x of [-34,34]) a+=(e+v)%2?cloud(x,56,.45):lotus(x,57,.42);
   if(e===4&&v===2) for(const x of [-24,24]) a+=path(`M${x} 52v30m-3-22h6m-6 9h6m-6 9h6m-3-13q-9-1-7-7m7 14q9-1 7-7`,'none',gold,1.1);
  }
 }
 for(let x=-42;x<=42;x+=14) a+=path(`M${x-5} 88q5-7 10 0m-10 4q5-7 10 0`,'none',gold,.85);
 return a;
}
function ornament(e,v) {
 if(e===5&&v===2) return ['#e2c78b','#995341','#587582','#737f50','#dad6bc'].map((c,i)=>path(`M${-10+i*4} 74Q${-17+i*6} 84 ${-13+i*6} 94L${-8+i*6} 94Q${-10+i*6} 82 ${-6+i*4} 74Z`,c)).join('')+lotus(0,73,.45);
 if(v===1) return path(e===4?'M-27 39L-32 44L29 85L33 78Z':`M-35 ${76+e}Q0 85 35 ${76+e}L35 ${81+e}Q0 90-35 ${81+e}Z`, '#aa5640')+path(`M0 80Q-${12+e} ${65+e}-${14+e} 78Q-15 85 0 80Q${12+e} ${65+e} ${14+e} 78Q15 85 0 80L-${4+e} 95M0 80L${7+e} 94`,'none',gold,2.2)+circle(0,80,2,light)+[lotus,cloud,bird][e%3](0,80,.25);
 let a=path('M-37 79Q0 85 37 79L36 86Q0 92-36 86Z',v===2?'#8d4035':'#333f3e',ink,1);
 for(let x=-30;x<=30;x+=e===0?12:e===2?15:e===4?7.5:10) {
  a+=path(`M${x-3.5} ${80+3*(1-Math.abs(x)/35)}h7v6h-7Z`,e>=3&&v===0?'#86a38a':gold,ink,.65);
  a+= e%2?circle(x,85,1,light):path(`M${x-2} 84l2-2 2 2-2 2Z`,light,ink,.4);
 }
 return a+(v===2?[lotus,cloud,bird][e%3](0,84,.4):circle(0,85,3.5,light))
  + (e===5?path('M-30 89L-26 94M30 89L26 94','none',gold,1.5):'');
}
for(let e=0;e<eras.length;e++) for(let slot=0;slot<3;slot++) for(let v=0;v<3;v++) {
 const [era,eraName,...names]=eras[e], kind=['hat','robe','ornament'][slot];
 const id=`royal-${era}-${kind}-${v+1}`;
 const item={id,era,slot:kind,name:names[slot][v],cost:[140,180,80][slot]+v*20,sex:e===5&&v===2&&slot!==2?'woman':'any'};
 items.push(item);
 const box=slot===0?[-64,-84,128,84]:slot===1?[-56,26,112,70]:[-56,26,112,70];
 const [x,y,w,h]=box;
 defs.push({key:id,layer:slot===0?52:slot===1?35:39,tint:'none',cx:x+w/2,cy:y+h/2,w,h});
 const svg=[hat,robe,ornament][slot](e,v);
 writeFileSync(`${out}/${id}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="${w*2}" height="${h*2}" viewBox="${box.join(' ')}">${svg}</svg>\n`);
 const index=items.length-1, ax=index%7*260, ay=Math.floor(index/7)*176;
 cells.push(`<g transform="translate(${ax-x*2} ${ay-y*2}) scale(2)">${svg}</g>`);
 frames[id]={frame:{x:ax,y:ay,w:w*2,h:h*2},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:w*2,h:h*2},sourceSize:{w:w*2,h:h*2}};
}
writeFileSync(`${out}/atlas.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="1820" height="1408">${cells.join('')}</svg>\n`);
writeFileSync(`${out}/atlas.json`,JSON.stringify({frames,meta:{image:'atlas.svg',size:{w:1820,h:1408},scale:'1'}}));
writeFileSync('src/ui/faces/royal.defs.json',JSON.stringify(defs,null,2)+'\n');
writeFileSync('src/data/royalWardrobe.json',JSON.stringify(items,null,2)+'\n');
console.log(`Built ${items.length} unique royal wardrobe parts.`);
