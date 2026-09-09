/**
 * The two dials at the foot of the fight — the three-posture stance strip, the five formation
 * chips in ring order, the stamina pips beside them, and the marks a press leaves behind.
 *
 * Two clocks, split on purpose. `battleOrderSignature` names what the strips *offer* — the
 * shapes, the postures, the rims — and the dock is torn down and rebuilt whole only when that
 * changes: an order given, a re-form starting or landing, the telegraph naming a new shape.
 * Everything a beat moves — the price line, the pips, the re-form countdown, the landing flare,
 * a chip greying as stamina runs out — is written into retained handles by `drawBattleDock`,
 * which runs on every beat and costs two or three guarded `setText`s and one small `clear()`.
 *
 * It was one clock, and the one clock was the single most expensive thing on this screen: the
 * signature deliberately included the per-beat readings, so seventeen of every thirty beats
 * rebuilt 60-odd objects and rasterised up to a hundred labels to move three numbers. Worse than
 * the cost was the hazard the file has always warned about: a card destroyed between press and
 * release never fires. The press marks hang off `modalLayer` for that reason, and now the chips
 * themselves stand still under the thumb too. `ui.coachBounds` is recorded here, where the boxes
 * are computed.
 */
import Phaser from 'phaser';
import { battleRimsShown } from '../../../game/battleOptions';
import { BATTLE_STAMINA_REGEN_BEATS } from '../../../game/ascentConfig';
import { battleStamina, battleTelegraph, canFormFormation } from '../../../systems/ascent/BattleSystem';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap, type UIBounds } from '../../../ui/InkUI';
import { writeText } from '../../../ui/textWrite';
import { formationTier, FORMATION_RING } from '../../../data/ascent/formations';
import { CARD_ICON_SIZE, drawCardIcon } from '../../../ui/CardIcons';
import { addConquestUiIcon } from '../../../ui/conquestUiIcons';
import { PIGMENT } from '../../../ui/ink/palette';
import { t } from '../../../i18n';
import type { AscentBattle, FieldStance } from '../../../state/types';
import {
  BATTLE_DIAL_GAP,
  BATTLE_FORMATION_HEIGHT,
  BATTLE_RAILS_HEIGHT,
  BATTLE_READOUT_HEIGHT,
  BATTLE_STANCE_HEIGHT,
  FORMATION_ICON,
  battleFieldBox,
  cssHex,
} from '../constants';
import { clearLayer } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * What the two strips currently offer — and nothing a beat moves.
 *
 * Rebuilt when — and only when — this changes. **Never on the beat:** a card destroyed between
 * press and release never fires, which this screen has already been bitten by once. The per-beat
 * readings that used to sit in here (last beat's losses, the stamina clock, the telegraph's
 * countdown, the landing stamp) belong to `drawBattleDock` now.
 *
 * The telegraph's *shape* is in here because the chip edges are drawn from it: a green rim under
 * a shape that no longer answers what they are forming is worse than no rim at all. Its beat
 * countdown is not — a rim does not change colour as the clock runs down.
 */
export function battleOrderSignature(self: ConquestUIScene, battle: AscentBattle): string {
  const read = battleTelegraph(self.state);
  return [
    battle.stance,
    battle.stancePending ?? '',
    battle.ourFormation,
    battle.formationTarget ?? '',
    (battle.reformBeats ?? 0) > 0 ? 'w1' : 'w0',
    // The wager is a structural mark on the held chip - double rim, note line.
    battle.committed ? 'c1' : 'c0',
    read ? `${read.formation}>${read.next ?? ''}` : '',
    battleRimsShown() ? 'r1' : 'r0',
    // The seal decides whether the rims answer anything at all.
    self.battleOpeningSealed ? 's1' : 's0',
    // The pulsing "give the first order" frame exists only while the fight waits for one.
    self.battleAwaitingOrder ? 'a1' : 'a0',
  ].join(':');
}

/**
 * The two dials, as a fixed dock ranked by how often each is touched.
 *
 * This used to be a three-way stance ring plus five buttons, and the ring did two jobs at once:
 * it carried the matchup *and* the tempo, which is why two of its three options had the same
 * exchange ratio to three decimals. `docs/14-five-shapes-two-dials.html` splits them, and the
 * split has a layout consequence that is the whole of this method:
 *
 *   **Formation is worked three to five times an engagement. Stance is worked once or twice.**
 *
 * So formation gets the widest, lowest, largest band — the arc a thumb covers without the hand
 * shifting — and stance sits above it, smaller, further away, with a lock counter in its label.
 * The two exits are not here at all; see `buildBattleExits`.
 *
 * Builds the structure and the retained handles; `drawBattleDock` (called at the end, and on
 * every beat after) writes the readings into them.
 */
