/**
 * Relief reaching the field, made into a moment.
 *
 * A host the player sent — or an ally's column, or the enemy's second wave — used to arrive as
 * one ten-point line in the header and a marker that was simply *there* on the next rebuild,
 * drawn exactly like a column that had stood in the line all along. The payoff for leaving a
 * fight to fetch help, and the worst thing that can happen to a winning line, both landed with
 * the weight of a granary finishing. Reported verbatim: *when reinforcement come to battle it
 * should be shown in message bubble and highlighted — that's an epic moment.*
 *
 * Five things, each answering a different sense of "it happened":
 *
 *   the shout   — the bubble over the men says it, and pops the way an order does (`callOut`)
 *   the column  — marches IN from its own edge of the paper, feet going, rather than appearing
 *   the ribbon  — a proclamation across the sky over the field, stamped for ours, that takes
 *                 itself down; a flash of the side's colour under it
 *   the hold    — the beat clock stops for a breath, longer than for a clash
 *   the count   — the men it brings, rising off the line
 *
 * Noticed on the screen rather than in the simulation: `updateBattle` compares who stands on the
 * field before and after a rebuild (`hostsJoined`), so the moment fires exactly when the column
 * is drawn, and never for a fight opened onto relief that arrived while the screen was closed.
 */
import Phaser from 'phaser';
import { BATTLE_TICK_MS } from '../../../game/ascentConfig';
import { INK_UI } from '../../../ui/InkUI';
import { sawtoothBand, seal } from '../../../ui/ink/devices';
import { setConquestArmyStepping } from '../../../ui/ink/figureStamps';
import { TITLE_FONT, UI_FONT } from '../../../ui/fonts';
import { formatNumber } from '../../../utils/format';
import { soundDirector } from '../../../ui/sound/SoundDirector';
import { t } from '../../../i18n';
import { hostHeadcount } from '../../../systems/ascent/battleMembership';
import type { Army, AscentBattle } from '../../../state/types';
import { battleFieldBox, cssHex, type BattleMarker } from '../constants';
import { killTweensDeep } from '../layers';
import { battleLines } from './geometry';
import type { ConquestUIScene } from '../../ConquestUIScene';

export type ReliefSide = 'ours' | 'theirs';

/** How long the shout stands in the bubble before the caption returns. */
const CALL_MS = 2600;
/** The beat clock's hold. Longer than a clash's 110: this is the one moment in a fight worth a breath. */
const RELIEF_HOLD_MS = 380;
const ENEMY_RELIEF_HOLD_MS = 240;
const RIBBON_IN_MS = 360;
const RIBBON_HOLD_MS = 1500;
const RIBBON_OUT_MS = 340;
/** The column's walk onto the field: most of a beat, so the men are seen arriving, not sliding. */
const MARCH_MS = Math.round(BATTLE_TICK_MS * 0.9);
/** How far off the paper the column starts. Past the field's edge by a block, so it enters rather than appears. */
const MARCH_FROM = 70;

/**
 * Which hosts stand in `next` and did not in `prev`, per side.
 *
 * Signatures are `battleFieldSignature`'s: our ids and theirs, comma-joined, split on a bar.
 * Parsed rather than recomputed from state because the previous field is exactly what the
 * signature remembers and the state has already moved on.
 */
export function hostsJoined(prev: string, next: string): { ours: string[]; theirs: string[] } {
  const split = (signature: string): string[][] => {
    const [ours = '', theirs = ''] = signature.split('|');
    return [ours.split(',').filter(Boolean), theirs.split(',').filter(Boolean)];
  };
  const [prevOurs, prevTheirs] = split(prev);
  const [nextOurs, nextTheirs] = split(next);
  return {
    ours: nextOurs.filter((id) => !prevOurs.includes(id)),
    theirs: nextTheirs.filter((id) => !prevTheirs.includes(id)),
  };
}

