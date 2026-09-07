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

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
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
  win.once('ready-to-show', () => win.show());
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
ipcMain.on('shell:toggle-fullscreen', () => {
  if (win) win.setFullScreen(!win.isFullScreen());
});
ipcMain.on('shell:quit', () => app.quit());
// Synchronous on purpose: the preload needs `os` and `version` before the page's first script,
// and a promise would hand the bundle a descriptor with two holes in it.
ipcMain.on('shell:describe-sync', (event) => {
  event.returnValue = {
    os: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
    version: app.getVersion(),
    steam: Boolean(steam),
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
