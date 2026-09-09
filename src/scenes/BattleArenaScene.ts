import { preloadConquestMapArt } from '../ui/conquestMapArt';
import { showPageLoading } from '../ui/pageLoading';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PLAYER_KINGDOM_ID } from '../game/constants';
import { sheetSpan } from '../game/cameraLayout';
import { attachDesktopBackdrop } from '../ui/desktopBackdrop';
import { createAscentGameState } from '../state/GameState';
import { requestGuidedRun } from '../state/tour';
import { beginBattle } from '../systems/ascent/BattleSystem';
import {
  ENEMY_WARDROBES, VIET_WARDROBES,
  type Army, type ArmyWardrobe, type AscentBattleRecord, type GameState, type KingdomPersonality,
  type Land, type TerrainSummary,
} from '../state/types';
import {
  BACK_BAR_WIDTH, InkUI, INK_UI, INK_UI_HEX, scrollGestureConsumedTap, type InkScrollArea,
} from '../ui/InkUI';
import { createLabel } from '../ui/theme';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { bucketFor, faceStampedFigure, figureStamp } from '../ui/ink/figureStamps';
import { placeStamp } from '../ui/ink/stamp';
import { royalScroll } from '../ui/ink/royalScroll';
import { seal } from '../ui/ink/devices';
import { PIGMENT } from '../ui/ink/palette';
import { BATTLE_HOST_SCALE } from '../game/ascentConfig';
import type { FigureArm } from '../ui/ink/devices';
import { t } from '../i18n';
import { applyRenderScale } from '../game/graphicsQuality';
import { qualityLadder } from '../game/qualityLadder';
import { drawFormationRing } from '../ui/ascent/formationCounters';
import {
  BATTLE_DIFFICULTIES, BATTLE_HINTS, BATTLE_SPEEDS,
  getBattleDifficulty, getBattleHints, getBattleSpeed,
  setBattleDifficulty, setBattleHints, setBattleSpeed,
  type BattleDifficulty, type BattleSpeed,
} from '../game/battleOptions';

/**
 * The fight, on its own, with the dials exposed.
 *
 * Verifying a change to the battle meant playing Dragon Ascent until one happened to open —
 * measured, that is nine engagements in a hundred and sixty ticks, three quarters of them
 * walkovers, and no way at all to ask for the matchup you wanted to see. Every harness in
 * `test_scripts/` that touches the fight begins by driving a whole run forward until one starts,
 * which is a lot of machinery to answer "is this good yet".
 *
 * So: pick two hosts, pick the ground, pick who is across from you, and fight it. The result
 * comes back here so the next matchup is one tap away.
 *
 * **It runs the real fight.** `beginBattle`, `fightRound`, `advanceBattle` and the battle screen
 * itself are the ones the mode uses, on the same clock, through `ConquestScene`. An arena with
 * its own copy of the combat model would verify the copy. The only concessions are three
 * one-line guards — `worthWatching` and `raiseGarrisonLevy` step aside, and `advanceAscentTick`
 * runs the fight without the run around it — each of which exists so the matchup you dialled in
 * is the matchup you get.
 */

/**
 * Take command: full width, and 38 tall rather than 50.
 *
 * It is the width of the page because it is the thing the page is for — that part was never the
 * problem. It was the *height*: fifty points of button under a column of thirty-point tiles read as
 * a slab, and it is the one control here that does not need to shout to be found. 32 is still four
 * clear of a 28-point row of tiles and well over any touch floor at this width.
 */
const FIGHT_BUTTON = 32;
const ROYAL_COMMENDATION = 'battle-royal-commendation-v1';

/** A step on one of the arena's dials. `value` is what the state gets; `label` is what you tap. */
interface Choice<T> {
  value: T;
  label: string;
}

type ArmSpread = { archers: number; heavy: number };