/** Plays the moment for every host that has just joined either side. Called after the field rebuild that drew them. */
export function announceRelief(self: ConquestUIScene, battle: AscentBattle, joined: { ours: string[]; theirs: string[] }): void {
  const ui = self.battleUi;
  if (!ui || battle.over) return;
  const armies = (ids: string[]): Army[] => ids
    .map((id) => self.state.armies.find((army) => army.id === id))
    .filter((army): army is Army => Boolean(army));
  const ours = armies(joined.ours);
  const theirs = armies(joined.theirs);
  if (ours.length > 0) reliefMoment(self, battle, 'ours', ours);
  if (theirs.length > 0) reliefMoment(self, battle, 'theirs', theirs);
}

function reliefMoment(self: ConquestUIScene, battle: AscentBattle, side: ReliefSide, hosts: Army[]): void {
  const ui = self.battleUi;
  if (!ui) return;
  const men = hosts.reduce((sum, host) => sum + hostHeadcount(host), 0);
  const name = hosts.length === 1 ? hosts[0].name : t('ascent.battle.reliefHosts', { n: hosts.length });

  callOut(self, battle, side, side === 'ours'
    ? t('ascent.battle.reliefCall', { name })
    : t('ascent.battle.enemyReliefCall'));

  const markers = side === 'ours' ? ui.ourMarkers : ui.theirMarkers;
  for (const host of hosts) {
    const entry = markers.find((marker) => marker.hostId === host.id);
    if (entry) marchIn(self, entry, side);
  }

  proclaim(self, side, name, men);
  countOverLine(self, battle, side, men);

  // The field takes the weight: the clock holds and the ground jolts toward the newcomers, the
  // same shake a break gives it — this is the other event of that size.
  self.holdBattleClock(side === 'ours' ? RELIEF_HOLD_MS : ENEMY_RELIEF_HOLD_MS);
  self.tweens.add({
    targets: [ui.field, ui.floaters],
    x: { from: side === 'ours' ? -4 : 4, to: 0 },
    duration: 260,
    ease: 'Elastic.easeOut',
  });
  soundDirector.relief(side === 'theirs');
}

/**
 * Puts a sentence in one side's bubble in place of its caption, for a while.
 *
 * The bubbles read what each host is standing in; a shout is the one thing said *over* that, and
 * it is spoken now — `updateBattleBubbles` is run straight away so the pop happens on this frame
 * rather than on the next beat. The caption returns when the call is due, without a pop.
 */
export function callOut(self: ConquestUIScene, battle: AscentBattle, side: ReliefSide, text: string): void {
  const ui = self.battleUi;
  if (!ui) return;
  ui.bubbleCall = { side, text, until: self.time.now + CALL_MS };
  self.updateBattleBubbles(battle);
}

/**
 * The column walks onto the field from its own edge of the paper.
 *
 * `buildBattleField` has already stood it in the line; this takes it back off the paper and
 * walks it in with its feet going, over most of a beat. `entry.arriving` keeps `slideMarkers`
 * and the shape redraw off it meanwhile — both would kill this tween and stand the block on
 * the line mid-stride — and is cleared when the walk lands. Three ink strokes trail it, the
 * same device the shout's speed lines use, so the road it came by is on the picture for a moment.
 */
function marchIn(self: ConquestUIScene, entry: BattleMarker, side: ReliefSide): void {
  const ui = self.battleUi;
  if (!ui) return;
  const marker = entry.marker;
  if (!marker.active) return;
  const box = battleFieldBox(ui.content, ui.fieldHeight);
  const home = marker.x;
  const from = side === 'ours' ? box.x - MARCH_FROM : box.x + box.width + MARCH_FROM;
  entry.arriving = true;
  self.tweens.killTweensOf(marker);
  marker.setPosition(from, marker.y).setAlpha(0.25);
  setConquestArmyStepping(marker, true);
  self.tweens.add({
    targets: marker,
    x: home,
    alpha: 1,
    duration: MARCH_MS,
    ease: 'Quad.easeOut',
    onComplete: () => {
      entry.arriving = false;
      if (marker.active) setConquestArmyStepping(marker, false);
    },
  });

  const dust = self.add.graphics();
  const colour = side === 'ours' ? INK_UI.brush : INK_UI.cinnabar;
  dust.lineStyle(1.5, colour, 0.7);
  const back = side === 'ours' ? -1 : 1;
  for (let i = 0; i < 3; i += 1) {
    const y = marker.y - 4 + i * 5;
    dust.lineBetween(back * (18 + i * 6), y, back * (46 + i * 10), y + (i - 1) * 1.5);
  }
  dust.setPosition(from, 0);
  ui.fanfare.add(dust);
  self.tweens.add({
    targets: dust,
    x: home - back * 24,
    alpha: { from: 0.8, to: 0 },
    duration: MARCH_MS,
    ease: 'Quad.easeOut',
    onComplete: () => { if (dust.active) dust.destroy(); },
  });
}

