import Phaser from 'phaser';

/** Restrained functional prints, shared by every size and interactive state. */
export const CONQUEST_UI_TEXTURE = 'conquest-ui-icons:v5';
/** Richer identity motifs keep a separate atlas so UI revisions never alter saved signs. */
export const DYNASTY_SIGN_TEXTURE = 'dynasty-sign-icons:v1';
export const CONQUEST_UI_ICON_IDS = [
  'person', 'crown', 'grain', 'purse', 'scales', 'wall', 'scroll', 'hammer',
  'shield', 'blade', 'banner', 'spark', 'herd', 'hut', 'coin', 'cart',
  'branch', 'retreat', 'hourglass', 'book', 'skull', 'cup', 'gear', 'globe',
  'phone', 'install', 'door', 'pause', 'play', 'heart', 'spears', 'horse',
  'skirmish', 'tortoise', 'bows', 'ladder', 'supplies', 'humans', 'zoom-in',
  'zoom-out', 'territory', 'terrain', 'menu', 'check', 'chevrons-up',
  'chevrons-down', 'chevron-up', 'chevron-down', 'close', 'balance', 'food', 'gold',
  'hero', 'diplomacy', 'victory', 'broken-shield', 'crossed-weapons',
] as const;
export type ConquestUiIconId = typeof CONQUEST_UI_ICON_IDS[number];

export const DYNASTY_SIGN_ART_IDS = [
  'bronze-drum', 'banner', 'blade', 'grain', 'bamboo', 'turtle', 'lotus', 'lac-bird',
  'dragon', 'phoenix', 'tiger', 'herd', 'carp', 'terrain', 'wave', 'star',
] as const;
export type DynastySignArtId = typeof DYNASTY_SIGN_ART_IDS[number];

export function preloadConquestUiIcons(scene: Phaser.Scene, base: string): void {
  if (!scene.textures.exists(CONQUEST_UI_TEXTURE)) scene.load.atlas(CONQUEST_UI_TEXTURE,
    `${base}art/conquest-ui-icons/icons-v5.png`, `${base}art/conquest-ui-icons/icons-v5.json`);
  if (!scene.textures.exists(DYNASTY_SIGN_TEXTURE)) scene.load.atlas(DYNASTY_SIGN_TEXTURE,
    `${base}art/conquest-ui-icons/signs-v1.webp`, `${base}art/conquest-ui-icons/signs-v1.json`);
}

/**
 * How much ink each store glyph actually puts inside its frame, so four of them read as one size.
 *
 * Every frame in `icons-v5.png` is fitted to 0.9 of its own width, but the drawing inside is not
 * the same shape: `gold` is a full coin at 0.900 x 0.900 of the frame, `food` a leaf at 0.883 x
 * 0.900, `supplies` a sheaf at 0.900 x 0.758 — and `humans` two figures side by side at 0.900 x
 * 0.633. Set to one display size the round ones print half again as much ink as the people do,
 * which is exactly what made the header strip's food, goods and gold look a size bigger than its
 * population. Each glyph is scaled by the geometric mean of its own measured extent against the
 * people's, so the four carry the same optical weight; `humans` is the reference and keeps 1.
 *
 * Measured off the alpha of the atlas at a 16/255 threshold, the same way the house sign's
 * `emblemFitScale` is. Only the four stores are listed: this is a set that gets printed in a row,
 * and a glyph nobody sees beside another one is better left at the size its frame gives it.
 */
const OPTICAL_FIT: Partial<Record<ConquestUiIconId, number>> = {
  food: 0.847,
  supplies: 0.914,
  gold: 0.839,
  humans: 1,
};

/**
 * The display size a glyph should be drawn at to sit level with the rest of its row.
 *
 * Callers keep laying out on the size they asked for — the slot, the gap and the number do not
 * move — and only the picture inside it shrinks, so a row of chips still lines up.
 */
export function opticalIconSize(id: ConquestUiIconId, size: number): number {
  return size * (OPTICAL_FIT[id] ?? 1);
}

/** Original pigments stay intact. Labels, rims and alpha communicate control state. */
export function addConquestUiIcon(
  scene: Phaser.Scene, id: ConquestUiIconId, size = 26,
): Phaser.GameObjects.Image {
  return addPrintedIcon(scene, CONQUEST_UI_TEXTURE, id, size);
}

export function addDynastySignIcon(
  scene: Phaser.Scene, id: DynastySignArtId, size = 64,
): Phaser.GameObjects.Image {
  return addPrintedIcon(scene, DYNASTY_SIGN_TEXTURE, id, size);
}

function addPrintedIcon(scene: Phaser.Scene, texture: string, id: string, size: number): Phaser.GameObjects.Image {
  const available = scene.textures.exists(texture) && scene.textures.get(texture).has(id);
  const image = scene.add.image(0, 0, available ? texture : '__WHITE', available ? id : undefined)
    .setDisplaySize(size, size).setName(`conquest-icon:${id}`)
    .setData('conquestUiIcon', { id, source: available ? 'generated' : 'unavailable' });
  // A failed download leaves a quiet gap beside the readable label, never a missing-texture box.
  // Visible is used instead of alpha because callers animate and dim their icons independently.
  if (!available) image.setVisible(false);
  return image;
}