export function buildBattleOrders(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { content, orders } = ui;

  clearLayer(self, orders);
  ui.orderSignature = battleOrderSignature(self, battle);

  // 10, down from 16. The stance strip and everything under it move up by six, which is six
  // more between the formation chips and the two buttons that end the fight.
  const dockY = content.y + ui.fieldHeight + 8 + BATTLE_RAILS_HEIGHT + 10;
  const read = battleTelegraph(self.state);

  const dock: NonNullable<typeof ui.dock> = {
    price: undefined as unknown as Phaser.GameObjects.Text,
    arms: undefined as unknown as Phaser.GameObjects.Text,
    verdict: undefined as unknown as Phaser.GameObjects.Text,
    verdictKey: '',
    pips: undefined as unknown as Phaser.GameObjects.Graphics,
    pipsKey: '',
    pipGeom: { px: 0, topY: 0 },
    defendChosen: false,
    committedShown: ui.dock?.committedShown ?? false,
    lastFlareBeat: ui.dock?.lastFlareBeat ?? -1,
    chips: {},
  };
  ui.dock = dock;

  // ── the readout: three retained labels the beat writes into ──────────
  buildBattleReadout(self, battle, dockY);

  const stanceY = dockY + BATTLE_READOUT_HEIGHT + 3;
  // Recorded where they are computed. See `coachBounds`.
  // Recorded from where the header put it, not recomputed: the clock is the one part of this
  // screen that is no longer laid out against `content` at all.
  ui.coachBounds.pips = ui.pipBounds;
  // The field, because the bubbles over the two hosts live on it and the coach has to be able
  // to point at what each side is saying.
  ui.coachBounds.field = battleFieldBox(content, ui.fieldHeight);
  ui.coachBounds.rails = {
    x: content.x,
    y: content.y + ui.fieldHeight + 8,
    width: content.width,
    height: BATTLE_RAILS_HEIGHT,
  };
  ui.coachBounds.readout = {
    x: content.x, y: dockY, width: content.width, height: BATTLE_READOUT_HEIGHT,
  };
  ui.coachBounds.stance = {
    x: content.x, y: stanceY, width: content.width, height: BATTLE_STANCE_HEIGHT,
  };
  // Three, not four: Lui binh is an exit, not a posture, and lives with the exits now.
  const stances: FieldStance[] = ['defend', 'balanced', 'press'];
  const segGap = 5;
  // The last 26 points of the row are the stamina column — two ink pips stacked beside the
  // postures they budget. Not a number: a pip is a thing, and the same pip is what flies into a
  // chip when a shape is ordered and what flashes red when there is none to spend. The missing
  // pip fills slowly — that growing stroke IS the wait, and needs no countdown.
  const PIP_COLUMN = 26;
  const segW = (content.width - PIP_COLUMN - segGap * stances.length) / stances.length;
  {
    const px = content.x + content.width - PIP_COLUMN / 2 + 2;
    // One graphics for the whole column, cleared and re-inked by `drawBattleDock` when a pip is
    // spent, returns, or ticks toward returning. It used to be one graphics per pip, rebuilt
    // with the dock — on most beats, to redraw an arc a few degrees longer.
    const pips = self.add.graphics();
    orders.add(pips);
    dock.pips = pips;
    dock.pipGeom = { px, topY: stanceY + 8 };
    ui.staminaPips = pips;
    ui.staminaAt = { x: px, y: stanceY + 8 };
  }
  stances.forEach((id, index) => {
    const x = content.x + index * (segW + segGap);
    const bounds = { x, y: stanceY, width: segW, height: BATTLE_STANCE_HEIGHT };
    // What is *pending* reads as chosen: the player pressed it, and it lands next beat.
    // No stance is ever refused, and no stance touches stamina: this dial is the trade and only
    // the trade — the lever a player reaches for while they wait for a pip.
    const chosen = (battle.stancePending ?? battle.stance) === id;
    const tile = self.ui.crayonTile(bounds, {
      selected: chosen, fill: chosen ? PIGMENT.hoePale : PIGMENT.diepHi,
    });
    orders.add(tile);
    if (id === 'defend') {
      // The glow that answers "stuck with no pip in a beaten shape" is a *reading*, not part of
      // the offer: stamina moves on the beat, so the mark is drawn by `drawBattleDock`.
      dock.defendBounds = bounds;
      dock.defendChosen = chosen;
    }
    const stanceIcon = drawCardIcon(self, id === 'defend' ? 'shield' : id === 'press' ? 'blade' : 'balance',
      chosen ? PIGMENT.sonDeep : PIGMENT.muc);
    orders.add(stanceIcon.setPosition(x + 13, stanceY + BATTLE_STANCE_HEIGHT / 2).setScale(19 / CARD_ICON_SIZE));
    const stanceLabel = self.ui.label(
      x + segW / 2 + 9, stanceY + BATTLE_STANCE_HEIGHT / 2,
      t(`ascent.stance.${id}` as Parameters<typeof t>[0]), 'label',
      {
        fontSize: '10.5px',
        align: 'center',
        color: chosen ? cssHex(INK_UI.cinnabar) : INK_UI_HEX.inkText,
      },
    ).setOrigin(0.5);
    if (stanceLabel.width > segW - 29) stanceLabel.setScale((segW - 29) / stanceLabel.width);
    orders.add(stanceLabel);
    const hit = self.add.zone(x, stanceY, segW, BATTLE_STANCE_HEIGHT).setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) return;
      self.resumeBattleForOrder();
      self.events.emit('ui:battle-order', `stance:${id}`);
    });
    orders.add(hit);
  });

  // ── the fast dial ────────────────────────────────────────────────────
  // No caption. The chips carry an icon and a verb now, and the readout band above says what the
  // enemy is doing in words — between them there is nothing left for a label to add.
  const formY = stanceY + BATTLE_STANCE_HEIGHT + BATTLE_DIAL_GAP;
  ui.coachBounds.formation = {
    x: content.x, y: formY, width: content.width, height: BATTLE_FORMATION_HEIGHT,
  };
  // While the fight is held waiting for its first order, say which strip is the one to touch.
  // The note in the field tells the player to pick a formation; this is the strip it means, and
  // without it "give the first order" is a sentence with no object. `battleAwaitingOrder` is in
  // the signature, so the frame is built and torn down with the dock.
  if (self.battleAwaitingOrder) {
    const call = self.add.graphics();
    call.lineStyle(2, INK_UI.cinnabar, 0.9);
    call.strokeRoundedRect(
      content.x - 3, formY - 3, content.width + 6, BATTLE_FORMATION_HEIGHT + 6, 8,
    );
    orders.add(call);
    self.tweens.add({
      targets: call, alpha: { from: 1, to: 0.25 }, duration: 700, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  const reforming = (battle.reformBeats ?? 0) > 0;
  // Their *target* is what a shape has to answer — countering the thing they are walking out of
  // is the classic way to arrive one beat too late.
  // Nothing to answer while the drum is beating: the rims are drawn from the enemy's shape, and
  // a jade rim on exactly the chip that beats them is the whole leak in one mark.
  const answering = self.battleOpeningSealed ? undefined : (read ? (read.next ?? read.formation) : undefined);
  const chipGap = 5;
  const chipW = (content.width - chipGap * (FORMATION_RING.length - 1)) / FORMATION_RING.length;

  // Laid out in ring order, so the two shapes that beat what they are forming are always
  // adjacent. The counter rule is legible from the layout alone — with one honest caveat: the
  // "one left of theirs" reading wraps at the strip's end, so the rims below are the real
  // carrier of the rule, and they never wrap.
  FORMATION_RING.forEach((id, index) => {
    const x = content.x + index * (chipW + chipGap);
    const bounds = { x, y: formY, width: chipW, height: BATTLE_FORMATION_HEIGHT };
    const held = battle.ourFormation === id && !reforming;
    const walking = reforming && battle.formationTarget === id;

    const tile = self.ui.crayonTile(bounds, {
      selected: held || walking, fill: held || walking ? PIGMENT.hoePale : PIGMENT.diepHi,
    });
    orders.add(tile);

    // Ochre + tick = held; green/up = advantage, red/down = disadvantage. Two marks mean
    // the strong matchup; one is the softer effect. Easy and normal only —
    // on hard and nightmare the hints are gone and the player has to find the answer by trying,
    // two pips at a time. That inference is the game; see `battleRimsShown`.
    let rim = 0;
    let rimAlpha = 0.95;
    if (battleRimsShown() && answering && id !== answering) {
      const tier = formationTier(id, answering);
      if (tier > 0) {
        rim = INK_UI.jade;
        rimAlpha = tier === 2 ? 0.95 : 0.5;
      } else if (tier < 0) {
        rim = INK_UI.cinnabar;
        rimAlpha = tier === -2 ? 0.95 : 0.5;
      }
    }
    if (rim) {
      const edge = self.add.graphics();
      edge.lineStyle(2, rim, rimAlpha);
      // A short printed rule leaves the selected contour distinct from the matchup cue.
      edge.lineBetween(x + 5, formY + BATTLE_FORMATION_HEIGHT - 2, x + chipW - 5, formY + BATTLE_FORMATION_HEIGHT - 2);
      if (!walking && !(held && battle.committed)) {
        const tier = formationTier(id, answering!);
        const cy = formY + BATTLE_FORMATION_HEIGHT - 9;
        const cx = x + chipW - 12;
        const motif = tier > 0
          ? (tier === 2 ? 'chevrons-up' : 'chevron-up')
          : (tier === -2 ? 'chevrons-down' : 'chevron-down');
        orders.add(addConquestUiIcon(self, motif, 12).setPosition(cx, cy - 2).setAlpha(rimAlpha));
      }
      edge.setData('battleMatchup', { id, tier: formationTier(id, answering!) });
      orders.add(edge);
    }
    // Dồn sức stands on the chip it was wagered on: a second rim inside the first, the mark of
    // a seal pressed twice.
    const committedHere = held && battle.committed === true;
    if (committedHere) {
      const inner = self.add.graphics();
      inner.lineStyle(2, INK_UI.cinnabar, 0.9);
      inner.strokeRoundedRect(x + 5, formY + 5, chipW - 10, BATTLE_FORMATION_HEIGHT - 10, 4);
      orders.add(inner);
      // The wager BREATHES while it stands - a held bet under tension, not a label. The strip's
      // own clear kills this with the rim, the same as the awaiting-order pulse.
      self.tweens.add({
        targets: inner, alpha: { from: 0.9, to: 0.4 }, duration: 620,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // The base ink for a chip that is *available*: what `drawBattleDock` restores when stamina
    // comes back. `gone` swaps it for `softBrush` live, because stamina moves on the beat.
    const baseInk = held || walking ? INK_UI.cinnabar
      : rim === INK_UI.jade ? INK_UI.jade : INK_UI.brush;
    const baseVerbColour = held || walking ? cssHex(INK_UI.cinnabar) : INK_UI_HEX.inkText;

    /**
     * The order at the top, the glyph under it, the state line pinned to the floor.
     *
     * The word a player is looking *for* starts at a fixed y on every chip in the row, whatever
     * language it is in and however many lines it takes, and the line that only sometimes
     * appears (the re-form countdown) has the floor to itself. Whether that line exists is
     * structural — a re-form starting or landing changes the signature — so the glyph's band is
     * fixed for the life of this build; only the countdown's *text* moves per beat.
     */
    const GLYPH = 30;
    const verb = self.ui.label(
      0, 0, t(`ascent.formation.${id}.verb` as Parameters<typeof t>[0]), 'label',
      {
        fontSize: '10px',
        align: 'center',
        wordWrap: { width: chipW - 2 },
        color: baseVerbColour,
      },
    ).setOrigin(0.5, 0);
    // One line, shrunk to fit — never wrapped. A state note is a glance, not a sentence: it can
    // afford to be small, and it cannot afford to be tall. Created empty when the shape is
    // walking; `drawBattleDock` writes the countdown into it.
    const noteLabel = walking || committedHere
      ? self.ui.label(0, 0, committedHere ? t('ascent.battle.committed') : '', 'caption', {
        fontSize: '8px',
        align: 'center',
        color: '#8a2a1b',
      }).setOrigin(0.5, 0)
      : undefined;

    // The floor the state line keeps for itself. Thirteen when there is nothing to print, so the
    // glyph does not hop up and down the chip as a shape starts and finishes re-forming.
    const FLOOR = 13;
    const top = formY + 5;
    const glyphBand = { from: top + verb.height + 1, to: formY + BATTLE_FORMATION_HEIGHT - FLOOR };

    verb.setPosition(x + chipW / 2, top);
    orders.add(verb);

    const glyphScale = Math.min(GLYPH, Math.max(9, glyphBand.to - glyphBand.from)) / CARD_ICON_SIZE;
    const glyphX = x + chipW / 2;
    const glyphY = (glyphBand.from + glyphBand.to) / 2;
    const glyph = drawCardIcon(self, FORMATION_ICON[id], baseInk);
    glyph.setPosition(glyphX, glyphY).setScale(glyphScale);
    orders.add(glyph);
    if (held && !committedHere) {
      const cy = formY + BATTLE_FORMATION_HEIGHT - 9;
      const check = addConquestUiIcon(self, 'check', 12)
        .setPosition(x + 12, cy).setData('battleSelected', id);
      orders.add(check);
    }

    if (noteLabel) {
      noteLabel.setPosition(x + chipW / 2, formY + BATTLE_FORMATION_HEIGHT - 3 - noteLabel.height);
      orders.add(noteLabel);
    }

    // The re-form bar rides the chip's floor while the shape is walking; the fill is written by
    // the beat, the object's life belongs to the build (walking is in the signature).
    const bar = walking ? self.add.graphics() : undefined;
    if (bar) orders.add(bar);

    /**
     * The **whole chip** dips, not just the tile under it — the paper and the word printed on it
     * move together. The generated glyph keeps its pigments and only fades when unavailable.
     */
    const cx = bounds.x + chipW / 2;
    const cy = formY + BATTLE_FORMATION_HEIGHT / 2;
    const chip: NonNullable<NonNullable<ConquestUIScene['battleUi']>['dock']>['chips'][string] = {
      bounds,
      tile,
      verb,
      glyph,
      glyphX,
      glyphY,
      glyphScale,
      baseInk,
      baseVerbColour,
      held,
      walking,
      note: noteLabel,
      noteKey: '',
      bar,
      barBeats: -1,
      gone: false,
      parts: [
        // The tile's OWN rest scale, never a literal 1: a stamped tile is a raster image whose
        // natural scale is 1/renderScale, and the press restoring `hs` wrote 1 over it — one
        // click and the chip stood at three times its size for the rest of the fight.
        { o: tile, hx: bounds.x, hy: bounds.y, hs: tile.scaleX },
        { o: glyph, hx: glyphX, hy: glyphY, hs: glyphScale },
        { o: verb, hx: verb.x, hy: verb.y, hs: 1 },
      ],
    };
    if (noteLabel) chip.parts.push({ o: noteLabel, hx: noteLabel.x, hy: noteLabel.y, hs: 1 });
    dock.chips[id] = chip;

    const press = (k: number): void => {
      for (const part of chip.parts) {
        part.o.setScale(part.hs * k);
        part.o.setPosition(cx + (part.hx - cx) * k, cy + (part.hy - cy) * k);
      }
    };

    /**
     * One zone, one handler, and `gone` is decided at tap time.
     *
     * The dock no longer rebuilds when stamina moves, so a chip that greyed out between builds
     * must refuse from its *current* state, not the state it was built in — a handler frozen at
     * build time would happily order a shape there is no pip to pay for.
     */
    const hit = self.add.zone(x, formY, chipW, BATTLE_FORMATION_HEIGHT).setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => { if (!chip.gone) press(0.93); });
    const unpress = (): void => press(1);
    hit.on('pointerout', unpress);
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      unpress();
      if (scrollGestureConsumedTap(pointer)) return;
      if (chip.gone) {
        // A tap with nothing to spend: the pips flash red, the chip shivers. Every game does
        // this and nobody has to be taught it.
        refuseForStamina(self, tile);
        return;
      }
      // Dồn sức: tapping the shape already held wagers a second pip on it. This tap used to be
      // dead (ordering what you hold is refused by the system) yet still played the spend
      // animation - now it is the gamble, and the seal only lands when the wager is taken.
      if (chip.held && !chip.walking) {
        const live = self.state.ascent?.activeBattle;
        if (!live || live.committed || battleStamina(live).pips < 1) {
          refuseForStamina(self, tile);
          return;
        }
        self.resumeBattleForOrder();
        stampFormationChip(self, bounds);
        spendPipInto(self, bounds);
        self.events.emit('ui:battle-order', 'commit');
        return;
      }
      self.resumeBattleForOrder();
      // Before the order, because the order rebuilds this strip: the mark has to be somewhere
      // that outlives the chip that raised it.
      stampFormationChip(self, bounds);
      spendPipInto(self, bounds);
      self.events.emit('ui:battle-order', `formation:${id}`);
    });
    orders.add(hit);
  });

  // A wrapped verb reserves the same band for every formation. Keep the press-rest
  // coordinates in sync so releasing a chip cannot restore its old individual size.
  const formationChips = Object.values(dock.chips);
  const sharedGlyphScale = Math.min(...formationChips.map(chip => chip.glyphScale));
  const sharedGlyphY = Math.max(...formationChips.map(chip => chip.glyphY));
  for (const chip of formationChips) {
    chip.glyphScale = sharedGlyphScale;
    chip.glyphY = sharedGlyphY;
    chip.glyph.setScale(sharedGlyphScale).setY(sharedGlyphY);
    const rest = chip.parts.find(part => part.o === chip.glyph)!;
    rest.hs = sharedGlyphScale;
    rest.hy = sharedGlyphY;
  }

  // First readings, so the dock never shows a frame of empty handles.
  drawBattleDock(self, battle);
}

/**
 * The per-beat readings, written into the standing dock.
 *
 * Runs on every beat and on every refresh; everything in here is either guarded (`writeText`
 * skips an unchanged string, and `setColor` is only called when the colour moved) or keyed on
 * the reading it draws, so a quiet beat costs a handful of string compares. This is the half of
 * the old rebuild that actually changed 1.2–2.1 times a second; the structure it writes into
 * changes a handful of times per fight.
 */
export function drawBattleDock(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  const dock = ui?.dock;
  if (!ui || !dock) return;

  // The men answer the wager the moment it is taken, whichever path took it.
  const committedNow = battle.committed === true;
  if (committedNow !== dock.committedShown) {
    if (committedNow) surgeCommittedLine(self);
    dock.committedShown = committedNow;
  }

  const stamina = battleStamina(battle);
  const walking = (battle.reformBeats ?? 0) > 0;
  const beatNow = (battle.approachBeats ?? 0) + battle.round;

  // ── the readout ──────────────────────────────────────────────────────
  const loss = battle.lastBeatLoss;
  const price = walking ? t('ascent.battle.walkingWhy')
    : loss ? `${t('ascent.battle.priceOurs', { ours: String(Math.round(loss.ours)) })}  ·  `
      + t('ascent.battle.priceTheirs', { theirs: String(Math.round(loss.theirs)) })
      : t('ascent.battle.priceOpening');
  const losing = !walking && loss !== undefined && loss.ours > loss.theirs;
  const priceChanged = writeText(dock.price, price, walking ? INK_UI_HEX.mutedText
    : losing ? '#8a2a1b'
      : loss ? '#4c5f45' : INK_UI_HEX.mutedText);
  if (priceChanged) fitLabel(dock.price, ui.content.width - VERDICT_COLUMN - 8, 10.5, 8.5);

  const arms = battle.ourMatchup ?? 1;
  const armsText = Math.abs(arms - 1) > 0.03
    ? (arms > 1 ? t('ascent.battle.armsGood') : t('ascent.battle.armsBad'))
    : '';
  if (writeText(dock.arms, armsText, arms > 1 ? '#4c5f45' : '#8a2a1b')) {
    fitLabel(dock.arms, ui.content.width - VERDICT_COLUMN - 8, 9, 7.5);
  }

  // One slot on the right, three claimants, ranked by how narrow a span of time each is about.
  // Winning is announced the moment it is true; losing waits for three unanswered rounds.
  const landed = battle.landedBeat !== undefined && beatNow - battle.landedBeat <= 1 && !walking;
  const adrift = (battle.lostRun ?? 0) >= 3 && (battle.beatsSinceOurShape ?? 0) >= 3;
  const verdict = landed
    ? (battle.landedCountered === true
      ? { text: t('ascent.battle.landedGood'), colour: cssHex(INK_UI.jade), loud: true }
      : { text: t('ascent.battle.landedEven'), colour: INK_UI_HEX.mutedText, loud: false })
    : battle.wonLast === true
      ? { text: t('ascent.battle.winning'), colour: cssHex(INK_UI.jade), loud: true }
      : adrift
        ? {
          text: stamina.pips > 0
            ? t('ascent.battle.losing') : t('ascent.battle.losingNoPips'),
          colour: cssHex(INK_UI.cinnabar), loud: true,
        }
        : undefined;
  if (writeText(dock.verdict, verdict?.text ?? '', verdict?.colour)) {
    fitLabel(dock.verdict, VERDICT_COLUMN, verdict?.loud ? 10.5 : 9, 8);
  }
  if (verdict && verdict.text !== dock.verdictKey && verdict.loud) {
    self.tweens.add({
      targets: dock.verdict, scale: { from: 1.28, to: 1 }, duration: 260, ease: 'Back.easeOut',
    });
  }
  dock.verdictKey = verdict?.text ?? '';

  // ── the pips ─────────────────────────────────────────────────────────
  const pipsKey = `${stamina.pips}/${stamina.max}@${stamina.nextIn}`;
  if (pipsKey !== dock.pipsKey && dock.pips.active) {
    dock.pipsKey = pipsKey;
    const g = dock.pips;
    const { px, topY } = dock.pipGeom;
    const pipR = 4.4;
    g.clear();
    for (let i = 0; i < stamina.max; i += 1) {
      const py = topY + (stamina.max - 1 - i) * 14;
      g.lineStyle(1.4, INK_UI.brush, 0.9);
      g.strokeCircle(px, py, pipR);
      if (i < stamina.pips) {
        g.fillStyle(INK_UI.brush, 0.92);
        g.fillCircle(px, py, pipR - 0.9);
      } else if (i === stamina.pips && stamina.nextIn > 0) {
        // The pip on its way back: a brush stroke growing round the ring as the clock runs down.
        const done = 1 - stamina.nextIn / Math.max(1, BATTLE_STAMINA_REGEN_BEATS);
        g.lineStyle(2.2, INK_UI.brush, 0.7);
        g.beginPath();
        g.arc(px, py, pipR - 1.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * done, false);
        g.strokePath();
      }
    }
  }

  // ── the stuck-glow on Defend ─────────────────────────────────────────
  // No pip, and standing in a shape they beat: the one lit thing on the strip is the move the
  // whole stamina rule exists to teach. Stamina moves on the beat, so the mark lives here.
  const countered = (battle.reformBeats ?? 0) === 0 && (battle.theirReformBeats ?? 0) === 0
    && formationTier(battle.ourFormation, battle.theirFormation) < 0;
  const wantGlow = Boolean(dock.defendBounds) && !dock.defendChosen
    && stamina.pips === 0 && countered;
  if (wantGlow && !dock.defendGlow && dock.defendBounds) {
    const b = dock.defendBounds;
    const glow = self.add.graphics();
    glow.lineStyle(2.4, INK_UI.jade, 0.95);
    glow.strokeRoundedRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2, 6);
    ui.orders.add(glow);
    self.tweens.add({
      targets: glow, alpha: { from: 1, to: 0.3 }, duration: 650, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });
    dock.defendGlow = glow;
  } else if (!wantGlow && dock.defendGlow) {
    self.tweens.killTweensOf(dock.defendGlow);
    dock.defendGlow.destroy();
    dock.defendGlow = undefined;
  }

  // ── the chips' live readings ─────────────────────────────────────────
  for (const id of FORMATION_RING) {
    const chip = dock.chips[id];
    if (!chip) continue;

    const gone = !chip.held && !chip.walking && !canFormFormation(self.state, id);
    if (gone !== chip.gone) {
      chip.gone = gone;
      chip.tile.setAlpha(gone ? 0.45 : 1);
      // Keep the generated pigments and the same image through stamina changes.
      chip.glyph.setAlpha(gone ? 0.5 : 1);
      writeText(chip.verb, chip.verb.text, gone ? INK_UI_HEX.mutedText : chip.baseVerbColour);
    }

    if (chip.note && chip.walking) {
      const note = t('ascent.battle.reforming', { n: String(battle.reformBeats ?? 0) });
      if (note !== chip.noteKey) {
        chip.noteKey = note;
        chip.note.setFontSize(8);
        chip.note.setText(note);
        for (let size = 8; size >= 6.5 && chip.note.width > chip.bounds.width - 6; size -= 0.5) {
          chip.note.setFontSize(size);
        }
        chip.note.setPosition(
          chip.bounds.x + chip.bounds.width / 2,
          chip.bounds.y + chip.bounds.height - 3 - chip.note.height,
        );
      }
    }

    if (chip.bar && chip.walking) {
      const beats = battle.reformBeats ?? 0;
      if (beats !== chip.barBeats) {
        chip.barBeats = beats;
        const total = Math.max(1, battle.reformTotalBeats ?? (beats || 1));
        const done = Math.max(0, Math.min(1, 1 - beats / total));
        const { x, y, width: w, height: h } = chip.bounds;
        const g = chip.bar;
        // Track first, then fill. A trained host re-forms in a single beat, where the fill is
        // zero wide for the whole of the walk: without the track there would be nothing on the
        // chip at all in the commonest case.
        g.clear();
        g.fillStyle(INK_UI.cinnabar, 0.22);
        g.fillRect(x + 2, y + h - 4, w - 4, 2.5);
        g.fillStyle(INK_UI.cinnabar, 0.95);
        g.fillRect(x + 2, y + h - 4, (w - 4) * done, 2.5);
      }
    }

    // The beat the men actually stood up in it. Two beats, then it stops mattering. Drawn on the
    // modal layer — the dock stands still now, but the mark must survive even the structural
    // rebuild the landing itself causes.
    if (chip.held && battle.landedBeat !== undefined && beatNow - battle.landedBeat <= 1
      && battle.landedBeat !== dock.lastFlareBeat) {
      dock.lastFlareBeat = battle.landedBeat;
      const { x, y, width: w, height: h } = chip.bounds;
      const flare = self.add.graphics();
      flare.lineStyle(2, battle.landedCountered ? INK_UI.jade : INK_UI.gold, 0.95);
      flare.strokeRoundedRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 7);
      flare.setPosition(x + w / 2, y + h / 2);
      self.modalLayer.add(flare);
      self.tweens.add({
        targets: flare, alpha: { from: 1, to: 0 }, duration: 520, ease: 'Quad.easeOut',
        onComplete: () => flare.destroy(),
      });
    }
  }
}

