import Phaser from 'phaser';
import type { CardIconId } from './CardIcons';

/** Complex story motifs are authored bitmap assets; utility marks stay small code symbols. */
export const STORY_CHOICE_ICON_IDS = [
  'person', 'crown', 'grain', 'purse', 'scales', 'wall', 'scroll',
  'hammer', 'shield', 'blade', 'banner', 'spark', 'herd', 'hut',
] as const satisfies readonly CardIconId[];
export type StoryChoiceIconId = typeof STORY_CHOICE_ICON_IDS[number];
const iconIds = new Set<CardIconId>(STORY_CHOICE_ICON_IDS);
const TEXTURE = 'story-choice-icons:v1';
export const STORY_CHOICE_ICON_SIZE = 36;

export function isStoryChoiceIcon(id: CardIconId): id is StoryChoiceIconId {
  return iconIds.has(id);
}

/** Shared by prompts and held Chronicle decisions; loaded with the playable map only. */
export function preloadStoryChoiceIcons(scene: Phaser.Scene, base: string): void {
  if (!scene.textures.exists(TEXTURE)) scene.load.atlas(TEXTURE,
    `${base}art/story-choice-icons/icons-v1.png`, `${base}art/story-choice-icons/icons-v1.json`);
}

export function addStoryChoiceIcon(scene: Phaser.Scene, id: StoryChoiceIconId): Phaser.GameObjects.Image | undefined {
  if (!scene.textures.exists(TEXTURE) || !scene.textures.get(TEXTURE).has(id)) return undefined;
  const icon = scene.add.image(0, 0, TEXTURE, id);
  icon.setScale(STORY_CHOICE_ICON_SIZE / Math.max(icon.width, icon.height));
  icon.setData('storyChoiceIcon', { id, source: 'generated' });
  return icon;
}
