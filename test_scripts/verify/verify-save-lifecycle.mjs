import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/save-lifecycle';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
const check = (ok, label) => { assert(ok, label); checks.push(label); console.log('PASS', label); };
const ready = scene => page.waitForFunction(scene => window.__phaserGame?.scene.isActive(scene)
  && !document.querySelector('[data-page-loading]'), scene, { timeout: 60000 });
const slots = () => page.evaluate(() => {
  const s = window.__save;
  return { manual: localStorage.getItem(s.SAVE_SNAPSHOT_KEY), auto: localStorage.getItem(s.AUTOSAVE_SNAPSHOT_KEY) };
});
async function clickText(scene, label) {
  const point = await page.evaluate(([key, label]) => {
    const s = window.__phaserGame.scene.getScene(key);
    const walk = list => {
      for (const o of list ?? []) {
        if ((label === 'Continue' && o.getData('menuLink') === 'continue')
          || (o.list?.some(c => c.type === 'Text' && c.text === label) && o.list.some(c => c.input?.enabled))) return o;
        const child = walk(o.list); if (child) return child;
      }
    };
    const button = walk(s.children.list);
    if (!button) throw new Error(`Missing button: ${label}`);
    const hit = button.list.find(o => o.input?.enabled);
    const world = button.getWorldTransformMatrix().transformPoint(hit.x, hit.y);
    const origin = s.cameras.main.getWorldPoint(0, 0), unit = s.cameras.main.getWorldPoint(1, 1);
    const canvas = s.game.canvas.getBoundingClientRect();
    return { x: canvas.x + (world.x - origin.x) / (unit.x - origin.x) / s.scale.width * canvas.width,
      y: canvas.y + (world.y - origin.y) / (unit.y - origin.y) / s.scale.height * canvas.height };
  }, [scene, label]);
  await page.mouse.click(point.x, point.y);
}

