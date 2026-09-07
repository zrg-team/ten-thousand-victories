/**
 * The whole of what the game knows about running inside a native shell.
 *
 * `src/` is the game and nothing else: it is built once, to one folder, and every platform serves
 * that same folder. What differs between platforms is not the game but the *cabinet* around it —
 * an iOS binary, an Android binary, a Tauri window, a tab on GitHub Pages — and the differences
 * that reach the game are few enough to fit in this file.
 *
 * The direction of the contract is the important part. The game does **not** sniff for a shell;
 * a shell **declares itself**, by writing `window.__shell` before the bundle loads. That is why
 * adding a platform is a job in `apps/`, not a job in here: Tauri will set `window.__shell` from
 * its init script exactly as the mobile app sets it from `injectedJavaScriptBeforeContentLoaded`,
 * and every function below already handles it. See `apps/README.md` for the contract from the
 * other side.
 *
 * Nothing here imports Phaser, and nothing here is allowed to: `BootScene` runs after these
 * answers are already needed.
 */

/** Which cabinet the game is in. `'web'` is the absence of a shell, not a shell. */
export type ShellKind = 'web' | 'mobile' | 'desktop';

/**
 * Which operating system the shell is on.
 *
 * Needed because one mobile build serves both stores and their rules differ — see
 * `allowsDonationLinks`. A shell that genuinely cannot tell may omit it.
 */
export type ShellOS = 'ios' | 'android' | 'windows' | 'macos' | 'linux';

/**
 * What a shell writes onto `window.__shell` before this bundle loads.
 *
 * Every field but `kind` is optional so that a half-built shell still boots the game rather than
 * throwing on a property it forgot. A missing `os` costs you the platform-specific gates below and
 * nothing else.
 */
export interface ShellDescriptor {
  kind: Exclude<ShellKind, 'web'>;
  os?: ShellOS;
  /** The shell's own version string, printed beside the game's on the settings page. */
  version?: string;
  /**
   * Restart the shell onto an update it has already downloaded.
   *
   * The shell's half of the same conversation `ready` starts. Optional, because a shell that
   * cannot update itself simply never calls `noteShellUpdate`, and the game never offers.
   */
  applyUpdate?: () => void;

  /**
   * Called once, on the first frame the menu is actually on the glass.
   *
   * The shell supplies the callback rather than the game reaching for a known channel, because
   * the channels have nothing in common: React Native has `ReactNativeWebView.postMessage`, an
   * Electron preload has `ipcRenderer`, and a future shell will have a third thing. One closure
   * hides all three.
   */
  ready?: () => void;

  /**
   * Put the window into or out of fullscreen.
   *
   * A desktop cabinet owns its window, and the document's fullscreen API — which the web build
   * uses — is not the same thing inside one: an Electron window goes fullscreen through the
   * window, not the document. Optional; the web fallback is the document API.
   */
  toggleFullscreen?: () => void;
  /** Close the application. A tab has no such thing, so the game only offers it inside a shell. */
  quit?: () => void;
  /**
   * The Steam bridge, present only in the Steam cabinet with Steam running.
   *
   * Two calls and nothing else: the cabinet holds the Steamworks client in its own process and
   * the game never sees an id or a session. Nothing in `src/` calls these yet — achievement
   * definitions wait for the store listing — but the shape is fixed here so the cabinet and the
   * game cannot drift while they wait.
   */
  steam?: {
    unlockAchievement: (id: string) => void;
    setRichPresence: (key: string, value: string) => void;
  };
}

declare global {
  interface Window {
    __shell?: ShellDescriptor;
  }
}

/**
 * True when this bundle was built by `vite build --mode shell`.
 *
 * Distinct from `window.__shell` being present, and deliberately: the shell build is the one with
 * relative asset URLs and no service worker, and it is possible — during development, pointing a
 * shell at the dev server — to be inside a shell while running a web build. The gates below ask
 * whichever question they actually mean.
 */
export function isShellBuild(): boolean {
  return __SHELL_BUILD__;
}

/** What the shell said it was, or `'web'` when nothing declared itself. */
export function shellKind(): ShellKind {
  return window.__shell?.kind ?? 'web';
}

/** The shell's OS, or `undefined` on the web and on a shell that did not say. */
export function shellOS(): ShellOS | undefined {
  return window.__shell?.os;
}

