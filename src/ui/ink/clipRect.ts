import Phaser from 'phaser';

/**
 * A rectangular clip that survives this game's zoomed cameras.
 *
 * **Why this is not a mask, and not a filter.**
 *
 * Phaser 4 made `GeometryMask` Canvas-only — under WebGL the renderer never consults it, so every
 * `setMask` in v3 code silently became "no clip at all". The documented replacement is a Mask
 * *filter*, and that was the first port. It is exact at `RENDER_SCALE` 1 and visibly wrong at 2
 * and 3, which are the medium and high graphics tiers — i.e. what nearly every player gets.
 *
 * Object-level filters size their framebuffer from the camera's *design* dimensions and then draw
 * into it at the camera's zoomed scale, so everything past the design rectangle lands outside the
 * framebuffer and is discarded. This game inflates `gameSize` by `RENDER_SCALE` and zooms every
 * camera by the same factor to get back to 390-wide design units (`game/graphicsQuality.ts`) —
 * exactly the configuration that trips it. Measured with `?capture=1`, asking for a clip rect of
 * design (12, 108, 366, 675) on a 390x844 surface:
 *
 *   RENDER_SCALE 1, canvas 390x844   — kept x 14..374, y 112..782  (exact; the content's own edge)
 *   RENDER_SCALE 2, canvas 780x1688  — kept x 24..354, y 216..824  (cropped, and content deleted)
 *
 * So the branch shipped with the filter gated off above scale 1, which meant no clip: the History
 * and How to Play pages painted their lists straight over the title and the tab row, and that is
 * what players saw on the live build.
 *
 * **What this uses instead.** Phaser 4.2 added the `Stencil` game object: a WebGL stencil-buffer
 * layer that blocks drawing wherever it is non-zero, applied in screen space with no framebuffer
 * round-trip. It has no design-size rectangle to fall out of, so the camera zoom is irrelevant —
 * it clips identically at every tier. It is also cheaper than the filter it replaces: a filter is
 * a full-screen shader pass per scroll area, this is one draw of one rectangle.
 *
 * **How it is used.** The clip is a bracket, not a property. `begin()` goes into the parent's child
 * list before the things being clipped and adds the stencil layer; `end()` goes in after them and
 * subtracts it again. Anything drawn between the two is confined to the rect; anything outside the
 * bracket is untouched. The pair must stay balanced — a layer added and never subtracted keeps
 * blocking for the rest of the frame — which is why both objects live in the same container: hide
 * or destroy it and both go together.
 *
 * On Canvas there is no stencil buffer, and there the v3 geometry mask is still the live mechanism,
 * so `apply()` falls back to it. Under WebGL `apply()` does nothing.
 */
export class RectClip {
  private readonly shape: Phaser.GameObjects.Graphics;
  private readonly stencil?: Phaser.GameObjects.Stencil;
  private readonly release?: Phaser.GameObjects.StencilReference;
  private readonly geometryMask?: Phaser.Display.Masks.GeometryMask;
  private disposed = false;

  /** `rect` is in the coordinate space of whatever container `begin`/`end` are added to. */
  constructor(
    private readonly scene: Phaser.Scene,
    rect: { x: number; y: number; width: number; height: number },
  ) {
    // Off the display list: it is drawn by the stencil (or read by the mask), never by the scene.
    this.shape = scene.make.graphics({}, false);
    this.shape.fillStyle(0xffffff, 1);

    if (stencilClipUsable(scene)) {
      // The geometry is everything *around* the hole — four bands out to a distance no sheet
      // reaches — rather than the hole itself under `stencilInvert`. Inversion works by filling
      // the camera first and subtracting the children, and the fill is placed by the camera's own
      // viewport arithmetic, which parts company with where the children actually land as soon as
      // the camera sits at an offset on the sheet: measured on the desktop layout, whose chrome
      // camera starts a column's width from the left edge, the fill missed the column entirely and
      // the subtraction left the list's own rectangle as the one place nothing could draw — every
      // list read as blank, with its cards' edges peeping out around the box. Bands go through the
      // same transform as everything else in the container, so they land where the content does.
      const far = 8192;
      this.shape.fillRect(rect.x - far, rect.y - far, rect.width + far * 2, far);
      this.shape.fillRect(rect.x - far, rect.y + rect.height, rect.width + far * 2, far);
      this.shape.fillRect(rect.x - far, rect.y, far, rect.height);
      this.shape.fillRect(rect.x + rect.width, rect.y, far, rect.height);
      this.stencil = scene.add.stencil(0, 0, [this.shape]);
      this.release = scene.add.stencilreference(this.stencil, {
        stencilLayerMode: 'subtractLayer',
      });
    } else {
      // The Canvas mask is the hole itself: a geometry mask keeps what it covers.
      this.shape.fillRect(rect.x, rect.y, rect.width, rect.height);
      this.geometryMask = this.shape.createGeometryMask();
    }
  }

  /** Add the opening half to `parent`, immediately before the children being clipped. */
  begin(parent: Phaser.GameObjects.Container): void {
    if (this.stencil) {
      parent.add(this.stencil);
    }
  }

  /** Add the closing half to `parent`, immediately after the children being clipped. */
  end(parent: Phaser.GameObjects.Container): void {
    if (this.release) {
      parent.add(this.release);
    }
  }

  /**
   * Canvas fallback. Under WebGL the stencil already covers everything inside the bracket and this
   * does nothing; on Canvas each clipped object needs the geometry mask set on it directly.
   */
  apply(target: Phaser.GameObjects.GameObject & { setMask(mask: Phaser.Display.Masks.GeometryMask): unknown }): void {
    if (this.geometryMask) {
      target.setMask(this.geometryMask);
    }
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    // Order matters: the reference points at the stencil and reads its transform while rendering.
    this.release?.destroy();
    this.stencil?.destroy();
    this.geometryMask?.destroy();
    this.shape.destroy();
  }
}

/**
 * Whether a stencil clip is available on this renderer.
 *
 * WebGL only — the stencil buffer is a WebGL attachment — and only when the game did not turn
 * stencil buffers off, which it does not (`Phaser.Core.Config` defaults `render.stencil` to true,
 * and pooled filter framebuffers get a stencil attachment along with it, so this still clips
 * correctly underneath the full-screen `PaperFX` camera pass).
 */
export function stencilClipUsable(scene: Phaser.Scene): boolean {
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer?.renderNodes) {
    return false;
  }
  return scene.game.config.stencil !== false && typeof scene.add.stencil === 'function';
}
