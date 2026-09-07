/**
 * The two speech bubbles over the hosts on the battlefield — one a side, the tail on the men
 * doing the talking, and the shout that throws a new one out of their mouth.
 *
 * Redrawn on a changed sentence, not on a beat: four or five times in a whole engagement. A side
 * that has only walked is left alone until its host is more than 10 units from where the tail was
 * put down, because the tail is part of the closed path and cannot be moved without a redraw. The
 * linger is `battleBubbleMs()` — infinite keeps the words, 0 draws nothing and leaves the reading
 * to the men. Every replaced bubble is `killTweensDeep`ed first; its fade tween outlives it.
 */
import Phaser from 'phaser';
import { battleBubbleMs } from '../../../game/battleOptions';
import { battleTelegraph } from '../../../systems/ascent/BattleSystem';
import { INK_UI, INK_UI_HEX } from '../../../ui/InkUI';
import { type BattleFormation } from '../../../data/ascent/formations';
import { printedShape } from '../../../ui/ink/stroke';
import { CARD_ICON_SIZE, drawCardIcon } from '../../../ui/CardIcons';
import { t } from '../../../i18n';
import type { AscentBattle } from '../../../state/types';
import { FORMATION_ICON } from '../constants';
import { battleFrame, battleLines } from './geometry';
import { killTweensDeep } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * What each side's line is doing, said over its own men.
 *
 * **This is the sentence the whole fight turns on, and it used to be printed a hundred and
 * eighty points away from the thing it was about.** "their spears are set" sat in a band under
 * the rails, in the dock, between a price and a lock counter — so the player read a caption,
 * looked up at two blocks of figures, and had to take on trust which of them it referred to.
 * There was no line at all for our own shape: the only way to know what your own host was
 * standing in was to look at which chip was filled.
 *
 * A bubble over the men answers both at once. It is attached to the host it belongs to, both
 * sides get one, and the answer to "who is doing that" is where the tail points. The manga
 * device is deliberate rather than decorative — the fight is the one screen in this game with
 * two *actors* on it, and a speech bubble is the one drawing everybody already reads as "this
 * one, not that one".
 *
 * Rebuilt only when a sentence changes. Across a whole engagement that is four or five times;
 * a bubble redrawn on the beat would flicker under a shape that had not moved.
 */
export function updateBattleBubbles(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;

  const read = battleTelegraph(self.state);
  const walking = (battle.reformBeats ?? 0) > 0;
  const ourShape = walking && battle.formationTarget ? battle.formationTarget : battle.ourFormation;
  const ours = walking
    ? t('ascent.battle.bubbleReforming', {
      shape: t(`ascent.formation.${ourShape}.verb` as Parameters<typeof t>[0]),
    })
    : t(`ascent.formation.${battle.ourFormation}.ours` as Parameters<typeof t>[0]);
  // What they are *standing in*, not what they are walking into. The second is a warning and
  // belongs in the notice; a bubble says what the men under it are doing now.
  // "All ranks, level spears!" names the shape in as many words, which is the leak the rims and the
  // telegraph were already closed for. While the drum beats they are visibly *forming* and say
  // so; the moment it falls they say what they formed into.
  const theirShape = read?.formation ?? battle.theirFormation;
  const theirs = self.battleOpeningSealed
    ? t('ascent.battle.formingUp')
    : t(`ascent.formation.${theirShape}.threat` as Parameters<typeof t>[0]);

  /**
   * Redrawn when the sentence changes — or when the host it points at has walked far enough that
   * the tail no longer lands on it.
   *
   * The tail is part of the closed path, so it cannot be moved without redrawing the bubble, and
   * the two lines close across most of the field over an engagement. Ten units is under half a
   * host block, so the spike is always plainly on the men; over a whole engagement it fires a
   * handful of times rather than 1.8 times a second.
   */
  const frame = battleFrame(self, battle);
  const lines = battleLines(self, frame.ourAdvance, frame.theirAdvance);
  /**
   * Each side decides for itself whether it needs redrawing, and why.
   *
   * *Said* and *merely moved* are worth telling apart. A new sentence is an order being given and
   * gets announced; a bubble following its host across the field must not pop every time the line
   * advances ten points. And a shout in flight outranks a walk: `updateBattle` runs on the battle
   * clock *and* on every state change an order causes, so an order fires two or three redraws
   * inside the first two hundred milliseconds, each one replacing the popping bubble with a
   * settled one.
   *
   * Nothing is announced on the opening frame — the fight has not said anything yet, it is
   * showing what both sides are already standing in.
   */
  const shouting = self.time.now - ui.bubbleShoutAt < 420;
  const opening = ui.bubbleSaid.ours === '' && ui.bubbleSaid.theirs === '';
  const sides = [
    { side: 'ours' as const, text: ours, at: lines.ourX },
    { side: 'theirs' as const, text: theirs, at: lines.theirX },
  ];
  // The difficulty's clock on the words. Infinity keeps them; 0 never draws them; anything
  // between fades the bubble and leaves the drawn formation to carry the reading.
  const linger = battleBubbleMs();
  for (const { side, text, at } of sides) {
    const spoke = ui.bubbleSaid[side] !== text;
    const walked = Math.abs(at - ui.bubbleAt[side]) > 10;
    if (!spoke && ui.bubbleFaded[side]) continue;
    if (!spoke && (shouting || !walked) && ui.bubbleOf[side]?.active) continue;
    ui.bubbleSaid[side] = text;
    ui.bubbleAt[side] = at;
    ui.bubbleFaded[side] = false;
    const previous = ui.bubbleOf[side];
    if (previous) {
      killTweensDeep(self, previous);
      previous.destroy();
    }
    if (linger <= 0) {
      // Nightmare: the sentence is recorded so the side is not re-announced every beat, and
      // nothing is drawn. The men are the telegraph.
      ui.bubbleOf[side] = undefined;
      ui.bubbleFaded[side] = true;
      continue;
    }
    const made = battleBubble(self, 
      at, side, text, spoke && !opening,
      // No glyph for them while sealed: the little grid or hedge beside the words is the shape
      // spelled out in one mark, and hiding the sentence while keeping the picture hides nothing.
      side === 'ours' ? ourShape : (self.battleOpeningSealed ? undefined : theirShape),
    );
    ui.bubbles.add(made);
    ui.bubbleOf[side] = made;
    if (Number.isFinite(linger)) {
      self.tweens.add({
        targets: made, alpha: 0, delay: linger, duration: 360, ease: 'Quad.easeIn',
        onComplete: () => {
          if (ui.bubbleOf[side] === made) {
            ui.bubbleOf[side] = undefined;
            ui.bubbleFaded[side] = true;
          }
          made.destroy();
        },
      });
    }
  }
}

