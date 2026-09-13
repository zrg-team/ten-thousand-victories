import type Phaser from 'phaser';
import type { GameState, Hero } from '../state/types';
import { heroLevel } from '../systems/heroes/heroModel';
import { heroSummary } from '../systems/heroes/HeroService';
import { t } from '../i18n';
import { UI_FONT } from './fonts';
import { renderHeroFaceInBox } from './FaceRenderer';
import { INK_UI, type UIBounds } from './InkUI';

const seenLevels = new WeakMap<object, Map<string, number>>();

export function heroProgressLine(state: GameState, hero: Hero): string {
  const view = heroSummary(state, hero);
  return view.next === null ? t('hero.depth.max', { n: view.level })
    : t('hero.depth.progress', { n: view.level, xp: view.inLevel, next: view.needed });
}
/** Portrait and level share one fixed card, independent of the neighbouring text height. */
export function heroPortraitCard(scene: Phaser.Scene, hero: Hero, box: UIBounds, showLevel = Boolean(hero.growth)): Phaser.GameObjects.Container {
  const { width, height } = box;
  const card = scene.add.container(box.x, box.y).setSize(width, height).setData('heroPortraitCard', hero.id);
  const frame = scene.add.graphics();
  frame.fillStyle(INK_UI.brush, .12); frame.fillRoundedRect(1, 2, width, height, 3);
  frame.fillStyle(INK_UI.parchment, 1); frame.fillRoundedRect(0, 0, width, height, 3);
  frame.lineStyle(1.3, INK_UI.softBrush, .9); frame.strokeRoundedRect(0, 0, width, height, 3);
  frame.lineStyle(.7, INK_UI.gold, .65); frame.strokeRoundedRect(3, 3, width - 6, height - 6, 1);
  card.add(frame);
  card.add(renderHeroFaceInBox(scene, hero, { x: 4, y: 4, width: width - 8, height: height - 8 }, 2));
  if (showLevel) {
    const badgeWidth = Math.min(38, width - 8), badgeHeight = width < 60 ? 19 : 22;
    card.add(heroLevelBadge(scene, hero, width - badgeWidth - 2, height - badgeHeight - 2, badgeWidth, badgeHeight));
  }
  return card;
}

/** A single baseline avoids the old LV/number overlap; the badge stays inside the card. */
function heroLevelBadge(scene: Phaser.Scene, hero: Hero, x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
  const level = heroLevel(hero);
  const badge = scene.add.container(x, y).setSize(width, height).setData('heroLevel', level);
  const g = scene.add.graphics();
  g.fillStyle(0x72572f, 1); g.fillRoundedRect(0, 0, width, height, 2);
  g.lineStyle(.8, 0xf5debb, 1); g.strokeRoundedRect(1.5, 1.5, width - 3, height - 3, 1);
  badge.add(g);
  const compact = width < 32;
  if (!compact) badge.add(scene.add.text(5, height / 2, t('hero.depth.seal'), {
    fontFamily: UI_FONT, fontSize: '7px', fontStyle: '700', color: '#f5debb',
  }).setOrigin(0, .5));
  badge.add(scene.add.text(compact ? width / 2 : width - 6, height / 2, String(level), {
    fontFamily: UI_FONT, fontSize: '13px', fontStyle: '700', color: '#fff8e8',
  }).setOrigin(compact ? .5 : 1, .5));
  if (hero.growth) {
    const seen = seenLevels.get(scene.game) ?? new Map<string, number>(); seenLevels.set(scene.game, seen);
    const previous = seen.get(hero.growth.instanceId); seen.set(hero.growth.instanceId, level);
    if (previous !== undefined && level > previous && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      badge.setAlpha(.55);
      const tween = scene.tweens.add({ targets: badge, alpha: 1, duration: 240, ease: 'Cubic.Out' });
      badge.once('destroy', () => tween.stop());
    }
  }
  return badge;
}
export function heroXpTrack(scene: Phaser.Scene, state: GameState, hero: Hero, x: number, y: number, width: number): Phaser.GameObjects.Graphics {
  const view = heroSummary(state, hero);
  const share = view.next === null ? 1 : Math.max(0, Math.min(1, view.inLevel / view.needed));
  const g = scene.add.graphics().setData('heroXp', { id: hero.id, xp: view.xp, next: view.next, share });
  g.fillStyle(INK_UI.brush, .12); g.fillRoundedRect(x, y, width, 7, 2);
  if (share > 0) { g.fillStyle(INK_UI.jade, 1); g.fillRoundedRect(x, y, width * share, 7, 2); }
  g.lineStyle(.6, INK_UI.softBrush, .55); g.strokeRoundedRect(x, y, width, 7, 2);
  return g;
}
