/**
 * Which shape the game is drawn in.
 *
 * There are two. The **phone** layout is the game as designed: one 390-wide column, the map behind
 * the chrome, everything reachable with a thumb. The **desktop** layout keeps that column — every
 * bar, lane, card and button in the game is laid out against 390 and none of it moves — and pins
 * it to the right edge of a wider sheet, so the world can fill a 16:9 window while the chrome stays
 * exactly as drawn. Which of the two is in use is decided once, here, before any layout constant is
 * read, and never changes for the life of the page: `GAME_HEIGHT` and the surface width are boot
 * constants for the same reason the render scale is, and flipping them under a running scene would
 * mean re-laying every screen that has ever captured a number from them.
 *
 * The resolution order, first answer wins:
 *
 *   1. `?layout=phone|desktop` on the URL — a harness's, or a tester's, explicit ask (the repo's
 *      other switches are matched the same way, as a regex, see `src/game/config.ts`). `mobile`
 *      is an alias of `phone`; `?layout=auto` sets the stored choice aside for this page, so the
 *      sniff below can be tested on a machine that has pinned a layout in Settings.
 *   2. The stored preference from the settings page, when it is not `auto`.
 *   3. A cabinet that declared itself on `window.__shell` — a desktop shell is a desktop.
 *   4. On the web: a landscape window with a fine pointer, **and not a driven browser.**
 *      `navigator.webdriver` is the same gate `src/state/tour.ts` uses, and for the same reason:
 *      every harness opens headless Chromium at 390x844 with a mouse, and a hundred-odd scripts
 *      that measure the phone layout must not wake up measuring a different game. A harness that
 *      wants the desktop asks for it by rule 1.
 *
 * Whatever asked, the desktop needs a landscape box: a phone-shaped window gets the phone layout
 * even inside a desktop cabinet, because a 390-wide column is simply the better fit for it.
 *
 * `index.html` runs this same resolution inline, before this bundle has arrived, so that the
 * launch splash can draw itself on the sheet the game is about to use; it publishes its answer as
 * `window.__designSurface`, and this module takes that answer when it is there. Two copies of the
 * rule are a known cost — the harness `verify-desktop-layout` asserts that they agree.
 *
 * Nothing here imports Phaser or anything under `src/game/`: `constants.ts` reads this at module
 * scope, before any scene exists.
 */

export type LayoutKind = 'phone' | 'desktop';
export type LayoutPreference = 'auto' | LayoutKind;

export const LAYOUT_STORAGE_KEY = 'mandate:layout:v1';

/**
 * The desktop sheet's height, in design units.
 *
 * Inside the 620–1040 band every screen is already proven to fit (`verify-header-fit`,
 * `verify-menu-fit`, `verify-scroll`), and above the 620 a 16:9 window used to clamp to — where a
 * four-card draft and its footer need about 775 and the last card was below the bottom edge. One
 * design unit is 1.42 CSS pixels at 1920x1080 and 0.95 at 1280x720.
 */
export const DESKTOP_DESIGN_HEIGHT = 760;

/**
 * The interface size, on the desktop only: how many design units the window's height is cut
 * into. Fewer units is a bigger interface. A 1080p window at `normal` draws one unit as 1.42 px
 * and text at 16–18 px; `large` is a third bigger, for a screen across a desk or a 4K panel run
 * at 100%; `small` shows more map on a big monitor. Chosen on the settings page, applied on the
 * next launch like the layout itself, because the height is a boot constant.
 */
export type UiScale = 'small' | 'normal' | 'large';
export const UI_SCALE_STORAGE_KEY = 'mandate:uiscale:v1';
export const UI_SCALE_HEIGHTS: Record<UiScale, number> = { small: 900, normal: DESKTOP_DESIGN_HEIGHT, large: 640 };

export function uiScale(): UiScale {
  try {
    const stored = localStorage.getItem(UI_SCALE_STORAGE_KEY);
    return stored === 'small' || stored === 'large' ? stored : 'normal';
  } catch {
    return 'normal';
  }
}

