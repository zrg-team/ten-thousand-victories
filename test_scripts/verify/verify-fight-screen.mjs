/**
 * Two reports about the fight screen, both about what it fails to say.
 *
 * *Fight screen should highlight this is capital.* The title read the same for a border district
 * and for the province whose fall ends the run, so the seat now carries a cinnabar stamp above its
 * own name. Checked at the capital and away from it, in both languages, and measured against the
 * round track it must never print through.
 *
 * *Fight screen reinforcement look really bad.* The worst of it was not taste: `showBattle` hides
 * the map because the field is a full sheet of parchment, and the relief page is opened from the
 * fight through `replaceLanePage` — so it drew an ordinary lane list over a hidden world and what
 * showed through the lane's 0.93 dim was the **main menu**. `showWarBoard` carries the same
 * restore; this page was missed. The rest is grouping: a host that can march, one already
 * marching, and one that cannot come are three different answers and now read as three.
 *
 *   DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-fight-screen.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();

/** Stages a fight on one province and returns the page, ready with the field open. */
const openFight = async (lang, where) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    // The battle screen builds a second map-item renderer; the atlas has complained about its own
    // texture keys since long before this check. Reproduced with no battle open at all.
    if (message.type() === 'error' && !/Texture key already in use: conquest-atlas:/.test(message.text())) {
      errors.push(message.text());
    }
  });
  await page.addInitScript((code) => localStorage.setItem('mandate:language:v1', code), lang);
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
    && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 60000 });
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await page.evaluate(() => window.__splashDone?.());
  await page.waitForTimeout(1200);

  const staged = await page.evaluate(async (site) => {
    const { beginBattle } = await import('/src/systems/ascent/BattleSystem.ts');
    const map = window.__phaserGame.scene.getScene('ConquestScene');
    const state = map.state;
    state.pendingAscentPrompt = undefined;
    state.isPaused = false;
    state.isStrategyPause = false;

    const capital = state.lands.find((one) => one.id === state.ascent.capitalLandId);
    const ours = state.armies.find((army) => army.kingdomId === 'dai-viet' && !army.isLevy);
    // A second province of ours, so "away from the seat" is a real place and so the relief page
    // has a host to offer.
    const neighbour = capital.neighbors
      .map((id) => state.lands.find((one) => one.id === id)).filter(Boolean)[0];
    neighbour.ownerId = 'dai-viet';
    neighbour.isVisible = true;
    const land = site === 'capital' ? capital : neighbour;

    ours.landId = land.id;
    // An idle host next door: the row the page must offer as "can march now".
    const spare = JSON.parse(JSON.stringify(ours));
    spare.id = 'spare-host';
    spare.name = 'Probe host';
    spare.landId = site === 'capital' ? neighbour.id : capital.id;
    spare.generalHeroId = undefined;
    spare.orders = undefined;
    state.armies.push(spare);
    state.movementOrders = state.movementOrders.filter((order) => order.armyId !== spare.id);

    const rival = state.kingdoms.find((kingdom) => kingdom.id !== 'dai-viet');
    const invader = JSON.parse(JSON.stringify(ours));
    invader.id = 'probe-invader';
    invader.kingdomId = rival.id;
    invader.landId = land.id;
    state.armies.push(invader);
    state.ascent.activeBattle = undefined;
    state.pendingBattle = {
      invaderArmyId: invader.id, landId: land.id, landName: land.name,
      kingdomId: rival.id, kingdomName: rival.name ?? 'Lab', isGreat: false,
      attackerPower: 0, defenderPower: 0,
    };
    const opened = beginBattle(state);
    return { opened, landId: land.id, isCapital: land.id === state.ascent.capitalLandId };
  }, where);

  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').openLane('battle'));
  await page.waitForTimeout(1200);
  // The staged fight would end the run if it were left to run while the shots are taken.
  await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.state.isStrategyPause = true;
    ui.state.isPaused = true;
  });
  return { page, staged, errors };
};