/**
 * The proclamation: a ribbon across the sky over the field, in the side's colours.
 *
 * Ours is a cinnabar band ruled in gold with the drum's sawtooth inside it, the title in gold and
 * the seal stamped down at its head — the same chop the wave banner and the arrival fanfare use,
 * because this is the same register: the court announcing something. Theirs is the same band in
 * ink with the title in sỏi son and no seal; a proclamation from the wrong court. Both slide in
 * from the side the column came from, hold long enough to be read, and go out the far side.
 *
 * Drawn under the dials and over everything on the field, and placed at a fifth of the field's
 * height: the sky over the ridges, clear of the bubbles (which hang 78 over the line) on every
 * screen height the game supports.
 */
function proclaim(self: ConquestUIScene, side: ReliefSide, name: string, men: number): void {
  const ui = self.battleUi;
  if (!ui) return;
  const ours = side === 'ours';
  const box = battleFieldBox(ui.content, ui.fieldHeight);
  const root = self.add.container(0, 0);
  ui.fanfare.add(root);

  // A wash over the whole field first, in the side's colour, gone in half a second. The one
  // moment the field is allowed a flash — a rally is a thing seen from the whole line at once.
  const flash = self.add.graphics();
  flash.fillStyle(ours ? INK_UI.gold : INK_UI.cinnabar, 1);
  flash.fillRect(box.x, box.y, box.width, box.height);
  root.add(flash);
  self.tweens.add({ targets: flash, alpha: { from: ours ? 0.3 : 0.22, to: 0 }, duration: 520, ease: 'Quad.easeOut' });

  const h = 46;
  const y = box.y + Math.round(ui.fieldHeight * 0.2) - h / 2;
  const ribbon = self.add.container(ours ? -box.width : box.width, 0);
  root.add(ribbon);

  const band = self.add.graphics();
  band.fillStyle(ours ? INK_UI.cinnabar : INK_UI.brush, 0.94);
  band.fillRect(box.x, y, box.width, h);
  const rule = ours ? INK_UI.gold : INK_UI.cinnabar;
  band.lineStyle(2, rule, 0.95);
  band.lineBetween(box.x, y + 1.5, box.x + box.width, y + 1.5);
  band.lineBetween(box.x, y + h - 1.5, box.x + box.width, y + h - 1.5);
  // The drum's sawtooth along the rules — bronze relief on lacquer for ours, cinnabar on ink for theirs.
  sawtoothBand(band, box.x + 4, y + 4, box.width - 8, 4, ours ? 0.55 : 0.7, rule);
  sawtoothBand(band, box.x + 4, y + h - 8, box.width - 8, 4, ours ? 0.55 : 0.7, rule);
  ribbon.add(band);

  // The seal at the head of ours: stamped down, the rays swept once and gone.
  const sealX = box.x + 34;
  const sealY = y + h / 2;
  const textLeft = ours ? sealX + 26 : box.x + 12;
  const textWidth = box.x + box.width - 12 - textLeft;
  const centreX = textLeft + textWidth / 2;
  if (ours) {
    const rays = self.add.graphics();
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2 + 0.2;
      rays.lineStyle(1.8, INK_UI.gold, 0.55);
      rays.lineBetween(Math.cos(angle) * 16, Math.sin(angle) * 16, Math.cos(angle) * 40, Math.sin(angle) * 40);
    }
    rays.setPosition(sealX, sealY).setAlpha(0).setScale(0.5);
    ribbon.add(rays);
    const chop = self.add.graphics();
    seal(chop, 0, 0, 30, 'star');
    chop.setPosition(sealX, sealY).setScale(2.2).setAlpha(0);
    ribbon.add(chop);
    self.tweens.chain({
      tweens: [
        { targets: chop, scale: 1, alpha: 1, duration: 220, delay: RIBBON_IN_MS - 80, ease: 'Back.easeIn' },
        { targets: rays, alpha: { from: 0.9, to: 0 }, scale: 1.4, duration: 420, ease: 'Cubic.easeOut', offset: '-=30' },
      ],
    });
  }

  const title = self.add.text(centreX, y + h / 2 - 1, ours ? t('ascent.battle.reliefTitle') : t('ascent.battle.enemyReliefTitle'), {
    fontFamily: TITLE_FONT, fontSize: '19px', fontStyle: '700', align: 'center',
    color: cssHex(ours ? INK_UI.goldLight : INK_UI.cinnabar),
  }).setOrigin(0.5, 1);
  // One line, squeezed rather than wrapped, the way the wave banner keeps its heading a heading.
  if (title.width > textWidth) title.setScale(textWidth / title.width, 1);
  ribbon.add(title);
  const sub = self.add.text(centreX, y + h / 2 + 2, t('ascent.battle.reliefSub', { name, men: formatNumber(men) }), {
    fontFamily: UI_FONT, fontSize: '10.5px', align: 'center', color: cssHex(INK_UI.parchment),
  }).setOrigin(0.5, 0);
  if (sub.width > textWidth) sub.setScale(textWidth / sub.width, 1);
  ribbon.add(sub);

  const finish = (): void => {
    if (!root.active) return;
    killTweensDeep(self, root);
    root.destroy(true);
  };
  self.tweens.chain({
    tweens: [
      { targets: ribbon, x: 0, duration: RIBBON_IN_MS, ease: 'Back.easeOut' },
      { targets: ribbon, x: ours ? 60 : -60, alpha: 0, duration: RIBBON_OUT_MS, delay: RIBBON_HOLD_MS, ease: 'Quad.easeIn' },
    ],
    onComplete: finish,
  });
}

