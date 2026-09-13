/**
 * The service worker, from the page's side of the glass.
 *
 * This is the only module in the game that touches `navigator.serviceWorker`. It registers the
 * worker `scripts/build-sw.mjs` emits, and turns the lifecycle — which is five states, three
 * events and a race — into one value the menu can render and one function it can call.
 *
 * The worker deliberately does not activate itself (see `scripts/sw-template.js`), so a downloaded
 * update sits in `waiting` until the player taps Reload. That is the whole reason this file has a
 * status rather than just a `register()`: somebody has to be told there is something to tap.
 */

import { getLanguage, t } from '../i18n';
import { applyShellUpdate, checkShellForUpdate, isShell, shellCanCheckForUpdate } from '../platform/shell';

export type UpdateStatus =
  /** Dev build, or a browser without service workers. Nothing to show. */
  | 'unsupported'
  /** The first copy is downloading. The game works, but is not yet offline-proof. */
  | 'caching'
  /** Cached and controlled. This is the resting state. */
  | 'offlineReady'
  /** A NEW version is downloading behind the running one. */
  | 'installing'
  /** A new version is cached and waiting for the tap. */
  | 'ready';

/**
 * The answer to a native shell's "Check for updates", shown under the version on the Settings
 * page. The web's check never sets it. Separate from `UpdateStatus`: the status is what the game
 * *has*; this is what the last tap *found*, and it is cleared the moment the status moves on.
 */
export type UpdateCheckResult = 'checking' | 'upToDate' | 'failed';

/** The version to bump — `package.json`, and nothing else. */
export const BUILD_VERSION = __APP_VERSION__;
/** Commits on HEAD at build time, or empty where git could not be reached. */
export const BUILD_NUMBER = __BUILD_NUMBER__;

/**
 * The build's date, written the way the player's language writes dates.
 *
 * Formatted here rather than baked into the bundle, because `2026-08-21` is not a date to a reader
 * of either language — and the two write it differently enough that one string cannot serve both.
 * Falls back to the ISO form on a browser without the locale data rather than showing nothing.
 */
export function buildDateLabel(): string {
  if (!__BUILD_DATE__) {
    return '';
  }
  try {
    return new Date(`${__BUILD_DATE__}T00:00:00`).toLocaleDateString(
      getLanguage() === 'vi' ? 'vi-VN' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' },
    );
  } catch {
    return __BUILD_DATE__;
  }
}

/**
 * "Which build have you got?", in one line.
 *
 * Composed from the parts that exist rather than from one template, so a build made outside a git
 * checkout prints "Version 0.2.0" and not "Version 0.2.0 · build  · ".
 *
 * Lives here, beside the three constants it reads, because two places print it now — the settings
 * page and the foot of the front page — and a version string that is assembled twice is a version
 * string that will eventually disagree with itself about what the player is running.
 */
export function buildStamp(): string {
  return [
    t('menu.update.version', { version: BUILD_VERSION }),
    BUILD_NUMBER ? t('menu.update.build', { build: BUILD_NUMBER }) : '',
    buildDateLabel(),
  ].filter(Boolean).join('  ·  ');
}

const listeners = new Set<(status: UpdateStatus) => void>();
let status: UpdateStatus = 'unsupported';
let checkResult: UpdateCheckResult | undefined;
let registration: ServiceWorkerRegistration | undefined;
/** Set the moment we ask a waiting worker to take over, so `controllerchange` reloads exactly once. */
let applying = false;

/** How often a tab that stays open goes looking for a new deploy. */
const POLL_MS = 30 * 60 * 1000;
/**
 * Floor on how often a check may actually go out. `visibilitychange` fires every time the player
 * switches app, and each check is a real request for a worker that names three hundred URLs —
 * on a phone that is somebody's data being spent to ask a question already answered a minute ago.
 */
const MIN_CHECK_GAP_MS = 5 * 60 * 1000;
let lastCheck = 0;

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export function getUpdateCheckResult(): UpdateCheckResult | undefined {
  return checkResult;
}