/**
 * The mark a formation order leaves behind it.
 *
 * **The press had nowhere to land.** Ordering a shape changes `battleOrderSignature`, which tears
 * the whole strip down and builds it again on the same frame — so any release animation on the
 * chip was destroyed a millisecond after it started, and the only thing the player saw was the
 * dip ending. That is why the tap felt like nothing: the game answered, and then deleted the
 * answer.
 *
 * So the answer is drawn somewhere the rebuild cannot reach. A seal punching outward off the
 * chip's own outline, in sỏi son, with six flecks thrown clear of it — the print's own idea of a
 * stamp coming down — parented to `modalLayer` rather than to the dock, and gone in 340 ms.
 *
 * It does not replace the marks already on the rebuilt chip. Those say three different later
 * things: the seal says the order was *issued*, the bar says how much of the walk is left, the
 * flare says it *arrived*. This one is the only one that says *you just pressed that*.
 */
/**
 * One pip leaves the meter and lands in the chip that was ordered.
 *
 * This is the single most important animation on the screen: it is where "why did that chip
 * grey out?" becomes "I just watched myself pay." The same ink dot the meter is drawn from, on
 * the modal layer so it outlives the strip's rebuild, gone on landing.
 */
function spendPipInto(self: ConquestUIScene, bounds: UIBounds): void {
  const from = self.battleUi?.staminaAt;
  if (!from) return;
  const dot = self.add.graphics();
  dot.fillStyle(INK_UI.brush, 0.95);
  dot.fillCircle(0, 0, 4);
  dot.setPosition(from.x, from.y);
  self.modalLayer.add(dot);
  self.tweens.add({
    targets: dot,
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    scale: { from: 1, to: 0.4 },
    alpha: { from: 1, to: 0.2 },
    duration: 380,
    ease: 'Quad.easeIn',
    onComplete: () => dot.destroy(),
  });
}

