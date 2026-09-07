import Phaser from 'phaser';
import type { Hero } from '../../state/types';
import { heroBio, heroName, heroTypeLabel, rarityLabel, t } from '../../i18n';
import { tierForHero } from '../../systems/ascent/SummonSystem';
import { renderHeroFaceInBox } from '../FaceRenderer';
import { TITLE_FONT, UI_FONT } from '../fonts';
import { PIGMENT } from '../ink/palette';
import { inkPath, printedShape } from '../ink/stroke';
import { seal } from '../ink/devices';

const hex = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;
const TIER_INK = { bronze: PIGMENT.nau, silver: PIGMENT.cham, gold: 0x8a5f1c, jade: 0x3f6657 };

/** A printed character card shared by founding, summons and court offers. */
export function heroChoiceCard(scene: Phaser.Scene, hero: Hero, width: number, height: number,
  opts: { badge?: string; note?: string }): Phaser.GameObjects.Container {
  const card = scene.add.container(0, 0).setData('heroChoiceCard', hero.id);
  const accent = TIER_INK[tierForHero(hero)];
  const pad = 16, textWidth = width - pad * 2;
  const compact = height < 300;
  const landscapePortrait = height < 250;
  const g = scene.add.graphics();
  card.add(g);
  printedShape(g, [{ x: 0, y: 3 }, { x: 3, y: 0 }, { x: width - 3, y: 0 },
    { x: width, y: 3 }, { x: width, y: height - 3 }, { x: width - 3, y: height },
    { x: 3, y: height }, { x: 0, y: height - 3 }], PIGMENT.diepHi, 83,
  { colour: PIGMENT.muc, width: 1.3, alpha: .85, fillAlpha: 1, wobble: .3, step: 14 });
  // Registration marks are quiet, static ink; rank is carried by the tab, not a full-card tint.
  for (const x of [6, width - 6]) for (const y of [6, height - 6]) {
    const sx = x < width / 2 ? 1 : -1, sy = y < height / 2 ? 1 : -1;
    inkPath(g, [{ x, y: y + sy * 13 }, { x, y }, { x: x + sx * 13, y }], x + y,
      { colour: accent, width: 1, alpha: .7, wobble: .15 });
  }

  const text = (value: string, x: number, y: number, size: number, options: Phaser.Types.GameObjects.Text.TextStyle = {}) => {
    const label = scene.add.text(x, y, value, {
      fontFamily: UI_FONT, fontSize: `${size}px`, color: hex(PIGMENT.mucSoft), ...options,
    });
    card.add(label);
    return label;
  };
  const rarity = text(rarityLabel(hero.rarity), pad + 9, 12, 9, { color: hex(PIGMENT.diepHi), fontStyle: '700' });
  g.fillStyle(accent, 1);
  g.fillRect(pad, 9, rarity.width + 18, rarity.height + 6);
  const role = text(heroTypeLabel(hero.type), width - pad, 12, 9, { color: hex(accent) }).setOrigin(1, 0);
  const roleRoom = Math.max(1, textWidth - rarity.width - 30);
  if (role.width > roleRoom) role.setScale(roleRoom / role.width);

  // Reserve the measured name and bonus before allocating portrait/bio space.
  const name = text(heroName(hero), width / 2, 0, compact ? 18 : 21, {
    fontFamily: TITLE_FONT, fontStyle: '700', color: hex(PIGMENT.muc),
    align: 'center', wordWrap: { width: landscapePortrait ? textWidth - 76 : textWidth },
  }).setOrigin(.5, 0).setData('heroCardPart', 'name');
  let noteTop = height - pad;
  if (opts.note) {
    const note = text(opts.note, pad + 35, 0, compact ? 10 : 10.5, {
      color: hex(0x79521d), fontStyle: '700', wordWrap: { width: textWidth - 46 }, lineSpacing: 1,
    }).setData('heroCardPart', 'bonus');
    const noteHeight = Math.max(32, note.height + 16);
    noteTop = height - 12 - noteHeight;
    g.fillStyle(PIGMENT.hoe, .13);
    g.fillRect(pad - 3, noteTop, textWidth + 6, noteHeight);
    inkPath(g, [{ x: pad - 3, y: noteTop }, { x: width - pad + 3, y: noteTop }], 91,
      { colour: PIGMENT.hoe, width: .9, alpha: .7, wobble: .2 });
    seal(g, pad + 14, noteTop + noteHeight / 2, 20, 'lotus');
    note.y = noteTop + (noteHeight - note.height) / 2;
  }

  let headerBottom = 33;
  if (opts.badge) {
    const badge = text(opts.badge, width / 2, 31, 9, {
      color: hex(accent), fontStyle: '700', align: 'center', wordWrap: { width: textWidth },
    }).setOrigin(.5, 0);
    headerBottom = badge.y + badge.height + 5;
  }
  const statHeight = compact ? 36 : 42;
  const bioReserve = compact ? 28 : 47;
  const faceHeight = landscapePortrait
    ? Math.max(36, Math.min(70, noteTop - headerBottom - statHeight - 25))
    : Math.max(48, Math.min(compact ? 88 : 140,
      noteTop - headerBottom - name.height - statHeight - bioReserve - 31));
  const faceWidth = faceHeight * .85;
  const faceY = headerBottom + 3;
  const faceX = landscapePortrait ? pad + 28 : width / 2;
  // A flat pigment sun and two restrained cloud curls echo the game's print illustrations.
  g.fillStyle(PIGMENT.hoePale, .25);
  g.fillCircle(faceX, faceY + faceHeight * .46, faceHeight * .46);
  for (const side of landscapePortrait ? [] : [-1, 1]) {
    const cx = width / 2 + side * (faceWidth / 2 + 25), cy = faceY + faceHeight * .48;
    const curl = [{ x: -17, y: 5 }, { x: -8, y: 5 }, { x: -3, y: 0 }, { x: -5, y: -5 },
      { x: -1, y: -9 }, { x: 5, y: -8 }, { x: 8, y: -3 }, { x: 15, y: -3 }, { x: 20, y: 1 },
      { x: 12, y: 4 }, { x: 7, y: 8 }, { x: 0, y: 9 }, { x: -7, y: 8 }];
    printedShape(g, curl.map(p => ({ x: cx + p.x * side, y: cy + p.y })), PIGMENT.hoePale, 70 + side,
      { colour: accent, alpha: .45, width: .7, fillAlpha: .25, wobble: .15, step: 5 });
    inkPath(g, [{ x: cx - side * 11, y: cy + 18 }, { x: cx + side * 14, y: cy + 18 }], 81 + side,
      { colour: accent, alpha: .25, width: .7, wobble: .1 });
  }
  card.add(renderHeroFaceInBox(scene, hero,
    { x: faceX - faceWidth / 2, y: faceY, width: faceWidth, height: faceHeight }, 2));
  if (landscapePortrait) {
    name.x = pad + 76 + (textWidth - 76) / 2;
    name.y = faceY + Math.max(0, (faceHeight - name.height) / 2);
  } else name.y = faceY + faceHeight + 5;

  const statY = Math.max(name.y + name.height, faceY + faceHeight) + 7;
  g.fillStyle(PIGMENT.diepLo, .25);
  g.fillRect(pad, statY, textWidth, statHeight);
  const stats = [
    { label: t('heroes.card.martial'), value: hero.stats.martial },
    { label: t('heroes.card.logistics'), value: hero.stats.logistics },
    { label: t('heroes.card.administration'), value: hero.stats.administration },
  ];
  const best = Math.max(...stats.map(s => s.value));
  stats.forEach((stat, i) => {
    const x = pad + textWidth * (i + .5) / 3;
    if (i) {
      g.lineStyle(.7, PIGMENT.mucFaint, .3);
      g.lineBetween(pad + textWidth * i / 3, statY + 7, pad + textWidth * i / 3, statY + statHeight - 7);
    }
    text(String(stat.value), x, statY + 3, compact ? 15 : 18, {
      fontFamily: TITLE_FONT, fontStyle: '700', color: hex(stat.value === best ? accent : PIGMENT.muc),
    }).setOrigin(.5, 0).setData('heroCardStat', stat.value);
    text(stat.label, x, statY + statHeight - 13, 8, { color: hex(PIGMENT.mucSoft) }).setOrigin(.5, 0);
  });

  const bioY = statY + statHeight + 9;
  const bioRoom = noteTop - 8 - bioY;
  if (bioRoom >= 12) {
    const bio = text(heroBio(hero), pad + 2, bioY, compact ? 9.5 : 10.5, {
      wordWrap: { width: textWidth - 4 }, lineSpacing: 2,
    }).setData('heroCardPart', 'bio');
    // Measure the actual rendered text so long localized names and bonuses never overlap it.
    if (bio.height > bioRoom) {
      const words = heroBio(hero).split(/\s+/u);
      const excerpt = (count: number) => `${words.slice(0, count).join(' ').replace(/[\s,;:.—–-]+$/u, '')}…`;
      let low = 0, high = words.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        bio.setText(excerpt(mid));
        if (bio.height <= bioRoom) low = mid; else high = mid - 1;
      }
      bio.setText(excerpt(low));
    }
    bio.y += Math.max(0, (bioRoom - bio.height) / 2);
  }
  return card;
}
