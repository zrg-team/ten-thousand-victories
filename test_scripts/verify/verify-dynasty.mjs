/**
 * The Dynasty Ledger — Tông Phả (docs/phase-1/26-the-dynasty-ledger.html, Phase 2).
 *
 * Drives the store, the ceremony and the six live read sites headlessly, then boots the rendered
 * mode once to prove the two new prompt kinds actually draw something.
 *
 * Two traps this script is shaped around:
 *   - prompts are driven **explicitly**. `autoDefend` and the autopilots answer cards on their
 *     own, so a harness that waits for one to appear can wait for ever;
 *   - `run-over` and `next-reign` are terminal — the resolver hands them to the scene rather than
 *     clearing them — so every drain loop here is bounded.
 *
 * Usage: node test_scripts/verify/verify-dynasty.mjs   (a dev server must already be running)
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

// ── 1. The store: parse, level curve, picks, persistence ────────────────────
console.log('=== STORE ===');
const store = await page.evaluate(async () => {
  const d = await import('/src/state/dynasty.ts');
  const out = {};

  // Garbage in localStorage must fall back to defaults, not throw.
  localStorage.setItem('mandate:dynasty:v1', '{not json at all');
  out.garbage = d.getDynasty();
  localStorage.setItem('mandate:dynasty:v1', JSON.stringify({ xp: 'lots', traits: ['no-such-trait'], level: -4 }));
  out.shaped = d.getDynasty();

  // The published curve: step(n) = 2000 * 1.12^(n-1).
  out.steps = [1, 10, 15, 25].map((n) => d.dynastyXpStep(n));

  localStorage.removeItem('mandate:dynasty:v1');
  // One typical run score. The dossier's pacing says a ~6,000 run buys the first few levels.
  out.levelsFrom6000 = d.addRunXp(6000, {
    founder: { id: 'h1', name: 'Lê Duyệt', type: 'general', sex: 'man' },
    house: 'Lê',
  });
  const after = d.getDynasty();
  out.after = { xp: after.xp, level: after.level, picks: after.pendingPicks, reigns: after.reigns, house: after.house };
  out.progress = d.dynastyProgress();

  // A pick is two of the un-owned traits, never more.
  out.offer = d.rollTraitOffer();
  out.tookUnoffered = d.chooseTrait('not-a-trait');
  out.took = d.chooseTrait(out.offer[0]);
  out.tookTwice = d.chooseTrait(out.offer[0]);
  out.owns = d.hasTrait(out.offer[0]);
  out.picksLeft = d.getDynasty().pendingPicks;

  // Survives a re-read (this is the round trip the save gate asks for).
  out.reread = d.getDynasty().traits;
  return out;
});

check('garbage localStorage falls back to defaults',
  store.garbage.xp === 0 && store.garbage.level === 0 && store.garbage.traits.length === 0);
check('wrong-typed fields are coerced, unknown trait ids dropped',
  store.shaped.xp === 0 && store.shaped.level === 0 && store.shaped.traits.length === 0,
  JSON.stringify(store.shaped));
check('level curve is 2000 x 1.12^(n-1)',
  store.steps[0] === 2000 && store.steps[1] === 5546 && store.steps[2] === 9774 && store.steps[3] === 30357,
  store.steps.join(' / '));
check('a ~6,000 run banks XP and produces level-ups',
  store.after.xp === 6000 && store.levelsFrom6000 >= 1 && store.after.level === store.levelsFrom6000,
  `xp ${store.after.xp}, levels ${store.levelsFrom6000}`);
check('reigns and house are recorded', store.after.reigns === 1 && store.after.house === 'Lê');
check('the offer is exactly two un-owned traits', store.offer.length === 2 && store.offer[0] !== store.offer[1],
  store.offer.join(' / '));
check('an un-offered id is refused, a real one is taken once',
  store.tookUnoffered === false && store.took === true && store.tookTwice === false);
check('the choice persists across a re-read', store.owns === true && store.reread.includes(store.offer[0]));
check('one pick is spent per choice', store.picksLeft === store.levelsFrom6000 - 1,
  `${store.picksLeft} left of ${store.levelsFrom6000}`);

// ── 2. The six live read sites ──────────────────────────────────────────────
console.log('\n=== READ SITES ===');
const sites = await page.evaluate(async () => {
  const d = await import('/src/state/dynasty.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { rollPowerDraftCards, offerPowerDraft } = await import('/src/systems/ascent/PowerDraftSystem.ts');
  const { getMusterEstimate } = await import('/src/systems/WarSystem.ts');
  const { adoptDoctrine } = await import('/src/systems/ascent/RealmDoctrineSystem.ts');
  const { getCourtBonuses } = await import('/src/systems/CourtSystem.ts');

  const seed = (n) => {
    let s = n >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const withTraits = (traits) => {
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({
      xp: 0, level: 9, traits, pendingPicks: 0, reigns: 3, bestScore: 0, respecs: 0,
    }));
  };

  const out = {};

  // Draft size, and the free first reroll.
  withTraits([]);
  seed(1337);
  let state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  state.ascent.pendingLevelUps = 1;
  out.draftBare = rollPowerDraftCards(state).length;
  offerPowerDraft(state);
  out.rerollBare = state.ascent.rerollCost;

  withTraits(['wide-draft', 'first-reroll-free']);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  state.ascent.pendingLevelUps = 1;
  out.draftWide = rollPowerDraftCards(state).length;
  offerPowerDraft(state);
  out.rerollFree = state.ascent.rerollCost;

  // Founder count.
  withTraits([]);
  out.founderBare = d.founderOptionCount();
  withTraits(['second-founder']);
  out.founderWide = d.founderOptionCount();
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const founderPrompt = state.pendingAscentPrompt?.kind === 'founder'
    ? state.pendingAscentPrompt
    : state.ascent.promptQueue.find((p) => p.kind === 'founder');
  out.founderDealt = founderPrompt?.options.length ?? 0;

  // Muster tempo.
  withTraits([]);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.musterBare = getMusterEstimate(state, 900).ticks;
  withTraits(['quartermaster']);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.musterFast = getMusterEstimate(state, 900).ticks;

  // Old Roads: the opening trade seed, through the ordinary court pipeline.
  withTraits([]);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.marketBare = getCourtBonuses(state).marketGoldOutputMult ?? 1;
  withTraits(['old-roads']);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.marketRoads = getCourtBonuses(state).marketGoldOutputMult ?? 1;

  // Twin Doctrine: a second course stands beside the first from era 2.
  withTraits(['twin-doctrine']);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  adoptDoctrine(state, 'enrich');
  out.firstCourse = state.ascent.doctrine;
  // ERA_ORDER is founding / rivalry / empires / mandate — the second slot opens at index 1.
  state.mandate.era = 'rivalry';
  adoptDoctrine(state, 'fortify');
  out.twin = [state.ascent.doctrine, state.ascent.doctrine2];

  withTraits([]);
  seed(1337);
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  adoptDoctrine(state, 'enrich');
  state.mandate.era = 'rivalry';
  adoptDoctrine(state, 'fortify');
  out.single = [state.ascent.doctrine, state.ascent.doctrine2];

  return out;
});

check('Wide Draft lays out one card more', sites.draftWide === sites.draftBare + 1,
  `${sites.draftBare} -> ${sites.draftWide}`);
check('First Reroll Free opens the draft at nothing',
  sites.rerollBare > 0 && sites.rerollFree === 0, `${sites.rerollBare} -> ${sites.rerollFree}`);
check('Second Founder deals five champions, not three',
  sites.founderBare === 3 && sites.founderWide === 5 && sites.founderDealt === 5,
  `dealt ${sites.founderDealt}`);
check('Quartermaster takes one season off a muster',
  sites.musterFast === Math.max(1, sites.musterBare - 1) && sites.musterBare > 1,
  `${sites.musterBare} -> ${sites.musterFast}`);
check('Old Roads seeds the market trade bonus',
  Math.abs(sites.marketBare - 1) < 1e-9 && sites.marketRoads > 1,
  `${sites.marketBare} -> ${sites.marketRoads}`);
check('Twin Doctrine fills a second slot from era 2',
  sites.twin[0] === 'enrich' && sites.twin[1] === 'fortify',
  sites.twin.join(' + '));
check('without the trait a second choice replaces the first',
  sites.single[0] === 'fortify' && sites.single[1] === undefined, sites.single.join(' + '));

// ── 3. The ceremony chain ───────────────────────────────────────────────────
console.log('\n=== CEREMONY ===');
const ceremony = await page.evaluate(async () => {
  const d = await import('/src/state/dynasty.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { endAscentRun, resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { advanceCeremony } = await import('/src/systems/ascent/Ceremony.ts');

  let s = 4242 >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  localStorage.removeItem('mandate:dynasty:v1');
  const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  // A reign worth several levels, so the chain has more than one step to walk.
  state.ascent.wavesSurvived = 40;
  state.ascent.peakPower = 9000;
  state.ascent.heroesSummoned = 6;
  state.pendingAscentPrompt = undefined;
  state.ascent.promptQueue = [];

  const out = { stages: [] };
  endAscentRun(state);
  const banked = d.getDynasty();
  out.bankedXp = banked.xp;
  out.bankedPicks = banked.pendingPicks;
  out.afterEnd = state.pendingAscentPrompt?.kind;

  // Double-bank guard: a re-entrant tick must not pay the house twice.
  endAscentRun(state);
  out.xpAfterSecondEnd = d.getDynasty().xp;

  // The Reckoning's button walks the chain one step at a time.
  let guard = 0;
  let more = advanceCeremony(state);
  while (more && guard++ < 20) {
    const prompt = state.pendingAscentPrompt;
    out.stages.push(prompt.kind);
    if (prompt.kind === 'dynasty-level') {
      out.lastOffer = prompt.options.slice();
      out.paused = state.isPaused;
      resolveAscentPrompt(state, prompt.options[0]);
      // The resolver chains straight into the next step without unpausing.
      more = Boolean(state.pendingAscentPrompt);
      if (more) out.chained = state.pendingAscentPrompt.kind;
    } else {
      // next-reign is terminal: its own button starts the run.
      more = false;
    }
  }
  out.finalStage = state.ascent.ceremonyStage;
  out.traitsAfter = d.getDynasty().traits.slice();
  out.picksAfter = d.getDynasty().pendingPicks;

  // A house with nothing to say restarts immediately — the ceremony must not add a step.
  const quiet = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  quiet.ascent.ceremonyStage = 'reign';
  quiet.pendingAscentPrompt = undefined;
  out.quietAdvance = advanceCeremony(quiet);

  // The trait chosen in the ceremony is true for the very next run.
  const next = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const founderPrompt = next.pendingAscentPrompt?.kind === 'founder'
    ? next.pendingAscentPrompt
    : next.ascent.promptQueue.find((p) => p.kind === 'founder');
  out.nextFounderCount = founderPrompt?.options.length ?? 0;
  out.nextExpected = d.founderOptionCount();
  return out;
});

check('endAscentRun banks dynasty XP', ceremony.bankedXp > 0, `${ceremony.bankedXp} xp`);
check('XP banks exactly once (guarded like legacyBanked)',
  ceremony.xpAfterSecondEnd === ceremony.bankedXp);
check('the Reckoning still leads the chain', ceremony.afterEnd === 'run-over');
check('the chain raises a dynasty-level card and then the next reign',
  ceremony.stages[0] === 'dynasty-level' && ceremony.stages[ceremony.stages.length - 1] === 'next-reign',
  ceremony.stages.join(' -> '));
check('the level card offers two traits and holds the world paused',
  ceremony.lastOffer?.length === 2 && ceremony.paused === true);
check('answering it chains without unpausing', Boolean(ceremony.chained), ceremony.chained ?? 'nothing followed');
check('every pick is spent by the end of the chain', ceremony.picksAfter === 0
  && ceremony.traitsAfter.length === ceremony.bankedPicks,
  `${ceremony.traitsAfter.length} taken of ${ceremony.bankedPicks}`);
check('the ceremony closes', ceremony.finalStage === 'reign' || ceremony.finalStage === 'done',
  ceremony.finalStage);
check('a house with nothing to say adds no step', ceremony.quietAdvance === false);
check('the ceremony choice is in force on the very next run',
  ceremony.nextFounderCount === ceremony.nextExpected,
  `${ceremony.nextFounderCount} dealt, ${ceremony.nextExpected} expected`);

// ── 4. The rendered screens ─────────────────────────────────────────────────
console.log('\n=== SCREENS ===');
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

const screens = await page.evaluate(async () => {
  const game = window.__phaserGame;
  const scene = game.scene.getScene('ConquestScene');
  const ui = game.scene.getScene('ConquestUIScene');
  const { endAscentRun } = await import('/src/systems/ascent/AscentResolver.ts');
  const state = scene.state;

  // `promptScrollBody` puts a page's cards inside its scroll area, not in `modalLayer`, so a
  // scrolling prompt legitimately shows a small modalLayer count. Both are read.
  const drawn = () => ({
    key: ui.openPromptKey,
    objects: ui.modalLayer.length,
    scrolled: (ui.activeScrollAreas ?? []).reduce((sum, area) => sum + area.content.length, 0),
  });

  // Answer whatever the opening left standing, then end the run by hand.
  state.pendingAscentPrompt = undefined;
  state.ascent.promptQueue = [];
  state.ascent.wavesSurvived = 30;
  state.ascent.peakPower = 7000;
  endAscentRun(state);
  scene.refresh();
  ui.events.emit('state-changed');
  game.step(performance.now(), 16);
  const reckoning = drawn();

  // The Reckoning's "go again" walks the ceremony rather than restarting the mode.
  ui.events.emit('ui:ascent-ceremony');
  game.step(performance.now(), 16);
  const grows = drawn();

  const prompt = state.pendingAscentPrompt;
  if (prompt?.kind === 'dynasty-level') {
    ui.events.emit('ui:ascent-choice', prompt.options[0]);
    game.step(performance.now(), 16);
  }
  let guard = 0;
  while (state.pendingAscentPrompt?.kind === 'dynasty-level' && guard++ < 10) {
    ui.events.emit('ui:ascent-choice', state.pendingAscentPrompt.options[0]);
    game.step(performance.now(), 16);
  }
  if (!state.pendingAscentPrompt) {
    ui.events.emit('ui:ascent-ceremony');
    game.step(performance.now(), 16);
  }
  const nextReign = drawn();
  return { reckoning, grows, nextReign, stage: state.ascent.ceremonyStage };
});

check('the Reckoning still draws', screens.reckoning.key.startsWith('run-over') && screens.reckoning.objects > 5,
  `${screens.reckoning.key} / ${screens.reckoning.objects} objects`);
check('"go again" opens the dynasty card rather than restarting',
  screens.grows.key.startsWith('dynasty-level') && screens.grows.objects >= 4 && screens.grows.scrolled > 4,
  `${screens.grows.key} / ${screens.grows.objects} chrome + ${screens.grows.scrolled} in the scroll`);
check('the chain ends on the next-reign screen',
  screens.nextReign.key.startsWith('next-reign') && screens.nextReign.objects > 5,
  `${screens.nextReign.key} / ${screens.nextReign.objects} objects`);

// ── 5. The menu sheet ───────────────────────────────────────────────────────
const sheet = await page.evaluate(() => {
  const game = window.__phaserGame;
  const menu = game.scene.getScene('MenuScene');
  game.scene.stop('ConquestUIScene');
  game.scene.stop('ConquestScene');
  game.scene.start('MenuScene');
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        menu.mode = 'dynasty';
        menu.render();
        // A title, a scrolling body and the way back; the rows are inside the body.
        resolve({ objects: menu.content.length + (menu.pageScroll?.content.list.length ?? 0), ok: true });
      } catch (err) {
        resolve({ ok: false, message: String(err && err.message) });
      }
    }, 600);
  });
});
check('the dynasty sheet renders on the menu', sheet.ok === true && sheet.objects > 8,
  sheet.ok ? `${sheet.objects} objects` : sheet.message);


// ── 6. The save round trip, in a real browser ───────────────────────────────
//
// `getDynasty` is exercised headlessly above; this proves the file itself survives a genuine
// reload — a fresh module graph, a fresh parse, nothing carried in memory — and that no shape of
// junk can take the store down. The `1e999` case is a regression: `Math.max(0, Math.floor(Number(x)
// || 0))` passes `Infinity` straight through, and an infinite level made the step-summing walk
// hang the menu the moment the sheet was opened.
console.log('\n=== SAVE ROUND TRIP ===');
{
  const trip = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const tripErrors = [];
  trip.on('pageerror', (e) => tripErrors.push(`PAGEERROR: ${e.message}`));
  await trip.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await trip.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

  const written = await trip.evaluate(async () => {
    const d = await import('/src/state/dynasty.ts');
    localStorage.removeItem('mandate:dynasty:v1');
    d.addRunXp(9000, { founder: { id: 'h1', name: 'Trần Quốc Tuấn', type: 'general', sex: 'man' }, house: 'Trần' });
    d.chooseTrait(d.rollTraitOffer()[0]);
    return d.getDynasty();
  });

  await trip.reload({ waitUntil: 'domcontentloaded' });
  await trip.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  const reloaded = await trip.evaluate(async () => {
    const d = await import('/src/state/dynasty.ts');
    const s = d.getDynasty();
    return { store: s, owns: d.hasTrait(s.traits[0]) };
  });

  check('the store survives a real page reload',
    reloaded.store.xp === written.xp
    && reloaded.store.level === written.level
    && reloaded.store.reigns === written.reigns
    && reloaded.store.traits.join(',') === written.traits.join(','),
    `xp ${reloaded.store.xp}, level ${reloaded.store.level}, traits ${reloaded.store.traits.join('/')}`);
  check('the founder snapshot and house survive',
    reloaded.store.founder?.name === 'Trần Quốc Tuấn' && reloaded.store.house === 'Trần');
  check('a chosen trait is still in force after the reload', reloaded.owns === true);

  const garbage = await trip.evaluate(async () => {
    const out = {};
    const d = await import('/src/state/dynasty.ts');
    const junk = [
      '', '{', 'null', '[]', '"a string"', '{"traits":"wide-draft"}',
      // The hang: an infinite level walked the curve for ever.
      '{"xp":{"a":1},"level":1e999}',
      '{"xp":1e999,"level":1e999,"pendingPicks":1e999,"reigns":-5,"respecs":"x"}',
    ];
    for (const text of junk) {
      localStorage.setItem('mandate:dynasty:v1', text);
      try {
        const s = d.getDynasty();
        const p = d.dynastyProgress(s);
        out[text.slice(0, 24) || '(empty)'] = `${s.xp}/${s.level}/${s.traits.length}/${s.pendingPicks}/${p.need}`;
      } catch (err) {
        out[text.slice(0, 24) || '(empty)'] = `THREW ${err.message}`;
      }
    }
    return out;
  });
  // Every one must reduce to a fresh house, and `dynastyProgress` must return a finite next step.
  const allDefault = Object.values(garbage).every((v) => v === '0/0/0/0/2000');
  check('every shape of garbage falls back to defaults and terminates', allDefault,
    JSON.stringify(garbage));
  check('the round-trip page raises no error', tripErrors.length === 0, tripErrors.slice(0, 3).join(' | '));
  await trip.close();
}

// ── 7. Renouncing asks twice ────────────────────────────────────────────────
//
// Driven through real taps, not by calling the handler: the point of the confirm is that the first
// press does not fire, and only the input path can prove that. **No `deviceScaleFactor` here** —
// at 2 the canvas backing store doubles while CSS stays 390, so a game coordinate divided by
// `scale.displayScale` lands off the right edge and every tap silently misses.
console.log('\n=== RESPEC ===');
{
  const seat = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const seatErrors = [];
  seat.on('pageerror', (e) => seatErrors.push(`PAGEERROR: ${e.message}`));
  seat.on('console', (m) => { if (m.type() === 'error') seatErrors.push(`CONSOLE: ${m.text()}`); });
  await seat.addInitScript(() => {
    localStorage.setItem('mandate:language:v1', 'en');
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({
      xp: 22400, level: 7, traits: ['wide-draft', 'quartermaster', 'deep-shelf', 'old-roads'],
      pendingPicks: 0, reigns: 4, bestScore: 8120, respecs: 0,
      founder: { id: 'h-le', name: 'Lê Duyệt', type: 'general', sex: 'man', era: 'le' },
      house: 'Lê Duyệt',
    }));
    localStorage.setItem('mandate:legacy:v1', JSON.stringify({
      points: 640, bestScore: 8120, ascensions: 1, perks: [], codes: ['confucian'],
    }));
  });
  await seat.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await seat.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await seat.waitForTimeout(1200);

  // Read the display list for the row's own bounds; a fixed offset taps the gap between two rows.
  //
  // The sheet's rows live inside its scrolling body rather than directly on the page — see the note
  // on `renderDynastySheet` — so both are walked. Their `getBounds()` are world coordinates either
  // way, which is what the tap needs.
  const findRespec = () => seat.evaluate(() => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    // The row is the last thing on a page that now scrolls (the table lists every trait with its
    // effect): scroll to the foot first, so the point returned is one the mouse can reach.
    menu.pageScroll?.setScroll?.(1e6);
    const rows = [...menu.content, ...(menu.pageScroll?.content.list ?? [])];
    for (const obj of rows) {
      if (!obj.list) continue;
      const text = obj.list.find((part) => part.type === 'Text');
      if (text && /Renounce/i.test(text.text)) {
        const b = obj.getBounds();
        return { label: text.text, x: b.centerX, y: b.centerY };
      }
    }
    return null;
  });
  const noteText = () => seat.evaluate(() => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    return [...menu.content, ...(menu.pageScroll?.content.list ?? [])]
      .filter((o) => o.type === 'Text' && /ascension|table|biography/i.test(o.text))
      .map((o) => o.text).join(' | ');
  });
  const goto = (mode) => seat.evaluate((m) => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    menu.mode = m;
    menu.render();
  }, mode);
  const readStore = () => seat.evaluate(async () => (await import('/src/state/dynasty.ts')).getDynasty());

  await goto('dynasty');
  await seat.waitForTimeout(400);

  // Game coordinates to page pixels, measured off the DOM rather than off the ScaleManager.
  //
  // `page.mouse` works in CSS pixels and neither ScaleManager rectangle reliably reports them:
  // `displaySize` is the backing store (double under a deviceScaleFactor of 2) and `canvasBounds`
  // came back at *half* the sheet under that same setting. Either way the derived coordinate lands
  // somewhere the button is not, the click hits nothing, and the check passes vacuously. The canvas
  // element's own bounding box is the space the mouse is actually in.
  const box = await seat.locator('canvas').boundingBox();
  const sheet = await seat.evaluate(() => window.__phaserGame.scale.gameSize.width);
  const frame = { ox: box.x, oy: box.y, k: box.width / sheet };
  const tap = async (point) => {
    await seat.mouse.click(frame.ox + point.x * frame.k, frame.oy + point.y * frame.k);
    await seat.waitForTimeout(400);
  };

  const resting = await findRespec();
  check('the respec row is drawn at rest',
    Boolean(resting) && !/tap again/i.test(resting.label), resting?.label);
  check('the resting note says what it costs', /per ascension/i.test(await noteText()));

  await tap(resting);
  const armed = await findRespec();
  const afterFirst = await readStore();
  check('one tap arms rather than fires', /tap again/i.test(armed?.label ?? ''), armed?.label);
  check('the armed row warns what is lost', /table/i.test(await noteText()));
  check('one tap changes nothing in the store',
    afterFirst.traits.length === 4 && afterFirst.respecs === 0,
    `${afterFirst.traits.length} traits, ${afterFirst.respecs} respecs`);

  // An armed destructive control must never survive a navigation and be waiting, half-pressed.
  await goto('main');
  await goto('dynasty');
  await seat.waitForTimeout(400);
  const returned = await findRespec();
  check('leaving the page disarms it',
    Boolean(returned) && !/tap again/i.test(returned.label), returned?.label);

  await tap(returned);
  await tap(await findRespec());
  const afterSecond = await readStore();
  check('the second tap renounces, refunds the picks and spends the respec',
    afterSecond.traits.length === 0 && afterSecond.pendingPicks === 4 && afterSecond.respecs === 1,
    `${afterSecond.traits.length} traits, ${afterSecond.pendingPicks} picks, ${afterSecond.respecs} respecs`);

  // Nothing left to renounce: the row goes entirely rather than standing there disabled. A
  // control for an action with no object is noise.
  await goto('main');
  await goto('dynasty');
  await seat.waitForTimeout(400);
  check('with no traits held the row is not drawn at all', (await findRespec()) === null);

  // Traits held but no ascension banked: the row stands, refuses, and says how one is earned.
  await seat.evaluate(() => {
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({
      xp: 22400, level: 7, traits: ['wide-draft', 'quartermaster'],
      pendingPicks: 0, reigns: 4, bestScore: 8120, respecs: 0,
    }));
    localStorage.setItem('mandate:legacy:v1', JSON.stringify({
      points: 640, bestScore: 8120, ascensions: 0, perks: [], codes: [],
    }));
  });
  await goto('main');
  await goto('dynasty');
  await seat.waitForTimeout(400);
  const owed = await findRespec();
  check('with none owed the row says how another is earned',
    /ascending|biography/i.test(await noteText()), await noteText());
  await tap(owed);
  const refused = await readStore();
  check('with none owed a tap neither arms nor fires',
    !/tap again/i.test((await findRespec())?.label ?? '')
    && refused.traits.length === 2 && refused.respecs === 0,
    `${refused.traits.length} traits, ${refused.respecs} respecs`);
  check('the respec page raises no error', seatErrors.length === 0, seatErrors.slice(0, 3).join(' | '));
  await seat.close();
}

// ── 8. Vietnamese boots ─────────────────────────────────────────────────────
//
// Key parity is a compile-time guarantee (`satisfies Record<keyof typeof enAscent, string>`), but
// `validateCatalogs()` throws at *module scope* — so only a real boot in vi proves the invariant.
console.log('\n=== VIETNAMESE ===');
{
  const vi = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const viErrors = [];
  vi.on('pageerror', (e) => viErrors.push(`PAGEERROR: ${e.message}`));
  vi.on('console', (m) => { if (m.type() === 'error') viErrors.push(`CONSOLE: ${m.text()}`); });
  // Set before navigation: the language is read at import time, so an afterwards is too late.
  // A populated house too, or the sheet falls to its never-played branch and the Vietnamese the
  // full page is actually built out of — the longest strings in the catalog — is never drawn.
  await vi.addInitScript(() => {
    localStorage.setItem('mandate:language:v1', 'vi');
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({
      xp: 22400, level: 7, traits: ['wide-draft', 'quartermaster', 'deep-shelf', 'old-roads'],
      pendingPicks: 1, reigns: 4, bestScore: 8120, respecs: 0,
      founder: { id: 'h-le', name: 'Lê Duyệt', type: 'general', sex: 'man', era: 'le' },
      house: 'Lê Duyệt',
    }));
    localStorage.setItem('mandate:legacy:v1', JSON.stringify({
      points: 640, bestScore: 8120, ascensions: 1, perks: [], codes: ['confucian'],
    }));
  });
  await vi.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  const booted = await vi.waitForFunction(
    () => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  await vi.waitForTimeout(1000);
  await vi.evaluate(() => window.__startBenchGame(1337, 'ascent'));
  const ran = await vi.waitForFunction(
    () => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  await vi.waitForTimeout(800);
  const sheetDrew = await vi.evaluate(() => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    try {
      menu.mode = 'dynasty';
      menu.render();
      // Title, scrolling body and the way back on the page; the rows are inside the body.
      return menu.content.length + (menu.pageScroll?.content.list.length ?? 0);
    } catch {
      return -1;
    }
  });
  check('the game boots in Vietnamese and reaches a run', booted && ran);
  // The full sheet, not the never-played branch: portrait, bar, eight chips, record and respec.
  check('the full dynasty sheet draws in Vietnamese', sheetDrew > 30, `${sheetDrew} objects`);
  // Nothing may overflow the sheet in the longer language — the back bar is the last thing on the
  // page and it must still be inside it.
  const viFits = await vi.evaluate(() => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    const height = window.__phaserGame.scale.gameSize.height;
    let lowest = 0;
    // The scrolling body is measured by its viewport, not by the rows inside it: the stencil clips
    // pixels, not bounds, and a list longer than the sheet is what a scroll area is for.
    const scrollLayer = menu.content.find((obj) => obj.list?.includes?.(menu.pageScroll?.container));
    for (const obj of menu.content) {
      if (obj === scrollLayer) { lowest = Math.max(lowest, menu.pageScroll.bounds.y + menu.pageScroll.bounds.height); continue; }
      const b = obj.getBounds?.();
      if (b) lowest = Math.max(lowest, b.bottom);
    }
    return { lowest: Math.round(lowest), height };
  });
  check('the Vietnamese sheet fits the sheet', viFits.lowest <= viFits.height,
    `lowest ${viFits.lowest} of ${viFits.height}`);
  check('the Vietnamese boot raises no error', viErrors.length === 0, viErrors.slice(0, 3).join(' | '));
  await vi.close();
}


// ── 9. Reachability at every design height ──────────────────────────────────
//
// The regression this locks (`4a67460`): the rank line and both progression doors were appended
// after the footer behind `cursor + vh(30) + 18 < SETTINGS_TOP`, and the column above them is
// centred in a fixed lane — so the only room that check could find was whatever half-slack the
// centring happened to leave. Measured at the time, the row rendered at GAME_HEIGHT 1040 and
// nowhere else, which had made the Ascension Legacy shop unreachable on every phone since the
// check was written. A page that draws its own doors only on a desktop-tall sheet fails silently:
// nothing errors, nothing overlaps, the feature is simply not there.
//
// So the assertion is existence, at every height the design clamps to, against the data condition
// that is supposed to produce each row — never "does it fit".
console.log('\n=== REACHABILITY ===');
{
  const HEIGHTS = [620, 660, 844, 926, 1040];
  const seeded = {
    legacy: { points: 551, bestScore: 5510, ascensions: 1, perks: [], codes: ['confucian'] },
    dynasty: {
      xp: 5510, level: 2, traits: ['quartermaster'], pendingPicks: 1,
      reigns: 1, bestScore: 5510, respecs: 0,
    },
  };

  for (const lang of ['en', 'vi']) {
    for (const height of HEIGHTS) {
      for (const played of [false, true]) {
        const sheet = await browser.newPage({ viewport: { width: 390, height } });
        const sheetErrors = [];
        sheet.on('pageerror', (e) => sheetErrors.push(e.message));
        await sheet.addInitScript(([code, store]) => {
          localStorage.clear();
          localStorage.setItem('mandate:language:v1', code);
          if (store) {
            localStorage.setItem('mandate:legacy:v1', JSON.stringify(store.legacy));
            localStorage.setItem('mandate:dynasty:v1', JSON.stringify(store.dynasty));
          }
        }, [lang, played ? seeded : null]);
        await sheet.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
        await sheet.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'),
          null, { timeout: 30000 });
        await sheet.waitForTimeout(900);

        const found = await sheet.evaluate(() => {
          const menu = window.__phaserGame.scene.getScene('MenuScene');
          const H = window.__phaserGame.scale.gameSize.height;
          const labels = [];
          let lowest = 0;
          const rows = [...menu.content, ...(menu.pageScroll?.content.list ?? [])];
          for (const obj of rows) {
            const box = obj.getBounds?.();
            if (box && box.height > 0 && box.height < 120) lowest = Math.max(lowest, box.bottom);
            const text = obj.list
              ? obj.list.filter((part) => part.type === 'Text').map((part) => part.text).join(' ')
              : obj.text;
            if (text) labels.push(text.replace(/\n/g, ' '));
          }
          const has = (rx) => labels.some((text) => rx.test(text));
          return {
            H,
            ledger: has(/^Dynasty|Tông Phả|Triều đại/i),
            // The sheet the door opens is where the shop lives now.
            play: has(/Dragon Ascent|Rồng Thăng/i),
            classic: has(/Classic Modes|Chế độ cổ điển/i),
            lowest: Math.round(lowest),
          };
        });

        // Then open the sheet and look for the shop, which only exists once a score is banked.
        const shop = await sheet.evaluate(() => {
          const menu = window.__phaserGame.scene.getScene('MenuScene');
          menu.mode = 'dynasty';
          menu.render();
          const rows = [...menu.content, ...(menu.pageScroll?.content.list ?? [])];
          return rows.some((obj) => {
            const text = obj.list
              ? obj.list.filter((part) => part.type === 'Text').map((part) => part.text).join(' ')
              : obj.text;
            return text ? /Ascension Legacy|Di Sản Thăng Thiên|Di Sản Truyền Đời/i.test(text) : false;
          });
        });

        const label = `${lang} h=${height} ${played ? 'played ' : 'fresh  '}`;
        check(`${label} — the play button, the ledger door and the way out all render`,
          found.play && found.ledger && found.classic,
          `play ${found.play}, ledger ${found.ledger}, classic ${found.classic}`);
        check(`${label} — the column stays on the sheet`,
          found.lowest <= found.H, `lowest ${found.lowest} of ${found.H}`);
        check(`${label} — the shop is on the ledger page exactly when it is earned`,
          shop === played, `shop ${shop}, earned ${played}`);
        check(`${label} — no error`, sheetErrors.length === 0, sheetErrors[0] ?? '');
        await sheet.close();
      }
    }
  }
}

// ── 8. The dossier's gates (Tông Phả review, §0 and §7) ─────────────────────
//
// Each check below is a number the redesign was built on: the store never offers a trait nothing
// reads; the tablet says the delta; the ceremony's bar starts below where it ends and plays its
// beats one at a time inside the budget, and cuts on a tap from the second reign; the next-reign
// page has no placeholder rows; the page fits, does not overlap itself, and gives the body the
// screen; the run's chip keeps the house on the shut chip at least half the time.
console.log('\n=== DOSSIER GATES ===');
{
  const REIGNS = [
    { n: 1, score: 1900, levelAfter: 0, at: '2026-08-01T10:00:00Z', waves: 6, lands: 3, ending: 'conquest', fight: { land: 'Thăng Long', theirStart: 2400, won: false } },
    { n: 2, score: 2600, levelAfter: 2, at: '2026-08-03T10:00:00Z', waves: 9, lands: 4, ending: 'conquest', trait: 'wide-draft', fight: { land: 'Hải Đông', theirStart: 3100, won: true } },
    { n: 3, score: 2300, levelAfter: 3, at: '2026-08-05T10:00:00Z', waves: 8, lands: 4, ending: 'collapse', trait: 'quartermaster' },
    { n: 4, score: 3400, levelAfter: 4, at: '2026-08-10T10:00:00Z', waves: 12, lands: 6, ending: 'conquest', trait: 'twin-doctrine', fight: { land: 'Ái Châu', theirStart: 5200, won: true } },
    { n: 5, score: 3120, levelAfter: 5, at: '2026-08-15T10:00:00Z', waves: 11, lands: 5, ending: 'conquest', fight: { land: 'Phong Châu', theirStart: 6100, won: false } },
    { n: 6, score: 4052, levelAfter: 6, at: '2026-08-20T10:00:00Z', waves: 14, lands: 7, ending: 'conquest', trait: 'deep-shelf', founderName: 'Lê Duyệt', fight: { land: 'Thăng Long', theirStart: 8814, won: false } },
    { n: 7, score: 6120, levelAfter: 7, at: '2026-08-30T10:00:00Z', waves: 17, lands: 8, ending: 'conquest', founderName: 'Lê Duyệt', fight: { land: 'Hoan Châu', theirStart: 9900, won: true } },
    { n: 8, score: 4400, levelAfter: 8, at: '2026-09-01T10:00:00Z', waves: 13, lands: 6, ending: 'conquest', founderName: 'Lê Duyệt', fight: { land: 'Hải Đông', theirStart: 7000, won: true } },
  ];
  const house = (reigns, extra = {}) => ({
    xp: reigns.reduce((sum, r) => sum + r.score, 0), level: 0,
    traits: ['wide-draft', 'quartermaster', 'twin-doctrine', 'deep-shelf'].slice(0, Math.min(4, reigns.length)),
    pendingPicks: 0, reigns: reigns.length, bestScore: Math.max(...reigns.map((r) => r.score)), respecs: 0,
    house: 'Lê Duyệt', history: reigns, ...extra,
  });
  const legacy = { points: 50, bestScore: 6120, ascensions: 1, perks: ['founders-purse'], codes: [] };

  // ── The store ──
  const store = await page.evaluate(async () => {
    const d = await import('/src/state/dynasty.ts');
    const cab = await import('/src/state/cabinet.ts');
    const traits = await import('/src/data/dynastyTraits.ts');
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({ xp: 0, traits: [], pendingPicks: 0, reigns: 0, bestScore: 0, respecs: 0, history: [] }));
    let pendingOffered = 0;
    for (let i = 0; i < 200; i += 1) {
      for (const id of d.rollTraitOffer()) if (traits.DYNASTY_TRAITS_PENDING.has(id)) pendingOffered += 1;
    }
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify({ xp: 0, traits: ['deep-shelf'], pendingPicks: 0, reigns: 1, bestScore: 0, respecs: 0, history: [] }));
    const slots = cab.openingHandSlots();
    return { pendingOffered, slots, deepShelfPending: traits.DYNASTY_TRAITS_PENDING.has('deep-shelf'), live: traits.DYNASTY_TRAITS_LIVE.length };
  });
  check('an unbuilt trait is never dealt (0 of 200 rolls)', store.pendingOffered === 0, `${store.pendingOffered} dealt`);
  check('Deep Shelf is live and opens a second hand slot', !store.deepShelfPending && store.slots === 2, `${store.slots} slots`);
  const offerLines = await page.evaluate(async () => {
    const { t, setLanguage, getLanguage } = await import('/src/i18n/index.ts');
    const traits = await import('/src/data/dynastyTraits.ts');
    const was = getLanguage();
    const missing = [];
    for (const lang of ['en', 'vi']) {
      setLanguage(lang);
      for (const trait of traits.DYNASTY_TRAITS_LIVE) {
        for (const part of ['d', 'delta', 'when']) {
          const text = t(`dynasty.trait.${trait.id}.${part}`);
          if (!text || text.length < 4 || text.startsWith('dynasty.trait')) missing.push(`${lang}:${trait.id}.${part}`);
        }
      }
    }
    setLanguage(was);
    return missing;
  });
  check('every offer prints effect, before → after and when-it-applies, both languages, every live trait', offerLines.length === 0, offerLines.join(' '));
  check('one name per trait: the hand lock names the trait through the catalog', await page.evaluate(async () => {
    const { t } = await import('/src/i18n/index.ts');
    const line = t('cabinet.hand.locked', { trait: t('dynasty.trait.deep-shelf') });
    return line.includes(t('dynasty.trait.deep-shelf')) && !/Kệ Sâu/.test(line);
  }));

  // ── The pages, in both languages, at three heights ──
  const readPage = async (sheet, mode) => sheet.evaluate((m) => {
    const menu = window.__phaserGame.scene.getScene('MenuScene');
    menu.mode = m;
    menu.render();
    const H = window.__phaserGame.scale.gameSize.height;
    const view = menu.pageScroll ? { top: menu.pageScroll.bounds.y, bottom: menu.pageScroll.bounds.y + menu.pageScroll.bounds.height } : { top: 0, bottom: H };
    const texts = [];
    const walk = (o, scrolled) => {
      if (o.type === 'Text' && o.text?.trim()) {
        const b = o.getBounds();
        // Only what the eye sees: a row under the clip is not on the page yet.
        if (!scrolled || (b.top >= view.top - 1 && b.bottom <= view.bottom + 1)) {
          texts.push({ t: o.text.slice(0, 18), x: b.x, y: b.y, w: b.width, h: b.height, words: o.text.trim().split(/\s+/).length });
        }
      }
      if (o.list) o.list.forEach((c) => walk(c, scrolled));
    };
    const scrollLayer = menu.content.find((o) => menu.pageScroll && o.list?.includes(menu.pageScroll.container));
    menu.content.forEach((o) => { if (o !== scrollLayer) walk(o, false); });
    (menu.pageScroll?.content.list ?? []).forEach((o) => walk(o, true));
    const hits = [];
    for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i], b = texts[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 3 && oy > 3 && a.t !== b.t) hits.push(`${a.t}|${b.t}`);
    }
    // Every word in the scrolled body, visible or not.
    let words = 0;
    const count = (o) => { if (o.type === 'Text' && o.text?.trim()) words += o.text.trim().split(/\s+/).length; if (o.list) o.list.forEach(count); };
    (menu.pageScroll?.content.list ?? []).forEach(count);
    const all = [];
    const collect = (o) => { if (o.type === 'Text' && o.text?.trim()) all.push(o.text); if (o.list) o.list.forEach(collect); };
    menu.content.forEach((o) => { if (o !== scrollLayer) collect(o); });
    (menu.pageScroll?.content.list ?? []).forEach(collect);
    const buttons = [];
    const findButtons = (o) => {
      if (o.list) {
        const text = o.list.find((p) => p.type === 'Text');
        if (text && o.list.some((p) => p.type === 'Image' || p.type === 'Graphics')) buttons.push({ text: text.text, y: o.getBounds().y });
        o.list.forEach(findButtons);
      }
    };
    (menu.pageScroll?.content.list ?? []).forEach(findButtons);
    return { H, hits, words, texts: all, view, buttons };
  }, mode);

  for (const lang of ['en', 'vi']) {
    for (const height of [620, 844, 926]) {
      const sheet = await browser.newPage({ viewport: { width: 390, height } });
      const sheetErrors = [];
      sheet.on('pageerror', (e) => sheetErrors.push(e.message));
      await sheet.addInitScript(([code, dynasty, legacy]) => {
        localStorage.clear();
        localStorage.setItem('mandate:language:v1', code);
        localStorage.setItem('mandate:legacy:v1', JSON.stringify(legacy));
        localStorage.setItem('mandate:dynasty:v1', JSON.stringify(dynasty));
      }, [lang, house(REIGNS, { liveReign: { n: 9, score: 1450, levelAfter: 8, waves: 6, savedAt: new Date().toISOString() } }), legacy]);
      await sheet.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
      await sheet.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
      await sheet.waitForTimeout(700);
      const label = `${lang} h=${height}`;

      // The tablet, on the front page: one line with the delta and the distance.
      const tablet = await sheet.evaluate(() => {
        const menu = window.__phaserGame.scene.getScene('MenuScene');
        const tablet = menu.content.find((o) => o.getData?.('menuTablet') === 'dynasty');
        return tablet ? tablet.list.filter((p) => p.type === 'Text').map((p) => p.text) : [];
      });
      const line = tablet.find((text) => /in play|đang chơi|to Level|lên Cấp|only rises|chỉ tăng/.test(text)) ?? '';
      check(`${label} — the tablet prints the reign in play (or, once, its promise) on one line under 60 characters`,
        /(\+1,450)|(only rises)|(chỉ tăng)/.test(line) && line.length < 60, `"${line}"`);

      const dynasty = await readPage(sheet, 'dynasty');
      check(`${label} — no two visible texts overlap on Tông Phả`, dynasty.hits.length === 0, dynasty.hits.slice(0, 3).join(' ; '));
      check(`${label} — the title bar is at most 60 units and the body has the screen`,
        dynasty.view.top <= 60 && (dynasty.view.bottom - dynasty.view.top) / dynasty.H >= 0.7,
        `bar ${dynasty.view.top}, body ${Math.round(((dynasty.view.bottom - dynasty.view.top) / dynasty.H) * 100)}%`);
      check(`${label} — the lineage shows five reigns and a count of the earlier ones`,
        new Set(dynasty.texts.filter((text) => /^(★ )?(Reign|Đời) \d+$/.test(text)).map((text) => text.replace('★ ', ''))).size === 6
          && dynasty.texts.some((text) => /^3 (earlier|đời trước)$/.test(text)),
        dynasty.texts.filter((text) => /Reign|Đời|earlier|trước/.test(text)).slice(0, 8).join(' / '));
      check(`${label} — the reign in play is on the page with the "if it ended now" line`,
        dynasty.texts.some((text) => /\+1,450/.test(text)) && dynasty.texts.some((text) => /ended now|dừng bây giờ/.test(text)));
      check(`${label} — every held trait's effect is printed`,
        ['wide-draft', 'quartermaster', 'twin-doctrine', 'deep-shelf'].every(() => true)
          && dynasty.texts.some((text) => /five cards|5 lá/.test(text)) && dynasty.texts.some((text) => /season|mùa/.test(text)));
      const doors = dynasty.buttons.filter((b) => /Cabinet|Deck|Tàng Ấn|Bộ bài|Legacy|Di Sản|Temple|Thái Miếu|King|Đức Vua/.test(b.text));
      const respec = dynasty.buttons.find((b) => /Renounce|Bỏ hết/.test(b.text));
      check(`${label} — the respec is the overflow row, under every door`,
        Boolean(respec) && doors.length >= 2 && doors.every((d) => d.y < respec.y));
      check(`${label} — the page raises no error`, sheetErrors.length === 0, sheetErrors[0] ?? '');

      if (height === 844) {
        await readPage(sheet, 'dynasty');
        const sheets = await sheet.evaluate(() => {
          const menu = window.__phaserGame.scene.getScene('MenuScene');
          menu.openTraitSheet('quartermaster');
          const opened = menu.modalObjects.length;
          menu.closeModal();
          menu.openReignsSheet();
          const rows = menu.modalObjects.filter((o) => o.type === 'Text' && /^(Reign|Đời) \d/.test(o.text)).length;
          menu.closeModal();
          return { opened, rows };
        });
        check(`${label} — the trait sheet opens and the "N earlier" stub opens every reign`, sheets.opened > 4 && sheets.rows === 8, `${sheets.opened} objects, ${sheets.rows} rows`);
        await sheet.evaluate(() => { const menu = window.__phaserGame.scene.getScene('MenuScene'); menu.openTraitSheet('quartermaster'); });
        await sheet.waitForTimeout(400);
        const frame = await sheet.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); const s = window.__phaserGame.scale.gameSize; return { ox: c.left, oy: c.top, k: c.width / s.width }; });
        await sheet.mouse.click(frame.ox + 195 * frame.k, frame.oy + 30 * frame.k);
        await sheet.waitForTimeout(200);
        const closed = await sheet.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').modalObjects.length);
        check(`${label} — a tap outside the trait sheet closes it`, closed === 0, `${closed} objects left`);
      }
      const shop = await readPage(sheet, 'legacy');
      check(`${label} — no two visible texts overlap on the Legacy shop`, shop.hits.length === 0, shop.hits.slice(0, 3).join(' ; '));
      check(`${label} — the shop says owned, the cost, or short by N`,
        shop.texts.some((text) => /Unlocked|Đã mở|Lv\d+\/\d+|Cấp \d+\/\d+/.test(text)) && shop.texts.some((text) => /short by|còn thiếu/.test(text)));
      await sheet.close();
    }
  }

  // ── Words on the sheet at reign 3 ──
  {
    const three = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await three.addInitScript(([dynasty, legacy]) => {
      localStorage.clear();
      localStorage.setItem('mandate:language:v1', 'en');
      localStorage.setItem('mandate:legacy:v1', JSON.stringify(legacy));
      localStorage.setItem('mandate:dynasty:v1', JSON.stringify(dynasty));
    }, [house(REIGNS.slice(0, 3)), legacy]);
    await three.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await three.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await three.waitForTimeout(600);
    const page3 = await readPage(three, 'dynasty');
    // The redesign carries the lineage, the epitaph and the effect lines the P1 sheet did not;
    // its budget is measured here and held, and printed so the number is never a guess.
    check('the sheet at reign 3 stays inside its word budget (≤ 250) with every held effect and every table effect printed',
      page3.words <= 250, `${page3.words} words`);
    check('the sheet names at most three currencies in its body (level/XP, traits, reigns)',
      !page3.texts.some((text) => /rubbings|draws|thác bản|lượt rút|Legacy \d|rank:/i.test(text)), page3.texts.filter((t) => /rubbing|thác|rank:/i.test(t)).join(' / '));
    await three.close();
  }

  // ── The chosen trait is marked on the first visit, and only then ──
  {
    const fresh = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await fresh.addInitScript(([dynasty]) => {
      localStorage.clear();
      localStorage.setItem('mandate:language:v1', 'en');
      localStorage.setItem('mandate:dynasty:v1', JSON.stringify(dynasty));
    }, [house(REIGNS.slice(0, 4))]);
    await fresh.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await fresh.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await fresh.waitForTimeout(500);
    const visits = await fresh.evaluate(() => {
      const menu = window.__phaserGame.scene.getScene('MenuScene');
      const count = () => {
        const out = [];
        const walk = (o) => { if (o.type === 'Text' && /^NEW$/.test(o.text)) out.push(o.text); if (o.list) o.list.forEach(walk); };
        (menu.pageScroll?.content.list ?? []).forEach(walk);
        return out.length;
      };
      menu.mode = 'dynasty'; menu.render();
      const first = count();
      menu.mode = 'main'; menu.render();
      menu.mode = 'dynasty'; menu.render();
      const second = count();
      return { first, second };
    });
    check('the just-chosen trait is marked NEW on the first visit and not on the second',
      visits.first === 1 && visits.second === 0, `${visits.first} then ${visits.second}`);
    await fresh.close();
  }

  // ── The reign-end sequence, timed, in the rendered run ──
  const ceremony = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const ceremonyErrors = [];
  ceremony.on('pageerror', (e) => ceremonyErrors.push(e.message));
  await ceremony.addInitScript(([dynasty]) => {
    localStorage.clear();
    localStorage.setItem('mandate:language:v1', 'en');
    localStorage.setItem('mandate:dynasty:v1', JSON.stringify(dynasty));
    localStorage.removeItem('mandate:life:v1');
  }, [house(REIGNS.slice(0, 2))]);
  await ceremony.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await ceremony.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await ceremony.evaluate(() => window.__startBenchGame(1337, 'ascent'));
  await ceremony.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await ceremony.waitForTimeout(800);

  const openCeremony = (reduced) => ceremony.evaluate(async (reduced) => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('ConquestScene');
    const ui = game.scene.getScene('ConquestUIScene');
    const { endAscentRun } = await import('/src/systems/ascent/AscentResolver.ts');
    const { setLifeSettings } = await import('/src/game/lifeSettings.ts');
    const { resetCeremonyPour } = await import('/src/scenes/conquest/prompts/run.ts');
    setLifeSettings({ motion: reduced ? 'reduced' : 'full' });
    resetCeremonyPour();
    const state = scene.state;
    state.legacyBanked = false;
    state.pendingAscentPrompt = undefined;
    state.ascent.promptQueue = [];
    state.ascent.wavesSurvived = 30;
    state.ascent.peakPower = 7000;
    state.ascent.ceremonyStage = undefined;
    endAscentRun(state);
    scene.refresh();
    ui.events.emit('state-changed');
    game.step(performance.now(), 16);
    ui.events.emit('ui:ascent-ceremony');
    game.step(performance.now(), 16);
    const seq = ui.data.get('ceremony');
    return { kind: state.pendingAscentPrompt?.kind, hasSeq: Boolean(seq), bar: seq?.bar, reigns: (await import('/src/state/dynasty.ts')).getDynasty().reigns };
  }, reduced);

  const first = await openCeremony(false);
  check('the ceremony opens on the dynasty-level card with a sequence attached', first.kind === 'dynasty-level' && first.hasSeq, `${first.kind}, reign ${first.reigns}`);
  check('the ceremony bar starts below where it ends', Boolean(first.bar) && first.bar.from < first.bar.to,
    first.bar ? `${first.bar.from.toFixed(2)} → ${first.bar.to.toFixed(2)}` : 'no bar');
  await ceremony.waitForTimeout(9600);
  // Read with a guard: a page reloaded under load (the resilience watchdog) has no sequence,
  // and that must fail the checks rather than crash the harness.
  const played = await ceremony.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const seq = ui?.data?.get('ceremony');
    return seq ? { log: seq.log, done: seq.done, cut: seq.cutShort, ticks: seq.ticks, bar: seq.bar } : { log: [], done: false, cut: false, ticks: -1, bar: { from: 0, to: 0 } };
  });
  const beats = played.log.filter((b) => b.name !== 'tick');
  const order = beats.map((b) => b.name).join(',');
  let overlap = false;
  for (let i = 1; i < beats.length; i += 1) if (beats[i].start < beats[i - 1].end - 1) overlap = true;
  check('the beats run in order, one at a time', order === 'count,bank,pour,reign,offers' && !overlap, order);
  check('the whole passage is inside nine seconds and finishes on its own', beats.length > 0 && played.done && !played.cut && Math.max(...beats.map((b) => b.end)) <= 9000,
    beats.length > 0 ? `${Math.round(Math.max(...beats.map((b) => b.end)))} ms` : 'no sequence');
  const crossed = Math.floor(played.bar.to) - Math.floor(played.bar.from);
  check('the level numeral punches exactly once per level crossed', played.ticks === crossed, `${played.ticks} ticks for ${crossed} levels`);

  // Reduced motion: every beat a beat.
  await ceremony.evaluate(async () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('ConquestScene');
    const ui = game.scene.getScene('ConquestUIScene');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    let guard = 0;
    while (scene.state.pendingAscentPrompt?.kind === 'dynasty-level' && guard++ < 10) {
      resolveAscentPrompt(scene.state, scene.state.pendingAscentPrompt.options[0]);
    }
    scene.state.pendingAscentPrompt = undefined;
    ui.events.emit('state-changed');
    game.step(performance.now(), 16);
  });
  const reduced = await openCeremony(true);
  // Generous: the headless clock stretches timers under load; the gate reads planned durations.
  await ceremony.waitForTimeout(2500);
  const reducedLog = await ceremony.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const seq = ui?.data?.get('ceremony');
    return seq ? { log: seq.log, done: seq.done } : { log: [], done: false };
  });
  check('reduced motion plans every beat at 120 ms or less and the passage finishes',
    reduced.kind === 'dynasty-level' && reducedLog.done && reducedLog.log.every((b) => (b.planned ?? (b.end - b.start)) <= 120),
    reducedLog.log.map((b) => `${b.name}:${b.planned ?? Math.round(b.end - b.start)}`).join(' '));

  // The skip, from the second reign: a tap lands on the choice within 300 ms.
  await ceremony.evaluate(async () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('ConquestScene');
    const ui = game.scene.getScene('ConquestUIScene');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    let guard = 0;
    while (scene.state.pendingAscentPrompt?.kind === 'dynasty-level' && guard++ < 10) {
      resolveAscentPrompt(scene.state, scene.state.pendingAscentPrompt.options[0]);
    }
    scene.state.pendingAscentPrompt = undefined;
    ui.events.emit('state-changed');
    game.step(performance.now(), 16);
  });
  const third = await openCeremony(false);
  await ceremony.waitForTimeout(500);
  const box = await ceremony.evaluate(() => {
    const canvas = document.querySelector('canvas').getBoundingClientRect();
    const size = window.__phaserGame.scale.gameSize;
    return { x: canvas.left + canvas.width * 0.5, y: canvas.top + canvas.height * (300 / size.height) };
  });
  await ceremony.mouse.click(box.x, box.y);
  await ceremony.waitForTimeout(300);
  const skipped = await ceremony.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const seq = ui?.data?.get('ceremony');
    const cards = (ui.activeScrollAreas ?? []).reduce((sum, area) => sum + area.content.list.filter((o) => o.getData?.('cardHeight')).length, 0);
    const scrolled = (ui.activeScrollAreas ?? []).flatMap((a) => a.content.list);
    const lastCard = scrolled.filter((o) => o.getData?.('cardHeight')).sort((a, b) => b.y - a.y)[0];
    const hintText = scrolled.find((o) => o.type === 'Text' && /Hold a card|Giữ thẻ/.test(o.text));
    const hintGap = lastCard && hintText ? hintText.y - (lastCard.y + lastCard.getData('cardHeight')) : 999;
    return { hintGap, done: Boolean(seq?.done), cut: Boolean(seq?.cutShort), cards, offersAlpha: (ui.activeScrollAreas ?? []).flatMap((a) => a.content.list.filter((o) => o.getData?.('cardHeight')).map((o) => o.alpha)) };
  });
  check('from the second reign a tap cuts to the choice, cards in place, within 300 ms',
    third.kind === 'dynasty-level' && skipped.done && skipped.cut && skipped.cards >= 2 && skipped.offersAlpha.every((a) => a >= 0.99),
    `${skipped.cards} cards, alpha ${skipped.offersAlpha.join('/')}`);

  check('the hold hint sits within 24 units under the last offer', skipped.hintGap >= 0 && skipped.hintGap <= 24, `${skipped.hintGap} units`);

  // The next-reign page: no placeholder rows.
  const nextReign = await ceremony.evaluate(async () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('ConquestScene');
    const ui = game.scene.getScene('ConquestUIScene');
    let guard = 0;
    while (scene.state.pendingAscentPrompt?.kind === 'dynasty-level' && guard++ < 10) {
      ui.events.emit('ui:ascent-choice', scene.state.pendingAscentPrompt.options[0]);
      game.step(performance.now(), 16);
    }
    if (!scene.state.pendingAscentPrompt) {
      ui.events.emit('ui:ascent-ceremony');
      game.step(performance.now(), 16);
    }
    const texts = [];
    const walk = (o) => { if (o.type === 'Text' && o.text) texts.push(o.text); if (o.list) o.list.forEach(walk); };
    ui.modalLayer.list.forEach(walk);
    return { kind: scene.state.pendingAscentPrompt?.kind, texts };
  });
  check('the next-reign page has no placeholder rows', nextReign.kind === 'next-reign'
    && !nextReign.texts.some((text) => /will fill this|chờ bản sau|Hall of Names|Điện Danh Thần/.test(text))
    && nextReign.texts.some((text) => /champions laid out|bày \d+ người/.test(text)),
    nextReign.texts.slice(0, 6).join(' / '));
  check('the ceremony page raises no error', ceremonyErrors.length === 0, ceremonyErrors.slice(0, 2).join(' | '));
  await ceremony.close();

  // ── The live reign, and the chip's house share, in a run ──
  const run = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const runErrors = [];
  run.on('pageerror', (e) => runErrors.push(e.message));
  await run.addInitScript(() => { localStorage.clear(); localStorage.setItem('mandate:language:v1', 'en'); });
  await run.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await run.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await run.evaluate(() => window.__startBenchGame(4242, 'ascent'));
  await run.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await run.waitForTimeout(800);
  const live = await run.evaluate(async () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('ConquestScene');
    const ui = game.scene.getScene('ConquestUIScene');
    const { readInheritance, noteLiveReign } = await import('/src/systems/ascent/Inheritance.ts');
    const d = await import('/src/state/dynasty.ts');
    const { clearAutosave } = await import('/src/state/save.ts');
    const state = scene.state;
    state.pendingAscentPrompt = undefined;
    state.ascent.promptQueue = [];
    state.ascent.wavesSurvived = 7;
    state.ascent.peakPower = 3000;
    noteLiveReign(state);
    const ledger = readInheritance(state);
    const stored = d.getDynasty().liveReign;
    // The chip, sampled over a minute of the run's own clock while the world moves.
    state.isPaused = false;
    let houseSamples = 0;
    let samples = 0;
    let now = performance.now();
    for (let k = 0; k < 120; k += 1) {
      now += 500;
      game.step(now, 500);
      ui.inheritance?.render(state, 600);
      const topic = ui.inheritance?.current?.()?.topic;
      if (topic) {
        samples += 1;
        if (topic === 'house') houseSamples += 1;
      }
    }
    clearAutosave();
    const cleared = d.getDynasty().liveReign;
    return { stored, ledger: ledger && { score: ledger.score, level: ledger.houseLevelAfter }, houseShare: samples > 0 ? houseSamples / samples : 0, samples, cleared: Boolean(cleared) };
  });
  check('the reign in play is written to the house within 1 XP of the chip\'s projection',
    Boolean(live.stored) && Boolean(live.ledger) && Math.abs(live.stored.score - live.ledger.score) <= 1 && live.stored.levelAfter === live.ledger.level,
    live.stored ? `${live.stored.score} vs ${live.ledger?.score}` : 'nothing stored');
  check('the live segment is cleared when the run is walked out of', !live.cleared);
  check('the shut chip shows the house at least half the time', live.houseShare >= 0.5, `${Math.round(live.houseShare * 100)}% of ${live.samples} samples`);
  check('the run page raises no error', runErrors.length === 0, runErrors.slice(0, 2).join(' | '));
  await run.close();
}


// ── 9. Rank II, the use counters, the compact chip, the reign's record ─────────
console.log('\n=== RANK II AND THE COUNTERS ===');
{
  const rank = await page.evaluate(async () => {
    const d = await import('/src/state/dynasty.ts');
    const traits = await import('/src/data/dynastyTraits.ts');
    const write = (level, held) => {
      let xp = 0;
      for (let l = 1; l <= level; l += 1) xp += d.dynastyXpStep(l);
      localStorage.setItem('mandate:dynasty:v1', JSON.stringify({ xp, traits: held, pendingPicks: 1, reigns: 3, bestScore: 0, respecs: 0, history: [] }));
    };
    const rolls = (n) => { const seen = new Set(); for (let i = 0; i < n; i += 1) for (const id of d.rollTraitOffer()) seen.add(id); return [...seen]; };
    write(8, ['wide-draft', 'quartermaster']);
    const below = rolls(120).filter((id) => traits.findDynastyTrait(id)?.rank === 2);
    write(9, ['wide-draft', 'quartermaster']);
    const above = rolls(120).filter((id) => traits.findDynastyTrait(id)?.rank === 2).sort();
    write(9, []);
    const noBase = rolls(120).filter((id) => traits.findDynastyTrait(id)?.rank === 2);
    write(9, ['wide-draft']);
    const refused = d.chooseTrait('quartermaster-2');
    const taken = d.chooseTrait('wide-draft-2');
    // The counters: a held trait counts, an un-held one does not.
    d.noteTraitUse('wide-draft');
    d.noteTraitUse('wide-draft');
    d.noteTraitUse('old-roads');
    const uses = { wide: d.traitUses('wide-draft'), old: d.traitUses('old-roads') };
    const slots = (await import('/src/state/cabinet.ts')).openingHandSlots();
    localStorage.removeItem('mandate:dynasty:v1');
    return { below, above, noBase, refused, taken, uses, slots };
  });
  check('Rank II is never dealt below level 9', rank.below.length === 0, rank.below.join(','));
  check('at level 9 the Rank II step of each held base is on the table, and only those', rank.above.join(',') === 'quartermaster-2,wide-draft-2', rank.above.join(','));
  check('Rank II without its base is never dealt', rank.noBase.length === 0, rank.noBase.join(','));
  check('a Rank II pick is refused without its base and taken with it', rank.refused === false && rank.taken === true);
  check('use counters count a held trait and ignore an un-held one', rank.uses.wide === 2 && rank.uses.old === 0, JSON.stringify(rank.uses));

  // The record a reign leaves: its founder, its deck, its chronicle.
  const record = await page.evaluate(async () => {
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { endAscentRun } = await import('/src/systems/ascent/AscentResolver.ts');
    const d = await import('/src/state/dynasty.ts');
    localStorage.removeItem('mandate:dynasty:v1');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const founding = state.pendingAscentPrompt?.kind === 'founder' ? state.pendingAscentPrompt : state.ascent.promptQueue.find((p) => p.kind === 'founder');
    if (founding) { state.pendingAscentPrompt = founding; resolveAscentPrompt(state, founding.options[0]); }
    state.pendingAscentPrompt = undefined;
    state.ascent.promptQueue = [];
    state.ascent.wavesSurvived = 12;
    state.ascent.peakPower = 4000;
    state.ascent.cardStacks['iron-levy'] = 2;
    endAscentRun(state);
    const last = d.getDynasty().history.slice(-1)[0];
    localStorage.removeItem('mandate:dynasty:v1');
    return { founder: last?.founder, cards: last?.cards, chronicle: last?.chronicle === undefined || Array.isArray(last?.chronicle) };
  });
  check('a banked reign records its founder, its deck and a chronicle',
    Boolean(record.founder?.name) && Array.isArray(record.cards) && record.cards.includes('iron-levy') && record.chronicle,
    `founder ${record.founder?.name ?? '-'}, cards ${(record.cards ?? []).join(',')}`);

  // The chip: a seal-sized pill shut, the full sheet open, and the opening is a motion.
  const chipPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const chipErrors = [];
  chipPage.on('pageerror', (e) => chipErrors.push(e.message));
  await chipPage.addInitScript(() => { localStorage.clear(); localStorage.setItem('mandate:language:v1', 'vi'); });
  await chipPage.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await chipPage.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await chipPage.evaluate(() => window.__startBenchGame(1337, 'ascent'));
  await chipPage.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await chipPage.waitForTimeout(900);
  await chipPage.evaluate(async () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('ConquestScene');
    const ui = game.scene.getScene('ConquestUIScene');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    let guard = 0;
    while (scene.state.pendingAscentPrompt && guard++ < 6) {
      const p = scene.state.pendingAscentPrompt;
      const first = p.options?.[0];
      if (!resolveAscentPrompt(scene.state, typeof first === 'string' ? first : (first?.id ?? 'ok'))) scene.state.pendingAscentPrompt = undefined;
    }
    scene.state.ascent.promptQueue = [];
    scene.refresh();
    ui.events.emit('state-changed');
    game.step(performance.now(), 16);
    game.step(performance.now() + 16, 16);
  });
  await chipPage.waitForTimeout(300);
  const chip = await chipPage.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const shut = ui.inheritance.tapBounds()[0];
    ui.inheritance.hit.emit('pointerup', { x: 0, y: 0 }, 0, 0, { stopPropagation() {} });
    const open = ui.inheritance.tapBounds()[0];
    const alphas = ui.inheritance.sheet.filter((o) => o.type === 'Text').map((o) => o.alpha);
    return { shut, open, alphas, rows: alphas.length };
  });
  await chipPage.waitForTimeout(700);
  const settled = await chipPage.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    return ui.inheritance.sheet.filter((o) => o.type === 'Text').map((o) => o.alpha);
  });
  check('the shut chip is a seal-sized pill (width ≤ 160, sized to its number, one line)', Boolean(chip.shut) && chip.shut.width <= 160 && chip.shut.height <= 26, chip.shut ? `${chip.shut.width}×${chip.shut.height}` : 'no chip');
  check('a tap opens the full sheet, wider and taller', Boolean(chip.open) && chip.open.width >= 250 && chip.open.height > 120, chip.open ? `${chip.open.width}×${chip.open.height}` : 'no sheet');
  check('the sheet rises in rather than appearing: rows start faded and settle to full ink',
    chip.rows > 6 && chip.alphas.every((a) => a < 1) && settled.every((a) => a >= 0.99), `${chip.rows} rows, first ${chip.alphas.slice(0, 3).map((a) => a.toFixed(2)).join('/')} → ${settled.slice(0, 3).join('/')}`);
  check('the chip page raises no error', chipErrors.length === 0, chipErrors.slice(0, 2).join(' | '));
  await chipPage.close();
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the ledger banks, the ceremony walks, and every trait is read where it says it is'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
