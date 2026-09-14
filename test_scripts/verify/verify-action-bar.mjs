// The bottom strip has to hold six or seven labels across 390 units without a word touching its
// own border, its neighbour, or the status dot stamped on its corner — in both languages, and in
// Dragon Ascent both with and without the Battle button a live siege adds.
//
// This exists because the bar shipped with the labels drawn straight through their buttons:
// Phaser's word wrap only breaks on spaces, so "Heroes" (40 units) simply overflowed a 47-unit
// lane, and Vietnamese wrapped to two lines that filled the button top to bottom and ran under the
// dot. Every number below is read off the live display list, not the layout function, so a label
// that renders wider than it was laid out for still fails.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

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

/** Every lane's rectangle, the type inside it, and every dot drawn over it. */
const readBar = (uiKey, battleLive) => page.evaluate(async ([key, live]) => {
  const { actionBarSlots, ACTION_BUTTON_HEIGHT } = await import('/src/ui/ActionBar.ts');
  const { GAME_WIDTH, GAME_HEIGHT, ACTION_BAR_HEIGHT } = await import('/src/game/constants.ts');
  const scene = window.__phaserGame.scene.getScene(key);
  const bar = scene.actionBar;
  if (live) {
    bar.context = () => ({ battleLive: true });
    bar.refresh();
  }
  const slots = actionBarSlots(scene.state.gameMode, live ? { battleLive: true } : {});

  const dots = bar.list
    .filter((c) => c.type === 'Arc')
    .map((c) => ({ x: c.x, y: c.y, r: c.radius }));

  const labels = [];
  for (const child of bar.list) {
    if (!child.list) continue;
    const text = child.list.find((c) => c.type === 'Text' && c.text);
    if (!text) continue;
    // Origin-aware, because the label is no longer centred in anything.
    //
    // This used to assume `originY = 0.5` and a button-shaped box around the word. The lane is a
    // glyph over a word now: the container sits at the lane's centre (the press tween scales about
    // it) and the label hangs from the glyph with `originY = 0`. Read with the old assumption the
    // whole row measured half a line high, which reported a status dot sitting on a word it clears
    // by three units. Reading the origin the label was actually given cannot drift again.
    const left = child.x + text.x - text.width * text.originX;
    const top = child.y + text.y - text.height * text.originY;
    labels.push({
      text: text.text.replace('\n', ' / '),
      fontSize: Number.parseFloat(text.style.fontSize),
      left,
      right: left + text.width,
      top,
      bottom: top + text.height,
    });
  }
  return {
    slots, labels, dots,
    height: ACTION_BUTTON_HEIGHT,
    width: GAME_WIDTH,
    // The strip itself, which is what a label has to stay inside now that it is allowed to sit
    // below the 36-unit button box in the clear the bar keeps under it.
    barTop: GAME_HEIGHT - ACTION_BAR_HEIGHT,
    barBottom: GAME_HEIGHT,
  };
}, [uiKey, battleLive]);

for (const mode of ['ascent', 'empire', 'campaign', 'rival']) {
  for (const lang of ['en', 'vi']) {
    for (const battleLive of mode === 'ascent' ? [false, true] : [false]) {
      await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((l) => localStorage.setItem('mandate:language:v1', l), lang);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
      await page.evaluate((m) => window.__startBenchGame(1337, m, 'v1'), mode);
      const worldKey = mode === 'ascent' ? 'ConquestScene' : 'MapScene';
      const uiKey = mode === 'ascent' ? 'ConquestUIScene' : 'UIScene';
      await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), worldKey, { timeout: 30000 });
      await page.waitForTimeout(1200);

      const { slots, labels, dots, width, barTop, barBottom } = await readBar(uiKey, battleLive);
      const tag = `${mode}/${lang}${battleLive ? '/siege' : ''}`;

      // 1 · Every button is on the screen, and no two of them touch.
      const lanes = slots.filter((s) => !s.system);
      const offscreen = slots.filter((s) => s.x < 0 || s.x + s.width > width);
      check(`${tag}: every button inside the screen`, offscreen.length === 0,
        offscreen.map((s) => `${s.action}@${s.x}+${s.width}`).join(', '));
      const gaps = slots.slice(1).map((s, i) => Math.round(s.x - (slots[i].x + slots[i].width)));
      check(`${tag}: buttons keep 3 units of daylight`, gaps.every((g) => g >= 3), `gaps ${gaps.join(',')}`);

      // 2 · No label crosses into a neighbouring lane, and none of it is printed off the bar.
      //
      // This used to demand 4 units of clearance inside the button, which was the border plus its
      // wobble: a word inside that was on paper and a word outside it was on ink. There is no
      // border any more — the lanes are a glyph over a word on open paper — so the thing that can
      // actually go wrong changed with it. What matters now is that a lane's word stays in its own
      // column and inside the strip: the type sits *below* the 36-unit button box by design, in
      // the clear between the box and the foot of the screen, and measuring it against that box
      // failed every lane in the game while nothing was wrong with any of them.
      const laneFor = (l) => lanes.find((s) => {
        const mid = (l.left + l.right) / 2;
        return mid >= s.x && mid <= s.x + s.width;
      });
      const spill = labels.filter((l) => {
        const lane = laneFor(l);
        if (!lane) return true;
        return l.left < lane.x - 1
          || l.right > lane.x + lane.width + 1
          || l.top < barTop
          || l.bottom > barBottom;
      });
      check(`${tag}: no label spills out of its button`, spill.length === 0,
        spill.map((l) => `${l.text} [${Math.round(l.left)}..${Math.round(l.right)}]`).join(', '));

      // 3 · One type size for the whole row, and never below the readable floor.
      const sizes = [...new Set(labels.map((l) => l.fontSize))];
      check(`${tag}: the row is set in one size`, sizes.length === 1, `sizes ${sizes.join(',')}`);
      // 8, not 9. The row is now set at the largest size that keeps EVERY lane on one line, and
      // "Ngoại giao" misses one line at 9 by two units — a whole row half a point smaller buys an
      // aligned baseline across the bar, which is worth more than the half point now that a glyph
      // over each word is doing the identifying. Below 8 it stops being type.
      check(`${tag}: type stays readable`, sizes.every((s) => s >= 8), `sizes ${sizes.join(',')}`);

      // 4 · The status dots sit on the corners, not on the words.
      const hit = [];
      for (const dot of dots) {
        for (const l of labels) {
          const nx = Math.max(l.left, Math.min(dot.x, l.right));
          const ny = Math.max(l.top, Math.min(dot.y, l.bottom));
          // Named with the numbers: "a dot lands on Triều đình" is not something anyone can act
          // on without re-measuring the bar by hand, which is what this script exists to avoid.
          if ((nx - dot.x) ** 2 + (ny - dot.y) ** 2 < dot.r ** 2) {
            hit.push(`${l.text} [${Math.round(l.left)}..${Math.round(l.right)} × ${Math.round(l.top)}..${Math.round(l.bottom)}] vs dot (${Math.round(dot.x)},${Math.round(dot.y)}) r${dot.r}`);
          }
        }
      }
      check(`${tag}: no status dot lands on a label`, hit.length === 0, hit.join(', '));
    }
  }
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