/** Whether a native shell can be asked for a newer game from the Settings page. The web never is. */
export function canCheckForUpdate(): boolean {
  return isShell() && shellCanCheckForUpdate();
}

function setCheckResult(next: UpdateCheckResult | undefined): void {
  if (next === checkResult) {
    return;
  }
  checkResult = next;
  for (const listener of listeners) {
    listener(status);
  }
}

/**
 * The package.json version of the incoming worker — the number in "Downloading version 0.3.1
 * (current 0.3.0)" — or undefined until it has answered, or forever if it never does (a worker
 * built before `GET_VERSION` carried the semver). The menu falls back to words without a number.
 */
let incomingVersion: string | undefined;

export function getIncomingVersion(): string | undefined {
  return incomingVersion;
}

/**
 * Ask a downloading or waiting worker which version it is.
 *
 * Asked on every `refresh` rather than once per worker: a message posted while the script is
 * still spinning up can be lost, and the same worker object is the one that later reaches
 * `waiting`. Replies are idempotent and refresh fires a handful of times per update, so the
 * repeat costs nothing.
 */
function askIncomingVersion(worker: ServiceWorker | null): void {
  if (!worker) {
    incomingVersion = undefined;
    return;
  }
  try {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const version = typeof event.data?.version === 'string' ? event.data.version : undefined;
      if (version && version !== incomingVersion) {
        incomingVersion = version;
        // Not a status change, but the line printing the status now has a number to add.
        for (const listener of listeners) {
          listener(status);
        }
      }
    };
    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  } catch {
    // Nothing to do: the menu simply says "new version" without saying which.
  }
}

/**
 * A native shell reporting that it has a newer game downloaded and waiting.
 *
 * The shell has no service worker — it cannot have one, the game is served from a loopback origin
 * inside the app — but it has exactly the same thing to say, and the player has exactly the same
 * decision to make. So it says it here rather than drawing a second update prompt of its own over
 * the top of the game: one notice, in the version line at the foot of the front page, whether the
 * new bundle arrived from a service worker or from the store.
 *
 * Called from the shell through `window.__shell` before it would otherwise have shown a bar.
 */
export function noteShellUpdate(version?: string): void {
  if (typeof version === 'string' && version.length > 0) {
    incomingVersion = version;
  }
  setStatus('ready');
}

/**
 * A shell that can check on request. It has everything `noteShellUpdate` assumed and one thing
 * more, so its resting state is the same `offlineReady` a registered worker rests in — the game is
 * inside the binary — and the Settings page draws the build card and its check button for it.
 */
export function registerShellUpdates(): void {
  if (!shellCanCheckForUpdate() || status !== 'unsupported') {
    return;
  }
  setStatus('offlineReady');
}

/**
 * What the shell's check found, called through `window.__gameUpdateCheck`. `installing` is a
 * download under way (the front page's "Downloading version …"); the bundle it ends in arrives
 * through `noteShellUpdate`.
 */
