// The manual, the front-page tour, and the bare glyph pair on the action bar.
//
// Three things that shipped together and are checked together: How to Play (two chapters, both
// languages, at the shortest sheet the design surface allows), the five tour cards a first-time
// player is shown, and the Pause/Menu marks now that nothing is printed round them.
//
// The tour needs `?tour=1`. A driven browser never gets it by default — see `state/tour.ts` — and
// that suppression is exactly what keeps the other hundred-odd scripts working, so this script has
// to ask for it by name.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const TABS = ['conquest', 'battle'];
const browser = await chromium.launch();
let failures = 0;

const fail = (message) => { failures += 1; console.log(`FAIL ${message}`); };

// The chapter buttons sit below the copilot launchers, so their position follows the localized
// header's measured height. Resolve the real hit target instead of repeating layout coordinates.
const guideTabAt = (page, tab) => page.evaluate((tab) => {
  const scene = window.__phaserGame.scene.getScene('GuideScene');
  const find = (children) => {
    for (const child of children ?? []) {
      if (child.getData?.('guideTab') === tab) return child;
      const nested = find(child.list);
      if (nested) return nested;
    }
    return null;
  };
  const button = find(scene.children.list);
  const hit = button?.list?.find(child => child.input?.enabled);
  if (!hit) return null;
  const world = button.getWorldTransformMatrix().transformPoint(hit.x, hit.y);
  const camera = scene.cameras.main;
  const origin = camera.getWorldPoint(0, 0), unit = camera.getWorldPoint(1, 1);
  const canvas = scene.game.canvas.getBoundingClientRect();
  return {
    x: canvas.x + ((world.x - origin.x) / (unit.x - origin.x)) / scene.scale.width * canvas.width,
    y: canvas.y + ((world.y - origin.y) / (unit.y - origin.y)) / scene.scale.height * canvas.height,
  };
}, tab);

