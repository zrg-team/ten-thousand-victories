/**
 * A press that ends a run must not press the front page it reveals — however many times the
 * platform delivers it.
 *
 * Reported as *click Exit in the conquest menu, then it clicks Start in the main menu and opens
 * back*. A phone browser follows a touch with a compatibility mouse pair, or a ghost click up to
 * ~300 ms later; a WebView sends the mouse pair twice. Each is a fresh press to Phaser, and it
 * lands on whatever the first press built under the finger: the front page's Play card, which
 * starts a run. The guard is `pressIsEchoOnto` in `ui/inputGeneration.ts`.
 *
 * Staged on the band where "Exit without saving" on the Dragon Ascent sheet overlaps Play on the
 * front page (y 462-481 on an 844 sheet), as a returning player (no first-run tour veil).
 *
 * Three echo shapes must be clean, one honest single press must still exit, and a deliberate
 * second tap on a different control 200 ms later must still work — the guard must not make the
 * page deaf.
 *
 *   node test_scripts/verify/verify-press-echo.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();
await page.addInitScript(() => {
  localStorage.setItem('mandate:tour:v1', 'seen');
  localStorage.setItem('mandate:tour:run:v1', 'seen');
  localStorage.setItem('mandate:tour:classic:v1', 'seen');
});
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0, 200)}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForFunction(
  () => window.__phaserGame?.scene.isActive('MenuScene') && typeof window.__startBenchGame === 'function',
  null, { timeout: 30000 },
);
await page.waitForTimeout(800);

await page.evaluate(() => {
  const canvas = window.__phaserGame.canvas;
  window.__mouse = (type, x, y) => {
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, button: 0, buttons: type === 'mousedown' ? 1 : 0,
      clientX: r.left + (x / 390) * r.width, clientY: r.top + (y / 844) * r.height,
    }));
  };
  window.__snap = () => {
    const g = window.__phaserGame;
    const menu = g.scene.getScene('MenuScene');
    return {
      active: g.scene.getScenes(true).map((s) => s.scene.key),
      menuMode: menu?.mode,
      menuModal: menu?.modalObjects?.length ?? 0,
      run: Boolean(g.scene.getScenes(true).find((s) => s.state && Array.isArray(s.state.lands))),
    };
  };
});

/** A run with its system sheet open; returns the "Exit without saving" item's box. */
async function stageSheet() {
  await page.evaluate(() => {
    const g = window.__phaserGame;
    for (const key of ['ConquestUIScene', 'ConquestScene', 'MapScene', 'UIScene']) g.scene.stop(key);
    if (!g.scene.isActive('MenuScene')) g.scene.start('MenuScene');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await page.waitForTimeout(900);
  return page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const state = ui.state;
    for (let i = 0; i < 8 && state.pendingAscentPrompt; i += 1) {
      const p = state.pendingAscentPrompt;
      resolveAscentPrompt(state, p.options?.[0]?.id ?? p.options?.[0] ?? 'ok');
    }
    state.pendingAscentPrompt = undefined;
    if (state.ascent) state.ascent.promptQueue = [];
    ui.closeOverlay();
    await wait(250);
    ui.showSystemMenu();
    await wait(300);
    const buttons = ui.modalLayer.list.filter((o) => o.type === 'Container' && o.list?.some((c) => c.input));
    const b = buttons[4].getBounds();
    return { x: b.x + b.width / 2, y0: b.y, y1: b.y + b.height };
  });
}

const frontPageClean = (s) => s.active.length === 1 && s.active[0] === 'MenuScene' && s.menuMode === 'main' && s.menuModal === 0 && !s.run;

console.log(`=== verify-press-echo — ${URL} ===`);
const shapes = [
  ['touch tap, compat mouse pair 30 ms later', async (x, y) => {
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(30);
    await page.evaluate(([x, y]) => { window.__mouse('mousedown', x, y); window.__mouse('mouseup', x, y); }, [x, y]);
  }],
  ['touch tap, ghost click 250 ms later', async (x, y) => {
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(250);
    await page.evaluate(([x, y]) => { window.__mouse('mousedown', x, y); window.__mouse('mouseup', x, y); }, [x, y]);
  }],
  ['mousedown twice 5 ms apart, mouseup twice', async (x, y) => {
    await page.evaluate(([x, y]) => window.__mouse('mousedown', x, y), [x, y]);
    await page.waitForTimeout(5);
    await page.evaluate(([x, y]) => { window.__mouse('mousedown', x, y); window.__mouse('mouseup', x, y); window.__mouse('mouseup', x, y); }, [x, y]);
  }],
];

for (const [name, act] of shapes) {
  const p = await stageSheet();
  const y = p.y1 - 10;
  await act(p.x, y);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.__snap());
  check(`${name}: the run exits and the front page is untouched`, frontPageClean(after), JSON.stringify(after));
}

// An honest single press still exits (the guard must not eat the press it protects).
{
  const p = await stageSheet();
  await page.touchscreen.tap(p.x, p.y1 - 10);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.__snap());
  check('a single touch on Exit still exits to the front page', frontPageClean(after), JSON.stringify(after));
}

// A deliberate second tap elsewhere, 200 ms after Exit, still works: Classic Modes opens.
{
  const p = await stageSheet();
  await page.touchscreen.tap(p.x, p.y1 - 10);
  await page.waitForTimeout(200);
  const classic = await page.evaluate(() => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    const button = menu.children.list.find((o) => o.getData?.('menuSecondary') === 'classic');
    if (!button) return null;
    const box = button.getData('visualBounds');
    return { x: button.x + box.width / 2, y: button.y + box.height / 2 };
  });
  check('the front page is up 200 ms after Exit', classic !== null);
  if (classic) {
    await page.touchscreen.tap(classic.x, classic.y);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => window.__snap());
    check('a deliberate second tap on Classic Modes 200 ms later still opens it', after.menuMode === 'classic', JSON.stringify(after));
  }
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: an echoed press never presses the page it revealed, and honest taps still land'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
