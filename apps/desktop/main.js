/**
 * The desktop cabinet: Electron around the shell build, for Steam.
 *
 * Three jobs, and the contract in `../README.md` names all three. Serve `web/` — the synced copy of
 * `dist-shell/` — from a real, stable origin; declare the cabinet on `window.__shell` before the
 * bundle's first line (that is `preload.js`); and hold the Steamworks client in this process so
 * the game never sees a session. Everything else the game already does for itself.
 *
 * **The origin is a save-schema constant.** Every save is a `localStorage` key, and `localStorage`
 * is keyed to the origin. `app://van-thang` is what this cabinet has always served from; change
 * the scheme or the host and every player's reign is still on disk and unreachable. Treat it the
 * way `SAVE_SNAPSHOT_VERSION` is treated. `file://` is not an option for the same reason and one
 * more: Phaser's SVG loader is XHR-backed, and Chromium refuses cross-file XHR.
 *
 * Why Electron and not the Tauri stub this folder used to hold: the Steam Overlay hooks the
 * process that presents the frame, and WebView2 presents from a process the overlay cannot
 * reach — Tauri's issue on it is closed "not planned" — while WebView2 does not run under Proton
 * at all, which is every Steam Deck. Chromium is inside this binary, so the overlay works with
 * the two switches `electronEnableSteamOverlay` sets, and Proton runs the Windows build as it is.
 */
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron');

const ORIGIN_SCHEME = 'app';
const ORIGIN_HOST = 'van-thang';
const WEB_DIR = path.join(__dirname, 'web');

/**
 * Steam, when it is there.
 *
 * `steamworks.js` is a native module and `init` throws without a running Steam client or an app
 * id; both are ordinary at a developer's desk, so the cabinet runs without either and the bridge
 * on `window.__shell.steam` is simply absent. `steam_appid.txt` beside the binary is the local
 * dev id (App ID 480, Valve's own "Spacewar", answers before the real listing exists); a Steam
 * launch sets `SteamAppId` itself and needs no file. The file must never ship in a depot.
 */
let steam = null;
function initSteam() {
  try {
    const steamworks = require('steamworks.js');
    const client = steamworks.init();
    steam = { client, steamworks };
    console.log(`[cabinet] steam: ${client.localplayer.getName()}`);
  } catch (error) {
    console.log(`[cabinet] steam: not running (${error.message.split('\n')[0]})`);
  }
}

/**
 * A privileged scheme so the origin is a *real* origin — `standard` gives it a host and an origin
 * for storage, `secure` lets service-worker-free PWAs and fonts behave as on https, and
 * `supportFetchAPI` is for Phaser's loader. Registered before `ready`, as Electron requires.
 */
protocol.registerSchemesAsPrivileged([{
  scheme: ORIGIN_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

function serveWeb() {
  protocol.handle(ORIGIN_SCHEME, (request) => {
    const url = new URL(request.url);
    // `normalize` then a prefix test: without it `app://van-thang/../..` walks out of `web/`.
    let file = path.normalize(path.join(WEB_DIR, decodeURIComponent(url.pathname)));
    if (!file.startsWith(WEB_DIR)) return new Response('not found', { status: 404 });
    if (url.pathname === '/' || url.pathname === '') file = path.join(WEB_DIR, 'index.html');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('not found', { status: 404 });
    return net.fetch(`file://${file}`);
  });
}

let win = null;

// ── Display mode ─────────────────────────────────────────────────────────────────────────────
/**
 * Three modes, and only macOS has three.
 *
 * Chromium never takes an exclusive, mode-setting fullscreen — not on any platform. What
 * `setFullScreen(true)` gives on Windows and Linux is already a frameless window covering the
 * monitor, which is what a game means by *borderless*, and it is why the Steam Overlay composites
 * over it and alt-tab is instant. So on those two platforms an extra "Fullscreen" tile beside
 * "Borderless" would be a control that does nothing, and it is not offered.
 *
 * macOS is the one that genuinely differs. `setFullScreen(true)` there moves the window to its own
 * fullscreen *Space*: a separate desktop with the swipe animation, the menu bar hidden, and app
 * switching that has to slide desktops. `setSimpleFullScreen(true)` is the pre-Lion behaviour —
 * a borderless window over the current desktop, which is the mode a player alt-tabbing between the
 * game and a guide actually wants. Both are worth offering, so on macOS both are.
 */
const MODES = process.platform === 'darwin'
  ? ['windowed', 'borderless', 'fullscreen']
  : ['windowed', 'borderless'];

/**
 * Where the mode and the window's shape are remembered.
 *
 * The main process owns this rather than the game's `localStorage`, and it has to: the window is
 * created before any page script runs, so a preference the renderer holds would arrive one frame
 * after the window it describes. `userData` is per-user and survives an update, which is the same
 * place Chromium keeps its own profile.
 */
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

const readState = () => {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      mode: MODES.includes(state.mode) ? state.mode : 'windowed',
      covering: MODES.includes(state.covering) && state.covering !== 'windowed' ? state.covering : null,
      bounds: state.bounds && typeof state.bounds.width === 'number' ? state.bounds : null,
    };
  } catch {
    // No file on a first launch, and a corrupt one is not worth a dialog — a game that will not
    // start because it cannot parse its own window size is a worse bug than a forgotten size.
    return { mode: 'windowed', covering: null, bounds: null };
  }
};

let displayMode = 'windowed';
/**
 * The last mode that covered the screen, so F toggles back into the one the player chose.
 *
 * Without it, a macOS player who picked the native Space in settings and then pressed F twice would
 * land in borderless — the key would have quietly rewritten their setting.
 */
let lastCovering = null;

const saveState = () => {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    // `getNormalBounds` and not `getBounds`: while the window is borderless the bounds *are* the
    // monitor, and saving those would make the next windowed launch a frameless-sized window.
    const bounds = win && !win.isDestroyed() ? win.getNormalBounds() : null;
    fs.writeFileSync(STATE_FILE, JSON.stringify({ mode: displayMode, covering: lastCovering, bounds }, null, 2));
  } catch {
    // A read-only profile is not a reason to fail a quit.
  }
};

