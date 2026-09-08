// Explicit guide launches must work after every tutorial was seen and stay scoped to one visit.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/guide-copilots';
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, passed, detail) => {
  checks.push({ label, passed, detail });
  assert.ok(passed, `${label}: ${JSON.stringify(detail)}`);
  console.log(`PASS ${label}`);
};

async function openPage(viewport, query = '') {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('mandate:language:v1', 'en');
    for (const key of ['mandate:tour:v1', 'mandate:tour:run:v1', 'mandate:tour:classic:v1']) {
      localStorage.setItem(key, 'seen');
    }
  });
  await page.goto(`${BASE}/?capture=1${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  return page;
}

async function guide(page) {
  await page.evaluate(() => {
    const game = window.__phaserGame;
    for (const key of ['ConquestUIScene', 'ConquestScene', 'BattleArenaScene', 'MenuScene']) game.scene.stop(key);
    game.scene.start('GuideScene');
  });
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('GuideScene'));
}

async function launch(page, kind, destination) {
  await guide(page);
  await page.waitForTimeout(180);
  const point = await page.evaluate(selected => {
    const scene = window.__phaserGame.scene.getScene('GuideScene');
    const walk = list => {
      for (const child of list ?? []) {
        if (child.getData?.('guideCopilot') === selected) return child;
        const found = child.list && walk(child.list);
        if (found) return found;
      }
    };
    const bounds = walk(scene.children.list)?.getBounds();
    if (!bounds) return null;
    const camera = scene.cameras.main;
    const origin = camera.getWorldPoint(0, 0);
    const unit = camera.getWorldPoint(1, 1);
    const canvas = scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (bounds.centerX - origin.x) / (unit.x - origin.x) * rect.width / scene.scale.width,
      y: rect.top + (bounds.centerY - origin.y) / (unit.y - origin.y) * rect.height / scene.scale.height };
  }, kind);
  assert.ok(point, `guide ${kind} launcher exists`);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(key => window.__phaserGame.scene.isActive(key), destination,
    { timeout: 10000 }).catch(async error => {
    console.log({ kind, destination, point, details: await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('GuideScene');
      const camera = scene.cameras.main;
      return { scenes: window.__phaserGame.scene.getScenes(true).map(s => s.scene.key),
        scrollX: camera?.scrollX, zoom: camera?.zoom, cameraX: camera?.x,
        canvas: scene.game.canvas.getBoundingClientRect().toJSON() };
    }) });
    await page.screenshot({ path: `${OUT}/${kind}-launch-failed.png` });
    throw error;
  });
}

async function storedFlags(page) {
  return page.evaluate(() => ['mandate:tour:v1', 'mandate:tour:run:v1', 'mandate:tour:classic:v1']
    .map(key => localStorage.getItem(key)));
}

async function clickText(page, sceneKey, text) {
  const point = await page.evaluate(([key, label]) => {
    const scene = window.__phaserGame.scene.getScene(key);
    const walk = list => {
      for (const child of list ?? []) {
        if (child.type === 'Text' && child.text === label) return child;
        const found = child.list && walk(child.list);
        if (found) return found;
      }
    };
    const target = walk(scene.children.list);
    if (!target) return null;
    const world = target.getWorldTransformMatrix();
    const camera = scene.cameras.main;
    const origin = camera.getWorldPoint(0, 0);
    const unit = camera.getWorldPoint(1, 1);
    const canvas = scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (world.tx - origin.x) / (unit.x - origin.x) * rect.width / scene.scale.width,
      y: rect.top + (world.ty - origin.y) / (unit.y - origin.y) * rect.height / scene.scale.height };
  }, [sceneKey, text]);
  assert.ok(point, `${text} button exists`);
  await page.mouse.click(point.x, point.y);
}

try {
  if (!process.env.GUIDE_DESKTOP_ONLY) {
  const page = await openPage({ width: 390, height: 844 });
  for (const kind of ['menu', 'classic', 'menu', 'classic']) {
    await launch(page, kind, 'MenuScene');
    await page.waitForFunction(() => Boolean(window.__phaserGame.scene.getScene('MenuScene').copilot));
    const details = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      return { mode: scene.mode, touring: scene.copilotFor, replayPending: scene.replayCopilot };
    });
    const expected = kind === 'menu' ? 'main' : 'classic';
    check(`${kind} replay opens its own copilot`, details.mode === expected && details.touring === expected, details);
    check(`${kind} replay consumes its visit override`, details.replayPending === false, details);
    check(`${kind} replay preserves seen preferences`, (await storedFlags(page)).every(flag => flag === 'seen'));
    await page.screenshot({ path: `${OUT}/${kind}.png` });
  }

  await launch(page, 'battle', 'BattleArenaScene');
  const setup = await page.evaluate(async () => {
    const { takeGuidedRun } = await import('/src/state/tour.ts');
    return { selected: window.__phaserGame.scene.getScene('BattleArenaScene').guidedCopilot,
      runPending: takeGuidedRun() };
  });
  check('battle setup holds its own request without arming a run', setup.selected && !setup.runPending, setup);
  await page.screenshot({ path: `${OUT}/battle-setup.png` });
  await page.evaluate(() => window.__phaserGame.scene.getScene('BattleArenaScene').scene.start('MenuScene', { mode: 'main' }));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MenuScene'));
  const canceled = await page.evaluate(async () => {
    const { takeGuidedRun } = await import('/src/state/tour.ts');
    return takeGuidedRun();
  });
  check('leaving battle setup cannot coach the next unrelated run', !canceled);

  await launch(page, 'battle', 'BattleArenaScene');
  await page.waitForTimeout(250);
  await clickText(page, 'BattleArenaScene', 'Take command');
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene')
    && window.__phaserGame.scene.getScene('ConquestUIScene').runTour, null, { timeout: 20000 });
  const battle = await page.evaluate(async () => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const { takeGuidedRun } = await import('/src/state/tour.ts');
    return { arena: scene.state.ascent.arena, guided: scene.guidedRun,
      stages: [...scene.tourStagesShown], steps: scene.runTour.opts.steps.map(step => step.id),
      pending: takeGuidedRun(), setupPending: window.__phaserGame.scene.getScene('BattleArenaScene').guidedCopilot };
  });
  check('Take command reaches a real guided battle', battle.arena && battle.guided, battle);
  check('battle copilot teaches battle controls only', battle.stages.join() === 'fight'
    && battle.steps.length >= 6 && battle.steps.every(step => step.startsWith('fight-')), battle);
  check('battle request is consumed at both handoffs', !battle.pending && !battle.setupPending, battle);
  check('battle launch preserves all seen preferences', (await storedFlags(page)).every(flag => flag === 'seen'));
  await page.screenshot({ path: `${OUT}/battle-copilot.png` });
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.runTour.close();
    scene.maybeRunTour(false);
  });
  check('closing battle copilot does not launch Conquest lessons', await page.evaluate(() =>
    !window.__phaserGame.scene.getScene('ConquestUIScene').runTour));

  for (let visit = 1; visit <= 2; visit += 1) {
    await launch(page, 'conquest', 'ConquestUIScene');
    // The optional dynasty customizer precedes the coached gameplay decisions.
    if (await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
      .state.pendingAscentPrompt?.kind === 'coronation')) {
      await page.waitForTimeout(180);
      await clickText(page, 'ConquestUIScene', 'Let the chroniclers decide');
    }
    await page.waitForFunction(() => window.__phaserGame.scene.getScene('ConquestUIScene')
      .state.pendingAscentPrompt?.kind !== 'coronation');
    if (await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
      .state.pendingAscentPrompt?.kind === 'inheritance')) {
      await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').choose('ok'));
    }
    await page.waitForFunction(() => Boolean(window.__phaserGame.scene.getScene('ConquestUIScene').runTour), null,
      { timeout: 5000 }).catch(async error => {
      console.log(await page.evaluate(() => {
        const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
        return { active: scene.scene.isActive(), guided: scene.guidedRun, tourActive: scene.tourActive,
          prompt: scene.openPromptKey, statePrompt: scene.state.pendingAscentPrompt,
          shown: [...scene.tourStagesShown], modalLength: scene.modalLayer.length };
      }));
      await page.screenshot({ path: `${OUT}/conquest-failed.png` });
      throw error;
    });
    const conquest = await page.evaluate(async () => {
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      const { takeGuidedRun } = await import('/src/state/tour.ts');
      return { guided: scene.guidedRun, stages: [...scene.tourStagesShown], arena: scene.state.ascent.arena,
        pending: takeGuidedRun() };
    });
    check(`Conquest visit ${visit} starts its opening copilot again`, conquest.guided && !conquest.arena
      && conquest.stages.length > 0 && !conquest.stages.includes('fight'), conquest);
    check(`Conquest visit ${visit} consumes its override`, !conquest.pending, conquest);
  }
  await page.screenshot({ path: `${OUT}/conquest-copilot.png` });
  }

  const desktop = await openPage({ width: 1440, height: 900 }, '&layout=desktop');
  await launch(desktop, 'conquest', 'ConquestUIScene');
  const hardcore = await desktop.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').state.ascent.hardcore);
  check('guided Conquest retains desktop hands-on default', hardcore === true, hardcore);
  check('no browser runtime errors', errors.length === 0, errors);
} finally {
  await writeFile(`${OUT}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
