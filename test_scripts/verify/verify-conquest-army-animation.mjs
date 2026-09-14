/**
 * Every Conquest host uses the authored four-frame foot/hoof rig on both of its real screens.
 *
 * This deliberately does not enter or inspect the legacy map renderers. The first half reads the
 * markers owned by ConquestScene; the second opens the ConquestUIScene battlefield, observes both
 * lines, then forces the same attrition rebuild used during a fight and checks the replacement.
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUR_STYLE = process.env.OUR_STYLE ?? 'ly';
const THEIR_STYLE = process.env.THEIR_STYLE ?? 'tran';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
    errors.push(message.text());
  }
});

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30_000 });
await page.evaluate((seed) => window.__startBenchGame(seed, 'ascent', 'v1'), 20260901);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene')
  && window.__mandateState, null, { timeout: 30_000 });
await page.waitForTimeout(900);
await page.evaluate((style) => {
  const state = window.__mandateState;
  if (state.muster) state.muster.dynasty = style;
  window.__phaserGame.scene.getScene('ConquestScene').refresh();
}, OUR_STYLE);

const mapSample = () => page.evaluate(() => {
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const markers = [...map.armies.markers.values()];
  return markers.map((marker) => {
    const body = marker.list.find((child) => child.getData?.('conquestArmyFrameAnimation'));
    const animation = body?.getData('conquestArmyFrameAnimation');
    const first = animation?.figures?.[0];
    return {
      frame: animation?.frame,
      figures: animation?.figures?.length ?? 0,
      animatedFigures: animation?.figures?.filter((figure) => figure.limbs?.length >= 2).length ?? 0,
      pose: first?.limbs?.map((limb) => [
        Number(limb.pivot.x.toFixed(2)), Number(limb.pivot.y.toFixed(2)),
        Number(limb.pivot.angle.toFixed(2)),
      ]),
      bodyY: body?.y,
    };
  });
});

// A host garrisoning a province is *standing there*, and standing men do not march on the spot.
// Sample it idle first: the frame clock must not be running at all.
const idleFrames = [];
for (let sample = 0; sample < 5; sample += 1) {
  idleFrames.push(await mapSample());
  await page.waitForTimeout(230);
}
const idleFrameSet = new Set(idleFrames.map((sample) => sample[0]?.frame));
const idlePoses = new Set(idleFrames.map((sample) => JSON.stringify(sample[0]?.pose)));

// Then put it on the road, through the same `movementOrders` entry the war system writes, and
// rebuild the marker the way a tick does. Nothing here reaches into the animation itself — if the
// wiring from "has an order" to "the feet run" were cut, this would go red.
const marched = await page.evaluate(async () => {
  const state = window.__mandateState;
  const map = window.__phaserGame.scene.getScene('ConquestScene');
  const army = state.armies.find((candidate) => map.armies.markers.has(candidate.id))
    ?? state.armies[0];
  const land = state.lands.find((candidate) => candidate.id === army.landId);
  const step = land.neighbors.find((id) => state.lands.some((other) => other.id === id));
  const { issueMoveOrder } = await import('/src/systems/WarSystem.ts');
  issueMoveOrder(state, army.id, step);
  map.refresh();
  return state.movementOrders.some((order) => order.armyId === army.id);
});
await page.waitForTimeout(300);

const mapFrames = [];
for (let sample = 0; sample < 5; sample += 1) {
  mapFrames.push(await mapSample());
  await page.waitForTimeout(230);
}
const firstMapFrames = new Set(mapFrames.map((sample) => sample[0]?.frame));
const firstMapPoses = new Set(mapFrames.map((sample) => JSON.stringify(sample[0]?.pose)));
const mapHosts = mapFrames[0];
check('every Conquest map army has an authored frame cycle',
  mapHosts.length > 0 && mapHosts.every((host) => host.figures > 0),
  `${mapHosts.filter((host) => host.figures > 0).length}/${mapHosts.length} map hosts`);
check('every visible map soldier has articulated feet or hooves',
  mapHosts.every((host) => host.animatedFigures === host.figures),
  `${mapHosts.reduce((n, host) => n + host.animatedFigures, 0)} animated figures`);
check('the host takes a real march order', marched === true, `order issued: ${marched}`);
check('a garrisoned host keeps its feet still', idleFrameSet.size === 1 && idlePoses.size === 1,
  `idle frames ${[...idleFrameSet].join(', ')}; ${idlePoses.size} poses over ${idleFrames.length} samples`);
check('map animation advances through discrete frames once the host marches', firstMapFrames.size >= 3,
  `frames ${[...firstMapFrames].join(', ')}`);
check('map feet change pose while the host body stays planted',
  firstMapPoses.size >= 3 && mapFrames.every((sample) => sample[0]?.bodyY === mapFrames[0][0]?.bodyY),
  `${firstMapPoses.size} foot poses; host y ${mapFrames[0][0]?.bodyY}`);

// Start a real Conquest battle through the existing bench setup. BattleArenaScene is only a
// deterministic launcher here; none of its renderer objects are inspected or changed.
await page.evaluate(() => window.__phaserGame.scene.start('BattleArenaScene'));
await page.waitForTimeout(700);
await page.evaluate(([ourStyle, theirStyle]) => {
  const arena = window.__phaserGame.scene.getScene('BattleArenaScene');
  arena.ourStyle = ourStyle;
  arena.theirStyle = theirStyle;
  arena.ourMen = 1500;
  arena.theirMen = 1500;
  arena.martial = 70;
  arena.ground = 'hills';
  arena.startFight();
}, [OUR_STYLE, THEIR_STYLE]);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null,
  { timeout: 20_000 });
await page.waitForTimeout(900);
// The seeded run may roll a spear/archer standing doctrine, both of which intentionally field no
// horse block. Force the balanced visual doctrine and rebuild so this animation audit always
// exercises mounted hooves as well as infantry feet; combat state and sizes remain untouched.
await page.evaluate(() => {
  const state = window.__mandateState;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  if (state.muster) state.muster.composition = 'balanced';
  const rival = state.kingdoms.find((kingdom) => kingdom.id === state.ascent?.activeBattle?.kingdomId);
  if (rival) rival.composition = 'balanced';
  if (state.ascent?.activeBattle) ui.buildBattleField(state.ascent.activeBattle);
});
await page.waitForTimeout(120);

const battleSample = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const markerInfo = (entry) => {
    const animation = entry.marker.getData('conquestArmyFrameAnimation');
    const first = animation?.figures?.[0];
    return {
      hostId: entry.hostId,
      frame: animation?.frame,
      figures: animation?.figures?.length ?? 0,
      animatedFigures: animation?.figures?.filter((figure) => figure.limbs?.length >= 2).length ?? 0,
      mounted: animation?.figures?.filter((figure) => figure.mounted).length ?? 0,
      pose: first?.limbs?.map((limb) => [
        Number(limb.pivot.x.toFixed(2)), Number(limb.pivot.y.toFixed(2)),
        Number(limb.pivot.angle.toFixed(2)),
      ]),
      scaleX: entry.marker.scaleX,
      x: entry.marker.x,
    };
  };
  return {
    ours: (ui.battleUi?.ourMarkers ?? []).map(markerInfo),
    theirs: (ui.battleUi?.theirMarkers ?? []).map(markerInfo),
  };
});

// A battle opens with both lines formed up and holding, several seconds before either crosses any
// ground. That hold is the case the feet used to get wrong — men marching on the spot while their
// block stood still — so it is sampled and asserted on its own before anything moves.
const standingFrames = [];
for (let sample = 0; sample < 12; sample += 1) {
  standingFrames.push(await battleSample());
  await page.waitForTimeout(220);
}
const heldStill = standingFrames.every((sample) => sample.ours[0]?.x === standingFrames[0].ours[0]?.x);
const standingFrameSet = new Set(standingFrames.map((sample) => sample.ours[0]?.frame));
const standingPoses = new Set(standingFrames.map((sample) => JSON.stringify(sample.ours[0]?.pose)));

// Then wait for the line to actually start crossing before judging whether its feet run.
await page.waitForFunction(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const marker = ui.battleUi?.ourMarkers?.[0]?.marker;
  return marker !== undefined && Math.abs(marker.x - 88) > 2;
}, null, { timeout: 40_000 });

const battleFrames = [];
for (let sample = 0; sample < 16; sample += 1) {
  battleFrames.push(await battleSample());
  await page.waitForTimeout(200);
}
const firstBattleFrames = new Set(battleFrames.map((sample) => sample.ours[0]?.frame));
const firstBattlePoses = new Set(battleFrames.map((sample) => JSON.stringify(sample.ours[0]?.pose)));
const battleHosts = [...battleFrames[0].ours, ...battleFrames[0].theirs];
check('every Conquest battle army has an authored frame cycle',
  battleHosts.length >= 2 && battleHosts.every((host) => host.figures > 0),
  `${battleHosts.filter((host) => host.figures > 0).length}/${battleHosts.length} battle hosts`);
check('every battle soldier has moving legs, including mounted ranks',
  battleHosts.every((host) => host.animatedFigures === host.figures)
    && battleHosts.some((host) => host.mounted > 0),
  `${battleHosts.reduce((n, host) => n + host.animatedFigures, 0)} figures; `
    + `${battleHosts.reduce((n, host) => n + host.mounted, 0)} mounted`);
check('a battle line that is holding does not march on the spot',
  heldStill && standingFrameSet.size === 1 && standingPoses.size === 1,
  `block ${heldStill ? 'stood' : 'moved'}; frames ${[...standingFrameSet].join(', ')}; `
    + `${standingPoses.size} poses over ${standingFrames.length} samples`);
check('battle animation advances and changes foot poses once the line crosses',
  firstBattleFrames.size >= 3 && firstBattlePoses.size >= 3,
  `frames ${[...firstBattleFrames].join(', ')}, ${firstBattlePoses.size} poses`);
check('opposing battle line faces the player',
  battleFrames[0].ours.every((host) => host.scaleX > 0)
    && battleFrames[0].theirs.every((host) => host.scaleX < 0),
  `ours ${battleFrames[0].ours.map((host) => host.scaleX).join(', ')}, `
    + `theirs ${battleFrames[0].theirs.map((host) => host.scaleX).join(', ')}`);

const rebuilt = await page.evaluate(async () => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const entry = ui.battleUi?.ourMarkers?.[0];
  if (!entry) return null;
  const old = entry.marker;
  const { redrawHostBlock } = await import('/src/scenes/conquest/battle/field.ts');
  redrawHostBlock(ui, entry, 1300);
  const animation = entry.marker.getData('conquestArmyFrameAnimation');
  return {
    replaced: old !== entry.marker && !old.active,
    figures: animation?.figures?.length ?? 0,
    animatedFigures: animation?.figures?.filter((figure) => figure.limbs?.length >= 2).length ?? 0,
    frame: animation?.frame,
  };
});
// The replacement marker gets a fresh clock, and that clock is only allowed to run while its
// block is crossing — so give it until the next crossing rather than reading one sample and
// calling a legitimately-held line a broken animation.
let rebuiltFrame = rebuilt?.frame;
for (let sample = 0; sample < 40 && rebuiltFrame === rebuilt?.frame; sample += 1) {
  await page.waitForTimeout(220);
  rebuiltFrame = (await battleSample()).ours[0]?.frame;
}
check('attrition rebuild preserves army frame animation',
  rebuilt?.replaced === true && rebuilt.figures > 0 && rebuilt.animatedFigures === rebuilt.figures
    && rebuiltFrame !== rebuilt.frame,
  rebuilt ? `${rebuilt.animatedFigures}/${rebuilt.figures} figures, frame ${rebuilt.frame} -> ${rebuiltFrame}` : 'no marker');
check('no browser errors', errors.length === 0, errors[0] ?? 'none');

await browser.close();
for (const result of checks) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} — ${result.detail}`);
}
console.log(`\n${checks.filter((result) => result.ok).length}/${checks.length} checks passed`);
if (checks.some((result) => !result.ok)) process.exitCode = 1;
