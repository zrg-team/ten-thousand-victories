import Phaser from 'phaser';
import { uiColumnX } from '../../game/constants';
import { reducedMotion } from '../../game/lifeSettings';
import type { MenuScene } from '../MenuScene';

/**
 * The phone's opening beat: the name comes up from behind the karst and settles over the range.
 *
 * **Behind the mountains, not in front of them.** The rising copy goes into the illustration's own
 * container immediately before the mountain plate, so the peaks cover it and the letters show
 * through the sky between them. Scene depth cannot do that: the plates are children of one
 * container at -8, and nothing outside it can be sorted between two of its children.
 *
 * **Why a copy, and why it is cropped.** Below the range the ground plate is transparent sky down
 * to its far bank (measured: alpha 0 above source row 448 of 1024) and the wordmark would print on
 * the valley. The mountain plate is solid across its full width from row ~384 to ~448, so the copy
 * is cropped at `RANGE_SOLID_ROW`: nothing below that line is drawn, and the crop edge itself is
 * always under solid pigment. The real title stays at depth 0, invisible until the copy lands on
 * its exact spot, then the copy goes and the real one takes over the same pixels.
 *
 * **The veils.** The điệp band the title stands on (`menuTitleVeil`, depth -5) would wash a title
 * inside the container to 60% as it came up, and then the handoff would snap it back to full ink.
 * So the band is lifted for the rise and eased back in after the handoff, when it only touches the
 * tips of the peaks. The plate's top feather (`menuPlateTopFeather`) is lifted with it: it sits
 * over bare paper everywhere except over the rising name, whose lower half it faded out.
 *
 * Once per launch, like the desktop scroll opening: returning from a page or a run must not replay
 * it. Skipped under reduced motion, on the desktop sheet, and on themes with no painted range.
 */
let risenThisLaunch = false;
let active: { scene: MenuScene; finish: () => void } | undefined;

/** Source row of the mountain plate inside its solid band; see above. */
const RANGE_SOLID_ROW = 420 / 1024;
/**
 * Where the title's top starts. At the solid band the first 20% of the rise showed nothing at all:
 * the lowest saddles open around row 300, and the wordmark carries 11% of white above its ink.
 */
const START_ROW = 330 / 1024;
const RISE_DELAY_MS = 320;
const RISE_MS = 2000;
const SUBTITLE_MS = 520;
const VEIL_RETURN_MS = 700;

/** Source row of the range's highest tip (first alpha > 128 in menu-layer-mountains-v3, col 485). */
const PEAK_ROW = 59 / 1024;

function paintedRange(self: MenuScene): { artwork: Phaser.GameObjects.Container; mountains: Phaser.GameObjects.Image } | undefined {
  const artwork = self.children.list.find((child) => child.getData?.('menuLandscapeRole') === 'illustration') as
    Phaser.GameObjects.Container | undefined;
  const mountains = artwork?.list.find((child) => (child as Phaser.GameObjects.GameObject)
    .getData?.('menuArtworkLayer') === 'mountains') as Phaser.GameObjects.Image | undefined;
  return artwork && mountains ? { artwork, mountains } : undefined;
}

/** Sheet y of the highest peak, for sizing the masthead above it; undefined without a painted range. */
export function rangePeakY(self: MenuScene): number | undefined {
  const range = paintedRange(self);
  if (!range || uiColumnX() > 0) return undefined;
  return range.mountains.y - range.mountains.displayHeight / 2 + range.mountains.displayHeight * PEAK_ROW;
}

/** Lands the title immediately. A redraw mid-rise must not leave a second title in the range. */
export function finishTitleRise(self: MenuScene): void {
  if (active?.scene === self) active.finish();
}

