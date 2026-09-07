# Releasing the desktop build (Steam)

The desktop cabinet is `apps/desktop/`: Electron around the same shell build the phones serve.
This is the runbook — what to type, in what order, and the two mistakes that cost a release.

## Ship it

```bash
yarn desktop:build                  # build:shell → sync into apps/desktop/web → electron-builder --dir
node apps/desktop/steam/stage.mjs   # dist/<platform>-unpacked → steam/content/<platform>
steamcmd +login <account> +run_app_build "<repo>/apps/desktop/steam/app_build.vdf" +quit
```

Then set the build live on a branch in the Steamworks partner site. Every command runs from the
repository root except `steamcmd`, which wants an absolute path.

### The one rule

**Every build syncs.** `web/` inside the cabinet is a copy of `dist-shell/`, gitignored, replaced
whole by the sync. A cabinet built from a stale `web/` ships the previous game with the new version
number on it, and nothing in the build will tell you. `desktop:build` and `desktop:steam` both sync
first; if you ever run `electron-builder` by hand, run `yarn desktop:sync` before it.

### Prerequisites

- Node 22 and the repository installed (`corepack enable && yarn install`).
- `cd apps/desktop && npm install` — the cabinet installs separately and is not a yarn workspace,
  so the Pages deploy never pulls Electron. `steamworks.js` is a native module with prebuilt
  binaries; `postinstall` rebuilds it against the pinned Electron.
- Windows: nothing else. macOS: Xcode command-line tools. Linux: `electron-builder`'s own
  dependencies for AppImage (`fuse`, `rpm`/`dpkg` for the other targets).
- `steamcmd`, from Valve, logged in once by hand so the Steam Guard code is cached.

### Versions come from the repository

