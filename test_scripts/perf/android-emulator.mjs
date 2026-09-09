/**
 * The game, measured on a real Android surface.
 *
 * Every performance number this repository has ever recorded came from desktop Chromium, and
 * `docs/development/performance.md` says so outright: *"They do not establish sustained FPS on
 * physical mobile devices."* The playbook's four-device acceptance table
 * (`docs/22-fps-playbook.md`) has been empty since it was written. This is the first harness that
 * runs the shipped web build on Android, through Android's own compositor and input pipeline.
 *
 * **What transfers and what does not.** The emulator renders through this machine's GPU (ANGLE on
 * D3D11 under `-gpu host`, or SwiftShader on the CPU under `-gpu swiftshader_indirect`). Neither is
 * a Mali-G52. So:
 *   - **Trust:** draw calls, texture binds, index counts, upload bytes, text rasterisations, object
 *     census, texture megabytes, JS heap, main-thread frame work, long tasks, input-to-paint.
 *     These are CPU- and API-side quantities a driver does not change.
 *   - **Do not quote as a win:** anything whose cost is fill rate or memory bandwidth — MSAA,
 *     overdraw, a covered world, "quads are cheaper than tessellation". The emulator has a desktop
 *     GPU's headroom and hides exactly those. Run both `--gpu host` and `--gpu swiftshader_indirect`
 *     and read the gap between them as the only fill-rate signal available here.
 *   - **Never:** thermal behaviour. A budget phone's steady clock after two minutes is about half
 *     its burst clock; an emulator never throttles.
 *
 * Note this harness deliberately does NOT pass `?capture=1`. That flag retains the WebGL drawing
 * buffer, which is a real bandwidth cost on a tiled GPU and something no player ever pays — every
 * previous perf number in this repo was taken with it on.
 *
 * Prerequisites (all already present on this machine):
 *   - Android SDK with platform-tools and an AVD on a Play Store image (Chrome must be installed).
 *   - A built game served locally:  yarn build && npx vite preview --port 5179
 * Connection: Chrome is started with an intent and driven through its own DevTools socket over
 * `adb forward`. Playwright's `_android.launchBrowser` was tried first and hangs — it wants to push
 * its own command-line file, which Chrome ignores unless "Enable command line on non-rooted
 * devices" is set by hand in chrome://flags. `connectOverCDP` needs no such flag and gives the same
 * Playwright Page, with the full protocol behind it.
 *
 * Usage:
 *   node test_scripts/perf/android-emulator.mjs [--avd Medium_Phone_API_36.0] [--gpu host]
 *        [--port 5179] [--quality auto] [--label before] [--scenes map,army,guide]
 *        [--texunits 0]   0 = leave alone, else force maxParallelTextureUnits
 *        [--keep]         leave the emulator running afterwards
 */
import { chromium } from 'playwright';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { arg, installFrameProbe, installGestureProbe, installGlCounters, report } from './_boot.mjs';
import { line, measureScene } from './_scenes.mjs';

const AVD = arg('avd', 'Medium_Phone_API_36.0');
const GPU = arg('gpu', 'host');
const PORT = Number(arg('port', '5179'));
const QUALITY = arg('quality', 'auto');
const LABEL = arg('label', 'run');
const TEXUNITS = Number(arg('texunits', '0'));
const SCENES = arg('scenes', 'menu,map,army,guide').split(',');
const KEEP = process.argv.includes('--keep');
const DEVTOOLS = Number(arg('devtools', '9222'));
const OUT = 'output/mobile-round';

const SDK = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME
  ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const ADB = join(SDK, 'platform-tools', 'adb.exe');
const EMULATOR = join(SDK, 'emulator', 'emulator.exe');

