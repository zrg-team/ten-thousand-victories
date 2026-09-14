// The next-reign chip: does it promise exactly what the ceremony will pay, and does it behave on
// the glass?
//
// Two halves. The ledger is checked headless against the stores it reads — the XP it promises must
// be the score the Reckoning prints, the level it promises must be the level `addRunXp` would
// produce, the rubbing count must follow the in-run faucets. Then the rendered chip: present on a
// playable frame, hidden under a prompt, its tap guard published, the sheet opening and closing,
// the seal punching when a rubbing lands, and the paused badge standing clear of it. Both
// languages, both ends of the height clamp.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();

// ── The ledger, headless ────────────────────────────────────────────────────
console.log('=== LEDGER ===');
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { readInheritance, noteRubbing } = await import('/src/systems/ascent/Inheritance.ts');
    const { computeRunScore } = await import('/src/state/legacy.ts');
    const { getDynasty, levelForXp, resetDynastyCache } = await import('/src/state/dynasty.ts');
    const { resetCabinetCache } = await import('/src/state/cabinet.ts');
    const { findPowerCard } = await import('/src/data/ascentCards.ts');

    // A fresh account, then a house with a little history.
    localStorage.removeItem('mandate:dynasty:v1');
    localStorage.removeItem('mandate:cabinet:v1');
    localStorage.removeItem('mandate:legacy:v1');
    resetDynastyCache(); resetCabinetCache();

    let s = 1337 >>> 0;
    const original = Math.random;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = {};
    try {
      const state = createAscentGameState({ seed: 1337 });
      const ascent = state.ascent;
      const fresh = readInheritance(state);
      out.freshXp = fresh.xp; out.freshScore = computeRunScore(state);
      out.freshRubbings = fresh.rubbings; out.freshLevelsGained = fresh.levelsGained;
      out.freshRecordFirst = fresh.bestScore === 0;
      out.freshRankNow = fresh.rankNow; out.freshNextRank = fresh.nextRank;

      // A reign worth two levels.
      ascent.wavesSurvived = 24; ascent.peakPower = 40000; ascent.heroesSummoned = 3;
      const card = findPowerCard('iron-levy') ? 'iron-levy' : Object.keys(ascent.draftWeights)[0];
      ascent.cardStacks = { [card]: 2 };
      const rich = readInheritance(state);
      out.richScore = computeRunScore(state); out.richXp = rich.xp;
      out.richLevelAfter = rich.houseLevelAfter; out.expectLevelAfter = levelForXp(getDynasty().xp + rich.score);
      out.richPicks = rich.picksGained; out.richLegacy = rich.legacy; out.expectLegacy = Math.round(rich.score / 10);
      out.richWavesToRubbing = rich.wavesToRubbing;
      out.richBind = rich.bind; out.bindCard = card;
      out.heroPoints = rich.heroPoints;

      // The in-run faucet receipt.
      noteRubbing(state); noteRubbing(state, 2);
      out.afterNote = readInheritance(state).rubbings;
      out.noteField = ascent.rubbingsEarned;

      // A house with banked XP: the promised level rides on top of what it already has.
      localStorage.setItem('mandate:dynasty:v1', JSON.stringify({ xp: 5000, level: 2, traits: [], pendingPicks: 0, reigns: 2, bestScore: 4000, respecs: 0 }));
      localStorage.setItem('mandate:legacy:v1', JSON.stringify({ points: 100, bestScore: 4000, ascensions: 0, perks: [] }));
      resetDynastyCache();
      const seasoned = readInheritance(state);
      out.seasonedLevelNow = seasoned.houseLevelNow; out.seasonedLevelAfter = seasoned.houseLevelAfter;
      out.seasonedExpect = levelForXp(5000 + seasoned.score);
      out.seasonedBest = seasoned.bestScore; out.seasonedBeaten = seasoned.recordBeaten;
      out.seasonedDiff = seasoned.recordDiff; out.seasonedScore = seasoned.score;
      out.seasonedPerk = seasoned.nextPerk; out.seasonedTotal = seasoned.legacyTotalAfter;

      // A cabinet that already holds the bind card twice: keeping it makes a combine.
      localStorage.setItem('mandate:cabinet:v1', JSON.stringify({ cards: { [card]: { level: 1, copies: 2 } }, rubbings: 0, rubbingPity: 0, learnedRecipes: [], openingHand: [], deeds: [], packsBought: 0 }));
      resetCabinetCache();
      out.readyBind = readInheritance(state).bind;
    } finally {
      Math.random = original;
      localStorage.removeItem('mandate:dynasty:v1');
      localStorage.removeItem('mandate:cabinet:v1');
      localStorage.removeItem('mandate:legacy:v1');
      resetDynastyCache(); resetCabinetCache();
    }
    return out;
  });

  check('a fresh reign promises the run score as house XP', result.freshXp === result.freshScore, `${result.freshXp} vs ${result.freshScore}`);
  check('a fresh reign promises exactly the always-faucet rubbing', result.freshRubbings === 1, String(result.freshRubbings));
  check('a fresh reign gains no level yet', result.freshLevelsGained === 0);
  check('a first reign is told its score becomes the record', result.freshRecordFirst === true);
  check('the rank ladder names the rung above', Boolean(result.freshNextRank?.label) && result.freshNextRank.minScore > 0, JSON.stringify(result.freshNextRank));
  check('the promised XP is the Reckoning score', result.richXp === result.richScore, `${result.richXp} vs ${result.richScore}`);
  check('the promised level is levelForXp(banked + score)', result.richLevelAfter === result.expectLevelAfter && result.richLevelAfter >= 1, `${result.richLevelAfter} vs ${result.expectLevelAfter}`);
  check('trait picks follow the levels gained', result.richPicks === result.richLevelAfter, `${result.richPicks}`);
  check('Legacy is score / 10, as bankLegacy pays it', result.richLegacy === result.expectLegacy, `${result.richLegacy} vs ${result.expectLegacy}`);
  check('waves to the next rubbing counts down from the tenth', result.richWavesToRubbing === 6, String(result.richWavesToRubbing));
  check('the bind leads with the played card, NEW on an empty cabinet', result.richBind?.cardId === result.bindCard && result.richBind?.status === 'new', JSON.stringify(result.richBind));
  check('champions called are priced at 40 each', result.heroPoints === 120, String(result.heroPoints));
  check('noteRubbing adds to the receipt and the ledger', result.afterNote === 4 && result.noteField === 3, `${result.afterNote} / ${result.noteField}`);
  check('a house with banked XP climbs from where it stands', result.seasonedLevelNow === 2 && result.seasonedLevelAfter === result.seasonedExpect && result.seasonedLevelAfter > 2, `${result.seasonedLevelNow} → ${result.seasonedLevelAfter} (expect ${result.seasonedExpect})`);
  check('the record chase reads the vault\'s best', result.seasonedBest === 4000 && result.seasonedBeaten === (result.seasonedScore > 4000) && result.seasonedDiff === Math.abs(4000 - result.seasonedScore), `${result.seasonedScore} vs 4000, diff ${result.seasonedDiff}`);
  check('the next perk is priced against vault + this reign', result.seasonedPerk && result.seasonedTotal === 100 + Math.round(result.seasonedScore / 10) && result.seasonedPerk.short === Math.max(0, 110 - result.seasonedTotal), JSON.stringify(result.seasonedPerk));
  check('two copies held + the bind = a combine ready', result.readyBind?.status === 'ready' && result.readyBind.copies === 3, JSON.stringify(result.readyBind));
  check('no console errors (ledger)', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// ── The chip, rendered ──────────────────────────────────────────────────────
for (const [lang, h] of [['en', 844], ['vi', 620]]) {
  console.log(`=== CHIP ${lang} h=${h} ===`);
  const page = await browser.newPage({ viewport: { width: 390, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  const barUp = () => page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
    .children.list.some((c) => c.constructor?.name === 'ActionBar' && c.visible));
  // Under the opening cards the chip must be hidden.
  const hiddenUnderPrompt = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    return scene.openPromptKey !== '' && scene.inheritance.tapBounds().length === 0 && !scene.inheritance.visible();
  });
  check('hidden under the opening cards', hiddenUnderPrompt);
  for (let guard = 0; guard < 24 && !(await barUp()); guard += 1) {
    await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      if (!scene.openPromptKey) return;
      scene.events.emit('ui:ascent-choice', String(scene.openPromptKey).split(',').pop() || 'ok');
    });
    await page.waitForTimeout(500);
  }
  check('the run reaches a playable frame', await barUp());

  const probe = () => page.evaluate(({ height }) => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const chip = scene.inheritance;
    const bounds = chip.tapBounds()[0] ?? null;
    const root = scene.children.list.find((c) => c.type === 'Container' && c.depth === 432);
    const texts = (root?.list ?? []).filter((c) => c.type === 'Text' && c.visible).map((c) => c.text);
    // The riser is a slip: a container at 433 holding a plate and its text.
    const risers = scene.children.list.filter((c) => c.type === 'Container' && c.depth === 433)
      .map((c) => c.list.find((k) => k.type === 'Text')?.text ?? '');
    const badge = scene.pausedBadge ? scene.pausedBadge.list.find((c) => c.type === 'Text') : null;
    const badgeY = badge ? badge.y : null;
    return {
      visible: chip.visible(), bounds, texts, risers, badgeY,
      guarded: (window.__hudTapBounds ?? []).some((r) => bounds && r.x === bounds.x && r.y === bounds.y && r.width === bounds.width),
      barTop: height - 50,
    };
  }, { height: h });

  let seen = await probe();
  check('the chip stands on a playable frame', seen.visible && Boolean(seen.bounds), JSON.stringify(seen.bounds));
  check('it sits above the bar and clear of the map controls', seen.bounds && seen.bounds.y + seen.bounds.height <= seen.barTop - 8 && seen.bounds.x + seen.bounds.width < 318, JSON.stringify(seen.bounds));
  check('its rectangle is in the world scene\'s tap guard', seen.guarded);
  // Shut, the chip is one line and the banner — the caption belongs to the open card (see
  // `HEIGHT_COMPACT`: "the Dynasty section should be smaller by default").
  check('a headline is printed on the shut chip', seen.texts.length >= 1 && seen.texts.every((t) => t.length > 0), seen.texts.join(' | '));
  check('the headline is one line', seen.texts.every((t) => !t.includes('\n')), seen.texts.join(' | '));

  // Something to say, then the punch.
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    const ascent = scene.state.ascent;
    ascent.wavesSurvived = 7; ascent.peakPower = 9000; ascent.heroesSummoned = 2;
    ascent.cardStacks = { 'iron-levy': 1 };
    scene.refresh();
  });
  // The reading above may punch on its own (the house crossing a level); let that riser live out
  // its 2.2 s before the next one is raised, so the count below is one line, not two.
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.state.ascent.rubbingsEarned = (scene.state.ascent.rubbingsEarned ?? 0) + 1;
    scene.refresh();
  });
  await page.waitForTimeout(120);
  seen = await probe();
  check('a rubbing landing raises a line off the seal', seen.risers.length === 1 && /\+1/.test(seen.risers[0]), seen.risers.join(' | '));
  check('the seals topic holds the headline after the punch', seen.texts.some((t) => /2/.test(t)), seen.texts.join(' | '));

  // Tap: open, then shut. Playwright's click lands on the canvas at CSS scale 1.
  const canvas = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const tap = { x: canvas.x + seen.bounds.x + seen.bounds.width / 2, y: canvas.y + seen.bounds.y + seen.bounds.height - 20 };
  await page.mouse.click(tap.x, tap.y);
  await page.waitForTimeout(300);
  const opened = await probe();
  check('a tap opens the sheet above the chip', opened.bounds && opened.bounds.height > 100 && opened.texts.length >= 10, `${opened.bounds?.height} tall, ${opened.texts.length} texts`);
  check('the open card prints its caption over the headline', opened.texts.length >= 2 && opened.texts.some((t) => /CHO TRIỀU SAU|FOR THE NEXT REIGN/i.test(t)), opened.texts.slice(0, 3).join(' | '));
  check('the open sheet is still within the sheet (no clipping at the head)', opened.bounds && opened.bounds.y > 100, String(opened.bounds?.y));
  check('the open sheet is in the tap guard', opened.guarded);
  await page.mouse.click(tap.x, tap.y);
  await page.waitForTimeout(300);
  const shut = await probe();
  check('a second tap shuts it to the one-line chip', shut.bounds && shut.bounds.height === 24, String(shut.bounds?.height));

  // Paused: the badge stands above the chip, not through it.
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.state.isStrategyPause = true;
    scene.refresh();
  });
  await page.waitForTimeout(200);
  const paused = await probe();
  check('the paused badge stands above the chip', paused.badgeY !== null && paused.badgeY < paused.bounds.y, `badge ${paused.badgeY} vs chip ${paused.bounds?.y}`);
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    scene.state.isStrategyPause = false;
    scene.refresh();
  });

  // A lane over it: hidden, and its guard gone.
  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').openLane('build'));
  await page.waitForTimeout(400);
  const underLane = await probe();
  check('hidden under a lane', !underLane.visible && underLane.bounds === null);
  await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').closeLane());
  await page.waitForTimeout(400);
  const back = await probe();
  check('back when the lane closes', back.visible && Boolean(back.bounds));

  check(`no console errors (${lang} h=${h})`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the chip promises what the ceremony pays, and stays out of the way'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
