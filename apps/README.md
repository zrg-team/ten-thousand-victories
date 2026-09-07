# Cabinets

`src/` is the game. This folder holds the cabinets it is served from.

| Folder | Platform | State |
|---|---|---|
| `mobile/` | iOS + Android — Expo SDK 57, React Native 0.86, `react-native-webview` 14 | source complete, not yet installed |
| `desktop/` | Windows / macOS / Linux — Electron, for Steam | source complete; see its README |
| — | Web (PWA, GitHub Pages) | the repository root. Not a cabinet: it *is* the game, served. |

## The contract

Three rules. They are the whole architecture, and they exist so that adding a fourth platform is a
new folder in here rather than an edit to `src/`.

### 1 — One build serves every cabinet

```bash
yarn build:shell        # from the repository root → dist-shell/
```

Relative asset URLs, `__SHELL_BUILD__` true, and no service worker (`build:shell` simply never runs
`scripts/build-sw.mjs`). Mobile and desktop serve that same folder. There is no per-platform build
of the game, and there must never be one — the moment there are two, they drift.

### 2 — The cabinet declares itself; the game never sniffs

Before the bundle loads, a cabinet writes:

```ts
window.__shell = {
  kind: 'mobile' | 'desktop',
  os?: 'ios' | 'android' | 'windows' | 'macos' | 'linux',
  version?: string,
  ready?: () => void,
};
```

The full type is `ShellDescriptor` in [`src/platform/shell.ts`](../src/platform/shell.ts), which is
the only module in `src/` that knows a cabinet can exist. Nothing else imports `window.__shell`.

`ready` is supplied **by the cabinet** rather than the game reaching for a channel it knows about,
because the channels have nothing in common: React Native has `ReactNativeWebView.postMessage`,
an Electron preload has `ipcRenderer`, and the next one will have a third thing. One closure hides
all of them. The desktop cabinet adds `toggleFullscreen`, `quit` and a `steam` bridge the same way.

`os` is optional but worth supplying — it is what `allowsDonationLinks()` reads, and one mobile
build serves two stores whose rules differ.

### 3 — Serve over `http://127.0.0.1`, never `file://`

Every save in this game is a `localStorage` key — `mandate:snapshot:v1` and twelve siblings — and
`localStorage` is keyed to the origin. Three things follow:

- **`file://` is not an option.** WKWebView's `localStorage` there is documented as lossy, and
  Phaser's `load.svg` is XHR-backed, so all 267 portrait parts need file-URL access flags that
  Play's security scanner flags in turn.
- **The port is a schema constant.** Change it between releases and every player's reign becomes
  unreachable. Nothing errors; they simply find a new game. Treat it like `SAVE_SNAPSHOT_VERSION`.
- **A cabinet that serves from a different origin than its predecessor has shipped a save wipe.**

## Why cabinets install separately

`apps/mobile` is deliberately **not** a yarn workspace of the root. It has its own lockfile and is
installed only when you work on it.

The reason is CI: the Pages deploy runs `yarn install --immutable` at the root on every push to
`main`, and it builds the web bundle and nothing else. Making the React Native app a workspace
would pull its whole dependency tree into that job — slower, and a new way for a deploy of the web
game to fail because of a native toolchain it never touches.

The rule that falls out of it: **cabinets depend on the game's build output; the game depends on no
cabinet.** The root `package.json` gains no dependency from anything in here.