export function setUiScale(scale: UiScale): void {
  try {
    if (scale === 'normal') localStorage.removeItem(UI_SCALE_STORAGE_KEY);
    else localStorage.setItem(UI_SCALE_STORAGE_KEY, scale);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
}

/** The desktop sheet's height for the chosen interface size. */
export function desktopDesignHeight(): number {
  return UI_SCALE_HEIGHTS[uiScale()];
}
/** Never narrower than a column and a column's worth of map. */
export const DESKTOP_MIN_SURFACE_WIDTH = 780;
/** 2.4:1 — a 32:9 panel is letterboxed rather than handed a 2,700-unit world view. */
export const DESKTOP_MAX_SURFACE_WIDTH = 1824;
/**
 * Below this width-over-height the window is a column, whatever else it says about itself. One:
 * any landscape window on a computer is better served by the sheet than by a phone column with
 * paper either side of it — the sheet floors at 780 wide, which a 1.0 window letterboxes by a
 * finger. A portrait window on a computer keeps the column, and keeps the desktop *gameplay*.
 */
export const DESKTOP_MIN_ASPECT = 1.0;

/** What `index.html` publishes once it has sized the splash. */
export interface DesignSurface {
  kind: LayoutKind;
  width: number;
  height: number;
}

declare global {
  interface Window {
    __designSurface?: DesignSurface;
  }
}

export function layoutPreference(): LayoutPreference {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return stored === 'phone' || stored === 'desktop' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function setLayoutPreference(preference: LayoutPreference): void {
  try {
    if (preference === 'auto') localStorage.removeItem(LAYOUT_STORAGE_KEY);
    else localStorage.setItem(LAYOUT_STORAGE_KEY, preference);
  } catch {
    // Storage blocked: the choice lasts until the page is closed, which is still a choice.
  }
}

/**
 * Width over height of the box the canvas is fitted into — `#game-root`, which is shorter than
 * the window by the safe-area insets — with the window as the headless fallback. Zero when there
 * is nothing to measure, which every rule below reads as "not a desktop".
 */
export function rootAspect(): number {
  if (typeof window === 'undefined') return 0;
  const box = typeof document !== 'undefined'
    ? document.getElementById('game-root')?.getBoundingClientRect()
    : undefined;
  const width = box?.width || window.innerWidth;
  const height = box?.height || window.innerHeight;
  return width && height ? width / height : 0;
}

/** The desktop sheet's width for a box of this aspect, clamped to the band above. */
export function desktopSurfaceWidth(aspect: number): number {
  return Math.round(Math.max(DESKTOP_MIN_SURFACE_WIDTH,
    Math.min(DESKTOP_MAX_SURFACE_WIDTH, desktopDesignHeight() * aspect)));
}

function queryLayout(): LayoutPreference | undefined {
  if (typeof window === 'undefined') return undefined;
  const match = /[?&]layout=(phone|mobile|desktop|auto)\b/.exec(window.location.search);
  if (!match) return undefined;
  return match[1] === 'mobile' ? 'phone' : (match[1] as LayoutPreference);
}

/**
 * Whether this page wants the desktop's *gameplay*: the hands-on rule on new runs, the keys, the
 * wheel, hover. The platform, not the window — a computer in a portrait window is still a computer.
 *
 * The same first three rules as the layout (the ask, the stored choice, the cabinet), then a
 * mouse: a fine primary pointer, or a pointer that can hover — a laptop with a touchscreen says yes
 * to both. Never a driven browser (the harness gate), unless it asked.
 */
/**
 * Every signal the computer question is answered from, in one place — and published, so a page
 * that chose wrong can say why (`window.__layoutDiagnosis`, and one `[layout]` line in the console
 * at boot).
 *
 * The pointer media queries alone were not enough. A Windows laptop with a touchscreen can answer
 * `pointer: coarse` and `hover: none` for its *primary* pointer even with a mouse plugged in, and
 * that page then booted on the phone column in a 1920-wide window. So a computer is anything that
 * is not a phone or a tablet by its own account and shows any one sign of being a computer: a
 * fine pointer, a hovering one, no touch points at all, a desktop-class user agent, or a screen a
 * thousand pixels wide. Phones and tablets are ruled out first, by user agent, because an iPad in
 * landscape with a keyboard case passes several of those signs and is still a thing held in hands.
 */
export interface LayoutDiagnosis {
  asked: LayoutPreference | undefined;
  stored: LayoutPreference;
  shell: string | undefined;
  driven: boolean;
  mobileUA: boolean;
  tablet: boolean;
  fine: boolean;
  hover: boolean;
  touchPoints: number;
  uaMobile: boolean | undefined;
  screen: [number, number];
  window: [number, number];
  aspect: number;
  platform: 'desktop' | 'phone';
  layout: LayoutKind;
}

function computerSignals(): Pick<LayoutDiagnosis, 'mobileUA' | 'tablet' | 'fine' | 'hover' | 'touchPoints' | 'uaMobile' | 'screen'> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent ?? '' : '';
  const uaData = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    : undefined;
  const touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0;
  const media = (query: string): boolean => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  return {
    mobileUA: uaData?.mobile === true || /Android.*Mobile|iPhone|iPod|Windows Phone|Mobile Safari/i.test(ua),
    tablet: /iPad/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1) || (/Android/i.test(ua) && !/Mobile/i.test(ua)),
    fine: media('(pointer: fine)'),
    hover: media('(hover: hover)'),
    touchPoints,
    uaMobile: uaData?.mobile,
    screen: typeof screen !== 'undefined' ? [screen.width, screen.height] : [0, 0],
  };
}