/** The stamp's box and the round track's, both in sheet units. */
const markBox = (page) => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const found = [];
  const walk = (object) => {
    if (object.getData?.('capitalMark')) found.push(object);
    if (Array.isArray(object.list)) object.list.forEach(walk);
  };
  walk(ui.modalLayer);
  const mark = found[0];
  if (!mark) return null;
  const matrix = mark.getWorldTransformMatrix();
  return {
    left: matrix.tx,
    right: matrix.tx + mark.displayWidth,
    pipsLeft: ui.battleUi ? ui.battleUi.content.x + ui.battleUi.content.width - 132 : null,
  };
});

// ── 1 · the seat says so, and only the seat ─────────────────────────────────────────────────
for (const lang of ['vi', 'en']) {
  const { page, staged, errors } = await openFight(lang, 'capital');
  check(`[${lang}] a fight can be staged at the capital`, staged.opened && staged.isCapital, JSON.stringify(staged));
  const box = await markBox(page);
  check(`[${lang}] the capital's fight carries the stamp`, Boolean(box), box ? '' : 'no mark drawn');
  // The round track sits at the band's right end; the stamp shrinks to fit rather than printing
  // through it, and `Text.width` does not count letter spacing — which is how it did, once.
  if (box) {
    check(`[${lang}] and the stamp stays clear of the round track`,
      box.right <= box.pipsLeft - 2, `mark ends ${box.right.toFixed(0)}, track starts ${box.pipsLeft?.toFixed(0)}`);
  }
  check(`[${lang}] no console errors on the field`, errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');
  await page.close();
}

{
  const { page, staged } = await openFight('vi', 'border');
  check('a fight away from the seat carries no stamp',
    staged.opened && !staged.isCapital && (await markBox(page)) === null, JSON.stringify(staged));
  await page.close();
}

// ── 2 · the relief page ─────────────────────────────────────────────────────────────────────
{
  const { page, staged, errors } = await openFight('vi', 'capital');
  check('a fight is open to ask relief from', staged.opened);

  const onField = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestScene').scene.isVisible());
  check('the field itself hides the map, as it always has', onField === false, `map visible ${onField}`);

  const page2 = await page.evaluate(async () => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const { showReinforcePicker } = await import('/src/scenes/conquest/battle/dock.ts');
    showReinforcePicker(ui, () => ui.replaceLanePage(() => ui.showBattle()));
    await new Promise((done) => setTimeout(done, 600));
    const texts = [];
    const walk = (object) => {
      if (object.type === 'Text' && object.text?.trim()) texts.push(object.text.trim());
      if (Array.isArray(object.list)) object.list.forEach(walk);
    };
    walk(ui.modalLayer);
    return {
      mapVisible: window.__phaserGame.scene.getScene('ConquestScene').scene.isVisible(),
      menuVisible: window.__phaserGame.scene.getScene('MenuScene').scene.isVisible(),
      texts,
    };
  });
  /**
   * The whole of the "looks really bad": with the map hidden, the lane's 0.93 dim showed the
   * scenes this game keeps resident behind everything, and the lower half of this page was the
   * title screen.
   */
  check('the relief page puts the world back behind it', page2.mapVisible === true, `map visible ${page2.mapVisible}`);
  // The grouping: the page must name what can march before it names what cannot.
  const ready = page2.texts.some((line) => line.toLocaleUpperCase().includes('ĐIỀU ĐƯỢC NGAY'));
  check('and groups the hosts by what can be done about them', ready, page2.texts.slice(0, 6).join(' / '));
  // The figure the decision turns on is a badge, not a run of prose in the title.
  const badge = page2.texts.some((line) => line.toLocaleUpperCase() === 'QUÂN');
  check('with each host\'s strength set as a figure to compare', badge, page2.texts.slice(0, 10).join(' / '));

  // And the row actually sends.
  const sent = await page.evaluate(async () => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const { reinforcementCandidates, sendReinforcement } = await import('/src/systems/ascent/reinforcement.ts');
    const battle = ui.state.ascent.activeBattle;
    const row = reinforcementCandidates(ui.state, battle)
      .find((one) => !one.blockedReason && !one.enRoute);
    if (!row) return { offered: false };
    return { offered: true, ok: sendReinforcement(ui.state, battle, row.army.id) };
  });
  check('a host the page offers really can be sent', sent.offered && sent.ok, JSON.stringify(sent));
  check('no console errors on the relief page', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');
  await page.close();
}

await browser.close();
const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} fight-screen checks passed`);
process.exit(passed === checks.length ? 0 : 1);
