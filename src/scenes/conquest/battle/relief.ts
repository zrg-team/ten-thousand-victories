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
import { inkPath, washFill, type Pt } from '../../../ui/ink/stroke';
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
  const back = side === 'ours' ? -1 : 1;
  // Five strokes at 2.4, not three at 1.5: at a phone's scale the old trail was three hairlines
  // behind a moving block of men and could not be seen at all.
  for (let i = 0; i < 5; i += 1) {
    const y = marker.y - 8 + i * 5;
    dust.lineStyle(2.4 - (i % 2) * 0.7, colour, 0.72 - i * 0.08);
    dust.lineBetween(back * (16 + i * 5), y, back * (52 + i * 12), y + (i - 2) * 1.5);
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
 * The proclamation: an edict unfurled over the field, in the side's colours.
 *
 * ## What this replaced, and why
 *
 * It was a full-bleed rectangle with two straight gold rules, slid across the sky from one edge to
 * the other. Reported: *when reinforcement army came it show slash in UI but look really bad*, and
 * that is the right word for it — a hard-edged bar the width of the screen, travelling sideways
 * across empty paper, is a slash. Three separate faults behind it:
 *
 * - **It was a vector bar in a printed game.** Square corners, flat fill, ruled edges. Every other
 *   coloured block in this game is pulled with `washFill` under an `inkPath` contour, which is the
 *   difference between a printed block and clip-art (see `ink/stroke.ts`).
 * - **Nothing gave it a place.** Full-bleed means it belongs to the frame, not to the picture. It
 *   sat on the blank sky above the ridges with its ends running off both edges.
 * - **It arrived by travelling.** A banner that slides past is scenery going by. A proclamation
 *   *lands*.
 *
 * So it is a swallow-tailed banner now — the shape a proclamation actually has — inset from
 * the paper's edges with its own shadow under it, printed rather than filled, and it **unfurls**
 * from its centre and is stamped: the chop punches down, the rays sweep out once, and the field
 * takes a jolt. Ours is cinnabar ruled in gold with the drum's sawtooth inside it; theirs is the
 * same banner in ink with the title in sỏi son and no chop, a proclamation from the wrong court.
 *
 * Placed at a fifth of the field's height so it overlaps the ridges rather than floating over bare
 * sky, and still clear of the bubbles, which hang 78 over the line on every screen height.
 */
function proclaim(self: ConquestUIScene, side: ReliefSide, name: string, men: number): void {
  const ui = self.battleUi;
  if (!ui) return;
  const ours = side === 'ours';
  const box = battleFieldBox(ui.content, ui.fieldHeight);
  const root = self.add.container(0, 0);
  ui.fanfare.add(root);

  /**
   * The light of it, thrown from the side the column came from.
   *
   * A flat wash over the whole field was the first try and it is invisible: an even 0.3 of gold
   * over parchment changes nothing the eye can catch, because there is no edge in it. Six stepped
   * bands falling away from the arriving edge do have one — the field is *lit from where the
   * help is coming from*, which is the fact the moment is about.
   */
  const flash = self.add.graphics();
  const glow = ours ? INK_UI.gold : INK_UI.cinnabar;
  const bands = 6;
  for (let step = 0; step < bands; step += 1) {
    const w = box.width / bands;
    flash.fillStyle(glow, (ours ? 0.34 : 0.26) * (1 - step / bands));
    flash.fillRect(box.x + (ours ? step * w : box.width - (step + 1) * w), box.y, w + 1, box.height);
  }
  root.add(flash);
  self.tweens.add({ targets: flash, alpha: { from: 1, to: 0 }, duration: 560, ease: 'Quad.easeOut' });

  /**
   * Long strokes flying across the field the way the column came, the same speed-line device the
   * shout uses. Two things at once: the eye is pulled toward the arriving side, and the picture
   * moves — which is most of what "epic" means on a screen where the men themselves are stamps.
   */
  const streaks = self.add.graphics();
  streaks.setPosition(ours ? -60 : 60, 0);
  for (let index = 0; index < 5; index += 1) {
    const y = box.y + box.height * (0.24 + index * 0.11);
    streaks.lineStyle(2 + (index % 2), glow, 0.5);
    streaks.lineBetween(box.x + 10, y, box.x + box.width - 10, y + (index - 2) * 2);
  }
  root.add(streaks);
  self.tweens.add({
    targets: streaks,
    x: ours ? 60 : -60,
    alpha: { from: 0.75, to: 0 },
    duration: 520,
    ease: 'Quad.easeOut',
  });

  // The banner itself: inset from the paper, capped so a desktop stage does not stretch it into a
  // bar again, and drawn around its own centre so it can unfurl from there.
  /**
   * 56, and the two rows of type inside it are 17 and 10.
   *
   * At 48 with a 19-point heading the enemy banner printed its title straight through the top
   * sawtooth: a text object's box is its leading, not its cap height, so a 19-point line occupies
   * about 25 and the free band between the two registers was 28. The band grew, the heading gave
   * up two points, and the pair is now centred in the room with three units either side.
   */
  const h = 56;
  const w = Math.min(box.width - 36, 348);
  const cx = box.x + box.width / 2;
  // 0.235, not 0.2: the ridges begin at a quarter of the field, and at a fifth the banner cleared
  // them entirely and hung on blank sky with nothing to belong to. Lowered until its foot crosses
  // the ridge line — a proclamation nailed up over the country, not floating above it. Still 31
  // clear of the bubbles, which hang 78 over the line and run two or three lines tall.
  const cy = box.y + Math.round(ui.fieldHeight * 0.235);
  const half = w / 2;
  const rule = ours ? INK_UI.gold : INK_UI.cinnabar;
  const ribbon = self.add.container(cx, cy);
  root.add(ribbon);

  /**
   * The swallow tail: a V cut into each end.
   *
   * It is the whole reason the shape reads as a banner rather than as a bar, and it costs four
   * points on a polygon that was a rectangle.
   */
  const tail = 16;
  const shape: Pt[] = [
    { x: -half, y: -h / 2 }, { x: half, y: -h / 2 },
    { x: half - tail, y: 0 }, { x: half, y: h / 2 },
    { x: -half, y: h / 2 }, { x: -half + tail, y: 0 },
  ];

  // The paper's own shadow, so the banner is *on* the picture rather than composited over it.
  const shade = self.add.graphics();
  shade.fillStyle(INK_UI.brush, 0.16);
  shade.fillPoints(shape.map((point) => ({ x: point.x + 3, y: point.y + 5 })), true);
  ribbon.add(shade);

  const band = self.add.graphics();
  // Printed, not filled: the colour block is pulled first and registered by hand, then the
  // contour is drawn over it. Registration 1.4 — enough to read as printing, not as a misprint.
  washFill(band, shape, ours ? INK_UI.cinnabar : INK_UI.brush, 41, 0.95, 1.4);
  inkPath(band, shape, 57, { colour: INK_UI.brush, width: 1.3, alpha: 0.8, wobble: 0.5, step: 11, closed: true });
  band.lineStyle(1.6, rule, 0.9);
  band.strokePoints([{ x: -half + 7, y: -h / 2 + 4 }, { x: half - 7, y: -h / 2 + 4 }], false, false);
  band.strokePoints([{ x: -half + 7, y: h / 2 - 4 }, { x: half - 7, y: h / 2 - 4 }], false, false);
  // The drum's sawtooth inside the rules — bronze on lacquer for ours, cinnabar on ink for theirs.
  sawtoothBand(band, -half + 8, -h / 2 + 5.5, w - 16, 3.5, ours ? 0.55 : 0.7, rule);
  sawtoothBand(band, -half + 8, h / 2 - 9, w - 16, 3.5, ours ? 0.55 : 0.7, rule);
  ribbon.add(band);

  // The seal at the head of ours: stamped down, the rays swept once and gone.
  // Clear of the swallow tail, whose notch reaches 16 units in at the banner's waist: at 30 the
  // chop's paper slip poked out through the cut.
  const sealX = -half + 36;
  const textLeft = ours ? sealX + 26 : -half + 14;
  const textWidth = half - 14 - textLeft;
  const centreX = textLeft + textWidth / 2;
  if (ours) {
    // The chop is stamped on paper, so it is given paper: a cinnabar chop laid straight on a
    // cinnabar banner is a white motif floating on red, which is not what a seal looks like.
    const slip = self.add.graphics();
    slip.fillStyle(INK_UI.parchment, 0.96);
    slip.fillRoundedRect(sealX - 18, -18, 36, 36, 3);
    slip.lineStyle(1.2, INK_UI.brush, 0.7);
    slip.strokeRoundedRect(sealX - 18, -18, 36, 36, 3);
    ribbon.add(slip);
    const rays = self.add.graphics();
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2 + 0.2;
      rays.lineStyle(2, INK_UI.gold, 0.6);
      rays.lineBetween(Math.cos(angle) * 16, Math.sin(angle) * 16, Math.cos(angle) * 46, Math.sin(angle) * 46);
    }
    rays.setPosition(sealX, 0).setAlpha(0).setScale(0.5);
    ribbon.add(rays);
    const chop = self.add.graphics();
    seal(chop, 0, 0, 26, 'star');
    chop.setPosition(sealX, 0).setScale(2.4).setAlpha(0);
    ribbon.add(chop);
    self.tweens.chain({
      tweens: [
        { targets: chop, scale: 1, alpha: 1, duration: 190, delay: RIBBON_IN_MS - 60, ease: 'Back.easeIn' },
        { targets: rays, alpha: { from: 0.95, to: 0 }, scale: 1.5, duration: 460, ease: 'Cubic.easeOut', offset: '-=20' },
      ],
    });
  }

  const title = self.add.text(centreX, -9, ours ? t('ascent.battle.reliefTitle') : t('ascent.battle.enemyReliefTitle'), {
    fontFamily: TITLE_FONT, fontSize: '17px', fontStyle: '700', align: 'center',
    color: cssHex(ours ? INK_UI.goldLight : INK_UI.cinnabar),
  }).setOrigin(0.5);
  // One line, squeezed rather than wrapped, the way the wave banner keeps its heading a heading.
  if (title.width > textWidth) title.setScale(textWidth / title.width, 1);
  ribbon.add(title);
  const sub = self.add.text(centreX, 10, t('ascent.battle.reliefSub', { name, men: formatNumber(men) }), {
    fontFamily: UI_FONT, fontSize: '10px', align: 'center', color: cssHex(INK_UI.parchment),
  }).setOrigin(0.5);
  if (sub.width > textWidth) sub.setScale(textWidth / sub.width, 1);
  ribbon.add(sub);

  const finish = (): void => {
    if (!root.active) return;
    killTweensDeep(self, root);
    root.destroy(true);
  };
  /**
   * Unfurled, held, then taken down.
   *
   * `scaleX` from a sliver with `Back.easeOut` is a banner being pulled open from its middle; the
   * overshoot is the cloth snapping taut. It leaves upward rather than sideways, because a
   * proclamation is taken down, not driven past.
   */
  ribbon.setScale(0.12, 0.6).setAlpha(0);
  self.tweens.chain({
    tweens: [
      { targets: ribbon, scaleX: 1, scaleY: 1, alpha: 1, duration: RIBBON_IN_MS, ease: 'Back.easeOut' },
      {
        targets: ribbon,
        y: cy - 26,
        alpha: 0,
        duration: RIBBON_OUT_MS,
        delay: RIBBON_HOLD_MS,
        ease: 'Quad.easeIn',
      },
    ],
    onComplete: finish,
  });
}

