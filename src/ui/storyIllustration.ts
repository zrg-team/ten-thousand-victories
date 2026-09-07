import Phaser from 'phaser';
import { storyTemplate } from '../data/stories';
import type { StoryBand } from '../state/types';
import { addStoryPrint, storyBeatPrint } from './storyPrint';
import { drawStoryBand } from './ink/storyBand';

/** The same known moment on the choice, report and record. Never search future fragments. */
export function addStoryIllustration(
  scene: Phaser.Scene, parent: Phaser.GameObjects.Container,
  templateId: string, fragmentId: string | undefined, width: number, band?: StoryBand,
): number {
  if (!fragmentId) return 0;
  const setting = band ?? storyTemplate(templateId)?.fragments.find(f => f.id === fragmentId)?.band;
  const print = storyBeatPrint(templateId, fragmentId);
  const height = Math.min(146, width * 0.44);
  if (print && addStoryPrint(scene, parent, print, { x: 0, y: 0, width, height })) return height + 14;
  if (!setting) return 0;
  parent.add(drawStoryBand(scene, setting, `${templateId}:${fragmentId}`, width, height));
  return height + 14;
}
