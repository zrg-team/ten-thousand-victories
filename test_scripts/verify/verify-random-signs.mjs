import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = 'output/kingdom-signs';
mkdirSync(out, { recursive: true });
const checks = [], errors = [];
const check = (ok, name, detail) => { checks.push({ ok: !!ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const browser = await chromium.launch();
const url = process.env.DEV_URL ?? 'http://127.0.0.1:5183';
const open = async (width, height, lang = 'en') => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.stack ?? e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(lang => {
    localStorage.setItem('mandate:language:v1', lang);
    localStorage.setItem('mandate:life:v1', JSON.stringify({ motion: 'reduced' }));
  }, lang);
  await page.goto(`${url}/?capture=1&noladder=1&layout=${width > 700 ? 'desktop' : 'phone'}`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  await page.waitForTimeout(150);
  return page;
};

const menu = await open(1440, 900);
const model = await menu.evaluate(async () => {
  const { DYNASTY_SIGNS: ids, randomDynastySign: roll } = await import('/src/data/dynastySigns.ts');
  return { all: ids.every((id, i) => roll(ids, () => i / ids.length) === id),
    different: ids.every(id => ids.every((_, i) => roll(ids, () => i / ids.length, id) !== id)),
    single: roll(['lotus'], () => 0.8, 'lotus') === 'lotus', empty: roll([], () => 0) === 'crown' };
});
check(Object.values(model).every(Boolean), 'random selector reaches all 16 motifs and avoids immediate repeats', model);
const first = await menu.evaluate(() => JSON.parse(window.render_game_to_text()).kingdomSign);
check(first?.source === 'dynasty' && first.emblem === 'crown', 'new dynasty has a stable default sign', first);
const stable = await menu.evaluate(() => {
  const m = window.__phaserGame.scene.getScene('MenuScene');
  return Array.from({ length: 12 }, () => { m.render(); return JSON.parse(window.render_game_to_text()).kingdomSign.emblem; });
});
check(stable.every(id => id === first.emblem), 'redraws keep one sign and do not flicker');
await menu.setViewportSize({ width: 1180, height: 780 });
await menu.waitForTimeout(450);
check(await menu.evaluate(id => JSON.parse(window.render_game_to_text()).kingdomSign.emblem === id, first.emblem), 'window resize preserves the current sign');

const visits = await menu.evaluate(async () => {
  const { setDynastyFounder, getDynasty } = await import('/src/state/dynasty.ts');
  const { rollFounder } = await import('/src/ui/faces/kingLook.ts');
  const founder = rollFounder(0, () => 0.7);
  founder.banner = { field: 0x26313c, trim: 0xf3e6c4, emblem: 'blade' };
  setDynastyFounder(founder, 'Lê');
  const before = localStorage.getItem('mandate:dynasty:v1');
  const legacy = localStorage.getItem('mandate:legacy:v1');
  const m = window.__phaserGame.scene.getScene('MenuScene'), signs = [];
  for (let i = 0; i < 40; i++) {
    m.mode = 'classic'; m.render(); m.mode = 'main'; m.render();
    signs.push(JSON.parse(window.render_game_to_text()).kingdomSign);
  }
  const panel = m.content.find(o => o.getData('desktopMenuPanel'));
  const mark = m.content.find(o => o.getData('menuKingdomSign'));
  return { signs, unchanged: before === localStorage.getItem('mandate:dynasty:v1')
    && legacy === localStorage.getItem('mandate:legacy:v1'), saved: getDynasty().founder.banner,
    centred: Math.abs(mark.x - panel.x - panel.getData('desktopMenuPanel').width / 2) < 0.01,
    y: mark.y - panel.y, noInput: !mark.input,
    marks: m.children.list.filter(o => o.getData('menuKingdomSign')).length,
    plainPaper: panel.texture.key.includes(':plain') };
});
check(visits.signs.every(s => s.emblem === 'blade' && s.field === 0x26313c && s.trim === 0xf3e6c4 && s.source === 'dynasty'),
  '40 menu visits keep the saved sword and both chosen colours');
check(visits.unchanged && visits.saved.emblem === 'blade', 'rendering never alters saved design, ownership or currency');
check(visits.centred && visits.y === 130 && visits.noInput && visits.marks === 1 && visits.plainPaper,
  'one shared sign replaces the baked lotus at the original seal position', visits);
await menu.screenshot({ path: `${out}/desktop-menu.png` });
writeFileSync(`${out}/menu-state.json`, await menu.evaluate(() => window.render_game_to_text()));
const lastVisit = visits.signs.at(-1);
await menu.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').scene.restart());
await menu.waitForTimeout(500);
check(await menu.evaluate(previous => {
  const sign = JSON.parse(window.render_game_to_text()).kingdomSign;
  return JSON.stringify(sign) === JSON.stringify(previous);
}, lastVisit), 'restarting the menu scene preserves the saved sign');

await menu.reload(); await menu.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
check(await menu.evaluate(previous => JSON.stringify(JSON.parse(window.render_game_to_text()).kingdomSign) === JSON.stringify(previous), lastVisit),
  'full reload preserves the saved sign');

const usages = await menu.evaluate(async () => {
  const { createPlayerLandFlag } = await import('/src/ui/playerFlag.ts');
  const { throneHallDiorama } = await import('/src/ui/ascent/throneHall.ts');
  const m = window.__phaserGame.scene.getScene('MenuScene');
  const marks = object => {
    const result = [];
    const visit = o => { for (const key of ['houseSign', 'houseBanner', 'houseSeal']) if(o.getData(key)) result.push(o.getData(key)); o.list?.forEach(visit); };
    visit(object); return result;
  };
  m.mode = 'dynasty'; m.render();
  const dynasty = m.children.list.flatMap(marks);
  const flags = [];
  for (const capital of [true, false]) for (const seed of [0, 1, 777, 123456]) {
    const flag = createPlayerLandFlag(m, capital, seed); flags.push(...marks(flag)); flag.destroy(true);
  }
  const rival = createPlayerLandFlag(m, false, 2, true), rivalMarks = marks(rival); rival.destroy(true);
  const hall = throneHallDiorama(m, 340, 123), hallMarks = marks(hall); hall.destroy(true);
  const army = m.mapItems.createArmyMarker(500, true, 0xff0000, 456), armyMarks = marks(army); army.destroy(true);
  return { dynasty, flags, rivalMarks, hallMarks, armyMarks };
});
const matches = signs => signs.length > 0 && signs.every(s => s.emblem === 'blade' && s.field === 0x26313c && s.trim === 0xf3e6c4);
for(const key of ['dynasty', 'flags', 'hallMarks', 'armyMarks']) check(matches(usages[key]), `${key}: saved sign and colours match across kingdom surfaces`, usages[key]);
check(usages.rivalMarks.length === 0, 'rival flags never inherit the player sign');
await menu.screenshot({ path: `${out}/dynasty.png` });

// The sixteen existing designs in the small stamp treatment, enlarged alongside actual size.
await menu.evaluate(async () => {
  const { DYNASTY_SIGNS } = await import('/src/data/dynastySigns.ts');
  const { drawHouseSeal } = await import('/src/ui/ascent/houseBanner.ts');
  const { PIGMENT } = await import('/src/ui/ink/palette.ts');
  const m = window.__phaserGame.scene.getScene('MenuScene');
  m.children.removeAll(true); m.cameras.main.setZoom(1).setScroll(0, 0);
  const w = m.scale.width, h = m.scale.height;
  m.add.rectangle(0, 0, w, h, 0xefe4c8).setOrigin(0);
  DYNASTY_SIGNS.forEach((emblem, i) => {
    const x = (i % 4 + 0.5) * w / 4, y = (Math.floor(i / 4) + 0.4) * h / 4;
    const sign = { field: PIGMENT.son, trim: PIGMENT.diepHi, emblem };
    drawHouseSeal(m, sign, 60).setPosition(x - 35, y);
    drawHouseSeal(m, sign, 24).setPosition(x + 33, y);
    m.add.text(x, y + 46, emblem, { fontSize: '15px', color: '#30251d' }).setOrigin(0.5, 0);
  });
});
await menu.waitForTimeout(100); await menu.screenshot({ path: `${out}/all-seals.png` });
await menu.close();

for (const [width, height, lang] of [[390, 844, 'vi'], [320, 568, 'en'], [1440, 900, 'en']]) {
  const page = await open(width, height, lang), tag = `${lang}-${width}-${height}`;
  await page.evaluate(async () => {
    const { rollFounder } = await import('/src/ui/faces/kingLook.ts');
    const { setDynastyFounder } = await import('/src/state/dynasty.ts');
    const f = rollFounder(0, () => 0.5); f.banner = { field: 0x26313c, trim: 0xf3e6c4, emblem: 'crown' };
    setDynastyFounder(f, 'Lê');
    const m = window.__phaserGame.scene.getScene('MenuScene');
    m.mode = 'temple'; m.render(); m.templeSheet.step = 1; m.render();
  });
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => JSON.parse(window.render_game_to_text()).bannerEditor);
  const locate = () => page.evaluate(() => {
    const m = window.__phaserGame.scene.getScene('MenuScene'), area = m.pageScroll;
    const button = area.content.list.find(o => o.getData('signRandom'));
    const hit = button.list.find(o => o.input?.enabled);
    const local = { x: hit.x, y: hit.y };
    area.setScroll(button.y + local.y - area.bounds.height / 2);
    const world = button.getWorldTransformMatrix().transformPoint(local.x, local.y);
    // Derive the affine screen transform from the public inverse; the desktop camera
    // matrix already includes its horizontal offset and must not subtract scroll twice.
    const c = m.cameras.main, origin = c.getWorldPoint(0, 0), unit = c.getWorldPoint(1, 1);
    const p = { x: (world.x - origin.x) / (unit.x - origin.x), y: (world.y - origin.y) / (unit.y - origin.y) };
    const canvas = m.game.canvas.getBoundingClientRect();
    return { x: canvas.x + p.x / m.scale.width * canvas.width, y: canvas.y + p.y / m.scale.height * canvas.height };
  });
  const rolled = [];
  for (let i = 0; i < 5; i++) {
    // Each reroll rebuilds the sheet; allow the shared 350 ms ghost-click guard to expire.
    const p = await locate(); await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(450);
    rolled.push(await page.evaluate(() => JSON.parse(window.render_game_to_text()).bannerEditor));
  }
  check(rolled.every((s, i) => s.emblem !== (i ? rolled[i - 1].emblem : before.emblem)
    && s.options.find(o => o.id === s.emblem).owned), `${tag}: real Random sign clicks choose different owned motifs`,
    { before: before.emblem, rolled: rolled.map(s => s.emblem) });
  check(rolled.every(s => s.field === before.field && s.trim === before.trim && s.points === before.points),
    `${tag}: randomizing keeps colours and spends no points`);
  await page.screenshot({ path: `${out}/${tag}-editor.png` });
  await page.evaluate(() => {
    const m = window.__phaserGame.scene.getScene('MenuScene');
    m.templeSheet.foot().back.onTap(); m.templeSheet.foot().back.onTap();
  });
  check(await page.evaluate(async () => (await import('/src/state/dynasty.ts')).getDynasty().founder.banner.emblem === 'crown'),
    `${tag}: discarding random edits preserves the saved sign`);
  await page.evaluate(() => {
    const m = window.__phaserGame.scene.getScene('MenuScene'); m.mode = 'temple'; m.render(); m.templeSheet.step = 1; m.render();
  });
  await page.waitForTimeout(200);
  const p = await locate(); await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(450);
  const chosen = await page.evaluate(() => JSON.parse(window.render_game_to_text()).bannerEditor.emblem);
  await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').templeSheet.foot().close.onTap());
  if (width > 700) {
    await page.evaluate(() => { const m = window.__phaserGame.scene.getScene('MenuScene'); m.mode = 'main'; m.render(); });
    check(await page.evaluate(chosen => {
      const s = JSON.parse(window.render_game_to_text()).kingdomSign;
      return s.emblem === chosen && s.field === 0x26313c && s.trim === 0xf3e6c4;
    }, chosen), 'saving the editor immediately updates the menu symbol and colours');
  }
  await page.reload(); await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'));
  check(await page.evaluate(async chosen => (await import('/src/state/dynasty.ts')).getDynasty().founder.banner.emblem === chosen, chosen),
    `${tag}: keeping a random sign survives reload`);
  await page.close();
}
await browser.close();
check(errors.length === 0, 'no browser errors', errors);
writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors }, null, 2));
process.exit(checks.some(c => !c.ok) ? 1 : 0);
