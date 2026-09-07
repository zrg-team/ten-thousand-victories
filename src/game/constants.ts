import { desktopDesignHeight, initialSurfaceWidth, isDesktopLayout } from '../platform/layout';

/**
 * The design surface, in game units.
 *
 * Width is fixed: every bar, card and button in the game is laid out against 390, and letting it
 * move would mean re-tuning a hundred call sites for nothing. The desktop layout does not move it
 * either — it widens the *sheet* under the column instead; see `surfaceWidth` below.
 *
 * Height is NOT fixed, and that is the whole point. Phaser's `Scale.FIT` fits the design box inside
 * the visible viewport, so a design taller than the viewport gets scaled down by height and the
 * spare width becomes letterbox. On an iPhone 13 in Safari the visible viewport is 390x664 once the
 * toolbars are showing — against a fixed 390x844 design that is a scale of 0.787, with 83px of dead
 * bars down each side and every label a fifth too small. An SE lands at 0.655.
 *
 * Taking the height from the device's own aspect ratio makes FIT scale by *width* instead, so the
 * game fills the screen at 1:1 or better and the map area simply gets shorter or taller. The clamp
 * keeps a very square or very long screen from squeezing the header and action bar into each other.
 */
export const GAME_WIDTH = 390;

const MIN_DESIGN_HEIGHT = 620;
const MAX_DESIGN_HEIGHT = 1040;

/**
 * Measured off `#game-root`, not off the window.
 *
 * The two used to be the same box. They stopped being the same box when the root started
 * subtracting the safe-area insets from its own height (see `index.html`), which an installed iOS
 * app needs and Safari's toolbar was hiding: taking the aspect from `window.innerHeight` then
 * describes a box 34 units taller than the one FIT actually has to fill, so FIT scales by *height*
 * instead of width and hands back a letterboxed sheet with everything 4% small — precisely the
 * failure the variable design height exists to avoid. The window is kept as the fallback for the
 * headless case, where there is no element to measure.
 */
function designHeight(): number {
  if (typeof window === 'undefined') {
    return 844;
  }
  const box = typeof document !== 'undefined'
    ? document.getElementById('game-root')?.getBoundingClientRect()
    : undefined;
  const width = box?.width || window.innerWidth;
  const height = box?.height || window.innerHeight;
  if (!width || !height) {
    return 844;
  }
  const ratio = height / width;
  return Math.round(Math.max(MIN_DESIGN_HEIGHT, Math.min(MAX_DESIGN_HEIGHT, GAME_WIDTH * ratio)));
}

/**
 * On the desktop the height is a constant instead. A 16:9 window's own aspect would clamp this to
 * 620, the height at which a four-card draft and its footer (about 775) fell off the bottom edge;
 * 760 is inside the band every screen is proven to fit and leaves the map the width. See
 * `platform/layout.ts` for how a page decides it is a desktop.
 */
export const GAME_HEIGHT = isDesktopLayout() ? desktopDesignHeight() : designHeight();

/**
 * The sheet Phaser is actually given, which on the phone is the column and on the desktop is
 * wider: the world scene fills it, and the 390-wide chrome sits in a column at its right edge
 * (`uiColumnX`) or, for a page with nothing behind it, in the middle (`pageColumnX`). Every layout
 * number in the game stays column-local — a scene is placed on the sheet by its camera's viewport
 * (`game/cameraLayout.ts`), not by adding an offset to what it draws.
 *
 * Module state rather than a constant because the desktop sheet follows the window: a resize
 * re-derives it (`game/desktopResize.ts`) and every reader below sees the new width. On the phone
 * it never moves.
 */
let surface = isDesktopLayout() ? initialSurfaceWidth() : GAME_WIDTH;

export function surfaceWidth(): number {
  return surface;
}

/** Whether the sheet is wider than the column — the desktop, with its own HUD composition. */
export function isDesktopSheet(): boolean {
  return surface > GAME_WIDTH;
}

/**
 * The dock: where a 390-wide panel's left edge sits when it is pinned to the sheet's right edge —
 * a lane's page, the province card. Zero on the phone, where the column is the sheet, so nothing
 * there changes.
 */
export function uiColumnX(): number {
  return surface - GAME_WIDTH;
}

/** A standalone page's column, centred on the sheet. */
export function pageColumnX(): number {
  return Math.round((surface - GAME_WIDTH) / 2);
}

/**
 * The world camera's width: what "centre the map on the capital" and every scroll clamp measure
 * against. The whole sheet — on the desktop the chrome is a top bar, a bottom bar and panels that
 * come and go over the map, exactly as the phone's chrome floats over it.
 */
export function mapViewWidth(): number {
  return surface;
}

/** Desktop only — the phone's sheet is the column and does not move. */
export function setSurfaceWidth(width: number): void {
  if (!isDesktopLayout()) return;
  surface = Math.round(width);
}

/**
 * The resource strip at the top of the screen.
 *
 * 44 was too short to hold what is in it. The strip carries a răng cưa band at each edge, the
 * year/season line, and the four stores — and in Vietnamese the title's own diacritics (the breve on
 * "Năm", the circumflex on "Xuân") reached up into the top band, while the numbers' parentheses sat
 * on the bottom one. The eight units this gains are taken back out of the Dragon Ascent HUD below
 * it, which was spending them on a second decorative band directly under its progress bar, so that
 * mode's chrome is exactly as tall as it was.
 */
export const HEADER_HEIGHT = 52;
export const ACTION_BAR_HEIGHT = 50;

export const PLAYER_KINGDOM_ID = 'dai-viet';
export const NEUTRAL_OWNER_ID = 'neutral';

export const ORDERS_PER_SEASON = 3;

/**
 * Whether a mode uses the campaign systems (court cards, foreign affairs, spy,
 * dynasty stability, invasions). True for the classic 'campaign' and the off-map
 * 'empire' mode.
 */
export function isCampaignMode(mode: string): boolean {
  return mode === 'campaign' || mode === 'empire';
}

/**
 * Whether a mode is an endless survival run with no map-conquest win condition.
 * True for 'empire' (win only via prestige Ascension) and 'ascent' (no win at all).
 * These modes must never be scored by `checkVictory`'s enemy-castle sweep — they have
 * no enemy castles on the map, so that check would declare victory on the first tick.
 */
export function isEndlessMode(mode: string): boolean {
  return mode === 'empire' || mode === 'ascent';
}

/** Real-time interval, in ms, between economy ticks (acquisitions, builds, army marches). */
export const REALTIME_TICK_MS = 5500;

export const COLORS = {
  background: 0xd9cfb7,
  paper: 0xe9dcc1,
  paperDark: 0xc8b372,
  ink: 0x211103,
  water: 0x177d8d,
  road: 0x8b806b,
  player: 0x55c878,
  enemyNorth: 0xb85b53,
  enemySouth: 0x8d62bd,
  neutral: 0xd1bd7c,
  selected: 0xffde72,
  panel: 0x2a1403,
  panelLight: 0x6b5230,
  text: '#fff6bd',
  darkText: '#211103',
};
