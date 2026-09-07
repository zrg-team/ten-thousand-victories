import type Phaser from 'phaser';
import { GAME_HEIGHT, pageColumnX, surfaceWidth, uiColumnX } from '../game/constants';

/**
 * What a page scene paints beyond its column on the desktop.
 *
 * A page's camera covers the whole sheet with the 390 column in the middle (`cameraLayout.ts`), so
 * without this the column stood on bare paper with nothing either side — a phone screen in the
 * middle of a monitor. Two treatments, both drawn in the page's own coordinates, where the sheet
 * runs from `-pageColumnX()` to `surfaceWidth() - pageColumnX()`:
 *
 *   attachDesktopBackdrop   the front page's landscape plates, faint, covering the sheet under the
 *                           column — for the reading pages, so the column reads as a sheet lying
 *                           on the same desk as the front page.
 *   fitIllustrationToSheet  the front page's own illustration, scaled to cover the sheet — the
 *                           title screen a desktop expects, with the button column standing on it.
 *
 * Nothing on the phone: both return at once when there is no sheet beyond the column.
 */

/** The sheet, in a page scene's own design units. */
export function pageSheetBounds(): { x: number; y: number; width: number; height: number } {
  return { x: -pageColumnX(), y: 0, width: surfaceWidth(), height: GAME_HEIGHT };
}

/** Under everything a page draws: the pages put their own paper at -10. */
export const BACKDROP_DEPTH = -20;

const BACKDROP_PLATES: ReadonlyArray<[key: string, alpha: number]> = [
  ['menu-layer-ground-v5', 1],
  ['menu-layer-mountains-v3', 0.9],
];

export function attachDesktopBackdrop(
  scene: Phaser.Scene,
  opts: { alpha?: number; depth?: number } = {},
): Phaser.GameObjects.Container | undefined {
  if (uiColumnX() === 0) return undefined;
  const sheet = pageSheetBounds();
  const strength = opts.alpha ?? 0.16;
  const container = scene.add.container(0, 0).setDepth(opts.depth ?? BACKDROP_DEPTH);
  for (const [key, alpha] of BACKDROP_PLATES) {
    if (!scene.textures.exists(key)) continue;
    const source = scene.textures.get(key).getSourceImage() as { width: number; height: number };
    // Cover, not contain: the plate keeps clear margins, so a little of its edge cropped is
    // nothing, while bare paper beside it would be the very thing this exists to remove.
    const scale = Math.max(sheet.width / source.width, sheet.height / source.height);
    container.add(scene.add.image(sheet.x + sheet.width / 2, sheet.height / 2, key)
      .setScale(scale)
      .setAlpha(strength * alpha));
  }
  return container;
}

/**
 * Scales a column-sized illustration to cover the sheet, about the sheet's centre.
 *
 * `centre` and `size` are the illustration's own, in the page's units — where its ground plate
 * was placed for the column — and the container is assumed to sit at the origin at scale 1, which
 * is how the front page builds it. Everything inside scales with it: the mist, the wakes, the
 * lotus that springs under the pointer, and the hit zones that make it spring.
 */
export function fitIllustrationToSheet(
  artwork: Phaser.GameObjects.Container,
  centre: { x: number; y: number },
  size: { width: number; height: number },
): void {
  if (uiColumnX() === 0) return;
  const sheet = pageSheetBounds();
  const scale = Math.max(sheet.width / size.width, sheet.height / size.height);
  artwork.setScale(scale).setPosition(
    sheet.x + sheet.width / 2 - centre.x * scale,
    sheet.height / 2 - centre.y * scale,
  );
}
