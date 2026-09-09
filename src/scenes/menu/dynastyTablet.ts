/**
 * The dynasty tablet stamped on the front page, with the poured-reign and floor-said memories
 * only it reads.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import { dynastyProgress, dynastyProgressForXp, getDynasty } from '../../state/dynasty';
import { dynastyFounderHero } from '../../ui/dynastyPortrait';
import { renderHeroFaceInBox } from '../../ui/FaceRenderer';
import { t } from '../../i18n';
import { INK_UI } from '../../ui/InkUI';
import { drawHouseSeal, houseBanner } from '../../ui/ascent/houseBanner';
import { motionMs } from '../../game/lifeSettings';
import { drawHatch } from './helpers';
import type { MenuScene } from '../MenuScene';

/** The reign count the tablet last poured for — see the pour in `renderDynastyTablet`. */
const POURED_KEY = 'mandate:dynasty:poured:v1';

function readPouredReign(): number {
  try {
    const raw = localStorage.getItem(POURED_KEY);
    // A fresh install with reigns already banked (an imported save) must not replay every reign
    // it never saw: nothing recorded means "caught up to now".
    if (raw === null) {
      notePouredReign(getDynasty().reigns);
      return getDynasty().reigns;
    }
    return Number(raw) || 0;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function notePouredReign(reign: number): void {
  try {
    localStorage.setItem(POURED_KEY, String(reign));
  } catch {
    // Storage refused: the pour simply plays again next time, which is harmless.
  }
}

/** Whether the tablet has said the live segment's promise — the score never falls — once. */
const FLOOR_SAID_KEY = 'mandate:dynasty:floor-said:v1';

function floorSaid(): boolean {
  try {
    return localStorage.getItem(FLOOR_SAID_KEY) === '1';
  } catch {
    return true;
  }
}

function noteFloorSaid(): void {
  try {
    localStorage.setItem(FLOOR_SAID_KEY, '1');
  } catch {
    // Said again next time; harmless.
  }
}

/**
 * The house, drawn as a **bài vị** — the ancestral tablet a household keeps on its altar.
 *
 * A button said "Tông Phả ›" and a sub-label said "Cấp 2". Correct, and it taught nobody what the
 * feature was: a row of three plates where one of them happened to be the only thing on the page
 * that survives a run. The ask was that the front page *sell* it — show the score, say the words,
 * and light up when the house is owed something.
 *
 * So it is not a plate. A tablet is the object this feature already is in the culture the game is
 * drawn from: the lineage board with the house name on it, kept where the family can see it. It
 * carries the founder's own face (the wardrobe system, at the dynasty's rank, so the king ages),
 * the house name, the reign count, the level, the best score, and the XP bar along its foot. That
 * is the whole feature legible without a tap — which is what "users know about the dynasty score"
 * asks for — and it reads as a different *kind* of thing from the buttons above and below it,
 * which is what stops the column being a wall.
 *
 * **Unplayed it is an invitation, not a row of zeroes.** The frame is empty, the words say what
 * will fill it, and the border stays quiet. A page that shows a new player `Cấp 0 · 0 điểm` has
 * told them the feature is not for them.
 *
 * **Owed a choice it is stamped.** The border turns cinnabar, a seal is pressed into the corner
 * and breathes — one slow yoyo, the only motion in the column. That is the game's own vocabulary
 * for "this is signed and waiting": the Reckoning presses the same seal. A badge or a dot would
 * have been a notification; a seal is the object saying something about itself.
 */
export function renderDynastyTablet(self: MenuScene, x: number, y: number, width: number, height: number): void {
  // `cssHex` lives in the conquest chrome, which the menu does not import — one line rather
  // than a dependency on the run's UI barrel.
  const ink = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;
  const store = getDynasty();
  const progress = dynastyProgress(store);
  const opened = store.reigns > 0;
  const owed = store.pendingPicks > 0;
  const accent = owed ? INK_UI.cinnabar : opened ? INK_UI.gold : INK_UI.softBrush;

  const tablet = self.add.container(x, y);
  self.content.push(tablet);

  // The board: parchment, a heavy outer rule and a hairline inside it. The doubled rule is what
  // makes a panel read as a *document* rather than a control — see the Reckoning's edict plate.
  const board = self.add.graphics();
  board.fillStyle(INK_UI.parchment, opened ? 0.97 : 0.8);
  board.fillRoundedRect(0, 0, width, height, 5);
  board.lineStyle(owed ? 2 : 1.5, accent, owed ? 0.95 : 0.75);
  board.strokeRoundedRect(0, 0, width, height, 5);
  board.lineStyle(0.7, INK_UI.brush, 0.32);
  board.strokeRoundedRect(3.5, 3.5, width - 7, height - 7, 3);
  tablet.add(board);
  /**
   * No sawtooth band across the head.
   *
   * The drum's register is the right idiom and the wrong size for this board: drawn full width it
   * crossed the portrait recess, and on the compact form it printed straight through the house
   * name — the head is four units it does not have. The doubled rule already does the work the
   * band was there for, which is to say *document* rather than *control*.
   */

  /**
   * Three columns, and the middle one is told how much room the other two leave it.
   *
   * The portrait only exists once a reign has ended — an empty recess is a blank box, not a
   * promise — and the seal only exists while a choice is owed. Both are measured into the text's
   * wrap width rather than hoped around: the first pass let the stats line run under the seal and
   * "cao nhất 5,510" printed straight through it.
   */
  const merged = height < 52;
  /**
   * The portrait is what gives way when the board is squeezed, not the type.
   *
   * Shrinking everything produced a 44-unit tablet whose house name wrapped into its own reign
   * line: the face was taking 35 units of width the words needed. It is the most decorative thing
   * here and it is still on the sheet one tap away, so below 52 it goes and the words get the
   * whole board. The name, the level, the score, the seal and the bar all stay.
   */
  const PORTRAIT = Math.min(46, height - 20);
  /**
   * The house seal, at the head of the row, on every board.
   *
   * It used to be pressed under the wordmark on the desktop title page — a mark hanging below the
   * game's name, belonging to nothing on the page. The player designs it in the temple as *their
   * house's* sign, so it belongs on the row that says whose house it is, where it also gives the
   * Triều đại tablet the one thing it lacked: something to recognise it by at a glance, on the
   * phone and the desktop alike.
   */
  const SEAL = merged ? 20 : 24;
  const SEAL_GUTTER = 9;
  /**
   * The right column is measured off the seal's own words, not off a constant.
   *
   * The seal's caption is right-aligned at `width - 14`, and 52 units were reserved for it —
   * enough for "7 to choose" and not for "còn 7 lượt", so in Vietnamese the reign line ran
   * six units under the caption and the two printed through each other. The reserve is now the
   * caption's measured width plus its margin and a gutter.
   */
  const waitingText = owed && !merged ? t('dynasty.tabletWaiting', { n: store.pendingPicks }) : '';
  const waitingWidth = (() => {
    if (!waitingText) return 0;
    const probe = self.ui.label(0, -9999, waitingText, 'caption', { fontSize: '9px' });
    const measured = probe.width;
    probe.destroy();
    return measured;
  })();
  // Twelve units wider than the caption asks for, because the chevron now stands at the right
  // edge on an owed board too and the caption has to end clear of it.
  const rightReserve = owed ? (merged ? 34 : Math.max(58, Math.round(waitingWidth) + 32)) : 20;
  const columnFor = (withPortrait: boolean): number =>
    width - (14 + SEAL + SEAL_GUTTER + (withPortrait ? PORTRAIT + 11 : 0)) - rightReserve;
  /**
   * With a seal *and* a face on the board there is not room for both and a readable line, so the
   * face gives way — the same rule the merged board already follows, applied one size up. A
   * portrait plus a wide seal leaves the words about 105 units, and the reign line only reaches
   * that by shrinking under four fifths of its size; without the portrait it prints whole.
   */
  // Raised from 118 when the house seal took the head of the row: a seal, a face and an owed
  // caption leave the desktop board 120 units of column, which the reign line only reaches by
  // shrinking to four fifths and then ends a hair from the caption. The face gives way first.
  const MIN_TEXT_COLUMN = 132;
  const wanted = opened && !merged ? dynastyFounderHero(store) : undefined;
  const founder = wanted && columnFor(true) >= MIN_TEXT_COLUMN ? wanted : undefined;
  const sealX = 14;
  const portraitX = sealX + SEAL + SEAL_GUTTER;
  const textX = portraitX + (founder ? PORTRAIT + 11 : 0);
  const textWidth = columnFor(Boolean(founder));

  // Read by `render_game_to_text` and by the sign harness: exactly one mark on the front page,
  // and this is it.
  const sign = houseBanner();
  const seal = drawHouseSeal(self, sign, SEAL)
    .setPosition(sealX + SEAL / 2, Math.round(height / 2))
    .setData('menuKingdomSign', { ...sign, source: 'dynasty' });
  tablet.add(seal);

  if (founder) {
    // A ruled recess, so the face sits *in* the tablet rather than on it.
    const top = Math.round((height - PORTRAIT) / 2);
    const recess = self.add.graphics();
    recess.fillStyle(INK_UI.parchmentShade, 0.8);
    recess.fillRect(portraitX, top, PORTRAIT, PORTRAIT);
    recess.lineStyle(0.8, INK_UI.brush, 0.5);
    recess.strokeRect(portraitX, top, PORTRAIT, PORTRAIT);
    tablet.add(recess);
    // Inset by two: `renderHeroFaceInBox` fits the face's own extent, and a topknot pin drawn at
    // the very top of it lands on the recess rule rather than inside the frame.
    tablet.add(renderHeroFaceInBox(self, founder,
      { x: portraitX + 2, y: top + 2, width: PORTRAIT - 4, height: PORTRAIT - 4 }));
  }

  // The words. The name of the feature leads in both states — a player who has never opened it
  // has to learn what it is called before a house name can mean anything.
  /**
   * The rows are measured off the board, not written into it.
   *
   * The tablet is 58 at the 620 clamp and 68 above it, and at fixed offsets the 68-unit layout
   * printed the house name straight through the reign line on the short one. Ten units is the
   * whole difference, so the eyebrow moves up, the name drops a point, and the foot rows are
   * measured back from the bottom edge where the bar already is.
   */
  const tight = height < 64;
  /**
   * Below 52 the eyebrow stops being a row of its own: three stacked lines plus a bar need about
   * that much, and squeezed under it the name printed through the reign line. At the floor the
   * feature's name joins the house's on one line — `TÔNG PHẢ · Nhà Lê Duyệt` — which keeps the
   * word on the page while spending one row instead of two.
   */
  const eyebrowY = tight ? 9 : 11;
  const nameY = merged ? 8 : eyebrowY + 11;
  // Two more units off the foot than the bar needs, so the reign line sits above the rule
  // rather than on it — at `height - 22` the 9.5px type ended exactly where the bar begins.
  const statsY = merged ? 24 : height - 25;
  if (!merged) {
    const eyebrow = self.ui.label(textX, eyebrowY, t('dynasty.title'), 'caption', {
      fontSize: '8px', color: ink(owed ? INK_UI.cinnabar : INK_UI.gold),
    });
    eyebrow.setLetterSpacing?.(2.2);
    tablet.add(eyebrow);
  }

  const houseLine = opened
    ? (store.house ? t('dynasty.house', { name: store.house }) : t('dynasty.houseUnnamed'))
    : t('dynasty.tabletName');
  tablet.add(self.ui.label(textX, nameY,
    merged ? `${t('dynasty.title')} · ${houseLine}` : houseLine,
    'label', { fontSize: merged ? '11px' : tight ? '12px' : '13px', wordWrap: { width: textWidth } }));

  /**
   * The line says the most it has room for, and never wraps.
   *
   * With the portrait on the left and the seal on the right there are about 159 units left, and
   * "Đời 1 · Cấp 2 · cao nhất 5,510" needs more — it wrapped, and the second line fell out of the
   * bottom of the board and over the bar. The best score is the part that gives way, because
   * while a choice is owed the seal is already carrying the more urgent number, and the score is
   * on the sheet one tap away either way.
   */
  /**
   * The line is a delta, not a total.
   *
   * "Đời 5 · Cấp 3 · cao nhất 5,510" was three facts the player could not act on. What the
   * front page should say is how far the next level is and what the last reign moved it by —
   * the two numbers that make the tablet worth glancing at between runs. With a reign in
   * play (`liveReign`, written at every wave held) it says that instead: the reign is the
   * thing moving the bar right now. Fitted to the room: the long form is tried first and the
   * short one printed when the seal or the portrait leaves no space for it.
   */
  const last = store.history[store.history.length - 1];
  const short = Math.max(0, progress.need - progress.into).toLocaleString('en-US');
  const lineArgs = { level: store.level, short, next: store.level + 1, score: (store.liveReign?.score ?? last?.score ?? 0).toLocaleString('en-US') };
  // The promise the segment makes, said once the first time it appears: the score never
  // falls, so a defeat still banks it. Marked before it is drawn, so a redraw does not repeat it.
  const sayFloor = Boolean(store.liveReign) && !floorSaid();
  if (sayFloor) noteFloorSaid();
  const candidates = !opened
    ? [t('dynasty.tabletInvite')]
    : store.liveReign
      ? [...(sayFloor ? [t('dynasty.tabletFloor')] : []), t('dynasty.tabletLive', lineArgs), t('dynasty.tabletLineShort', lineArgs)]
      : last
        ? [t('dynasty.tabletLine', lineArgs), t('dynasty.tabletLineShort', lineArgs)]
        : [t(owed ? 'dynasty.tabletStatsShort' : 'dynasty.tabletStats', {
          n: store.reigns, level: store.level, score: store.bestScore.toLocaleString('en-US'),
        })];
  let statsLine = candidates[candidates.length - 1];
  for (const candidate of candidates) {
    const probe = self.ui.label(0, -9999, candidate, 'caption', { fontSize: '9.5px' });
    const fits = probe.width <= textWidth;
    probe.destroy();
    if (fits) {
      statsLine = candidate;
      break;
    }
  }
  /**
   * One line, whatever the column measures.
   *
   * The line used to be wrapped to `textWidth`, which is a second line this board has no room
   * for: 16 units below it is the progress rule, so a Vietnamese `Cấp 10 · còn 4.849 lên Cấp 11`
   * that broke after "lên" printed `Cấp 11` straight through the bar. Wrapping is off, and when
   * even the shortest candidate is over the column the type is scaled to it instead — down to
   * four fifths, which is the point where 9.5px stops being readable at arm's length.
   */
  const stats = self.ui.label(textX, statsY, statsLine, 'caption', { fontSize: '9.5px' });
  if (stats.width > textWidth) {
    stats.setOrigin(0, 0).setScale(Math.max(0.8, textWidth / stats.width));
  }
  tablet.add(stats);

  /**
   * The bar rides the foot of the board, inside the hairline — a rule that fills, not a widget.
   *
   * It is the third thing to give way, after the portrait and the eyebrow. On a 44-unit board two
   * lines of type and a bar do not fit without the stats sitting on the rule, and the level the
   * bar is a picture of is printed in words two lines above it.
   */
  if (opened && !merged) {
    // It starts where the words start, not at the board's edge: run full width it passes under
    // the portrait recess and reads as a rule cutting the frame off rather than as the text
    // column's own measure.
    const barY = height - 9;
    const barW = width - textX - 14;
    const bar = self.add.graphics();
    const fillNow = Math.min(1, progress.into / Math.max(1, progress.need));
    // The reign in play, hatched beyond the banked fill: promised, not held.
    const live = store.liveReign;
    const liveTo = live && live.score > 0
      ? (() => {
        const ahead = dynastyProgressForXp(store.xp + live.score);
        return ahead.level > store.level ? 1 : Math.min(1, ahead.into / Math.max(1, ahead.need));
      })()
      : fillNow;
    const paint = (fill: number): void => {
      bar.clear();
      bar.fillStyle(INK_UI.softBrush, 0.3);
      bar.fillRoundedRect(textX, barY, barW, 4, 2);
      bar.fillStyle(owed ? INK_UI.cinnabar : INK_UI.gold, 0.92);
      bar.fillRoundedRect(textX, barY, Math.max(4, barW * fill), 4, 2);
      if (liveTo > fill) drawHatch(bar, textX + barW * fill, barY, barW * (liveTo - fill), 4, INK_UI.jade);
    };
    /**
     * The pour, once per banked reign.
     *
     * The first time the front page is drawn after a reign banks, the bar fills from where it
     * stood before that reign to where it stands now — the same passage the ceremony played,
     * replayed on the tablet so the home page is where the progress is *seen* to land. Marked
     * before the tween starts, so a redraw mid-pour (a settings change, a language switch)
     * cannot replay it, and it never plays for a reign that banked on another day.
     */
    const poured = readPouredReign();
    const lastScore = store.history[store.history.length - 1]?.score ?? 0;
    if (store.reigns > poured && lastScore > 0 && motionMs(1400) > 0) {
      notePouredReign(store.reigns);
      const before = dynastyProgressForXp(Math.max(0, store.xp - lastScore));
      const from = before.level < store.level ? 0 : Math.min(1, before.into / Math.max(1, before.need));
      const counter = { v: from };
      paint(from);
      self.tweens.add({
        targets: counter, v: fillNow, duration: motionMs(1400), delay: motionMs(300), ease: 'Cubic.easeOut',
        onUpdate: () => { if (bar.active) paint(counter.v); },
        onComplete: () => { if (bar.active) paint(fillNow); },
      });
      // The slip: "+3,120" rises off the bar's end, the way the run chip's does — the home
      // page shows what changed without being opened.
      const slip = self.ui.label(textX + barW, barY - 4, `+${lastScore.toLocaleString('en-US')}`, 'caption',
        { fontSize: '10px', color: '#8a5f1c', fontStyle: '700', align: 'right' }).setOrigin(1, 1).setAlpha(0);
      tablet.add(slip);
      self.tweens.add({ targets: slip, alpha: 1, y: barY - 14, delay: motionMs(300), duration: motionMs(600), ease: 'Cubic.easeOut' });
      self.tweens.add({ targets: slip, alpha: 0, y: barY - 26, delay: motionMs(1400), duration: motionMs(700), ease: 'Sine.easeIn' });
    } else {
      paint(fillNow);
    }
    tablet.add(bar);
  }

  if (owed) {
    /**
     * Pressed, and breathing.
     *
     * One slow yoyo on the seal alone — not the tablet, which would make the type swim. It is the
     * only motion in the column, so it reads as *this one thing wants you* rather than as a page
     * that fidgets. Killed in `clearContent`: a repeating tween left running against a destroyed
     * graphic either throws or lands an alpha on a recycled object.
     *
     * It is the row's own seal that breathes, not a second one stamped in the corner. While the
     * mark lived under the wordmark there were two houses' worth of seal on the front page and
     * the corner one was the only one that meant anything; now the mark and the summons are the
     * same object, and the caption beside it says how many choices are waiting.
     */
    self.dynastyPulse?.remove();
    self.dynastyPulse = self.tweens.add({
      targets: seal,
      alpha: { from: 1, to: 0.42 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // On the compact board the seal says it alone — a chip beside it would sit under it.
    if (!merged) {
      tablet.add(self.ui.label(width - 26, statsY, waitingText, 'caption',
        { fontSize: '9px', color: ink(INK_UI.cinnabar), align: 'right' }).setOrigin(1, 0));
    }
  }
  // The way in, at the edge the eye leaves by. It stays on an owed board too: the seal that used
  // to stand here moved to the head of the row, and without the chevron the tablet lost the one
  // thing that said it opens.
  tablet.add(self.ui.label(width - 15, Math.round(height / 2) - 9, '›', 'label',
    { fontSize: '16px', color: ink(accent) }).setOrigin(0.5, 0));

  const hit = self.add.rectangle(width / 2, height / 2, width, Math.max(height, 44), 0xffffff, 0.001)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerup', () => { self.mode = 'dynasty'; self.render(); });
  tablet.add(hit);
  // Not `menuSecondary`: that key means a stamped plate of the secondary tier, and
  // `verify-menu-icons-flags` measures everything wearing it against that tier's rules.
  tablet.setData('menuTablet', 'dynasty');
  // A container reports no size of its own, and the sign harness measures the seal against the board.
  tablet.setData('tabletBox', { width, height });
}
