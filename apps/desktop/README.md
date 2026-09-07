# Vạn Thắng — desktop

Electron around the shell build, for Steam and for a plain download. Windows, macOS and Linux from
one folder.

This replaced a Tauri stub. Tauri's window is WebView2 on Windows, and the Steam Overlay does not
hook WebView2 (Tauri's own issue on it is closed "not planned"); WebView2 also does not run under
Proton, which is every Steam Deck; and a native Linux Tauri build needs a WebKitGTK the Steam Linux
Runtime does not carry. Electron brings its Chromium with it, so the overlay works, Proton runs the
Windows build, and Linux needs nothing installed. The price is the download — about 200 MB — and
that is a price Steam players pay for every game.

## What the cabinet does

Exactly what [`../README.md`](../README.md) asks of every cabinet, and nothing the game could do
for itself.

1. **Serves `dist-shell/` from a real, stable origin.** `main.js` registers a privileged `app://`
   scheme and serves the synced copy in `web/` as `app://van-thang/`. That origin is a save-schema
   constant: every save is a `localStorage` key, and `localStorage` is keyed to the origin, so a
   cabinet that serves from a different origin than its predecessor has shipped a save wipe.
2. **Declares itself before the bundle's first line.** `preload.js` runs before any page script and
   puts `window.__shell` on the page through `contextBridge` — `kind: 'desktop'`, the OS, the
   version, `toggleFullscreen`, `quit`, `ready`, and the Steam bridge when Steam is running. The
   full type is `ShellDescriptor` in [`src/platform/shell.ts`](../../src/platform/shell.ts).
3. **Holds the Steamworks client in its own process.** The game calls two functions on the bridge
   and never sees a session. See [`steam/README.md`](steam/README.md).

With the descriptor present the game boots into the desktop layout — the world across the window,
the 390-unit chrome column at the right edge — and starts new runs with the hands-on rule on. Both
are the game's own decisions (`src/platform/layout.ts`); the cabinet only says what it is.

## Working on it

```bash
yarn desktop:sync        # at the repository root: yarn build:shell, then copy it into web/
cd apps/desktop
npm install              # installs separately — this folder is not a yarn workspace, on purpose
npm start                # electron .
```

`npm start` without Steam running is the ordinary case at a desk: the console says
`steam: not running` and the bridge is simply absent. To try the overlay, put a `steam_appid.txt`
containing `480` beside `main.js` and start Steam first.

Every build syncs first. `web/` is gitignored and `package.json`'s version is carried in from the
repository root by the sync — there is one place a version is typed.

```bash
yarn desktop:build       # sync, then electron-builder --dir → dist/<platform>-unpacked/
yarn desktop:steam       # desktop:build, then stage the depot content under steam/content/
yarn desktop:installers  # sync, then NSIS / DMG / AppImage, for a download outside Steam
```

All three are root scripts and all three sync first. The bare `npm run dist:installers` in this
folder does the packaging *without* the sync, so it ships whatever `web/` already held — reach for
it only when you have just synced by hand and know what is in there.

The runbook — accounts, the App ID, depots, signing, what to check on the first launch — is
[`docs/development/desktop-builds.md`](../../docs/development/desktop-builds.md).

The packaging scripts use the Electron runtime installed in `node_modules/electron/dist`.
This avoids a second download and the archive extraction rename that can fail with `EPERM`
on Windows. Run them on the target OS and architecture with Electron installed for that target.
For cross-compilation, invoke `npx electron-builder` directly from `apps/desktop` with the
desired target flags so it downloads the matching runtime instead.

## What it does not do

- **No unpacking, no embedded server.** The mobile cabinet archives the build and serves it over
  loopback because Android cannot read files inside its own APK. Electron reads its own folder.
- **No service worker.** The shell build never registers one, and every byte is already in the
  install.
- **No donation gate.** `allowsDonationLinks()` returns true for a desktop shell; if the Steam
  listing is paid, that is a one-line rule to revisit in `src/platform/shell.ts`.
