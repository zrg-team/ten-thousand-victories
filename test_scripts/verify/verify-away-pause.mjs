/**
 * Leaving the screen is not a move.
 *
 * A message arrives mid-fight, the player answers it, and comes back. Two things have to be
 * true of that half minute, and neither was before this gate existed:
 *
 *   · **Nothing happened.** The world clock, the wave, the fight and the realm's holdings are
 *     exactly where they were left. The browser halts `requestAnimationFrame` on a hidden tab
 *     and so does most of this for free — which is precisely why it has to be tested with the
 *     loop still running. Every check here fakes `document.hidden` and dispatches the event
 *     while Chromium goes on painting, so what is measured is the game's own halt and never
 *     the browser's.
 *   · **It was written down.** A backgrounded tab is what a phone reclaims memory from, and it
 *     is killed without running another line. The run must be in the automatic slot, the
 *     player's own save must be untouched by it, and the menu's Continue must bring it back.
 *
 * Usage: node test_scripts/verify/verify-away-pause.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const SEED = 88881;
/** What the review asked for: half a minute away, in a fight. */
const AWAY_MS = 30000;

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text().slice(0, 160)}`); });
await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));

// The page never really goes to the background under Playwright, so `document.hidden` is faked
// and the event dispatched by hand. That is the strict version of the test: the game must halt
// itself while the loop it runs on carries on turning.
await page.addInitScript(() => {
  let hidden = false;
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible'), configurable: true });
  // `installAwayPause` asks the world rather than the event, and `hasFocus` is the other half of
  // that question — a window that has lost focus while still visible is also nobody watching.
  const realHasFocus = document.hasFocus.bind(document);
  document.hasFocus = () => (hidden ? false : realHasFocus());
  window.__setHidden = (value) => {
    hidden = value;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event(value ? 'blur' : 'focus'));
  };
});

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 40000 });
await page.evaluate((seed) => window.__startBenchGame(seed, 'ascent'), SEED);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 40000 });

await page.evaluate(async () => {
  const RES = await import('/src/systems/ascent/AscentResolver.ts');
  const st = window.__mandateState;
  const first = (p) => {
    switch (p.kind) {
      case 'founder': case 'mandate': case 'doctrine': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return 'hold';
      case 'conquer-method': return 'back';
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options.filter((o) => !o.blockedReason)[0]?.id;
      case 'muster-proposal': return 'accept';
      case 'decree-offer': return 'decline';
      default: return (p.options ?? []).filter((o) => o.affordable !== false)[0]?.id ?? 'ok';
    }
  };
  // Answering is all this does. The run is left to its own scene clock from here, because what
  // is being measured is that clock stopping — a harness that drives ticks by hand would prove
  // nothing about it.
  window.__answerOpen = () => {
    let answered = 0;
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 12) {
      if (st.pendingAscentPrompt.kind === 'run-over') break;
      if (!RES.resolveAscentPrompt(st, first(st.pendingAscentPrompt))) st.pendingAscentPrompt = undefined;
      answered += 1;
    }
    window.__phaserGame.scene.getScene('ConquestScene')?.refresh?.();
    return answered;
  };
});

/**
 * A moment with the world actually turning.
 *
 * Every card the run raises stops the clock on purpose, so a check that started on one would
 * pass by accident: nothing moves while a modal is up whether this feature exists or not.
 */
const settle = async (label) => {
  for (let i = 0; i < 40; i += 1) {
    await page.evaluate(() => window.__answerOpen());
    await page.waitForTimeout(400);
    const a = await page.evaluate(() => window.__mandateState?.realtimeSeconds ?? 0);
    await page.waitForTimeout(900);
    const b = await page.evaluate(() => window.__mandateState?.realtimeSeconds ?? 0);
    if (b > a) return true;
  }
  const why = await page.evaluate(() => {
    const st = window.__mandateState;
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    return { prompt: st?.pendingAscentPrompt?.kind ?? null, paused: st?.isPaused,
      strategy: st?.isStrategyPause, away: st?.isAwayPause, defeated: st?.isDefeated,
      lane: ui?.openPromptKey ?? null };
  });
  console.log(`(could not find a running moment for: ${label} — ${JSON.stringify(why)})`);
  return false;
};
await settle('setup');

// ── A fight the player is winning ────────────────────────────────────────────────────────────
// The review's case is precisely this one: a fight is on, the player looks away, and it must
// still be theirs when they look back. Waves arrive on their own eventually; staging one puts
// the gate on the case it exists for instead of on whichever season the clock happened to reach.
const staged = await page.evaluate(async () => {
  const B = await import('/src/systems/ascent/BattleSystem.ts');
  const st = window.__mandateState;
  const capital = st.lands.find((land) => land.id === st.ascent.capitalLandId)
    ?? st.lands.find((land) => land.ownerId === 'dai-viet');
  if (!capital) return { opened: false, why: 'no capital' };
  const host = (id, kingdomId, landId, men) => ({
    id, kingdomId, name: id, landId,
    units: { spearmen: Math.round(men * 0.6), archers: Math.round(men * 0.25), heavyInfantry: Math.round(men * 0.15) },
    morale: 85, supply: 85, rations: 400, provisions: 300,
    level: 1, experience: 0, experienceToNextLevel: 100,
  });
  st.armies = st.armies.filter((army) => army.kingdomId !== 'dai-viet' && !army.isLevy);
  st.movementOrders = []; st.siegeOrders = []; st.acquisitionOrders = [];
  // Ours is the stronger line, so the half minute away is a fight being won — the thing an
  // interruption must not be allowed to lose.
  st.armies.push(host('away-defender', 'dai-viet', capital.id, 1800));
  st.armies.push(host('away-invader', 'northern-rival', capital.id, 900));
  st.ascent.activeBattle = undefined;
  st.pendingBattle = {
    invaderArmyId: 'away-invader', landId: capital.id, landName: capital.name,
    kingdomId: 'northern-rival', kingdomName: 'Lab', isGreat: false,
    attackerPower: 0, defenderPower: 0,
  };
  const opened = B.beginBattle(st);
  window.__phaserGame.scene.getScene('ConquestScene')?.refresh?.();
  return { opened, land: capital.name, live: Boolean(st.ascent.activeBattle) };
});
console.log(`  staged fight: ${JSON.stringify(staged)}`);
// Opening a fight halts the world by design — it is a decision waiting to be made. Let it run
// again, or the checks below would be measuring the battle's own pause and not this feature.
await settle('the staged fight');

/** Everything an interruption must not be allowed to move. */
const world = () => page.evaluate(() => {
  const st = window.__mandateState;
  const a = st.ascent ?? {};
  const b = a.activeBattle;
  return {
    seconds: +(st.realtimeSeconds ?? 0).toFixed(2),
    turn: st.turn,
    wave: a.wave,
    lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
    men: st.armies.filter((l) => l.kingdomId === 'dai-viet')
      .reduce((n, x) => n + x.units.spearmen + x.units.archers + x.units.heavyInfantry, 0),
    inBattle: Boolean(b),
    round: b?.round ?? null,
    ourLost: b?.ourLostTotal ?? null,
    advance: b ? `${(b.ourAdvance ?? 0).toFixed(3)}/${(b.theirAdvance ?? 0).toFixed(3)}` : null,
    broken: b?.brokenHostIds?.length ?? null,
    defeated: st.isDefeated,
    away: Boolean(st.isAwayPause),
  };
});

const moved = (a, b) => a.seconds !== b.seconds || a.turn !== b.turn;
const sameFight = (a, b) => a.round === b.round && a.ourLost === b.ourLost
  && a.advance === b.advance && a.broken === b.broken;

// ── Control: with the player watching, the world does move ───────────────────────────────────
const beforeWatching = await world();
await page.waitForTimeout(4000);
const afterWatching = await world();
check('the world moves while the player is watching', moved(beforeWatching, afterWatching),
  `+${(afterWatching.seconds - beforeWatching.seconds).toFixed(1)}s, turn ${beforeWatching.turn} -> ${afterWatching.turn}`);

// ── Away for half a minute, with the loop still running ──────────────────────────────────────
await settle('the away window');
const beforeAway = await world();
await page.evaluate(() => window.__setHidden(true));
await page.waitForTimeout(400);
const paused = await world();
check('leaving the screen halts the run', paused.away === true, `isAwayPause=${paused.away}`);

// The baseline is read *after* the pause is set, not before it. The frame between asking the
// page to hide and the handler running is a real frame and it is allowed to land; what this
// gate is about is the half minute after that, which must contain nothing at all.
await page.waitForTimeout(AWAY_MS);
const afterAway = await world();
check(`${AWAY_MS / 1000}s away moves nothing`,
  !moved(paused, afterAway) && afterAway.lands === paused.lands
    && afterAway.men === paused.men && afterAway.wave === paused.wave
    && !afterAway.defeated,
  `clock ${paused.seconds} -> ${afterAway.seconds}, turn ${paused.turn} -> ${afterAway.turn}, `
    + `lands ${paused.lands} -> ${afterAway.lands}, men ${paused.men} -> ${afterAway.men}`);
check('a fight is exactly where it was left',
  paused.inBattle ? sameFight(paused, afterAway) && afterAway.inBattle : true,
  paused.inBattle
    ? `round ${paused.round} -> ${afterAway.round}, our losses ${paused.ourLost} -> ${afterAway.ourLost}, `
      + `lines ${paused.advance} -> ${afterAway.advance}, broken ${paused.broken} -> ${afterAway.broken}`
    : `no fight was live at turn ${paused.turn} on this seed — the world checks above carry it`);

// ── The run was written down, and the player's own save was not touched ──────────────────────
const slots = await page.evaluate(() => {
  const read = (key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { savedAt: parsed.savedAt, turn: parsed.state?.turn, mode: parsed.state?.gameMode,
      away: parsed.state?.isAwayPause ?? null };
  };
  return { auto: read('mandate:autosave:v1'), manual: read('mandate:snapshot:v1') };
});
check('the run is in the automatic slot', Boolean(slots.auto) && slots.auto.mode === 'ascent',
  slots.auto ? `turn ${slots.auto.turn}, saved ${slots.auto.savedAt}` : 'nothing written');
check("the player's own save slot is untouched", slots.manual === null,
  slots.manual ? `overwritten: turn ${slots.manual.turn}` : 'empty, as it was');
check('the stored run does not carry the away pause', slots.auto?.away !== true,
  `isAwayPause=${slots.auto?.away}`);

// ── Coming back starts the world again ───────────────────────────────────────────────────────
await page.evaluate(() => window.__setHidden(false));
await page.waitForTimeout(600);
const lifted = await world();
// Coming back does not mean the run is *running*: a card may have been waiting when the player
// left, and answering it is theirs to do. The pause this feature owns must be gone, and the
// world must turn again once whatever is on screen has been dealt with.
await settle('coming back');
const back = await world();
check('coming back starts the world again',
  lifted.away === false && moved(afterAway, back),
  `isAwayPause=${lifted.away}, +${(back.seconds - afterAway.seconds).toFixed(1)}s, `
    + `turn ${afterAway.turn} -> ${back.turn}`);

// ── The device took the run: a fresh page, and Continue brings it back ───────────────────────
// Away once more, so the stored run is the one the player was actually looking at. This is the
// moment a phone reclaims the tab: the game gets no further code, and everything after this
// point has to come out of what was written here.
await page.evaluate(() => window.__setHidden(true));
await page.waitForTimeout(600);
const killedAt = await world();
const fresh = await context.newPage();
fresh.on('pageerror', (e) => errors.push(`PAGEERROR(resume) ${e.message}`));
await fresh.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await fresh.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 40000 });
await fresh.waitForTimeout(1200);
// The run the device took has exactly one door, and it is this sheet — not the Continue line,
// which is the player's own save and here has never been written. So the button is found by the
// tag the sheet stamps on it rather than by scraping the page for the word.
const pressed = await fresh.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const button = scene.modalObjects?.find((o) => o.getData?.('resumeOffer') === 'continue');
  if (!button) return null;
  const box = button.getData('visualBounds');
  return { x: button.x + box.width / 2, y: button.y + box.height / 2 };
});
check('the menu offers the taken run in a sheet', Boolean(pressed),
  pressed ? `at ${Math.round(pressed.x)},${Math.round(pressed.y)}` : 'no resume sheet found');
// And it is offered nowhere else: a snapshot on the Continue line is a run the player never
// saved being handed back to them as though they had.
const onLine = await fresh.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const walk = (list) => (list ?? []).some((o) => o.getData?.('menuLink') === 'continue' || walk(o.list));
  return walk(scene.children.list);
});
check('the taken run is not put on the Continue line', onLine === false);
if (pressed) {
  await fresh.mouse.click(pressed.x, pressed.y);
  await fresh.waitForTimeout(3000);
}
const resumed = await fresh.evaluate(() => {
  const st = window.__mandateState;
  return st ? { turn: st.turn, mode: st.gameMode, away: Boolean(st.isAwayPause),
    scene: window.__phaserGame.scene.isActive('ConquestScene') } : null;
});
check('Continue resumes the interrupted run at the moment it was taken',
  Boolean(resumed) && resumed.scene && resumed.mode === 'ascent' && resumed.turn === killedAt.turn,
  resumed ? `turn ${resumed.turn} (left at ${killedAt.turn}), conquest scene ${resumed.scene}` : 'no state');
check('the resumed run is not stuck in the away pause', resumed?.away === false, `isAwayPause=${resumed?.away}`);

check('no browser errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

await browser.close();
const passed = checks.filter((c) => c.pass).length;
console.log(`\n${passed}/${checks.length} away-pause checks passed`);
if (passed !== checks.length) process.exitCode = 1;
