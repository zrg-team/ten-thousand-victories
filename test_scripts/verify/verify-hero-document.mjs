import { chromium } from 'playwright';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const browser=await chromium.launch(), checks=[], errors=[];
const url=pathToFileURL(resolve('docs/phase-2/hero-depth/index.html')).href;
try {
  for(const lang of ['en','vi']) for(const width of [320,390,1440]) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${url}?lang=${lang}#implementation`);
    const inspect=()=>page.evaluate(()=>({lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth+1,
      packages:document.querySelectorAll('.ticket').length,implementation:!!document.querySelector('#implementation'),auditRows:document.querySelectorAll('#completion-audit tbody tr').length,level:document.querySelector('#hero-level').textContent}));
    const first=await inspect();
    if(lang==='vi'&&width===390)await page.screenshot({path:'output/hero-depth/document-vi-390.png'});
    checks.push({name:`Offline ${lang}/${width}: translated implementation, audit and 12 packages`,pass:first.lang===lang&&first.packages===12&&first.auditRows===12&&first.implementation&&!first.overflow});
    await page.locator(`#xp-range`).fill('126');await page.locator('#xp-range').dispatchEvent('input');
    checks.push({name:`${lang}/${width}: XP prototype retained`,pass:(await inspect()).level==='8'});
    await page.locator(`[data-language="${lang==='en'?'vi':'en'}"]`).click();
    checks.push({name:`${lang}/${width}: language switch preserves controls`,pass:(await inspect()).level==='8'&&(await inspect()).lang!==lang});
    await page.evaluate(()=>document.documentElement.style.fontSize='32px');
    checks.push({name:`${lang}/${width}: enlarged document stays within viewport`,pass:!(await inspect()).overflow});
    if(lang==='vi'&&width===390)await page.screenshot({path:'output/hero-depth/document-en-enlarged-390.png'});
    await page.close();
  }
}finally{await browser.close();}
checks.push({name:'No document exceptions',pass:errors.length===0});
fs.writeFileSync('output/hero-depth/document-verification.json',JSON.stringify({checks,errors},null,2));
console.log(`${checks.filter(check=>check.pass).length}/${checks.length} document checks passed`);
if(checks.some(check=>!check.pass)){console.log(checks.filter(check=>!check.pass));process.exitCode=1;}