/**
 * The line answers the wager: every column of ours leans a step toward the enemy and settles
 * back. One-shot and shorter than a beat, so `slideMarkers`' per-beat tween kill never catches
 * it mid-flight and the line's true position is never contested.
 */
function surgeCommittedLine(self: ConquestUIScene): void {
  const ui = self.battleUi;
  if (!ui) return;
  for (const entry of ui.ourMarkers) {
    if (!entry.marker?.active || entry.routed) continue;
    self.tweens.add({
      targets: entry.marker, x: entry.marker.x + 6, duration: 160,
      yoyo: true, ease: 'Quad.easeOut',
    });
  }
}

/** Nothing to spend: the pips flash red and the chip shivers. */
function refuseForStamina(self: ConquestUIScene, tile: Phaser.GameObjects.Components.Transform & { alpha?: number }): void {
  const pips = self.battleUi?.staminaPips;
  if (pips?.active) {
    const flash = self.add.graphics();
    const at = self.battleUi?.staminaAt;
    if (at) {
      flash.lineStyle(2, INK_UI.cinnabar, 0.95);
      flash.strokeCircle(at.x, at.y, 7);
      flash.strokeCircle(at.x, at.y + 14, 7);
      self.modalLayer.add(flash);
      self.tweens.add({
        targets: flash, alpha: { from: 1, to: 0 }, duration: 420, ease: 'Quad.easeOut',
        onComplete: () => flash.destroy(),
      });
    }
  }
  const x0 = tile.x;
  self.tweens.add({
    targets: tile, x: x0 + 3, duration: 40, yoyo: true, repeat: 3, ease: 'Linear',
    onComplete: () => { tile.x = x0; },
  });
}

