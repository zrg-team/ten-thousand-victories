/**
 * Verify the desktop cabinet's display modes, by driving the real Electron app.
 *
 * Not the dev server: every claim here is about a *window*, and a browser tab has none. Playwright
 * launches `apps/desktop` for real, so the checks below read the actual BrowserWindow state out of
 * the main process rather than trusting the bridge to have meant it.
 *
 *   node test_scripts/verify/verify-display-mode.mjs
 *
 * Needs `apps/desktop/web/` — run `yarn desktop:sync` first if this is a fresh clone.
 *
 * Runs against a throwaway `--user-data-dir`, which matters: the mode and the window's shape are
 * remembered in `window-state.json` under `userData`, and a gate that ran against the real profile
 * would leave the developer's game in whatever mode the last assertion happened to set.
 */
import { _electron } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CABINET = join(ROOT, 'apps', 'desktop');

if (!existsSync(join(CABINET, 'web', 'index.html'))) {
  console.error('FAIL: apps/desktop/web/ is empty — run `yarn desktop:sync` first.');
  process.exit(1);
}

/** The electron binary belongs to the cabinet's own node_modules, not the repository root's. */
const executablePath = createRequire(join(CABINET, 'package.json'))('electron');
const profile = mkdtempSync(join(tmpdir(), 'van-thang-display-'));

const fails = [];
const check = (ok, what) => { if (!ok) fails.push(what); return ok; };

/** The window's real state, read out of the main process. */
const windowState = (app) => app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0];
  return {
    fullScreen: win.isFullScreen(),
    simple: process.platform === 'darwin' ? win.isSimpleFullScreen() : false,
    // On Windows and Linux a borderless window is what `setFullScreen` produces, so "covering the
    // screen" is the thing to assert rather than a frame flag that never changes.
    covering: win.isFullScreen() || (process.platform === 'darwin' && win.isSimpleFullScreen()),
  };
});

/**
 * The environment, with one variable taken out of it.
 *
 * `ELECTRON_RUN_AS_NODE=1` makes the electron binary behave as a plain Node runtime: no app, no
 * BrowserWindow, and `protocol` undefined, so `main.js` dies on its first line with a TypeError and
 * Playwright reports only "Process failed to launch!". Every Electron-hosted terminal exports it —
 * VS Code's integrated terminal does, and so does the tooling this repository is often driven
 * from — so a gate that inherits the environment unedited fails on the developer's machine and
 * passes in CI, which is the worst way round.
 */
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const launch = async () => {
  const app = await _electron.launch({
    executablePath,
    args: ['.', `--user-data-dir=${profile}`],
    cwd: CABINET,
    env,
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.__shell), null, { timeout: 30000 });
  return { app, page };
};

