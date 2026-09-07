# Steam

What Steam needs from this cabinet, and the three things that are easy to get wrong.

## Files

| File | What it is |
|---|---|
| `app_build.vdf` | The app build script steamcmd runs. App ID and depot IDs are placeholders until the listing exists. |
| `depot_build_<platform>.vdf` | One per depot: the folder to upload and what to leave out. |
| `stage.mjs` | Copies `../dist/<platform>-unpacked` into `content/<platform>/`, minus `steam_appid.txt` and `*.pdb`. |
| `content/` | Staged depot content. Build output, gitignored. |

## Upload

```bash
yarn desktop:build              # at the repository root: build:shell → sync → electron-builder --dir
node apps/desktop/steam/stage.mjs
steamcmd +login <account> +run_app_build "<absolute path>/apps/desktop/steam/app_build.vdf" +quit
```

Then set the build live on a branch in the partner site. `SetLive` is deliberately empty in the
script so a build uploaded by mistake goes nowhere.

## The overlay

The Steam Overlay works in this cabinet because Chromium is inside it. `steamworks.js` sets the two
switches it needs (`in-process-gpu`, `disable-direct-composition`) in `electronEnableSteamOverlay`,
which `main.js` calls before the window exists — the switches are ignored once the app is ready.
Steam must be running and the app must have been launched with an App ID (from Steam, or from
`steam_appid.txt` beside the binary at a desk) or the overlay has nothing to hook.

## `steam_appid.txt`

For a developer's desk only: a file beside `main.js` containing an App ID lets Steamworks initialise
without a Steam launch. App ID `480` (Valve's "Spacewar") works before the real listing exists. It is
gitignored, `stage.mjs` strips it, and the depot scripts exclude it a second time — a build that
ships with it launches as the wrong game.

## Steam Deck

Proton runs the Windows build as it is; a native Linux depot is optional and `electron-builder`
can produce it (`linux-unpacked`). Test with the Deck's own resolution, 1280×800 — the desktop
layout's sheet becomes 1216×760 there and the column keeps its 390 units.

## Achievements

Not yet. `window.__shell.steam.unlockAchievement(id)` reaches `client.achievement.activate(id)` in
`main.js`, and nothing in the game calls it — the definitions wait for the store listing. When they
exist: define them in the partner site, call the bridge from the game's own events, and keep the
ids in one file under `src/data/`.
