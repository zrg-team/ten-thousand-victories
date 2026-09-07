import Phaser from 'phaser';
import { findPowerCard } from '../data/ascentCards';
import { cabinetLevel } from '../state/cabinet';
import { CARD_ICON_SIZE, drawCardIcon, iconForOption, type CardIconId } from './CardIcons';
import { INK_UI, INK_UI_HEX } from './InkUI';
import { seal, sawtoothBand } from './ink/devices';
import { getLanguage, t } from '../i18n';
import { TITLE_FONT, UI_FONT } from './fonts';
import type { AscentRarity } from '../state/types';
import { registerGpuBake, unregisterGpuBake } from '../game/gpuBakes';
import { addStoryPrint, powerStoryPrint } from './storyPrint';

/**
 * The card face, baked. One RenderTexture per `(cardId, level, language)`, drawn once and
 * stamped by every consumer — the draft fan, the cabinet grid, the scratch reveal, the bind
 * step. **Never live Graphics per frame**: the perf ledger's cost floor is Phaser 4 replaying
 * live Graphics every frame (12–16 MB of garbage a frame at its worst), and a hand of five
 * inked cards is exactly the object count that trap is made of.
 *
 * Pattern and lifetime rules copied from `heroFaceTextureKey` (FaceRenderer): draw into an
 * off-list RenderTexture, `render()` **before** destroying the source container or the buffered
 * draw flushes against dead objects and a blank face is cached forever, then `saveTexture`.
 * The RT is kept in a module map because destroying it destroys the saved texture.
 */

/** Design-unit size of a face. Consumers scale stamps down; nothing renders larger than this. */
export const CARD_FACE_W = 150;
export const CARD_FACE_H = 210;
/** Crisp at the fan's near-full-size card without doubling the cache's area. */
const FACE_RASTER = 1.5;

const FACE_TEXTURE_PREFIX = 'card-face:';
const faceTextures = new Map<string, Phaser.GameObjects.RenderTexture>();

/** Mirrors `RARITY_COLOR` in `scenes/conquest/constants.ts` — ui/ must not import scenes/. */
const FACE_RARITY: Record<AscentRarity, number> = {
  bronze: 0x9c6b3f,
  silver: 0xa8adb4,
  gold: INK_UI.gold,
  jade: INK_UI.jade,
};

/**
 * The motif each seal is carved with — the `CardIcons` vocabulary drawn large. Cards not named
 * here fall through to `iconForOption`'s token match, then to the crown.
 */
const CARD_MOTIF: Record<string, CardIconId> = {
  'iron-levy': 'blade',
  'rice-tribute': 'grain',
  'salt-roads': 'cart',
  'hidden-paths': 'retreat',
  'march-escort': 'banner',
  'feigned-retreat': 'retreat',
  'village-muster': 'banner',
  'bronze-drums': 'banner',
  'corvee-labour': 'hammer',
  'granary-edict': 'grain',
  'earthen-ramparts': 'wall',
  'bamboo-palisade': 'wall',
  'mountain-pass': 'hourglass',
  'surveyors-corps': 'scroll',
  'bronze-drum': 'banner',
  'royal-guard': 'shield',
  'fire-arrows': 'bows',
  'twice-born': 'spark',
  'mandarin-academy': 'book',
  'war-drums': 'horse',
  'dragon-standard': 'crown',
  'heavenly-mandate': 'crown',
  'bach-dang-stakes': 'spears',
  'thunder-march': 'horse',
  'celestial-granary': 'grain',
};

export function cardMotif(cardId: string): CardIconId {
  return CARD_MOTIF[cardId] ?? iconForOption(cardId) ?? 'crown';
}

/**
 * Builds the face at design size, as live objects. Only the bake calls this — consumers go
 * through `cardFaceTextureKey` and stamp the result.
 */