/**
 * Leaves whichever mode is on, then enters the asked-for one.
 *
 * The leave step is not optional on macOS: a window in a fullscreen Space that is told to become
 * simple-fullscreen keeps the Space and gains nothing, so the two have to be unwound in order.
 */
function applyDisplayMode(mode) {
  if (!win || win.isDestroyed()) return;
  displayMode = MODES.includes(mode) ? mode : 'windowed';
  if (displayMode !== 'windowed') lastCovering = displayMode;

  if (process.platform === 'darwin' && win.isSimpleFullScreen()) win.setSimpleFullScreen(false);
  if (win.isFullScreen()) win.setFullScreen(false);

  if (displayMode === 'borderless') {
    if (process.platform === 'darwin') win.setSimpleFullScreen(true);
    else win.setFullScreen(true);
  } else if (displayMode === 'fullscreen') {
    win.setFullScreen(true);
  }
  saveState();
}

/**
 * Only restores a saved rectangle if some display still contains it.
 *
 * A window remembered on a second monitor that is no longer plugged in is a window opened off the
 * edge of the world, with no frame on screen to drag it back by.
 */
function usableBounds(bounds) {
  if (!bounds) return null;
  const { screen } = require('electron');
  const visible = screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return bounds.x < area.x + area.width && bounds.x + bounds.width > area.x
      && bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;
  });
  return visible ? bounds : null;
}

function createWindow() {
  const saved = readState();
  lastCovering = saved.covering;
  const bounds = usableBounds(saved.bounds);
  win = new BrowserWindow({
    width: bounds ? bounds.width : 1280,
    height: bounds ? bounds.height : 720,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 960,
    minHeight: 540,
    // The paper, so the first frame is not a white flash before the splash.
    backgroundColor: '#e9dfc2',
    title: 'Vạn Thắng',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  // Before `show`, so a player who left the game borderless does not watch it open as a 1280x720
  // window and then jump. `show: false` above holds the frame back until this has run.
  applyDisplayMode(saved.mode);
  win.once('ready-to-show', () => win.show());
  // Not on 'closed': the window is gone by then and `getNormalBounds` has nothing to report.
  win.on('close', saveState);
  // Off-origin links — the repository, the coffee — open in the player's own browser, not here.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`${ORIGIN_SCHEME}://`)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN_SCHEME}://`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  win.loadURL(`${ORIGIN_SCHEME}://${ORIGIN_HOST}/`);
  win.on('closed', () => { win = null; });
}

// ── The bridge the preload calls ─────────────────────────────────────────────────────────────
/**
 * F / F11. Windowed goes to the last fullscreen-ish mode the player chose, and anything else comes
 * back to windowed — so the key and the settings row can never disagree about what is on screen.
 */
ipcMain.on('shell:toggle-fullscreen', () => {
  if (!win) return;
  applyDisplayMode(displayMode === 'windowed' ? (lastCovering || 'borderless') : 'windowed');
});
ipcMain.on('shell:set-display-mode', (_event, mode) => {
  if (typeof mode === 'string') applyDisplayMode(mode);
});
ipcMain.on('shell:quit', () => app.quit());
// Synchronous on purpose: the preload needs `os` and `version` before the page's first script,
// and a promise would hand the bundle a descriptor with two holes in it.
ipcMain.on('shell:describe-sync', (event) => {
  event.returnValue = {
    os: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
    version: app.getVersion(),
    steam: Boolean(steam),
    displayMode,
    displayModes: MODES,
  };
});
ipcMain.on('steam:unlock-achievement', (_event, id) => {
  if (!steam || typeof id !== 'string') return;
  try {
    steam.client.achievement.activate(id);
  } catch (error) {
    console.log(`[cabinet] achievement ${id}: ${error.message}`);
  }
});
ipcMain.on('steam:set-rich-presence', (_event, key, value) => {
  if (!steam || typeof key !== 'string') return;
  try {
    steam.client.localplayer.setRichPresence(key, typeof value === 'string' ? value : null);
  } catch (error) {
    console.log(`[cabinet] rich presence ${key}: ${error.message}`);
  }
});

initSteam();
// The overlay's two Chromium switches (`in-process-gpu`, `disable-direct-composition`) have to be
// appended before the app is ready — which is why Steam is initialised at the top of the file.
if (steam) {
  try {
    steam.steamworks.electronEnableSteamOverlay();
  } catch (error) {
    console.log(`[cabinet] overlay: ${error.message}`);
  }
}

app.whenReady().then(() => {
  serveWeb();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // The macOS convention keeps an app alive without windows; a game has nothing to do there.
  app.quit();
});
