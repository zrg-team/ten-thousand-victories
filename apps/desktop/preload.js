/**
 * The cabinet declares itself — before the bundle's first line, which is what a preload is for.
 *
 * `src/main.ts` reads `usesServiceWorker()` at module scope and `index.html`'s inline script sizes
 * the splash from `window.__shell`, so the descriptor cannot arrive on `DOMContentLoaded`. A
 * preload runs before any page script, in an isolated world, and `contextBridge` copies what it
 * exposes onto the page's own `window` — functions included, as proxies that call back here.
 *
 * The shape is `ShellDescriptor` in `src/platform/shell.ts`. `os` and `version` come from the
 * main process synchronously so they are present on the very first read; the Steam bridge is
 * exposed only when Steam is actually running, so `shellSteam()` in the game answers `undefined`
 * at a desk without it rather than a bridge that silently drops every call.
 */
const { contextBridge, ipcRenderer } = require('electron');

const described = ipcRenderer.sendSync('shell:describe-sync');

const descriptor = {
  kind: 'desktop',
  os: described.os,
  version: described.version,
  toggleFullscreen: () => ipcRenderer.send('shell:toggle-fullscreen'),
  /**
   * The window's shape, as a mode the settings page can offer.
   *
   * `displayMode` is a snapshot of what the window was at launch, not a live reading — the page
   * reads it once to light the right tile, and the F key routes through the main process, which is
   * the only place that knows the truth. `displayModes` is what this platform actually has: two
   * everywhere, three on macOS, because only macOS has a fullscreen Space distinct from a
   * borderless window.
   */
  displayMode: described.displayMode,
  displayModes: described.displayModes,
  setDisplayMode: (mode) => ipcRenderer.send('shell:set-display-mode', mode),
  quit: () => ipcRenderer.send('shell:quit'),
  /**
   * The menu is on the glass. No native splash to lift — the window shows on `ready-to-show` — but
   * the updater listens: it is how a newly downloaded game proves it starts (`updater.js`).
   */
  ready: () => ipcRenderer.send('shell:ready'),
  /**
   * Game updates, the phone's contract: the cabinet answers through `window.__gameUpdateCheck`,
   * `__gameUpdateProgress` and `__gameUpdateReady`, and restarts into the new game on `applyUpdate`.
   * `canCheckForUpdate` is false in a development checkout, which has no business updating itself.
   */
  canCheckForUpdate: described.canCheckForUpdate === true,
  checkForUpdate: () => ipcRenderer.send('shell:check-update'),
  applyUpdate: () => ipcRenderer.send('shell:apply-update'),
};

if (described.steam) {
  descriptor.steam = {
    unlockAchievement: (id) => ipcRenderer.send('steam:unlock-achievement', id),
    setRichPresence: (key, value) => ipcRenderer.send('steam:set-rich-presence', key, value),
  };
}

contextBridge.exposeInMainWorld('__shell', descriptor);
