/**
 * A marching host walks the road the map draws — on the order's own clock — and comes home along it.
 *
 * Armies used to build a curve of their own, keyed `army|from|to` between seat centres and offset
 * eighteen points across and twenty-eight up, so a column cut across country beside the road it
 * should have been on; a march ran on a tween timed once against a tick whose phase nobody read;
 * and a host whose order ended in a fight walked home while the fight it had gone to was still on.
 * This drives real orders through the systems the game's own tiles call, rebuilds the very spline
 * `TrafficRenderer` painted for each pair, and measures the marker against it every 100 ms:
 *
 *   - a claim by force marches the host out along the road to the province line, where it holds,
 *     still, while the claim runs — and walks home along the road when the claim is called off;
 *   - on the road proper the marker is within a few units of the painted line, the whole way;
 *   - no step between two samples is a teleport — the fastest movement is a march;
 *   - the host faces along the road's own direction, not the seat-to-seat bearing;
 *   - the marker reaches the far stand on the tick the leg resolves, not seconds before or after;
 *   - a stopped clock stops the host where it is;
 *   - an order cancelled part-way is walked home **back along the road**, at marching pace;
 *   - every cart on the map rides the road drawn for its pair, including the pairs whose farm id
 *     sorts after the city's — those used to ride a mirrored meander of their own.
 *
 * Run against a dev server: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-march-roads.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const PLAYER = 'dai-viet';
const ROAD_TOLERANCE = 6;
const FRONTIER = 0.5;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const segmentDistance = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l2));
  return Math.hypot(p.x - (a[0] + dx * t), p.y - (a[1] + dy * t));
};
const distanceToRoad = (p, points) => {
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, segmentDistance(p, points[index - 1], points[index]));
  }
  return best;
};
const nearestIndex = (p, points) => {
  let best = 0;
  let bestDistance = Infinity;
  points.forEach((q, index) => {
    const d = Math.hypot(p.x - q[0], p.y - q[1]);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
};
const compass = (dx, dy) => Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
// In compass points, not radians: the marker's signature stores its heading to two decimals, and
// 2.36 - 1.57 is a hair over pi/4 while the two are exactly one point apart.
const compassIndex = (radians) => ((Math.round(radians / (Math.PI / 4)) % 8) + 8) % 8;
const compassGap = (a, b) => {
  const d = Math.abs(compassIndex(a) - compassIndex(b));
  return Math.min(d, 8 - d);
};
const fastestStep = (samples) => {
  let fastest = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const a = samples[index - 1];
    const b = samples[index];
    if (a.x === null || b.x === null) continue;
    const dt = Math.max(1, b.now - a.now);
    fastest = Math.max(fastest, (Math.hypot(b.x - a.x, b.y - a.y) / dt) * 1000);
  }
  return fastest;
};
const dist = (a, b) => (a && b && a.x !== null && b.x !== null ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);
/** Samples on the road proper, and the worst distance any of them stands off the painted line. */
const onRoadOf = (samples, road) => {
  const onRoad = samples.filter((s) => s.at !== null && s.x !== null && s.at >= s.roadStartU + 0.03 && s.at <= s.roadEndU - 0.03);
  const worst = onRoad.length ? Math.max(...onRoad.map((s) => distanceToRoad(s, road.points))) : Infinity;
  return { onRoad, worst };
};
const monotone = (samples, sign) => samples.every((s, index) => index === 0 || (s.at - samples[index - 1].at) * sign >= -1e-6);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await page.goto(`${URL}/?capture=1&noladder=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  // The whole country in view so every road is drawn. Ownership is left as the run made it for
  // the claim test, and handed to the realm afterwards so the later marches are plain moves.
  const setup = await page.evaluate(({ PLAYER }) => {
    const game = window.__phaserGame;
    const map = game.scene.getScene('ConquestScene');
    const state = map.state;
    state.pendingAscentPrompt = undefined;
    state.isPaused = false;
    state.isStrategyPause = false;
    for (const land of state.lands) {
      land.isVisible = true;
      land.isExplored = true;
    }
    game.scene.getScene('ConquestUIScene').scene.setVisible(false);
    const army = state.armies.find((candidate) => candidate.kingdomId === PLAYER && !candidate.isLevy);
    const land = state.lands.find((candidate) => candidate.id === army.landId);
    const settled = (id) => {
      const candidate = state.lands.find((other) => other.id === id);
      return candidate && candidate.hasVillage ? candidate : undefined;
    };
    const next = land.neighbors.map(settled).find(Boolean);
    const after = next ? next.neighbors.filter((id) => id !== land.id).map(settled).find(Boolean) : undefined;
    map.refresh();
    return {
      armyId: army.id, landId: land.id, nextId: next?.id, nextOwner: next?.ownerId, afterId: after?.id, landSettled: land.hasVillage,
    };
  }, { PLAYER });
  check('the capital host has a settled road neighbour, and it another', Boolean(setup.landSettled && setup.nextId && setup.afterId), JSON.stringify(setup));

  const roadPoints = (fromId, toId) => page.evaluate(async ({ fromId, toId }) => {
    const map = window.__phaserGame.scene.getScene('ConquestScene');
    const state = map.state;
    const { drawnRoadBetween } = await import('/src/map/roadCurve.ts');
    const from = state.lands.find((land) => land.id === fromId);
    const to = state.lands.find((land) => land.id === toId);
    const road = drawnRoadBetween(
      state, from, to,
      (land, toward) => map.settlements.getRoadEntrance(state, land, toward),
      (value) => map.wx(value),
      (value) => map.wy(value),
    );
    if (!road) return null;
    return { reversed: road.reversed, points: road.curve.getPoints(240).map((p) => [p.x, p.y]) };
  }, { fromId, toId });

  const sample = (keepPause = false) => page.evaluate(({ armyId, keepPause }) => {
    const map = window.__phaserGame.scene.getScene('ConquestScene');
    const state = map.state;
    state.pendingAscentPrompt = undefined;
    if (!keepPause) {
      state.isPaused = false;
      state.isStrategyPause = false;
    }
    const marker = map.armies.markers.get(armyId);
    const army = state.armies.find((candidate) => candidate.id === armyId);
    const order = state.movementOrders.find((candidate) => candidate.armyId === armyId);
    const leg = map.armies.routes.get(armyId);
    const sig = map.armies.contentSig.get(armyId) ?? '';
    const end = leg ? leg.route.getPointAt(1) : null;
    return {
      x: marker?.x ?? null,
      y: marker?.y ?? null,
      landId: army?.landId,
      marching: Boolean(order),
      heading: sig.includes('march:') ? Number(sig.split('march:')[1]) : null,
      at: leg?.at ?? null,
      roadStartU: leg?.roadStartU ?? null,
      roadEndU: leg?.roadEndU ?? null,
      legEnd: leg?.legEnd ?? null,
      end,
      resting: map.armies.resting.has(armyId),
      now: performance.now(),
    };
  }, { armyId: setup.armyId, keepPause });

  // Through the standing order the "Defend…" tile sets, not a bare issueMoveOrder call: a host with
  // no orders of its own belongs to the autopilot, which marched the first version of this test's
  // host straight back to the capital the tick after it arrived.
  const issue = (targetId) => page.evaluate(async ({ armyId, targetId }) => {
    const map = window.__phaserGame.scene.getScene('ConquestScene');
    const { setArmyOrders } = await import('/src/systems/ascent/StandingOrders.ts');
    const ok = setArmyOrders(map.state, armyId, { kind: 'defend', landId: targetId });
    map.refresh();
    return ok && map.state.movementOrders.some((order) => order.armyId === armyId);
  }, { armyId: setup.armyId, targetId });

  const march = async (untilStill, timeoutMs) => {
    const samples = [];
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const s = await sample();
      samples.push(s);
      if (untilStill(s, samples)) break;
      await page.waitForTimeout(100);
    }
    return samples;
  };

  const judgeRoad = (label, samples, road) => {
    const marching = samples.filter((s) => s.marching);
    const { onRoad, worst } = onRoadOf(marching, road);
    check(`${label}: the host walks on the drawn road`, onRoad.length >= 5 && worst <= ROAD_TOLERANCE,
      `${onRoad.length} samples on the road, at most ${worst.toFixed(1)} units off it (tolerance ${ROAD_TOLERANCE})`);
    const headings = onRoad.filter((s) => s.heading !== null);
    let agree = 0;
    for (const s of headings) {
      const index = nearestIndex(s, road.points);
      const a = road.points[Math.max(0, index - 2)];
      const b = road.points[Math.min(road.points.length - 1, index + 2)];
      const sign = road.reversed ? -1 : 1;
      const expected = compass((b[0] - a[0]) * sign, (b[1] - a[1]) * sign);
      if (compassGap(s.heading, expected) <= 1) agree += 1;
    }
    check(`${label}: the host faces along the road`, headings.length > 0 && agree / headings.length >= 0.9,
      `${agree}/${headings.length} headings within one compass point of the road's direction`);
    const fastest = fastestStep(samples);
    check(`${label}: no step is a teleport`, fastest > 0 && fastest <= 400, `fastest ${fastest.toFixed(0)} units/s`);
  };

  // ── 0. A claim by force: out to the line, hold, and home when it is called off ─────────────
  const road1 = await roadPoints(setup.landId, setup.nextId);
  check('the road between the two seats is drawn', Boolean(road1), road1 ? `${road1.points.length} points, ${road1.reversed ? 'walked backwards' : 'walked forwards'}` : 'no road');
  const stand0 = await sample();
  const pressure = await page.evaluate(async ({ armyId, landId }) => {
    const map = window.__phaserGame.scene.getScene('ConquestScene');
    const state = map.state;
    const { startIntimidation } = await import('/src/systems/AcquisitionSystem.ts');
    const ok = startIntimidation(state, landId, armyId);
    map.refresh();
    return { ok, message: state.message, method: state.acquisitionOrders.find((order) => order.armyId === armyId)?.method ?? null };
  }, { armyId: setup.armyId, landId: setup.nextId });
  check('the host opens a claim by force on its neutral neighbour', pressure.ok && pressure.method === 'intimidation',
    `${JSON.stringify(pressure)} (neighbour owned by ${setup.nextOwner})`);
  const out = await march((s, all) => all.length > 3 && !s.resting && s.at !== null && Math.abs(s.at - FRONTIER) < 0.01, 15000);
  const outWalk = out.filter((s) => s.resting);
  const outRoad = onRoadOf(outWalk, road1);
  check('a pressuring host marches out along the road to the province line', outRoad.onRoad.length >= 3 && outRoad.worst <= ROAD_TOLERANCE && monotone(outWalk, 1),
    `${outWalk.length} samples walking out, ${outRoad.onRoad.length} on the road, at most ${outRoad.worst.toFixed(1)} units off it`);
  const held1 = await sample();
  await page.waitForTimeout(1200);
  const held2 = await sample();
  check('and holds on the line, still, while the claim runs', held1.at !== null && Math.abs(held1.at - FRONTIER) < 0.01
    && dist(held1, held2) < 0.5 && !held2.resting && held2.landId === setup.landId && held2.heading !== null,
    `at ${held1.at?.toFixed(2)}, moved ${dist(held1, held2).toFixed(2)} units over 1.2 s, still on ${held2.landId}, facing ${held2.heading}`);
  await page.evaluate(({ armyId }) => {
    const map = window.__phaserGame.scene.getScene('ConquestScene');
    map.state.acquisitionOrders = map.state.acquisitionOrders.filter((order) => order.armyId !== armyId);
    map.refresh();
  }, { armyId: setup.armyId });
  const back = await march((s, all) => all.length > 3 && !s.marching && !s.resting && dist(s, stand0) <= 2, 15000);
  const backWalk = back.filter((s) => s.resting);
  const backRoad = onRoadOf(backWalk, road1);
  check('called off, it walks home along the road to its stand', backRoad.onRoad.length >= 3 && backRoad.worst <= ROAD_TOLERANCE && monotone(backWalk, -1) && dist(back[back.length - 1], stand0) <= 2,
    `${backWalk.length} samples walking home, ${backRoad.onRoad.length} on the road, at most ${backRoad.worst.toFixed(1)} units off it; ends ${dist(back[back.length - 1], stand0).toFixed(1)} units from the stand`);

  // The two provinces the marches below cross are handed to the realm: plain moves, not assaults.
  await page.evaluate(({ PLAYER, ids }) => {
    const map = window.__phaserGame.scene.getScene('ConquestScene');
    for (const land of map.state.lands) {
      if (ids.includes(land.id)) land.ownerId = PLAYER;
    }
    map.refresh();
  }, { PLAYER, ids: [setup.nextId, setup.afterId] });

  // ── 1. A march, gate to gate, on the order's own clock ──────────────────────────────────────
  const stand1 = await sample();
  check('the host takes the march order', await issue(setup.nextId));
  const first = await sample();
  check('the march begins where the host stood, not at a jump', first.x !== null && dist(first, stand1) <= 12,
    `${first.x === null ? 'no marker' : dist(first, stand1).toFixed(1) + ' units from the stand'}`);

  // A stopped clock stops the host where it is.
  await page.evaluate(() => { window.__phaserGame.scene.getScene('ConquestScene').state.isPaused = true; });
  await page.waitForTimeout(250);
  const held3 = await sample(true);
  await page.waitForTimeout(350);
  const held4 = await sample(true);
  check('a stopped clock stops the host', held3.x !== null && dist(held3, held4) < 0.5,
    `moved ${dist(held3, held4).toFixed(2)} units over 350 ms paused`);
  await page.evaluate(() => { window.__phaserGame.scene.getScene('ConquestScene').state.isPaused = false; });

  // Ends when the host is standing at the route's end — not on the transient between the tick
  // that resolved the order and the refresh that starts the walk onto the stand.
  const samples1 = await march((s, all) => {
    const end = all.find((candidate) => candidate.end)?.end;
    return all.length > 5 && !s.marching && !s.resting && Boolean(end) && dist(s, end) <= 2;
  }, 60000);
  judgeRoad('march', samples1, road1);
  const last1 = samples1[samples1.length - 1];
  const end1 = samples1.find((s) => s.end)?.end;
  check('the host arrives at its stand beside the far seat', Boolean(end1) && last1.landId === setup.nextId && dist(last1, end1) <= 2,
    `on ${last1.landId} (wanted ${setup.nextId}), ${end1 ? dist(last1, end1).toFixed(1) : '?'} units from the route's end`);
  // The order says x seasons; the marker is at the far stand when the state says the host is there.
  const arrived = samples1.find((s) => s.landId === setup.nextId);
  const atEnd = samples1.find((s) => end1 && dist(s, end1) <= 2);
  check('the march takes the seasons the order says: the marker reaches the far stand on the tick the leg resolves',
    Boolean(arrived && atEnd) && Math.abs(atEnd.now - arrived.now) <= 450,
    arrived && atEnd ? `marker at the stand ${Math.round(atEnd.now - arrived.now)} ms after the state's arrival` : 'never arrived');

  // ── 2. A march cancelled part-way is walked home along the road ─────────────────────────────
  const road2 = await roadPoints(setup.nextId, setup.afterId);
  check('the second road is drawn', Boolean(road2));
  await page.waitForTimeout(300);
  const stand2 = await sample();
  check('the host takes the second order', await issue(setup.afterId));
  // The economy clock is stopped for this leg, the way the map shooters stop it: a one-tick march
  // can otherwise resolve within a second of the order, before the host is a third of the way
  // along, and the renderer then (correctly) walks it forward onto the new province — which is
  // not the case under test. The march tween runs on the scene clock and keeps walking.
  await page.evaluate(() => { window.__phaserGame.scene.getScene('ConquestScene').ascentAccumulator = -1e9; });
  await march((s) => s.marching && s.at !== null && s.at >= 0.35, 15000);
  // Recalled the way the game recalls: a fresh standing order on the province it is standing in
  // supersedes the march under way.
  await page.evaluate(async ({ armyId, hereId }) => {
    const map = window.__phaserGame.scene.getScene('ConquestScene');
    const { setArmyOrders } = await import('/src/systems/ascent/StandingOrders.ts');
    setArmyOrders(map.state, armyId, { kind: 'defend', landId: hereId });
    map.refresh();
  }, { armyId: setup.armyId, hereId: setup.nextId });
  const home = await march((s, all) => all.length > 3 && !s.marching && !s.resting && dist(s, stand2) <= 2, 15000);
  const walking = home.filter((s) => s.resting);
  const homeRoad = onRoadOf(walking, road2);
  check('a cancelled march walks home back along the road', homeRoad.onRoad.length >= 3 && homeRoad.worst <= ROAD_TOLERANCE && monotone(walking, -1),
    `${walking.length} samples walking home, ${homeRoad.onRoad.length} on the road, at most ${homeRoad.worst.toFixed(1)} units off it; at: ${walking.map((s) => s.at.toFixed(2)).join(' ')}`);
  const lastHome = home[home.length - 1];
  check('the host is back on its stand, on its own province', lastHome.landId === setup.nextId && dist(lastHome, stand2) <= 2.5,
    `on ${lastHome.landId}, ${dist(lastHome, stand2).toFixed(1)} units from the stand`);
  const fastestHome = fastestStep(home);
  check('the walk home is a march, not a jump', fastestHome > 0 && fastestHome <= 400, `fastest ${fastestHome.toFixed(0)} units/s`);

  // ── 3. Carts ride the road that is drawn for them ────────────────────────────────────────────
  const carts = await page.evaluate(async () => {
    const map = window.__phaserGame.scene.getScene('ConquestScene');
    const state = map.state;
    const { drawnRoadBetween } = await import('/src/map/roadCurve.ts');
    const out = [];
    for (const [key, mover] of map.traffic.cartMarkers) {
      const [farmId, cityId] = key.split('|');
      const farm = state.lands.find((land) => land.id === farmId);
      const city = state.lands.find((land) => land.id === cityId);
      const road = drawnRoadBetween(
        state, farm, city,
        (land, toward) => map.settlements.getRoadEntrance(state, land, toward),
        (value) => map.wx(value),
        (value) => map.wy(value),
      );
      if (!road) continue;
      const points = road.curve.getPoints(240);
      const object = mover.object;
      let best = Infinity;
      for (const p of points) best = Math.min(best, Math.hypot(object.x - p.x, object.y - p.y));
      out.push({ key, unsorted: farmId > cityId, off: best });
    }
    return out;
  });
  if (carts.length === 0) {
    console.log('info no carts on the map (traffic setting), cart check skipped');
  } else {
    const worstCart = Math.max(...carts.map((cart) => cart.off));
    check('every cart rides the road drawn for its pair', worstCart <= 8,
      `${carts.length} carts, ${carts.filter((cart) => cart.unsorted).length} on pairs whose farm sorts after the city, at most ${worstCart.toFixed(1)} units off`);
  }

  check('no browser errors', errors.length === 0, errors[0] ?? 'none');
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} march-road checks passed`);
process.exit(failed > 0 ? 1 : 0);
