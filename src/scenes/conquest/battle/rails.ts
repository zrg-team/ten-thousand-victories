/**
 * The strength-and-heart band under the field — two headcounts, four ink bars, the rout marks, the
 * terrain edge, and the clash mark that rides the seam. `BATTLE_RAILS_HEIGHT` tall.
 *
 * The three functions are one mechanism, and the order matters: `battleRailsSignature` says when
 * the *fight* changed under the band, `buildBattleRails` draws what a beat cannot move,
 * `updateBattleRails` writes what it can — two `setText`s and one `Graphics.clear()`. Rebuilding
 * the lot every beat cost 24.3 ms of a 35.2 ms beat. `drawBattleRails` then runs off the ease
 * tween rather than the beat, so anything added to it is paid for at 60 Hz for 0.85 of a beat.
 */
import Phaser from 'phaser';
import { battleTickMs } from '../../../game/battleOptions';
import { BATTLE_ROUT_MORALE } from '../../../game/ascentConfig';
import { INK_UI } from '../../../ui/InkUI';
import { drawCardIcon, CARD_ICON_SIZE } from '../../../ui/CardIcons';
import { PIGMENT } from '../../../ui/ink/palette';
import { t } from '../../../i18n';
import type { AscentBattle } from '../../../state/types';
import { BATTLE_RAILS_HEIGHT } from '../constants';
import { clearLayer } from '../layers';
import { battleFrame, battleLines, battleRailsSignature } from './geometry';
import type { ConquestUIScene } from '../../ConquestUIScene';


export function buildBattleRails(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { content, readout } = ui;
  const { groundY } = ui.geometry;

  clearLayer(self, readout);
  ui.railsSignature = battleRailsSignature(battle);
  ui.ourStrength = undefined;
  ui.theirStrength = undefined;
  ui.clashMark = undefined;

  // Clash mark, only once they have actually met. Built here rather than on the beat because
  // its pulse is `repeat: -1` — one per fight, not one per exchange.
  if (battle.ourAdvance + battle.theirAdvance >= 1) {
    // High enough to clear the front rank. At 44 it was drawn straight across their heads, which
    // is the one place on the field guaranteed to have something in it.
    const clash = self.battleClashMark();
    clash.setPosition(0, groundY - 56);
    readout.add(clash);
    ui.clashMark = clash;
  }

  const readoutY = content.y + ui.fieldHeight + 8;
  readout.add(self.ui.panel(
    { x: content.x, y: readoutY, width: content.width, height: BATTLE_RAILS_HEIGHT },
    { border: INK_UI.softBrush },
  ));

  const barW = (content.width - 36) / 2;
  ui.railsGeom = { barW, readoutY, ourX: content.x + 12, theirX: content.x + barW + 24 };

  // The name is trimmed to what is left beside the *widest* number this fight can print, not
  // beside this beat's number. A rival is named by the generator and can be as long as "Lanh
  // Chua Phuong Bac", which ran straight through its own four-digit strength and printed
  // "Phuong Ba1493"; measuring against the opening strength keeps the fit honest and lets the
  // trim happen once instead of on every exchange.
  const rail = (x: number, widest: number, label: string, keep = ''): Phaser.GameObjects.Text => {
    const gauge = self.ui.label(0, -999, `${widest}`, 'label', { fontSize: '15px' });
    const room = barW - gauge.width - 6;
    gauge.destroy();

    // `keep` survives any truncation — the commander's temper is the one word on this rail the
    // player is meant to plan around, and the ellipsis was eating it before the name.
    const name = self.ui.label(x, readoutY + 6, `${label}${keep}`, 'caption', {});
    if (name.width > room) {
      let cut = label;
      while (cut.length > 1 && name.width > room) {
        cut = cut.slice(0, -1);
        name.setText(`${cut.trimEnd()}…${keep}`);
      }
    }
    readout.add(name);

    // The rout line, drawn on the heart bar rather than left implicit: "wavering" was a state
    // the simulation knew about and the screen never showed, so a line one exchange from
    // breaking looked exactly like one at half heart.
    const routMark = self.add.graphics();
    routMark.fillStyle(INK_UI.cinnabarDark, 0.9);
    routMark.fillRect(x + 16 + (barW - 16) * (BATTLE_ROUT_MORALE / 100) - 1, readoutY + 40, 1.5, 9);
    readout.add(routMark);

    const strength = self.ui.label(x + barW, readoutY + 6, `${widest}`, 'label', {
      fontSize: '15px', align: 'right',
    }).setOrigin(1, 0);
    readout.add(strength);
    return strength;
  };
  ui.ourStrength = rail(ui.railsGeom.ourX, battle.ourStart, t('ascent.battle.ours'));
  // The commander's temper rides beside his name, because a personality the player cannot see
  // is just weather. One word — hasty, measured, stubborn, cunning — and the fight it predicts
  // is the fight he actually gives; see BATTLE_TEMPER.
  ui.theirStrength = rail(
    ui.railsGeom.theirX, battle.theirStart, battle.kingdomName,
    battle.commanderTemper
      ? ` · ${t(`ascent.temper.${battle.commanderTemper}` as Parameters<typeof t>[0])}`
      : '',
  );

  // The same two pictograms on each side label what the bars measure.
  for (const x of [ui.railsGeom.ourX, ui.railsGeom.theirX]) {
    readout.add(drawCardIcon(self, 'person', PIGMENT.muc).setPosition(x + 5, readoutY + 31).setScale(14 / CARD_ICON_SIZE));
    readout.add(drawCardIcon(self, 'heart', PIGMENT.nau).setPosition(x + 5, readoutY + 44).setScale(12 / CARD_ICON_SIZE));
  }

  // One graphics for all four measured lines, cleared and re-inked on the beat. Four containers
  // a beat was the single most expensive thing on this screen.
  const bars = self.add.graphics();
  readout.add(bars);
  ui.railsBars = bars;

  /**
   * The two loose lines that used to hang under the rails are gone, and both went somewhere the
   * player was already looking.
   *
   * The telegraph — *Lãnh Chúa Phương Bắc commits to nothing next beat* — is the header's notice
   * now, the one place on this screen reserved for the sentence that matters right this beat. The
   * arms verdict is in the readout band beside the dials, with the other reading about the order
   * last given. Between them they were a third and fourth red line on a screen that already had
   * two, floating in the gap between the rails and the dock and belonging to neither.
   *
   * The opening hold went the same way. It was printed across the sky over the battlefield, which
   * is a beautiful place for a sentence and a poor one for an instruction: the strip it was
   * telling the player to touch is at the other end of the screen, and the pulsing frame round
   * that strip was already doing the pointing.
   */

  /**
   * The ground's edge is **not** drawn here any more — it is the readout band's right column,
   * under the verdict (`buildBattleReadout`).
   *
   * It used to hang centred at `readoutY + BATTLE_RAILS_HEIGHT + 3`, in the gap between this band
   * and the dock. There is no gap: `dockY` is `readoutY + 66` and a 10px line starting at
   * `readoutY + 59` runs to 72, so the edge printed straight through the price line — user
   * report with a screenshot of `Địa lợi nghiêng về ta ×1.30` inked over
   * `−3 quân mỗi nhịp`. Nothing owned the seven points between the two bands, which is why
   * nothing ever measured them.
   */
}