export function stampFormationChip(self: ConquestUIScene, bounds: UIBounds): void {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;

  const ring = self.add.graphics();
  ring.lineStyle(2.4, INK_UI.cinnabar, 0.95);
  ring.strokeRoundedRect(
    -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, 7,
  );
  ring.setPosition(cx, cy);
  self.modalLayer.add(ring);
  self.tweens.add({
    targets: ring,
    scale: { from: 0.96, to: 1.24 },
    alpha: { from: 0.95, to: 0 },
    duration: 340,
    ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });

  // Thrown from the corners rather than fanned evenly: an even ring of dots reads as a loading
  // spinner, and this is a stamp coming down.
  const flecks = self.add.graphics();
  flecks.fillStyle(INK_UI.cinnabar, 0.9);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.5;
    flecks.fillCircle(
      Math.cos(angle) * bounds.width * 0.42,
      Math.sin(angle) * bounds.height * 0.46,
      1.9,
    );
  }
  flecks.setPosition(cx, cy);
  self.modalLayer.add(flecks);
  self.tweens.add({
    targets: flecks,
    scale: { from: 0.55, to: 1.55 },
    alpha: { from: 1, to: 0 },
    duration: 380,
    ease: 'Quad.easeOut',
    onComplete: () => flecks.destroy(),
  });
}

