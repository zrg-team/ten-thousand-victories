// Rebuild the standalone bilingual runtime. Run from the repository root or any directory.
// English text stays in the HTML source; both dictionaries are embedded for offline use.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url);
const file=new URL('index.html',root);
const en=JSON.parse(readFileSync(new URL('review-text-en.json',root),'utf8'));
const vi=JSON.parse(readFileSync(new URL('translations.vi.json',root),'utf8'));
const data=JSON.parse(readFileSync(new URL('review-data.json',root),'utf8'));
const missing=en.filter(r=>typeof vi[r.id]!=='string'||!vi[r.id].trim());
if(missing.length)throw Error(`Missing Vietnamese translations: ${missing.map(r=>r.id).join(', ')}`);
const dictionary=Object.fromEntries(en.map(r=>[r.en,vi[r.id]]));
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
let html=readFileSync(file,'utf8')
 .replace(/<style id="report-locale-style">[\s\S]*?<\/style>/g,'')
 .replace(/<!-- report-language:start -->[\s\S]*?<!-- report-language:end -->/g,'')
 .replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g,'');
const styles=`<style id="report-locale-style">
.language-switch{position:fixed;right:20px;top:12px;z-index:20;display:flex;align-items:center;gap:5px;padding:5px;background:var(--card);border:1px solid var(--line);border-radius:9px;box-shadow:0 3px 14px #1d302f0c}
.language-switch .locale-label{font-size:11px;font-weight:650;color:var(--muted);padding:0 8px}
.language-switch button{font-size:13px;padding:8px 12px;min-height:44px;border-color:transparent}
main{padding-top:80px}.language-switch button[aria-pressed=true]{background:var(--ink);color:white}
html[lang=vi] h1,html[lang=vi] h2,html[lang=vi] h3,html[lang=vi] .loop summary,html[lang=vi] .scoreband{font-family:Segoe UI,system-ui,sans-serif;font-weight:550;line-height:1.3;letter-spacing:-.4px}
html[lang=vi] h1{font-size:clamp(36px,4.5vw,65px);letter-spacing:-1.5px}
html[lang=vi] .grade-row{grid-template-columns:minmax(190px,1.4fr) minmax(80px,1fr) 52px}
.section p code{overflow-wrap:anywhere}
@media(max-width:820px){.language-switch{position:sticky;top:0;right:auto;width:100%;border-radius:0;border-width:0 0 1px;padding:7px 17px;justify-content:flex-end}.language-switch .locale-label{margin-right:auto;padding-left:0}main{padding-top:34px}html{scroll-padding-top:84px}.rail{padding-top:18px}}
@media(max-width:480px){html[lang=vi] h1{font-size:36px;letter-spacing:-1px}html[lang=vi] h2{font-size:28px}html[lang=vi] .grade-row{grid-template-columns:1fr 65px 36px;gap:8px}.scorebox{padding:19px}html[lang=vi] .grade-name{font-size:12px}.language-switch{padding-right:12px;padding-left:17px}}
@media print{.language-switch{display:none}main{padding-top:0}html[lang=vi] h1{font-size:32px}html[lang=vi] h2{font-size:24px}}
</style>`;
const toolbar=`<!-- report-language:start --><div id="report-language" class="language-switch" role="group" aria-label="Language"><span class="locale-label">Language</span><button type="button" data-language="en" lang="en" aria-label="Read in English" aria-pressed="true">English</button><button type="button" data-language="vi" lang="vi" aria-label="Đọc bằng tiếng Việt" aria-pressed="false">Tiếng Việt</button></div><!-- report-language:end -->`;
const runtime=`<script id="report-locale-runtime">
(()=>{
'use strict';
const translations=${json(dictionary)};
const grades=${json(data.grades)};
const scores=${json(data.platformScores)};
const STORE='van-thang:gameplay-review:language';
let language='en',profile='combined',activeImage=null;
const $=id=>document.getElementById(id);
const t=text=>language==='vi'?(translations[text]??text):text;
const ui={
 en:{language:'Language',title:'Vạn Thắng — Gameplay Review & Implementation Agenda',combined:'Combined is the equal average of the two weighted platform scores.',mobile:'Mobile emphasizes clarity, learning, pacing and comfortable control.',desktop:'Desktop emphasizes strategic choices, economics, territory and tactical mastery.',expand:'Expand all nine loops',collapse:'Collapse all nine loops',none:' — no matches; try fewer filters.'},
 vi:{language:'Ngôn ngữ',title:'Vạn Thắng — Đánh giá lối chơi & kế hoạch triển khai',combined:'Điểm tổng hợp là trung bình bằng nhau của hai điểm nền tảng đã nhân trọng số.',mobile:'Di động ưu tiên độ rõ ràng, học cách chơi, nhịp độ và điều khiển thoải mái.',desktop:'Máy tính ưu tiên lựa chọn chiến lược, kinh tế, lãnh thổ và làm chủ chiến thuật.',expand:'Mở cả chín vòng phân tích',collapse:'Thu gọn cả chín vòng phân tích',none:' — không có kết quả; hãy giảm điều kiện lọc.'}
};
// Canonical option values must never change when their visible labels are translated.
document.querySelectorAll('select option').forEach(option=>{if(!option.hasAttribute('value'))option.value=option.textContent;});
const textRecords=[],attributeRecords=[];
const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
for(let node;node=walker.nextNode();){
 const parent=node.parentElement;if(!parent||parent.closest('script,style,code,#report-language'))continue;
 const original=node.textContent,key=original.trim();
 if(Object.prototype.hasOwnProperty.call(translations,key))textRecords.push({node,original,key});
}
document.querySelectorAll('[alt],[placeholder],[aria-label]').forEach(element=>{
 if(element.closest('#report-language'))return;
 for(const attribute of ['alt','placeholder','aria-label']){
  const original=element.getAttribute(attribute);
  if(original&&Object.prototype.hasOwnProperty.call(translations,original))attributeRecords.push({element,attribute,original});
 }
});
const normalize=text=>text.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
const items=[...document.querySelectorAll('.item')];
// Search both languages, including Vietnamese typed without accents, regardless of display locale.
const searchIndex=new Map(items.map(item=>{
 const translated=textRecords.filter(r=>item.contains(r.node)).map(r=>translations[r.key]).join(' ');
 return [item,normalize(item.textContent+' '+translated)];
}));
function renderGrades(){
 $('score').innerHTML=scores[profile].toFixed(1)+'<span> /100</span>';
 $('profile-note').textContent=ui[language][profile];
 document.querySelectorAll('[data-profile]').forEach(button=>{const active=button.dataset.profile===profile;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
 grades.forEach((r,i)=>{
  const value=profile==='mobile'?r[1]:profile==='desktop'?r[2]:(r[1]+r[2])/2;
  $('bar-'+i).style.width=value*10+'%';$('val-'+i).textContent=value.toFixed(1);
  const confidence=language==='vi'?(r[5]==='High'?'cao':'trung bình'):r[5];
  $('weight-'+i).textContent=profile==='combined'
   ?(language==='vi'?'Di động '+r[3]+'% · máy tính '+r[4]+'%':'Mobile '+r[3]+'% · desktop '+r[4]+'%')
   :(language==='vi'?'Trọng số '+r[profile==='mobile'?3:4]+'% · độ tin cậy '+confidence:'Weight '+r[profile==='mobile'?3:4]+'% · '+confidence+' confidence');
 });
}
function filter(){
 const query=normalize($('search').value.trim()),priority=$('priority').value,surface=$('surface').value,status=$('status').value;
 let count=0;items.forEach(item=>{
  const show=(!query||searchIndex.get(item).includes(query))&&(priority==='all'||item.dataset.priority===priority)&&(surface==='all'||item.dataset.surface==='Both'||item.dataset.surface===surface)&&(status==='all'||item.dataset.status===status);
  item.hidden=!show;if(show)count++;
 });
 $('count').textContent=(language==='vi'?count+' / 48 hạng mục':count+' of 48 items')+(count?'':ui[language].none);
}
function renderLoopButton(){const allOpen=[...document.querySelectorAll('.loop')].every(detail=>detail.open);$('expand-loops').textContent=ui[language][allOpen?'collapse':'expand'];}
function setLanguage(next,{remember=true,preserveScroll=true}={}){
 if(next!=='en'&&next!=='vi')return;
 const anchor=preserveScroll?[...document.querySelectorAll('main h1,main h2,main h3,main p,main summary')].find(el=>{const r=el.getBoundingClientRect();return r.height&&r.bottom>85;}):null;
 const anchorTop=anchor?.getBoundingClientRect().top;
 language=next;document.documentElement.lang=next;document.title=ui[next].title;
 textRecords.forEach(({node,original,key})=>{if(node.isConnected)node.textContent=next==='en'?original:original.replace(key,translations[key]);});
 attributeRecords.forEach(({element,attribute,original})=>element.setAttribute(attribute,t(original)));
 $('report-language').setAttribute('aria-label',ui[next].language);
 document.querySelector('.locale-label').textContent=ui[next].language;
 document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===next)));
 renderGrades();filter();renderLoopButton();if(activeImage)$('large-image').alt=activeImage.alt;
 if(remember){try{localStorage.setItem(STORE,next);}catch{}try{const url=new URL(location.href);url.searchParams.set('lang',next);history.replaceState(null,'',url);}catch{}}
 if(anchor&&anchor.isConnected)scrollTo({top:scrollY+anchor.getBoundingClientRect().top-anchorTop,behavior:'instant'});
}
document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.language)));
document.querySelectorAll('[data-profile]').forEach(button=>button.addEventListener('click',()=>{profile=button.dataset.profile;renderGrades();}));
const fields=['search','priority','surface','status'];fields.forEach(id=>$(id).addEventListener(id==='search'?'input':'change',filter));
$('reset-filters').addEventListener('click',()=>{fields.forEach(id=>$(id).value=id==='search'?'':'all');filter();});
$('expand-loops').addEventListener('click',()=>{const details=[...document.querySelectorAll('.loop')],open=details.some(detail=>!detail.open);details.forEach(detail=>detail.open=open);renderLoopButton();});
document.querySelectorAll('.loop').forEach(detail=>detail.addEventListener('toggle',renderLoopButton));
const dialog=$('image-dialog');document.querySelectorAll('.zoom-image').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();activeImage=link.querySelector('img');$('large-image').src=activeImage.src;$('large-image').alt=activeImage.alt;dialog.showModal();}));
$('close-image').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
let printStates=[];addEventListener('beforeprint',()=>{printStates=[...document.querySelectorAll('details')].map(detail=>detail.open);document.querySelectorAll('details').forEach(detail=>detail.open=true);});addEventListener('afterprint',()=>document.querySelectorAll('details').forEach((detail,i)=>detail.open=printStates[i]));
let preferred='en';try{const saved=localStorage.getItem(STORE);if(saved==='en'||saved==='vi')preferred=saved;}catch{}
const requested=new URL(location.href).searchParams.get('lang');if(requested==='en'||requested==='vi')preferred=requested;
setLanguage(preferred,{remember:false,preserveScroll:false});
})();
</script>`;
html=html.replace('</head>',styles+'</head>').replace('<body>','<body>'+toolbar).replace('</body>',runtime+'</body>');
writeFileSync(file,html);
console.log(JSON.stringify({file:fileURLToPath(file),translations:en.length,bytes:Buffer.byteLength(html)}));