`apps/desktop/package.json` carries a `version`, and it is not where the version is typed: the
sync copies it from the root `package.json`. Bump the root, sync, build. The settings page prints
the cabinet's version beside the game's (the descriptor's `version`) and the two are the same
number by construction.

### Installers

`yarn desktop:build` packages the **folder** (`electron-builder --dir`) — that is what Steam wants,
because Steam ships a directory depot and does its own installing. A download outside Steam needs an
actual installer, which is `yarn desktop:installers` from the repository root:

```bash
yarn desktop:installers   # builds dist-shell, syncs web/, then NSIS / DMG / AppImage
```

Both go through `yarn desktop:sync` first, so the cabinet always packages the shell build that is on
disk right now rather than whatever `web/` happened to hold.

What comes out, named by version so two builds never overwrite each other:

| Platform | Artifact | Target |
|---|---|---|
| Windows | `dist/van-thang-<version>-setup-x64.exe` | NSIS |
| macOS | `dist/van-thang-<version>-<arch>.dmg` | DMG |
| Linux | `dist/van-thang-<version>-<arch>.AppImage` | AppImage |

The Windows installer is deliberately **assisted and per-user** (`oneClick: false`,
`perMachine: false`): it offers a directory, makes a Start-menu and desktop shortcut named
*Vạn Thắng*, and never raises a UAC prompt, because a per-user install writes only under the user's
own profile. A per-machine install would need elevation the game has no use for.

**Cross-building is not what these scripts do.** They pass
`--config.electronDist=node_modules/electron/dist` so electron-builder packages the runtime that is
already installed — this avoids a second download and the archive-extraction rename that fails with
`EPERM` on Windows — and that runtime is the host's. Build each platform on that platform, or call
`npx electron-builder` directly from `apps/desktop` with target flags and let it fetch the matching
runtime.

The installer is large — a little over 200 MB on Windows — and almost all of that is `web/`, which
is around 114 MB before compression. Most of it is `art/`, and some of that is superseded plate
versions still being shipped (`menu-layer-ground-v1..v5` where only v6 is drawn, and the same for
farm and bamboo). Trimming those is a service-worker precache change as much as a packaging one, so
it is its own job, not a packaging flag.

### Display modes

The cabinet offers **Windowed** and **Borderless**, and on macOS a third, **Fullscreen**. The row is
in Settings under *The picture*, and <kbd>F</kbd> / <kbd>F11</kbd> switches without going there.

Why the count differs is the whole design, and it is not an oversight:

- **Chromium never takes an exclusive, mode-setting fullscreen — on any platform.** What
  `win.setFullScreen(true)` gives on Windows and Linux is already a frameless window covering the
  monitor, which is what a game means by *borderless*, and it is why the Steam Overlay composites
  over it and alt-tab is instant. A separate "Fullscreen" tile beside "Borderless" there would be a
  control that does nothing, so it is not drawn.
- **macOS is the exception.** `setFullScreen(true)` moves the window to its own fullscreen *Space*:
  a separate desktop with the swipe animation, the menu bar hidden, and app switching that has to
  slide desktops. `setSimpleFullScreen(true)` is the pre-Lion behaviour — borderless over the
  desktop the player is already on. Both are worth having, so macOS lists all three.

The mode and the window's rectangle are remembered in `window-state.json` under Electron's
`userData`, **not** in the game's `localStorage`. They have to be: the window is created before any
page script runs, so a preference the renderer held would arrive a frame after the window it
describes. Two details that are easy to get wrong and are already handled:

- The saved rectangle comes from `getNormalBounds()`, not `getBounds()`. While the window is
  borderless the bounds *are* the monitor, and saving those makes the next windowed launch a
  monitor-sized window with a frame.
- A rectangle is only restored if some display still contains it, so a window remembered on a
  monitor that is no longer plugged in does not open off the edge of the world.

`yarn verify:display` is the gate, and it drives the real Electron app rather than the dev server —
every claim here is about a window and a browser tab has none. It runs against a throwaway
`--user-data-dir`, so it cannot leave your own game in whatever mode the last assertion set.

> **If it reports "Process failed to launch!"**, the environment has `ELECTRON_RUN_AS_NODE=1` in it.
> Every Electron-hosted terminal exports that — VS Code's integrated terminal included — and it makes
> the electron binary behave as plain Node, so `main.js` dies reaching for `protocol`. The harness
> strips the variable itself; anything else launching Electron from a terminal has to do the same.

### The icon is source, not build output

`apps/desktop/build/` is electron-builder's build-resources directory. Unlike `web/` and `dist/`
beside it, it is **committed**: it is source. It holds `icon.ico` (Windows) and `icon.png`
(macOS, Linux), cut by `yarn icon:desktop` from `apps/mobile/branding/dongho-river-foreground-v7.png`,
the transparent river master the favicons also come off.

Three rules it exists to keep:

- **Never point the packaging config back at `apps/desktop/web/`.** That directory is gitignored,
  and `npm run sync` deletes and rewrites it from `dist-shell` — the icon would vanish on a fresh
  clone. `test_scripts/verify/verify-river-icons.mjs` asserts the three `build.*.icon` paths.
- **The desktop icon is the mark alone, on nothing.** Windows draws icons as free-form shapes over
  the shell's own background, so the PWA sheet — the print *on* its cream giấy điệp — is the wrong
  source: it reads as a bright tile in a dark file list, and the ship inside it only gets three
  quarters of the box. The gate fails an icon with an opaque corner, or one whose mark does not
  fill its tile to `FILL` (0.96, with a pixel of slack each way for rounding at 16).
- **Ten sizes, cut individually.** 16 20 24 32 40 48 64 96 128 256. electron-builder's own PNG→ICO
  conversion emits seven and skips 20, 40 and 96 — the sizes Windows 11 asks for at 125%, 150% and
  250% scaling, which the shell then has to interpolate from a neighbour.

After editing the master or the cut, run `yarn icon:desktop` and commit the result;
`yarn icon:desktop:check` fails if what is on disk is not what the script would emit now.

## Steam

- **App ID and depot IDs** come from the partner site and go into `apps/desktop/steam/*.vdf`,
  where every id is a `REPLACE_WITH_…` placeholder until then.
- **Depots:** one per platform, uploaded from `steam/content/<platform>/`. Windows first; a
  native Linux depot is optional (Proton runs the Windows build on the Deck); macOS needs a
  notarised build only for distribution outside Steam.
- **The overlay** works — `steamworks.js` sets `in-process-gpu` and `disable-direct-composition`
  before the window exists. It needs Steam running and an App ID at launch.
- **Steam Deck:** 1280×800. The desktop layout's sheet is 1216×760 there; the column keeps its
  390 units, and Steam Input's default keyboard/mouse profile drives the game as a mouse would.
- **Achievements** are a follow-up. The bridge (`window.__shell.steam`) is in place; the ids are
  not, and nothing in `src/` calls it yet.
- **Overlay caveat that is not ours:** Steam Cloud is not configured. Saves are `localStorage`
  under Electron's user-data folder; Steam Auto-Cloud can be pointed at it from the partner site
  once the App ID exists.

## Dev loop

```bash
yarn dev                                # the game at http://127.0.0.1:5179
yarn desktop:sync && cd apps/desktop && npm start
```

In a browser, the desktop layout is asked for with `?layout=desktop` (a driven browser never
sniffs its way into it — `navigator.webdriver` keeps the harnesses on the phone layout) and pinned
from **Settings → Layout**. To force a layout while testing: `?layout=desktop`, `?layout=phone`
(alias `?layout=mobile`) for the phone column on a computer, and `?layout=auto` to set a pinned
Settings choice aside for that page and watch the detection itself (the `[layout]` console line
and `window.__layoutDiagnosis` say what it saw). `node test_scripts/verify/verify-desktop-layout.mjs` is the gate: the
sheet, the column, the keys, the resize, the cabinet's hands-on default, and the phone control.

## Signing

Optional for Steam on Windows and Linux. macOS builds distributed outside Steam need Developer ID
signing and notarisation through `electron-builder`'s `afterSign` hooks; inside Steam an unsigned
build launches through the Steam client. Signing material follows the mobile rule: never in the
repository, on any branch.

## Never commit

- `apps/desktop/web/`, `apps/desktop/dist/`, `apps/desktop/steam/content/` — build output.
  (`apps/desktop/build/` is the exception that is *not* output — see the icon section above.)
- `apps/desktop/steam_appid.txt` — the dev App ID; a depot that ships it launches as App 480.
- Any certificate, key or Steam login cache.