// A hung `adb` is the normal failure here, not the exception: an emulator under load stops
// answering `shell` for minutes at a time. Two timeouts — a short one for the polls, which must
// stay responsive, and a long one for the commands that legitimately take a while.
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', timeout: 120000 }).trim();
const adbQuick = (...args) => execFileSync(ADB, args, { encoding: 'utf8', timeout: 8000 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `adb devices` reporting `device`, not `offline` — an emulator says both on its way up. */
async function waitReady(seconds = 180) {
  for (let i = 0; i < seconds; i += 1) {
    try {
      if (/emulator-\d+\s+device/.test(adbQuick('devices'))
        && adbQuick('shell', 'getprop', 'sys.boot_completed') === '1') return true;
    } catch { /* adb is still coming up */ }
    await sleep(1000);
  }
  return false;
}

async function ensureDevice() {
  if (!existsSync(ADB)) throw new Error(`adb not found at ${ADB} — set ANDROID_SDK_ROOT`);
  adb('start-server');
  // An emulator that is up but `offline` is the flake this harness kept dying on: the previous
  // sweep read `device`, and by the time the next command ran the state had gone back to offline.
  if (/emulator-\d+/.test(adb('devices'))) {
    if (await waitReady(120)) return false;
  }
  if (!existsSync(EMULATOR)) throw new Error(`emulator not found at ${EMULATOR}`);
  console.log(`booting ${AVD} (-gpu ${GPU}) …`);
  spawn(EMULATOR, ['-avd', AVD, '-no-snapshot-save', '-no-boot-anim', '-gpu', GPU],
    { detached: true, stdio: 'ignore' }).unref();
  adb('wait-for-device');
  if (!await waitReady(240)) throw new Error('the emulator never reported ready');
  await sleep(3000);
  return true;
}

/**
 * A dark or locked screen throttles rAF, and a throttled page is not a measurement.
 *
 * The first emulator sweep read a 16.9 ms frame gap but only 57 frames in a four-second window —
 * the game was stepping for a quarter of the time it was asked to. Wake, unlock, and keep the
 * screen on for the run.
 */
function wakeScreen() {
  try {
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    adb('shell', 'wm', 'dismiss-keyguard');
    adb('shell', 'svc', 'power', 'stayon', 'true');
  } catch { /* best effort: an emulator without these still measures, just watch the frame count */ }
}

// `vite preview` serves the production build under the base path from package.json's homepage —
// the device asking for "/" gets a 404 and the harness waits ninety seconds for a game that was
// never served. Derived rather than pasted, so it follows the deploy target.
const BASE_PATH = arg('base', (() => {
  try {
    const home = JSON.parse(readFileSync('package.json', 'utf8')).homepage;
    return home ? new URL(home).pathname.replace(/\/$/, '') : '';
  } catch { return ''; }
})());
const url = `http://127.0.0.1:${PORT}${BASE_PATH}/?bench=1`;

const startedByUs = await ensureDevice();
wakeScreen();
adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
// Chrome must be up before its DevTools socket exists; the intent is also how the first tab gets
// the right origin, which matters because localStorage and the quality fingerprint are per-origin.
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url,
  '-n', 'com.android.chrome/com.google.android.apps.chrome.Main');
await sleep(4000);
adb('forward', `tcp:${DEVTOOLS}`, 'localabstract:chrome_devtools_remote');

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEVTOOLS}`, { timeout: 60000 });
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes(`:${PORT}`)) ?? context.pages()[0];
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
console.log(`device: ${adb('shell', 'getprop', 'ro.product.model')} · chrome ${browser.version()}`);

const control = await context.newCDPSession(page);
await control.send('Network.enable').catch(() => {});
// Android Chrome keeps an MHTML snapshot of a page it once failed to fetch and serves it back in
// place of the live site — scripts do not run inside an archive, so the harness sat waiting for a
// game that was never going to boot, twice. Cache off, storage cleared, and every navigation
// carries a fresh query so nothing can be answered from a snapshot.
await control.send('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
await control.send('Storage.clearDataForOrigin',
  { origin: `http://127.0.0.1:${PORT}`, storageTypes: 'all' }).catch(() => {});

