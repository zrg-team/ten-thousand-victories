/**
 * Does the shell build actually behave like a shell build?
 *
 * The three things `src/platform/shell.ts` promises are all invisible: a service worker that does
 * not register, a donation link that is not drawn, and a callback that fires on the right frame.
 * Every one of them compiles perfectly when broken, and two of them only misbehave on a device in
 * a store build — so they get a harness rather than a reading.
 *
 * This drives `dist-shell/` over a plain loopback server, which is what the cabinets in `apps/`
 * do. It deliberately does not use `vite preview`: that serves `dist/` at the Pages sub-path, and
 * the whole point of the shell build is that it is served from a root.
 *
 *   yarn build:shell
 *   node test_scripts/verify/verify-shell.mjs
 *
 * The shell is stubbed rather than mocked away: `page.addInitScript` writes a real `window.__shell`
 * before the bundle's first line, which is exactly when a cabinet writes one and exactly why
 * `injectedJavaScriptBeforeContentLoaded` is the prop `apps/mobile` uses. A stub installed after
 * load would prove nothing about the only part of this that is hard.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.env.SHELL_DIST ?? 'dist-shell';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`no ${ROOT}/index.html — run \`yarn build:shell\` first.`);
  process.exit(1);
}

// ── 1. What the build itself has to look like ────────────────────────────────────────────────
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const scriptSrc = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1] ?? '';

// The one that cost an afternoon on Pages: `index.html` writes `src="/src/main.ts"` with a leading
// slash, so Vite rewrites it against `base`. A sub-path baked in here is a blank screen and one
// 404 in a console nobody is looking at.
check('the bundle URL is relative', scriptSrc.startsWith('./'), scriptSrc || 'no module script found');
check('no service worker is shipped', !existsSync(join(ROOT, 'sw.js')));

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  // `normalize` then a prefix test: without it, `GET /../../etc/passwd` is served happily.
  const file = join(ROOT, normalize(path === '/' ? '/index.html' : path));
  if (!file.startsWith(normalize(ROOT)) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/**
 * Every string drawn by the menu.
 *
 * Walks the display list rather than asking the scene, because the support row is three objects
 * inside a container and what is being tested is what a player can actually read.
 */
const MENU_TEXT = () => {
  const scene = window.__phaserGame?.scene.getScene('MenuScene');
  const out = [];
  const walk = (items) => {
    for (const item of items ?? []) {
      if (typeof item?.text === 'string') out.push(item.text);
      if (item?.list) walk(item.list);
    }
  };
  walk(scene?.children?.list);
  return out;
};

const COFFEE = 'Buy me a coffee';
const CONNECTIVE = '— or even better,';
// Two cuts of the same link: the sentence fragment, and the one written to stand alone. Which one
// is drawn is itself the assertion — a lowercase fragment centred by itself is the bug.
const IMPROVE = 'help build the game';
const IMPROVE_ALONE = 'Help build the game';

const browser = await chromium.launch();

/**
 * Boots the shell build once with `descriptor` installed as `window.__shell`, and reports what the
 * game did about it. `null` runs with no cabinet at all — a shell build opened in a browser.
 */