/**
 * One bubble: a printed blob with a spike pointing down at the host that is speaking.
 *
 * Drawn through `printedShape` like every other surface in the game rather than as a rounded
 * rectangle, so it belongs to the same woodblock as the men underneath it. The outline is an
 * eight-point sheet with the tail spliced into its bottom edge — one closed path, so the wobble
 * runs continuously round the spike instead of stopping at a seam.
 */
function battleBubble(self: ConquestUIScene,
  anchorX: number, side: 'ours' | 'theirs', text: string, announce = false,
  shape?: BattleFormation,
): Phaser.GameObjects.Container {
  const ui = self.battleUi!;
  const { content } = ui;
  const { groundY } = ui.geometry;
  const fieldTop = content.y;

  const GLYPH = 14;
  const glyphSpace = shape ? GLYPH + 5 : 0;
  // Each bubble must fit its half of the field, including icon and padding.
  const maxWidth = content.width / 2 - 10;
  const label = self.ui.label(0, 0, text, 'caption', {
    fontSize: '12px',
    align: 'center',
    color: side === 'ours' ? INK_UI_HEX.inkText : '#8a2a1b',
    wordWrap: { width: Math.floor(maxWidth - glyphSpace - 18) },
  }).setOrigin(0, 0);

  /**
   * The shape's own glyph, inside the bubble, beside the words.
   *
   * The same mark the chip carries and the same mark the ring is drawn from — so `their spears
   * are set` and the SPEARS chip a thumb is about to press are visibly the same thing. The
   * sentence is the reading; the glyph is what makes it findable in the row below without
   * reading anything at all.
   *
   * Tinted with the type it stands next to, which is the screen's existing rule: ink for us,
   * sỏi son for them.
   */
  const ink = side === 'ours' ? INK_UI.brush : INK_UI.cinnabar;
  const glyph = shape ? drawCardIcon(self, FORMATION_ICON[shape], ink) : undefined;
  glyph?.setScale(GLYPH / CARD_ICON_SIZE);
  const inner = (glyph ? GLYPH + 5 : 0) + label.width;

  const width = Math.min(maxWidth, inner + 18);
  const height = label.height + 11;
  /**
   * Centred over the host that is speaking, and kept on its own half of the field.
   *
   * Pinned to the two edges first, which looked right on the opening frame and wrong from about
   * the fourth beat: the lines close across most of the field, and a bubble that cannot move has
   * a tail clamped to its own edge, so the spike ends up pointing at bare ground behind the men.
   *
   * The half-field clamp is what keeps the two apart once the lines meet in the middle — at that
   * point both hosts are within thirty units of each other and two bubbles that simply followed
   * them would be drawn on top of one another.
   */
  const mid = content.x + content.width / 2;
  const x = side === 'ours'
    ? Phaser.Math.Clamp(anchorX - width / 2, content.x + 4, mid - 3 - width)
    : Phaser.Math.Clamp(anchorX - width / 2, mid + 3, content.x + content.width - 4 - width);
  /**
   * High enough to clear the men, low enough to still be over them.
   *
   * 78 is measured off the tallest host block this screen draws. The clamp is what keeps it
   * honest on a short phone: `GAME_HEIGHT` goes to 620, where the field is at its 150 floor and
   * a bubble hung 78 above the line would be off the top of the frame entirely.
   */
  const bottom = Math.max(fieldTop + height + 6, groundY - 78);
  const y = bottom - height;

  const cut = 7;
  const tailX = Phaser.Math.Clamp(anchorX, x + 14, x + width - 14);
  /**
   * The container sits on the **tip of the tail**, and everything is drawn relative to it.
   *
   * Not a tidiness point: a Phaser container has no origin, so it scales and rotates about its
   * own position. Parked at (0, 0) with the bubble drawn in screen coordinates, a pop would fling
   * the whole thing in from the corner of the sheet. Anchored at the tail, the same tween reads
   * as the words coming out of the man who is saying them.
   */
  const anchor = { x: tailX, y: bottom + 13 };
  const container = self.add.container(anchor.x, anchor.y);
  const px = (value: number): number => value - anchor.x;
  const py = (value: number): number => value - anchor.y;

  const sheet = self.add.graphics();
  printedShape(sheet, [
    { x: px(x + cut), y: py(y) },
    { x: px(x + width - cut), y: py(y) },
    { x: px(x + width), y: py(y + cut) },
    { x: px(x + width), y: py(bottom - cut) },
    { x: px(x + width - cut), y: py(bottom) },
    // The spike, spliced into the bottom edge on its way back to the left.
    { x: px(tailX + 6), y: py(bottom) },
    { x: 0, y: 0 },
    { x: px(tailX - 7), y: py(bottom) },
    { x: px(x + cut), y: py(bottom) },
    { x: px(x), y: py(bottom - cut) },
    { x: px(x), y: py(y + cut) },
  ], INK_UI.parchment, Math.round(x * 13 + y), {
    fillAlpha: 0.97, width: 1.4, alpha: 0.85, colour: INK_UI.brush, wobble: 0.6, step: 9,
  });
  container.add(sheet);
  // Glyph and words as one group, centred together — not the words centred with a glyph hung off
  // them, which reads as a bubble with something stuck to its side.
  const groupX = x + (width - inner) / 2;
  if (glyph) {
    glyph.setPosition(px(groupX + GLYPH / 2), py(y + 5 + label.height / 2));
    container.add(glyph);
  }
  label.setPosition(px(groupX + (glyph ? GLYPH + 5 : 0)), py(y + 5));
  container.add(label);
  if (announce) shoutBubble(self, container, side);
  return container;
}

