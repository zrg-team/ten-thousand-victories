/** Real game screenshots used by GuideScene. Run with the development server running. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolveOpening, startWorld } from '../test_scripts/perf/_boot.mjs';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'public/art/guide';
const EVIDENCE = 'output/help-captures';
mkdirSync(EVIDENCE, { recursive: true });
const browser = await chromium.launch();
const report = { source: BASE, seed: 20260908, viewport: { width: 390, height: 620 }, deviceScaleFactor: 2, captures: [], errors: [] };
const encoder = await browser.newPage();
// Focus each screenshot on the controls the adjacent guide entry explains.
// These are direct viewport crops; no UI is painted, moved, or composited.
const clips = {
  'conquest-map': { x: 0, y: 0, width: 390, height: 400 },
  'conquest-decision': { x: 0, y: 172, width: 390, height: 448 },
  'conquest-army': { x: 12, y: 64, width: 366, height: 425 },
  'conquest-build': { x: 12, y: 64, width: 366, height: 275 },
  'conquest-relations': { x: 12, y: 64, width: 366, height: 300 },
  'conquest-heroes': { x: 12, y: 64, width: 366, height: 210 },
  'conquest-court': { x: 12, y: 64, width: 366, height: 435 },
  'battle-overview': { x: 0, y: 50, width: 390, height: 344 },
  'battle-orders': { x: 10, y: 394, width: 370, height: 219 },
  'battle-result': { x: 18, y: 120, width: 354, height: 380 },
};

async function shot(page, locale, id, clip = clips[id]) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${EVIDENCE}/${locale}-${id}-full.png` });
  const png = await page.screenshot({ clip });
  const webp = await encoder.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return { data: canvas.toDataURL('image/webp', 0.90).split(',')[1], width: canvas.width, height: canvas.height };
  }, png.toString('base64'));
  const file = `${OUT}/${locale}/${id}.webp`;
  writeFileSync(file, Buffer.from(webp.data, 'base64'));
  const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  writeFileSync(`${EVIDENCE}/${locale}-${id}.json`, JSON.stringify(state, null, 2));
  report.captures.push({ locale, id, file, width: webp.width, height: webp.height, clip });
  console.log(`${file}: ${webp.width}x${webp.height}`);
}

try {
  for (const locale of (process.env.GUIDE_LOCALES ?? 'en,vi').split(',')) {
    mkdirSync(`${OUT}/${locale}`, { recursive: true });
    const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: report.deviceScaleFactor });
    page.on('pageerror', e => report.errors.push(`${locale}: ${e.message}`));
    page.on('console', e => { if (e.type() === 'error') report.errors.push(`${locale}: ${e.text()}`); });
    await page.addInitScript(language => {
      localStorage.setItem('mandate:language:v1', language);
      localStorage.setItem('mandate:graphics:v1', 'medium');
      localStorage.setItem('mandate:life:v1', JSON.stringify({ motion: 'reduced', birds: false, traffic: 'none', seasons: true }));
    }, locale);
    await page.goto(`${BASE}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 60000 });
    await startWorld(page, { mode: 'ascent', seed: report.seed });
    // A resident menu may clear the debug alias during the scene handoff; the world owns it.
    await page.evaluate(() => { window.__mandateState = window.__phaserGame.scene.getScene('ConquestScene').state; });
    await resolveOpening(page);
    await page.evaluate(() => {
      const state = window.__mandateState;
      state.isPaused = true;
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      window.__phaserGame.scene.getScene('ConquestScene').ascentAccumulator = -1e9;
      ui.closeOverlay(); ui.refresh();
    });
    if (!process.env.GUIDE_SYSTEMS_ONLY) {
      await shot(page, locale, 'conquest-map');
      await page.evaluate(() => {
        const state = window.__mandateState, ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        state.pendingAscentPrompt = { kind: 'power-draft', level: 3, cards: ['iron-levy', 'rice-tribute', 'mandarin-academy'], rerollCost: 40 };
        ui.events.emit('state-changed');
      });
      await shot(page, locale, 'conquest-decision');
      await page.evaluate(() => {
        const state = window.__mandateState, ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        state.pendingAscentPrompt = undefined; ui.closeOverlay(); ui.openLane('army');
      });
      await shot(page, locale, 'conquest-army');
    }

    for (const [id, lane] of [['conquest-build', 'build'], ['conquest-relations', 'affairs'], ['conquest-heroes', 'heroes'], ['conquest-court', 'court']]) {
      await page.evaluate(lane => {
        const state = window.__mandateState, ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        state.pendingAscentPrompt = undefined;
        ui.closeOverlay(); ui.openLane(lane);
      }, lane);
      await shot(page, locale, id);
    }
    if (process.env.GUIDE_SYSTEMS_ONLY) { await page.close(); continue; }

    await page.evaluate(() => window.__startBenchGame(20260908, 'arena'));
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('BattleArenaScene'));
    await page.evaluate(seed => {
      // Arena uses its real setup defaults; seed only the generated battlefield and names.
      const originalRandom = Math.random;
      let value = seed >>> 0;
      Math.random = () => {
        value |= 0; value = value + 0x6d2b79f5 | 0;
        let n = Math.imul(value ^ value >>> 15, 1 | value);
        n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
        return ((n ^ n >>> 14) >>> 0) / 4294967296;
      };
      try { window.__phaserGame.scene.getScene('BattleArenaScene').startFight(); }
      finally { Math.random = originalRandom; }
    }, report.seed);
    await page.waitForFunction(() => window.__phaserGame.scene.getScene('ConquestUIScene')?.openPromptKey === 'lane:battle');
    await page.evaluate(async () => {
      const game = window.__phaserGame, ui = game.scene.getScene('ConquestUIScene'), state = window.__mandateState;
      ui.battleOpeningTimer?.remove(); ui.battleOpeningTimer = undefined;
      ui.battleOpeningLeft = 0; ui.battleAwaitingOrder = false;
      game.scene.getScene('ConquestScene').ascentAccumulator = -1e9;
      state.isPaused = false; state.isStrategyPause = false;
      const B = await import('/src/systems/ascent/BattleSystem.ts');
      const battle = state.ascent.activeBattle;
      battle.steeredStance = true; battle.steeredFormation = true;
      for (let i = 0; i < 50 && battle.round < 3 && !battle.over; i++) {
        if (battle.moment) B.answerBattleMoment(state, 'steady');
        B.fightRound(state);
      }
      if (battle.moment) B.answerBattleMoment(state, 'steady');
      battle.beats = []; ui.battleUi.shown = undefined;
      ui.refresh(); ui.updateBattle();
    });
    await shot(page, locale, 'battle-overview');
    await shot(page, locale, 'battle-orders');
    await page.evaluate(async () => {
      const game = window.__phaserGame, state = window.__mandateState;
      const B = await import('/src/systems/ascent/BattleSystem.ts');
      let guard = 0;
      while (state.ascent.activeBattle && !state.ascent.activeBattle.over && guard++ < 500) {
        if (state.ascent.activeBattle.moment) B.answerBattleMoment(state, 'steady');
        B.fightRound(state);
      }
      if (state.ascent.activeBattle) B.finishBattle(state, 'hold');
      const history = state.ascent.battleHistory;
      const result = history[history.length - 1];
      if (!result) throw new Error('Real battle produced no record');
      game.scene.stop('ConquestUIScene'); game.scene.stop('ConquestScene');
      game.scene.start('BattleArenaScene', { result });
    });
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('BattleArenaScene'));
    await shot(page, locale, 'battle-result');
    await page.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${EVIDENCE}/manifest.json`, JSON.stringify(report, null, 2));
}
if (report.errors.length) throw new Error(report.errors.join('\n'));
