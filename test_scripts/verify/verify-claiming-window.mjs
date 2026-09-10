/**
 * A province being taken is out of your hands, and can be won back.
 *
 * Reported: *"after the enemy wins the battle the land is claiming, but it can still be attacked
 * if another army planned to attack it — and it is a blank fight because the land is occupied"*,
 * and against the seat: *"I lost a fight but other fights still happen, and it still asks me to
 * rebuild"*.
 *
 * All of it is one gap. Winning a fight does not take a province: the winner walks on and lays a
 * `SiegeOrder`, and the flag turns 2-6 seasons later in `progressSiegeOrders`. For that whole
 * window `land.ownerId` is still the player's, so every guard that asks "is this still ours?" said
 * yes about ground already lost — the rebuild card, the build sheet, the income, the enemy's
 * target list, and the teardown that should have ended the other fights standing on it.
 *
 * `hostileClaimAt` names the window. This checks what the name is worth: the province yields a
 * quarter, takes no orders, raises no militia for either side, draws no fresh fight of its own —
 * and gives back a real fight to whoever marches an army onto it.
 *
 *   node test_scripts/verify/verify-claiming-window.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
console.log(`=== verify-claiming-window — ${URL} ===`);

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const { hostileClaimAt, provinceIsFalling } = await import('/src/systems/LandSystem.ts');
  const { getBuildOptions, getUpgradeOptions, setLandSpecialization, refreshAllLandOutputs } = await import('/src/systems/ResourceSystem.ts');
  const { assignHeroToLand } = await import('/src/systems/CourtSystem.ts');
  const { openFieldAt, reconcileFronts } = await import('/src/systems/ascent/BattleSystem.ts');
  const { chargeProvinceForDefence } = await import('/src/systems/ascent/RestoreSystem.ts');
  const PLAYER = 'dai-viet';

  const boot = (seed) => {
    let s = seed >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const drain = () => {
      let g = 0;
      while (st.pendingAscentPrompt && g++ < 40) {
        const p = st.pendingAscentPrompt;
        if (p.kind === 'run-over') break;
        const id = p.kind === 'coronation' ? 'crowned'
          : p.kind === 'founder' ? p.options[0]
          : p.kind === 'power-draft' ? (p.cards?.[0] ?? 'skip')
          : p.kind === 'hero-choice' ? (p.heroIds?.[0] ?? 'pass')
          : p.kind === 'conquer-target' ? (p.targets?.[0]?.landId ?? 'hold')
          : (p.options?.[0]?.id ?? p.options?.[0] ?? 'ok');
        if (!resolveAscentPrompt(st, String(id))) st.pendingAscentPrompt = undefined;
      }
    };
    drain();
    return { st, drain };
  };

  /** Runs a seeded game until a hostile claim stands on ground still flagged ours. */
  const untilClaim = (seed, ticks = 400) => {
    const { st, drain } = boot(seed);
    for (let tick = 1; tick <= ticks; tick += 1) {
      advanceAscentTick(st); drain();
      if (st.isDefeated || st.pendingAscentPrompt?.kind === 'run-over') break;
      const land = st.lands.find((l) => provinceIsFalling(st, l.id));
      if (land) return { st, drain, land, tick };
    }
    return { st, drain, land: undefined };
  };

  const host = (id, landId, n) => ({
    id, kingdomId: PLAYER, name: 'Probe', landId,
    units: { spearmen: n, archers: Math.round(n / 3), heavyInfantry: Math.round(n / 5) },
    morale: 85, supply: 80, rations: 999, provisions: 999,
    level: 2, experience: 0, experienceToNextLevel: 200,
  });

  const r = {};

  // ── the window exists, and a neighbour of ours is the control ─────────────
  const A = untilClaim(4242);
  if (!A.land) return { staged: false };
  r.staged = true;
  r.landId = A.land.id;
  r.stillOurs = A.land.ownerId === PLAYER;
  const control = A.st.lands.find((l) => l.ownerId === PLAYER && !provinceIsFalling(A.st, l.id));
  r.hasControl = Boolean(control);

  // ── it yields a quarter, and the control is untouched ─────────────────────
  //
  // Measured by laying a claim on a province that actually produces something, rather than on
  // whichever one the run happened to lose: the ground a wave takes first is often a poor frontier
  // district whose gross is 0, and a ratio out of nothing proves nothing.
  const sum = (o) => o.gold + o.food + o.supplies;
  refreshAllLandOutputs(A.st);
  const rich = A.st.lands
    .filter((l) => l.ownerId === PLAYER && !provinceIsFalling(A.st, l.id))
    .sort((a, b) => sum(b.outputs) - sum(a.outputs))[0];
  const other = A.st.lands.find((l) => l.ownerId === PLAYER && l !== rich && !provinceIsFalling(A.st, l.id));
  const otherBefore = other ? sum(other.outputs) : null;
  const full = rich ? sum(rich.outputs) : 0;
  if (rich) {
    A.st.siegeOrders.push({
      landId: rich.id, armyId: 'claim-probe', attackerKingdomId: 'eastern-rival',
      fromLandId: rich.id, progress: 0, required: 4, presentAtClaim: [], openedTurn: A.st.turn,
    });
    refreshAllLandOutputs(A.st);
  }
  r.yieldFull = full;
  r.yieldShare = full > 0 ? sum(rich.outputs) / full : null;
  r.controlUnchanged = !other || sum(other.outputs) === otherBefore;
  // Put it back: everything after this is about the province the run actually lost.
  A.st.siegeOrders = A.st.siegeOrders.filter((o) => o.armyId !== 'claim-probe');
  refreshAllLandOutputs(A.st);

  // ── no orders on it, and every one of them still works on the control ─────
  r.buildRefused = getBuildOptions(A.st, A.land).every((o) => !o.canBuild);
  r.upgradeRefused = getUpgradeOptions(A.st, A.land).every((o) => !o.canUpgrade);
  r.focusRefused = setLandSpecialization(A.st, A.land.id, 'garrison') === false;
  const free = A.st.heroes.find((h) => h.id !== 'king' && !h.assignedTo);
  r.governorRefused = free ? assignHeroToLand(A.st, free.id, A.land.id) === false : null;
  // The control is asked the sharper question: not "can it build" (a broke realm cannot build
  // anywhere, which would pass this check for the wrong reason) but "is it refused for *this*
  // reason". The falling province's blocker text is read off itself, so the two cannot drift.
  const busy = getBuildOptions(A.st, A.land)[0]?.reason;
  r.busyReason = busy ?? null;
  r.controlNotBusy = control ? getBuildOptions(A.st, control).every((o) => o.reason !== busy) : null;
  r.controlFocusable = control ? setLandSpecialization(A.st, control.id, 'garrison') === true : null;

  // ── no rebuild card, and the run is not left paused behind one ────────────
  A.land.wallsBreached = 40;
  A.land.restoreAskedWave = undefined;
  chargeProvinceForDefence(A.st, A.land, 0.5, 200);
  drainAscentPrompts(A.st);
  r.noRestoreQueued = !(A.st.ascent.promptQueue ?? []).some((p) => p.kind === 'restore-land' && p.landId === A.land.id);
  r.noRestoreShown = A.st.pendingAscentPrompt?.kind !== 'restore-land';
  r.notWedged = A.st.pendingAscentPrompt !== undefined || A.st.isPaused === false;

  // ── the province turns nobody out, and no field can open on it alone ──────
  r.noLevy = !A.st.armies.some((a) => a.isLevy && a.landId === A.land.id);
  A.st.armies = A.st.armies.filter((a) => !(a.kingdomId === PLAYER && a.landId === A.land.id));
  r.noBlankField = openFieldAt(A.st, A.land.id) === false;

  // ── a fight that is not a retake is torn down; a retake is not ────────────
  const B = untilClaim(1337);
  if (B.land) {
    const probe = (key, retake) => ({
      landId: B.land.id, landName: B.land.name, role: 'defence', over: false, retake,
      round: 1, totalRounds: 8, ourStart: 100, theirStart: 100, ourNow: 100, theirNow: 100,
      outcome: 'fighting', key, ourArmyIds: [], theirArmyIds: [], kingdomName: 'probe',
    });
    B.st.ascent.sideBattles = [...(B.st.ascent.sideBattles ?? []),
      probe('probe:stale', false), probe('probe:retake', true)];
    reconcileFronts(B.st);
    const keys = [B.st.ascent.activeBattle, ...(B.st.ascent.sideBattles ?? [])]
      .filter((b) => b && !b.over).map((b) => b.key);
    r.staleFightEnded = !keys.includes('probe:stale');
    r.retakeKept = keys.includes('probe:retake');
  }

  // ── an army sent there gets a real fight, and winning it lifts the claim ──
  const C = untilClaim(99);
  if (C.land) {
    C.st.armies = C.st.armies.filter((a) => !(a.kingdomId === PLAYER && a.landId === C.land.id));
    C.st.armies.push(host('retake-probe', C.land.id, 1200));
    r.retakeOpens = openFieldAt(C.st, C.land.id);
    const field = [C.st.ascent.activeBattle, ...(C.st.ascent.sideBattles ?? [])]
      .filter((b) => b && !b.over).find((b) => b.landId === C.land.id);
    r.retakeFlagged = field?.retake === true;
    // Army against army: the walls and the militia are on neither side of the line, so our
    // opening headcount is exactly the host that marched in.
    r.retakeOurStart = field?.ourStart ?? null;
    r.retakeExpected = 1200 + 400 + 240;
    const order = hostileClaimAt(C.st, C.land.id);
    const besieger = C.st.armies.find((a) => a.id === order?.armyId);
    if (besieger) besieger.units = { spearmen: 0, archers: 0, heavyInfantry: 0 };
    advanceAscentTick(C.st); C.drain();
    r.claimLifted = hostileClaimAt(C.st, C.land.id) === undefined;
    r.landStillOurs = C.st.lands.find((l) => l.id === C.land.id)?.ownerId === PLAYER;
  }

  // ── run-wide: one clock per province, never two, never both kinds ─────────
  let bothClocks = 0; let doubled = 0;
  for (const seed of [1337, 4242, 99, 779]) {
    const { st, drain } = boot(seed);
    for (let tick = 1; tick <= 300; tick += 1) {
      advanceAscentTick(st); drain();
      if (st.isDefeated || st.pendingAscentPrompt?.kind === 'run-over') break;
      const byLand = new Map();
      for (const o of st.siegeOrders) byLand.set(o.landId, (byLand.get(o.landId) ?? 0) + 1);
      for (const [id, n] of byLand) {
        if (n > 1) doubled += 1;
        if (st.lands.find((l) => l.id === id)?.siege) bothClocks += 1;
      }
    }
  }
  r.bothClocks = bothClocks;
  r.doubled = doubled;
  return r;
});

