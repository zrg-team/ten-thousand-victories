/**
 * The cabinet's game updates: a newer shell build, downloaded beside the one in the install.
 *
 * The web gets a new game through its service worker and the phone through EAS Update. This
 * cabinet has neither — it serves `web/` out of its own folder — so without this a desktop player
 * kept the game they installed until they installed again. With it they get the same thing the
 * other two get, told the same way: "Downloading version 1.1.6 · 45%" on the version line, then the
 * red "tap to update" line, and a reload into the new game. The game side is the phone's contract
 * unchanged (`src/pwa/updates.ts`): this file only fills in `checkForUpdate` / `applyUpdate` and
 * speaks through `window.__gameUpdateCheck`, `__gameUpdateProgress` and `__gameUpdateReady`.
 *
 * **Where the game comes from.** The deploy publishes `<updateUrl>/<line>/manifest.json`
 * (`scripts/desktop-web-manifest.mjs`): every file of the shell build with its size and sha256.
 * `line` is major.minor — a 1.1 cabinet only ever asks for `1.1/`, so a 1.2 game that needs a
 * newer cabinet never reaches it, which is the rule the phone's runtime version keeps.
 *
 * **Where it goes.** `userData/game-bundles/<version>-b<build>/`, built in a `.staging-` folder and
 * renamed into place once every file has been verified. A file whose sha256 matches the copy
 * already on disk is copied rather than downloaded, so an update that changed the bundle and a
 * dozen pictures downloads the bundle and a dozen pictures.
 *
 * **Which one runs.** At launch, the newest complete bundle on this line, if it is newer than the
 * one inside the install; otherwise the install's own. A Steam or installer update that ships a
 * newer game therefore wins over an older download without anyone deleting anything.
 *
 * **When a new game will not start.** A downloaded bundle is on probation until the game says it
 * reached the menu (`__shell.ready`). A renderer that dies, a page that fails to load, or no ready
 * inside `READY_TIMEOUT_MS` marks it bad — it is never offered again — and the cabinet falls back
 * to the game it had. A bundle that has reached the menu once is trusted after that: a crash on
 * the tenth launch is a bug to fix in a newer build, not a reason to throw away the current one.
 */
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');

/** How long a running cabinet leaves between its own quiet looks — the phone's resume interval. */
const RECHECK_MS = 30 * 60 * 1000;
/** From the page being asked for to the menu on the glass, for a bundle on probation. */
const READY_TIMEOUT_MS = Number(process.env.VAN_THANG_READY_TIMEOUT_MS) || 90 * 1000;
const DOWNLOADS_AT_ONCE = 6;
const FILE_TIMEOUT_MS = 60 * 1000;
const ATTEMPTS = 3;

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const lineOf = (version) => String(version || '').split('.').slice(0, 2).join('.');
const buildOf = (info) => Number.parseInt(info && info.build, 10) || 0;
const idOf = (info) => `${info.version}-b${buildOf(info)}`;
const hashFile = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  fs.createReadStream(file).on('error', reject).on('data', (chunk) => hash.update(chunk))
    .on('end', () => resolve(hash.digest('hex')));
});
/** A manifest path that stays inside the folder it is written to — no `..`, no drive, no root. */
const safePath = (value) => typeof value === 'string' && value.length > 0 && !value.startsWith('/')
  && !value.includes('\\') && !value.includes(':') && value.split('/').every((part) => part && part !== '.' && part !== '..');

