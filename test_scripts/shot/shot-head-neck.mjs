// Focused anatomy sheet: every head family with the neck width selected for it.
//
// Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/shot/shot-head-neck.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const HEADS = [
  'head-oval', 'head-narrow', 'head-broad', 'head-square',
  'head-soft', 'head-round', 'head-long', 'head-heart',
  'head-angular', 'head-wide', 'head-slim', 'head-full',
  'head-tapered', 'head-blunt', 'head-fine', 'head-stern',
];

mkdirSync('output/web-game', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`CONSOLE ${message.text()}`);
});

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null,
  { timeout: 30000 },
);
await page.evaluate(() => window.__startBenchGame(20260901, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(700);

const result = await page.evaluate(async ({ heads }) => {
  const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
  const { neckForHead } = await import('/src/ui/faces/heroLook.ts');
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.children.removeAll(true);

  const defs = new Map(FACE_PART_DEFS.map((part) => [part.key, part]));
  const cols = 4;
  const rows = 4;
  const cellW = 390 / cols;
  const cellH = 844 / rows;
  const scale = 1.12;
  const addPart = (key, originX, originY, tint) => {
    const def = defs.get(key);
    const image = scene.add.image(
      originX + def.cx * scale,
      originY + def.cy * scale,
      'face:atlas',
      key,
    ).setDisplaySize(def.w * scale, def.h * scale);
    if (tint !== undefined) image.setTint(tint);
    return image;
  };

  scene.add.graphics().fillStyle(0xe8ddc4, 1).fillRect(0, 0, 390, 844).setDepth(-10);
  const selections = [];
  heads.forEach((head, index) => {
    const column = index % cols;
    const row = Math.floor(index / cols);
    const left = column * cellW;
    const top = row * cellH;
    const x = left + cellW / 2;
    const y = top + 83;
    const neck = neckForHead(head);
    selections.push({ head, neck });

    scene.add.graphics()
      .fillStyle(0xf2e6c8, 0.9)
      .lineStyle(1, 0x7b6a50, 0.5)
      .fillRoundedRect(left + 3, top + 4, cellW - 6, 154, 2)
      .strokeRoundedRect(left + 3, top + 4, cellW - 6, 154, 2)
      .setDepth(-5);
    addPart('robe-body', x, y, 0x775038);
    addPart(neck, x, y, 0xb77d58);
    addPart('ears-small', x, y, 0xb77d58);
    addPart(head, x, y, 0xd79a70);
    scene.add.text(x, top + 166, head.replace('head-', ''), {
      color: '#3a2c1d', fontFamily: 'Arial, sans-serif', fontSize: '8px', align: 'center',
    }).setOrigin(0.5);
    scene.add.text(x, top + 178, neck.replace('neck', 'neck:'), {
      color: '#725a3d', fontFamily: 'Arial, sans-serif', fontSize: '7px', align: 'center',
    }).setOrigin(0.5);
  });
  return selections;
}, { heads: HEADS });

await page.waitForTimeout(350);
await page.screenshot({ path: 'output/web-game/head-neck-final.png' });
console.log(JSON.stringify(result));
console.log(errors.length ? `FAIL ${errors.length} errors\n${errors.slice(0, 5).join('\n')}` : 'PASS: no console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
