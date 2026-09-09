import Phaser from 'phaser';

/** Restrained functional prints, shared by every size and interactive state. */
export const CONQUEST_UI_TEXTURE = 'conquest-ui-icons:v3';
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
    `${base}art/conquest-ui-icons/icons-v3.png`, `${base}art/conquest-ui-icons/icons-v3.json`);
  if (!scene.textures.exists(DYNASTY_SIGN_TEXTURE)) scene.load.atlas(DYNASTY_SIGN_TEXTURE,
    `${base}art/conquest-ui-icons/signs-v1.png`, `${base}art/conquest-ui-icons/signs-v1.json`);
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