try {
  await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));
  await page.goto(`${BASE}/?capture=1&noladder=1&layout=desktop`);
  await ready('MenuScene');
  const contract = await page.evaluate(async () => {
    const s = window.__save = await import('/src/state/save.ts');
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { installAwayPause } = await import('/src/game/awayPause.ts');
    const base = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const results = [];
    const assert = (ok, label) => { if (!ok) throw new Error(label); results.push(label); };
    const raw = key => localStorage.getItem(key);
    const reset = () => { localStorage.removeItem(s.SAVE_SNAPSHOT_KEY); s.clearAutosave(); };
    const seed = state => { s.saveSnapshot(state); s.autosaveSnapshot(state); };
    reset();
    let state = structuredClone(base);
    s.autosaveSnapshot(state);
    assert(Boolean(s.saveSnapshot(state)) && !raw(s.AUTOSAVE_SNAPSHOT_KEY) && raw(s.SAVE_SNAPSHOT_KEY), 'manual save consumes recovery');
    s.autosaveSnapshot(state);
    const recovery = raw(s.AUTOSAVE_SNAPSHOT_KEY);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === s.SAVE_SNAPSHOT_KEY) throw new Error('quota'); return setItem.call(this, key, value); };
    try { assert(!s.saveSnapshot(state) && raw(s.AUTOSAVE_SNAPSHOT_KEY) === recovery, 'failed manual save retains recovery'); }
    finally { Storage.prototype.setItem = setItem; }
    const manual = raw(s.SAVE_SNAPSHOT_KEY);
    assert(Boolean(s.loadSnapshot()) && raw(s.AUTOSAVE_SNAPSHOT_KEY) === recovery, 'menu preview does not consume recovery');
    s.resumeSaveSession(state);
    assert(!raw(s.AUTOSAVE_SNAPSHOT_KEY) && raw(s.SAVE_SNAPSHOT_KEY) === manual, 'successful resume consumes only recovery');
    s.autosaveSnapshot(state); s.endSaveSession(state);
    assert(!s.autosaveSnapshot(state) && !raw(s.AUTOSAVE_SNAPSHOT_KEY) && raw(s.SAVE_SNAPSHOT_KEY) === manual, 'deliberate exit rejects late autosave writes');
    for (const flag of ['victory', 'isDefeated']) {
      state = structuredClone(base); seed(state); state[flag] = true;
      s.clearFinishedRunSaves(state);
      assert(!raw(s.SAVE_SNAPSHOT_KEY) && !raw(s.AUTOSAVE_SNAPSHOT_KEY) && !s.autosaveSnapshot(state) && !s.saveSnapshot(state), `${flag} clears both saves and cannot be saved again`);
    }
    state = structuredClone(base); seed(state);
    const original = [raw(s.SAVE_SNAPSHOT_KEY), raw(s.AUTOSAVE_SNAPSHOT_KEY)].join('|');
    const arena = structuredClone(state); arena.ascent.arena = true;
    s.saveSnapshot(arena); s.autosaveSnapshot(arena); s.resumeSaveSession(arena); s.endSaveSession(arena);
    arena.isDefeated = true; s.clearFinishedRunSaves(arena);
    assert([raw(s.SAVE_SNAPSHOT_KEY), raw(s.AUTOSAVE_SNAPSHOT_KEY)].join('|') === original, 'Battle mode never writes or deletes campaign saves');
    reset(); state = structuredClone(base);
    const away = installAwayPause(state);
    window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('blur'));
    assert(away.saves === 1 && Boolean(raw(s.AUTOSAVE_SNAPSHOT_KEY)), 'one snapshot per interruption');
    window.dispatchEvent(new Event('focus'));
    assert(!raw(s.AUTOSAVE_SNAPSHOT_KEY) && !state.isAwayPause, 'foreground resume consumes snapshot');
    state.year += 1;
    window.dispatchEvent(new Event('blur'));
    assert(away.saves === 2 && JSON.parse(raw(s.AUTOSAVE_SNAPSHOT_KEY)).state.year === state.year, 'immediate second interruption saves fresh progress');
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    assert(Boolean(raw(s.AUTOSAVE_SNAPSHOT_KEY)), 'trailing unload events cannot consume recovery before reload');
    window.dispatchEvent(new Event('pageshow'));
    assert(!raw(s.AUTOSAVE_SNAPSHOT_KEY) && !state.isAwayPause, 'back-forward cache resume consumes recovery');
    window.dispatchEvent(new Event('blur'));
    s.endSaveSession(state); window.dispatchEvent(new Event('pagehide'));
    assert(!raw(s.AUTOSAVE_SNAPSHOT_KEY), 'late pagehide after exit cannot recreate recovery');
    away.dispose(); reset();
    // Old persisted Battle/terminal snapshots are never offered as a campaign resume.
    const stale = { version: 1, savedAt: new Date().toISOString(), state: arena };
    localStorage.setItem(s.AUTOSAVE_SNAPSHOT_KEY, JSON.stringify(stale));
    assert(!s.pendingAutosave() && !raw(s.AUTOSAVE_SNAPSHOT_KEY), 'old arena snapshot is discarded');
    return results;
  });
  contract.forEach(label => check(true, label));

  await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
  await ready('ConquestUIScene');
  await page.evaluate(() => {
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    window.__save.autosaveSnapshot(world.state);
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:save-snapshot');
  });
  check((await slots()).manual && !(await slots()).auto, 'live manual-save action clears automatic slot');
  await page.evaluate(() => {
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    window.__save.autosaveSnapshot(world.state);
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:exit-to-menu', false);
    window.dispatchEvent(new Event('pagehide'));
  });
  await ready('MenuScene');
  check((await slots()).manual && !(await slots()).auto, 'exit without saving preserves manual save and clears recovery despite pagehide');
  // Continue through the actual menu button, with a newer automatic snapshot.
  await page.evaluate(() => {
    const s = window.__save, snapshot = s.loadSnapshot();
    snapshot.savedAt = '2000-01-01T00:00:00.000Z';
    localStorage.setItem(s.SAVE_SNAPSHOT_KEY, JSON.stringify(snapshot));
    snapshot.state.year = 999;
    s.autosaveSnapshot(snapshot.state);
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    menu.copilot?.destroy(); menu.copilot = undefined; menu.closeModal(); menu.render();
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await clickText('MenuScene', 'Continue');
  await ready('ConquestUIScene');
  check(await page.evaluate(() => window.__mandateState.year === 999) && !(await slots()).auto, 'real Continue resumes newest snapshot and consumes it');
  const failedExit = await page.evaluate(() => {
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    window.__save.autosaveSnapshot(world.state);
    const before = localStorage.getItem(window.__save.AUTOSAVE_SNAPSHOT_KEY);
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === window.__save.SAVE_SNAPSHOT_KEY) throw new Error('quota');
      return set.call(this, key, value);
    };
    try { window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:exit-to-menu', true); }
    finally { Storage.prototype.setItem = set; }
    return world.scene.isActive() && before === localStorage.getItem(window.__save.AUTOSAVE_SNAPSHOT_KEY);
  });
  check(failedExit, 'failed Save and Exit keeps the live game and its recovery snapshot');
  await page.evaluate(() => {
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    window.__save.autosaveSnapshot(world.state);
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:exit-to-menu', true);
    window.dispatchEvent(new Event('blur'));
  });
  await ready('MenuScene');
  check(JSON.parse((await slots()).manual).state.year === 999 && !(await slots()).auto, 'save and exit writes current progress without recreating recovery');

  await page.evaluate(() => window.__startBenchGame(1440, 'ascent'));
  await ready('ConquestUIScene');
  const quitLabel = await page.evaluate(async () => {
    window.__shell = { kind: 'desktop', quit: () => {
      window.__quitCalls = (window.__quitCalls ?? 0) + 1;
      window.dispatchEvent(new Event('pagehide'));
    } };
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    window.__save.autosaveSnapshot(world.state);
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.closeOverlay(); ui.showSystemMenu();
    return (await import('/src/i18n/index.ts')).t('ascent.sys.quit');
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await clickText('ConquestUIScene', quitLabel);
  await page.waitForFunction(() => window.__quitCalls === 1);
  check((await slots()).manual && !(await slots()).auto, 'native Quit saves manually and blocks the shell pagehide snapshot');
  await page.evaluate(() => {
    delete window.__shell;
    window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:exit-to-menu', false);
  });
  await ready('MenuScene');

  await page.evaluate(() => window.__startBenchGame(1441, 'ascent'));
  await ready('ConquestUIScene');
  await page.evaluate(async () => {
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    window.__save.autosaveSnapshot(world.state);
    (await import('/src/systems/ascent/AscentResolver.ts')).endAscentRun(world.state);
    world.refresh();
  });
  await page.waitForFunction(() => !localStorage.getItem(window.__save.SAVE_SNAPSHOT_KEY) && !localStorage.getItem(window.__save.AUTOSAVE_SNAPSHOT_KEY));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  check(!(await slots()).manual && !(await slots()).auto, 'live defeat clears both saves immediately and stays cleared');
  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('ui:exit-to-menu', false));
  await ready('MenuScene');

  await page.evaluate(() => window.__startBenchGame(1, 'arena'));
  await ready('BattleArenaScene');
  await page.evaluate(() => window.__phaserGame.scene.getScene('BattleArenaScene').startFight());
  await ready('ConquestUIScene');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  check(!(await slots()).auto && !(await slots()).manual, 'actual direct Battle fight never snapshots on background');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.screenshot({ path: `${OUT}/battle-no-snapshot.png` });
  check(errors.length === 0, 'no browser errors');
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