/**
 * A bubble arriving as an order rather than as a caption.
 *
 * **A new sentence in these bubbles is somebody shouting.** The player taps SPEARS and a line of
 * men two hundred points away begins to re-form; the only thing on screen that says so
 * immediately is the bubble above them, and it was appearing between one frame and the next —
 * indistinguishable from the same words having been there all along, which is exactly the
 * complaint the tap feedback on the chips was added to answer.
 *
 * So it is given the shape of the act: it snaps out of the man's mouth, overshoots, and settles.
 * Three things, none of them decorative —
 *
 *   the pop    — `Back.easeOut` from near full size, about the tail. An order is sudden.
 *   the recoil — a lean the wrong way that rights itself, the way a shouted word has a body
 *                behind it. Ours leans forward into the enemy, theirs the other way.
 *   the strokes— manga speed lines off the tail, in the side's own colour. They live 320 ms and
 *                destroy themselves; nothing here survives the next redraw.
 *
 * Fires on a *changed sentence* only. Following a host across the field must not pop, and the
 * opening frame must not pop at all — nobody has said anything yet.
 */
function shoutBubble(self: ConquestUIScene, container: Phaser.GameObjects.Container, side: 'ours' | 'theirs'): void {
  if (self.battleUi) self.battleUi.bubbleShoutAt = self.time.now;
  const lean = side === 'ours' ? 7 : -7;
  container.setScale(0.92).setAngle(lean);
  self.tweens.add({
    targets: container,
    scale: 1,
    angle: 0,
    duration: 220,
    ease: 'Back.easeOut',
  });

  /**
   * Speed lines off the tail, fanning **down** toward the men and drawn over everything.
   *
   * Both halves of that were wrong first time. The container's origin is the tail *tip*, which
   * hangs below the bubble — so a fan drawn upward pointed straight into the bubble's own body,
   * and putting it at index 0 hid what little of it stuck out. Downward and on top, they read as
   * the word leaving the man who shouted it.
   */
  const strokes = self.add.graphics();
  const colour = side === 'ours' ? INK_UI.brush : INK_UI.cinnabar;
  strokes.lineStyle(1.6, colour, 0.9);
  for (let i = 0; i < 4; i += 1) {
    const angle = Math.PI / 2 + (i - 1.5) * 0.44;
    strokes.lineBetween(
      Math.cos(angle) * 5, Math.sin(angle) * 5,
      Math.cos(angle) * 13, Math.sin(angle) * 13,
    );
  }
  container.add(strokes);
  self.tweens.add({
    targets: strokes,
    scale: { from: 0.7, to: 1.8 },
    alpha: { from: 0.9, to: 0 },
    duration: 320,
    ease: 'Quad.easeOut',
    onComplete: () => strokes.destroy(),
  });
}
