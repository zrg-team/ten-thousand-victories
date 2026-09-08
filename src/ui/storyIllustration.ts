import Phaser from 'phaser';
import { storyTemplate } from '../data/stories';
import type { StoryBand } from '../state/types';
import { addStoryPrint, storyBeatPrint } from './storyPrint';
import { drawStoryBand } from './ink/storyBand';
import { STORY_FRAGMENT_SETTINGS, STORY_SETTINGS } from './storySettings';

export function storyIllustrationSetting(templateId: string, fragmentId?: string, band?: StoryBand): StoryBand | undefined {
  return band
    ?? storyTemplate(templateId)?.fragments.find(f => f.id === fragmentId)?.band
    ?? (fragmentId ? STORY_FRAGMENT_SETTINGS[`${templateId}.${fragmentId}`] : undefined)
    ?? STORY_SETTINGS[templateId];
}

/** The same known moment on the choice, report and record. Never search future fragments. */
export function addStoryIllustration(
  scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  templateId: string, fragmentId: string | undefined, width: number, band?: StoryBand,
): number {
  if (width <= 0) return 0;
  const setting = storyIllustrationSetting(templateId, fragmentId, band);
  const print = fragmentId ? storyBeatPrint(templateId, fragmentId) : undefined;
  // Preserve selected card moments. Missing exact art falls back to a generated setting first.
  const candidates = [print, setting ? `setting-${setting}` as const : undefined];
  for (const kind of candidates) {
    if (!kind || !scene.textures.exists(`story-print:${kind}`)) continue;
    const source = scene.textures.get(`story-print:${kind}`).getSourceImage();
    // Landscape setting prints fill the sheet. Existing 3:2 card prints remain fully visible.
    const height = Math.min(180, width * source.height / source.width);
    const image = addStoryPrint(scene, parent, kind, { x: 0, y: 0, width, height });
    if (!image) continue;
    image.setData('storyIllustration', { templateId, fragmentId, setting, print: kind, source: kind === print ? 'moment' : 'setting' });
    return height + 14;
  }
  if (!setting) return 0;
  // Download/decoding failure only: a readable local fallback keeps the choice usable offline.
  const height = Math.min(180, width * 9 / 16);
  const fallback = drawStoryBand(scene, setting, `${templateId}:${fragmentId ?? 'opening'}`, width, height);
  fallback.setData('storyIllustration', { templateId, fragmentId, setting, source: 'procedural-fallback' });
  parent.add(fallback);
  return height + 14;
}