async function boot(descriptor) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`CONSOLE: ${message.text().slice(0, 160)}`);
  });

  await page.addInitScript((shell) => {
    // This verifier names the English support strings above. Language is test setup here, not a
    // product fallback: fresh installs correctly default to Vietnamese.
    localStorage.setItem('mandate:language:v1', 'en');
    // The cabinet's callback, standing in for postMessage. Read back after the menu paints.
    window.__readyFired = false;
    if (shell) {
      window.__shell = { ...shell, ready: () => { window.__readyFired = true; } };
    }
    // `navigator.serviceWorker.register` is not writable, so shadow the whole accessor. Anything
    // that reaches for it gets counted rather than silently succeeding.
    window.__swRegistrations = 0;
    const real = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      get: () => real && {
        ...real,
        register: (...args) => {
          window.__swRegistrations += 1;
          return real.register.apply(real, args);
        },
        addEventListener: real.addEventListener.bind(real),
        getRegistrations: real.getRegistrations.bind(real),
      },
    });
  }, descriptor);

  await page.goto(`${BASE}?capture=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });

  let booted = true;
  try {
    await page.waitForFunction(
      () => window.__phaserGame?.scene.isActive('MenuScene'),
      null,
      { timeout: 30000 },
    );
    // The ready callback fires on POST_RENDER, one frame after the scene goes active.
    await page.waitForTimeout(600);
  } catch {
    booted = false;
  }

  const result = booted
    ? {
        booted,
        errors,
        text: await page.evaluate(MENU_TEXT),
        readyFired: await page.evaluate(() => window.__readyFired),
        swRegistrations: await page.evaluate(() => window.__swRegistrations),
      }
    : { booted, errors, text: [], readyFired: false, swRegistrations: 0 };

  await context.close();
  return result;
}

try {
  // ── 2. A shell build in a bare browser: no cabinet, and still no worker ─────────────────────
  const bare = await boot(null);
  check('the shell build boots', bare.booted, bare.booted ? '' : bare.errors.slice(0, 2).join(' | '));
  if (!bare.booted) throw new Error('did not reach MenuScene — nothing below can be trusted');
  check('it boots with a clean console', bare.errors.length === 0, bare.errors.slice(0, 2).join(' | '));
  // `__SHELL_BUILD__` alone must be enough. A cabinet that forgets to declare itself still gets a
  // build with no offline copy of its own, because there is nothing for one to be offline from.
  check('no worker registers without a cabinet', bare.swRegistrations === 0, `${bare.swRegistrations} registrations`);

  // ── 3. iOS: the donation link is the one thing that must not be on screen ───────────────────
  const ios = await boot({ kind: 'mobile', os: 'ios', version: '0.2.0' });
  check('iOS boots', ios.booted, ios.errors.slice(0, 2).join(' | '));
  check('iOS fires the ready callback', ios.readyFired, 'the native splash never lifts without it');
  check('iOS registers no service worker', ios.swRegistrations === 0, `${ios.swRegistrations} registrations`);
  // App Store 3.2.1(vii) and 4.7. Either one on its own is a rejection.
  check('iOS draws no donation link', !ios.text.includes(COFFEE));
  // The other half of the row has to survive — a repo link is not a payment CTA, and a row that
  // removed itself would leave 46 units of nothing at the foot of the menu.
  check('iOS keeps the repository link', ios.text.includes(IMPROVE_ALONE));
  check('iOS does not print the fragment', !ios.text.includes(IMPROVE), 'standing alone it needs the capital');

  // ── 4. Android: the same build, and the same answer — the store build is sold ─────────────
  // Play permits a donation link; the rule in `allowsDonationLinks` leaves it out anyway, because
  // asking somebody who has just paid for the game to also buy a coffee is a second ask. The
  // rule is the cabinet, not the OS, so Android reads exactly as iOS does.
  const android = await boot({ kind: 'mobile', os: 'android', version: '0.2.0' });
  check('Android boots', android.booted, android.errors.slice(0, 2).join(' | '));
  check('Android fires the ready callback', android.readyFired);
  check('Android draws no donation link', !android.text.includes(COFFEE), 'the store build is sold');
  check('Android keeps the repository link', android.text.includes(IMPROVE_ALONE));
  check('Android omits the old connective phrase', !android.text.includes(CONNECTIVE));

  // ── 5. Desktop: a cabinet that answers to no store ──────────────────────────────────────────
  const desktop = await boot({ kind: 'desktop', os: 'windows', version: '0.2.0' });
  check('desktop boots', desktop.booted, desktop.errors.slice(0, 2).join(' | '));
  check('desktop registers no service worker', desktop.swRegistrations === 0, `${desktop.swRegistrations} registrations`);
  check('desktop keeps the donation link', desktop.text.includes(COFFEE));
  check('desktop omits the old connective phrase', !desktop.text.includes(CONNECTIVE));
} finally {
  await browser.close();
  server.close();
}

const failed = checks.filter((entry) => !entry.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
