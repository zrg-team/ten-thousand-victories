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
- `apps/desktop/steam_appid.txt` — the dev App ID; a depot that ships it launches as App 480.
- Any certificate, key or Steam login cache.
