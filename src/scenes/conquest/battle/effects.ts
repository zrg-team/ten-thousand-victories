import { addConquestUiIcon } from '../../../ui/conquestUiIcons';
/**
 * Everything transient over the Dragon Ascent fight: the arrow volleys, the casualty numbers rising
 * off the seam, and the clash mark where the two lines touch. None of them is the fight — each is a
 * reading of one beat, drawn and thrown away, which is what puts them in one file.
 *
 * Two clocks run here. Volleys and floaters are tied to `BATTLE_TICK_MS`, one shot a beat, and clear
 * up after themselves; the clash burst breathes on its own 640 ms `repeat: -1`, which is what keeps
 * the mark alive between beats and why the burst, the blades and the ring are three objects.
 *
 * Volleys and floaters parent into `ui.floaters`, not `ui.field`, so a field rebuild cannot take an
 * arrow out of the air mid-tween — hence the `active` check before every draw. The clash mark is
 * built here but owned by `rails.ts`, which parents it, moves it and drops it.
 */
import Phaser from 'phaser';
import { BATTLE_TICK_MS } from '../../../game/ascentConfig';
import { INK_UI, INK_UI_HEX } from '../../../ui/InkUI';
import { type BattleFormation } from '../../../data/ascent/formations';
import { mulberry32 } from '../../../ui/ink/stroke';
import type { BattleBeat } from '../../../state/types';
import { cssHex } from '../constants';
import { battleLines } from './geometry';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * The arrows, as a picture of the exchange rather than a number.
 *
 * Each side's archers loose a volley every beat they are not walking, and the volley's density
 * is the tell: a host in Thế Nỏ rains nearly three times the arrows of the same bows in any
 * other shape, so the reading "they have gone to the volley" is on the field before — and on
 * the hardest setting, instead of — any bubble saying so. One Graphics per volley, redrawn
 * along one tween, so thirty arrows cost one object and one callback rather than thirty of
 * each; destroyed on landing.
 */
export function spawnBattleArrows(self: ConquestUIScene, beat: BattleBeat): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { groundY } = ui.geometry;
  const { ourX, theirX } = battleLines(self, beat.ourAdvance, beat.theirAdvance);
  const volley = (
    from: number, to: number, bows: number, shape: BattleFormation | undefined, seed: number,
    colour: number,
  ): void => {
    if (!shape || bows < 0.04) return;
    const count = Math.min(36, Math.round((2 + 11 * bows) * (shape === 'no' ? 2.8 : 1)));
    if (count <= 0) return;
    const rand = mulberry32(seed);
    const arrows = Array.from({ length: count }, () => ({
      sx: from + (rand() - 0.5) * 46,
      sy: groundY - 26 - rand() * 22,
      tx: to + (rand() - 0.5) * 54,
      ty: groundY - 4 - rand() * 18,
      arc: 58 + rand() * 40,
      lag: rand() * 0.25,
    }));
    const g = self.add.graphics();
    ui.floaters.add(g);
    const draw = (t: number): void => {
      // The field can be torn down under a volley still in the air; a destroyed Graphics has
      // no renderer to clear into.
      if (!g.active) return;
      g.clear();
      g.lineStyle(1.4, colour, 0.9);
      for (const a of arrows) {
        const p = Math.max(0, Math.min(1, (t - a.lag) / (1 - a.lag)));
        if (p <= 0 || p >= 1) continue;
        const x = a.sx + (a.tx - a.sx) * p;
        const lift = Math.sin(Math.PI * p) * a.arc;
        const y = a.sy + (a.ty - a.sy) * p - lift;
        // Tangent of the arc, so the shaft points where it is going.
        const dx = (a.tx - a.sx) * 0.02;
        const dy = (a.ty - a.sy) * 0.02 - Math.cos(Math.PI * p) * Math.PI * a.arc * 0.02;
        const len = Math.hypot(dx, dy) || 1;
        g.lineBetween(x, y, x - (dx / len) * 10, y - (dy / len) * 10);
      }
    };
    const clock = { t: 0 };
    self.tweens.add({
      targets: clock, t: 1, duration: BATTLE_TICK_MS * 0.95, ease: 'Linear',
      onUpdate: () => draw(clock.t),
      onComplete: () => { if (g.active) g.destroy(); },
    });
  };
  const seed = beat.round * 7919 + Math.round(beat.ourNow);
  volley(ourX, theirX, beat.ourBows ?? 0, beat.ourShape, seed, INK_UI.cinnabarDark);
  volley(theirX, ourX, beat.theirBows ?? 0, beat.theirShape, seed + 17, INK_UI.brush);
}

/**
 * Casualty numbers rising off the point of contact.
 *
 * Ours in sỏi son and theirs in ink, deliberately: the palette reserves that red for "your
 * banner, your seal, *your losses*", so the one red thing on the field is what it cost us.
 */