/** Whether a native cabinet is wrapped around the game right now. */
export function isShell(): boolean {
  return window.__shell !== undefined;
}

/**
 * Whether this build should register a service worker.
 *
 * The web build should: it is the only offline copy a browser tab will ever have. A shell build
 * should not, and for two independent reasons — every byte is already inside the binary, so a
 * worker would cache a second copy of files that cannot go missing; and WKWebView disables
 * service workers outright unless the app declares `WKAppBoundDomains`, which locks the web view
 * down far harder than an offline copy is worth. Registering anyway does not fail loudly, it just
 * leaves `UpdateStatus` stuck at `'unsupported'` while the console logs a rejected registration on
 * every launch.
 */
export function usesServiceWorker(): boolean {
  return !isShellBuild() && !isShell();
}

/**
 * Whether the menu may show a link that sends the developer money.
 *
 * Off in both app stores, for two unrelated reasons that happen to land on the same answer.
 *
 * On iOS it is forbidden outright, by two rules either of which is a rejection on its own:
 * guideline 3.2.1(vii) excludes tips and donations *in games* from the external-link allowance
 * that other app categories get, and 4.7 says HTML5 game content may not provide access to
 * charitable donations.
 *
 * On Android it is permitted — Play's payments policy exempts voluntary donations — and it comes
 * out anyway, because the store build is **sold**. Asking somebody who has just paid for the game
 * to also buy you a coffee reads as a second ask, and the store listing already promises that one
 * price is the whole of it. The rule is therefore the cabinet, not the OS: anything that reached
 * the player through a store leaves the link out.
 *
 * On everywhere else. The web build is free and is the version the link was written for, and a
 * desktop shell answers to no store. A mobile shell that cannot report its OS still loses the
 * link, which is the safe direction now that both stores are covered — the old gate kept it in
 * that case, when Android was the only store that allowed it.
 */
export function allowsDonationLinks(): boolean {
  return shellKind() !== 'mobile';
}

/** Whether the shell can leave — a tab cannot, and the run menu offers nothing it cannot do. */
export function canQuitShell(): boolean {
  return typeof window.__shell?.quit === 'function';
}

/** Close the application, where there is one to close. Nothing happens on the web. */
export function quitShell(): void {
  try {
    window.__shell?.quit?.();
  } catch {
    // A shell that throws on its own callback is not something the game can do anything about.
  }
}

/**
 * Fullscreen, through whichever door this page has: the shell's own when it offers one, else the
 * document's, which Phaser's scale manager wraps. `scale` is Phaser's, typed structurally so this
 * file stays free of the engine.
 */
export function toggleFullscreen(scale: { isFullscreen: boolean; startFullscreen(): void; stopFullscreen(): void }): void {
  if (typeof window.__shell?.toggleFullscreen === 'function') {
    try {
      window.__shell.toggleFullscreen();
    } catch {
      // Same rule as the other callbacks: the shell's failure must not become the game's.
    }
    return;
  }
  if (scale.isFullscreen) scale.stopFullscreen();
  else scale.startFullscreen();
}

/** The Steam bridge, or undefined outside the Steam cabinet. */
export function shellSteam(): NonNullable<ShellDescriptor['steam']> | undefined {
  return window.__shell?.steam;
}

/**
 * Ask the shell to restart onto the update it told us about.
 *
 * Safe everywhere: on the web there is no shell and nothing happens, which is why `applyUpdate`
 * in `pwa/updates.ts` checks `isShell()` before calling rather than relying on this to no-op.
 */
export function applyShellUpdate(): void {
  try {
    window.__shell?.applyUpdate?.();
  } catch {
    // A shell that throws on its own callback is not something the game can do anything about.
  }
}

/**
 * Tell the shell the game is up, so it can take its splash down.
 *
 * Called from the same `POST_RENDER` handler that dismisses the HTML splash in `index.html`, and
 * for the same reason: `create()` runs before the frame it built reaches the canvas, so anything
 * that fires there hands the shell a promise the glass has not kept yet. Both splashes lift on the
 * one frame that is genuinely the menu.
 *
 * Safe to call on the web, where it does nothing.
 */
export function notifyShellReady(): void {
  try {
    window.__shell?.ready?.();
  } catch {
    // A shell whose callback throws must not take the menu down with it. The cost of swallowing
    // this is a splash that sits until the shell's own watchdog fires; the cost of not swallowing
    // it is a game that boots to nothing.
  }
}