function buildCardFace(scene: Phaser.Scene, cardId: string, level: 1 | 2 | 3): Phaser.GameObjects.Container {
  const card = findPowerCard(cardId);
  const rarity: AscentRarity = card?.rarity ?? 'bronze';
  const colour = FACE_RARITY[rarity];
  const W = CARD_FACE_W;
  const H = CARD_FACE_H;
  const container = scene.add.container(0, 0);

  // Paper, wash, and the double frame the game's chrome is drawn in — the outer heavy in the
  // rarity's ink, the inner a hairline. A Lv3 card gets the gilt frame the ladder promises.
  const g = scene.add.graphics();
  g.fillStyle(INK_UI.parchment, 1);
  g.fillRoundedRect(0, 0, W, H, 10);
  // The wash climbs with rarity, exactly like the hero cards: bronze stays bare paper.
  const wash = rarity === 'jade' ? 0.15 : rarity === 'gold' ? 0.11 : rarity === 'silver' ? 0.05 : 0;
  if (wash > 0) {
    g.fillStyle(colour, wash);
    g.fillRoundedRect(2, 2, W - 4, H - 4, 9);
  }
  g.lineStyle(level >= 3 ? 3.5 : 2.5, level >= 3 ? INK_UI.gold : colour, 0.95);
  g.strokeRoundedRect(1.5, 1.5, W - 3, H - 3, 9);
  g.lineStyle(0.9, INK_UI.brush, 0.4);
  g.strokeRoundedRect(6, 6, W - 12, H - 12, 6);
  container.add(g);

  // Rarity on the head, the way every card in the mode says its tier.
  container.add(scene.add.text(12, 10, t(`ascent.rarity.${rarity}` as Parameters<typeof t>[0]), {
    color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
  }));

  // The motif, carved large: the 26-unit glyph at 3×, boxed on its own ground.
  const motifBox = scene.add.graphics();
  motifBox.fillStyle(colour, 0.08);
  motifBox.fillRoundedRect(18, 28, W - 36, 92, 6);
  motifBox.lineStyle(0.9, INK_UI.brush, 0.3);
  motifBox.strokeRoundedRect(18, 28, W - 36, 92, 6);
  container.add(motifBox);
  const print = addStoryPrint(scene, container, powerStoryPrint(cardId),
    {x:18, y:28, width:W - 36, height:92});
  const glyph = drawCardIcon(scene, cardMotif(cardId), colour);
  glyph.setPosition(print ? 20 : W / 2, print ? H - 30 : 28 + 46);
  glyph.setScale((print ? 13 : (92 - 18) / 2.1) / CARD_ICON_SIZE);
  container.add(glyph);

  const band = scene.add.graphics();
  sawtoothBand(band, 18, 124, W - 36, 5, 0.45);
  container.add(band);

  // The name, centred under the motif. Two lines at most; the catalog's longest names wrap once.
  const name = scene.add.text(W / 2, 134, t(`ascent.card.${cardId}` as Parameters<typeof t>[0]), {
    color: INK_UI_HEX.inkText, fontFamily: TITLE_FONT, fontSize: '14px', fontStyle: '700',
    align: 'center', wordWrap: { width: W - 24 }, maxLines: 2,
  }).setOrigin(0.5, 0);
  container.add(name);

  // The stars are the ladder made visible: one per cabinet level, gold from Lv2 up.
  const stars = scene.add.text(W / 2, H - 32, '★'.repeat(level), {
    color: level >= 2 ? `#${INK_UI.gold.toString(16).padStart(6, '0')}` : INK_UI_HEX.mutedText,
    fontFamily: UI_FONT, fontSize: '14px',
  }).setOrigin(0.5, 0);
  container.add(stars);

  // The name seal, pressed crooked in the corner the way a hand presses one.
  const chop = scene.add.graphics();
  seal(chop, W - 24, H - 24, 22, rarity === 'jade' ? 'star' : 'lotus');
  container.add(chop);

  return container;
}

