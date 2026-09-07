import Phaser from 'phaser';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import { applyRenderScale } from '../game/graphicsQuality';

/**
 * First scene. Its one job beyond handing off to the preloader is to make sure the game's own
 * typefaces are in the document before anything draws text.
 *
 * Phaser measures and rasterises text the moment a `Text` object is created and does not re-render
 * it when a webfont finishes loading. Without this wait the menu — the very first thing anyone sees
 * — renders in the fallback face and stays that way until something else forces a repaint.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    applyRenderScale(this);
    void this.awaitFonts().then(() => this.scene.start('PreloadScene'));
  }

  private async awaitFonts(): Promise<void> {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts?.load) {
      return;
    }
    try {
      // The @font-face rules are loaded off the critical path so the splash in `index.html` can
      // paint one round trip sooner (see the comment on the `fonts-css` link). Until that
      // stylesheet applies the document has never heard of these families, and `fonts.load` for a
      // family it does not know resolves immediately having fetched nothing — which is a menu
      // rasterised in Georgia. `index.html` resolves this promise when the sheet lands, and caps
      // its own wait, so a blocked stylesheet still boots the game.
      await window.__fontsCss;
      // Naming the sizes and weights matters: `document.fonts.ready` alone resolves before a face
      // that nothing has asked for yet is fetched.
      await Promise.all([
        fonts.load(`400 16px ${UI_FONT.split(',')[0]}`),
        fonts.load(`600 16px ${UI_FONT.split(',')[0]}`),
        fonts.load(`700 16px ${UI_FONT.split(',')[0]}`),
        fonts.load(`700 22px ${TITLE_FONT.split(',')[0]}`),
        // The serif at its reading weight too, for the card sheets that set a paragraph in it.
        // Source Serif 4 is vendored at 600 and 700 only (identical files, as it happens), so a
        // 400 request matches the 600 face — but only once something has actually fetched it.
        // Left lazy, the first card drawn rasterised its description in Georgia, which has no
        // ố, ấ or ề and prints the acute as a separate letter.
        fonts.load(`600 12px ${TITLE_FONT.split(',')[0]}`),
        fonts.ready,
      ]);
    } catch {
      // A blocked or missing font file must not stop the game booting — the stacks in `fonts.ts`
      // all end in a system face for exactly this case.
    }
  }
}
