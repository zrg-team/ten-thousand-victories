import Phaser from 'phaser';
import type { CardIconId } from './CardIcons';
import { addConquestUiIcon, CONQUEST_UI_TEXTURE, preloadConquestUiIcons } from './conquestUiIcons';

/** Story choices share their generated motifs with the rest of the interface. */
export const STORY_CHOICE_ICON_IDS = [
  'person', 'crown', 'grain', 'purse', 'scales', 'wall', 'scroll',
  'hammer', 'shield', 'blade', 'banner', 'spark', 'herd', 'hut',
] as const satisfies readonly CardIconId[];
export type StoryChoiceIconId = typeof STORY_CHOICE_ICON_IDS[number];
const iconIds = new Set<CardIconId>(STORY_CHOICE_ICON_IDS);
export const STORY_CHOICE_ICON_SIZE = 36;

export function isStoryChoiceIcon(id: CardIconId): id is StoryChoiceIconId {
  return iconIds.has(id);
}

/** Idempotent scene-boundary retry, shared with all Conquest interface icons. */
export function preloadStoryChoiceIcons(scene: Phaser.Scene, base: string): void {
  preloadConquestUiIcons(scene, base);
}

export function addStoryChoiceIcon(scene: Phaser.Scene, id: StoryChoiceIconId): Phaser.GameObjects.Image | undefined {
  if (!scene.textures.exists(CONQUEST_UI_TEXTURE) || !scene.textures.get(CONQUEST_UI_TEXTURE).has(id)) return undefined;
  const icon = addConquestUiIcon(scene, id, STORY_CHOICE_ICON_SIZE);
  icon.setData('storyChoiceIcon', { id, source: 'generated' });
  return icon;
}
