/**
 * Hành quân: a host between provinces is drawn as a column, and every host between provinces is.
 *
 * A host at rest stands in its doctrine's arrangement — wide, loose, blocks apart, because the gaps
 * are what make a deployment readable. On the road that is wrong twice over: it is not how men
 * march, and on the map it read as a crowd sliding sideways down a road. The column existed in the
 * code but behind a `kit.column` flag that nothing ever set, and its offsets were a fixed table —
 * four blocks filed 5.7 rank pitches apart whatever their depth, which on a real host left two
 * thirds of the column as bare road between four little groups.
 *
 * So this checks both halves:
 *
 *   1. **The shape.** At eight headings and four host sizes, the marching arrangement is narrower
 *      across its road than the standing one, longer along it than across it, and closed up — no
 *      gap between one block and the next wider than the marching interval.
 *   2. **Every case.** On the real map, driving real orders: a host under a march order, a host
 *      walking home under none, and a host picketing a province line are all drawn marching; a host
 *      standing beside its seat is not, and its footprint is visibly wider.
 *
 * Run against a dev server: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-march-column.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const PLAYER = 'dai-viet';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'vi'));
await page.goto(`${URL}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

// ── 1. The shape, straight out of `armyShape` ────────────────────────────────────────────────
const shapes = await page.evaluate(async () => {
  const { armyShape } = await import('/src/ui/ink/devices.ts');
  const { marchColumn, blockShares } = await import('/src/data/ascent/formations.ts');
  const { GROUND_SCALE } = await import('/src/ui/ink/proportion.ts');
  // The map's own drawing scale and spacing, so every number below is in world units — the same
  // units the on-map half of this file measures in, and the same ones a province is measured in.
  const S = GROUND_SCALE;
  const SPREAD = 4.6 / (16 / 9.46);
  const names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const out = [];
  for (const men of [240, 900, 2600, 20000]) {
    const stand = armyShape(men, 'balanced', S, undefined, SPREAD);
    names.forEach((name, index) => {
      const heading = (index * Math.PI) / 4;
      const shape = armyShape(men, 'balanced', S, undefined, SPREAD, undefined, undefined, { heading });
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      // Every block's footprint projected onto the road, and onto the line across it.
      const spans = shape.blocks.map((b) => {
        // A marching block leans: a rank steps sideways as it steps back, or a file steps down as
        // it steps across, so the grid's own `cols x pitch` is no longer the box the men fill.
        // Measuring the grid alone understated a diagonal block by a third of its length, which
        // read here as bare road between blocks that are in fact nose to tail.
        const runX = (b.rows - 1) * b.shear;
        const runY = (b.cols - 1) * (b.fileShear ?? 0);
        const w = (b.cols - 1) * b.pitch + Math.abs(runX);
        const h = (b.rows - 1) * b.rankPitch + Math.abs(runY);
        const cx = b.x + Math.min(0, runX) + w / 2;
        const cy = b.y + Math.min(0, runY) + h / 2;
        const half = (u, v) => (Math.abs(u) * w) / 2 + (Math.abs(v) * h) / 2;
        const along = cx * cos + cy * sin;
        const across = -cx * sin + cy * cos;
        return {
          alongMin: along - half(cos, sin),
          alongMax: along + half(cos, sin),
          acrossMin: across - half(-sin, cos),
          acrossMax: across + half(-sin, cos),
        };
      }).sort((a, b) => a.alongMin - b.alongMin);
      let gap = 0;
      let reach = spans[0].alongMax;
      for (let i = 1; i < spans.length; i += 1) {
        gap = Math.max(gap, spans[i].alongMin - reach);
        reach = Math.max(reach, spans[i].alongMax);
      }
      const length = Math.max(...spans.map((s) => s.alongMax)) - Math.min(...spans.map((s) => s.alongMin));
      const width = Math.max(...spans.map((s) => s.acrossMax)) - Math.min(...spans.map((s) => s.acrossMin));
      // The along-road pitch, recovered from the line block: x is the road when it runs across the
      // sheet, y when it runs up it.
      const column = marchColumn(blockShares('balanced', men), heading);
      const line = shape.blocks.find((b) => b.key === 'line');
      const alongPitch = line ? Math.abs(cos) * line.pitch + Math.abs(sin) * line.rankPitch : 1;
      out.push({
        men,
        dir: name,
        length: +length.toFixed(1),
        width: +width.toFixed(1),
        gap: +gap.toFixed(1),
        interval: +(column.interval * alongPitch).toFixed(1),
        frontage: column.frontage,
        standWidth: +stand.width.toFixed(1),
      });
    });
  }
  return out;
});

const longer = shapes.filter((s) => s.length <= s.width);
check(
  'a column is longer along its road than it is wide across it',
  longer.length === 0,
  longer.length
    ? longer.slice(0, 3).map((s) => `${s.men}/${s.dir} ${s.length}x${s.width}`).join(', ')
    : `${shapes.length} cases, thinnest ${Math.min(...shapes.map((s) => s.length / s.width)).toFixed(2)}:1`,
);

// Closed up: the widest bare stretch between two blocks is a marching interval, not a field. Two
// intervals of slack, because a block's projected span is a rectangle's shadow and the men inside
// it do not stand on the rectangle's corners.
const strung = shapes.filter((s) => s.gap > s.interval * 2 + 0.5);
check(
  'the blocks are filed nose to tail, with no bare road between them',
  strung.length === 0,
  strung.length
    ? strung.slice(0, 3).map((s) => `${s.men}/${s.dir} gap ${s.gap} > ${s.interval}`).join(', ')
    : `widest gap ${Math.max(...shapes.map((s) => s.gap)).toFixed(1)} against an interval of ${shapes[0].interval}`,
);

const wide = shapes.filter((s) => s.width >= s.standWidth);
check(
  'the host closes up: a column is narrower than the same host holding ground',
  wide.length === 0,
  wide.length
    ? wide.slice(0, 3).map((s) => `${s.men}/${s.dir} ${s.width} vs ${s.standWidth}`).join(', ')
    : `${shapes.length} cases`,
);

const front = shapes.filter((s) => s.frontage < 2 || s.frontage > 12);
check(
  'the front is a road-width, at every host size',
  front.length === 0,
  `frontages ${[...new Set(shapes.map((s) => `${s.men}:${s.frontage}`))].join(' ')}`,
);

// A very large host makes a long column, but not one that crosses a province.
const longest = Math.max(...shapes.map((s) => s.length));
check('even the largest host fits on a road', longest < 300, `longest column ${longest.toFixed(0)} units`);

// ── 2. Every case on the real map ────────────────────────────────────────────────────────────
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(1200);

const setup = await page.evaluate((player) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const state = map.state;
  state.pendingAscentPrompt = undefined;
  state.isPaused = false;
  state.isStrategyPause = false;
  for (const land of state.lands) { land.isVisible = true; land.isExplored = true; }
  const army = state.armies.find((c) => c.kingdomId === player && !c.isLevy);
  const land = state.lands.find((c) => c.id === army.landId);
  const settled = (id) => {
    const c = state.lands.find((o) => o.id === id);
    return c && c.hasVillage ? c : undefined;
  };
  const next = land.neighbors.map(settled).find(Boolean);
  map.refresh();
  return { armyId: army.id, landId: land.id, nextId: next?.id };
}, PLAYER);
check('the capital host has a settled neighbour to march on', Boolean(setup.nextId), JSON.stringify(setup));

const sample = () => page.evaluate(({ armyId }) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const state = map.state;
  state.pendingAscentPrompt = undefined;
  state.isPaused = false;
  state.isStrategyPause = false;
  const marker = map.armies.markers.get(armyId);
  const body = marker?.list?.[0];
  // **The men, not the marker.** The marker's own container unions a Graphics (the ground patch,
  // which Phaser 4 gives no usable bounds) and the standards, and came back 1371 x 1396 — the whole
  // sheet. The host is the rank group inside it: the child container holding the most objects.
  const ranks = (body?.list ?? [])
    .filter((c) => Array.isArray(c.list))
    .sort((a, b) => b.list.length - a.list.length)[0];
  const bounds = ranks?.getBounds ? ranks.getBounds() : null;
  const leg = map.armies.routes.get(armyId);
  return {
    sig: map.armies.contentSig.get(armyId) ?? '',
    at: leg?.at ?? null,
    resting: map.armies.resting.has(armyId),
    marching: state.movementOrders.some((o) => o.armyId === armyId),
    w: bounds ? +bounds.width.toFixed(1) : null,
    h: bounds ? +bounds.height.toFixed(1) : null,
  };
}, { armyId: setup.armyId });

const waitFor = async (predicate, timeoutMs) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await sample();
    if (last && predicate(last)) return last;
    await page.waitForTimeout(80);
  }
  return last;
};

const footprint = (s) => (s.w ?? 0) * (s.h ?? 0);
const pose = (s) => (s.sig ?? '').split('|').pop();

await page.waitForTimeout(400);
const stand = await sample();
check('a host beside its seat is drawn standing', pose(stand) === 'stand', `${pose(stand)}, ${stand.w}x${stand.h}`);
// The baseline every footprint below is judged against, so a nonsense reading must fail here and
// not quietly make every comparison true.
check(
  'and its footprint measures like a host, not like the sheet it stands on',
  stand.w !== null && stand.w > 20 && stand.w < 400 && stand.h > 10 && stand.h < 400,
  `${stand.w}x${stand.h}`,
);

// A claim by force walks the host out to the province line and holds it there.
await page.evaluate(async ({ armyId, landId }) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const { startIntimidation } = await import('/src/systems/AcquisitionSystem.ts');
  startIntimidation(map.state, landId, armyId);
  map.refresh();
}, { armyId: setup.armyId, landId: setup.nextId });
const picket = await waitFor((s) => s.at !== null && s.at >= 0.3, 20000);
check(
  'a host walking out to picket a province line is in column',
  pose(picket).startsWith('march:'),
  `${pose(picket)}, at ${picket.at?.toFixed(2)}`,
);
const holding = await waitFor((s) => !s.resting && s.at !== null && Math.abs(s.at - 0.5) < 0.01, 15000);
check(
  'and it holds the line in column, not spread out on it',
  pose(holding).startsWith('march:') && footprint(holding) < footprint(stand),
  `${holding.w}x${holding.h} against ${stand.w}x${stand.h} standing`,
);

await page.evaluate(({ armyId }) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  map.state.acquisitionOrders = map.state.acquisitionOrders.filter((o) => o.armyId !== armyId);
  map.refresh();
}, { armyId: setup.armyId });
const home = await waitFor((s) => s.resting, 15000);
check(
  'called off, a host walking home is in column',
  Boolean(home?.resting) && pose(home).startsWith('march:'),
  `${pose(home)}`,
);
await waitFor((s) => !s.resting && s.at === null, 20000);

await page.evaluate(({ ids }) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  for (const land of map.state.lands) if (ids.includes(land.id)) land.ownerId = 'dai-viet';
  map.refresh();
}, { ids: [setup.nextId] });
const ordered = await page.evaluate(async ({ armyId, targetId }) => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const { setArmyOrders } = await import('/src/systems/ascent/StandingOrders.ts');
  const ok = setArmyOrders(map.state, armyId, { kind: 'defend', landId: targetId });
  map.refresh();
  return ok && map.state.movementOrders.some((o) => o.armyId === armyId);
}, { armyId: setup.armyId, targetId: setup.nextId });
check('the host takes a march order', ordered);

const marching = await waitFor((s) => s.marching && s.at !== null && s.at > 0.2, 30000);
check(
  'a host under a march order is in column',
  pose(marching).startsWith('march:'),
  `${pose(marching)}, at ${marching.at?.toFixed(2)}`,
);
check(
  'and the column is a tighter footprint than the host standing',
  footprint(marching) < footprint(stand) * 0.8,
  `${marching.w}x${marching.h} = ${Math.round(footprint(marching))} against ${Math.round(footprint(stand))} standing`,
);

const arrived = await waitFor((s) => !s.marching && !s.resting && s.at === null, 40000);
check(
  'and it breaks ranks again the moment it stops',
  pose(arrived) === 'stand' && footprint(arrived) > footprint(marching),
  `${pose(arrived)}, ${arrived.w}x${arrived.h}`,
);

check('no browser errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} march-column checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