export function riseTitle(
  self: MenuScene,
  title: Phaser.GameObjects.Image,
  subtitle: Phaser.GameObjects.Text,
): void {
  if (risenThisLaunch) return;
  risenThisLaunch = true;
  if (reducedMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // The pinned phone column on a desktop window scales the illustration to the whole sheet
  // (`fitIllustrationToSheet`), and the copy's coordinates are the column's.
  if (uiColumnX() > 0) return;
  const range = paintedRange(self);
  if (!range) return;
  const { artwork, mountains } = range;

  const veil = self.children.list.find((child) => child.getData?.('menuTitleVeil')) as
    Phaser.GameObjects.Graphics | undefined;
  const topFeather = artwork.list.find((child) => (child as Phaser.GameObjects.GameObject)
    .getData?.('menuPlateTopFeather')) as Phaser.GameObjects.Graphics | undefined;
  const restY = title.y;
  const restWidth = title.displayWidth;
  const restHeight = title.displayHeight;
  const plateTop = mountains.y - mountains.displayHeight / 2;
  const horizon = plateTop + mountains.displayHeight * RANGE_SOLID_ROW;
  // Hidden at the start, so the first ink is the tops of the letters clearing the lowest saddle,
  // not a word appearing out of nothing. The 0.92 is the bloom's starting scale, below.
  const startY = plateTop + mountains.displayHeight * START_ROW + restHeight * 0.92 / 2;
  const subtitleY = subtitle.y;
  const subtitleAlpha = subtitle.alpha;

  const copy = self.add.image(title.x, startY, title.texture.key)
    .setBlendMode(title.blendMode)
    .setDisplaySize(restWidth, restHeight)
    .setData('menuTitleRise', true);
  artwork.addAt(copy, artwork.getIndex(mountains));
  title.setAlpha(0);
  subtitle.setAlpha(0).setY(subtitleY + 8);
  veil?.setAlpha(0);
  topFeather?.setAlpha(0);

  const progress = { value: 0 };
  let done = false;
  let subtitleShown = false;
  const tweens: Phaser.Tweens.Tween[] = [];
  const showSubtitle = (delay: number) => {
    if (subtitleShown) return;
    subtitleShown = true;
    tweens.push(self.tweens.add({
      targets: subtitle, alpha: subtitleAlpha, y: subtitleY, delay, duration: SUBTITLE_MS, ease: 'Quad.easeOut',
    }));
  };
  const draw = () => {
    const at = progress.value;
    // A slow bloom as it climbs: 92% at the ridge, full size at rest. Larger than that and the
    // word visibly swells after it has cleared the peaks, which reads as a zoom, not a rise.
    const scale = 0.92 + 0.08 * at;
    const width = restWidth * scale;
    const height = restHeight * scale;
    const y = Phaser.Math.Linear(startY, restY, at);
    copy.setDisplaySize(width, height).setY(y);
    const shown = Phaser.Math.Clamp((horizon - (y - height / 2)) / height, 0, 1);
    copy.setCrop(0, 0, copy.width, Math.ceil(copy.height * shown));
    // The tagline comes in while the name is still settling, not after it has stopped — but only
    // in the last few units of travel: at 0.82 of the eased distance the name was still 45 units
    // low and the tagline printed across its letters.
    if (at > 0.97) showSubtitle(0);
  };
  /** `landed` is the rise running to its end; anything else is a redraw or a scene change. */
  const finish = (landed = false) => {
    if (!active || active.scene !== self || done) return;
    done = true;
    active = undefined;
    self.events.off(Phaser.Scenes.Events.SHUTDOWN, interrupt);
    if (!landed) {
      for (const tween of tweens) tween.remove();
      if (subtitle.scene) subtitle.setAlpha(subtitleAlpha).setY(subtitleY);
    }
    if (copy.scene) copy.destroy();
    if (title.scene) title.setAlpha(1);
    // Paper on paper once the name has left it, so it comes straight back.
    if (topFeather?.scene) topFeather.setAlpha(1);
    if (veil?.scene) {
      if (self.scene.isActive()) {
        self.tweens.add({ targets: veil, alpha: 1, duration: VEIL_RETURN_MS, ease: 'Sine.easeInOut' });
      } else veil.setAlpha(1);
    }
  };
  // Not `finish` itself: the event passes the scene's systems, which would read as `landed`.
  const interrupt = () => finish(false);
  active = { scene: self, finish: interrupt };
  self.events.once(Phaser.Scenes.Events.SHUTDOWN, interrupt);
  draw();
  tweens.push(self.tweens.add({
    targets: progress,
    value: 1,
    delay: RISE_DELAY_MS,
    duration: RISE_MS,
    // Slow out of the range, a glide, and a soft settle. An ease-out was tried first and spent the
    // one moment worth watching — the letters coming through the saddles — in its first 200ms.
    ease: 'Sine.easeInOut',
    onUpdate: draw,
    // Landed: the subtitle's own tween is still running and is left to finish.
    onComplete: () => finish(true),
  }));
}