/**
 * The face as a texture key, baked on first ask and cached per
 * `(cardId, level, language, tilt)`. Returns undefined when the GL context is lost — callers
 * draw nothing this frame and ask again on the next render, exactly as the portrait bake does.
 *
 * **Why a tilt is baked rather than set on the Image.** Rotating an RT-backed Image on the
 * display list corrupts the sprite batch the moment certain Text objects share the frame:
 * bisected on the draft fan, a rotated stamp plus the readout's title label made every tilted
 * card render fragments of its neighbours, while panel and rail Graphics beside the same text
 * were harmless and axis-aligned stamps never break anywhere (the cabinet grid, the combine
 * ceremony). So the fan's hand-held tilt goes *into* the texture — every quad on screen stays
 * axis-aligned — and a raised card straightens by cross-fading to the untilted bake, not by
 * tweening `angle` through the broken path.
 */
export function cardFaceTextureKey(
  scene: Phaser.Scene,
  cardId: string,
  level?: 1 | 2 | 3,
  tiltDeg = 0,
): string | undefined {
  const lv = level ?? cabinetLevel(cardId);
  const tilt = Math.round(tiltDeg * 10) / 10;
  const key = `${FACE_TEXTURE_PREFIX}${cardId}:${lv}:${getLanguage()}:${tilt}`;
  if (scene.textures.exists(key)) return key;
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (renderer?.contextLost) return undefined;

  // The rotated face's bounding box, so a tilted bake keeps its corners.
  const rad = Phaser.Math.DegToRad(Math.abs(tilt));
  const boundsW = CARD_FACE_W * Math.cos(rad) + CARD_FACE_H * Math.sin(rad);
  const boundsH = CARD_FACE_H * Math.cos(rad) + CARD_FACE_W * Math.sin(rad);
  const width = Math.ceil(boundsW * FACE_RASTER);
  const height = Math.ceil(boundsH * FACE_RASTER);
  const target = scene.make.renderTexture({ width, height }, false);
  // The painting is a closure so a restored GL context can run it again into the SAME texture
  // (`game/gpuBakes.ts`): the saved key is shared with every image already stamped from it, so
  // repainting in place brings every card on screen back without any consumer being told.
  const paint = (into: Phaser.Scene): void => {
    const face = buildCardFace(into, cardId, lv);
    face.setScale(FACE_RASTER);
    if (tilt !== 0) {
      // Rotated about the card's centre: place the top-left corner where the rotation of the
      // centred card puts it. (Rotating an object *into a bake* is fine — the broken path is a
      // rotated quad on the live display list.)
      const a = Phaser.Math.DegToRad(tilt);
      const cx = (width / 2) / FACE_RASTER;
      const cy = (height / 2) / FACE_RASTER;
      const ox = -CARD_FACE_W / 2;
      const oy = -CARD_FACE_H / 2;
      face.setRotation(a);
      face.setPosition(
        (cx + ox * Math.cos(a) - oy * Math.sin(a)) * FACE_RASTER,
        (cy + ox * Math.sin(a) + oy * Math.cos(a)) * FACE_RASTER,
      );
    }
    target.clear();
    target.draw(face);
    // Flush the buffered draw before the source dies — see the file comment.
    target.render();
    face.destroy(true);
  };
  paint(scene);
  target.saveTexture(key);
  faceTextures.set(key, target);
  registerGpuBake(scene.game, key, () => {
    if (!faceTextures.has(key) || !scene.textures.exists(key)) {
      unregisterGpuBake(key);
      return;
    }
    // Built in whichever scene is live: the one that baked it may have been stopped since.
    paint(scene.game.scene.getScenes(true)[0] ?? scene);
  });
  return key;
}

/**
 * Stamps a face into a box, preserving aspect; a `tiltDeg` stamps the pre-tilted bake, whose
 * corners spill past the card box exactly as a live rotation's would. The image is a single
 * axis-aligned texture — a whole fan of these costs the renderer five quads, which is the flat
 * frame cost the gate measures.
 */
