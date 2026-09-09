/**
 * Verify the desktop cabinet can be closed from inside the game.
 *
 * The report was "desktop version have no exit button to close game": `quit()` was on the bridge
 * and in the run menu's ☰ sheet, but the front page — the one screen a player is looking at when
 * they want to stop — offered nothing, so the only ways out were the window's ✕ and Alt+F4.
 *
 *   node test_scripts/verify/verify-quit.mjs
 *
 * Driven against the real Electron app rather than the dev server, for the same reason
 * `verify-display-mode.mjs` is: the claim is that the *application* ends, and a browser tab has no
 * application to end. The last step really does close it — that is the assertion.
 *
 * Needs `apps/desktop/web/` — run `yarn desktop:sync` first if this is a fresh clone or the game
 * has changed since the last sync.
 */
import { _electron } from 'playwright';
import { existsSync, mkdtempSync } from 'node:fs';
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

const executablePath = createRequire(join(CABINET, 'package.json'))('electron');
// A throwaway profile: this harness would otherwise leave the developer's own window state and
// saved reign behind whatever it happened to do.
const profile = mkdtempSync(join(tmpdir(), 'van-thang-quit-'));

// `ELECTRON_RUN_AS_NODE=1` turns the binary into a plain Node runtime and `main.js` dies on its
// first line. Every Electron-hosted terminal exports it — see `verify-display-mode.mjs`.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const fails = [];
const check = (ok, what) => { if (!ok) fails.push(what); return ok; };

const app = await _electron.launch({ executablePath, args: ['.', `--user-data-dir=${profile}`], cwd: CABINET, env });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 60000 });
await page.waitForTimeout(1500);

/** A control's centre in CSS pixels: design units through the camera, then onto the canvas. */
const centreOf = (key) => page.evaluate((data) => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const cam = scene.cameras.main;
  const list = data.modal ? scene.modalObjects : scene.content;
  const found = data.modal
    ? list[list.length - 1]
    : list.find((c) => c.getData?.('menuUtility') === data.id);
  if (!found) return null;
  const m = found.getWorldTransformMatrix();
  // The transform is the control's top-left; its interactive child rectangle carries the size.
  const rect = (found.list ?? []).find((k) => k.input?.hitArea);
  const canvas = window.__phaserGame.canvas.getBoundingClientRect();
  const scale = canvas.width / (cam.width / cam.zoom);
  return {
    x: canvas.left + (m.tx + (rect?.x ?? 0) - cam.scrollX) * scale,
    y: canvas.top + (m.ty + (rect?.y ?? 0) - cam.scrollY) * scale,
  };
}, key);

try {
  const doors = await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene')
    .content.filter((c) => c.getData?.('menuUtility')).map((c) => c.getData('menuUtility')));
  check(doors.includes('quit'), `the front page has no way out — doors: ${doors.join(', ') || 'none'}`);

  const door = await centreOf({ id: 'quit' });
  if (door) {
    await page.mouse.click(door.x, door.y);
    await page.waitForTimeout(700);
    const open = await page.evaluate(() => window.__phaserGame.scene.getScene('MenuScene').modalObjects.length > 0);
    // Asked before it happens: the control is a small ghost button next to Settings, and a thumb
    // that missed Settings must not end the session.
    check(open, 'pressing Exit opened no confirmation');

    if (open) {
      const yes = await centreOf({ modal: true });
      const closed = app.waitForEvent('close', { timeout: 20000 }).then(() => true).catch(() => false);
      await page.mouse.click(yes.x, yes.y);
      check(await closed, 'confirming Exit did not close the application');
    }
  }
} catch (error) {
  fails.push(`threw: ${error.message.split('\n')[0]}`);
}

try {
  await app.close();
} catch {
  // Already gone, which is the happy path.
}

if (fails.length) {
  console.error(`FAIL\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log('PASS: the front page offers Exit, it asks first, and the application ends.');
