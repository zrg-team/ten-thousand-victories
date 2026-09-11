import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
import * as Updates from 'expo-updates';
import Server, { ERROR_LOG_FILE, STATES, getActiveServerId } from '@dr.pogodin/react-native-static-server';

import { shellDescriptorScript } from './src/descriptor';
import version from './assets/web-version.json';

/**
 * Load-bearing, and a schema number rather than a setting.
 *
 * The origin is where every save lives: `mandate:snapshot:v1` and its twelve siblings are
 * `localStorage` keys, and `localStorage` is partitioned by origin. Change this and no error is
 * raised anywhere — players simply open the app to a new game where their reign used to be.
 */
const PORT = 39217;

/**
 * The two inks the shell paints, and which surface each belongs to.
 *
 * `INK` used to be described here as *the ink the HTML body paints — splash, shell and first
 * frame all agree on it*, and that stopped being true when the game's own launch splash moved to
 * the điệp sheet. `index.html` paints `#e9dfc2` on `body`, `#splash` and `#game-root`; the shell
 * went on painting `#201a12` behind it and under the safe-area insets. So a launch went dark
 * brown (native splash) → dark brown (shell) → cream (game), with a hard flash at the join and a
 * dark border around the game on any phone with insets — and `assets/splash.png` is itself drawn
 * on paper, so the native splash showed a cream square floating on a brown field.
 *
 * Paper is now what every surface the *game* occupies paints. Ink is kept for the one screen
 * that is not the game: the diagnostic, which is the shell speaking as itself.
 */
const INK = '#201a12';
const PAPER = '#e9dfc2';

/**
 * How long the page gets to report a painted frame, counted from the moment it is asked for.
 * A first miss asks for the page again; the second shows the diagnostic.
 */
const WATCHDOG_MS = 25_000;
/** How long the shell's own steps get — the archive, the unpack, the server — before the page. */
const SETUP_MS = 90_000;

// Global scope, not inside a hook. By the time a component mounts the splash may already have
// auto-hidden, and then there is nothing left to prevent.
void SplashScreen.preventAutoHideAsync();

