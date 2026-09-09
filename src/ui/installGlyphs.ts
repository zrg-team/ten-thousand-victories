import Phaser from 'phaser';
import { INK_UI } from './InkUI';

/**
 * The browser's own buttons, drawn in ink.
 *
 * The install sheet is three sentences telling somebody to press a control that is *not on this
 * page* — it is in Safari's toolbar, or behind Chrome's ⋮, or at the end of a desktop address bar.
 * Written out, "tap the Share button" is a phrase you can read twice and still not find, because
 * the thing being named has no name on screen: it is a square with an arrow coming out of it.
 * Reported as exactly that — *clarify the icon to click, step by step, and use the correct icons*.
 *
 * So each step carries a picture of the control it means. These are deliberately literal copies of
 * the platforms' own glyphs rather than this game's woodblock vocabulary: a stylised Đông Hồ share
 * mark would be beautiful and would not match anything the player is about to look at. Ink weight
 * and colour are the game's; the shapes belong to iOS, Android and the desktop browsers.
 *
 * Drawn at a 20-unit box centred on the origin, like `CardIcons`, so a caller positions the
 * container and nothing else. The container owns its Graphics: destroy it and the drawing goes.
 */
export type InstallGlyphId =
  /** iOS/iPadOS Share: an open-topped box with an arrow rising out of it. */
  | 'share'
  /** The share sheet's "Add to Home Screen" row: a rounded square with a plus in it. */
  | 'addHome'
  /** A phone showing a grid of apps, with ours marked — where the game ends up. */
  | 'homeScreen'
  /** Chrome/Edge on Android: the ⋮ overflow button. */
  | 'dots'
  /** The browser menu on a desktop, which is ⋮ on Chromium and ☰ elsewhere. */
  | 'bars'
  /** Chromium's "Install app" row and address-bar button: a screen with an arrow into it. */
  | 'installApp'
  /** Safari's compass, for the one step that says to switch browsers. */
  | 'safari'
  /** Firefox's bookmark star, for the browser that cannot install a site at all. */
  | 'star'
  /** The Add / Install confirmation. */
  | 'confirm';

export const INSTALL_GLYPH_SIZE = 20;

export function drawInstallGlyph(
  scene: Phaser.Scene,
  id: InstallGlyphId,
  color: number = INK_UI.brush,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const line = (w: number, alpha = 0.95): void => { g.lineStyle(w, color, alpha); };
  container.setData('installGlyph', id);

  switch (id) {
    case 'share': {
      // The box, open at the top — the gap is the whole reason this glyph reads as "out of here".
      line(1.6);
      g.beginPath();
      g.moveTo(-4.5, -2.5);
      g.lineTo(-6.5, -2.5);
      g.lineTo(-6.5, 8);
      g.lineTo(6.5, 8);
      g.lineTo(6.5, -2.5);
      g.lineTo(4.5, -2.5);
      g.strokePath();
      // The arrow rising out of it.
      line(1.7);
      g.beginPath();
      g.moveTo(0, 2.5);
      g.lineTo(0, -8.5);
      g.moveTo(-3.4, -5.2);
      g.lineTo(0, -8.6);
      g.lineTo(3.4, -5.2);
      g.strokePath();
      break;
    }

    case 'addHome': {
      line(1.6);
      g.strokeRoundedRect(-7.5, -7.5, 15, 15, 4);
      line(1.7);
      g.beginPath();
      g.moveTo(-4, 0);
      g.lineTo(4, 0);
      g.moveTo(0, -4);
      g.lineTo(0, 4);
      g.strokePath();
      break;
    }

    case 'homeScreen': {
      // A phone, and four apps on it. Ours is the filled one, so the eye lands where the game
      // ends up. Drawn wide rather than to a phone's real proportions: at 20 units a 9:19 slab
      // leaves the apps too small to read as apps, which is the whole content of the picture.
      line(1.5);
      g.strokeRoundedRect(-7.5, -9.5, 15, 19, 2.6);
      g.fillStyle(color, 0.26);
      for (const [x, y] of [[-5, -6.5], [0.8, -6.5], [0.8, -0.7]] as const) {
        g.fillRoundedRect(x, y, 4.2, 4.2, 1.2);
      }
      g.fillStyle(color, 0.95);
      g.fillRoundedRect(-5, -0.7, 4.2, 4.2, 1.2);
      // The home indicator, which is what makes the slab read as a phone rather than a card.
      line(1.4, 0.6);
      g.beginPath();
      g.moveTo(-3, 6.6);
      g.lineTo(3, 6.6);
      g.strokePath();
      break;
    }

    case 'dots': {
      g.fillStyle(color, 0.95);
      for (const y of [-6, 0, 6]) {
        g.fillCircle(0, y, 1.9);
      }
      break;
    }

    case 'bars': {
      line(1.8);
      g.beginPath();
      for (const y of [-5, 0, 5]) {
        g.moveTo(-7, y);
        g.lineTo(7, y);
      }
      g.strokePath();
      break;
    }

    case 'installApp': {
      // A screen with an arrow coming down into it — Chromium's own install mark.
      line(1.5);
      g.strokeRoundedRect(-8, -7, 16, 12, 2);
      g.beginPath();
      g.moveTo(-4.5, 9);
      g.lineTo(4.5, 9);
      g.strokePath();
      line(1.7);
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(0, 1.5);
      g.moveTo(-3.2, -1.7);
      g.lineTo(0, 1.6);
      g.lineTo(3.2, -1.7);
      g.strokePath();
      break;
    }

    case 'safari': {
      line(1.5);
      g.strokeCircle(0, 0, 8);
      // The needle: two triangles about the centre, the way the compass rose is drawn.
      g.fillStyle(color, 0.9);
      g.fillTriangle(4.5, -4.5, -1.6, 1.4, 1.4, 1.9);
      g.fillStyle(color, 0.35);
      g.fillTriangle(-4.5, 4.5, 1.6, -1.4, -1.4, -1.9);
      break;
    }

    case 'star': {
      // Plain structs, not `Vector2`s: `fillPoints` reads `.x` and `.y` and nothing else — see
      // `src/phaser-v4-points.d.ts` for why the whole game draws polygons this way.
      g.fillStyle(color, 0.9);
      const star = Array.from({ length: 10 }, (_, index) => {
        const radius = index % 2 === 0 ? 8.5 : 3.8;
        const angle = -Math.PI / 2 + (index * Math.PI) / 5;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      });
      g.fillPoints(star, true);
      break;
    }

    case 'confirm': {
      line(1.5, 0.8);
      g.strokeCircle(0, 0, 8.5);
      line(2);
      g.beginPath();
      g.moveTo(-4, 0.2);
      g.lineTo(-1.2, 3.4);
      g.lineTo(4.4, -3.4);
      g.strokePath();
      break;
    }
  }

  container.add(g);
  return container;
}