export function stampCardFace(
  scene: Phaser.Scene,
  cardId: string,
  box: { x: number; y: number; width: number; height: number },
  level?: 1 | 2 | 3,
  tiltDeg = 0,
): Phaser.GameObjects.Image | undefined {
  const key = cardFaceTextureKey(scene, cardId, level, tiltDeg);
  if (!key) return undefined;
  const image = scene.add.image(box.x + box.width / 2, box.y + box.height / 2, key);
  // Scaled off the CARD's own dimensions, not the tilted bounds — the card must render at the
  // same size at every angle, with the rotated corners overhanging the box.
  const scale = Math.min(box.width / (CARD_FACE_W * FACE_RASTER), box.height / (CARD_FACE_H * FACE_RASTER));
  image.setScale(scale);
  return image;
}

// ── The back, and the numbers a face cannot carry ───────────────────────────

const BACK_TEXTURE_PREFIX = 'card-back:';
const backTextures = new Map<string, Phaser.GameObjects.RenderTexture>();

/** The back of a seal card: paper, the double frame in plain ink, one large seal. */
function buildCardBack(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const W = CARD_FACE_W;
  const H = CARD_FACE_H;
  const container = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(INK_UI.parchmentShade, 1);
  g.fillRoundedRect(0, 0, W, H, 10);
  g.lineStyle(2.5, INK_UI.brush, 0.8);
  g.strokeRoundedRect(1.5, 1.5, W - 3, H - 3, 9);
  g.lineStyle(0.9, INK_UI.brush, 0.4);
  g.strokeRoundedRect(6, 6, W - 12, H - 12, 6);
  // A lattice, so the back reads as printed rather than blank.
  g.lineStyle(0.6, INK_UI.brush, 0.18);
  for (let x = 12; x < W - 12; x += 12) g.lineBetween(x, 12, x, H - 12);
  for (let y = 12; y < H - 12; y += 12) g.lineBetween(12, y, W - 12, y);
  container.add(g);
  const band = scene.add.graphics();
  sawtoothBand(band, 18, 30, W - 36, 5, 0.4);
  sawtoothBand(band, 18, H - 34, W - 36, 5, 0.4);
  container.add(band);
  const chop = scene.add.graphics();
  seal(chop, W / 2, H / 2, 46, 'lotus');
  container.add(chop);
  return container;
}

/** The back as a texture key, baked once per language (the bake path is the face's). */
export function cardBackTextureKey(scene: Phaser.Scene): string | undefined {
  const key = `${BACK_TEXTURE_PREFIX}${getLanguage()}`;
  if (scene.textures.exists(key)) return key;
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (renderer?.contextLost) return undefined;
  const width = Math.ceil(CARD_FACE_W * FACE_RASTER);
  const height = Math.ceil(CARD_FACE_H * FACE_RASTER);
  const target = scene.make.renderTexture({ width, height }, false);
  const paint = (into: Phaser.Scene): void => {
    const back = buildCardBack(into);
    back.setScale(FACE_RASTER);
    target.clear();
    target.draw(back);
    target.render();
    back.destroy(true);
  };
  paint(scene);
  target.saveTexture(key);
  backTextures.set(key, target);
  registerGpuBake(scene.game, key, () => {
    if (!backTextures.has(key) || !scene.textures.exists(key)) {
      unregisterGpuBake(key);
      return;
    }
    paint(scene.game.scene.getScenes(true)[0] ?? scene);
  });
  return key;
}

/** Stamps the back into a box, the way `stampCardFace` stamps a face. */
export function stampCardBack(
  scene: Phaser.Scene,
  box: { x: number; y: number; width: number; height: number },
): Phaser.GameObjects.Image | undefined {
  const key = cardBackTextureKey(scene);
  if (!key) return undefined;
  const image = scene.add.image(box.x + box.width / 2, box.y + box.height / 2, key);
  image.setScale(Math.min(box.width / (CARD_FACE_W * FACE_RASTER), box.height / (CARD_FACE_H * FACE_RASTER)));
  return image;
}