/** The men the column brings, rising off the line it joined — gold for ours, sỏi son for theirs. */
function countOverLine(self: ConquestUIScene, battle: AscentBattle, side: ReliefSide, men: number): void {
  const ui = self.battleUi;
  if (!ui || men <= 0) return;
  const { groundY } = ui.geometry;
  const lines = battleLines(self, battle.ourAdvance, battle.theirAdvance);
  const x = side === 'ours' ? lines.ourX : lines.theirX;
  const label = self.ui.label(x, groundY - 54, `+${formatNumber(men)}`, 'label', {
    fontSize: '16px', fontStyle: '700', align: 'center',
    color: cssHex(side === 'ours' ? INK_UI.gold : INK_UI.cinnabar),
    stroke: cssHex(INK_UI.brush), strokeThickness: 2.5,
  }).setOrigin(0.5).setScale(0.6);
  ui.floaters.add(label);
  self.tweens.add({ targets: label, scale: 1, duration: 240, ease: 'Back.easeOut' });
  self.tweens.add({
    targets: label,
    y: groundY - 98,
    alpha: { from: 1, to: 0 },
    duration: 1500,
    delay: 200,
    ease: 'Sine.easeOut',
    onComplete: () => { if (label.active) label.destroy(); },
  });
}

/** Test seam: the timings the harness waits on. */
export const RELIEF_TIMINGS = Object.freeze({
  CALL_MS, RIBBON_MS: RIBBON_IN_MS + RIBBON_HOLD_MS + RIBBON_OUT_MS, MARCH_MS,
});

// Phaser is imported for the container/graphics types used above; keep the import live for tsc.
export type ReliefRoot = Phaser.GameObjects.Container;