export function spawnBattleFloaters(self: ConquestUIScene, beat: BattleBeat): void {
  const ui = self.battleUi;
  if (!ui) return;
  const { groundY } = ui.geometry;
  const { ourX: ourLine, theirX: theirLine } = battleLines(self, beat.ourAdvance, beat.theirAdvance);

  const pool = (ui.floaterPool ??= []);
  const float = (x: number, value: number, dy: number, colour: string): void => {
    if (value <= 0) return;
    const spare = pool.pop();
    // `setColor` is unguarded in Phaser — it re-rasterises the canvas even for the same colour —
    // and the pool mixes both sides' labels, so only recolour a reused one that actually changed.
    if (spare?.active && spare.style.color !== colour) spare.setColor(colour);
    const label = spare?.active
      ? spare.setText(`−${value}`).setPosition(x, groundY - 44 + dy).setAlpha(1)
        .setVisible(true)
      : self.ui.label(x, groundY - 44 + dy, `−${value}`, 'label', {
        fontSize: '13px', align: 'center', color: colour,
      }).setOrigin(0.5);
    if (!label.parentContainer) ui.floaters.add(label);
    self.tweens.add({
      targets: label,
      y: groundY - 76 + dy,
      alpha: { from: 1, to: 0 },
      duration: BATTLE_TICK_MS * 1.4,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Back on the shelf rather than into the bin. Capped, so a very long siege cannot turn
        // the pool into the leak it was meant to prevent.
        label.setVisible(false);
        if (pool.length < 6) pool.push(label);
        else label.destroy();
      },
    });
  };
  // Outside each block rather than between them: the seam is where the men are, and a number
  // dropped into it lands on the fighting. Staggered too, so the two never collide.
  float(ourLine - 30, beat.ourLoss, -6, cssHex(INK_UI.cinnabar));
  float(theirLine + 30, beat.theirLoss, 10, INK_UI_HEX.inkText);
}

/** Generated crossed weapons over the contact point; burst and rings are animated feedback. */
export function battleClashMark(self: ConquestUIScene): Phaser.GameObjects.Container {
  const container = self.add.container(0, 0);

  // A soft ground first, so the mark has weight over a pale field and over a dark block of men
  // alike. Without it the blades were a thin white scratch on whatever happened to be behind.
  const halo = self.add.graphics();
  halo.fillStyle(INK_UI.cinnabar, 0.16);
  halo.fillCircle(0, 0, 19);
  container.add(halo);

  // Eight rays, alternating long and short, and turned off-axis so the star does not read as a
  // compass. Uneven lengths because a cut mark on a print is never symmetrical.
  const burst = self.add.graphics();
  burst.fillStyle(INK_UI.cinnabar, 0.9);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + 0.26;
    const reach = i % 2 === 0 ? 23 : 14.5;
    burst.fillTriangle(
      Math.cos(angle) * reach, Math.sin(angle) * reach,
      Math.cos(angle + 0.3) * 5.5, Math.sin(angle + 0.3) * 5.5,
      Math.cos(angle - 0.3) * 5.5, Math.sin(angle - 0.3) * 5.5,
    );
  }
  container.add(burst);
  // Never all the way down: the floor of 0.55 is what keeps the mark present between beats. At
  // 0.4 it read as a fault in the paper on the frames it was caught low.
  self.tweens.add({
    targets: burst,
    scale: { from: 0.86, to: 1.16 },
    alpha: { from: 0.95, to: 0.55 },
    angle: { from: -7, to: 7 },
    duration: 640,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  const blades = self.add.container(0, 0, [addConquestUiIcon(self, 'crossed-weapons', 40)]);
  blades.setData('role', 'blades');
  container.add(blades);

  return container;
}

/**
 * One exchange, struck.
 *
 * A ring off the point of contact and a punch through the blades, fired from `reactToBeat` — so
 * the mark moves because the fight moved, not because a timer said so. Both are one-shots that
 * clean themselves up: the ring destroys itself, and the punch lands back on scale 1.
 *
 * Deliberately small. This fires 1.8 times a second for the length of a siege, and anything that
 * reads as an explosion at that rate stops being feedback within about four beats.
 */
export function strikeClash(self: ConquestUIScene): void {
  const mark = self.battleUi?.clashMark;
  if (!mark?.active) return;

  const ring = self.add.graphics();
  ring.lineStyle(2.5, INK_UI.cinnabar, 0.95);
  ring.strokeCircle(0, 0, 14);
  // Over the blades, not behind them. Behind, the burst's own rays swallowed it and the beat had
  // no visible answer at all — the shockwave has to leave the mark to read as one.
  mark.add(ring);
  self.tweens.add({
    targets: ring,
    // Starts outside the burst rather than inside it. The rays reach 23 points, so a ring born at
    // 8 spends the first third of its life invisible and then appears from nowhere.
    scale: { from: 1.25, to: 3.2 },
    alpha: { from: 0.95, to: 0 },
    duration: 460,
    ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });

  const blades = mark.list.find(
    (child) => (child as Phaser.GameObjects.Container).getData?.('role') === 'blades',
  );
  if (!blades) return;
  self.tweens.killTweensOf(blades);
  self.tweens.add({
    targets: blades,
    scale: { from: 1.34, to: 1 },
    angle: { from: -7, to: 0 },
    duration: 280,
    ease: 'Back.easeOut',
  });
}