/**
 * The two numbers and the four bars - everything a beat actually moves.
 *
 * Two `setText`s and one `Graphics.clear()` plus four flat pigment bars. Their contours and
 * icon labels keep the remaining amount readable without rebuilding objects each beat.
 */
export function updateBattleRails(self: ConquestUIScene, battle: AscentBattle): void {
  const ui = self.battleUi;
  if (!ui?.railsBars?.active || !ui.railsGeom) return;
  const frame = battleFrame(self, battle);
  if (ui.clashMark?.active) {
    ui.clashMark.x = battleLines(self, frame.ourAdvance, frame.theirAdvance).seam;
  }

  // Ease from what is drawn to what the beat says, over one beat. The first reading lands at
  // once — there is nothing to ease from — and a refresh that changes nothing is free.
  const target = {
    ourNow: frame.ourNow, theirNow: frame.theirNow,
    ourMorale: frame.ourMorale, theirMorale: frame.theirMorale,
  };
  if (!ui.railsEased) {
    ui.railsEased = { ...target };
    drawBattleRails(self, battle, ui.railsEased);
    return;
  }
  const eased = ui.railsEased;
  const same = (Object.keys(target) as Array<keyof typeof target>)
    .every((key) => Math.abs(eased[key] - target[key]) < 0.5);
  if (same) { drawBattleRails(self, battle, eased); return; }
  ui.railsTween?.stop();
  // One counter driving all four values in a single onUpdate. A four-property tween dispatches
  // its onUpdate once per property per frame, so the whole band was re-inked up to four times a
  // frame for the length of the ease — measured at 2.4 redraws per frame across a fight.
  const from = { ...eased };
  ui.railsTween = self.tweens.addCounter({
    from: 0, to: 1,
    duration: Math.round(battleTickMs() * 0.85), ease: 'Sine.easeOut',
    onUpdate: (tween) => {
      const k = tween.getValue() ?? 1;
      for (const key of Object.keys(target) as Array<keyof typeof target>) {
        eased[key] = from[key] + (target[key] - from[key]) * k;
      }
      if (ui.railsBars?.active) drawBattleRails(self, battle, eased);
    },
  });
}

/** The rails at one reading — the eased one, not the beat's. */
function drawBattleRails(self: ConquestUIScene,
  battle: AscentBattle,
  frame: { ourNow: number; theirNow: number; ourMorale: number; theirMorale: number },
): void {
  const ui = self.battleUi;
  if (!ui?.railsBars?.active || !ui.railsGeom) return;
  const { barW, readoutY, ourX, theirX } = ui.railsGeom;

  ui.ourStrength?.setText(`${Math.round(frame.ourNow)}`);
  ui.theirStrength?.setText(`${Math.round(frame.theirNow)}`);

  const g = ui.railsBars;
  g.clear();
  const bar = (x: number, y: number, height: number, ratio: number, colour: number): void => {
    const start = x + 16;
    const width = barW - 16;
    g.fillStyle(PIGMENT.diepLo, 1).fillRect(start, y, width, height);
    g.fillStyle(colour, 1).fillRect(start, y, width * Phaser.Math.Clamp(ratio, 0, 1), height);
    g.lineStyle(0.7, PIGMENT.mucSoft, 0.7).strokeRect(start, y, width, height);
  };
  const heartColour = (value: number): number => (
    value <= BATTLE_ROUT_MORALE + 10 ? INK_UI.cinnabar : INK_UI.gold);
  bar(ourX, readoutY + 28, 8, frame.ourNow / Math.max(1, battle.ourStart), PIGMENT.son);
  bar(theirX, readoutY + 28, 8, frame.theirNow / Math.max(1, battle.theirStart), PIGMENT.cham);
  bar(ourX, readoutY + 42, 5, frame.ourMorale / 100, heartColour(frame.ourMorale));
  bar(theirX, readoutY + 42, 5, frame.theirMorale / 100, heartColour(frame.theirMorale));
}
