import type Phaser from 'phaser';
import { GAME_HEIGHT, setSurfaceWidth, surfaceWidth } from './constants';
import { applyCameraLayout } from './cameraLayout';
import { renderScaleNow } from './graphicsQuality';
import { desktopSurfaceWidth, isDesktopLayout, rootAspect } from '../platform/layout';

/**
 * The desktop sheet follows the window.
 *
 * Phaser's FIT scaler already handles a window that merely grows or shrinks: the sheet keeps its
 * aspect and scales. What FIT cannot do is change the sheet's *shape*, and on the desktop the
 * sheet's shape is the window's — a 16:9 sheet dragged into a 4:3 window would otherwise sit
 * letterboxed above and below until the next launch. So on a resize the width is derived again,
 * the buffer is resized in place (the same call `applyPendingRenderScale` makes for a quality
 * step), and every live scene is re-placed on the new sheet.
 *
 * Nothing inside a column is re-laid, and that is the whole reason the column exists: its
 * geometry is 390 × `GAME_HEIGHT` in its own units and never changes. What moves is the column's
 * place on the sheet (its camera viewport) and the world camera's width; the map re-clamps its
 * scroll and re-sizes its overlays on `LAYOUT_RESIZED`.
 *
 * Debounced: a drag on the window's edge fires resize on every frame, and a buffer resize under a
 * live scene is not free. 150 ms is under the beat a hand takes to let go.
 *
 * Never installed on the phone, whose sheet is the column and does not move.
 */
export const LAYOUT_RESIZED = 'layout:resized';

const DEBOUNCE_MS = 150;

export function installDesktopResize(game: Phaser.Game): void {
  if (!isDesktopLayout() || typeof window === 'undefined') return;
  let timer: number | undefined;

  const refit = (): void => {
    timer = undefined;
    const next = desktopSurfaceWidth(rootAspect());
    if (next === surfaceWidth()) return;
    setSurfaceWidth(next);
    const scale = renderScaleNow();
    game.scale.setGameSize(next * scale, GAME_HEIGHT * scale);
    // The world camera sits at (0,0) with the old full size, which Phaser's own resize handler
    // grows for us; the column cameras do not match that shape and are left alone, so every
    // scene is placed again explicitly.
    for (const scene of game.scene.getScenes(false)) {
      try {
        applyCameraLayout(scene, scale);
      } catch {
        // A scene mid-teardown has no camera to place.
      }
    }
    game.events.emit(LAYOUT_RESIZED, next);
  };

  window.addEventListener('resize', () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(refit, DEBOUNCE_MS);
  });
}