function createUpdater({ app, net, webDir, updateUrl, log }) {
  const line = lineOf(app.getVersion());
  const root = path.join(app.getPath('userData'), 'game-bundles');
  const stateFile = path.join(root, 'state.json');
  /**
   * Off in a development checkout, which has no business rewriting the game it is testing — unless
   * a harness points it at its own server. `VAN_THANG_UPDATES=off` turns it off anywhere.
   */
  const overridden = Boolean(process.env.VAN_THANG_UPDATE_URL);
  const baseUrl = (process.env.VAN_THANG_UPDATE_URL || updateUrl || '').replace(/\/+$/, '');
  const enabled = Boolean(baseUrl) && (app.isPackaged || overridden) && process.env.VAN_THANG_UPDATES !== 'off';

  const bundled = {
    id: 'bundled',
    dir: webDir,
    info: readJson(path.join(webDir, 'version.json')) || { version: app.getVersion(), build: '0' },
  };

  const loadState = () => {
    const state = readJson(stateFile) || {};
    return {
      bad: state.bad && typeof state.bad === 'object' ? state.bad : {},
      confirmed: Array.isArray(state.confirmed) ? state.confirmed : [],
    };
  };
  let state = loadState();
  const saveState = () => {
    try {
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      log(`update state not saved: ${error.message}`);
    }
  };

  /** Every complete, not-bad bundle on this line that is newer than the install's own game. */
  const downloadedBundles = () => {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => {
        const dir = path.join(root, entry.name);
        const info = readJson(path.join(dir, 'version.json'));
        return info && fs.existsSync(path.join(dir, '.complete')) ? { id: idOf(info), dir, info } : null;
      })
      .filter((bundle) => bundle && bundle.id === path.basename(bundle.dir) && lineOf(bundle.info.version) === line
        && !state.bad[bundle.id] && buildOf(bundle.info) > buildOf(bundled.info))
      .sort((a, b) => buildOf(b.info) - buildOf(a.info));
  };

  let active = downloadedBundles()[0] || bundled;
  /** Downloaded this session and not yet running: what "tap to update" restarts into. */
  let pending = null;
  let busy = false;
  /**
   * A player asked while a check was already running — the automatic one, 15 s after the menu, is
   * exactly when somebody opening Settings to look taps the button. They were told "checking"; the
   * running check owes them its answer, or the Settings page says "checking" until the app is closed.
   */
  let answerOwed = false;
  let lastCheck = 0;
  let readyTimer = null;
  let tell = () => {};
  let reload = () => {};

  log(`game: ${active.id === 'bundled' ? 'bundled' : active.id} (version ${active.info.version}, build ${buildOf(active.info)}); updates ${enabled ? `from ${baseUrl}/${line}` : 'off'}`);

  const script = (fn, ...values) => `window.${fn} && window.${fn}(${values.map((v) => JSON.stringify(v)).join(', ')}); true;`;
  const say = {
    check: (news, version) => tell(script('__gameUpdateCheck', news, version || '')),
    progress: (value) => tell(script('__gameUpdateProgress', value)),
    ready: (version) => tell(script('__gameUpdateReady', version || '')),
  };

  /** Folders nobody will run again: superseded, bad, or a download that never finished. */
  const sweep = async () => {
    let entries = [];
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }
    const keep = new Set([active.dir, pending && pending.dir].filter(Boolean));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      if (keep.has(dir) || (busy && entry.name.startsWith('.staging-'))) continue;
      const info = readJson(path.join(dir, 'version.json'));
      const stale = entry.name.startsWith('.staging-') || !info || !fs.existsSync(path.join(dir, '.complete'))
        || state.bad[idOf(info)] || buildOf(info) <= buildOf(active.info) || lineOf(info.version) !== line;
      if (stale) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  };

  const fetchWithTimeout = async (url, { allowMissing = false } = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FILE_TIMEOUT_MS);
    try {
      const response = await net.fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (allowMissing && response.status === 404) {
        clearTimeout(timer);
        return null;
      }
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return { response, done: () => clearTimeout(timer) };
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  };

  const readManifest = async () => {
    const url = `${baseUrl}/${line}/manifest.json`;
    /**
     * No manifest for this line is an answer, not a failure: the site has moved on to a line that
     * needs a newer cabinet (1.2 publishes `1.2/` and nothing else), and this cabinet already has the
     * newest game it can run. The player who asked hears "up to date"; the store has the rest.
     */
    const fetched = await fetchWithTimeout(`${url}?t=${Date.now()}`, { allowMissing: true });
    if (!fetched) return null;
    const { response, done } = fetched;
    try {
      const manifest = await response.json();
      if (manifest.schema !== 1 || lineOf(manifest.version) !== line || buildOf(manifest) <= 0 || !Array.isArray(manifest.files)) {
        throw new Error(`manifest for ${line} is not one this cabinet reads`);
      }
      for (const file of manifest.files) {
        if (!safePath(file.path) || typeof file.url !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isInteger(file.size)) {
          throw new Error(`manifest entry refused: ${JSON.stringify(file).slice(0, 120)}`);
        }
      }
      if (!manifest.files.some((file) => file.path === 'index.html') || !manifest.files.some((file) => file.path === 'version.json')) {
        throw new Error('manifest has no index.html or version.json');
      }
      return { manifest, url };
    } finally {
      done();
    }
  };

  /** Downloads one file into place, hashing as it goes. `onBytes` hears every chunk. */
  const download = async (url, target, file, onBytes) => {
    let lastError;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      let counted = 0;
      try {
        const { response, done } = await fetchWithTimeout(url);
        try {
          const hash = crypto.createHash('sha256');
          const chunks = [];
          const reader = response.body.getReader();
          for (;;) {
            const { done: finished, value } = await reader.read();
            if (finished) break;
            hash.update(value);
            chunks.push(Buffer.from(value));
            counted += value.byteLength;
            onBytes(value.byteLength);
          }
          const digest = hash.digest('hex');
          if (counted !== file.size || digest !== file.sha256) {
            throw new Error(`${file.path}: got ${counted} bytes ${digest.slice(0, 12)}, expected ${file.size} ${file.sha256.slice(0, 12)}`);
          }
          await fsp.writeFile(target, Buffer.concat(chunks, counted));
          return;
        } finally {
          done();
        }
      } catch (error) {
        onBytes(-counted);
        lastError = error;
      }
    }
    throw lastError;
  };

  /**
   * `limit` workers over `items`. On the first failure the others take nothing new, and the call
   * rejects only once every one of them has stopped: `Promise.all` would reject while a download was
   * still writing into the staging folder, and the cleanup after it lost the race to that write.
   */
  const inParallel = async (items, limit, work) => {
    let next = 0;
    let failure = null;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failure && next < items.length) {
        const item = items[next];
        next += 1;
        try {
          await work(item);
        } catch (error) {
          failure = failure || error;
        }
      }
    });
    await Promise.all(runners);
    if (failure) throw failure;
  };

  /** Copy what is already on disk, download the rest, verify all of it, then rename into place. */
  const fetchBundle = async (manifest, manifestUrl) => {
    const info = { version: manifest.version, build: manifest.build, date: manifest.date };
    const id = idOf(info);
    const dest = path.join(root, id);
    const staging = path.join(root, `.staging-${id}`);
    await fsp.rm(staging, { recursive: true, force: true });
    await fsp.mkdir(staging, { recursive: true });

    const sources = [active.dir, bundled.dir].filter((dir, index, all) => all.indexOf(dir) === index);
    const toDownload = [];
    await inParallel(manifest.files, 8, async (file) => {
      const target = path.join(staging, ...file.path.split('/'));
      await fsp.mkdir(path.dirname(target), { recursive: true });
      for (const dir of sources) {
        const local = path.join(dir, ...file.path.split('/'));
        const stat = await fsp.stat(local).catch(() => null);
        if (stat && stat.isFile() && stat.size === file.size && await hashFile(local).catch(() => '') === file.sha256) {
          await fsp.copyFile(local, target);
          return;
        }
      }
      toDownload.push(file);
    });

    const total = toDownload.reduce((sum, file) => sum + file.size, 0);
    let received = 0;
    let told = -1;
    const onBytes = (bytes) => {
      received += bytes;
      const percent = total > 0 ? Math.floor((Math.max(0, received) / total) * 100) : 100;
      if (percent !== told && percent < 100) {
        told = percent;
        say.progress(percent / 100);
      }
    };
    log(`update ${id}: ${manifest.files.length - toDownload.length} files already here, downloading ${toDownload.length} (${(total / 1024 / 1024).toFixed(2)} MB)`);
    await inParallel(toDownload, DOWNLOADS_AT_ONCE, (file) => download(
      `${new URL(file.url, manifestUrl).href}?b=${buildOf(info)}`,
      path.join(staging, ...file.path.split('/')),
      file,
      onBytes,
    ));

    // The version file the cabinet reads at launch must describe the manifest it came with — the
    // same bytes, verified above like every other file.
    const written = readJson(path.join(staging, 'version.json'));
    if (!written || idOf(written) !== id) throw new Error(`version.json in the bundle says ${written && idOf(written)}, manifest says ${id}`);
    await fsp.writeFile(path.join(staging, '.complete'), `${manifest.files.length}\n`);
    await fsp.rm(dest, { recursive: true, force: true });
    await fsp.rename(staging, dest);
    return { id, dir: dest, info };
  };

  /**
   * Look for a newer game, and fetch it if there is one.
   *
   * As the phone's: only a check the player asked for says "up to date" or "could not check", because
   * volunteered on their own those are notices about nothing; a download under way, and the bundle
   * waiting after it, are told either way.
   */
  const check = async (manual) => {
    if (!enabled) {
      if (manual) say.check('failed');
      return;
    }
    if (pending) {
      say.ready(pending.info.version);
      return;
    }
    if (busy) {
      if (manual) {
        answerOwed = true;
        say.check('checking');
      }
      return;
    }
    busy = true;
    lastCheck = Date.now();
    if (manual) say.check('checking');
    let downloading = false;
    const asked = () => manual || answerOwed;
    try {
      const found = await readManifest();
      if (!found) {
        if (asked()) say.check('upToDate');
        return;
      }
      const { manifest, url } = found;
      const id = idOf({ version: manifest.version, build: manifest.build });
      if (buildOf(manifest) <= buildOf(active.info) || state.bad[id]) {
        if (asked()) say.check('upToDate');
        return;
      }
      downloading = true;
      say.check('installing', manifest.version);
      pending = await fetchBundle(manifest, url);
      log(`update ${pending.id}: ready`);
      say.ready(pending.info.version);
    } catch (error) {
      log(`update check failed: ${error.message}`);
      if (asked() || downloading) say.check('failed');
    } finally {
      busy = false;
      answerOwed = false;
      // After `busy` is down, so a download that failed half-way leaves no staging folder behind.
      void sweep();
    }
  };

  const onProbation = () => active.id !== 'bundled' && !state.confirmed.includes(active.id);

  /** Called by the cabinet each time it asks the window for the page. */
  const pageRequested = () => {
    clearTimeout(readyTimer);
    readyTimer = null;
    if (onProbation()) {
      readyTimer = setTimeout(() => failed(`no menu within ${Math.round(READY_TIMEOUT_MS / 1000)} s`), READY_TIMEOUT_MS);
    }
  };

  /**
   * The bundle on probation did not make it. Marks it, falls back to the best bundle left, and
   * reloads. Returns false when there is nothing to fall back from — the install's own game, or a
   * bundle that has already proved itself.
   */
  const failed = (reason) => {
    clearTimeout(readyTimer);
    readyTimer = null;
    if (!onProbation()) return false;
    log(`game ${active.id} failed on probation (${reason}); falling back`);
    state.bad[active.id] = reason;
    saveState();
    active = downloadedBundles()[0] || bundled;
    if (pending && state.bad[pending.id]) pending = null;
    reload(buildOf(active.info));
    return true;
  };

  let firstReady = true;
  /** The game reached its menu. Confirms a bundle on probation, re-tells a waiting update. */
  const ready = () => {
    clearTimeout(readyTimer);
    readyTimer = null;
    if (onProbation()) {
      state.confirmed = [...state.confirmed.filter((id) => fs.existsSync(path.join(root, id))), active.id];
      saveState();
      log(`game ${active.id}: reached the menu, confirmed`);
    }
    if (!enabled) return;
    // A reloaded page has forgotten the notice the last one was given.
    if (pending) say.ready(pending.info.version);
    if (firstReady) {
      firstReady = false;
      void sweep();
      // After the menu is up rather than during boot, which already has the disk and the GPU busy.
      setTimeout(() => void check(false), 15 * 1000);
      setInterval(() => {
        if (Date.now() - lastCheck >= RECHECK_MS) void check(false);
      }, 60 * 1000);
    }
  };

  /** "Tap to update": run the downloaded game. */
  const apply = () => {
    if (!pending) return;
    active = pending;
    pending = null;
    log(`game: switching to ${active.id}`);
    reload(buildOf(active.info));
  };

  return {
    enabled,
    activeDir: () => active.dir,
    connect: (hooks) => {
      tell = hooks.tell;
      reload = hooks.reload;
    },
    check,
    apply,
    ready,
    failed,
    pageRequested,
  };
}

module.exports = { createUpdater };