/** A guaranteed-live load of the game, from a blank page so nothing is restored. */
async function open(target) {
  await page.goto('about:blank');
  await page.goto(`${target}&cb=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
    && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 120000 });
}

const results = { label: LABEL, gpu: GPU, quality: QUALITY, texunits: TEXUNITS, scenes: {} };
const checks = [];

try {
  // The built service worker would otherwise serve a cached bundle straight through an A/B and
  // silently compare a build against itself.
  await open(url);
  console.log(`  page: ${page.url()}`);
  await page.evaluate(async ([q]) => {
    // Best effort on both: a sandboxed or storage-partitioned tab throws on either, and neither is
    // worth failing a run over.
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      for (const reg of regs) await reg.unregister();
    } catch { /* service workers unavailable in this context */ }
    try {
      if (q && q !== 'auto') localStorage.setItem('mandate:graphics:v1', q);
      else localStorage.removeItem('mandate:graphics:v1');
      localStorage.removeItem('mandate:graphics:rung:v1');
    } catch { /* storage unavailable */ }
  }, [QUALITY]);
  await open(url);

  const cdp = await context.newCDPSession(page);
  results.device = await page.evaluate(() => {
    const gl = window.__phaserGame.renderer.gl;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER)),
      glVersion: gl.getParameter(gl.VERSION),
      maxTextures: window.__phaserGame.renderer.maxTextures,
      textureUnits: window.__phaserGame.renderer.renderNodes?.maxParallelTextureUnits,
      dpr: window.devicePixelRatio,
      viewport: [window.innerWidth, window.innerHeight],
      buffer: [window.__phaserGame.scale.width, window.__phaserGame.scale.height],
      renderScale: window.__renderScale?.(),
      ladder: window.__ladder?.state?.(),
      ua: navigator.userAgent,
    };
  });
  console.log(`  ${results.device.renderer}`);
  console.log(`  dpr ${results.device.dpr} · viewport ${results.device.viewport.join('x')} `
    + `· buffer ${results.device.buffer.join('x')} · rung ${results.device.ladder?.rung} `
    + `· texture units ${results.device.textureUnits}/${results.device.maxTextures}`);

  await installGlCounters(page);
  await installFrameProbe(page);
  await installGestureProbe(page);
  if (TEXUNITS > 0) {
    await page.evaluate((u) => window.__phaserGame.renderer.renderNodes.setMaxParallelTextureUnits(u), TEXUNITS);
    results.device.textureUnits = TEXUNITS;
  }

  const reset = async () => {
    await open(url);
    await installGlCounters(page);
    await installFrameProbe(page);
    await installGestureProbe(page);
    if (TEXUNITS > 0) {
      await page.evaluate((u) => window.__phaserGame.renderer.renderNodes.setMaxParallelTextureUnits(u), TEXUNITS);
    }
  };

  for (const scene of SCENES) {
    results.scenes[scene] = await measureScene(page, cdp, scene, { reset });
    console.log(line(scene, results.scenes[scene]));
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${LABEL}-${GPU}.json`), JSON.stringify(results, null, 1));

  for (const [scene, r] of Object.entries(results.scenes)) {
    checks.push([`${scene}: the window actually rendered`, r.idle.frames >= 90,
      `${r.idle.frames} frames in 4 s — under 90 means the page was throttled, not slow`]);
    checks.push([`${scene}: no frame over 50 ms while idle`, r.idle.over50 === 0, `${r.idle.over50} of ${r.idle.frames}`]);
    if (r.gesture) {
      checks.push([`${scene}: no frame over 50 ms while scrolling`, r.gesture.over50 === 0,
        `${r.gesture.over50} of ${r.gesture.frames}, worst gap ${r.gesture.gapMax} ms`]);
    }
  }
  checks.push(['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')]);
  console.log(`\nwrote ${join(OUT, `${LABEL}-${GPU}.json`)}`);
} finally {
  await browser.close().catch(() => {});
  try { adb('reverse', '--remove', `tcp:${PORT}`); } catch { /* already gone */ }
  try { adb('forward', '--remove', `tcp:${DEVTOOLS}`); } catch { /* already gone */ }
  if (startedByUs && !KEEP) {
    try { execFile(ADB, ['emu', 'kill'], () => {}); } catch { /* best effort */ }
  }
}

report(checks);