/** `file:///a/b` → `/a/b`. Both the unzipper and the server want paths, not URLs. */
const asPath = (uri: string): string => {
  const withoutScheme = uri.replace(/^file:\/\//, '').replace(/\/$/, '');
  try {
    return decodeURIComponent(withoutScheme);
  } catch {
    // A stray `%` that is not an escape sequence. A raw path beats no path at all.
    return withoutScheme;
  }
};

/** How many times to try the origin before calling it dead, and how long to wait between. */
const KNOCKS = 10;
const KNOCK_GAP_MS = 300;

/**
 * The web view's process can be killed under a backgrounded app — Android's renderer under memory
 * pressure, WebKit's content process on iOS — and what is left on screen is a white view that
 * never paints again: "focus the app and it is blank". Neither platform brings it back on its own.
 *
 * Two things follow. The view is remounted under a new `key` rather than reloaded, because Android
 * leaves the dead one unusable and a `reload()` on it does nothing. And the page is told why, in
 * the same `sessionStorage` slot `src/game/resilience.ts` writes before its own reloads, so
 * `MenuScene` offers the run the game autosaved on the way out — in a sheet the player answers,
 * never resumed for them.
 */
const RELOAD_REASON_KEY = 'mandate:reload-reason:v1';
function reloadReasonScript(count: number): string {
  const reason = JSON.stringify({ cause: 'shell-restart', count, at: new Date().toISOString() });
  return `try { sessionStorage.setItem(${JSON.stringify(RELOAD_REASON_KEY)}, ${JSON.stringify(reason)}); } catch (e) {}\n`;
}

/**
 * Asked of the page every time the app comes back to the foreground. A live page answers within
 * a frame with its own health reading; a dead process answers nothing, which is the one signal
 * neither platform's termination callback is guaranteed to give.
 */
const HEALTH_PING = `(function () {
  var health = window.__health ? JSON.stringify(window.__health()) : '{}';
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('pong:' + health);
})(); true;`;
/**
 * Generous on purpose: a page that is alive but busy — rebuilding the map on the resume frame on
 * a slow phone — must not be mistaken for a dead one. A wrong restart costs a reload, never a run.
 */
const PONG_MS = 4000;

/**
 * Ask the origin for the game's own index, from the JS thread.
 *
 * Deliberately `index.html` rather than `/`: a directory index can be answered by a server that
 * cannot actually read the folder it was pointed at, and that is one of the failures worth
 * catching here rather than as a blank canvas later.
 */
async function knock(origin: string, attempts: number = KNOCKS): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${origin}/index.html`, { method: 'GET' });
      if (response.ok) return true;
    } catch {
      // Refused, reset, or unresolvable — all the same answer at this level: not yet.
    }
    await new Promise((wait) => setTimeout(wait, KNOCK_GAP_MS));
  }
  return false;
}

/** lighttpd's own account of why it would not serve, if it wrote one. */
async function lighttpdLog(): Promise<string> {
  try {
    const log = new File(ERROR_LOG_FILE);
    if (!log.exists) return 'lighttpd wrote no error log';
    const tail = log.textSync().trim().split('\n').slice(-4).join(' / ');
    return tail ? `lighttpd: ${tail}` : 'lighttpd error log is empty';
  } catch (error) {
    return `lighttpd log unreadable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function Shell() {
  const [origin, setOrigin] = useState<string>();
  const [ready, setReady] = useState(false);
  /**
   * What went wrong, in the player's hands rather than in a log they cannot reach.
   *
   * Without this the failure mode is a WebView showing `ERR_CONNECTION_REFUSED` on a white page —
   * which says the server is not listening but nothing about *why*, and looks to a player like a
   * broken app rather than a broken server. Every step below appends to it.
   */
  const [diary, setDiary] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  /** Bumped to run the boot again from the diagnostic's Try again. */
  const [bootKey, setBootKey] = useState(0);
  /** When this boot began, so every diary line carries how long the shell had been at it. */
  const bootStart = useRef(Date.now());
  /** First-paint misses this boot: one earns a remount, the second the diagnostic. */
  const paintMisses = useRef(0);

  /**
   * The status bar and the gesture pill, kept off the game.
   *
   * `index.html` asks for `viewport-fit=cover` and pads `#game-root` by
   * `env(safe-area-inset-bottom)`, which is the right answer in Safari and no answer at all here:
   * Android's web view reports every `safe-area-inset-*` as zero, so the header printed under the
   * clock and "Choose this champion" sat beneath the home indicator. Only the shell knows the real
   * numbers, so the shell is what applies them.
   *
   * Padding the container rather than injecting the values as CSS: the game lays out against a
   * fixed 390-wide design surface and fits itself to whatever box it is handed, so handing it a
   * box that is already safe needs nothing from the game at all — and works the same on iOS, where
   * the insets are real but the game only ever compensated for the bottom one.
   */
  const insets = useSafeAreaInsets();
  // React 19 requires the initial value spelled out; `useRef<T>()` no longer implies undefined.
  const server = useRef<Server | undefined>(undefined);
  const web = useRef<WebView>(null);
  /** Bumped to mount a fresh web view after its process died — see `reloadReasonScript`. */
  const [webKey, setWebKey] = useState(0);
  const restarts = useRef(0);
  /** When the page last answered `HEALTH_PING`. */
  const pongAt = useRef(0);

  const note = useCallback((line: string) => {
    // Stamped with the seconds since boot: a diary without a clock could not say whether the
    // twenty seconds went on the download, the unpack or the page.
    const at = ((Date.now() - bootStart.current) / 1000).toFixed(1);
    setDiary((prior) => [...prior, `${at}s ${line}`]);
  }, []);

  const restart = useCallback((why: string) => {
    restarts.current += 1;
    note(`web view restart ${restarts.current}: ${why}`);
    setWebKey((key) => key + 1);
  }, [note]);

  useKeepAwake();

  const reveal = useCallback(() => {
    setReady(true);
    void SplashScreen.hideAsync();
  }, []);

  const giveUp = useCallback(
    (line: string) => {
      note(line);
      setFailed(true);
      reveal();
    },
    [note, reveal],
  );

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      bootStart.current = Date.now();
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);

      // Which bundle this is, first line of the diary: an over-the-air update or the one in the
      // binary, and whether expo-updates fell back to an older one because the newer failed to
      // launch. Without this a report of *it reverted to the previous version* cannot be told
      // apart from *it never applied*.
      note(`bundle ${Updates.isEmbeddedLaunch ? 'embedded' : `update ${Updates.updateId ?? '?'}`}${Updates.isEmergencyLaunch ? ` — EMERGENCY LAUNCH: ${Updates.emergencyLaunchReason ?? 'no reason given'}` : ''}`);

      // The archive first. Its hash is the identity of the game actually inside this binary, and
      // the only thing guaranteed to change when the game does.
      const [asset] = await Asset.loadAsync(require('./assets/web.zip'));
      if (!asset?.localUri) {
        throw new Error('web.zip did not resolve — run `npm run sync`');
      }

      /**
       * One directory per *archive*, not per build number.
       *
       * It used to be `web-${version.build}`, a number imported from a JSON file and therefore only
       * ever as fresh as the JS bundle carrying it. When a store update shipped a new game under a
       * stale bundle, the name did not move: the directory was already there, the unpack was
       * skipped, and a brand new binary served last week's game with nothing anywhere saying so.
       * It reproduced exactly — install 427, update to 446, still 427; delete and reinstall 446,
       * correct. The hash is computed from the file being unpacked, so the name and the contents
       * cannot disagree no matter what the bundle believes.
       */
      /**
       * Opened before it is trusted.
       *
       * `failed to open zip file` is what SSZipArchive says about a path that does not exist and
       * about a file that is not an archive alike, and those have completely different causes.
       * Separating them here means the diary names which one it was.
       */
      const source = new File(asset.localUri);
      if (!source.exists) {
        throw new Error(`archive not on disk at ${asPath(asset.localUri)} — from ${asset.localUri}`);
      }
      // The smallest possible zip is 22 bytes. Anything near that is a failed download, not a game.
      if (source.size < 1024) {
        throw new Error(`archive is ${source.size} bytes at ${asPath(asset.localUri)}`);
      }
      // Where the archive came from says whether the update carried it or it had to be fetched.
      note(`archive ${(source.size / 1048576).toFixed(1)} MB at ${asPath(asset.localUri)}`);

      const stamp = asset.hash ?? `build-${version.build}`;
      const root = new Directory(Paths.document, `web-${stamp}`);
      if (!root.exists) {
        note(`unpacking build ${version.build}…`);
        try {
          await unzip(asPath(asset.localUri), asPath(root.uri));
        } catch (error) {
          // A half-written directory would be taken for a finished one on the next launch and the
          // unpack skipped, so a failure takes its own leavings with it.
          try { if (root.exists) root.delete(); } catch { /* nothing to undo */ }
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`${reason} — ${source.size} bytes at ${asPath(asset.localUri)}`);
        }
      }

      /**
       * Every previously unpacked game goes with it. They are 17 MB each, nothing reads them once
       * the name above has moved, and keeping them fills a device one release at a time.
       */
      const keep = asPath(root.uri);
      for (const entry of new Directory(Paths.document).list()) {
        const path = asPath(entry.uri);
        const name = path.slice(path.lastIndexOf('/') + 1);
        if (!name.startsWith('web-') || path === keep) continue;
        // A stale copy that refuses to go is wasted space, never a reason to fail the boot.
        try { entry.delete(); } catch { /* ignored */ }
      }

      // Trust the unpack no further than a directory listing. An empty folder starts a server
      // that serves nothing, which reads downstream as a network fault rather than a bad archive.
      const index = new File(root, 'index.html');
      if (!index.exists) {
        throw new Error(`no index.html in ${asPath(root.uri)} — the archive is wrong or empty`);
      }
      note(`unpacked ok: ${root.list().length} entries`);

      /**
       * **The server the previous bundle started is still running.**
       *
       * `Updates.reloadAsync()` replaces the JavaScript, not the native modules. The lighttpd the
       * old bundle started stays bound to the port, its JS registry is gone with the old bundle,
       * and the native side refuses a second server while one is alive — *Failed to launch server,
       * another server instance is active*. So the first launch of every over-the-air update
       * ended on the diagnostic: the version line offered the update, Reload went blank, and the
       * shell reported a server it could not start. Ask the native side who is running, adopt
       * the orphan under its own id, and stop it before starting ours.
       */
      const orphan = await getActiveServerId();
      if (orphan !== null && orphan !== undefined) {
        note(`stopping the previous bundle's server #${orphan}`);
        const stale = new Server({ id: orphan, state: STATES.ACTIVE, fileDir: asPath(root.uri), port: PORT, stopInBackground: false });
        try {
          await stale.stop('replaced by a newer bundle');
        } catch (error) {
          note(`could not stop it: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const instance = new Server({
        port: PORT,
        fileDir: asPath(root.uri),
        // A player who takes a phone call must not come back to a dead origin.
        stopInBackground: false,
        // lighttpd's own log. The only account of why it refused to start.
        errorLog: { conditionHandling: true, fileNotFound: true, requestHandling: true },
      });

      /**
       * The reason the first build showed `ERR_CONNECTION_REFUSED`.
       *
       * `start()` resolving is not the same as lighttpd accepting connections, so pointing the web
       * view at the origin the moment the promise settles can beat the listening socket. The state
       * listener is the real signal; CRASHED is reported here too, which `start()` alone never
       * surfaces once it has resolved.
       */
      const unsubscribe = instance.addStateListener((state, details, error) => {
        if (state === STATES.CRASHED) {
          giveUp(`server crashed: ${details}${error ? ` — ${error.message}` : ''}`);
        }
      });

      const url = await instance.start();
      if (cancelled) {
        unsubscribe();
        await instance.stop();
        return;
      }

      server.current = instance;
      note(`server ${instance.state === STATES.ACTIVE ? 'active' : String(instance.state)} at ${url}`);

      /**
       * Knock on the door from this side before sending the web view to it.
       *
       * `ACTIVE` is lighttpd's own opinion, and the first build proved it can hold that opinion
       * while the web view gets `ERR_CONNECTION_REFUSED` from the same address. A fetch from the
       * JS thread separates the two cases: if it answers, the server is genuinely up and the
       * problem belongs to the web view; if it does not, the server is not listening whatever its
       * state says. Either way the diagnostic below can name it.
       *
       * It is also a fix rather than only a probe: a socket that needs a moment gets one, instead
       * of the web view arriving early and turning a timing wobble into a permanent error page.
       */
      const reachable = await knock(url);
      if (cancelled) return;
      if (!reachable) {
        /**
         * Reported, never switched to.
         *
         * `http://localhost:PORT` and `http://127.0.0.1:PORT` are different origins, so a shell
         * that silently preferred whichever answered would partition the save file by whichever
         * name resolved that launch. Worth knowing which one the socket is on; not worth losing a
         * reign to.
         */
        const viaName = await knock(`http://localhost:${PORT}`, 2);
        note(`localhost:${PORT} ${viaName ? 'DOES answer — a name-resolution split' : 'also refuses'}`);
        note(await lighttpdLog());
        throw new Error(`${url} accepted no connection after ${KNOCKS} attempts`);
      }

      setOrigin(url);
    };

    boot().catch((error: unknown) => {
      giveUp(`boot failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    return () => {
      cancelled = true;
      void server.current?.stop();
    };
  }, [bootKey, giveUp, note]);

  /**
   * The first-paint watchdog, counted from the moment the page is asked for — not from mount.
   *
   * Counted from mount it also timed an update's archive arriving and unpacking, and a reload
   * into a fresh update ran out of clock before the game had drawn a frame: *tap Reload, a blank
   * page, then the error screen; open it a few more times and it is fine* — fine because by
   * then the archive was on disk and unpacked. The clock now starts when the page is asked for,
   * and a first miss asks for it again (a stuck load, a dead process) before anything is shown.
   */
  useEffect(() => {
    if (!origin || ready || failed) return;
    const timer = setTimeout(() => {
      if (paintMisses.current === 0) {
        paintMisses.current = 1;
        restart(`no painted frame within ${WATCHDOG_MS / 1000}s — asking for the page again`);
        return;
      }
      giveUp(`the game did not report a painted frame within ${WATCHDOG_MS / 1000}s, twice`);
    }, WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [failed, giveUp, origin, ready, restart, webKey]);

  // The shell's own steps get a longer, separate guard: an unpack that never ends must still end.
  useEffect(() => {
    if (origin || ready || failed) return;
    const timer = setTimeout(() => giveUp(`the shell did not reach the page within ${SETUP_MS / 1000}s`), SETUP_MS);
    return () => clearTimeout(timer);
  }, [bootKey, failed, giveUp, origin, ready]);

  /**
   * Coming back to the foreground: ask the page whether it is still there.
   *
   * `onRenderProcessGone` and `onContentProcessDidTerminate` below catch the cases the platform
   * reports. A process the OS killed while the app was suspended is not always one of them — the
   * app can be resumed with a web view that simply never paints — so the shell asks, and a page
   * that does not answer within `PONG_MS` is mounted again.
   */
  useEffect(() => {
    if (!ready || failed) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const asked = Date.now();
      web.current?.injectJavaScript(HEALTH_PING);
      setTimeout(() => {
        if (pongAt.current >= asked) return;
        restart('no answer from the page after resume');
      }, PONG_MS);
    });
    return () => subscription.remove();
  }, [failed, ready, restart]);

  /**
   * Content updates, offered rather than applied.
   *
   * `checkAutomatically` is NEVER and nothing here calls `reloadAsync` on its own, which is the
   * whole design: the game that launches is always the one already on the device, so a cold start
   * costs no network and cannot be changed underneath a player mid-reign. A newer bundle is
   * downloaded quietly and then *offered*, the way a PWA offers one, and it is applied only when
   * the player says so.
   *
   * Deliberately after `ready`. A check that raced the boot would compete with the unpack and the
   * server for a device's attention at the one moment the app has none to spare.
   */
  useEffect(() => {
    if (!ready || !Updates.isEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = await Updates.checkForUpdateAsync();
        if (cancelled || !found.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        /**
         * The game owns the notice, not the shell.
         *
         * It already has one — the version line at the foot of the front page, which says the same
         * thing for a waiting service worker on the web. Drawing a second bar over the canvas would
         * put two update prompts in one product and land this one in the only place the art
         * direction forbids: floating over the game. So the shell says its piece through
         * `window.__gameUpdateReady` and lets the menu render it in both languages, in the right
         * place, in ink.
         */
        /**
         * **A shell showing an error has nothing to interrupt, so it applies the update itself.**
         *
         * Everything below this offers a new bundle to the game and lets the player choose. There
         * is no game here to offer it to: the web view was never created, so the injection lands
         * nowhere and the newer build — the one carrying the fix for whatever wedged this launch —
         * is downloaded, stored, and never run. A device broken by a bad archive would stay broken
         * through every release until it was deleted and reinstalled.
         */
        if (failed) {
          note('a newer build arrived — restarting into it');
          try { await server.current?.stop('reloading into a newer bundle'); } catch { /* the next bundle adopts it */ }
          await Updates.reloadAsync();
          return;
        }
        web.current?.injectJavaScript('window.__gameUpdateReady && window.__gameUpdateReady(); true;');
      } catch {
        // No network, no update server, a malformed manifest: all of them mean the player keeps
        // playing what they have. An update is never worth an error in front of somebody.
      }
    })();
    return () => { cancelled = true; };
  }, [failed, note, ready]);

  /**
   * Nothing may navigate away from the game — that is what makes this an app rather than a browser
   * pointed at one, and it is the first thing App Store review looks for under guideline 4.2.
   *
   * But the menu has real outbound links, and `openExternalLink` in the game builds them as
   * `<a target="_blank">`. With `setSupportMultipleWindows={false}` that arrives here as an
   * ordinary navigation, so blocking it without handing it on would make "Help build the game" do
   * nothing at all. Off-origin goes to the system browser; the web view stays where it is.
   */
  const handleRequest = useCallback(
    (request: WebViewNavigation): boolean => {
      if (!origin || request.url.startsWith(origin)) {
        return true;
      }
      if (/^https?:/.test(request.url)) {
        void Linking.openURL(request.url).catch(() => {});
      }
      return false;
    },
    [origin],
  );

  if (failed) {
    return (
      <View style={[styles.fault, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.diag}>
          <Text style={styles.heading}>Vạn Thắng could not start</Text>
          <Text style={styles.body}>
            The game is packaged inside this app and needs no network. What follows is what the
            shell did before it stopped — please send it with any bug report.
          </Text>
          {diary.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.line}>
              · {line}
            </Text>
          ))}
          <Text style={styles.line}>· build {version.build}, port {PORT}</Text>
          {/* A way out that is not force-quitting: the page again if there was one, the boot
              again if there was not. */}
          <Pressable
            style={styles.retry}
            onPress={() => {
              paintMisses.current = 0;
              setFailed(false);
              setReady(false);
              if (origin) {
                restart('retry from the diagnostic');
              } else {
                setDiary([]);
                setBootKey((key) => key + 1);
              }
            }}
          >
            <Text style={styles.retryText}>Thử lại · Try again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {/* Dark glyphs: the bar is transparent and what shows through is paper now. */}
      <StatusBar style="dark" />
      {/* What the shell is doing while the page is not yet painted — on a cold start the native
          splash covers this; after a reload into an update there is no splash, and this is what
          stands where a blank page did. */}
      {!ready ? (
        <View style={styles.progress} pointerEvents="none">
          <ActivityIndicator color="#8a5f1c" />
          <Text style={styles.progressTitle}>Đang chuẩn bị ván chơi…</Text>
          <Text style={styles.progressSub}>Setting up the game</Text>
          <Text style={styles.progressLine}>{diary[diary.length - 1] ?? ''}</Text>
        </View>
      ) : null}
    {origin ? (
        <WebView
          key={webKey}
          ref={web}
          source={{ uri: `${origin}/?v=${version.build}.${webKey}` }}
          style={[styles.web, { opacity: ready ? 1 : 0 }]}
          originWhitelist={[`http://127.0.0.1:${PORT}*`, `http://localhost:${PORT}*`]}
          onShouldStartLoadWithRequest={handleRequest}
          // Before the bundle's first line: `src/main.ts` reads the descriptor at module scope.
          // The reason comes first so the descriptor's own last line stays the script's last line.
          injectedJavaScriptBeforeContentLoaded={
            (restarts.current > 0 ? reloadReasonScript(restarts.current) : '') + shellDescriptorScript()
          }
          // The platform's own word that the process is gone. iOS could `reload()` here, but one
          // path for both keeps the reason injection and the diary line identical.
          onContentProcessDidTerminate={() => restart('WebKit content process terminated')}
          onRenderProcessGone={({ nativeEvent }) =>
            restart(`Android render process gone (crashed: ${nativeEvent.didCrash})`)
          }
          onMessage={(event) => {
            const data = event.nativeEvent.data;
            if (data === 'boot:ready') {
              reveal();
            }
            // The page answering the resume ping, with its own health reading for the diary.
            if (typeof data === 'string' && data.startsWith('pong:')) {
              pongAt.current = Date.now();
              note(`resume: ${data.slice(5, 300)}`);
              return;
            }
            // The player tapped Reload on the version line. Restart onto the bundle already down.
            if (event.nativeEvent.data === 'update:apply') {
              // The wait is shown from this tap on, and our own server goes first, so the bundle
              // that comes next finds the port free even if the adoption above ever fails it.
              setReady(false);
              note('reloading into the newer bundle…');
              void (async () => {
                try { await server.current?.stop('reloading into a newer bundle'); } catch { /* the next bundle adopts it */ }
                await Updates.reloadAsync();
              })();
            }
          }}
          // A refused connection is the shell's fault, not the player's. Say so, rather than
          // letting the web view render a browser error page inside what claims to be a game.
          onError={({ nativeEvent }) => giveUp(`web view: ${nativeEvent.description}`)}
          onHttpError={({ nativeEvent }) =>
            giveUp(`web view: HTTP ${nativeEvent.statusCode} for ${nativeEvent.url}`)
          }
          // A game canvas, not a document.
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          cacheEnabled={false}
          androidLayerType="hardware"
          webviewDebuggingEnabled={__DEV__}
        />
      ) : null}
    </View>
  );
}

