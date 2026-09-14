/**
 * A free hero can always be posted, and a post can always be given to somebody else.
 *
 * Reported (2026-09-14, Beta): *"cannot select a hero to assign to a kingdom"* — every row of the
 * resident-diplomacy picker read "Cần sẵn sàng ở nhà" for a hero whose own page said "Chờ bổ nhiệm".
 *
 * The gate asked for more than it said: home duty *and* standing in `homeProvince()` right now.
 * A displaced governor stays in the province they governed, a traveller whose post was taken
 * waits where they are, a refuge arrival stays in the refuge, and the seat itself moves when the
 * capital is besieged — and nothing ever walked any of them back. "Free" now means free wherever
 * the hero stands, as long as an owned road joins them to the seat; the journey is priced from
 * where they are. The same hidden gate blocked retraining and leading a new muster.
 *
 * Also here: replacing a sitting minister in Beta failed silently (`occupied`), and the result
 * was thrown away by the scene. A holder is now relieved when the successor arrives.
 *
 *   node test_scripts/verify/verify-hero-postings.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${URL}/?capture=1`);
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
console.log(`=== verify-hero-postings — ${URL} ===`);

const results = await page.evaluate(async () => {
  const { newAscentRun } = await import('/src/state/ascentRun.ts');
  const { generateHero } = await import('/src/data/heroFactory.ts');
  const { PLAYER_KINGDOM_ID: PLAYER } = await import('/src/game/constants.ts');
  const service = await import('/src/systems/heroes/HeroService.ts');
  const { applyAppointment, applyAppointmentResult } = await import('/src/systems/ascent/CourtLaneSystem.ts');
  const { buildHeroPickerRows } = await import('/src/ui/heroPickerRows.ts');
  const { heroName } = await import('/src/i18n/index.ts');
  const out = [];
  const check = (name, pass, detail = '') => out.push({ name, pass: Boolean(pass), detail: String(detail) });

  const make = (ruleset = 'beta') => {
    const s = newAscentRun({ ruleset });
    s.pendingAscentPrompt = undefined; s.ascent.promptQueue = []; s.invasions = [];
    return s;
  };
  let seed = 300;
  const recruit = (s) => { const h = generateHero(seed++); s.heroes.push(h); service.initializeRecruitedHero(s, h); return h; };
  /** The seat, and a chain of two owned provinces walking away from it. */
  const realm = (s) => {
    const seat = s.lands.find((l) => l.id === s.ascent.capitalLandId);
    const near = s.lands.find((l) => seat.neighbors.includes(l.id));
    near.ownerId = PLAYER;
    const far = s.lands.find((l) => near.neighbors.includes(l.id) && l.id !== seat.id && !seat.neighbors.includes(l.id));
    far.ownerId = PLAYER;
    return { seat, near, far };
  };
  const court = (s) => {
    const k = s.kingdoms.find((c) => c.id !== PLAYER && !c.isDefeated);
    k.relations = 80;
    return k;
  };

  // ── 1. a governor relieved in a far province can still be sent abroad ──────
  {
    const s = make(); const { seat, far } = realm(s); const k = court(s);
    const old = recruit(s), next = recruit(s);
    service.commitHeroAssignment(s, old, { kind: 'province', landId: far.id });
    service.commitHeroAssignment(s, next, { kind: 'province', landId: far.id }); // displaces `old` at far
    check('displaced governor is on home duty, standing where they governed',
      old.life.kind === 'active' && old.life.assignment.kind === 'home' && old.life.locationId === far.id, old.life.locationId);
    check('and the reason that blocked them is gone', service.residentEntryReason(s, old, k.id) === undefined,
      service.residentEntryReason(s, old, k.id));
    const quote = service.residentQuote(s, old.id, k.id);
    const route = service.heroOwnedRoute(s, far.id, seat.id);
    check('the journey is priced from where they stand', quote.ok && quote.from === far.id
      && quote.turns === 2 + Math.ceil(route.length / 2), JSON.stringify(quote));
    const at = s.turn;
    check('posting them succeeds', service.postResident(s, old.id, k.id).ok);
    check('arrival is travel + audience from there', old.life.kind === 'transit' && old.life.arrivalTurn === at + quote.turns
      && old.life.originId === far.id, JSON.stringify(old.life));
  }

  // ── 1b. retraining and leading a muster from away ────────────────────────
  {
    const s = make(); const { far } = realm(s);
    const h = recruit(s), other = recruit(s);
    h.growth.xp = 16; service.chooseHeroPerk(s, h.id, 'granary');
    service.commitHeroAssignment(s, h, { kind: 'province', landId: far.id });
    service.commitHeroAssignment(s, other, { kind: 'province', landId: far.id });
    check('retraining is open away from the seat', service.respecializeHero(s, h.id).ok, h.life.kind);
    check('and the hero recovers where they stand', h.life.kind === 'recovering' && h.life.locationId === far.id, h.life.locationId);
  }

  // ── 1c. the capital besieged, and the capital moved ───────────────────────
  {
    const s = make(); const { seat, near } = realm(s); const k = court(s);
    const h = recruit(s);
    check('a hero at the seat is free', service.residentEntryReason(s, h, k.id) === undefined);
    s.siegeOrders.push({ landId: seat.id, armyId: 'x', attackerKingdomId: k.id, fromLandId: seat.id, progress: 0, required: 6 });
    check('a siege on the seat does not strand the hero standing in it', service.residentEntryReason(s, h, k.id) !== 'home',
      service.residentEntryReason(s, h, k.id));
    s.siegeOrders = [];
    s.ascent.capitalLandId = near.id;
    check('nor does moving the capital', service.residentEntryReason(s, h, k.id) === undefined, service.residentEntryReason(s, h, k.id));
  }

  // ── 2. cut off: a home hero on land that is no longer ours walks home ─────
  {
    const s = make(); const { far, near } = realm(s);
    const h = recruit(s), other = recruit(s);
    service.commitHeroAssignment(s, h, { kind: 'province', landId: far.id });
    service.commitHeroAssignment(s, other, { kind: 'province', landId: far.id });
    near.ownerId = 'neutral';
    check('a hero whose road home is gone reads as cut off', service.heroFreeReason(s, h) === 'route', service.heroFreeReason(s, h));
    far.ownerId = 'neutral';
    service.tickHeroLifecycle(s);
    check('and a hero left standing on lost ground is taken home', h.life.kind === 'transit' && h.life.intendedPost.kind === 'home', h.life.kind);
  }

  // ── 3. replacing a holder ────────────────────────────────────────────────
  {
    const s = make(); const { far } = realm(s);
    s.court.unlockedSeats = [...new Set([...s.court.unlockedSeats, 'treasurer'])];
    const a = recruit(s), b = recruit(s), c = recruit(s);
    service.commitHeroAssignment(s, a, { kind: 'court', seat: 'treasurer' });
    service.commitHeroAssignment(s, b, { kind: 'province', landId: far.id });
    const quote = service.previewHeroTransfer(s, b.id, { kind: 'court', seat: 'treasurer' });
    check('a seat with a sitter can be quoted, naming who it relieves', quote.ok && quote.displaces === a.id, JSON.stringify({ ok: quote.ok, reason: quote.reason, displaces: quote.displaces }));
    const result = applyAppointmentResult(s, b.id, 'court:treasurer');
    check('and the appointment goes through', result.ok, result.reason);
    check('the sitter keeps the seat while the successor travels', s.court.seats.treasurer === a.id && b.life.kind === 'transit');
    const c3 = service.previewHeroTransfer(s, c.id, { kind: 'court', seat: 'treasurer' });
    check('a third hero is refused: somebody is already on the road to it', !c3.ok && c3.reason === 'occupied', c3.reason);
    for (let i = 0; i < 6 && b.life.kind === 'transit'; i += 1) { s.turn += 1; service.tickHeroLifecycle(s); }
    check('on arrival the successor sits and the sitter goes home',
      s.court.seats.treasurer === b.id && a.life.kind === 'active' && a.life.assignment.kind === 'home', JSON.stringify(a.life));
    const said = JSON.stringify([s.message, s.toasts ?? [], s.eventLog ?? []]);
    check('the change is announced, naming the relieved holder', said.includes(heroName(a)), s.message);
    const bad = applyAppointmentResult(s, c.id, 'court:nonsense');
    check('a bad appointment reports a reason instead of failing silently', !bad.ok && Boolean(bad.reason), JSON.stringify(bad));
  }

  // ── 3b. stable is untouched ──────────────────────────────────────────────
  {
    const s = make('stable');
    const a = s.heroes.find((h) => h.id !== 'king' && !h.assignedTo);
    check('stable: an appointment still resolves through the old path', !a || applyAppointment(s, a.id, 'reserve') !== undefined);
  }

  // ── 5. picker: free before busy, "best" only among the free ───────────────
  for (const ruleset of ['stable', 'beta']) {
    const s = make(ruleset);
    s.court.unlockedSeats = [...new Set([...s.court.unlockedSeats, 'spymaster', 'chancellor'])];
    const busy = s.heroes.find((h) => h.id !== 'king') ?? recruit(s);
    busy.stats.diplomacy = 99;
    if (ruleset === 'beta') service.commitHeroAssignment(s, busy, { kind: 'court', seat: 'chancellor' });
    else { s.court.seats.chancellor = busy.id; busy.assignedTo = 'court:chancellor'; }
    const free = ruleset === 'beta' ? recruit(s) : generateHero(seed++);
    if (ruleset !== 'beta') s.heroes.push(free);
    free.stats.diplomacy = 20; delete free.assignedTo;
    const rows = buildHeroPickerRows(s, { kind: 'court', seat: 'spymaster' });
    const iFree = rows.findIndex((r) => r.hero.id === free.id), iBusy = rows.findIndex((r) => r.hero.id === busy.id);
    check(`${ruleset}: a free hero is listed before a stronger busy one`, iFree >= 0 && iBusy >= 0 && iFree < iBusy, `${iFree} vs ${iBusy}`);
    const best = rows.find((r) => r.isBest);
    check(`${ruleset}: the recommended hero is always a free one`, !best || !best.hero.assignedTo, best && best.hero.assignedTo);
  }
  return out;
});

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
}
if (errors.length) { failed += 1; console.log(`FAIL page errors: ${errors.slice(0, 3).join(' | ')}`); }
await browser.close();
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