if (!out.staged) {
  check('a hostile claim was reached', false, 'no claim on player ground in 400 ticks');
} else {
  console.log(`  staged on ${out.landId} (full yield ${out.yieldFull})`);
  check('the province being taken is still ours on the map', out.stillOurs);
  check('it yields about a quarter while the claim runs',
    out.yieldShare !== null && out.yieldShare > 0.15 && out.yieldShare < 0.36,
    `${Math.round((out.yieldShare ?? 0) * 100)}% of full`);
  check('a province not being taken is untouched', out.controlUnchanged);
  check('nothing can be built or upgraded on it', out.buildRefused && out.upgradeRefused);
  check('it takes no focus and no governor', out.focusRefused && out.governorRefused !== false);
  check('the control province is not refused for the same reason',
    out.controlNotBusy === true && out.controlFocusable === true, out.busyReason ?? '');
  check('no rebuild card is raised for it', out.noRestoreQueued && out.noRestoreShown);
  check('and the run is not left paused behind one', out.notWedged);
  check('the province raises no militia of its own', out.noLevy);
  check('and no field opens on it with nobody of ours there', out.noBlankField);
  check('a fight left standing on it is torn down', out.staleFightEnded === true);
  check('but a retake is not torn down with it', out.retakeKept === true);
  check('an army sent there opens a real field',
    out.retakeOpens === true && out.retakeFlagged === true);
  check('and fights it army-against-army, with no walls on the line',
    out.retakeOurStart === out.retakeExpected, `${out.retakeOurStart} of ${out.retakeExpected}`);
  check('beating the occupier lifts the claim', out.claimLifted === true);
  check('and the province is still ours afterwards', out.landStillOurs === true);
  check('no province ever carries two claims', out.doubled === 0, `${out.doubled} ticks`);
  check('nor a claim and a wall clock at once', out.bothClocks === 0, `${out.bothClocks} ticks`);
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: a province being taken is out of your hands, and can be won back'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