/**
 * The provider has to be above whatever calls `useSafeAreaInsets`, so the shell is an inner
 * component and this is what the app registers.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      {/* Each branch of `Shell` mounts its own: the game sits on paper and wants dark glyphs,
          the diagnostic sits on ink and wants light ones. */}
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // The game's own sheet, all the way down: native splash, shell, inset padding and web view.
  root: { flex: 1, backgroundColor: PAPER },
  web: { flex: 1, backgroundColor: PAPER },
  // The diagnostic is the shell talking, not the game. It keeps the ink it was written for.
  fault: { flex: 1, backgroundColor: INK },
  diag: { padding: 28 },
  heading: { color: PAPER, fontSize: 20, fontWeight: '700', marginBottom: 12 },
  body: { color: '#bcb29e', fontSize: 14, lineHeight: 21, marginBottom: 18 },
  line: { color: '#8fd2c1', fontSize: 12, lineHeight: 20, fontFamily: 'monospace' },
  retry: {
    marginTop: 24, alignSelf: 'flex-start', borderWidth: 1, borderColor: PAPER, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 18,
  },
  retryText: { color: PAPER, fontSize: 14, fontWeight: '700' },
  // The wait, on the game's own paper: a dial, one line of Vietnamese, one of English, and the
  // shell's latest step underneath in the diary's own type.
  progress: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER, padding: 28 },
  progressTitle: { color: '#2a2118', fontSize: 16, fontWeight: '700', marginTop: 14 },
  progressSub: { color: '#8a7a60', fontSize: 12, marginTop: 2 },
  progressLine: { color: '#8a5f1c', fontSize: 11, marginTop: 18, fontFamily: 'monospace', textAlign: 'center' },
});
