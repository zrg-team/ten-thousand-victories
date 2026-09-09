/**
 * The mobile round's headless control.
 *
 * Same scenes and the same gesture as `android-emulator.mjs`, driven on desktop Chromium under CPU
 * throttling. Two reasons it exists beside the device rig: it runs in a minute with no emulator, and
 * its software rasteriser charges fill rate to the CPU, so it is the one rig here that reacts at all
 * to a change in pixels or passes — the emulator's host GPU has the headroom to hide those.
 *
 * Read the counts (draws, binds, indices, upload, commands, text) as the transferable numbers and
 * the milliseconds as this machine's. Deliberately no `?capture=1`: retaining the drawing buffer is
 * a cost no player pays, and every earlier number in this repo was taken with it on.
 *
 * Usage:
 *   node test_scripts/perf/mobile-frame.mjs [--label before] [--throttle 6] [--quality medium]
 *        [--dpr 3] [--scenes menu,map,army,guide] [--texunits 0]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASE, arg, boot, installFrameProbe, installGestureProbe, installGlCounters, report, throttle,
} from './_boot.mjs';
import { line, measureScene } from './_scenes.mjs';

const LABEL = arg('label', 'run');
const RATE = Number(arg('throttle', '6'));
const QUALITY = arg('quality', 'medium');
const DPR = Number(arg('dpr', '3'));
const TEXUNITS = Number(arg('texunits', '0'));
const SCENES = arg('scenes', 'menu,map,army,guide').split(',');
const OUT = 'output/mobile-round';

const results = { label: LABEL, rig: 'headless', throttle: RATE, quality: QUALITY, dpr: DPR, texunits: TEXUNITS, scenes: {} };
const checks = [];
const errors = [];

/**
 * A fresh browser per scene.
 *
 * Reloading the page between scenes was not enough: this game keeps six scenes resident and writes
 * to localStorage, and a guide page measured after a Conquest run reported a fling that scrolled
 * nothing while the same page measured alone scrolled 885 px. A new context has its own storage and
 * its own game, so a scene's numbers cannot be a previous scene's leftovers.
 */
async function measure(scene) {
  const rig = await boot({ dpr: DPR, quality: QUALITY, query: '?bench=1', gc: true });
  rig.page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  rig.page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await installGlCounters(rig.page);
    await installFrameProbe(rig.page);
    await installGestureProbe(rig.page);
    if (TEXUNITS > 0) {
      await rig.page.evaluate((u) => window.__phaserGame.renderer.renderNodes.setMaxParallelTextureUnits(u), TEXUNITS);
    }
    if (!results.device) {
      results.device = await rig.page.evaluate(() => {
        const gl = window.__phaserGame.renderer.gl;
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER)),
          maxTextures: window.__phaserGame.renderer.maxTextures,
          textureUnits: window.__phaserGame.renderer.renderNodes?.maxParallelTextureUnits,
          buffer: [window.__phaserGame.scale.width, window.__phaserGame.scale.height],
          renderScale: window.__renderScale?.(),
          antialias: gl.getContextAttributes()?.antialias,
        };
      });
      console.log(`${results.device.renderer}`);
      console.log(`buffer ${results.device.buffer.join('x')} · scale ${results.device.renderScale}`
        + ` · units ${TEXUNITS || results.device.textureUnits}/${results.device.maxTextures}`
        + ` · msaa ${results.device.antialias} · throttle ${RATE}x`);
    }
    await throttle(rig.cdp, RATE);
    return await measureScene(rig.page, rig.cdp, scene);
  } finally {
    await rig.browser.close();
  }
}

try {
  for (const scene of SCENES) {
    results.scenes[scene] = await measure(scene);
    console.log(line(scene, results.scenes[scene]));
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `headless-${LABEL}.json`), JSON.stringify(results, null, 1));
  console.log(`
wrote ${join(OUT, `headless-${LABEL}.json`)}`);

  for (const [scene, r] of Object.entries(results.scenes)) {
    checks.push([`${scene}: idle frames sampled`, r.idle.frames > 20, `${r.idle.frames} frames`]);
    if (r.gesture) {
      checks.push([`${scene}: the fling actually scrolled a list`, (r.gesture.scrolledPx ?? 0) > 100,
        `${r.gesture.scrolledPx} px across ${r.gesture.lists} lists`]);
    }
  }
  checks.push(['no console errors', errors.filter((e) => !/MIME type/.test(e)).length === 0,
    errors.slice(0, 3).join(' | ')]);
} catch (error) {
  console.error(error);
  checks.push(['the sweep completed', false, String(error).slice(0, 160)]);
}

report(checks);
