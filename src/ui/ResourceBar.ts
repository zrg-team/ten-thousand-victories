import Phaser from 'phaser';
import { writeText } from './textWrite';
import { GAME_WIDTH, HEADER_HEIGHT } from '../game/constants';
import type { GameState, ResourceKey } from '../state/types';
import { compactNumber } from '../utils/format';
import { realmPopulationCapacity } from '../systems/ResourceSystem';
import { seasonLabel, t } from '../i18n';
import { InkUI, INK_UI, INK_UI_HEX } from './InkUI';
import { RESOURCE_ICONS } from './theme';
import { sawtoothBand } from './ink/devices';
import { PIGMENT } from './ink/palette';
import { placeStamp, stampDesign } from './ink/stamp';

const RESOURCE_ORDER: ResourceKey[] = ['food', 'supplies', 'gold', 'humans'];
const ICON_DISPLAY_SIZE = 15;

/**
 * The strip's vertical rhythm. The two răng cưa bands frame it, so the type has to clear them
 * rather than share their rows — which is what it was doing in Vietnamese, where the title's
 * diacritics sit higher than any Latin cap.
 */
/** The frieze's rows, exported so the desktop's top bar can run the same teeth across its width. */
export const TOP_BAND_Y = 3;
export const BAND_HEIGHT = 4;
export const TITLE_Y = 10;
/** Centre line of the resource row. */
export const ROW_Y = 36;
export const BOTTOM_BAND_Y = HEADER_HEIGHT - 7;

/**
 * Where the two friezes sit, exported so a driver can assert the type clears them. A band drawn
 * into a `Graphics` has no bounds to read, and this is precisely the collision that shipped.
 */
export const HEADER_BANDS = {
  top: { y: TOP_BAND_Y, height: BAND_HEIGHT },
  bottom: { y: BOTTOM_BAND_Y, height: BAND_HEIGHT },
};

/**
 * Stores whose exhaustion actively hurts — `collectPlayerIncome` docks army morale and supply
 * every tick either of these hits zero, and food additionally puts population into decline.
 * Gold and people running low are setbacks; these two are a countdown.
 */
const CRITICAL_RESOURCES: ResourceKey[] = ['food', 'supplies'];
/** Seasons of buffer at the current burn below which the strip escalates. */
const WARNING_SEASONS = 10;
const CRISIS_SEASONS = 3;

export class ResourceBar extends Phaser.GameObjects.Container {
  private seasonText: Phaser.GameObjects.Text;
  private resourceTexts: Record<ResourceKey, Phaser.GameObjects.Text>;
  private resourceIcons!: Record<ResourceKey, Phaser.GameObjects.Image>;
  /** Filled plate behind a store that is running out, so the crisis reads at a glance. */
  private alertChips: Record<ResourceKey, Phaser.GameObjects.Rectangle>;

  /**
   * The strip's own plate and frieze. On the desktop the top bar draws both across its whole width
   * instead (`conquest/shell.ts`), and these come off — a frieze that stopped at the strip's edge
   * read as cut off, and once the bar's frieze ran the whole width, the strip's plate, drawn over
   * it, hid the teeth over the strip and nowhere else: a bar with a frieze on one half of it.
   */
  private band!: Phaser.GameObjects.GameObject;
  private back!: Phaser.GameObjects.Rectangle;