const stateFile = async (app) => {
  const at = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
  const file = join(at, 'window-state.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

const report = {};

try {
  // ── 1 · the bridge is there, and offers what the platform actually has ────────────────────
  let { app, page } = await launch();
  const bridge = await page.evaluate(() => ({
    modes: window.__shell.displayModes,
    mode: window.__shell.displayMode,
    canSet: typeof window.__shell.setDisplayMode === 'function',
  }));
  report.bridge = bridge;
  check(bridge.canSet, 'setDisplayMode is not exposed on the bridge');
  check(Array.isArray(bridge.modes) && bridge.modes.includes('windowed') && bridge.modes.includes('borderless'),
    `displayModes is missing windowed/borderless: ${JSON.stringify(bridge.modes)}`);
  // Only macOS has a fullscreen Space distinct from a borderless window; offering a third tile
  // anywhere else would be a control that does nothing.
  const wantsThree = process.platform === 'darwin';
  check(bridge.modes.includes('fullscreen') === wantsThree,
    `fullscreen offered on the wrong platform: ${process.platform} got ${JSON.stringify(bridge.modes)}`);
  check(bridge.mode === 'windowed', `a fresh profile should launch windowed, got ${bridge.mode}`);
  check(!(await windowState(app)).covering, 'a fresh profile launched covering the screen');

  // ── 2 · borderless actually covers the screen ─────────────────────────────────────────────
  await page.evaluate(() => window.__shell.setDisplayMode('borderless'));
  await page.waitForTimeout(1200);
  const borderless = await windowState(app);
  report.borderless = borderless;
  check(borderless.covering, 'borderless did not cover the screen');
  if (process.platform === 'darwin') {
    check(borderless.simple && !borderless.fullScreen,
      'macOS borderless should be simple fullscreen, not a fullscreen Space');
  }

  // ── 3 · and windowed gives the frame back ─────────────────────────────────────────────────
  await page.evaluate(() => window.__shell.setDisplayMode('windowed'));
  await page.waitForTimeout(1200);
  check(!(await windowState(app)).covering, 'windowed did not leave the covering mode');

  // ── 4 · the F key and the setting agree ───────────────────────────────────────────────────
  // The key routes through the same main-process call, so pressing it must land in the same state
  // the row would show — not a second, parallel idea of fullscreen.
  await page.evaluate(() => window.__shell.toggleFullscreen());
  await page.waitForTimeout(1200);
  const toggled = await windowState(app);
  report.afterToggle = toggled;
  check(toggled.covering, 'the fullscreen toggle did not cover the screen');
  if (process.platform === 'darwin') {
    check(toggled.simple, 'the toggle should return to the last chosen covering mode (borderless)');
  }

  // ── 5 · it is written down ────────────────────────────────────────────────────────────────
  const saved = await stateFile(app);
  report.saved = saved;
  check(saved !== null, 'no window-state.json was written');
  check(saved?.mode === 'borderless', `saved mode should be borderless, got ${saved?.mode}`);

  await app.close();

  // ── 6 · and read back on the next launch ──────────────────────────────────────────────────
  ({ app, page } = await launch());
  const relaunch = await page.evaluate(() => window.__shell.displayMode);
  const relaunchWindow = await windowState(app);
  report.relaunch = { mode: relaunch, ...relaunchWindow };
  check(relaunch === 'borderless', `the mode was not restored on relaunch, got ${relaunch}`);
  check(relaunchWindow.covering, 'the restored window is not covering the screen');

  // ── 7 · and the settings page actually draws the row ──────────────────────────────────────
  // The bridge working is not the same as the player being able to reach it. This is the only
  // place the row can be seen at all: the dev server has no `__shell`, so the row is correctly
  // absent there and a browser harness would be asserting nothing.
  await page.waitForFunction(() => Boolean(window.__phaserGame), null, { timeout: 30000 });
  await page.evaluate(() => window.__phaserGame.scene.start('SettingsScene'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('SettingsScene'), null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  // Either language: the cabinet opens in whichever the profile last chose, and a gate that only
  // knew the English strings would fail on a Vietnamese desk for no reason.
  const row = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('SettingsScene');
    const words = [];
    const walk = (object) => {
      if (object.type === 'Text' && typeof object.text === 'string') words.push(object.text.trim());
      if (object.list) object.list.forEach(walk);
    };
    scene.children.list.forEach(walk);
    return words;
  });
  const has = (en, vi) => row.includes(en) || row.includes(vi);
  report.settingsRow = { name: has('WINDOW', 'CỬA SỔ'), tiles: has('Borderless', 'Không viền') };
  check(report.settingsRow.name, `the settings page has no window row: ${JSON.stringify(row.slice(0, 40))}`);
  check(report.settingsRow.tiles, `the window row is missing its borderless tile: ${JSON.stringify(row.slice(0, 40))}`);

  await app.close();
} finally {
  rmSync(profile, { recursive: true, force: true });
}

console.log(JSON.stringify(report, null, 2));
if (fails.length) {
  for (const line of fails) console.error(`  · ${line}`);
  console.error(`FAIL: ${fails.length} display-mode check(s) failed`);
  process.exit(1);
}
console.log('PASS: the cabinet offers its platform\'s display modes, applies them, and remembers them');