export class BattleArenaScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  /** Everything this screen drew, so a re-render can take it all down again. */
  private layer!: Phaser.GameObjects.Container;
  private content: Phaser.GameObjects.GameObject[] = [];
  private scroll?: InkScrollArea;

  // Defaults must be steps the dials actually offer, or the row opens with nothing lit and the
  // player cannot tell whether the setting is unset or simply invisible. Moved up with the dial
  // itself: 900 and 1,500 are not on it any more.
  //
  // Equal on purpose. The page opened at 2,400 against 4,000 and the very first fight a player
  // set up was one they were expected to lose — a fair fight is the honest default, and the
  // stepper is right there for anyone who wants the odds against them.
  private ourMen = 2400;
  private theirMen = 2400;
  private ourArms: ArmSpread = { archers: 0.25, heavy: 0.15 };
  private theirArms: ArmSpread = { archers: 0.25, heavy: 0.15 };
  /**
   * What the two hosts LOOK like — the dynasty wardrobe the figures are drawn in (user request).
   * Pure picture, no numbers: it flows through `muster.dynasty` / `kingdom.wardrobe`, the same
   * channel a run's own roll uses, so the battle screen dresses the men without a special case.
   * Ours picks from the seven Việt wardrobes; the enemy from the five invading powers plus the
   * three lord periods a rival Việt realm can wear. Defaults are the classic matchup.
   */
  private ourStyle: ArmyWardrobe = 'le';
  private theirStyle: ArmyWardrobe = 'ming';
  private ground: keyof TerrainSummary = 'plains';
  private doctrine: KingdomPersonality = 'aggressive';
  /**
   * 40, not 70, and the number is a difficulty ladder held by `probe-noclick`/`battle-lab`:
   * a general's aura multiplies `armyPower`, and at 70 the even default fight opened at 1.18-to-1
   * in power — measured, EVERY policy including touching nothing won 100 of 100, because the
   * overtime grind hands the field to the stronger side almost deterministically. At 40 the same
   * fight is 1.10-to-1: hands-off wins 25%, answering their shapes wins reliably, and working
   * both dials wins keeping a third of the host. Doing nothing loses; doing the taught thing wins.
   */
  private martial = 40;
  /** The last fight fought here, so the arena is a loop rather than a one-shot. */
  private last?: AscentBattleRecord;
  /**
   * The after-action report, and whether it is still waiting to be shown.
   *
   * A fight that has just ended is the only thing the player wants to look at, and the summary was
   * a 70-pixel card three rows down a settings page — below the dials, inside a scroll area, easy
   * to fight twice and never notice. It gets the screen now, once, and then gets out of the way.
   */
  private resultLayer?: Phaser.GameObjects.Container;
  private resultPending = false;
  /** Wall-clock start of the fight, so the report can say how long it actually took. */
  private fightStartedAt = 0;
  private lastDurationMs = 0;

  /** Kept on setup until a fight starts, so leaving setup cannot coach an unrelated run. */
  private guidedCopilot = false;

  constructor() {
    super('BattleArenaScene');
  }

  init(data?: { result?: AscentBattleRecord; guidedCopilot?: boolean }): void {
    this.guidedCopilot = data?.guidedCopilot === true;
    if (data?.result) {
      this.last = data.result;
      this.resultPending = true;
      // `startFight` stamped the clock on the way out; the scene instance survives the round trip
      // through ConquestScene, so the stamp is still here.
      this.lastDurationMs = this.fightStartedAt > 0 ? Date.now() - this.fightStartedAt : 0;
    }
  }

  preload(): void {
    showPageLoading(this);
    preloadConquestMapArt(this, import.meta.env.BASE_URL);
    if (!this.textures.exists(ROYAL_COMMENDATION)) {
      this.load.image(ROYAL_COMMENDATION, `${import.meta.env.BASE_URL}art/battle-royal-commendation-v1.webp`);
    }
  }

  create(): void {
    applyRenderScale(this);
    // The arena builds a whole screen in one frame; hold the ladder so that frame is not
    // read as the device running hot.
    qualityLadder()?.markSceneStart();
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT);
    // The desktop's sheet beyond the column — see `desktopBackdrop.ts`. Nothing on the phone.
    attachDesktopBackdrop(this);
    this.layer = this.add.container(0, 0);
    this.render();
    // After `render`, so the report is laid over a finished screen rather than under one.
    if (this.resultPending && this.last) {
      this.resultPending = false;
      this.showResult(this.last);
    }
  }

  // ── the after-action report ───────────────────────────────────────────────

  /**
   * How well it was fought, from one to five.
   *
   * Winning is most of it but deliberately not all of it: a victory that spends the whole host to
   * buy a field is not the same as one that walks off it. The other three terms are the ones a
   * player can actually feel — how many came back, how the exchange went, and whether the odds
   * were against you when it started.
   *
   * Losing floors at one star rather than zero. A defeat is already the feedback; a zero on top of
   * it is a scolding, and the screen exists to make people fight again.
   */
  private gradeFight(record: AscentBattleRecord): { stars: number; score: number } {
    const ourLost = Math.max(0, record.ourStart - record.ourEnd);
    const theirLost = Math.max(0, record.theirStart - record.theirEnd);

    let score = record.outcome === 'they-rout' ? 50
      : record.outcome === 'spent' ? 22
        : record.outcome === 'retreat' ? 16 : 0;

    // Survivors: the whole of the difference between a win and a good win.
    const kept = record.ourStart > 0 ? record.ourEnd / record.ourStart : 0;
    score += Math.round(Math.max(0, Math.min(1, kept)) * 25);

    // The exchange, capped at three to one — past that it is the enemy's mistake, not your skill.
    const exchange = theirLost / Math.max(1, ourLost);
    score += Math.round(Math.max(0, Math.min(3, exchange)) / 3 * 15);

    // And what you were up against. Beating a bigger host is worth more than beating a smaller one.
    const odds = record.ourStart > 0 ? record.theirStart / record.ourStart : 1;
    score += Math.round(Math.max(0, Math.min(2, odds - 0.75)) / 2 * 10);

    // And a ceiling set by what you brought. Survivors and the exchange alone will happily award
    // five stars for walking four thousand men onto nine hundred — measured, exactly that scored
    // 82 — and the top grade's own words are "longer odds, fewer graves", which would be a lie.
    // You cannot buy a famous day with numbers.
    const ceiling = odds >= 0.9 ? 5 : odds >= 0.6 ? 4 : 3;
    const stars = Math.max(1, Math.min(ceiling, Math.ceil(score / 20)));
    return { stars, score: Math.min(100, score) };
  }

  /**
   * The report itself: what happened, how it went, and the two things to do next.
   *
   * Modal on purpose. The player has just watched a battle and the one question in their head is
   * "did I win", so nothing else is on screen until they have answered it and chosen whether to go
   * again. Both buttons are big enough to hit without looking, because the whole loop here is
   * fight, read, fight again.
   */
  private showResult(record: AscentBattleRecord): void {
    this.dismissResult();
    const layer = this.add.container(0, 0);
    this.resultLayer = layer;

    const won = record.outcome === 'they-rout';
    const drew = record.outcome === 'spent' || record.outcome === 'retreat';
    const { stars } = this.gradeFight(record);
    const ourLost = Math.max(0, record.ourStart - record.ourEnd);
    const theirLost = Math.max(0, record.theirStart - record.theirEnd);

    const span = sheetSpan(this);
    const dim = this.add.rectangle(span.left, 0, span.width, GAME_HEIGHT, INK_UI.overlay, 0.93)
      .setOrigin(0, 0)
      .setInteractive();
    layer.add(dim);

    const cardW = GAME_WIDTH - 44;
    const cardX = 22;
    /**
     * Tall enough for the paper's own furniture.
     *
     * `royalScroll` prints a rule across the sheet at 130 and another at `height - 110` — the
     * masthead and the foot of a sắc phong. They are baked into the stamp, so the report is laid
     * out around them rather than over them: the kicker and the headline live above the first,
     * the grade and the six figures between the two, and the pair of buttons below the second.
     * At the 372 the rounded card used, the fifth figure printed straight through the foot rule.
     */
    const cardH = 540;
    const HEAD_RULE = 130;
    const FOOT_RULE = cardH - 110;
    /** The ornamental register runs to 20 units in from each edge; the reading field starts after it. */
    const INSET = 28;
    /**
     * The report stands on the menu's own paper.
     *
     * It used to be an `InkUI.panel` — a rounded rectangle with a coloured rule around it, which
     * is the shape every ordinary card in the mode wears. This one is the end of a battle, the
     * one sheet in the run the player stops to read, and a rounded card is what the game says
     * about a build row. `royalScroll` is the sắc phong paper the front page is printed on:
     * decorated margins, cloud corners and rolled ends, baked once per size. The generated royal
     * dragon below the headline replaces the menu's lotus device on this sheet.
     *
     * Room is left for the rolls: the stamp reaches nineteen units past the paper at the head and
     * foot, so the card sits clear of both edges of the sheet rather than at 40.
     */
    const cardY = Math.max(24, Math.round((GAME_HEIGHT - cardH) / 2));
    const accent = won ? INK_UI.jade : drew ? INK_UI.gold : INK_UI.cinnabar;
    layer.add(royalScroll(this, cardX, cardY, cardW, cardH, false));
    // The outcome colours the sheet by overdrawing the masthead rule the paper already carries,
    // rather than by ringing the whole card: on decorated paper a coloured border reads as a
    // sticker stuck over the print. Won, drawn and lost each close the head band in their own ink.
    const outcomeRule = this.add.graphics();
    outcomeRule.lineStyle(1.4, accent, won ? 0.9 : 0.75);
    outcomeRule.lineBetween(cardX + 30, cardY + HEAD_RULE, cardX + cardW - 30, cardY + HEAD_RULE);
    layer.add(outcomeRule);

    let y = cardY + 44;
    const kicker = createLabel(this, GAME_WIDTH / 2, y, t('arena.report.kicker'), 'caption', {
      fontSize: '9.5px', align: 'center',
    }).setOrigin(0.5, 0);
    layer.add(kicker);
    y += kicker.height + 6;

    const headline = createLabel(
      this, GAME_WIDTH / 2, y,
      t(won ? 'arena.report.won' : drew ? 'arena.report.drew' : 'arena.report.lost'),
      'title',
      { fontSize: '24px', align: 'center', color: `#${accent.toString(16).padStart(6, '0')}`, wordWrap: { width: cardW - INSET * 2 } },
    ).setOrigin(0.5, 0);
    layer.add(headline);

    // Below the masthead rule, whatever the head band did with its own room: a two-line
    // Vietnamese headline pushes the words, not the grade.
    y = cardY + HEAD_RULE + 10;

    // One ceremonial print and a named commendation take the place of the five-star rating.
    // A lost or unfinished field carries a dispatch, rather than claiming a royal reward.
    const honor = this.add.container(GAME_WIDTH / 2, y + 48).setName('royal-commendation');
    honor.setData({ grade: stars, awarded: won });
    if (this.textures.exists(ROYAL_COMMENDATION)) {
      honor.add(this.add.image(-77, 0, ROYAL_COMMENDATION).setDisplaySize(104, 104));
    } else {
      const fallback = this.add.graphics();
      seal(fallback, -77, 0, 36, 'lotus');
      honor.add(fallback);
    }
    const awardX = 52;
    const issuer = createLabel(this, awardX, -30,
      t(won ? 'arena.report.royal.issuer' : 'arena.report.royal.dispatch'), 'caption',
      { fontSize: '9px', color: INK_UI.mutedText, align: 'center' }).setOrigin(0.5, 0);
    const titleKey = won ? `arena.report.royal.honor${stars}`
      : drew ? 'arena.report.royal.regroup' : 'arena.report.royal.resolve';
    const honorTitle = createLabel(this, awardX, -12,
      t(titleKey as Parameters<typeof t>[0]), 'title',
      { fontSize: '20px', color: won ? INK_UI_HEX.cinnabarDeep : INK_UI.mutedText,
        align: 'center', wordWrap: { width: 146 } }).setOrigin(0.5, 0);
    const rank = createLabel(this, awardX, honorTitle.y + honorTitle.height + 6,
      t('arena.report.royal.rank', { n: ['I', 'II', 'III', 'IV', 'V'][stars - 1] }), 'caption',
      { fontSize: '9px', align: 'center' }).setOrigin(0.5, 0);
    honor.add([issuer, honorTitle, rank]);
    layer.add(honor);
    if (won) {
      honor.setAlpha(0).setScale(0.9);
      this.tweens.add({ targets: honor, alpha: 1, scale: 1,
        ease: 'Cubic.easeOut', duration: 420, delay: 140 });
    }
    y += 106;

    const verdict = createLabel(
      this, GAME_WIDTH / 2, y,
      t(`arena.report.grade${stars}` as Parameters<typeof t>[0]), 'caption',
      { fontSize: '11px', align: 'center', wordWrap: { width: cardW - INSET * 2 } },
    ).setOrigin(0.5, 0);
    layer.add(verdict);
    y += verdict.height + 12;

    // ── what it cost ─────────────────────────────────────────────────────
    const rows: Array<[string, string]> = [
      [t('arena.report.ourLosses'), `${ourLost.toLocaleString()} / ${record.ourStart.toLocaleString()}`],
      [t('arena.report.theirLosses'), `${theirLost.toLocaleString()} / ${record.theirStart.toLocaleString()}`],
      [t('arena.report.exchange'), `${(theirLost / Math.max(1, ourLost)).toFixed(2)} : 1`],
      [t('arena.report.survivors'), `${Math.round((record.ourEnd / Math.max(1, record.ourStart)) * 100)}%`],
      [t('arena.report.rounds'), t('arena.report.roundsValue', { n: record.rounds })],
      [t('arena.report.duration'), this.lastDurationMs > 0
        ? t('arena.report.durationValue', { n: Math.max(1, Math.round(this.lastDurationMs / 1000)) })
        : '—'],
    ];
    // The block is hung off the foot rule rather than off whatever the verdict wrapped to, so
    // six figures always end the same distance above it and the paper never has to stretch.
    y = Math.max(y, cardY + FOOT_RULE - 14 - rows.length * 19);
    for (const [label, value] of rows) {
      layer.add(createLabel(this, cardX + INSET, y, label, 'caption', { fontSize: '11px' }).setOrigin(0, 0));
      layer.add(createLabel(this, cardX + cardW - INSET, y, value, 'label', {
        fontSize: '12px', align: 'right',
      }).setOrigin(1, 0));
      y += 19;
    }

    // ── and the two ways on ──────────────────────────────────────────────
    // In the foot band, between the paper's lower rule and its bottom roll.
    const btnY = cardY + FOOT_RULE + 26;
    const half = (cardW - INSET * 2 - 10) / 2;
    layer.add(this.ui.button(
      { x: cardX + INSET, y: btnY, width: half, height: 46 },
      t('arena.report.again'),
      () => { this.dismissResult(); this.startFight(); },
      { variant: 'primary', fontSize: '15px' },
    ));
    layer.add(this.ui.button(
      { x: cardX + INSET + half + 10, y: btnY, width: half, height: 46 },
      t('arena.report.back'),
      () => this.dismissResult(),
      { variant: 'secondary', fontSize: '15px' },
    ));

    // ── the congratulation ───────────────────────────────────────────────
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 180 });
    headline.setScale(won ? 0.7 : 1);
    if (won) {
      this.tweens.add({ targets: headline, scale: 1, ease: 'Back.easeOut', duration: 340 });
      this.celebrate(layer, cardX, cardY, cardW);
    }
  }

  /**
   * Petals over a won field.
   *
   * Đông Hồ prints celebrate with flowers rather than confetti, so this drops hoa đào across the
   * card: a scatter of small red-brown marks that fall, drift and fade. Deterministic count and a
   * fixed lifetime, because a celebration that is still running when the player presses "again" is
   * a leak — every one of them is destroyed on completion and the layer takes the rest with it.
   */
  private celebrate(
    layer: Phaser.GameObjects.Container, cardX: number, cardY: number, cardW: number,
  ): void {
    for (let i = 0; i < 18; i += 1) {
      const x = cardX + 10 + Math.random() * (cardW - 20);
      const petal = this.add.graphics({ x, y: cardY - 10 - Math.random() * 40 });
      petal.fillStyle(i % 3 === 0 ? INK_UI.gold : INK_UI.cinnabar, 0.8);
      petal.fillEllipse(0, 0, 5, 3);
      petal.setAngle(Math.random() * 360);
      layer.add(petal);
      this.tweens.add({
        targets: petal,
        y: cardY + 200 + Math.random() * 120,
        x: petal.x + (Math.random() * 40 - 20),
        angle: petal.angle + 180 + Math.random() * 180,
        alpha: { from: 0.85, to: 0 },
        ease: 'Sine.easeIn',
        duration: 1500 + Math.random() * 900,
        delay: i * 45,
        onComplete: () => petal.destroy(),
      });
    }
  }

  private dismissResult(): void {
    const layer = this.resultLayer;
    this.resultLayer = undefined;
    if (!layer) return;
    this.tweens.killTweensOf(layer);
    layer.each((child: Phaser.GameObjects.GameObject) => this.tweens.killTweensOf(child));
    layer.destroy(true);
  }

  /** The visible report, exposed to the existing screenshot/text playtest hook. */
  resultState(): Record<string, unknown> {
    const honor = this.resultLayer?.getByName('royal-commendation');
    return {
      mode: this.resultLayer ? 'arena-result' : 'arena-setup',
      coordinateSystem: 'origin top-left; x right, y down',
      result: this.resultLayer && this.last ? {
        outcome: this.last.outcome, grade: honor?.getData('grade'),
        royalCommendation: honor?.getData('awarded'),
        ourStart: this.last.ourStart, ourEnd: this.last.ourEnd,
        theirStart: this.last.theirStart, theirEnd: this.last.theirEnd,
      } : undefined,
      actions: this.resultLayer ? ['fight-again', 'back'] : ['take-command', 'back'],
    };
  }

  // ── the dials ─────────────────────────────────────────────────────────────

  /**
    * The dial stopped at 2,400, which is a skirmish and not the thing the mode is named for.
    *
    * A late Dragon Ascent wave fields far more than that, and this page exists to let a player set
    * up the fight they actually want to see. The steps stay coarse — a slider of every number
    * between three hundred and twelve thousand is a worse control than seven presses — and they
    * roughly double, so each one is a visibly different fight rather than a nudge.
    */
  private sizes(): Array<Choice<number>> {
    return [
      { value: 600, label: '600' },
      { value: 1200, label: '1.2k' },
      { value: 2400, label: '2.4k' },
      { value: 4000, label: '4k' },
      { value: 6500, label: '6.5k' },
      { value: 9000, label: '9k' },
      { value: 12000, label: '12k' },
    ];
  }

  private arms(): Array<Choice<ArmSpread>> {
    return [
      { value: { archers: 0.10, heavy: 0.10 }, label: t('arena.arms.spears') },
      { value: { archers: 0.25, heavy: 0.15 }, label: t('arena.arms.balanced') },
      { value: { archers: 0.50, heavy: 0.10 }, label: t('arena.arms.bows') },
      { value: { archers: 0.12, heavy: 0.40 }, label: t('arena.arms.heavy') },
    ];
  }

  /**
   * The four grounds a fight can be had on, at the multipliers they actually produce.
   *
   * Not invented numbers: `terrainDefenseMultiplier` reads `land.terrainSummary` and returns
   * `1 + min(0.35, rugged * 0.5)`, so 1.35 is the ceiling and a dial offering more would be
   * lying. A province made entirely of one terrain gives 1.00 / 1.20 / 1.30 / 1.35.
   */
  /** How fast the enemy answers a shape, and nothing else. See `battleOptions`. */
  private difficulties(): Array<Choice<BattleDifficulty>> {
    return BATTLE_DIFFICULTIES.map((value) => ({
      value, label: t(`arena.difficulty.${value}` as Parameters<typeof t>[0]),
    }));
  }

  /**
   * The words over the men, pinned for this skirmish. "By foe" follows the enemy dial above
   * (which is what the campaign does, wave caps and all); the rest pin the linger outright —
   * the practice screen is exactly where a player teaches themselves to read the drawn
   * formation with fewer and fewer words.
   */
  private bubbleChoices(): Array<Choice<number | undefined>> {
    return [
      { value: undefined, label: t('arena.bubbles.follow') },
      { value: -1, label: t('arena.bubbles.always') },
      { value: 6000, label: t('arena.bubbles.slow') },
      { value: 1500, label: t('arena.bubbles.quick') },
      { value: 0, label: t('arena.bubbles.none') },
    ];
  }

  /** How long a round is held on screen, and how many of them a season is worth. */
  private speeds(): Array<Choice<BattleSpeed>> {
    return BATTLE_SPEEDS.map((value) => ({
      value, label: t(`arena.speed.${value}` as Parameters<typeof t>[0]),
    }));
  }

  private grounds(): Array<Choice<keyof TerrainSummary>> {
    return [
      { value: 'plains', label: t('arena.ground.open') },
      { value: 'forest', label: t('arena.ground.rough') },
      { value: 'hills', label: t('arena.ground.hills') },
      { value: 'mountains', label: t('arena.ground.pass') },
    ];
  }

  private doctrines(): Array<Choice<KingdomPersonality>> {
    return [
      { value: 'aggressive', label: t('arena.doctrine.aggressive') },
      { value: 'defensive', label: t('arena.doctrine.defensive') },
      { value: 'economic', label: t('arena.doctrine.cautious') },
    ];
  }

  private generals(): Array<Choice<number>> {
    return [
      { value: 0, label: t('arena.general.none') },
      { value: 40, label: '40' },
      { value: 70, label: '70' },
      { value: 95, label: '95' },
    ];
  }

  // ── layout ────────────────────────────────────────────────────────────────

  /**
   * Two armies facing each other, then three dials, then the order to fight.
   *
   * The first version was seven identical rows of pills stacked down the screen — a settings
   * form, not a screen about a battle. It had no hierarchy, the thing you were actually building
   * (the matchup) was a grey line of small text at the bottom, and on a short device the last row
   * was sliced in half by the action button.
   *
   * So the two hosts are drawn side by side as opposed columns, which is what they are, with the
   * headcount as the largest thing on the screen and the odds stated between them. The three
   * settings that belong to the fight rather than to either side sit underneath. It fits without
   * scrolling on a 620-high screen, and the scroll behind it is a safety net rather than the
   * layout.
   */
  private render(): void {
    this.clearContent();
    let y = 20;

    const title = createLabel(this, GAME_WIDTH / 2, y, t('arena.title'), 'title', {
      fontSize: '22px', align: 'center',
    }).setOrigin(0.5, 0);
    this.push(title);
    y += title.height + 2;

    const blurb = createLabel(this, GAME_WIDTH / 2, y, t('arena.blurb'), 'caption', {
      fontSize: '11px', align: 'center', wordWrap: { width: GAME_WIDTH - 56 },
    }).setOrigin(0.5, 0);
    this.push(blurb);
    y += blurb.height + 12;

    // The buttons are placed first, so the body knows exactly how much room it is allowed.
    const pinnedBackY = GAME_HEIGHT - 54;
    /**
     * The two buttons as a matched pair, both the width of the way back.
     *
     * Take command was the full width of the sheet at fifty points tall with 17-point type — about
     * twice the area of the bar under it, on a page whose entire content above them is small tiles.
     * Loud is carried by the sỏi son border and by the word, not by size.
     */
    const fightY = pinnedBackY - FIGHT_BUTTON - 8;

    /**
     * Three tabs, one screen (user request, 2026-08-25): nine rows of dials stacked down one
     * scroll made the page a settings form, and most visits change one thing. The matchup, the
     * field, and the player's preferences are three different questions, so each gets a page:
     * Armies (the two hosts and their arms), Battle (ground, enemy doctrine, our general), and
     * Difficulty (the `battleOptions` preferences). Armies opens first — it is the thing the
     * screen is named for.
     */
    y = this.renderTabs(y);

    const body = this.add.container(0, 0);
    let by = 0;

    if (this.tab === 'army') {
      by = this.renderForces(body, by);
      by = this.renderOdds(body, by);
      if (this.last) by = this.renderLastFight(body, by);
    } else if (this.tab === 'battle') {
      by = this.row(body, by, t('arena.ground'), this.grounds(), (c) => c.value === this.ground,
        (c) => { this.ground = c.value; this.render(); });
      by = this.row(body, by, t('arena.doctrine'), this.doctrines(), (c) => c.value === this.doctrine,
        (c) => { this.doctrine = c.value; this.render(); });
      by = this.row(body, by, t('arena.general'), this.generals(), (c) => c.value === this.martial,
        (c) => { this.martial = c.value; this.render(); });
    } else {
      /**
       * The dials that are not about this matchup but about every fight.
       *
       * They are preferences, kept in `battleOptions` beside the language and the map theme, and
       * the settings sheet on the front page offers the same two. They are repeated here because
       * this is the screen built for trying a fight out — sending somebody to the front page and
       * back to find out whether a quicker enemy is more fun is the round trip that stops people
       * trying.
       */
      by = this.row(body, by, t('arena.difficulty'), this.difficulties(),
        (c) => c.value === getBattleDifficulty(),
        (c) => { setBattleDifficulty(c.value); this.render(); });
      by = this.row(body, by, t('arena.speed'), this.speeds(),
        (c) => c.value === getBattleSpeed(),
        (c) => { setBattleSpeed(c.value); this.render(); });
      by = this.row(body, by, t('arena.bubbles'), this.bubbleChoices(),
        (c) => c.value === this.bubbleChoice,
        (c) => { this.bubbleChoice = c.value; this.render(); });
      // The crib sheet, on the screen built for practising without one.
      by = this.row(body, by, t('arena.hints'),
        BATTLE_HINTS.map((value) => ({
          value, label: t(`menu.battleHints.${value}` as 'menu.battleHints.show'),
        })),
        (c) => c.value === getBattleHints(),
        (c) => { setBattleHints(c.value); this.render(); });
    }

    /**
     * The ring is pinned, and the dials scroll under it.
     *
     * Inside the body it scrolled with everything else, which on a 620 sheet meant the loop was cut
     * in half by the bottom of the window — measured, the body wants 522 points and has 409 there.
     * A closed loop with a piece missing is not a picture of a closed loop, and a reader who cannot
     * see it is not going to learn that nothing in the ring is best.
     *
     * So it takes a fixed band above the buttons. The dials give up the difference, which costs
     * them nothing they cannot scroll to and costs the drawing nothing at all — and on a tall sheet
     * it fills the dead paper the pinned buttons left behind.
     */
    const ringTop = this.renderRing(fightY - 12);
    const room = Math.max(120, ringTop - y - 10);
    const used = Math.min(room, by + 6);
    this.scroll = this.ui.scrollArea({ x: 20, y, width: GAME_WIDTH - 40, height: used });
    this.scroll.content.add(body);
    this.scroll.setContentHeight(by + 6);
    this.scroll.addTo(this.layer);

    /**
     * Pinned at the foot, always — not floated up under whatever the dials happened to need.
     *
     * It used to follow the content, on the reasoning that a page whose dials fit should not leave
     * sixty points of nothing between the two things you can press. Then the three paragraphs at
     * the top became one row at the bottom, the dials stopped needing to scroll at all, and the
     * same rule left four hundred and fifty points of empty paper below the buttons on a tall
     * phone — with the one button this page exists for floating in the middle of the sheet.
     *
     * The foot is where every other page in the game puts its action and its way back, and it is
     * the only part of a tall phone a thumb reaches. `used` still clips the body, so the dials can
     * never reach down and cover it.
     */
    const actionY = fightY;
    this.push(this.ui.button(
      { x: 28, y: actionY, width: GAME_WIDTH - 56, height: FIGHT_BUTTON },
      t('arena.fight'), () => this.startFight(), { variant: 'primary', fontSize: '15px' },
    ));
    // Follows the fight button up rather than staying pinned, or a screen whose dials fit leaves
    // sixty pixels of nothing between the two things you can press.
    this.push(this.ui.backBar(
      Math.min(actionY + 60, pinnedBackY), () => this.scene.start('MenuScene'),
    ));
  }

  /**
   * The ring, under the dials rather than over them.
   *
   * It replaced three paragraphs of *watch what they are doing, two of your five answer it, press
   * one* — a description of a picture where the picture would do — and it was first put at the top
   * of the page, above everything. That was the wrong place twice over: this page's business is two
   * hosts, four dials and a general, and a hundred and sixty points of reference material above
   * them pushed the last dial off the bottom of a 620 sheet entirely.
   *
   * So it is the chain rather than the table — one row instead of five — and it sits at the foot of
   * the body, where reference belongs. The table is still the right drawing on the coach card
   * inside a fight, where the reader is under time; both are read off `formationBeats`.
   */
  /**
   * Collapsed to one line by default (user verdict, 2026-08-25: a reference diagram pinned open
   * on every visit "is not good UI/UX"). The rules do not change between fights, so after the
   * first reading the ring was a hundred-odd points of paper the dials could be using. The choice
   * lives on the scene instance, so it holds across fights in a sitting and resets with the app —
   * a newcomer's first visit always offers the full drawing one tap away.
   */
  private ringOpen = false;

  /** The three setup pages. Armies is the default — it is what the screen is named for. */
  private tab: 'army' | 'battle' | 'difficulty' = 'army';

  private renderTabs(y: number): number {
    const tabs: Array<{ id: 'army' | 'battle' | 'difficulty'; label: string }> = [
      { id: 'army', label: t('arena.tab.army') },
      { id: 'battle', label: t('arena.tab.battle') },
      { id: 'difficulty', label: t('arena.tab.difficulty') },
    ];
    const gap = 6;
    const width = Math.floor((GAME_WIDTH - 40 - gap * (tabs.length - 1)) / tabs.length);
    const height = 26;
    tabs.forEach((entry, index) => {
      const x = 20 + index * (width + gap);
      const selected = this.tab === entry.id;
      this.push(this.ui.crayonTile({ x, y, width, height }, { selected }));
      const text = createLabel(this, x + width / 2, y + 7, entry.label, 'caption', {
        fontSize: '11px', align: 'center', color: selected ? '#b33a26' : '#2a2118',
      }).setOrigin(0.5, 0);
      text.setData('tileWidth', width);
      this.push(text);
      const hit = this.add.zone(x, y, width, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        this.tab = entry.id;
        this.render();
      });
      this.push(hit);
    });
    return y + height + 10;
  }

  private renderRing(bottom: number): number {
    /**
     * The one-line header IS the button, in both states. The chevron used to fold into the
     * drawing's own centre when open, and the user's verdict was exact: "no button to hide" —
     * an affordance inside the picture reads as part of the picture. The line stays put above
     * the ring, says ▸ or ▾, and tapping either it or the drawing toggles.
     */
    const rowH = 18;
    const toggle = (open: boolean, x: number, y: number, w: number, h: number): void => {
      const hit = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => { this.ringOpen = open; this.render(); });
      this.push(hit);
    };
    const header = (top: number, glyph: string): void => {
      this.push(createLabel(this, GAME_WIDTH / 2, top + rowH / 2, `${glyph} ${t('arena.howTitle')}`, 'caption', {
        fontSize: '10px', fontStyle: '700', align: 'center', color: '#a8873c',
      }).setOrigin(0.5));
    };
    if (!this.ringOpen) {
      const top = bottom - rowH;
      header(top, '▸');
      toggle(true, 20, top, GAME_WIDTH - 40, rowH);
      return top;
    }
    // Drawn at the origin and measured, then moved: its height is the five labels' own heights and
    // those change with the language, so where it starts can only be known after it exists. No
    // centre title — the header line above carries it, and two copies of the same words four
    // lines apart is one too many.
    const ring = drawFormationRing(this, 20, 0, GAME_WIDTH - 40);
    const top = bottom - ring.height - rowH;
    header(top, '▾');
    ring.container.setY(top + rowH);
    this.push(ring.container);
    toggle(false, 20, top, GAME_WIDTH - 40, rowH + ring.height);
    return top;
  }

  /** The two hosts, side by side, as the thing the screen is actually about. */
  private renderForces(parent: Phaser.GameObjects.Container, y: number): number {
    const gap = 12;
    const width = Math.floor((GAME_WIDTH - 56 - gap) / 2);
    const left = this.forceColumn(parent, 8, y, width, true);
    const right = this.forceColumn(parent, 8 + width + gap, y, width, false);

    // On the heading line rather than beside the headcounts: down there it sits between a + and
    // a − with four pixels either side, and reads as another control rather than as "against".
    const cross = createLabel(this, 8 + width + gap / 2, y, '✕', 'caption', {
      fontSize: '11px', align: 'center',
    }).setOrigin(0.5, 0);
    parent.add(cross);

    return Math.max(left, right) + 10;
  }

  /** One side: who they are, how many, and what they are carrying. */
  private forceColumn(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    ours: boolean,
  ): number {
    const heading = createLabel(this, x + width / 2, y, (ours ? t('arena.ourHost') : t('arena.theirHost')).toUpperCase(),
      'caption', { fontSize: '10px', fontStyle: '700', align: 'center' }).setOrigin(0.5, 0);
    parent.add(heading);
    let cursor = y + heading.height + 4;

    // ── headcount, with a stepper either side ──────────────────────────────
    //
    // Five pills for a number is five taps' worth of screen to say one thing. A stepper says it
    // once, large, and leaves room for the arms underneath.
    const stepW = 32;
    const valueW = width - stepW * 2 - 8;
    const rowH = 38;
    const sizes = this.sizes();
    const current = ours ? this.ourMen : this.theirMen;
    const index = Math.max(0, sizes.findIndex((choice) => choice.value === current));

    const step = (delta: number): void => {
      const next = sizes[Math.min(sizes.length - 1, Math.max(0, index + delta))].value;
      if (ours) this.ourMen = next; else this.theirMen = next;
      this.render();
    };

    this.stepButton(parent, x, cursor, stepW, rowH, '−', index > 0, () => step(-1));
    parent.add(this.ui.panel({ x: x + stepW + 4, y: cursor, width: valueW, height: rowH }, {
      border: ours ? INK_UI.jade : INK_UI.softBrush,
    }));
    parent.add(createLabel(this, x + stepW + 4 + valueW / 2, cursor + 9, sizes[index].label, 'label', {
      fontSize: '18px', align: 'center',
    }).setOrigin(0.5, 0));
    this.stepButton(parent, x + stepW + valueW + 8, cursor, stepW, rowH, '+', index < sizes.length - 1, () => step(1));
    cursor += rowH + 6;

    // ── arms, two by two ───────────────────────────────────────────────────
    const arms = this.arms();
    const cellW = Math.floor((width - 5) / 2);
    const chosen = ours ? this.ourArms : this.theirArms;
    const labels = arms.map((choice) => createLabel(this, 0, 0, choice.label, 'caption', {
      fontSize: '11px', align: 'center', wordWrap: { width: cellW - 10 },
    }).setOrigin(0.5, 0));
    const textH = Math.max(...labels.map((entry) => entry.height));
    const cellH = Math.max(28, textH + 12);

    arms.forEach((choice, i) => {
      const cx = x + (i % 2) * (cellW + 5);
      const cy = cursor + Math.floor(i / 2) * (cellH + 5);
      const selected = choice.value.archers === chosen.archers && choice.value.heavy === chosen.heavy;
      parent.add(this.ui.crayonTile({ x: cx, y: cy, width: cellW, height: cellH }, { selected }));
      const text = labels[i];
      text.setPosition(cx + cellW / 2, cy + (cellH - textH) / 2);
      text.setColor(selected ? '#b33a26' : '#2a2118');
      text.setData('tileWidth', cellW);
      parent.add(text);
      const hit = this.add.zone(cx, cy, cellW, cellH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        if (ours) this.ourArms = choice.value; else this.theirArms = choice.value;
        this.render();
      });
      parent.add(hit);
    });
    cursor += cellH * 2 + 8;

    // ── attire: what these men are drawn as, cycled like the headcount ─────
    const styleCaption = createLabel(this, x + width / 2, cursor, t('arena.style').toUpperCase(),
      'caption', { fontSize: '9px', fontStyle: '700', align: 'center' }).setOrigin(0.5, 0);
    parent.add(styleCaption);
    cursor += styleCaption.height + 2;
    const styles: readonly ArmyWardrobe[] = ours
      ? VIET_WARDROBES
      : [...ENEMY_WARDROBES, 'trinh', 'nguyenLord', 'tayson'];
    const chosenStyle = ours ? this.ourStyle : this.theirStyle;
    const styleIndex = Math.max(0, styles.indexOf(chosenStyle));
    const styleH = 24;
    const stepStyle = (delta: number): void => {
      const next = styles[(styleIndex + delta + styles.length) % styles.length];
      if (ours) this.ourStyle = next; else this.theirStyle = next;
      this.render();
    };
    this.stepButton(parent, x, cursor, stepW, styleH, '‹', true, () => stepStyle(-1));
    parent.add(this.ui.panel({ x: x + stepW + 4, y: cursor, width: valueW, height: styleH }, {
      border: INK_UI.softBrush,
    }));
    parent.add(createLabel(this, x + stepW + 4 + valueW / 2, cursor + 6,
      t(`arena.style.${chosenStyle}` as Parameters<typeof t>[0]), 'caption', {
        fontSize: '11px', align: 'center',
      }).setOrigin(0.5, 0));
    this.stepButton(parent, x + stepW + valueW + 8, cursor, stepW, styleH, '›', true, () => stepStyle(1));
    cursor += styleH + 6;

    // ── and the men themselves, so the pick can be SEEN (user request). ────
    //
    // One of each arm, drawn through the exact stamp pipeline the battlefield uses — same
    // wardrobe spec, same figure drawings — so what stands here is what will stand on the field,
    // not an approximation that can drift from it. Enemy figures take the softer ink and no sỏi
    // son accent, the same rule `hostKitFor` applies.
    const PREVIEW_SCALE = 2.6;
    const PREVIEW_H = 44;
    const feetY = cursor + PREVIEW_H - 8;
    const previewArms: FigureArm[] = ['spear', 'sword', 'bow', 'mounted'];
    const slot = width / previewArms.length;
    previewArms.forEach((arm, index) => {
      const kind = {
        theme: chosenStyle, tier: 1, arm,
        colour: ours ? PIGMENT.muc : PIGMENT.mucSoft,
        accent: ours ? PIGMENT.son : PIGMENT.mucSoft,
        variant: index % 3, bucket: bucketFor(PREVIEW_SCALE),
      } as const;
      const stampRef = figureStamp(this, kind);
      const image = faceStampedFigure(
        placeStamp(this, stampRef, x + slot * (index + 0.5), feetY,
          PREVIEW_SCALE / BATTLE_HOST_SCALE),
        kind,
        ours ? 1 : -1,
      ).setData('arenaArmySide', ours ? 'ours' : 'theirs');
      parent.add(image);
    });

    return cursor + PREVIEW_H + 4;
  }

  /** A − or + beside the headcount. Greyed at the ends of the range rather than removed. */
  private stepButton(
    parent: Phaser.GameObjects.Container,
    x: number, y: number, width: number, height: number,
    glyph: string, enabled: boolean, onTap: () => void,
  ): void {
    parent.add(this.ui.crayonTile({ x, y, width, height }, { selected: false }));
    parent.add(createLabel(this, x + width / 2, y + height / 2 - 9, glyph, 'label', {
      fontSize: '17px', align: 'center', color: enabled ? '#2a2118' : '#a9a08c',
    }).setOrigin(0.5, 0));
    if (!enabled) return;
    const hit = this.add.zone(x, y, width, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) return;
      onTap();
    });
    parent.add(hit);
  }

  /** What the dials add up to, in one sentence, between the two hosts and the settings. */
  private renderOdds(parent: Phaser.GameObjects.Container, y: number): number {
    const odds = this.theirMen / Math.max(1, this.ourMen);
    // Weighed against the ground, because a defender in a mountain pass is not in the fight the
    // raw headcounts describe — which is exactly what the dial is there to let you feel.
    const weighted = odds / this.groundEdge();
    const verdict = weighted < 0.6 ? t('arena.odds.easy')
      : weighted > 1.8 ? t('arena.odds.hard') : t('arena.odds.close');
    const colour = weighted < 0.6 ? '#4c5f45' : weighted > 1.8 ? '#8a2a1b' : '#7d5814';
    const text = createLabel(this, (GAME_WIDTH - 40) / 2 - 12, y + 2,
      t('arena.oddsLine', { odds: odds.toFixed(2), verdict }), 'caption', {
        fontSize: '12px', align: 'center', color: colour, wordWrap: { width: GAME_WIDTH - 76 },
      }).setOrigin(0.5, 0);
    parent.add(text);
    return y + text.height + 12;
  }

  /**
   * One labelled row of choices, for the settings that belong to neither side.
   *
   * Every label is measured before anything is drawn and the tallest one sets the row's height,
   * so a tile is never shorter than the words inside it. Vietnamese is what forces this: at a
   * quarter of the width "Trường thương" does not fit on one line, and printing it anyway ran
   * the text straight out through the tile's border.
   */
  private row<T>(
    parent: Phaser.GameObjects.Container,
    y: number,
    label: string,
    choices: Array<Choice<T>>,
    isSelected: (choice: Choice<T>) => boolean,
    onPick: (choice: Choice<T>) => void,
  ): number {
    const heading = createLabel(this, 8, y, label.toUpperCase(), 'caption', {
      fontSize: '10px', fontStyle: '700',
    });
    parent.add(heading);
    const rowY = y + heading.height + 3;

    const gap = 5;
    const width = Math.floor((GAME_WIDTH - 56 - gap * (choices.length - 1)) / choices.length);

    const labels = choices.map((choice) => createLabel(this, 0, 0, choice.label, 'caption', {
      fontSize: '11px', align: 'center', wordWrap: { width: width - 10 },
    }).setOrigin(0.5, 0));
    const textH = Math.max(...labels.map((entry) => entry.height));
    const height = Math.max(30, textH + 12);

    choices.forEach((choice, index) => {
      const x = 8 + index * (width + gap);
      const selected = isSelected(choice);
      parent.add(this.ui.crayonTile({ x, y: rowY, width, height }, { selected }));

      const text = labels[index];
      text.setPosition(x + width / 2, rowY + (height - textH) / 2);
      text.setColor(selected ? '#b33a26' : '#2a2118');
      // Marked so `verify-arena` can tell a tile's label from the page title and the buttons,
      // which are centred text of similar size and would otherwise fail the width check.
      text.setData('tileWidth', width);
      parent.add(text);

      const hit = this.add.zone(x, rowY, width, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      // Without this a drag that happens to end on a tile chooses it, so the list could not be
      // scrolled past without changing the setup on the way through.
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        onPick(choice);
      });
      parent.add(hit);
    });
    return rowY + height + 9;
  }

  private renderLastFight(parent: Phaser.GameObjects.Container, y: number): number {
    const record = this.last;
    if (!record) return y;
    const outcome = t(`arena.outcome.${record.outcome}` as Parameters<typeof t>[0]);
    const card = this.ui.card({ x: 8, y, width: GAME_WIDTH - 56, height: 70 }, {
      title: t('arena.lastFight', { outcome }),
      body: t('arena.lastFightBody', {
        rounds: record.rounds,
        ourLost: Math.max(0, record.ourStart - record.ourEnd),
        theirLost: Math.max(0, record.theirStart - record.theirEnd),
      }),
      border: record.outcome === 'they-rout' ? INK_UI.jade : INK_UI.cinnabar,
    });
    parent.add(card);
    return y + (card.getData('cardHeight') as number) + 10;
  }

  private armLabel(spread: ArmSpread): string {
    return this.arms().find((c) => c.value.archers === spread.archers && c.value.heavy === spread.heavy)?.label
      ?? this.arms()[1].label;
  }


  // ── building the fight ────────────────────────────────────────────────────

  /**
   * A state that exists to fight once.
   *
   * Built off `createAscentGameState` rather than by hand: the fight reads court modifiers,
   * kingdom personalities, terrain helpers and the hero roster, and a hand-rolled state would
   * quietly differ from a real one in exactly the places that decide a battle.
   */
  /** The bubble pin for this skirmish; undefined follows the difficulty dial. */
  private bubbleChoice?: number;

  private buildArenaState(): GameState {
    const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    state.ascent!.arena = true;
    state.isPaused = false;
    state.isStrategyPause = false;
    state.pendingAscentPrompt = undefined;

    const land = state.lands.find((candidate) => candidate.ownerId === PLAYER_KINGDOM_ID)
      ?? state.lands[0];
    // The ground is a dial here, so it is written onto the province the fight is fought on and
    // read back by `terrainDefenseMultiplier` exactly as any other province's would be.
    this.applyGround(land);

    const rival = state.kingdoms.find((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID);
    if (rival) rival.personality = this.doctrine;

    // The attire dials, written onto the same channels a run's own muster roll fills, so
    // `hostKitFor` dresses the two hosts with no arena special case anywhere in the drawing.
    if (state.muster) state.muster.dynasty = this.ourStyle;
    else state.muster = { dynasty: this.ourStyle, composition: 'balanced' };
    if (rival) rival.wardrobe = this.theirStyle;

    // Nobody else on the field: relief marching in from a neighbouring province would answer a
    // question the player did not ask.
    state.armies = [];
    state.movementOrders = [];
    state.siegeOrders = [];

    const ours = this.makeHost('arena-ours', PLAYER_KINGDOM_ID, land.id, this.ourMen, this.ourArms);
    if (this.martial > 0) {
      const general = state.heroes[0];
      if (general) {
        general.stats.martial = this.martial;
        ours.generalHeroId = general.id;
      }
    }
    const theirs = this.makeHost('arena-theirs', rival?.id ?? 'northern-rival', land.id, this.theirMen, this.theirArms);
    state.armies.push(ours, theirs);

    state.pendingBattle = {
      invaderArmyId: theirs.id,
      landId: land.id,
      landName: land.name,
      kingdomId: theirs.kingdomId,
      kingdomName: rival?.name ?? 'Rival',
      isGreat: false,
      attackerPower: 0,
      defenderPower: 0,
    };

    // Open it here rather than leaving it to the first economy tick. The arena is a fight and
    // nothing else, so 3.5 seconds of staring at a map waiting for it to start is 3.5 seconds
    // of nothing — and the screen opens itself the moment `activeBattle` exists.
    beginBattle(state);
    return state;
  }

  /** Writes the chosen ground onto the province, so the fight reads it the ordinary way. */
  private applyGround(land: Land): void {
    const summary: TerrainSummary = {
      plains: 0, fields: 0, riceFields: 0, forest: 0,
      mountains: 0, hills: 0, water: 0, fortress: 0, shrine: 0,
    };
    summary[this.ground] = 12;
    land.terrainSummary = summary;
  }

  /** What the chosen ground is worth, by the same formula the fight will use. */
  private groundEdge(): number {
    const rugged = this.ground === 'mountains' ? 1
      : this.ground === 'hills' ? 0.6
        : this.ground === 'forest' ? 0.4 : 0;
    return 1 + Math.min(0.35, rugged * 0.5);
  }

  private makeHost(id: string, kingdomId: string, landId: string, men: number, arms: ArmSpread): Army {
    const archers = Math.round(men * arms.archers);
    const heavyInfantry = Math.round(men * arms.heavy);
    return {
      id,
      kingdomId,
      landId,
      name: id === 'arena-ours' ? t('arena.ourHost') : t('arena.theirHost'),
      units: { spearmen: men - archers - heavyInfantry, archers, heavyInfantry },
      morale: 85,
      supply: 90,
      level: 2,
      experience: 0,
      experienceToNextLevel: 160,
      rations: 999,
      provisions: 999,
      autoDefend: false,
    };
  }

  private startFight(): void {
    this.dismissResult();
    this.fightStartedAt = Date.now();
    const state = this.buildArenaState();
    if (state.ascent) state.ascent.arenaBubbleMs = this.bubbleChoice;
    if (this.guidedCopilot) {
      requestGuidedRun();
      this.guidedCopilot = false;
    }
    this.scene.start('ConquestScene', { state });
  }

  private push(item: Phaser.GameObjects.GameObject): void {
    this.layer.add(item);
    this.content.push(item);
  }

  private clearContent(): void {
    this.scroll?.destroy();
    this.scroll = undefined;
    for (const item of this.content) item.destroy();
    this.content = [];
  }
}