function looksLikeComputer(signals: ReturnType<typeof computerSignals>): boolean {
  if (signals.mobileUA || signals.tablet) return false;
  return signals.fine || signals.hover || signals.touchPoints === 0 || signals.uaMobile === false
    || signals.screen[0] >= 1024;
}

function resolveDesktopPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const asked = queryLayout();
  if (asked && asked !== 'auto') return asked === 'desktop';
  const stored = asked === 'auto' ? 'auto' : layoutPreference();
  if (stored !== 'auto') return stored === 'desktop';
  const shell = window.__shell?.kind;
  if (shell) return shell === 'desktop';
  const driven = typeof navigator !== 'undefined' && navigator.webdriver === true;
  return !driven && looksLikeComputer(computerSignals());
}

/** Everything the decision was made from, for the console and for a bug report. */
export function layoutDiagnosis(): LayoutDiagnosis {
  const signals = computerSignals();
  const width = typeof window !== 'undefined' ? window.innerWidth : 0;
  const height = typeof window !== 'undefined' ? window.innerHeight : 0;
  return {
    asked: queryLayout(),
    stored: layoutPreference(),
    shell: typeof window !== 'undefined' ? window.__shell?.kind : undefined,
    driven: typeof navigator !== 'undefined' && navigator.webdriver === true,
    ...signals,
    window: [width, height],
    aspect: +rootAspect().toFixed(2),
    platform: isDesktopPlatform() ? 'desktop' : 'phone',
    layout: layoutKind(),
  };
}

let platformResolved: boolean | undefined;

export function isDesktopPlatform(): boolean {
  if (platformResolved === undefined) platformResolved = resolveDesktopPlatform();
  return platformResolved;
}

/** The rules above, in order, against the page as it is right now: the platform, in a landscape box. */
export function resolveLayoutKind(): LayoutKind {
  return resolveDesktopPlatform() && rootAspect() >= DESKTOP_MIN_ASPECT ? 'desktop' : 'phone';
}

let resolved: LayoutKind | undefined;

/** The layout this page booted with. Decided on the first call and fixed thereafter. */
export function layoutKind(): LayoutKind {
  if (resolved === undefined) {
    const published = typeof window !== 'undefined' ? window.__designSurface?.kind : undefined;
    resolved = published === 'phone' || published === 'desktop' ? published : resolveLayoutKind();
  }
  return resolved;
}

export function isDesktopLayout(): boolean {
  return layoutKind() === 'desktop';
}

/**
 * Whether a pinned Desktop is being overruled by the box: the choice is Desktop, the page is on the
 * column. That happens in exactly one case — a portrait box, since the rules above let a pin win
 * everything but the aspect. The settings row says so, because a tile that reads "Desktop" over a
 * page that is plainly the phone column is otherwise a control that looks broken.
 */
export function desktopPinOverruled(): boolean {
  return layoutPreference() === 'desktop' && layoutKind() === 'phone';
}

/**
 * The desktop sheet's width at boot: the splash's own number when it published one, so the two
 * sheets are the same sheet, else measured now.
 */
export function initialSurfaceWidth(): number {
  const published = typeof window !== 'undefined' ? window.__designSurface : undefined;
  if (published?.kind === 'desktop' && Number.isFinite(published.width) && published.width > 0) {
    return Math.round(published.width);
  }
  return desktopSurfaceWidth(rootAspect());
}
