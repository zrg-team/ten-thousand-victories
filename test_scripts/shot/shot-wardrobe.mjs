// The wardrobe and the formation, drawn by the game itself.
//
// `docs/phase-1/12-armies-of-dai-viet.md` draws every combination from a slot table; this draws the same
// grids through the real `figure()` and `drawArmy()`, so the two can be put side by side and any
// disagreement is visible rather than argued about. A grid of soldiers is the only honest way to
// check a figure: `proportion.ts` says it is the right size, and nothing but looking says it is
// the right *soldier*.
//
//   node test_scripts/shot/shot-wardrobe.mjs             twelve themes x five arms
//   node test_scripts/shot/shot-wardrobe.mjs tiers       one theme, three tiers, five arms
//   node test_scripts/shot/shot-wardrobe.mjs hosts       one army in each of the five doctrines
//   node test_scripts/shot/shot-wardrobe.mjs dynasties   the same host as the dynasty changes
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.PLAYTEST_URL || process.env.DEV_URL || 'http://127.0.0.1:5179';
const MODE = process.argv[2] ?? 'themes';
const OUT = 'test_scripts/shots';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 520, height: 1400 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

const drew = await page.evaluate(async (mode) => {
  const devices = await import('/src/ui/ink/devices.ts');
  const { PIGMENT } = await import('/src/ui/ink/palette.ts');
  const game = window.__phaserGame;
  const scene = game.scene.getScene('MenuScene');
  const W = game.scale.width, H = game.scale.height;

  // A clean sheet over whatever the menu is showing, so the plate is the only thing in frame.
  const sheet = scene.add.graphics().setDepth(99998).setScrollFactor(0);
  sheet.fillStyle(PIGMENT.diepHi, 1);
  sheet.fillRect(0, 0, W, H);
  const g = scene.add.graphics().setDepth(99999).setScrollFactor(0);
  const label = (text, x, y, size = 10) => scene.add.text(x, y, text, {
    fontFamily: 'serif', fontSize: `${size}px`, color: '#2a2118',
  }).setDepth(100000).setScrollFactor(0);

  const ARMS = ['spear', 'sword', 'skirmish', 'bow', 'mounted'];
  const THEMES = ['ly', 'tran', 'le', 'trinh', 'nguyenLord', 'tayson', 'nguyen',
    'song', 'yuan', 'ming', 'qing', 'champa'];
  const DOCTRINES = ['balanced', 'spears', 'archers', 'shock', 'horse'];
  let n = 0;

  if (mode === 'tiers') {
    ARMS.forEach((arm, r) => {
      const y = 120 + r * 130;
      label(arm, 6, y - 54, 11);
      [0, 1, 2].forEach((tier, c) => {
        const x = 110 + c * 92;
        if (r === 0) label(['levy', 'trained', 'guard'][c], x - 20, 34, 11);
        devices.figure(g, x, y, 7, PIGMENT.muc, { theme: 'tran', tier, arm, accent: PIGMENT.son });
        n += 1;
      });
    });
  } else if (mode === 'hosts') {
    // One army, five ways. The point is that the doctrine changes the formation's *shape*, so
    // read the blocks and the ground between them, not the men.
    DOCTRINES.forEach((composition, i) => {
      const y = 130 + i * 196;
      const shape = devices.armyShape(2420, composition, 2.0);
      label(`${composition} — ${shape.marks} marks, ${shape.blocks.length} blocks`, 8, y - 106, 11);
      devices.drawArmy(g, 150, y, 2420, 41, PIGMENT.muc, 2.0, {
        theme: 'nguyen', tier: 1, accent: PIGMENT.son, composition,
      });
      shape.blocks.forEach((b) => {
        label(`${b.key} ${b.marks}`, 190 + b.x, y + b.feet + 6, 7);
      });
      n += shape.marks;
    });
  } else if (mode === 'dynasties') {
    // The same host as the dynasty changes: the progression, as a block.
    ['ly', 'tran', 'le', 'nguyen', 'song', 'qing', 'champa'].forEach((theme, i) => {
      const y = 150 + i * 178;
      label(theme, 8, y - 84, 11);
      devices.drawArmy(g, 150, y, 1600, 17, PIGMENT.muc, 1.7, {
        theme, tier: i === 0 ? 0 : 1, accent: PIGMENT.son, composition: 'balanced',
      });
      n += 1;
    });
  } else {
    THEMES.forEach((theme, r) => {
      const y = 96 + r * 76;
      label(theme, 4, y - 40, 10);
      ARMS.forEach((arm, c) => {
        const x = 92 + c * 62;
        if (r === 0) label(arm, x - 20, 26, 9);
        devices.figure(g, x, y, 4.6, PIGMENT.muc, { theme, tier: 1, arm, accent: PIGMENT.son });
        n += 1;
      });
    });
  }
  scene.cameras.main.setScroll(0, 0);
  game.step(0, 16);
  return n;
}, MODE);

await page.waitForTimeout(400);
fs.mkdirSync(OUT, { recursive: true });
const file = `${OUT}/wardrobe-${MODE}.png`;
await page.locator('canvas').screenshot({ path: file });

console.log(`drew ${drew} -> ${file}`);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
