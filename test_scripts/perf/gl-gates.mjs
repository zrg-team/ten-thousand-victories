/**
 * The GL submission gates: the numbers that transfer.
 *
 * Headless milliseconds are SwiftShader's, but draw calls, indices and upload bytes are the
 * same on every GPU — so these are the thresholds the whole playbook is held to, per screen,
 * at the tier phones actually run (DSF 3, high). Thresholds are post-stamp reality plus
 * headroom; a miss is a regression, not an opinion.
 *
 * Usage: node test_scripts/perf/gl-gates.mjs [--screen menu|map-fresh|map-revealed|ascent-map|fight|all]
 *        [--dpr 3] [--quality high]
 */
import { boot, startWorld, revealAll, driveToBattle, installGlCounters, glFrame, settleChunkWork, arg, report } from './_boot.mjs';

const SCREEN = arg('screen', 'all');
const DPR = Number(arg('dpr', '3'));
const QUALITY = arg('quality', 'high');

// indices / uploadKB / draws — measured 2026-08-24 after the stamp+sheet+threshold work
// (map-revealed measured 11.8k indices, 164 KB, 28 draws) with ~1.5-2x headroom for content noise.
const GATES = {
  menu: { indices: 12000, uploadKB: 220, draws: 60 },
  'map-fresh': { indices: 24000, uploadKB: 280, draws: 60 },
  'map-revealed': { indices: 30000, uploadKB: 300, draws: 70 },
  // Upload on the two live-ink-heavy screens measured 473-483 KB (text canvases and the
  // remaining live Graphics re-upload their vertices per frame) - gated at measured + ~25%.
  'ascent-map': { indices: 40000, uploadKB: 600, draws: 80 },
  // The playbook's 15k fight target assumed the FULL surface conversion (panels, rails and the
  // readout as stamps); with the shipped subset the screen measures ~34.5k — gated there plus
  // headroom, and the 15k figure stays in the playbook as the target for the deferred work.
  fight: { indices: 40000, uploadKB: 600, draws: 90 },
};

// On HIGH the settlement band renders live by design — vector-crisp towns are the tier's whole
// promise (2026-08-25) — so the map screens carry its tessellation and per-frame vertex upload:
// measured 40.6k / 557 KB revealed classic, 118k / 1.6 MB ascent at min zoom, gated +~25%.
// Every other quality still bakes; run `--quality medium` to hold the baked design to the
// original numbers above.
const HIGH_GATES = {
  'map-revealed': { indices: 52000, uploadKB: 720, draws: 70 },
  'ascent-map': { indices: 148000, uploadKB: 2000, draws: 80 },
};
const FB_BINDS_MAX = 2;

const screens = SCREEN === 'all' ? Object.keys(GATES) : [SCREEN];
const checks = [];

for (const screen of screens) {
  const { browser, page, errors } = await boot({ dpr: DPR, quality: QUALITY });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

  if (screen === 'map-fresh' || screen === 'map-revealed') {
    await startWorld(page, { mode: 'rival', seed: 1337 });
    if (screen === 'map-revealed') await revealAll(page);
  } else if (screen === 'ascent-map' || screen === 'fight') {
    await startWorld(page, { mode: 'ascent', seed: 20260812 });
    if (screen === 'fight') {
      const name = await driveToBattle(page);
      if (!name) {
        checks.push([`${screen}: reached a battle`, false, 'no battle within the drive']);
        await browser.close();
        continue;
      }
      await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        ui.battleAwaitingOrder = false;
        ui.openLane('battle');
      });
      await page.waitForTimeout(600);
    }
  } else {
    await page.waitForTimeout(800);
  }

  // The screen, not the repaint behind it: a gate sampled during a chunk tail measures the tail.
  if (screen !== 'menu') await settleChunkWork(page, screen.startsWith('map') ? 'MapScene' : 'ConquestScene');
  await installGlCounters(page);
  const frame = await glFrame(page, { frames: 12, warm: 4 });

  const gate = (QUALITY === 'high' && HIGH_GATES[screen]) || GATES[screen];
  checks.push([`${screen}: indices/frame ≤ ${gate.indices}`, frame.indices <= gate.indices,
    `${Math.round(frame.indices)}`]);
  checks.push([`${screen}: upload ≤ ${gate.uploadKB} KB/frame`, frame.uploadKB <= gate.uploadKB,
    `${frame.uploadKB} KB`]);
  checks.push([`${screen}: draws ≤ ${gate.draws}`, frame.draws <= gate.draws, `${Math.round(frame.draws)}`]);
  checks.push([`${screen}: fbBinds ≤ ${FB_BINDS_MAX}`, frame.fbBinds <= FB_BINDS_MAX, `${frame.fbBinds}`]);
  checks.push([`${screen}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | ')]);

  console.log(`[${screen}] draws=${frame.draws} indices=${frame.indices} `
    + `upload=${frame.uploadKB}KB fbBinds=${frame.fbBinds} texBinds=${frame.texBinds}`);
  await browser.close();
}

report(checks);
