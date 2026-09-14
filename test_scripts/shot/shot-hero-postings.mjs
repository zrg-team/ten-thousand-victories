/**
 * Shoots the hero posting screens on a Beta reign, at phone and desktop width, in both languages,
 * and checks the rendered lists for the three things a screenshot cannot prove at a glance:
 * unique row keys, no raw i18n keys, and no whole-state clone while a list is drawn.
 *
 *   node test_scripts/shot/shot-hero-postings.mjs            (writes output/hero-postings/*.png)
 *   WIDTHS=400 LANGS=vi node test_scripts/shot/shot-hero-postings.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const WIDTHS = (process.env.WIDTHS ?? '400,1440').split(',').map(Number);
const LANGS = (process.env.LANGS ?? 'vi,en').split(',');
const OUT = 'output/hero-postings';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];
const checks = [];

for (const lang of LANGS) for (const width of WIDTHS) {
  const desktop = width >= 1000;
  const page = await browser.newPage({ viewport: { width, height: desktop ? 1000 : 860 }, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => problems.push(`${lang}-${width} PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${lang}-${width} CONSOLE ${m.text().slice(0, 160)}`); });
  await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);
  await page.goto(`${URL}/?capture=1${desktop ? '&layout=desktop' : ''}`);
  await page.waitForFunction(() => window.__startBenchGame && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.evaluate(() => window.__startBenchGame(20260913, 'ascent', 'beta'));
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
  await page.waitForTimeout(600);

  await page.evaluate(async () => {
    const s = window.__mandateState;
    const { generateHero } = await import('/src/data/heroFactory.ts');
    const service = await import('/src/systems/heroes/HeroService.ts');
    const P = 'dai-viet';
    s.pendingAscentPrompt = undefined; s.ascent.promptQueue = []; s.isPaused = false; s.invasions = [];
    const seat = s.lands.find((l) => l.id === s.ascent.capitalLandId);
    const near = s.lands.find((l) => seat.neighbors.includes(l.id)); near.ownerId = P;
    const far = s.lands.find((l) => near.neighbors.includes(l.id) && l.id !== seat.id && !seat.neighbors.includes(l.id)); far.ownerId = P;
    s.court.unlockedSeats = [...new Set([...s.court.unlockedSeats, 'marshal', 'treasurer', 'spymaster', 'chancellor', 'steward'])];
    const mk = (seed) => { const h = generateHero(seed); s.heroes.push(h); service.initializeRecruitedHero(s, h); return h; };
    const minister = mk(401), governor = mk(402), freed = mk(403), traveller = mk(404), strong = mk(405);
    strong.stats.diplomacy = 92; strong.stats.administration = 80;
    service.commitHeroAssignment(s, minister, { kind: 'court', seat: 'treasurer' });
    service.commitHeroAssignment(s, strong, { kind: 'court', seat: 'chancellor' });
    service.commitHeroAssignment(s, freed, { kind: 'province', landId: far.id });
    service.commitHeroAssignment(s, governor, { kind: 'province', landId: far.id }); // relieves `freed` at far — the reported state
    const q = service.previewHeroTransfer(s, traveller.id, { kind: 'court', seat: 'marshal' });
    service.transferHero(s, q);
    freed.growth.xp = 18;
    for (const k of s.kingdoms) if (k.id !== P) k.relations = 30 + (k.id.length * 7) % 50;
    window.__shot = { freed: freed.id, minister: minister.id, kingdom: s.kingdoms.find((k) => k.id !== P && !k.isDefeated && (k.relations ?? 50) >= 40)?.id };
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.events.emit('state-changed');
    ui.openLane('heroes');
  });
  await page.waitForTimeout(400);

  const clones = await page.evaluate(() => {
    window.__cloneCount = 0;
    if (!window.__cloneWrapped) {
      const real = globalThis.structuredClone;
      globalThis.structuredClone = (v, o) => { window.__cloneCount += 1; return real(v, o); };
      window.__cloneWrapped = true;
    }
    return 0;
  });

  const shots = [
    ['detail-work', `const { showHeroDepth } = await import('/src/scenes/conquest/screens/heroDepth.ts'); ui.data.set('heroDepthTab', { heroId: window.__shot.freed, index: 0 }); ui.replaceLanePage(() => showHeroDepth(ui, window.__shot.freed));`],
    ['detail-growth', `const { showHeroDepth } = await import('/src/scenes/conquest/screens/heroDepth.ts'); ui.data.set('heroDepthTab', { heroId: window.__shot.freed, index: 1 }); ui.replaceLanePage(() => showHeroDepth(ui, window.__shot.freed));`],
    ['detail-record', `const { showHeroDepth } = await import('/src/scenes/conquest/screens/heroDepth.ts'); ui.data.set('heroDepthTab', { heroId: window.__shot.freed, index: 2 }); ui.replaceLanePage(() => showHeroDepth(ui, window.__shot.freed));`],
    ['transfers', `const { showHeroTransfers } = await import('/src/scenes/conquest/screens/heroDepth.ts'); ui.replaceLanePage(() => showHeroTransfers(ui, window.__shot.freed));`],
    ['resident-from-hero', `const { showResidentPosting } = await import('/src/scenes/conquest/screens/heroDepth.ts'); ui.replaceLanePage(() => showResidentPosting(ui, window.__shot.freed));`],
    ['resident-from-kingdom', `const { showResidentPosting } = await import('/src/scenes/conquest/screens/heroDepth.ts'); ui.replaceLanePage(() => showResidentPosting(ui, undefined, window.__shot.kingdom));`],
    ['seat-picker', `const { showSeatPicker } = await import('/src/scenes/conquest/screens/court.ts'); showSeatPicker(ui, 'spymaster');`],
    ['seat-picker-held', `const { showSeatPicker } = await import('/src/scenes/conquest/screens/court.ts'); showSeatPicker(ui, 'treasurer');`],
  ];
  for (const [name, code] of shots) {
    const info = await page.evaluate(async (code) => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      window.__cloneCount = 0;
      await (new Function('ui', `return (async () => { ${code} })();`))(ui);
      await new Promise((r) => setTimeout(r, 250));
      const area = ui.activeScrollAreas?.at?.(-1);
      const keys = (area?.lazyRows ?? []).map((row) => row.key);
      const texts = [];
      const walk = (obj) => { if (!obj) return; if (obj.type === 'Text' && obj.visible) texts.push(obj.text); for (const child of obj.list ?? []) walk(child); };
      walk(ui.modalLayer);
      return { clones: window.__cloneCount, keys: keys.length, unique: new Set(keys).size, raw: texts.filter((x) => /^(hero|ascent)\.[a-zA-Z.]+/.test(x)).slice(0, 3) };
    }, code);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/${name}-${lang}-${width}.png` });
    checks.push({ name: `${name} ${lang}-${width}`, ...info });
  }
  // Scroll the transfer page to its middle, where the provinces are.
  await page.evaluate(async () => {
    const { showHeroTransfers } = await import('/src/scenes/conquest/screens/heroDepth.ts');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.replaceLanePage(() => showHeroTransfers(ui, window.__shot.freed));
    await new Promise((r) => setTimeout(r, 200));
    const area = ui.activeScrollAreas?.at?.(-1);
    area?.scrollTo?.(Math.max(0, (area.contentHeight ?? 800) / 2));
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/transfers-mid-${lang}-${width}.png` });
  await page.close();
  void clones;
}
await browser.close();

let failed = 0;
for (const c of checks) {
  const listClone = c.name.startsWith('seat-picker') ? 0 : 0;
  const ok = c.unique === c.keys && c.raw.length === 0 && c.clones <= listClone;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}: rows ${c.keys} unique ${c.unique} clones ${c.clones}${c.raw.length ? ` raw ${c.raw.join('|')}` : ''}`);
}
for (const p of problems) { failed += 1; console.log(`FAIL ${p}`); }
console.log(`\n${checks.length + problems.length - failed}/${checks.length + problems.length} ok — shots in ${OUT}`);
process.exit(failed ? 1 : 0);
