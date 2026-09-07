import Phaser from 'phaser';
import { PIGMENT } from './ink/palette';
import { inkPath } from './ink/stroke';
import type { UIBounds } from './InkUI';
import cardPrintAssets from './storyPrintAssets.json';

/** Symbolic Đông Hồ scenes, not reconstructions of a named person or dynasty. */
export type StoryPrint = 'harvest' | 'muster' | 'petition' | keyof typeof cardPrintAssets;
const printFiles: Record<StoryPrint, string> = {
  harvest: 'harvest-v1.webp', muster: 'muster-v1.webp', petition: 'petition-v1.webp', ...cardPrintAssets,
};
export const STORY_PRINTS = Object.keys(printFiles) as readonly StoryPrint[];

export function preloadStoryPrints(scene: Phaser.Scene, base: string): void {
  for (const kind of STORY_PRINTS) if (!scene.textures.exists(`story-print:${kind}`)) scene.load.image(`story-print:${kind}`, `${base}art/story-prints/${printFiles[kind]}`);
}

export function powerStoryPrint(id: string): StoryPrint {
  if (Object.prototype.hasOwnProperty.call(cardPrintAssets, id)) return id as keyof typeof cardPrintAssets;
  return 'muster';
}

/** Selected moments only: don't show a future victory or a returned sword before it happens. */
export const STORY_BEAT_PRINTS: Readonly<Record<string, StoryPrint>> = {
  'ho-guom.the-turtle-at-the-lake': 'thuan-thien',
  'no-than.the-crossbow-that-fires-a-hundred': 'no-than',
  'van-don.the-grain-fleet-behind-them': 'van-don',
  'luy-thay.the-strategist-who-came-late': 'luy-thay',
  'van-mieu.the-sons-of-nobody': 'van-mieu',
  'thu-do.the-court-is-full-of-cousins': 'thu-do',
  'binh-trong.they-offer-him-a-title': 'binh-trong',
  'khuc-thua-du.nobody-is-coming-to-govern-us': 'khuc-thua-du',
  'the-dykes.the-river-is-higher-than-the-fields': 'de-dieu',
  'dai-cao.the-scholar-asks-for-paper': 'dai-cao',
  'dai-cao.the-proclamation-read-out': 'dai-cao',
  'chieu-doi-do.the-valley-is-too-narrow': 'surveyors-corps',
  'chieu-doi-do.the-dragon-rising': 'chieu-doi-do',
  'river-stakes.his-men-would-cut-the-timber': 'bach-dang-stakes',
  'hich-tuong-si.he-reads-it-to-the-officers': 'hich-van',
  'chi-lang.the-pass-is-narrow-here': 'chi-lang',
};

export function storyBeatPrint(templateId: string, fragmentId: string): StoryPrint | undefined {
  return STORY_BEAT_PRINTS[`${templateId}.${fragmentId}`];
}

/** Fit the complete print; never crop people's heads or paint across neighboring text. */
export function addStoryPrint(
  scene: Phaser.Scene, parent: Phaser.GameObjects.Container, kind: StoryPrint, bounds: UIBounds,
): Phaser.GameObjects.Image | undefined {
  const key = `story-print:${kind}`;
  if (!scene.textures.exists(key) || bounds.width <= 0 || bounds.height <= 0) return undefined;
  const picture = scene.add.image(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, key);
  const fit = Math.min(bounds.width / picture.width, bounds.height / picture.height);
  picture.setScale(fit).setData('storyPrint', kind);
  parent.add(picture);
  const frame = scene.add.graphics();
  const x = picture.x - picture.displayWidth / 2;
  const y = picture.y - picture.displayHeight / 2;
  inkPath(frame, [{x,y}, {x:x + picture.displayWidth,y},
    {x:x + picture.displayWidth,y:y + picture.displayHeight}, {x,y:y + picture.displayHeight}],
  722, {width:0.7, alpha:0.65, colour:PIGMENT.muc, wobble:0.2, closed:true, bleed:0.1});
  parent.add(frame);
  return picture;
}

/** An illustrated opening inside an existing scroll body, including short phone sheets. */
export function storyPrintHeader(
  scene: Phaser.Scene, parent: Phaser.GameObjects.Container, kind: StoryPrint, width: number,
): number {
  if (!scene.textures.exists(`story-print:${kind}`)) return 0;
  const height = 138;
  addStoryPrint(scene, parent, kind, {x:0, y:0, width, height});
  return height + 14;
}
