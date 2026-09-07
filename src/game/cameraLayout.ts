import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, pageColumnX, surfaceWidth, uiColumnX } from './constants';

/**
 * The sheet's horizontal span in a scene's own coordinates — for anything that must cover the
 * whole window from a scene: a modal's dim, a tour's veil, a result sheet's blocker.
 *
 * A page scene shows its column in the middle of the desktop sheet by scrolling its camera left
 * (`applyCameraLayout`), so the column's own x = 0 stands a few hundred units in from the sheet's
 * edge. Everything sheet-wide drawn from x = 0 there left the landscape to its left lit beside a
 * dimmed page — the front page's tour and its "continue?" card both did. The camera's scroll is
 * the exact distance; on the HUD and on the phone it is 0 and nothing moves.
 */
export function sheetSpan(scene: { cameras: { main: { scrollX: number } } }): { left: number; width: number } {
  return { left: Math.min(0, scene.cameras.main.scrollX), width: surfaceWidth() };
}

/**
 * Where each scene's camera sits on the desktop sheet.
 *
 * On the phone every scene draws the whole 390-wide surface and this file does nothing — the early
 * return in `applyCameraLayout` is the entire phone path, and it must stay that way: a viewport
 * call on the phone would be a change to a layout that is proven pixel by pixel.
 *
 * On the desktop the sheet is wider than the column, and there are three kinds of scene:
 *
 *   world  the map scenes. Their camera covers the whole sheet, so the world fills the window and
 *          shows through the column's transparent middle exactly as it shows through on the phone.
 *   hud    the chrome over a world scene. The whole sheet, like the world's: on the desktop the
 *          HUD is composed across it — a top bar, a bottom bar, docked panels, centred cards
 *          (`conquest/shell.ts`, `conquest/hudSheet.ts`) — and each component keeps its own
 *          390-based layout inside a container that is simply placed where a desktop expects it.
 *   page   a screen with nothing behind it — the menu, the manual, the history, the cabinet, the
 *          skirmish's setup sheet. The camera covers the whole sheet and the 390 column is placed
 *          in the middle of it by *scroll*, not by viewport, so a page can paint beyond its column:
 *          the front page's landscape across the window, a faint one behind a reading page.
 *
 * Hit-testing goes through `camera.getWorldPoint`, which folds a camera's viewport and scroll into
 * the inverse it applies to the pointer (checked against Phaser 4.2.1), so every interactive
 * object keeps working whichever way its scene is placed; `localPointer` does the same for the
 * few handlers that read the pointer raw.
 *
 * The render scale is passed in rather than imported: `graphicsQuality.ts` calls this from
 * `applyRenderScale` and owns the scale, and a module that imported it back would be a cycle.
 */
export type CameraKind = 'world' | 'hud' | 'page';

const WORLD_SCENES = new Set(['MapScene', 'ConquestScene']);
const HUD_SCENES = new Set(['ConquestUIScene', 'UIScene']);

export function cameraKindFor(sceneKey: string): CameraKind {
  if (WORLD_SCENES.has(sceneKey)) return 'world';
  if (HUD_SCENES.has(sceneKey)) return 'hud';
  return 'page';
}

/**
 * The battle's stage on the desktop, in design units.
 *
 * Centred, with the dimmed map either side: the field keeps the figures at their drawn size and
 * gains the ground between the camps that a phone never had room for, and the dock's five chips
 * get a hand's width each. Capped so the stage reads as a card over the map rather than a second
 * screen — at a thousand it filled three quarters of a 16:9 sheet and was reported as too wide,
 * and 780 still as stretched; at 640 the scroll round it (`battleStageSpan`) takes half of a 16:9
 * sheet, the proportion of a card, and the war is still on the map.
 */
export const BATTLE_SHEET_WIDTH = 640;

export function battleSheetWidth(): number {
  return Math.max(GAME_WIDTH, Math.min(BATTLE_SHEET_WIDTH, surfaceWidth() - 160));
}

/**
 * The HUD scene's sheet: the column, or the battle's wider stage while a fight is on screen.
 * Module state, like the surface width, because the HUD's camera and every battle module read it
 * and only `conquest/hudSheet.ts` writes it. Always the column on the phone.
 */
let hudWidth = GAME_WIDTH;

export function hudSheetWidth(): number {
  return uiColumnX() === 0 ? GAME_WIDTH : hudWidth;
}

export function setHudSheetWidth(width: number): void {
  hudWidth = Math.max(GAME_WIDTH, Math.round(width));
}

/**
 * The HUD sheet's *height*: where an overlay's foot is. The whole sheet on the phone and for
 * anything that takes the chrome down with it (a card, the menu, the battle's stage); on the
 * desktop a docked lane keeps the bottom bar up beside it, so its page ends where the bar begins
 * — a panel between the two bars, not a sheet over one of them. Written by `placeModalLayer`,
 * read by the lane and prompt frames in place of `GAME_HEIGHT`.
 */
let hudHeight = GAME_HEIGHT;

export function hudSheetHeight(): number {
  return uiColumnX() === 0 ? GAME_HEIGHT : hudHeight;
}

export function setHudSheetHeight(height: number): void {
  hudHeight = Math.round(height);
}

/** The column's left edge on the sheet, in design units, for a scene of this kind. */
export function columnXFor(kind: CameraKind): number {
  return kind === 'page' ? pageColumnX() : 0;
}

/**
 * Places the scene's main camera. Call after the camera's origin and zoom are set — `setViewport`
 * disturbs neither — and again whenever the sheet's width changes (see `desktopResize.ts`) or the
 * HUD's sheet does (`conquest/hudSheet.ts`).
 */
export function applyCameraLayout(scene: Phaser.Scene, renderScale: number): void {
  if (uiColumnX() === 0) return;
  const camera = scene.cameras?.main;
  if (!camera) return;
  const kind = cameraKindFor(scene.scene.key);
  const height = Math.round(GAME_HEIGHT * renderScale);
  camera.setViewport(0, 0, Math.round(surfaceWidth() * renderScale), height);
  // A page's column sits in the middle of the sheet by scroll: world x = 0 lands at the column's
  // left edge, and anything the page draws left of 0 lands on the sheet beside it.
  camera.setScroll(kind === 'page' ? -pageColumnX() : 0, 0);
}
