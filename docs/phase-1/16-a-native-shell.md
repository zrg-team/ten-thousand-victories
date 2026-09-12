> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Vạn Thắng in a Native Shell

Research brief · Throne of Đại Việt

# Vạn Thắng in a Native Shell

Everything it takes to get a 4.9 MB Phaser game out of GitHub Pages and onto the App Store and Google Play — the wrapper, the origin, the splash, the offline story, and the two store deadlines already breathing down your neck.

22 Aug 2026
Expo SDK 57 · RN 0.86.2
Host: Windows 11 — no Mac
Game side: built & green

1. [The verdict](#verdict)
2. [What the calendar says](#clock)
3. [RN vs Capacitor](#wrapper)
4. [The origin decision](#origin)
5. [Service workers](#sw)
6. [The repo layout](#arch)
7. [What changed in the game](#repo)
8. [The build runbook](#build)
9. [The splash handoff](#splash)
10. [Full offline](#offline)
11. [Apple review](#apple)
12. [Google Play](#google)
13. [Trap register](#traps)

## The verdict

Read this and you can skip the rest until you start typing.

**Use Expo SDK 57 + `react-native-webview` 13.16.1, and serve the game from a loopback HTTP origin — not from `file://`.** Expo is the right call specifically because you are on Windows: EAS Build compiles the iOS binary on Apple hardware in the cloud, which is the only way you ship to the App Store without buying a Mac. Capacitor would leave you needing a macOS runner of your own.

The origin choice matters more than the wrapper choice. Every save in this game lives in `localStorage` — `mandate:snapshot:v1` and twelve siblings — and `localStorage` is keyed to the origin. On `file://` in WKWebView it is documented as lossy. Give the game a real `http://127.0.0.1` origin, pin the port forever, and the save layer works unchanged.

Two things would have got you rejected as-is: the **MoMo donation QR** (Apple forbids donations in games, twice over) and an **absolute asset path** baked into `dist/index.html` that 404s outside GitHub Pages. Both are now fixed.

**The game side is built and green.** `yarn build:shell` emits a shell build,
`src/platform/shell.ts` holds the contract, and
`test_scripts/verify/verify-shell.mjs` proves the three invisible promises — no worker
registers, the ready callback fires, and the donation link is drawn on Android and not on iOS —
across four simulated cabinets. The web build is untouched: 26/26 PWA checks, the smoke gate and
`verify-menu-fit` all still pass.

What is left is the part that needs accounts and money: an Apple Developer membership, a Play
Console account, and the closed-test window. Everything below is the map for that.

## What the calendar says

Two of these are live constraints on the build you are about to make, not future homework.

9 days
Play requires `targetSdk 36` for all new apps and updates
31 Aug 2026

71 days
Last day of the `targetSdk 36` extension, if you request one
1 Nov 2026

163 days
16 KB page-size support becomes a hard gate on Play updates
1 Feb 2027

In force
iOS builds must come from Xcode 26 / iOS 26 SDK
since 28 Apr 2026

In force
Apple's new age-rating questionnaire must be answered before you can submit
since 31 Jan 2026

The good news: Expo SDK 57 already targets API 36, ships React Native 0.86 with 16 KB-aligned native libraries, and EAS Build's default image is on the current Xcode. Staying current is the whole mitigation.

Plan around this one

If your Play developer account is a **personal** account created after 13 Nov 2023, you cannot publish to production until you have run a closed test with **12 testers opted in continuously for 14 days**. The clock only starts once Google approves the release *and* the twelfth tester has opted in. Budget three to four weeks and start recruiting testers before you write any code. Organisation accounts registered to a legal entity are exempt.

## React Native or Capacitor

You asked for React Native. Here is the honest comparison anyway, because one common claim about it is false.

The false claim, which you will meet in every comparison article: that React Native gives a Phaser game better graphics performance than Capacitor because it has "direct access to native rendering pipelines". It does not. Phaser draws to a WebGL canvas, and in both wrappers that canvas lives inside the *same* system WebView — WKWebView on iOS, the Chromium-based Android WebView on Android. Frame rate, JIT, GPU path: identical. WKWebView has run the same Nitro JavaScript engine as Safari since 2014, so you get full JIT either way.

What actually differs is the scaffolding around the canvas.

|  | Expo + react-native-webview | Capacitor |
| --- | --- | --- |
| **Build from Windows** | Yes EAS Build compiles iOS on hosted Macs; 15 iOS + 15 Android builds/month free | No Needs your own Mac or a macOS CI runner |
| **Local origin** | You build it — see the next section | Free: `capacitor://localhost` on iOS, `https://localhost` via `WebViewAssetLoader` on Android |
| **Asset bundling** | A config plugin or a bundled archive | `webDir: 'dist'`, one line |
| **Splash** | `expo-splash-screen` — good API, you wire the handoff | `@capacitor/splash-screen` — same idea |
| **Room to grow** | A real RN app. Native menus, a leaderboard screen, IAP, push — all outside the WebView | Web-only shell; native reach is via plugins |
| **Rendering perf** | Identical — same system WebView, same canvas | |

Capacitor solves the origin problem for free and would be less work if you had a Mac. You don't, and EAS is the cleanest answer to that — so React Native is genuinely the better fit here, not just the one you asked for. The origin work it costs you is about forty lines.

## The origin decision

Which URL scheme the game is served from determines whether saves persist, whether Phaser can load its 267 portrait parts, and whether Play's security scanner flags you.

| Strategy | How | What it costs | Verdict |
| --- | --- | --- | --- |
| **A** `file://` | Android `file:///android_asset/www/index.html`; iOS a bundle URL with `allowingReadAccessToURL`. Needs `allowFileAccess`, `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs`, and `originWhitelist: ['file://*']`. | Phaser's `load.svg` is XHR-backed, so without the file-URL flags all 267 face parts fail. `allowUniversalAccessFromFileURLs` is exactly what Play's "unsafe file inclusion" scanner looks for. And WKWebView's `localStorage` on `file://` is documented as lossy — that is where your save game lives. | Don't ship |
| **B** loopback HTTP | `@dr.pogodin/react-native-static-server` (lighttpd, v0.27.1, New-Architecture ready) serving `http://127.0.0.1:<fixed port>/`. | One native dependency, a server lifecycle to manage across foreground/background, and a first-launch extraction of the web bundle onto disk. Android needs that extraction anyway — the server cannot read files inside the APK. | Recommended |
| **C** scheme handler | Android `WebViewAssetLoader` at `https://appassets.androidplatform.net/assets/…`; iOS `WKURLSchemeHandler` on a custom scheme. | The cleanest result — a true `https` origin on Android, no extraction, no flags. But `react-native-webview` exposes neither, so it means `patch-package` or a small Expo native module you then maintain across SDK bumps. | Later, maybe |

### Why B wins on this codebase specifically

`127.0.0.1` and `localhost` are *potentially trustworthy origins* under the Secure Contexts spec, so secure-context-gated APIs behave. More importantly, it is a real origin: `localStorage`, `IndexedDB` and the whole storage partition are keyed to `http://127.0.0.1:PORT` and persist normally in the app container. Phaser's XHR loads are same-origin and need no flags. Nothing in the game changes.

Pin the port, forever

The origin *is* the save-file location. If a future release picks a different port, every player's `mandate:snapshot:v1` becomes unreachable and they lose their reign, their Legacy meta-progress and their Chronicle. Hard-code one port, treat it as a schema constant beside `SAVE_SNAPSHOT_VERSION`, and comment it as load-bearing. If you want belt and braces, mirror saves out to native storage over `postMessage`.

## Service workers: turn them off

The instinct is to keep the offline machinery you already built. Resist it.

Three facts, in order of how much they matter:

- **WKWebView has service workers disabled outright.** The only escape hatch is declaring `WKAppBoundDomains` in `Info.plist` (max ten domains) and setting `limitsNavigationsToAppBoundDomains = true` — which then locks the WebView down hard, restricting script injection and custom scheme handlers.
- **`file://` is never a secure context**, on any platform, so a service worker cannot register there regardless.
- **You do not need one.** All 303 files ship inside the binary. The worker's two jobs — hold an offline copy, and announce a new version — are taken over by the app bundle and the store respectively.

So gate the registration. In [main.ts:31](../../src/main.ts#L31), `registerServiceWorker()` is called unconditionally; in the shell it should not run at all, and any worker inherited from a previous install should be unregistered. [updates.ts](../../src/pwa/updates.ts) already has the exact shape for this — its dev branch unregisters existing workers and returns. Reuse that path.

The knock-on: [MenuScene](../../src/scenes/MenuScene.ts)'s "new version ready · Reload" row is driven by `UpdateStatus`, which will sit permanently at `'unsupported'`. That is already the "show nothing" state, so the menu degrades correctly — but confirm it, because a permanently blank row in the middle of the menu strip reads as a layout bug.

## The repo layout

One rule decides everything else: `src/` is the game, and it takes no dependency on any cabinet.

Without a contract between the game and the things that wrap it, every new platform edits
`src/`. Three platforms in, the game is full of `if (ios)`. With one, the game
is written once and a new platform is a new folder.

```
grand-rts-game/
├── src/                    the game — and src/platform/shell.ts, the only
│                           module in it that knows a cabinet can exist
├── index.html              the web target: not a cabinet, the game served
├── vite.config.ts          `--mode shell` → dist-shell/
├── apps/
│   ├── README.md           the contract, both directions
│   ├── mobile/             Expo SDK 57 · iOS + Android
│   └── desktop/            Tauri 2 — stub
└── test_scripts/verify/verify-shell.mjs
```

### Three rules

**One build serves every cabinet.** `yarn build:shell` emits
`dist-shell/` — relative asset URLs, `__SHELL_BUILD__` true, and no service
worker, because that script simply never runs `build-sw.mjs`. Mobile and desktop serve
the same folder. There must never be two builds of the game; the moment there are, they drift.

**The cabinet declares itself; the game never sniffs.** Before the bundle loads:

```
window.__shell = {
  kind: 'mobile' | 'desktop',
  os?: 'ios' | 'android' | 'windows' | 'macos' | 'linux',
  version?: string,
  ready?: () => void,
};
```

`ready` is supplied *by the cabinet* rather than the game reaching for a channel
it knows about, because the channels have nothing in common — React Native has
`ReactNativeWebView.postMessage`, Tauri has its event bus, the next one will have a third
thing. One closure hides all of them. This is why Tauri later is a folder in `apps/` and
not an edit to the game.

It has to be set *before the bundle's first line*, not on load:
`src/main.ts` asks `usesServiceWorker()` at module scope. On React Native that
means `injectedJavaScriptBeforeContentLoaded`; a message posted on
`onLoadEnd` arrives several hundred milliseconds too late, and the symptom is a service
worker registering inside the app.

**Cabinets install separately.** `apps/mobile` is deliberately not a yarn
workspace of the root. The Pages deploy runs `yarn install --immutable` at the root on
every push and builds the web bundle only; making the React Native app a workspace would drag its
whole dependency tree into that job. The root `package.json` gains nothing from any of
this — its only new line is the `build:shell` script.

## What changed in the game

Six edits, all of them small, all of them behind the contract. `yarn build`, the smoke gate, `verify-menu-fit` and all 26 PWA checks still pass unchanged.

### 1 — The bundle path is absolute and will 404

`dist/index.html` ships this:

```
<script type="module" crossorigin src="/Throne-of-Dai-Viet/assets/index-DqXKtP53.js"></script>
```

Every other reference in that file is `./`-relative and survives a move; this one does not, because [index.html](../../index.html) writes `src="/src/main.ts"` with a leading slash and Vite rewrites it against `base`. Outside GitHub Pages it points at nothing — a blank screen with one 404. Fix it with a native build mode:

vite.config.ts

```
const native = process.env.VITE_NATIVE === '1';

export default defineConfig(({ command, isPreview }) => ({
  // The native shell serves the build from its own root. A repository
  // sub-path baked into the bundle URL points at nothing there.
  base: native ? './' : (command === 'build' || isPreview ? homepagePath : '/'),
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __NATIVE_SHELL__: JSON.stringify(native),
  },
  // …unchanged
}));
```

package.json — add

```
"build:native": "cross-env VITE_NATIVE=1 tsc && vite build --outDir dist-native"
```

Note what is *missing* from that script: `build-sw.mjs`. A native build wants no `sw.js` at all.

### 2 — Gate the service worker on the same flag

src/main.ts

```
// The shell ships every byte in the binary; a worker there caches a copy of
// something already local, and cannot register on iOS in any case.
if (!__NATIVE_SHELL__) {
  registerServiceWorker();
}
```

Declare `__NATIVE_SHELL__: boolean` alongside the existing `__APP_VERSION__` declaration so TypeScript stays happy.

### 3 — The donation QR must go, on iOS at minimum

See [Apple review](#apple) — this is a rejection, not a risk. The gate is in
`renderSupportRow()` itself, not in `configuredSupportChannels()`: that
function looked like the natural choke point, but the coffee link is built unconditionally and the
modal falls back to a GitHub link when no channels are configured, so emptying it would have left
the link on screen doing something else.

On iOS the row keeps its second half and its full height — `SETTINGS_TOP` is measured
up from `SUPPORT_TOP`, so a row that removed itself would leave 46 units of nothing at the
foot of the menu. A repository link is not a payment CTA and is safe to keep.

One wrinkle worth the extra key: `menu.support.improve` is a sentence fragment by
design — "— or even better, help build the game" — and printed alone it reads as one, lowercase
*h* and all. It gets a second cut, `improveAlone`, in both catalogs.

### 4 — Portrait lock lives natively now

`manifest.webmanifest` declares `"orientation": "portrait"`. A web manifest is inert inside a WebView; the shell must lock it, via `"orientation": "portrait"` in `app.json` or `expo-screen-orientation` at runtime.

### 5 — `100dvh` becomes stable, and that is a gift

The `dvh` workaround in [index.html](../../index.html) exists because Safari's toolbars move the viewport. A WebView has no toolbars, so the height stops moving — one less class of layout bug. Keep `viewport-fit=cover` and let the shell decide whether the WebView sits inside or under the safe-area insets; `#game-root`'s `env(safe-area-inset-bottom)` padding only does its job if the WebView spans the full screen.

### 6 — Everything else that checked out

- **Size:** 303 files, 4.9 MB, of which 3.4 MB is the JS bundle. Bundling all of it is a non-decision.
- **`preserveDrawingBuffer`** is already gated behind `?capture=1` in [config.ts](../../src/game/config.ts) — correct, and it matters more on a phone GPU than in a desktop browser.
- **Fonts** are self-hosted, so nothing reaches for a CDN at boot.
- **No `fetch`, no `XMLHttpRequest`** anywhere in `src/`. The only network shape is Phaser's own loader, and everything it loads is local.
- **Thirteen `mandate:*` storage keys**, all `localStorage`, no IndexedDB. Simple to mirror to native storage later if you want the safety.

## The build runbook

A sibling `shell/` project that consumes the game's build output. The game repo keeps working exactly as it does now.

Layout: `shell/` beside `src/`, with a sync script that pulls `dist-native/` into it as a single archive. One archive rather than a folder of 303 files is deliberate — it dodges the fiddliest part of Expo config plugins, which is getting a *directory* into the iOS bundle as a folder reference, headlessly, from Windows, with no Xcode to fall back on.

1. ### Accounts and tools, before anything else

   - Node 20+, and `npm i -g eas-cli`
   - An Expo account — free tier is 15 iOS + 15 Android builds/month, plenty for a hobby release
   - Apple Developer Program — **$99/year**, and enrolment can take days. Start it now.
   - Google Play Console — **$25 once**, plus identity verification
   - If EU distribution matters: **trader status** in App Store Connect. Apple removes non-trader apps from EU storefronts under the DSA.
2. ### Install the cabinet

   ```
   # from the repository root — build the game for a cabinet
   yarn build:shell                 # → dist-shell/

   cd apps/mobile
   yarn install
   yarn sync                        # dist-shell/ → assets/web.zip + the launcher marks
   ```

   Take the version Expo pins, not the newest on npm: SDK 57 bundles `react-native-webview`
   **13.16.1**, and that is the one it was tested against. 14.x exists and is
   New-Architecture-only, which SDK 57 also is — but nothing is gained by leaving the supported path.
   Run `npx expo install --fix` rather than bumping any `expo-*` version by hand;
   it is the only thing that knows what this SDK shipped with.

   Not a one-off

   `assets/web.zip` is gitignored, so a fresh clone has no game in it — and every change
   to `src/` needs `build:shell` then `sync` before it reaches a
   device. The symptom of forgetting is worse than a failure: the app runs perfectly, on last week's
   game.
3. ### What each file does

   | File | Job |
   | --- | --- |
   | `App.tsx` | Unpacks the archive once, starts the loopback server, holds the splash until the game paints, forwards outbound links to the OS browser |
   | `src/descriptor.ts` | Builds the `window.__shell` string for `injectedJavaScriptBeforeContentLoaded` |
   | `plugins/withLoopbackCleartext.js` | Lets Android reach `127.0.0.1` — and nothing else |
   | `scripts/sync-web.mjs` | `dist-shell/` → `web.zip` + a build stamp + the launcher marks, copied from `public/` so the drum has one source |

   The extraction key is `git rev-list --count HEAD`, not a build clock — deliberately,
   and for the same reason the settings page uses it. A timestamp changes on every rebuild of identical
   source, so every launch would unpack 302 files to arrive at what was already on disk.
4. ### App configuration

   shell/app.json

   ```
   {
     "expo": {
       "name": "Vạn Thắng",
       "slug": "van-thang",
       "version": "0.2.0",
       "orientation": "portrait",
       "icon": "./assets/icon.png",
       "userInterfaceStyle": "automatic",
       "backgroundColor": "#201a12",
       "assetBundlePatterns": ["assets/**/*"],
       "ios": {
         "bundleIdentifier": "vn.zrgteam.vanthang",
         "buildNumber": "1",
         "supportsTablet": true,
         "requireFullScreen": true,
         "infoPlist": { "NSAllowsLocalNetworking": true }
       },
       "android": {
         "package": "vn.zrgteam.vanthang",
         "versionCode": 1,
         "adaptiveIcon": {
           "foregroundImage": "./assets/adaptive-icon.png",
           "backgroundColor": "#201a12"
         }
       },
       "plugins": [
         ["expo-splash-screen", {
           "backgroundColor": "#201a12",
           "image": "./assets/splash.png",
           "imageWidth": 220,
           "dark": { "backgroundColor": "#201a12" }
         }],
         ["expo-build-properties", {
           "android": { "targetSdkVersion": 36, "compileSdkVersion": 36 },
           "ios": { "deploymentTarget": "16.4" }
         }]
       ]
     }
   }
   ```

   Android cleartext

   Android blocks plain `http://` by default (`ERR_CLEARTEXT_NOT_PERMITTED`) — which is exactly what a loopback server serves. The narrow fix is a network security config that permits cleartext for `127.0.0.1` only, added through a small config plugin. Do *not* reach for the blunt `usesCleartextTraffic: true`; it permits cleartext to the whole internet and shows up in Play's security review.
5. ### Build profiles

   shell/eas.json

   ```
   {
     "cli": { "version": ">= 12.0.0", "appVersionSource": "local" },
     "build": {
       "development": { "developmentClient": true, "distribution": "internal" },
       "preview": {
         "distribution": "internal",
         "android": { "buildType": "apk" },
         "ios": { "simulator": false }
       },
       "production": {
         "autoIncrement": true,
         "android": { "buildType": "app-bundle" }
       }
     },
     "submit": { "production": {} }
   }
   ```
6. ### First real build

   ```
   # from the game repo
   npm run shell:sync

   # from shell/
   eas login
   eas build:configure
   eas build -p android --profile preview     # APK, sideload to a device
   eas build -p ios     --profile preview     # Apple credentials; TestFlight
   ```

   EAS will offer to generate and store your signing credentials — say yes on both platforms; it is far less painful than managing a keystore and provisioning profiles by hand from Windows. Expect roughly 10–20 minutes per build on the free tier, against a 45-minute timeout you will not come near.
7. ### Submit

   ```
   eas build -p android --profile production
   eas build -p ios     --profile production
   eas submit -p android --latest
   eas submit -p ios     --latest
   ```

   Then the paperwork: store listing, screenshots, age-rating questionnaire, privacy answers, and — on Play — the closed-test period if this is a new personal account.

## The splash handoff

There are several seams between tapping the icon and seeing the menu. A bad wrapper shows all of them.

What the player actually goes through: the OS launch image, then the native splash, then an empty WebView, then the HTML body colour, then Phaser's first painted frame. If the colours disagree or the splash lifts early, that reads as four distinct flashes — and it is the single most common reason a wrapped game *feels* like a wrapped game.

#### The fix, in three parts

**One colour, everywhere.** `#201a12` is already the `body` background in [index.html](../../index.html). Use it for the native splash background, the Android adaptive-icon background, the RN root `View`, and the WebView's own background. The only remaining change is Phaser's paper `#e9dfc2` arriving with the first frame — and that one reads as the game starting, which is what it is.

**Hold the splash until the game says so.** `preventAutoHideAsync()` goes in global scope, not in a hook — by the time a component mounts, the splash may already have gone. Then hide it only on a message from the game.

**Have the game announce itself — on a hook that already exists.** `index.html`
carries its own HTML splash, and `MenuScene` already takes it down on Phaser's first
`POST_RENDER`, for precisely the reason a native splash needs: `create()` runs
*before* the frame it built reaches the canvas, so anything firing there hands the shell a
promise the glass has not kept yet. Both splashes lift on the same signal.

src/scenes/MenuScene.ts — the existing POST\_RENDER handler

```
// A native shell's splash comes down on the same frame and for the identical reason: it is
// holding a full-screen image over a web view that has not painted anything yet, and it wants
// the one frame that is genuinely the menu. Two splashes, one signal.
this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
  window.__splashDone?.();
  notifyShellReady();
});
```

`notifyShellReady()` calls `window.__shell?.ready?.()` and swallows a throw —
a cabinet whose callback fails must not take the menu down with it.

Always have a watchdog

A splash that waits on a message will wait forever when the message never comes — a bad archive, a failed unzip, a server that did not start. The 15-second timer in `App.tsx` above is not defensive padding; without it, one broken build ships an app that never opens. Test it by deliberately corrupting `web.zip`.

For the extra polish: keeping the WebView at `opacity: 0` until `boot:ready` (as above) makes the handoff splash → game with nothing in between, and `SplashScreen.setOptions({ duration: 300, fade: true })` turns the cut into a cross-fade.

## Full offline

You already solved this once. In the shell it gets simpler, and the update story changes shape.

Offline stops being a feature and becomes a property: there is no network code left. The 303 files are in the binary, the server is on loopback, and airplane mode changes nothing. What you should *remove* is the machinery that used to provide it — the service worker registration, and `sw.js` from the native build output.

#### Prove it, don't assume it

- Install the APK, enable airplane mode *before first launch*, and boot. First launch is where the unzip happens; a bundle that quietly relied on a network fetch fails exactly here.
- Play a full Dragon Ascent run offline, kill the app from the switcher, relaunch, and confirm the run resumes — that is `mandate:snapshot:v1` surviving a process death, which is the real test of the origin decision.
- Check every portrait renders. The 267 face parts are the most numerous asset class and the one most likely to be missing from an archive.

### The update story

Losing the service worker means losing "new version ready · Reload". Three replacements, in ascending order of effort:

| Channel | What it updates | Cost |
| --- | --- | --- |
| **Store updates** | Everything. A new binary carries a new `web.zip`, which lands under a new `web-<build>` directory and unpacks on first launch. | Free, but review latency — currently 24–48 hours on the App Store — and no control over when players take it. |
| **`expo-updates`** | The RN JS and its assets, `web.zip` included. Effectively the service worker's job done by Expo, with the same download-then-apply-on-next-launch shape. | One dependency and an EAS channel. Free tier covers 1,000 monthly active users. |
| **Your own fetcher** | Download a new `web.zip` from GitHub Pages, unpack beside the current one, flip the directory pointer on next launch. Directly analogous to the worker you already wrote. | Most work, most control — and it resurrects the "new version ready" row you already built, pointed at a different mechanism. |

This is allowed

Shipping updated web content is explicitly permitted. Apple's executable-code clause (historically §3.3.2, now §3.3.1(B)) permits downloaded interpreted code run by WebKit or JavaScriptCore, and Guideline 4.7 covers HTML5 games as software not embedded in the binary. The catch: 4.7 content *may not* provide access to charitable donations or digital commerce. Which is the second reason the MoMo QR has to go.

## Apple review

One guaranteed rejection to fix, one guideline to design against, and a short pile of paperwork.

Fix before you submit — 3.2.1(vii) and 4.7

The MoMo donation link and QR in the menu will be rejected. Guideline **3.2.1(vii)** specifically excludes *tips and donations in games* from the external-link allowance, and Guideline **4.7** separately says HTML5 game content may not provide access to charitable donations. Two independent clauses, same outcome.

The 2025 Epic injunction did loosen external-purchase links on the US storefront — no entitlement needed, 0% commission for now — but that is Guideline 3.1.1, a different clause from the games carve-out. Not worth a rejection round-trip to test. Gate the support row off in the native build; keep it on the web version, where none of this applies.

### Guideline 4.2, Minimum Functionality

This is the guideline that kills webview wrappers: if an app is not particularly useful, unique, or app-like, it doesn't belong on the App Store. Apps that merely re-render a website get rejected, and 2026 enforcement is sharper than it was.

You are in a much better position than a typical wrapper, and it is worth understanding why: a wrapper's problem is that the website is the real product and the app adds nothing. Here *the app is the product*. There is no site to visit instead, it works in airplane mode, and it is a game — content Apple has never expected to be native UIKit. Reviewers still reject on *feel*, though, so remove every tell:

- No browser chrome of any kind — no URL bar, no back/forward, no reload, no share sheet that reveals a URL
- No navigation off-origin. The `onShouldStartLoadWithRequest` guard in `App.tsx` above is what enforces it.
- Fully functional with no network, from a cold install
- A native splash, a proper icon set, portrait lock, and keep-awake during a run
- At least one thing the web build cannot do — haptics on a battle result, or a native share of a finished reign. Cheap to add, and exactly the evidence 4.2 asks for.

### Paperwork

- **Xcode 26 / iOS 26 SDK** — mandatory for uploads since 28 April 2026. EAS's default image handles it; don't pin an old one.
- **Privacy manifest** (`PrivacyInfo.xcprivacy`) — Expo generates one. React Native uses `UserDefaults`, so that API reason must be declared; Expo's defaults cover it.
- **App Privacy answers** — the game collects nothing, so "Data Not Collected" across the board. Keep it that way and you skip an entire category of review friction.
- **Age rating** — the questionnaire changed on 31 January 2026 and must be answered before you can submit. Dragon Ascent's gacha will meet a simulated-gambling question; answer it honestly, it is in-game currency only and should not hurt.
- **EU trader status** — required under the DSA since February 2025. Without verified trader details the app is removed from EU storefronts.

## Google Play

Less risk on content, more on deadlines and process.

Play's equivalent of 4.2 is the **Minimum Functionality** policy, and 2026 enforcement is largely automated. It targets apps that mirror a website with nothing added; a bundled offline game with no remote origin is not what the scanner is hunting. Write the store listing as a game — screenshots of play, a game category, a feature graphic — and it reads correctly.

#### The deadlines that actually bind

- **`targetSdk 36` by 31 August 2026 — nine days.** Every new app and every update must target Android 16. Expo SDK 57 does by default; the `expo-build-properties` block above pins it explicitly. An extension to 1 November 2026 can be requested from the Play Console if you need it.
- **16 KB page sizes.** Required since 1 November 2025 for anything targeting API 35+, and a hard gate on updates from 1 February 2027. RN 0.86's native libraries are already aligned — verify it in the build log rather than assuming, since the static-server library ships compiled lighttpd.
- **Cleartext.** The loopback server needs a network security config scoped to `127.0.0.1`. A blanket `usesCleartextTraffic` is the kind of thing that draws a security warning in the Console.

#### Process

- $25 one-time registration, plus identity verification
- Closed test — 12 testers, 14 continuous days — if this is a personal account created after 13 Nov 2023. The clock starts only after Google approves the release *and* the twelfth tester opts in.
- Data safety form: no collection, no sharing
- An AAB, not an APK, for production — the `production` profile above already builds one

## Trap register

The things that will cost you an afternoon each, ranked by how quietly they fail.

Silent · costs saves

**The port is a schema constant.** Change it between releases and every save becomes unreachable. Nothing errors. Players simply find a new game where their reign was.

Silent · blank screen

**`base: './'` in the native build.** Forget it and `index.html` asks for `/Throne-of-Dai-Viet/assets/…`, gets nothing, and shows an empty page with no console anyone will read. Check the built HTML, not the config.

Silent · every outbound link

**External links do nothing unless the shell forwards them.**
`openExternalLink` (`src/utils/browser.ts:14`) builds an
`<a target="_blank">`. With `setSupportMultipleWindows={false}` that
arrives as an ordinary navigation, which the off-origin guard then blocks — so "Help build the
game" is a button that does nothing, with no error anywhere. The guard must return
`false` *and* hand the URL to `Linking.openURL`.

Loud, but late

**Android cleartext.** `ERR_CLEARTEXT_NOT_PERMITTED` appears only on a device, only in a release build, and only after you have waited out an EAS build. Scope the network security config to `127.0.0.1` on the first pass rather than discovering this twenty minutes at a time.

Passes review, fails players

**The server must survive backgrounding.** `stopInBackground: false`. Otherwise a player who takes a phone call comes back to a dead origin and a white screen, and a restart looks like a crash.

Only on the first cold launch

**The unzip is a real wait.** 4.9 MB across 303 files onto phone storage, once. Test it on a cheap Android device rather than the emulator, and keep the splash up for the duration — which the `boot:ready` handshake already does.

Worth checking early

**Phaser's `load.svg` is XHR-backed.** All 267 face parts and every icon go through `XHRLoader`, not `Image()`. On a real HTTP origin that is unremarkable — which is precisely the argument against `file://`, where it is the first thing to break.

Cosmetic, but it reads as a bug

**The menu's update row.** With the worker gated off, `UpdateStatus` stays at `'unsupported'` forever. That is the "render nothing" branch, so it should be fine — but look at the menu on a device and confirm there is no gap where the row used to be.

---

Compiled 22 August 2026 against Expo SDK 57 (React Native 0.86, React 19.2), `react-native-webview` 13.16.1 (what SDK 57 pins; 14.0.1 is merely newest on npm) and `@dr.pogodin/react-native-static-server` 0.27.1. Store policy current as of the same date; both stores move, and the Play target-API deadline in particular is nine days out.

Repo findings are from the built [dist/](../../dist) (303 files, 4.9 MB), [src/main.ts](../../src/main.ts), [src/pwa/updates.ts](../../src/pwa/updates.ts), [src/state/save.ts](../../src/state/save.ts), [src/data/support.ts](../../src/data/support.ts), [src/game/config.ts](../../src/game/config.ts) and [vite.config.ts](../../vite.config.ts).