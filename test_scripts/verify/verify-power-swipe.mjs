// Real touch input through the conquest draft, including slow and canceled gestures.
// Run against Vite: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-power-swipe.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const out = 'output/power-swipe';
mkdirSync(out, { recursive: true });

async function prepareDraft({ language = 'en', held = false } = {}) {
  const { setLanguage } = await import('/src/i18n/index.ts');
  const { CardFan } = await import('/src/ui/ascent/CardFan.ts');
  const { rollPowerDraftCards } = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { POWER_CARDS } = await import('/src/data/ascentCards.ts');
  setLanguage(language);
  if (!window.__swipeInstrumented) {
    const raise = CardFan.prototype.raise;
    CardFan.prototype.raise = function (...args) {
      window.__swipeFan = this;
      return raise.apply(this, args);
    };
    window.__swipeInstrumented = true;
  }
  const state = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  state.isStrategyPause = true;
  state.ascent.promptQueue = [];
  state.ascent.cardStacks = {};
  state.ascent.pendingLevelUps = 1;
  const cards = rollPowerDraftCards(state);
  if (held) cards[0] = POWER_CARDS.find(card => card.maxStacks > 1 && !cards.slice(1).includes(card.id)).id;
  if (held) state.ascent.cardStacks[cards[0]] = 1;
  state.pendingAscentPrompt = { kind: 'power-draft', level: 2, cards, rerollCost: 40 };
  state.ascent.rerollCost = 40;
  state.resources.gold = 1000;
  ui.openPromptKey = '';
  ui.refresh();
  window.__swipeCards = cards;
}

// A local fixture also lets the installed skill client capture the real draft.
const fixture = readFileSync('index.html', 'utf8').replace('</body>', `<script type="module">
const waitFor = async (fn) => { while (!fn()) await new Promise(r => setTimeout(r, 100)); };
await waitFor(() => window.__phaserGame?.scene.isActive('MenuScene'));
window.__startBenchGame(1337, 'ascent');
await waitFor(() => window.__phaserGame.scene.isActive('ConquestUIScene'));
await new Promise(r => setTimeout(r, 700));
await (${prepareDraft.toString()})({language:'en'});
</script></body>`);
writeFileSync(`${out}/fixture.html`, fixture);
writeFileSync(`${out}/actions.json`, JSON.stringify({ steps: [{ buttons: [], frames: 120 }] }));

const browser = await chromium.launch();
const checks = [];
const errors = [];
const warnings = [];
const layouts = JSON.parse(process.env.SWIPE_LAYOUTS ?? '[[390,844,"en"],[320,568,"vi"],[1280,800,"en"]]');
try {
  for (const [width, height, language] of layouts) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 2 });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      // CDP touchCancel is non-cancelable; Phaser's TouchManager still calls preventDefault.
      // Keep this known browser diagnostic in the report, separate from application errors.
      if (m.text().startsWith('Ignored attempt to cancel a touchcancel event with cancelable=false')) warnings.push(m.text());
      else errors.push(m.text());
    });
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`${url}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 60000 });
    await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'));
    await page.waitForTimeout(700);

    async function reset(held = false) {
      await page.evaluate(prepareDraft, { language, held });
      await page.waitForFunction(() => window.__swipeFan?.view.active && !window.__swipeFan.dealing);
      await page.waitForTimeout(250);
    }
    async function point(index, button = false) {
      return page.evaluate(({ index, button }) => {
        const fan = window.__swipeFan;
        fan.raise(index, true);
        const bounds = (button ? fan.takeButton : fan.slots[index].container.list.find(o => o.type === 'Zone')).getBounds();
        const camera = fan.scene.cameras.main;
        const game = window.__phaserGame;
        const rect = game.canvas.getBoundingClientRect();
        const scaleX = rect.width / game.scale.gameSize.width;
        const scaleY = rect.height / game.scale.gameSize.height;
        return {
          x: rect.left + (camera.x + (bounds.centerX - camera.scrollX) * camera.zoom) * scaleX,
          y: rect.top + (camera.y + (bounds.centerY - camera.scrollY) * camera.zoom) * scaleY,
          unit: camera.zoom * scaleY,
        };
      }, { index, button });
    }
    async function swipe({ dx = 0, dy = -145, hold = 0, cancel = false, index = 0, toButton = false } = {}) {
      const p = await point(index);
      if (toButton) {
        const button = await point(index, true);
        dx = (button.x - p.x) / p.unit;
        dy = (button.y - p.y) / p.unit;
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
      if (hold) await page.waitForTimeout(hold);
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + dx * p.unit * step / 8, y: p.y + dy * p.unit * step / 8, id: 1 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(800);
    }
    async function verify(label, selected, index = 0, stack = 1) {
      const result = await page.evaluate(({ index }) => ({
        prompt: window.__mandateState.pendingAscentPrompt?.kind,
        stack: window.__mandateState.ascent.cardStacks[window.__swipeCards[index]] ?? 0,
      }), { index });
      assert.equal(result.stack, selected ? stack : 0, `${width} ${label}: ${JSON.stringify(result)}`);
      assert.equal(result.prompt === 'power-draft', !selected, `${width} ${label}: prompt`);
      checks.push(`${width} ${language}: ${label}`);
      console.log(`PASS ${checks.at(-1)}`);
    }

    await reset();
    const hint = await page.evaluate(() => window.__swipeFan.scene.modalLayer.list.find(o => o.type === 'Text' && o.text.includes('↑'))?.text);
    assert.ok(hint?.includes(language === 'en' ? 'Swipe up to select' : 'Vuốt lên để chọn'));
    await page.screenshot({ path: `${out}/${width}-${language}.png` });
    await swipe();
    await verify('upward touch swipe selects the starting card once', true);

    await reset();
    await swipe({ hold: 1500, index: 1 });
    await verify('hold then slow swipe selects', true, 1);

    await reset();
    await swipe({ toButton: true });
    await verify('swipe ending over take button selects once', true);

    for (const [label, gesture] of [
      ['short swipe stays open', { dy: -20 }],
      ['downward swipe stays open', { dy: 38 }],
      ['sideways browse stays open', { dx: 65, dy: -45 }],
      ['canceled swipe stays open', { cancel: true }],
      ['canceled swipe over take button stays open', { cancel: true, toButton: true }],
    ]) {
      await reset();
      await swipe(gesture);
      await verify(label, false);
    }

    await reset();
    let p = await point(0);
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(450);
    await verify('single tap only previews', false);
    await page.mouse.dblclick(p.x, p.y, { delay: 100 });
    await page.waitForTimeout(800);
    await verify('double-tap still selects', true);

    await reset();
    p = await point(1, true);
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(800);
    await verify('take button still selects', true, 1);

    await reset(true);
    await swipe();
    await verify('held card swipe adds exactly one stack after merge', true, 0, 2);
    writeFileSync(`${out}/${width}-state.json`, await page.evaluate(() => window.render_game_to_text()));
    await page.close();
  }
  writeFileSync(`${out}/report.json`, JSON.stringify({ checks, errors, warnings }, null, 2));
  assert.deepEqual(errors, [], 'unexpected browser errors');
  console.log(`PASS ${checks.length} interaction checks; no unexpected browser errors; ${warnings.length} recorded touch-cancel diagnostics`);
} finally {
  await browser.close();
}