/**
 * The readout band: three retained labels the beat writes into.
 *
 * The three readings a player actually needs, in the band the two strip labels used to occupy —
 * what the last exchange cost, whether the arms favour us, and the one-slot verdict on the
 * right. Built empty here; `drawBattleDock` fills them, because every one of them moves on the
 * beat and none of them should cost a rebuild.
 */
function buildBattleReadout(self: ConquestUIScene, battle: AscentBattle, y: number): void {
  const ui = self.battleUi;
  const dock = ui?.dock;
  if (!ui || !dock) return;
  const { content, orders } = ui;

  dock.price = self.ui.label(content.x + 2, y, '', 'label', {
    fontSize: '10.5px',
    color: INK_UI_HEX.mutedText,
  });
  orders.add(dock.price);

  dock.arms = self.ui.label(content.x + 2, y + 13, '', 'caption', {
    fontSize: '9px',
    color: '#4c5f45',
  });
  orders.add(dock.arms);

  dock.verdict = self.ui.label(
    content.x + content.width - 2, y + 1, '', 'caption',
    { fontSize: '9px', color: INK_UI_HEX.mutedText },
  ).setOrigin(1, 0);
  orders.add(dock.verdict);

  // The ground's edge, under the verdict, in the verdict's own column — moved here out of the
  // seven unowned points between the rails band and this one, where it printed through the price
  // line. Static for the whole fight, so it is written once here rather than on the beat, and it
  // is fitted to `VERDICT_COLUMN` like everything else on this row: `Địa lợi nghiêng về ta ×1.30`
  // is 26 characters and the column is 118 wide.
  if (battle.terrainEdge > 1.01) {
    const terrain = self.ui.label(
      content.x + content.width - 2, y + 12,
      t('ascent.battle.terrain', { mult: battle.terrainEdge.toFixed(2) }), 'caption',
      { fontSize: '9px', color: cssHex(INK_UI.jade) },
    ).setOrigin(1, 0);
    fitLabel(terrain, VERDICT_COLUMN, 9, 7);
    orders.add(terrain);
  }
}

/** The right-hand column the verdict owns; the price and arms lines stop short of it. */
const VERDICT_COLUMN = 118;

/**
 * One line, shrunk to fit its column - never wrapped, never printed over its neighbour. The
 * readout band holds two Vietnamese sentences and a verdict on 350 design px, and at their
 * longest they used to meet in the middle.
 */
function fitLabel(label: Phaser.GameObjects.Text, maxWidth: number, base: number, floor: number): void {
  label.setFontSize(`${base}px`);
  let size = base;
  while (label.width > maxWidth && size > floor) {
    size -= 0.5;
    label.setFontSize(`${size}px`);
  }
}
