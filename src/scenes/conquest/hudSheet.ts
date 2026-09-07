import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, isDesktopSheet, surfaceWidth, uiColumnX } from '../../game/constants';
import { battleSheetWidth, hudSheetWidth, setHudSheetHeight, setHudSheetWidth } from '../../game/cameraLayout';
import type { ConquestUIScene } from '../ConquestUIScene';

/**
 * Where the modal layer sits on the desktop sheet, by what it holds.
 *
 * Every overlay in Dragon Ascent is built into `modalLayer` in 390-wide column units, and on the
 * phone that container sits at the origin. On the desktop the sheet is wider, and where a 390-wide
 * page belongs depends on what it is — the conventions every strategy player already knows:
 *
 *   a lane (Build, Army, Court…)   docked at the right edge, the map lit beside it: a panel you
 *                                  work in while looking at the world it is about
 *   a card, the menu, the codex    centred over the dimmed map: a decision the world waits on
 *   the battle                     a stage 640 wide, centred, with the map either side
 *
 * The container moves; nothing inside it is laid out again. The world scene's dim
 * (`ui:world-dim`) is lighter under a docked lane than under a card for the same reason the
 * placement differs.
 */
export function placeModalLayer(self: ConquestUIScene): void {
  if (!isDesktopSheet()) {
    self.modalLayer.setX(0);
    return;
  }
  const stage = hudSheetWidth();
  const key = self.openPromptKey;
  let x: number;
  let height = GAME_HEIGHT;
  if (stage > GAME_WIDTH) x = Math.round((surfaceWidth() - stage) / 2);
  else if (key.startsWith('lane:')) {
    x = uiColumnX();
    // A docked panel ends where the bottom bar begins; the bar stays up beside it.
    height = GAME_HEIGHT - ACTION_BAR_HEIGHT;
  } else x = Math.round((surfaceWidth() - GAME_WIDTH) / 2);
  setHudSheetHeight(height);
  self.modalLayer.setX(x);
}

/**
 * The battle stage's vertical span, and the frame round it.
 *
 * On the phone the fight is the screen: from under the header to the foot, with no frame, as it
 * always was. On the desktop it is a modal — a royal scroll (`ui/ink/royalScroll`, the front
 * page's own plate) centred over the dimmed map at the stage's width, and centred between the
 * top bar and the sheet's foot at 568 tall — the phone's shortest layout (a 620 sheet under its
 * 52 header), which every battle module is already proven to fit. Taller, it ran from the bar to
 * the foot and read as a stretched screen rather than a card. `frame` is the scroll's margin
 * outside the battle's own box: the field runs to the box's edges, and the scroll's border and
 * rolls sit outside that.
 */
export function battleStageSpan(): { top: number; bottom: number; frame: number } {
  if (!isDesktopSheet()) return { top: HEADER_HEIGHT, bottom: GAME_HEIGHT, frame: 0 };
  const inset = Math.max(0, Math.round((GAME_HEIGHT - HEADER_HEIGHT - 568) / 2));
  return { top: HEADER_HEIGHT + inset, bottom: GAME_HEIGHT - inset, frame: 30 };
}

/** Whether the overlay that is up is a docked lane page rather than a card or a stage. */
export function laneIsDocked(self: ConquestUIScene): boolean {
  return isDesktopSheet() && self.openPromptKey.startsWith('lane:') && hudSheetWidth() === GAME_WIDTH;
}

/**
 * The HUD's stage width: the column, or — on the desktop, while the battle is up — the wide stage.
 *
 * Every battle module lays itself out against `hudSheetWidth()`, so this runs before any of them
 * measure (`showBattle`) and again when the field is torn down (`clearLanePage`), which is what
 * keeps the stage from outliving the fight. A no-op on the phone.
 */
export function setHudSheet(self: ConquestUIScene, wide: boolean): void {
  const width = wide && isDesktopSheet() ? battleSheetWidth() : GAME_WIDTH;
  if (width !== hudSheetWidth()) setHudSheetWidth(width);
  placeModalLayer(self);
}