for (const [lang, h] of [['en', 844], ['vi', 844], ['vi', 620]]) {
  const page = await browser.newPage({ viewport: { width: 390, height: h }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);

  // ── The front page, and the footer that now holds three doors ────────────
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `test_scripts/shots/guide-menu-${lang}-${h}.png` });

  // Reached by pressing the real button, not by starting the scene — the point is partly to prove
  // the footer's third door is pressable at the width it ended up with.
  const at = await page.waitForFunction(() => {
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    for (const child of scene.children.list) {
      const label = child.list?.find?.((k) => k.type === 'Text');
      if (label && /How to Play|Cách chơi/.test(label.text)) {
        const m = label.getWorldTransformMatrix();
        return { x: m.tx, y: m.ty, wrapped: label.text.includes('\n') };
      }
    }
    return null;
  }, null, { timeout: 15000 }).then((handle) => handle.jsonValue()).catch(() => null);

  if (!at) {
    fail(`${lang} h=${h}: no How to Play button on the front page`);
    await page.close();
    continue;
  }
  // A three-word label in a 104-unit button is the thing most likely to have gone wrong here.
  if (at.wrapped) fail(`${lang} h=${h}: the How to Play label wrapped inside its button`);

  await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('GuideScene'), null, { timeout: 8000 })
    .catch(() => fail(`${lang} h=${h}: pressing How to Play did not open the page`));
  await page.waitForTimeout(700);

  for (const tab of TABS) {
    const target = await guideTabAt(page, tab);
    if (!target) { fail(`${lang} h=${h}: no ${tab} chapter button`); continue; }
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(tab => window.__phaserGame.scene.getScene('GuideScene').guideState().tab === tab, tab)
      .catch(() => fail(`${lang} h=${h}: pressing ${tab} did not select the chapter`));
    await page.waitForTimeout(450);
    await page.screenshot({ path: `test_scripts/shots/guide-${tab}-${lang}-${h}.png` });
    // Scrolled to the foot as well: every tab runs past one screen in at least one language, and
    // the bottom is where a mis-measured card overlaps the one under it.
    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test_scripts/shots/guide-${tab}-foot-${lang}-${h}.png` });
  }

  // ── The tour, card by card ───────────────────────────────────────────────
  await page.goto(`${BASE}/?capture=1&tour=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1400);
  for (let step = 1; step <= 5; step += 1) {
    await page.screenshot({ path: `test_scripts/shots/tour-${step}-${lang}-${h}.png` });
    if (step === 5) break;
    // "Next" sits at the card's right edge; the card is centred and 350 wide, so the button's
    // centre is a fixed x. Its y is found by asking the scene, because the card follows whatever
    // it is pointing at and that moves with the sheet's height.
    const next = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      let best = null;
      for (const child of scene.children.list) {
        const label = child.list?.find?.((k) => k.type === 'Text');
        if (label && /^(Next|Tiếp)$/.test(label.text)) {
          const m = label.getWorldTransformMatrix();
          best = { x: m.tx, y: m.ty };
        }
      }
      return best;
    });
    if (!next) { fail(`${lang} h=${h}: tour card ${step} has no Next button`); break; }
    await page.mouse.click(next.x, next.y);
    await page.waitForTimeout(450);
  }

  // ── The action bar's two bare marks ──────────────────────────────────────
  //
  // Pause and the run menu lost their printed surfaces. Shot in both states, because "paused" used
  // to be carried by the frame and is now carried by the glyph itself.
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  // A run opens behind a stack of full-screen cards — the mandate first, then whatever the
  // director has queued — and `renderActionBar` hides the bar for every one of them. So the
  // opening is answered until the queue is empty, the way the other ascent scripts do it, through
  // the scene's own choice event rather than by aiming a click at a card.
  const barUp = () => page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
    .children.list.some((c) => c.constructor?.name === 'ActionBar' && c.visible));
  // Answered until the bar comes back rather than a fixed number of times: the cards do not all
  // exist at once. The mandate is up immediately, the founder is queued behind it and does not
  // appear until the tick after it is answered, so a loop that only drains what is pending right
  // now stops one card early and leaves the bar hidden behind the one it never saw.
  for (let guard = 0; guard < 24 && !(await barUp()); guard += 1) {
    await page.evaluate(() => {
      // Answered off `openPromptKey`, NOT off `state.pendingAscentPrompt`. The scene consumes the
      // prompt out of the state the moment it draws it and tracks the open card by key instead, so
      // by the time a driver can see the card the state field it would have read is already null —
      // which is why the obvious version of this loop emitted nothing and waited out its guard.
      //
      // The key ends in the card's option ids, comma-separated, and the LAST one is taken because
      // an id may itself contain a colon (`court:treasurer`) but never a comma. It is also the
      // safest of them: `reserve`, `hold`, `pass` and `skip` all sort last on the cards that have
      // one, so the opening is answered by declining rather than by taking things at random.
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      const key = scene.openPromptKey;
      if (!key) return;
      scene.events.emit('ui:ascent-choice', String(key).split(',').pop() || 'ok');
    });
    await page.waitForTimeout(600);
  }
  if (!(await barUp())) fail(`${lang} h=${h}: the action bar never came back after the opening cards`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `test_scripts/shots/bar-running-${lang}-${h}.png`, clip: { x: 0, y: h - 56, width: 390, height: 56 } });
  // The cluster is pinned to the right edge and laid out by `actionBarSlots`: margin 6, two 34-wide
  // controls with the ascent bar's own 2-unit gap between them. SYSTEM_CLUSTER_GAP is the space in
  // FRONT of the cluster, not inside it — getting those two the wrong way round is what made the
  // first version of this click land between the lanes and the marks.
  await page.mouse.click(390 - 6 - (34 * 2 + 2) + 17, h - 25);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `test_scripts/shots/bar-paused-${lang}-${h}.png`, clip: { x: 0, y: h - 56, width: 390, height: 56 } });
  // Read off the scene, not off `window.__mandateState`. The bench bootstrap stops MenuScene and
  // MenuScene clears that global on the way past, so under this harness it is reliably undefined
  // while a run is quite happily running underneath — an assertion against it fails whatever the
  // button did.
  const paused = await page.evaluate(() => Boolean(
    window.__phaserGame.scene.getScene('ConquestUIScene').state?.isStrategyPause,
  ));
  if (!paused) fail(`${lang} h=${h}: pressing the bare pause mark did not stop the clock`);

  if (errors.length) fail(`${lang} h=${h}: console — ${errors.slice(0, 3).join(' | ')}`);
  else console.log(`ok ${lang} h=${h}: guide, tour, errors none`);
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} problem(s)` : '\nall good');
process.exit(failures ? 1 : 0);