  setPlateVisible(visible: boolean): void {
    (this.band as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
    this.back.setVisible(visible);
  }

  constructor(scene: Phaser.Scene, private readonly gameState: GameState) {
    super(scene, 0, 0);
    this.setDepth(80);
    const ui = new InkUI(scene);

    const back = scene.add.rectangle(0, 0, GAME_WIDTH, HEADER_HEIGHT, INK_UI.backgroundInk, 0.97).setOrigin(0, 0);
    this.back = back;
    this.add(back);

    // Đông Sơn bronze — the narrator's register, kept distinct from the world's. The răng cưa
    // sawtooth is the drum band that still reads at seven pixels tall; a meander at this size
    // renders as the letter P repeated across the screen.
    // Baked: the frieze is ~200 sawteeth that never change, and as a live Graphics they were
    // re-tessellated every frame the header stood on screen — which is every frame of the game.
    const bandStamp = stampDesign(scene, `ui:band:header:${GAME_WIDTH}x${HEADER_HEIGHT}`,
      { left: 0, right: GAME_WIDTH, top: 0, bottom: HEADER_HEIGHT + 1 },
      (g, x, y) => {
        g.translateCanvas(x, y);
        sawtoothBand(g, 8, TOP_BAND_Y, GAME_WIDTH - 16, BAND_HEIGHT, 0.45);
        sawtoothBand(g, 8, BOTTOM_BAND_Y, GAME_WIDTH - 16, BAND_HEIGHT, 0.4);
        g.lineStyle(1, PIGMENT.mucSoft, 0.35);
        g.lineBetween(0, HEADER_HEIGHT - 0.5, GAME_WIDTH, HEADER_HEIGHT - 0.5);
        g.translateCanvas(-x, -y);
      }, { pool: 'ui' });
    this.band = placeStamp(scene, bandStamp, 0, 0);
    this.add(this.band);

    this.seasonText = ui.label(12, TITLE_Y, '', 'title', { color: INK_UI_HEX.inkText, fontSize: '15px' });
    this.add(this.seasonText);

    const itemWidth = (GAME_WIDTH - 24) / RESOURCE_ORDER.length;
    this.resourceTexts = {} as Record<ResourceKey, Phaser.GameObjects.Text>;
    this.alertChips = {} as Record<ResourceKey, Phaser.GameObjects.Rectangle>;
    this.resourceIcons = {} as Record<ResourceKey, Phaser.GameObjects.Image>;
    RESOURCE_ORDER.forEach((resource, index) => {
      const x = 12 + index * itemWidth;
      // Added before the icon and text so it always sits behind them.
      const chip = scene.add
        .rectangle(x - 4, ROW_Y, itemWidth - 6, 17, INK_UI.cinnabar, 0.9)
        .setOrigin(0, 0.5)
        .setVisible(false);
      const icon = scene.add
        .image(x, ROW_Y, RESOURCE_ICONS[resource].key)
        .setOrigin(0, 0.5)
        .setDisplaySize(ICON_DISPLAY_SIZE, ICON_DISPLAY_SIZE);
      const text = ui.label(x + ICON_DISPLAY_SIZE + 4, ROW_Y, '', 'subtitle', {
        fontSize: '12px',
      }).setOrigin(0, 0.5);
      this.resourceTexts[resource] = text;
      this.alertChips[resource] = chip;
      this.resourceIcons[resource] = icon;
      this.add([chip, icon, text]);
    });

    scene.add.existing(this);
    this.refresh();
  }

  /**
   * Seasons of buffer left at the current burn, or `Infinity` while a store is filling.
   */
  private runway(resource: ResourceKey): number {
    const rate = this.gameState.resourceRates[resource];
    if (rate >= 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, this.gameState.resources[resource]) / Math.max(1, -rate);
  }

  /**
   * Packs the four stores into the strip after their values are known.
   *
   * The slots used to be a quarter of the width each, decided before anybody knew what would go in
   * them. A realm holding 29.1k gold writes "29.1k (+522)" and runs straight through the icon of
   * the store beside it — the numbers collide exactly when the run is going well enough to care
   * about them. Measuring first and packing by flow cannot collide; if the four still will not fit
   * the type steps down until they do.
   */
  private reflow(): void {
    const available = GAME_WIDTH - 24;
    for (const size of ['12px', '11px', '10px', '9px']) {
      let total = 0;
      for (const resource of RESOURCE_ORDER) {
        const text = this.resourceTexts[resource];
        if (text.style.fontSize !== size) {
          text.setFontSize(size);
        }
        total += ICON_DISPLAY_SIZE + 4 + text.width;
      }
      const gap = (available - total) / (RESOURCE_ORDER.length - 1);
      if (gap < 6 && size !== '9px') {
        continue;
      }
      let x = 12;
      for (const resource of RESOURCE_ORDER) {
        const text = this.resourceTexts[resource];
        const width = ICON_DISPLAY_SIZE + 4 + text.width;
        this.resourceIcons[resource].setPosition(x, ROW_Y);
        text.setPosition(x + ICON_DISPLAY_SIZE + 4, ROW_Y);
        this.alertChips[resource].setPosition(x - 4, ROW_Y).setSize(width + 6, 17);
        x += width + Math.max(6, gap);
      }
      return;
    }
  }

  /**
   * Where one store sits on the strip, in design units.
   *
   * Exported for the coach, which highlights the four stores one at a time and cannot guess at
   * them: `reflow` packs the row by *measured* width, so a realm holding 29.1k gold puts the
   * people icon somewhere quite different from a realm holding 300. The alert chip is the right
   * rectangle to read because it is already sized to the icon and its number together — it is what
   * the strip itself lights up when a store is running out.
   */
  slotBounds(resource: ResourceKey): { x: number; y: number; width: number; height: number } {
    const chip = this.alertChips[resource];
    return {
      x: chip.x,
      y: chip.y - chip.height / 2,
      width: chip.width,
      height: chip.height,
    };
  }

  refresh(): void {
    // Tracked so `reflow` — up to sixteen canvas measures — runs only when a label moved.
    // `setText` is guarded by Phaser; `setColor` is not, and re-rasterised four labels per tick
    // for colours that had not changed.
    let changed = false;
    changed = writeText(this.seasonText,
      t('time.yearSeason', { year: this.gameState.year, season: seasonLabel(this.gameState.season) })) || changed;
    RESOURCE_ORDER.forEach((resource) => {
      const rate = this.gameState.resourceRates[resource];
      const signedRate = rate > 0 ? `+${compactNumber(rate)}` : compactNumber(rate);
      const text = this.resourceTexts[resource];
      /**
       * People are the one store with a ceiling, and the ceiling has to show or it reads as a bug.
       *
       * Growth tapers as the realm's districts fill (see `realmPopulationCapacity`), so a player
       * whose rate has quietly fallen to +3 has no way to tell a carrying capacity from a broken
       * economy. Swapping the rate for `held/cap` on the last tenth says which it is, in the place
       * they are already looking.
       *
       * Only near the ceiling, and only in Ascent: the strip packs four stores by measured width
       * and steps the type down to 9px when they will not fit, so a second number carried at all
       * times would cost the whole row a size for information that is usually irrelevant.
       */
      // `realmPopulationCapacity` returns 0 for a realm with no ground left, which is the honest
      // answer and the one this guard needs: it used to floor at 1 and the last screen of a lost
      // run read `8.8k/1`.
      const capped = resource === 'humans' && this.gameState.gameMode === 'ascent'
        ? realmPopulationCapacity(this.gameState)
        : 0;
      const label = capped > 0 && this.gameState.resources.humans >= capped * 0.9
        ? `${compactNumber(this.gameState.resources[resource])}/${compactNumber(capped)}`
        : `${compactNumber(this.gameState.resources[resource])} (${signedRate})`;
      changed = writeText(text, label) || changed;

      // A store that is merely shrinking gets the old pink; one that is about to run dry gets
      // escalated, because the two are not remotely the same situation and used to look it.
      //
      // Measured across five runs, a realm could sit at zero food for hundreds of consecutive
      // seasons — every host losing 4 morale and 6 supply a tick — while the strip rendered that
      // in the same 12px as a healthy gold surplus beside it. Runs were being decided by a line
      // of text no wider than a thumbnail.
      const seasons = CRITICAL_RESOURCES.includes(resource) ? this.runway(resource) : Number.POSITIVE_INFINITY;
      const crisis = seasons <= CRISIS_SEASONS;
      const warning = !crisis && seasons <= WARNING_SEASONS;

      this.alertChips[resource].setVisible(crisis);
      // Read on paper, not on the old near-black: ink for the ordinary case, sỏi son only when a
      // store is actually running out.
      const colour = crisis ? '#8a2a1b'
        : warning ? '#9a6b16'
          : rate < 0 ? '#a4522f'
            : rate > 0 ? '#4c6b46' : INK_UI_HEX.inkText;
      if (text.style.color !== colour) {
        text.setColor(colour);
        changed = true;
      }
      const style = crisis || warning ? 'bold' : 'normal';
      if (text.style.fontStyle !== style) {
        text.setFontStyle(style);
        changed = true;
      }
    });

    if (changed) this.reflow();
  }
}