/**
 * The men the column brings, rising off the line it joined — gold for ours, sỏi son for theirs.
 *
 * **Off the feet, not over the heads.** It used to start 54 above the line and rise to 98, which is
 * exactly where the shout hangs (bubbles sit 78 over the line and are two or three lines tall), so
 * the one number the moment is about was printed *behind* the sentence announcing it. Photographed
 * on the phone: `+460` inside the bubble, half of it under the text. It rises from the ground the
 * men are standing on instead, where nothing else is drawn.
 */
function countOverLine(self: ConquestUIScene, battle: AscentBattle, side: ReliefSide, men: number): void {
  const ui = self.battleUi;
  if (!ui || men <= 0) return;
  const { groundY } = ui.geometry;
  const lines = battleLines(self, battle.ourAdvance, battle.theirAdvance);
  const x = side === 'ours' ? lines.ourX : lines.theirX;
  const label = self.ui.label(x, groundY + 8, `+${formatNumber(men)}`, 'label', {
    fontSize: '17px', fontStyle: '700', align: 'center',
    color: cssHex(side === 'ours' ? INK_UI.gold : INK_UI.cinnabar),
    stroke: cssHex(INK_UI.brush), strokeThickness: 3,
  }).setOrigin(0.5).setScale(0.6);
  ui.floaters.add(label);
  self.tweens.add({ targets: label, scale: 1, duration: 240, ease: 'Back.easeOut' });
  self.tweens.add({
    targets: label,
    y: groundY - 26,
    alpha: { from: 1, to: 0 },
    duration: 1500,
    delay: 260,
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
