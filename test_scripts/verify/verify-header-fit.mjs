// The top strip has to hold its type without touching its own friezes, in both languages — and
// Vietnamese is the tight case, because the title's diacritics sit higher than any Latin cap.
//
// Also checks that the Dragon Ascent readout below it still ends inside its own band now that the
// band is shorter, and that the two together are no taller than they were.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = process.env.SHOT_OUT ?? 'output/header';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

for (const mode of ['empire', 'ascent']) {
  for (const lang of ['en', 'vi']) {
    await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((l) => {
      localStorage.setItem('mandate:map-theme:v1', 'dong-ho');
      localStorage.setItem('mandate:language:v1', l);
    }, lang);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await page.evaluate((m) => window.__startBenchGame(1337, m), mode);
    const sceneKey = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
    await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), sceneKey, { timeout: 30000 });
    await page.waitForTimeout(1800);

    const layout = await page.evaluate(async (uiKey) => {
      const { HEADER_BANDS } = await import('/src/ui/ResourceBar.ts');
      const { HEADER_HEIGHT } = await import('/src/game/constants.ts');
      const scene = window.__phaserGame.scene.getScene(uiKey);
      // The resource bar is the one container at depth 80.
      const bar = scene.children.list.find((c) => c.type === 'Container' && c.depth === 80);
      const STORES = ['food', 'supplies', 'gold', 'humans'];
      const storeIcon = (c) => STORES.includes(c.getData?.('conquestUiIcon')?.id);
      const texts = bar.list.filter((c) => c.type === 'Text');
      const icons = bar.list.filter((c) => c.type === 'Image' && storeIcon(c));
      const title = texts[0];
      // The title, then the ledger's own name beside it — neither is a store figure. The stores
      // are the trailing run of numbers, one per store icon.
      const numbers = texts.slice(-icons.length);
      const bounds = (o) => { const b = o.getBounds(); return { top: b.top, bottom: b.bottom }; };
      return {
        headerHeight: HEADER_HEIGHT,
        bands: HEADER_BANDS,
        title: bounds(title),
        titleText: title.text,
        rowTop: Math.min(...[...numbers, ...icons].map((o) => bounds(o).top)),
        rowBottom: Math.max(...[...numbers, ...icons].map((o) => bounds(o).bottom)),
      };
    }, mode === 'ascent' ? 'ConquestUIScene' : 'UIScene');

    const bandTopEnd = layout.bands.top.y + layout.bands.top.height;
    const label = `${mode} ${lang}`;
    check(`${label}: "${layout.titleText}" clears the upper frieze`,
      layout.title.top >= bandTopEnd,
      `title top ${layout.title.top.toFixed(1)} vs frieze end ${bandTopEnd}`);
    check(`${label}: the title and the stores do not collide`,
      layout.rowTop >= layout.title.bottom - 1,
      `row top ${layout.rowTop.toFixed(1)} vs title bottom ${layout.title.bottom.toFixed(1)}`);
    check(`${label}: the stores clear the lower frieze`,
      layout.rowBottom <= layout.bands.bottom.y,
      `row bottom ${layout.rowBottom.toFixed(1)} vs frieze start ${layout.bands.bottom.y}`);

    /**
     * The four store glyphs read as one size.
     *
     * Every frame in the atlas is fitted to its own box, but the drawing inside is not the same
     * shape — a coin fills its square, two people fill two thirds of theirs — so four icons set
     * to one display size print visibly different amounts of ink, which is what made food, goods
     * and gold look a size bigger than population. Measured off the real atlas alpha and the real
     * display sizes, so it fails if either the art or `OPTICAL_FIT` drifts.
     */
    if (mode === 'ascent' && lang === 'en') {
      const optical = await page.evaluate((uiKey) => {
        const scene = window.__phaserGame.scene.getScene(uiKey);
        const bar = scene.children.list.find((c) => c.type === 'Container' && c.depth === 80);
        const STORES = ['food', 'supplies', 'gold', 'humans'];
        const icons = bar.list.filter((c) => STORES.includes(c.getData?.('conquestUiIcon')?.id));
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        return icons.map((icon) => {
          const frame = icon.frame;
          const source = frame.source.image ?? frame.texture.getSourceImage();
          const { cutX, cutY, cutWidth, cutHeight } = frame;
          canvas.width = cutWidth; canvas.height = cutHeight;
          ctx.clearRect(0, 0, cutWidth, cutHeight);
          ctx.drawImage(source, cutX, cutY, cutWidth, cutHeight, 0, 0, cutWidth, cutHeight);
          const data = ctx.getImageData(0, 0, cutWidth, cutHeight).data;
          let x0 = cutWidth, y0 = cutHeight, x1 = -1, y1 = -1;
          for (let y = 0; y < cutHeight; y += 1) {
            for (let x = 0; x < cutWidth; x += 1) {
              if (data[(y * cutWidth + x) * 4 + 3] <= 16) continue;
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
          const inkW = ((x1 - x0 + 1) / cutWidth) * icon.displayWidth;
          const inkH = ((y1 - y0 + 1) / cutHeight) * icon.displayHeight;
          return { id: icon.getData('conquestUiIcon').id, optical: +Math.sqrt(inkW * inkH).toFixed(2) };
        });
      }, 'ConquestUIScene');
      const sizes = optical.map((o) => o.optical);
      const spread = sizes.length ? (Math.max(...sizes) - Math.min(...sizes)) / (Math.min(...sizes) || 1) : 1;
      check(`${label}: the four stores print the same amount of ink`,
        optical.length === 4 && spread <= 0.08,
        optical.map((o) => `${o.id} ${o.optical}`).join(', ') + ` — spread ${(spread * 100).toFixed(1)}%`);
    }

    if (mode === 'ascent') {
      const hud = await page.evaluate(async () => {
        const { ASCENT_HUD_HEIGHT } = await import('/src/ui/ascent/AscentHud.ts');
        const { HEADER_HEIGHT } = await import('/src/game/constants.ts');
        const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
        // Everything the readout draws lives in its root container (depth 90) — the figures, the
        // labels, the meters; the plate is the one Graphics child and has no bounds to read.
        const root = scene.children.list.find((c) => c.type === 'Container' && c.depth === 90);
        const parts = (root?.list ?? []).filter((c) => c.type !== 'Graphics' && typeof c.getBounds === 'function' && c.visible);
        // Bounds are world-space; the root is at the origin on the phone, which is where this runs.
        const bottom = parts.length ? Math.max(...parts.map((c) => c.getBounds().bottom)) : Number.NaN;
        return { bottom, hudBottom: HEADER_HEIGHT + ASCENT_HUD_HEIGHT, total: HEADER_HEIGHT + ASCENT_HUD_HEIGHT };
      });
      check(`${label}: the readout ends inside its own band`,
        hud.bottom <= hud.hudBottom - 1,
        `lowest element ${hud.bottom.toFixed(1)} vs band close ${hud.hudBottom}`);
      // The header's eight units came out of this band, so the chrome must not have grown.
      check(`${label}: chrome is no taller than before (110)`, hud.total <= 110, `${hud.total}px`);
    }

    await page.screenshot({ path: `${OUT}/fit-${mode}-${lang}.png`, clip: { x: 0, y: 0, width: 390, height: 130 } });
  }
}

console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no console errors');
if (errors.length) failures += 1;
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