export function noteShellCheck(news: string, version?: string): void {
  if (news === 'installing') {
    if (typeof version === 'string' && version.length > 0) {
      incomingVersion = version;
    }
    setStatus('installing');
    return;
  }
  if (news !== 'checking' && news !== 'upToDate' && news !== 'failed') {
    return;
  }
  // A download that failed, or turned out to be nothing new, puts the front page back at rest.
  if (news !== 'checking' && status === 'installing') {
    incomingVersion = undefined;
    setStatus('offlineReady');
  }
  setCheckResult(news);
}
export function subscribeUpdateStatus(listener: (status: UpdateStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setStatus(next: UpdateStatus): void {
  if (next === status) {
    return;
  }
  status = next;
  // "Up to date" was true of the state being left; a new one owes nobody that sentence.
  checkResult = undefined;
  for (const listener of listeners) {
    listener(status);
  }
}

export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // A worker left over from a preview build, still holding the dev origin's port, serves last
  // week's bundle to a dev server that is right there recompiling — and every symptom of that
  // looks like a bug in the code you just wrote. Dev unregisters rather than skipping.
  if (!import.meta.env.PROD) {
    void navigator.serviceWorker.getRegistrations().then((existing) => {
      for (const worker of existing) {
        void worker.unregister();
      }
    });
    return;
  }

  // `updateViaCache: 'none'` is not optional. GitHub Pages serves with `max-age=600`, and the
  // browser is otherwise allowed to satisfy its own check for a new worker out of the HTTP cache —
  // which means asking the cached copy whether the cached copy has changed.
  const url = `${import.meta.env.BASE_URL}sw.js`;
  void navigator.serviceWorker
    .register(url, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
    .then(observe)
    .catch(() => {
      // A failed registration is not worth a console error on a player's phone: the game runs
      // exactly as it did before service workers, just without the offline copy.
      setStatus('unsupported');
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!applying) {
      // Somebody else's tap. One registration serves every client on the origin — an installed
      // app and a browser tab, or two tabs — so when one of them applies the update, the new
      // worker claims the rest of us on its way past. Nothing is waiting any more, which makes
      // the notice this page is showing a lie and its Reload button a no-op. Retract it.
      refresh();
      return;
    }
    window.location.reload();
  });
}

function observe(reg: ServiceWorkerRegistration): void {
  registration = reg;
  refresh();

  // A worker can already be waiting when the page opens — the update was downloaded during the
  // last visit and never applied. `updatefound` will not fire again for it.
  reg.addEventListener('updatefound', () => {
    const incoming = reg.installing;
    if (!incoming) {
      return;
    }
    refresh();
    incoming.addEventListener('statechange', refresh);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate();
    }
  });
  window.setInterval(checkForUpdate, POLL_MS);
}

function refresh(): void {
  if (!registration) {
    return;
  }
  if (registration.waiting && navigator.serviceWorker.controller) {
    askIncomingVersion(registration.waiting);
    setStatus('ready');
    return;
  }
  if (registration.installing) {
    // A first install is not an update. Without the controller check the very first visit reads
    // "new version installing", which is a lie about a game the player has never run before.
    if (navigator.serviceWorker.controller) {
      askIncomingVersion(registration.installing);
      setStatus('installing');
    } else {
      setStatus('caching');
    }
    return;
  }
  // No incoming worker any more — another client may have taken the update out from under the
  // notice, and a number left over from it would caption the wrong state next time.
  askIncomingVersion(null);
  setStatus(navigator.serviceWorker.controller ? 'offlineReady' : 'caching');
}

export function checkForUpdate(force = false): void {
  if (applying) {
    return;
  }
  // In a shell the check is the shell's to make; it answers through `noteShellCheck`.
  if (isShell()) {
    if (force && shellCanCheckForUpdate()) {
      checkShellForUpdate();
    }
    return;
  }
  if (!registration) {
    return;
  }
  // Offline, `update()` rejects and — in some browsers — takes the registration down with it.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  const now = Date.now();
  if (!force && now - lastCheck < MIN_CHECK_GAP_MS) {
    return;
  }
  lastCheck = now;
  void registration.update().then(refresh).catch(() => undefined);
}

/**
 * Take the update. Tells the waiting worker to stop waiting; the `controllerchange` above reloads
 * the page once it has.
 */
export function applyUpdate(): void {
  if (applying) {
    return;
  }
  // In a shell there is no waiting worker to tell to stop waiting, and reloading the page would
  // only re-serve the same files from the same loopback origin. The shell restarts itself onto
  // the bundle it downloaded; the game only has to ask.
  if (isShell()) {
    applying = true;
    applyShellUpdate();
    return;
  }
  const waiting = registration?.waiting;
  if (!waiting) {
    // The button was drawn from a status that went stale in the moment between: another client
    // took this same update and its worker claimed us. There is nothing left to tell to stop
    // waiting — but this page is still running the old bundle, so the reload is still the right
    // answer, and it is the only one that is not the button doing visibly nothing.
    window.location.reload();
    return;
  }
  applying = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // Belt and braces: if `controllerchange` never arrives — a worker that errored on activate, a
  // browser that does not fire it for a claimed client — reload anyway rather than leaving the
  // player looking at a button that did nothing.
  window.setTimeout(() => window.location.reload(), 3000);
}
