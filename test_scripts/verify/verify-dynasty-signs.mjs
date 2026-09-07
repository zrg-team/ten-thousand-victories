import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const out = 'output/dynasty-signs'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
async function open(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/?capture=1`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  return page;
}
try {
  const page = await open({ width: 1200, height: 1100 });
  const model = await page.evaluate(async () => {
    const { DYNASTY_SIGNS, SIGN_COSTS } = await import('/src/data/dynastySigns.ts');
    const { getLegacy, addLegacyPoints, ownsDynastySign, purchaseDynastySign, purchaseRoyalWardrobe } = await import('/src/state/legacy.ts');
    const { grantDeed } = await import('/src/state/cabinet.ts');
    const { rollFounder, BANNER_EMBLEMS } = await import('/src/ui/faces/kingLook.ts');
    const { getDynasty, setDynastyFounder } = await import('/src/state/dynasty.ts');
    const must = (c,m) => { if (!c) throw Error(m); };
    localStorage.removeItem('mandate:legacy:v1');
    const initialXp = getDynasty().xp;
    must(DYNASTY_SIGNS.length === 16 && BANNER_EMBLEMS.length === 16, 'catalog count');
    must(!purchaseDynastySign('unknown') && !ownsDynastySign('unknown'), 'unknown ID');
    must(!purchaseDynastySign('lotus') && !ownsDynastySign('lotus'), 'empty balance');
    addLegacyPoints(59); must(!purchaseDynastySign('lotus') && getLegacy().points === 59, 'one short');
    addLegacyPoints(1); must(purchaseDynastySign('lotus') && getLegacy().points === 0, 'exact balance');
    must(purchaseDynastySign('lotus') && getLegacy().points === 0, 'duplicate charge');
    addLegacyPoints(1000);
    const before = localStorage.getItem('mandate:legacy:v1'), original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw Error('quota'); };
    try { must(!purchaseDynastySign('dragon'), 'failed save granted'); } finally { Storage.prototype.setItem = original; }
    must(localStorage.getItem('mandate:legacy:v1') === before && !ownsDynastySign('dragon'), 'failed save changed ownership/balance');
    grantDeed('era-empires'); grantDeed('era-mandate');
    const balance = getLegacy().points;
    must(ownsDynastySign('branch') && ownsDynastySign('tortoise'), 'old deeds lost');
    must(purchaseDynastySign('branch') && purchaseDynastySign('tortoise') && getLegacy().points === balance, 'deeds charged');
    addLegacyPoints(10000);
    for (const id of DYNASTY_SIGNS) {
      const owned = ownsDynastySign(id), start = getLegacy().points;
      must(purchaseDynastySign(id) && ownsDynastySign(id), `purchase ${id}`);
      must(start - getLegacy().points === (owned ? 0 : SIGN_COSTS[id]), `price ${id}`);
      must(purchaseDynastySign(id) && getLegacy().points === start - (owned ? 0 : SIGN_COSTS[id]), `repeat ${id}`);
      const founder = rollFounder(0, () => .7); founder.banner.emblem = id;
      setDynastyFounder(founder, 'Lê'); must(getDynasty().founder.banner.emblem === id, `saved ${id}`);
    }
    purchaseRoyalWardrobe('royal-le-robe-1');
    must(getLegacy().signs.length === 10 && getLegacy().wardrobe.includes('royal-le-robe-1'), 'other purchases erased signs');
    must(getDynasty().xp === initialXp, 'purchases changed lifetime XP');
    return { symbols: DYNASTY_SIGNS.length, paidOwned: getLegacy().signs.length, exactBalance: true, duplicate: true, storageFailure: true, oldDeeds: true };
  });
  // Every device at a readable size, both as an identity sign and mounted on a flag.
  await page.evaluate(async () => {
    const { DYNASTY_SIGNS } = await import('/src/data/dynastySigns.ts');
    const { drawHouseSign, drawHouseBanner } = await import('/src/ui/ascent/houseBanner.ts');
    const { t } = await import('/src/i18n/index.ts');
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    scene.children.removeAll(true); scene.cameras.main.setZoom(1).setScroll(0,0);
    const w = scene.scale.width, h = scene.scale.height;
    scene.add.rectangle(0,0,w,h,0xf1e7ce).setOrigin(0);
    DYNASTY_SIGNS.forEach((id,i) => {
      const x=i%4*w/4, y=Math.floor(i/4)*h/4, size=Math.min(w/8-10,h/4-35);
      const sign={field:0x704d2f,trim:0xd8b45a,emblem:id};
      scene.add.existing(drawHouseSign(scene,sign,size,size).setPosition(x+5,y+5));
      scene.add.existing(drawHouseBanner(scene,sign,size,size).setPosition(x+size+10,y+5));
      scene.add.text(x+w/8,y+size+10,t(`coronation.emblem.${id}`),{fontFamily:'serif',fontSize:'15px',color:'#32271c'}).setOrigin(.5,0);
    });
  });
  await page.waitForTimeout(150); await page.screenshot({ path: `${out}/gallery.png` }); await page.close();

  const layouts = [];
  for (const [language, viewport] of [
    ['vi',{width:390,height:844}], ['en',{width:320,height:568}], ['en',{width:1440,height:900}],
  ]) {
    const live = await open(viewport);
    await live.evaluate(async language => {
      const { setLanguage } = await import('/src/i18n/index.ts'); setLanguage(language);
      const { setDynastyFounder } = await import('/src/state/dynasty.ts');
      const { rollFounder } = await import('/src/ui/faces/kingLook.ts');
      setDynastyFounder(rollFounder(0,()=>.7),'Lê');
      const m=window.__phaserGame.scene.getScene('MenuScene'); m.mode='temple';m.render();
      m.templeSheet.step=1; m.templeSheet.banner.emblem='crown';m.render();
    },language);
    const state = () => live.evaluate(() => JSON.parse(window.render_game_to_text()).bannerEditor);
    const locate = async (key,value) => live.evaluate(({key,value}) => {
      const m=window.__phaserGame.scene.getScene('MenuScene'), area=m.pageScroll;
      const o=area.content.list.find(o=>key==='bannerChoice' ? o.getData?.(key)?.value===value : o.getData?.(key)===value);
      if(!o)throw Error(`Missing ${key}/${value}`);
      const child=o.list?.find(p=>p.input), local=child ? {x:child.x,y:child.y} : {x:o.width/2,y:o.height/2};
      area.setScroll(o.y+local.y-area.bounds.height/2);
      const p=o.getWorldTransformMatrix().transformPoint(local.x,local.y);
      const c=m.cameras.main,s=c.matrix.transformPoint(p.x-c.scrollX,p.y-c.scrollY),rect=window.__phaserGame.canvas.getBoundingClientRect();
      return {x:rect.x+s.x/m.scale.width*rect.width,y:rect.y+s.y/m.scale.height*rect.height};
    },{key,value});
    const tap=async(key,value)=>{ const p=await locate(key,value);await live.mouse.click(p.x,p.y);await live.waitForTimeout(160); };
    assert.equal((await state()).options.length,16); assert.equal((await state()).display,'sign');
    await live.screenshot({path:`${out}/${language}-${viewport.width}-initial.png`});
    await tap('bannerChoice','dragon');
    assert.equal((await state()).preview,'dragon');assert.equal((await state()).emblem,'crown');
    await tap('signPurchase','dragon');assert.equal((await state()).points,0);assert.equal((await state()).emblem,'crown');
    await live.screenshot({path:`${out}/${language}-${viewport.width}-locked.png`});
    await live.evaluate(async()=>{
      (await import('/src/state/legacy.ts')).addLegacyPoints(240);
      window.__phaserGame.scene.getScene('MenuScene').render();
    });
    await tap('signPurchase','dragon');
    assert.equal((await state()).points,0);assert.equal((await state()).emblem,'dragon');
    assert.equal((await state()).options.find(o=>o.id==='dragon').owned,true);
    await tap('signDisplay','flag');assert.equal((await state()).display,'flag');
    await live.screenshot({path:`${out}/${language}-${viewport.width}-flag.png`});
    await tap('signDisplay','sign');
    // Colour changes must affect both usages and persist with the sign.
    const blue = await live.evaluate(async()=> (await import('/src/ui/faces/palette.ts')).ROBES.azure);
    await tap('bannerChoice',blue);
    await tap('bannerChoice',0xf3e6c4);
    await tap('bannerChoice','star'); // Last row is reachable and previews without equipping.
    assert.equal((await state()).preview,'star');assert.equal((await state()).emblem,'dragon');
    await live.evaluate(()=>{const m=window.__phaserGame.scene.getScene('MenuScene');m.pageScroll.setScroll(10000)});
    await live.screenshot({path:`${out}/${language}-${viewport.width}-bottom.png`});
    await live.evaluate(()=>{const m=window.__phaserGame.scene.getScene('MenuScene');m.templeSheet.foot().close.onTap()});
    assert.equal(await live.evaluate(async()=> (await import('/src/state/dynasty.ts')).getDynasty().founder.banner.emblem),'dragon');
    await live.screenshot({path:`${out}/${language}-${viewport.width}-dynasty.png`});
    await live.reload();await live.waitForFunction(()=>window.__phaserGame?.scene.isActive('MenuScene'));
    const saved=await live.evaluate(async()=>({banner:(await import('/src/state/dynasty.ts')).getDynasty().founder.banner,legacy:(await import('/src/state/legacy.ts')).getLegacy()}));
    assert.equal(saved.banner.emblem,'dragon');assert.equal(saved.banner.field,blue);assert.equal(saved.banner.trim,0xf3e6c4);
    assert.deepEqual(saved.legacy.signs,['dragon']);assert.equal(saved.legacy.points,0);
    await live.evaluate(async()=>{
      (await import('/src/state/legacy.ts')).addLegacyPoints(60);
      const m=window.__phaserGame.scene.getScene('MenuScene');m.mode='temple';m.render();m.templeSheet.step=1;m.render();
    });
    await tap('bannerChoice','lotus');await tap('signPurchase','lotus');
    assert.equal((await state()).emblem,'lotus');
    await live.evaluate(()=>{
      const m=window.__phaserGame.scene.getScene('MenuScene');
      m.templeSheet.foot().back.onTap();m.templeSheet.foot().back.onTap();
    });
    const discarded=await live.evaluate(async()=>({banner:(await import('/src/state/dynasty.ts')).getDynasty().founder.banner,legacy:(await import('/src/state/legacy.ts')).getLegacy()}));
    assert.equal(discarded.banner.emblem,'dragon');assert.deepEqual(discarded.legacy.signs,['dragon','lotus']);assert.equal(discarded.legacy.points,0);
    layouts.push({language,...viewport});await live.close();
  }
  assert.deepEqual(errors,[]);
  writeFileSync(`${out}/report.json`,JSON.stringify({model,layouts,errors},null,2));
  console.log('PASS',JSON.stringify({model,layouts,errors}));
} finally { await browser.close(); }