/**
 * The four numbers the baked face cannot carry, because they change while the bake does not:
 * this run's stack in pips, copies toward the next combine, and whether the seal rides in the
 * opening hand. Live objects, few and small, laid over the stamp in the face's own units.
 */
export interface CardOverlayData {
  /** This run's stack and its cap; pips are drawn for the cap and lit for the stack. */
  stack?: number;
  maxStack?: number;
  /** Copies held in the cabinet toward the next combine, and the count the combine needs. */
  copies?: number;
  need?: number;
  /** The cabinet level; at 3 the copies line says "max". */
  level?: 1 | 2 | 3;
  /** Slotted in the opening hand. */
  inHand?: boolean;
  /** Copies held, as a count on the corner — the binder's *how many of this do I have*. */
  held?: number;
}

/**
 * Builds the overlay for a face stamped into `box`. Returned as a container whose origin is the
 * box's top-left and whose scale is the box's scale, so callers position it exactly as the stamp.
 */
export function cardFaceOverlay(
  scene: Phaser.Scene,
  box: { x: number; y: number; width: number; height: number },
  data: CardOverlayData,
): Phaser.GameObjects.Container {
  const W = CARD_FACE_W;
  const H = CARD_FACE_H;
  const scale = Math.min(box.width / W, box.height / H);
  const container = scene.add.container(box.x, box.y).setScale(scale);
  const gold = `#${INK_UI.gold.toString(16).padStart(6, '0')}`;

  // Stack pips, top-right, on the rarity line: one ring per possible copy, filled for each held.
  if (data.maxStack && data.maxStack > 0) {
    const pips = scene.add.graphics();
    const R = 4;
    const step = R * 2 + 4;
    const right = W - 14;
    for (let i = 0; i < data.maxStack; i += 1) {
      const cx = right - (data.maxStack - 1 - i) * step;
      const cy = 15;
      if (i < (data.stack ?? 0)) {
        pips.fillStyle(INK_UI.gold, 1);
        pips.fillCircle(cx, cy, R);
      }
      pips.lineStyle(1.2, INK_UI.brush, 0.7);
      pips.strokeCircle(cx, cy, R);
    }
    container.add(pips);
  }

  // The count held, top-right, where the run's stack pips go: a cinnabar pill with ×N. Asked
  // for as *can the list show a badge of the number of cards we have?* — the copies line under
  // the face says what is still needed, not what is held.
  if (data.held !== undefined && data.held > 0) {
    const label = scene.add.text(0, 0, `×${data.held}`, {
      color: '#f3e6c4', fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
    }).setOrigin(0.5);
    const pillW = Math.max(22, Math.ceil(label.width) + 10);
    const pill = scene.add.graphics();
    pill.fillStyle(INK_UI.cinnabar, 1);
    pill.fillRoundedRect(W - 12 - pillW, 8, pillW, 16, 8);
    label.setPosition(W - 12 - pillW / 2, 16);
    container.add(pill);
    container.add(label);
  }

  // Copies toward the next combine, bottom-left, clear of the stars and the chop.
  if (data.level !== undefined || data.copies !== undefined) {
    const line = data.level === 3
      ? t('cabinet.maxShort')
      : (data.copies ?? 0) >= (data.need ?? 1)
        ? t('cabinet.readyShort')
        : t('cabinet.copiesLeft', { n: Math.max(0, (data.need ?? 0) - (data.copies ?? 0)) });
    container.add(scene.add.text(12, H - 18, line, {
      color: data.level === 3 ? INK_UI_HEX.mutedText : gold, fontFamily: UI_FONT, fontSize: '9.5px', fontStyle: '700',
      backgroundColor: 'rgba(243,230,196,0.9)', padding: { x: 3, y: 1 },
    }).setOrigin(0, 1));
  }

  if (data.inHand) {
    container.add(scene.add.text(12, 26, `◼ ${t('cabinet.hand.slotted')}`, {
      color: '#4a6a55', fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
      backgroundColor: 'rgba(243,230,196,0.9)', padding: { x: 3, y: 1 },
    }));
  }
  return container;
}
