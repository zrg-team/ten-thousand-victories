import { measureInkText } from '../../../ui/InkVirtualList';
/**
 * The lane: the door in, the scrolling body every bar screen fills, and the door out.
 *
 * `openLane` is the single entry to all eight — build, heroes, court, battle, army, affairs,
 * chronicle, ledger — and `laneList` is the sheet they differ only in the contents of. Both ends
 * are one mechanism: `openLane` stashes `lanePauseBeforeOpen`, `closeLane` alone hands it back.
 * The room `laneList` takes off the scroll height and the offsets `finish` pins against
 * `GAME_HEIGHT` are the same numbers spent twice — the back button's 34, the toggle's 54 — so
 * moving one without the other prints the last row through the footer. Scroll areas opened here
 * go onto `self.activeScrollAreas`; only a teardown that destroys them takes their six scene-level
 * listeners off again.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, HEADER_HEIGHT } from '../../../game/constants';
import { hudSheetHeight } from '../../../game/cameraLayout';
import { laneIsDocked } from '../hudSheet';
import { RectClip } from '../../../ui/ink/clipRect';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { openingFor, takeOpening } from '../../../systems/story/StorySystem';
import { contestedFronts } from '../../../systems/ascent/battleReport';
import { storyText } from '../../../i18n/story';
import { INK_UI, INK_UI_HEX, scrollGestureConsumedTap, type UIBounds } from '../../../ui/InkUI';
import { UI_FONT } from '../../../ui/fonts';
import { t } from '../../../i18n';
import type { AscentLane, Hero } from '../../../state/types';
import {
  LANE_CLOSE_BUTTON_HEIGHT, LANE_CLOSE_BUTTON_OFFSET, LANE_FOOTER_HEIGHT, cssHex, footerSplit,
} from '../constants';
import { clearLanePage } from '../layers';
import { delegateBattle } from '../../../systems/ascent/BattleSystem';
import type { ConquestUIScene } from '../../ConquestUIScene';
import { soundDirector } from '../../../ui/sound/SoundDirector';

/** The ghost "back" button a lane sub-page shows above its footer button. */
const LANE_BACK_BUTTON_HEIGHT = 34;
/**
 * One waiting decision, as a row. Twenty-four points is the short side of a phone list row: still
 * a comfortable thumb target, but small enough that three of them read as a strip rather than a
 * page. Reported as *"each items must smaller"* — thirty took as much height as the picker below.
 */
const LANE_DOCK_ROW_HEIGHT = 24;
/**
 * The sheet's header: a grab handle, the title, and the round chevron that folds it.
 *
 * This is the only part of the sheet that is ever in the layout — everything else floats over the
 * page when the sheet is up, and is simply not there when it is down.
 */
const LANE_SHEET_HEADER_HEIGHT = 34;
/** Never more than three, whatever the lane offers. */
const LANE_DOCK_MAX_ITEMS = 3;
/**
 * A checkbox strip pinned above the footer button: box, label, and a hint under it.
 *
 * Tall enough for the hint to wrap to two lines. At 34 it did not, and the second line ran
 * under the Close button.
 */
const LANE_TOGGLE_HEIGHT = 54;
/**
 * A segmented picker pinned in the same footer band the toggle uses: heading, a row of tiles,
 * and a note under them. The court's standing course lives here — a choice the player changes
 * while reading belongs in the same thumb reach the consent checkboxes taught.
 */
const LANE_PICKER_HEIGHT = 78;
/** A fixed tab strip between the page heading and its scrolling body. */
const LANE_TABS_HEIGHT = 32;
const LANE_TABS_GAP = 8;
/** Width of the portrait column beside a hero row. */
const LANE_PORTRAIT_COLUMN = 62;

export function openLane(self: ConquestUIScene, lane: AscentLane): void {
  if (self.state.pendingAscentPrompt) return;
  // The Battle lane is two screens: the fight, when there is one, and the war board when there
  // is not. It used to be one screen and a dead button — and the screen opens for a measured
  // 6–15 of the 20–96 engagements a run settles, so for most of a wave the one control with
  // anything to say about the war refused to open at all. `showBattle` picks between them.
  //
  // The finished-fight ledger used to keep this door open on its own, and the board is not a
  // ledger any more — the page is the war being fought, so with no fight and no front there is
  // nothing behind the button but a heading.
  if (lane === 'battle' && !self.state.ascent?.activeBattle
    && contestedFronts(self.state).length === 0) return;

  self.lanePauseBeforeOpen = self.state.isStrategyPause;
  // Every lane freezes the world so the player can read it — except the battle, which *is* the
  // world happening. Pausing here stopped the economy tick, which stopped `advanceBattle`,
  // which froze the siege at beat 0 for as long as anyone watched it: the exact freeze this
  // whole design removed, reintroduced through the lane mechanism. Only caught by finally
  // opening the screen and waiting sixteen seconds.
  //
  // **And the battle lane does not merely decline to pause — it un-pauses.** It used to carry
  // whatever hold was in force when it opened, which is right for a screen you are reading and
  // wrong for the one screen that *is* the world: any stray strategy pause (a lane closed onto
  // it, a board, a card) reopened the fight frozen at beat 15 with the only working control
  // reading "Tiếp tục". Reported verbatim: *fight stop in middle, nothing to do.* Walking into a
  // fight is an instruction to fight it; the opening drum sets its own hold a moment later
  // (`maybeAutoOpenBattle`), and the player's own Pause is still theirs to press.
  if (lane === 'battle') {
    self.lanePauseBeforeOpen = false;
    self.state.isStrategyPause = false;
    // And the hard clock with it. `isWorldHalted` reads both, so clearing only the strategy
    // pause still opened the fight frozen — for a player who had pressed Pause on the map, or
    // for one whose last card left `isPaused` set. This screen has its own Pause.
    self.state.isPaused = false;
  } else {
    self.state.isStrategyPause = true;
  }
  self.beginOverlay(`lane:${lane}`);

  buildLanePage(self, () => {
    switch (lane) {
      case 'build': {
        // Opened from the map's inspect card, the lane starts on the province that was tapped —
        // and on the picker the button named, rather than on the realm-wide list the player would
        // then have to find that province in again.
        const handover = self.landHandover;
        self.landHandover = undefined;
        if (handover?.page === 'governor') self.showGovernorPicker(handover.landId);
        else if (handover?.page === 'focus') self.showFocusPicker(handover.landId);
        else if (handover) self.showBuildOptions(handover.landId);
        else self.showBuildScreen();
        break;
      }
      case 'heroes': self.showHeroesScreen(); break;
      case 'court': self.showCourtScreen(); break;
      case 'battle': self.showBattle(); break;
      case 'army':
        // A plan handed over by the muster card opens on the form, filled in; any other entry
        // starts the lane clean.
        if (self.musterHandover) {
          self.musterDraft = self.musterHandover;
          self.musterHandover = undefined;
          self.showArmyScreen();
          self.showRaiseHostForm();
        } else {
          self.musterDraft = undefined;
          self.showArmyScreen();
        }
        break;
      case 'affairs': self.showAffairsScreen(); break;
      case 'chronicle': self.showChronicleScreen(); break;
      case 'ledger': self.showLedgerScreen(); break;
    }
  });

  // Checked here as well as in `refresh` so a lane that declines to draw costs the player a
  // wasted tap rather than a blank screen until the next tick.
  if (self.modalLayer.length === 0) closeLane(self);
}

/**
 * The scrolling body every bar screen shares: a titled frame, a scroll area, and a helper
 * that appends one tappable row. Factored out so the five screens differ only in content.
 */
export function laneList(self: ConquestUIScene,
  title: string,
  subtitle: string,
  laneOpts: {
    /** A primary action in the close button's slot, in place of Close. */
    footer?: {
      label: string;
      onTap: () => void;
      disabled?: boolean;
      /**
       * This button *is* the way out — do not pair a close beside it.
       *
       * Only true where closing the lane any other way would leave state behind: the aftermath
       * report clears `pendingAftermath` as it dismisses, so a plain close there would put the
       * same screen straight back on the player.
       */
      soleAction?: boolean;
    };
    /**
     * A free-form control the sheet carries, built the way `addWidget` builds one.
     *
     * The court's tax dial is the case this exists for: a standing policy the player changes
     * while reading the page, which belongs in the same place every other standing choice on
     * the page now lives.
     */
    footerWidget?: {
      height: number;
      build: (parent: Phaser.GameObjects.Container, width: number) => void;
    };
    /**
     * A checkbox pinned just above the footer button, in the same thumb reach.
     *
     * A setting the player toggles while reading belongs at the foot for the same reason
     * the battle exits were moved there: the top of a phone is where a one-handed grip
     * cannot go without shifting, and a control nobody can reach is a control nobody uses.
     * The whole row is the hit area, label included.
     */
    footerToggle?: { label: string; hint?: string; checked: boolean; onToggle: () => void };
    /**
     * A segmented choice pinned above the footer button, in the toggle's slot — for the one
     * standing setting on a page that has more than two answers.
     */
    footerPicker?: { label: string; options: string[]; note: string; selected: number; onPick: (index: number) => void };
    /** A fixed tab strip for long screens that are easier to scan as separate shelves. */
    tabs?: {
      items: Array<{ label: string; count?: number }>;
      active: number;
      onSelect: (index: number) => void;
    };
    /**
     * **What this lane is waiting on, listed at the foot where a thumb already is.**
     *
     * The lane pages read top-down and act bottom-up. A page opens on its title and its numbers —
     * things you read, and reading needs no reach — while everything that answers the player sits
     * in the band a one-handed grip can actually get to. Measured against the live surface (390
     * wide, 620–1040 tall), the top third of a lane is about a thousand units from a resting
     * thumb: putting the important decision *first* put it exactly where it could not be pressed.
     *
     * So the decisions waiting on the player are listed here, each one a row that goes straight to
     * the thing that answers it, and the dock is absent entirely when nothing is waiting. Drawn
     * above the close button and the rest of the footer stack, all of which keep their existing
     * places and behaviour.
     */
    dock?: {
        label?: (shown: number) => string;
        items: Array<{ label: string; hint?: string; onPress: () => void }>;
        /** Redraws this page, so the dock can open and close without the lane knowing how. */
        rebuild?: () => void;
      };
    /** A ghost "back" above the footer button, for pages one step inside a lane. */
    back?: () => void;
  } = {},
): {
  content: UIBounds;
  addRow: (
    opts: { title: string; subtitle: string; border: number; muted?: boolean; portrait?: Hero; status?: string },
    onTap?: () => void,
  ) => void;
  addHeading: (title: string, hint?: string) => void;
  addNote: (text: string, tone?: number) => void;
  addWidget: (
    height: number,
    build: (parent: Phaser.GameObjects.Container, width: number) => number | void,
  ) => void;
  finish: () => void;
} {
  // A lane takes the readout band too — see `promptFrame`. A page you opened to work in has no
  // use for the between-decisions numbers, and forty-eight points is the difference between four
  // rows and five on a 620-high screen.
  const content = self.promptFrame(title, subtitle, { coverReadout: true });
  // At most three. A dock that grows without limit is a second page pinned over the first, and the
  // point of it is to be the short answer to "what now" — the lane itself is where everything else
  // lives.
  const dockItems = (laneOpts.dock?.items ?? []).slice(0, LANE_DOCK_MAX_ITEMS);
  // **One bottom sheet, and everything the foot of the page holds is inside it.**
  //
  // Four passes got this wrong the same way. The pieces at the foot — what the lane is waiting on,
  // its segmented picker, its checkbox — were three separate strips, each laid out in the footer
  // and each taking its height off the scrolling body. "Folding" folded one of the three, so the
  // page stayed just as full and the fold did nothing anyone could see.
  //
  // A sheet is one panel. It has a header — a grab handle, a title, and a chevron — and it holds
  // the whole of the foot: the action list *and* the lane's own selects. It folds as a unit, down
  // to that header alone, and only the header is ever in the layout:
  //
  // - `sheetLayoutHeight` — what the scrolling body gives up. The **shut** height, always, so the
  //   body is sized once and raising the sheet cannot take another point from it.
  // - `sheetDrawHeight` — what is painted. Raised, the extra is drawn upward over the body behind
  //   a scrim, and it is all taken back the moment the sheet folds.
  //
  // **A page has a sheet if it has anything to put in one**, not only if something is waiting.
  //
  // It was gated on the action list alone, so the sheet came and went: the war page had one on a
  // fresh run and none an hour later once its host had a commander, and the host detail — the page
  // a run is actually spent in — showed none at all whenever nothing was urgent, which is most of
  // the time. Reported as the sheet being on the wrong page and missing from the right one.
  //
  // The rule is the contents: any waiting action, any standing select, any dial. That is every one
  // of the five pages that carry such a thing, and they all now fold the same way.
  const hasSheet = dockItems.length > 0
    || Boolean(laneOpts.footerPicker)
    || Boolean(laneOpts.footerToggle)
    || Boolean(laneOpts.footerWidget);
  const sheetOpen = hasSheet && self.dockExpanded === true;
  const sheetPicker = hasSheet && Boolean(laneOpts.footerPicker);
  const sheetToggle = hasSheet && Boolean(laneOpts.footerToggle);
  const sheetWidget = hasSheet ? laneOpts.footerWidget : undefined;
  // What the sheet's body measures when it is up. Computed in both states, because the fold
  // needs the distance whichever way it is going.
  const sheetOpenBodyHeight = dockItems.length * LANE_DOCK_ROW_HEIGHT
    + (sheetWidget ? sheetWidget.height + 8 : 0)
    + (sheetPicker ? LANE_PICKER_HEIGHT + 8 : 0)
    + (sheetToggle ? LANE_TOGGLE_HEIGHT + 8 : 0);
  const sheetBodyHeight = sheetOpen ? sheetOpenBodyHeight : 0;
  const sheetDrawHeight = hasSheet ? LANE_SHEET_HEADER_HEIGHT + sheetBodyHeight + 8 : 0;
  const sheetLayoutHeight = hasSheet ? LANE_SHEET_HEADER_HEIGHT + 8 : 0;
  // **Two buttons sit side by side; only a third one starts a second row.**
  //
  // A lane's "back" was a full-width button stacked above the close, while a prompt put the same
  // pair left and right — the same two controls in two different arrangements depending on which
  // frame drew the page. A page with a back and nothing else now puts it beside the close, in the
  // one row, and gives the thirty-four points back to the body. A page that also carries its own
  // action genuinely has three, and that one keeps the row above.
  const backSharesRow = Boolean(laneOpts.back) && !laneOpts.footer;
  const backExtra = laneOpts.back && !backSharesRow ? LANE_BACK_BUTTON_HEIGHT + 8 : 0;
  const footerExtra = backExtra
    + (hasSheet
      ? sheetLayoutHeight
      : (laneOpts.footerToggle ? LANE_TOGGLE_HEIGHT + 8 : 0)
        + (laneOpts.footerPicker ? LANE_PICKER_HEIGHT + 8 : 0));
  const tabsExtra = laneOpts.tabs ? LANE_TABS_HEIGHT + LANE_TABS_GAP : 0;
  const scroll = self.ui.scrollArea({
    x: content.x,
    y: content.y + tabsExtra,
    width: content.width,
    height: content.height - LANE_FOOTER_HEIGHT - footerExtra - tabsExtra,
  });
  scroll.addTo(self.modalLayer);
  self.activeScrollAreas.push(scroll);

  if (laneOpts.tabs) {
    const cfg = laneOpts.tabs;
    const gap = 4;
    const width = (content.width - gap * Math.max(0, cfg.items.length - 1)) / Math.max(1, cfg.items.length);
    cfg.items.forEach((item, index) => {
      const selected = index === cfg.active;
      const x = content.x + index * (width + gap);
      self.modalLayer.add(self.ui.panel({ x, y: content.y, width, height: LANE_TABS_HEIGHT }, selected
        ? {
            fill: INK_UI.goldLight,
            fillShade: INK_UI.gold,
            border: INK_UI.cinnabar,
            borderWidth: 1.6,
          }
        : {
            fill: INK_UI.parchment,
            fillAlpha: 0.35,
            border: INK_UI.softBrush,
            borderWidth: 1,
            muted: true,
          }));
      const count = item.count ?? 0;
      const label = count > 0 ? `${item.label} ${count}` : item.label;
      self.modalLayer.add(self.add.text(x + width / 2, content.y + LANE_TABS_HEIGHT / 2, label, {
        color: selected ? cssHex(INK_UI.cinnabarDark) : INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '9px',
        fontStyle: selected ? '700' : '600',
        align: 'center',
        wordWrap: { width: width - 6 },
      }).setOrigin(0.5));
      if (!selected) {
        const hit = self.add.rectangle(x, content.y, width, LANE_TABS_HEIGHT, INK_UI.brush, 0.001)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true });
        hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
          // A release at the end of a scroll is not a choice.
          if (scrollGestureConsumedTap(pointer)) return;
          soundDirector.tap();
          cfg.onSelect(index);
        });
        self.modalLayer.add(hit);
      }
    });
  }

  const anchorKey = `laneScroll:${title}:${laneOpts.tabs?.active ?? 0}`;
  const savedAnchor = self.data.get(anchorKey) as ReturnType<typeof scroll.snapshotAnchor> | undefined;
  scroll.onDispose(() => self.data.set(anchorKey, scroll.snapshotAnchor()));
  const rowWidth = content.width - 6;
  let y = 0;

  const addRow = (
    opts: { title: string; subtitle: string; border: number; muted?: boolean; portrait?: Hero; status?: string },
    onTap?: () => void,
  ) => {
    // A portrait sits in its own column beside the card, so a hero row is recognisable at a
    // glance and the card's own auto-fit is untouched.
    const faceCol = opts.portrait ? LANE_PORTRAIT_COLUMN : 0;
    const measuredHeight = self.ui.measureCard(rowWidth - faceCol, 54, opts);
    const top = y;
    scroll.lazyRow(`${opts.portrait?.id ?? opts.title}`, top, measuredHeight + 8, () => {
    const y = top;
    const row = self.ui.card({ x: faceCol, y, width: rowWidth - faceCol, height: 54 }, opts);
    const height = (row.getData('cardHeight') as number) ?? 54;
    let holder: Phaser.GameObjects.Container = row;
    if (opts.portrait) {
      holder = self.add.container(0, y);
      row.setPosition(faceCol, 0);
      holder.add(row);
      holder.add(renderHeroFaceInBox(self, opts.portrait, { x: 0, y: 2, width: faceCol - 6, height: Math.max(40, height - 4) }));
    }
    if (onTap) {
      const hit = self.add
        .rectangle(rowWidth / 2 - (opts.portrait ? 0 : 0), height / 2, rowWidth, height, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      if (opts.portrait) hit.setPosition(rowWidth / 2, height / 2);
      // A drag that ends over this row scrolled the list; it did not pick it.
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) {
          return;
        }
        onTap();
      });
      (opts.portrait ? holder : row).add(hit);
    }
    scroll.content.add(holder);
    });
    y += measuredHeight + 8;
  };

  /**
   * A divider between groups of rows — **not a row**.
   *
   * Written first as `addRow` with a muted border, which is the obvious thing and is wrong: a
   * card is a card, so the headings arrived as five more boxes in a column of boxes and the
   * screen read as a longer list rather than a divided one. A heading has to be a different
   * *kind* of mark, so it is set as small letter-spaced caps against the paper with a hairline
   * rule beside it, and no surface at all.
   */
  const addHeading = (headingTitle: string, hint?: string) => {
    if (y > 0) y += 14;
    const top = y;
    const hintStyle = { color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', wordWrap: { width: rowWidth - 4 } };
    const height = 20 + (hint ? measureInkText(self, hint, hintStyle) + 4 : 0);
    scroll.lazyRow(`heading:${headingTitle}`, top, height, () => {
      const label = self.add.text(2, top, headingTitle.toLocaleUpperCase(), { color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700' }).setOrigin(0);
      label.setLetterSpacing?.(1.6); scroll.content.add(label);
      const rule = self.add.graphics(); rule.lineStyle(1, INK_UI.brush, .22); rule.lineBetween(label.width + 10, top + 6, rowWidth, top + 6); scroll.content.add(rule);
      if (hint) scroll.content.add(self.add.text(2, top + 16, hint, hintStyle).setOrigin(0).setAlpha(.85));
    });
    y += height;
  };

  /**
   * A statement in the list's flow: text on the paper, with no surface at all.
   *
   * Half of what these screens say is not a control — "no enemy host stands inside the realm's
   * sight", "the next wave lands in ten seasons", "the realm can court only so many provinces at
   * once". Given a card each, as they were, they read as things to press, and each one costs the
   * room of a thing you can press. A statement should take the room a sentence takes.
   */
  const addNote = (text: string, tone?: number) => {
    const top = y;
    const style = { color: tone ? cssHex(tone) : INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '11px', lineSpacing: 1, wordWrap: { width: rowWidth - 4 } };
    const height = measureInkText(self, text, style) + 8;
    scroll.lazyRow(`note:${text}`, top, height, () => scroll.content.add(self.add.text(2, top, text, style).setOrigin(0)));
    y += height;
  };

  /**
   * A custom widget (a slider, a chart, a grid of tiles) slotted into the list's flow.
   *
   * The builder may RETURN its height, for anything whose size is only known once its text has
   * been measured — a two-column grid of tiles cannot be told how tall it is in advance, and
   * guessing leaves either a gap under it or the next block written over it. `height` stays as
   * the answer for widgets that do know.
   */
  const addWidget = (
    height: number,
    build: (parent: Phaser.GameObjects.Container, width: number) => number | void,
  ) => {
    const holder = self.add.container(0, y).setData('virtualFlow', { scroll, top: y });
    const measured = build(holder, rowWidth);
    scroll.content.add(holder);
    y += (typeof measured === 'number' ? measured : height) + 8;
  };

  const finish = () => {
    scroll.setContentHeight(Math.max(content.height - LANE_FOOTER_HEIGHT - footerExtra - tabsExtra, y));
    if (savedAnchor) scroll.restoreAnchor(savedAnchor);

    // **The whole foot is one panel, edge to edge, and everything else sits on it.**
    //
    // Reported twice: *it doesn't feel like a panel*, and *the UI is mixed with the other things*.
    // Both were the same fault. The dock was a card floating in the middle of a stack — the
    // waiting rows, then the doctrine picker, then the close button, three surfaces at three
    // widths with the page showing between them. Nothing said where the page stopped and the
    // controls began, so the eye read the bottom third as debris.
    //
    // A single full-bleed band fixes that without moving a single control: it runs from the top of
    // the footer stack to the bottom edge of the screen, so the picker, the toggle and the close
    // are *on* it rather than beside it. Drawn first, so everything already down there paints over
    // it and keeps the position it had.
    //
    // Full width on purpose. A band with side margins is another card; a band that reaches both
    // edges is the bottom of the screen, which is what it is.
    const belowStack = backExtra;
    // Where the foot of the page begins. With a sheet this is the sheet's own top edge and it
    // moves as the sheet folds; without one it is the top of the fixed footer chrome.
    const stackTop = hudSheetHeight() - LANE_CLOSE_BUTTON_OFFSET - belowStack
      - (hasSheet
        ? sheetDrawHeight
        : (laneOpts.footerToggle ? LANE_TOGGLE_HEIGHT + 8 : 0)
          + (laneOpts.footerPicker ? LANE_PICKER_HEIGHT + 8 : 0));

    // The scrim, only while the sheet is up over the body. It is what makes an overlay read as an
    // overlay rather than as the page having lost half its height, and it is the second way to
    // fold it — tapping off a sheet closes it, on a phone, always.
    if (sheetOpen) {
      // Down past the sheet's top edge, not to it. The corners are cut, so a scrim that stops on
      // the line leaves two bright notches beside them where the page shows through undimmed —
      // reported exactly that way. The sheet is drawn over this, so the overlap never shows.
      //
      // From the top of the page, not of the sheet: docked at the desktop's right edge the page
      // sits under a top bar that runs the whole sheet, and a scrim over the bar's last 390 units
      // darkened one segment of it while the sheet was up — a bar of two tones.
      const scrimTop = laneIsDocked(self) ? HEADER_HEIGHT : 0;
      const scrim = self.add.rectangle(
        0, scrimTop, GAME_WIDTH, stackTop + 14 - scrimTop, INK_UI.brush, 0.16,
      ).setOrigin(0, 0).setInteractive();
      if (self.dockSlideFrom) {
        scrim.setAlpha(0);
        const fade = self.tweens.add({ targets: scrim, alpha: 1, duration: 190 });
        scrim.once('destroy', () => fade.remove());
      }
      scrim.on('pointerdown', (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        self.dockExpanded = false;
        self.dockSlideFrom = -sheetOpenBodyHeight;
        const redraw = laneOpts.dock?.rebuild ?? self.lanePageBuild;
        if (redraw) self.replaceLanePage(redraw);
      });
      self.modalLayer.add(scrim);
    }

    // **One layer for the whole sheet, so one tween moves all of it.**
    //
    // The panel, its header and its contents are drawn at their final coordinates and the layer
    // is offset by the distance the fold has to cover; the tween takes that offset back out. The
    // close button is deliberately NOT in here — it is the page's, not the sheet's, and it must
    // sit still while the sheet moves past it.
    const sheetLayer = self.add.container(0, self.dockSlideFrom ?? 0);
    // Docked at the desktop's right edge, the panel ends where the bottom bar begins and the bar
    // stays up beside it — so the sheet's deliberate overhang (below) and its slide would land on
    // the bar. The whole layer is bracketed by a stencil that ends at the panel's foot: nothing
    // the sheet draws or slides through shows below it. A no-op on the phone, where the bar is
    // down under a lane.
    const foot = laneIsDocked(self)
      ? new RectClip(self, { x: 0, y: HEADER_HEIGHT, width: GAME_WIDTH, height: hudSheetHeight() - HEADER_HEIGHT })
      : undefined;
    foot?.begin(self.modalLayer);
    self.modalLayer.add(sheetLayer);
    if (foot) {
      foot.end(self.modalLayer);
      foot.apply(sheetLayer);
      sheetLayer.once('destroy', () => foot.destroy());
    }
    if (self.dockSlideFrom) {
      const slide = self.tweens.add({
        targets: sheetLayer, y: 0, duration: 190, ease: 'Cubic.easeOut',
      });
      // A lane torn down mid-slide would leave the tween writing to a destroyed container.
      sheetLayer.once('destroy', () => slide.remove());
    }
    self.dockSlideFrom = undefined;
    const sheetHost = hasSheet ? sheetLayer : self.modalLayer;

    // **The sheet is a printed sheet, drawn the way every other surface in the game is drawn.**
    //
    // It had a geometric rounded rectangle with a flat 1.5px stroke, which is the one border in
    // the game that is not hand-drawn — reported as not following the style at all. `InkUI.panel`
    // is the same surface the cards, the tax dial and the stat blocks stand on: a washed parchment
    // fill, cut corners, a wobbly ink outline and a second rule just inside it.
    //
    // Drawn taller than the screen so its bottom edge and cut corners fall off it: this is the
    // bottom of the display, not a card floating above it, and sliding it down can never open a
    // gap underneath.
    //
    // A page with no sheet gets no surface at all. The band was for a *lane* — one ground under
    // the sheet, its picker and its close. On a page that has none of that it was a lighter
    // rectangle behind two buttons, and the strip left below the close read as a stray white band
    // at the foot of the screen.
    if (hasSheet) {
      sheetHost.add(self.ui.panel(
        {
          x: 0,
          y: stackTop,
          width: GAME_WIDTH,
          height: hudSheetHeight() + sheetOpenBodyHeight + 60 - stackTop,
        },
        { borderWidth: 1.6, borderAlpha: 0.7 },
      ));
    }

    if (hasSheet) {
      // ── The header ────────────────────────────────────────────────────────
      //
      // A grab handle, the title with its count, and a round chevron at the right. The whole bar
      // is the target: a chevron this size is not something a thumb should have to hit exactly,
      // and on a sheet the header is the fold control whether or not you aim at the glyph.
      const handle = self.add.graphics();
      handle.fillStyle(INK_UI.softBrush, 0.75);
      handle.fillRoundedRect(GAME_WIDTH / 2 - 17, stackTop + 6, 34, 4, 2);
      sheetHost.add(handle);

      const headMid = stackTop + 22;
      // With something waiting the header counts it; with nothing waiting the sheet is still the
      // home of the page's standing settings, and calling that "0 things to do" would be a lie
      // about an otherwise useful panel.
      const title = laneOpts.dock?.label?.(dockItems.length)
        ?? (dockItems.length > 0
          ? t('ascent.lane.actions', { n: dockItems.length })
          : t('ascent.lane.options'));
      sheetHost.add(self.add.text(
        content.x, headMid, title,
        {
          color: INK_UI.inkText, fontFamily: UI_FONT,
          fontSize: '12px', fontStyle: '700',
        },
      ).setOrigin(0, 0.5));

      // The chevron, and only the chevron. It had a grey disc behind it, which put a second
      // button-shaped thing on a header whose whole width is already the button.
      sheetHost.add(self.add.text(
        content.x + content.width, headMid, sheetOpen ? '▾' : '▴',
        { color: INK_UI.mutedText, fontFamily: UI_FONT, fontSize: '15px', fontStyle: '700' },
      ).setOrigin(1, 0.5));

      const headHit = self.add.rectangle(
        0, stackTop, GAME_WIDTH, LANE_SHEET_HEADER_HEIGHT, INK_UI.brush, 0.001,
      ).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      headHit.on('pointerdown', (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        self.dockExpanded = !sheetOpen;
        // Up when it is opening, down when it is folding — the new sheet starts that far out of
        // place and tweens home, so the movement is the sheet's own.
        self.dockSlideFrom = sheetOpen ? -sheetOpenBodyHeight : sheetOpenBodyHeight;
        const redraw = laneOpts.dock?.rebuild ?? self.lanePageBuild;
        if (redraw) self.replaceLanePage(redraw);
      });
      sheetHost.add(headHit);
    }

    // ── The action rows, inside the sheet ───────────────────────────────────
    if (sheetOpen) {
      const rowsTop = stackTop + LANE_SHEET_HEADER_HEIGHT;
      dockItems.forEach((item, index) => {
        const rowY = rowsTop + index * LANE_DOCK_ROW_HEIGHT;
        const mid = rowY + LANE_DOCK_ROW_HEIGHT / 2;
        const rule = self.add.graphics();
        rule.lineStyle(1, INK_UI.softBrush, 0.5);
        rule.lineBetween(content.x, rowY, content.x + content.width, rowY);
        sheetHost.add(rule);

        sheetHost.add(self.add.text(
          content.x + 2, mid, item.label,
          {
            color: cssHex(INK_UI.cinnabarDark), fontFamily: UI_FONT,
            fontSize: '10.5px', fontStyle: '600',
            wordWrap: { width: content.width - 26 },
          },
        ).setOrigin(0, 0.5));
        sheetHost.add(self.add.text(
          content.x + content.width, mid, '›',
          { color: cssHex(INK_UI.cinnabar), fontFamily: UI_FONT, fontSize: '13px' },
        ).setOrigin(1, 0.5));

        // The whole row, and on the press — the same as every other control in this mode. The
        // teardown that follows swallows the rest of the gesture (see `clearLanePage`), so the
        // release cannot go on to press whatever the new page puts under the finger.
        const hit = self.add.rectangle(
          content.x, rowY, content.width, LANE_DOCK_ROW_HEIGHT, INK_UI.brush, 0.001,
        ).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          item.onPress();
        });
        sheetHost.add(hit);
      });
    }

    // Where the picker and the toggle sit: stacked under the rows when they are in the sheet,
    // and in the fixed footer band when the lane has no sheet to put them in.
    const sheetRowsBottom = stackTop + LANE_SHEET_HEADER_HEIGHT
      + dockItems.length * LANE_DOCK_ROW_HEIGHT;
    const widgetY = sheetRowsBottom + 8;
    const pickerY = sheetOpen
      ? sheetRowsBottom + (sheetWidget ? sheetWidget.height + 8 : 0) + 8
      : hudSheetHeight() - LANE_CLOSE_BUTTON_OFFSET - belowStack
        - (laneOpts.footerToggle ? LANE_TOGGLE_HEIGHT + 8 : 0)
        - LANE_PICKER_HEIGHT - 8;
    const toggleY = sheetOpen
      ? sheetRowsBottom + (sheetWidget ? sheetWidget.height + 8 : 0)
        + (sheetPicker ? LANE_PICKER_HEIGHT + 8 : 0) + 8
      : hudSheetHeight() - LANE_CLOSE_BUTTON_OFFSET - belowStack - LANE_TOGGLE_HEIGHT - 8;
    // Folded, they are not drawn at all — they are the sheet's contents, and a sheet that folds
    // its title but keeps its body is the thing four rounds of this were reported for.
    const drawFooterControls = !hasSheet || sheetOpen;

    if (sheetWidget && sheetOpen) {
      const holder = self.add.container(content.x, widgetY);
      sheetWidget.build(holder, content.width);
      sheetHost.add(holder);
    }
    if (laneOpts.footerPicker && drawFooterControls) {
      const cfg = laneOpts.footerPicker;
      const holder = self.add.container(content.x, pickerY);
      self.segmentedRow(holder, content.width, {
        label: cfg.label,
        options: cfg.options,
        note: cfg.note,
        selected: cfg.selected,
        onPick: cfg.onPick,
      });
      sheetHost.add(holder);
    }
    if (laneOpts.footerToggle && drawFooterControls) {
      const cfg = laneOpts.footerToggle;
      const ty = toggleY;
      // The whole strip is the target, not the 13px box: a checkbox you have to hit exactly is
      // a checkbox on a phone that misses.
      const hit = self.add.rectangle(content.x, ty, content.width, LANE_TOGGLE_HEIGHT,
        INK_UI.brush, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) return;
      soundDirector.tap();
      cfg.onToggle();
    });
      sheetHost.add(hit);

      const box = self.add.graphics();
      box.lineStyle(1.2, cfg.checked ? INK_UI.gold : INK_UI.softBrush, 1);
      box.strokeRect(content.x + 2, ty + 6, 14, 14);
      if (cfg.checked) {
        box.lineStyle(2, INK_UI.gold, 1);
        box.beginPath();
        box.moveTo(content.x + 5, ty + 13);
        box.lineTo(content.x + 8, ty + 16);
        box.lineTo(content.x + 14, ty + 8);
        box.strokePath();
      }
      sheetHost.add(box);

      // No `color: undefined` here. `InkUI.label` spreads these over the variant style, so an
      // undefined colour erases the ink and Phaser falls back to white — invisible on parchment.
      const style: Record<string, unknown> = { fontSize: '12px' };
      if (cfg.checked) style.fontStyle = '700';
      else style.color = INK_UI_HEX.mutedText;
      sheetHost.add(self.ui.label(content.x + 24, ty + 4, cfg.label, 'body', style));

      if (cfg.hint) {
        sheetHost.add(self.ui.label(content.x + 24, ty + 20, cfg.hint, 'caption', {
          fontSize: '10px',
          wordWrap: { width: content.width - 26 },
        }));
      }
    }

    // Three controls: the back keeps a row of its own above the action and the close.
    if (laneOpts.back && !backSharesRow) {
      self.modalLayer.add(self.ui.button(
        {
          x: content.x,
          y: hudSheetHeight() - LANE_CLOSE_BUTTON_OFFSET - LANE_BACK_BUTTON_HEIGHT - 8,
          width: content.width,
          height: LANE_BACK_BUTTON_HEIGHT,
        },
        t('ascent.pick.back'),
        laneOpts.back,
        { variant: 'ghost', fontSize: '12px' },
      ));
    }
    if (laneOpts.footer) {
      // **Every child page ends with a way back and a way out.**
      //
      // A page that brings its own action used to *replace* the close with it, so a muster or a
      // confirm offered only the ghost "back" above — one step up a stack the player may be three
      // deep in. They share the row rather than stacking, so no page grows and nothing below
      // moves: the page's own action keeps the emphasis and about two thirds of the width, and a
      // quiet close sits beside it. Commit on the left, dismiss on the right, both under a thumb.
      const footer = laneOpts.footer;
      const y = hudSheetHeight() - LANE_CLOSE_BUTTON_OFFSET;
      if (footer.soleAction) {
        self.modalLayer.add(self.ui.button(
          { x: content.x, y, width: content.width, height: LANE_CLOSE_BUTTON_HEIGHT },
          footer.label,
          () => { if (!footer.disabled) footer.onTap(); },
          { variant: footer.disabled ? 'disabled' : 'primary', fontSize: '13px' },
        ));
      } else {
        const split = footerSplit(content.x, content.width, t('ascent.lane.close'));
        self.modalLayer.add(self.ui.button(
          { x: split.leftX, y, width: split.leftWidth, height: LANE_CLOSE_BUTTON_HEIGHT },
          footer.label,
          () => { if (!footer.disabled) footer.onTap(); },
          { variant: footer.disabled ? 'disabled' : 'primary', fontSize: '13px' },
        ));
        self.modalLayer.add(self.ui.button(
          { x: split.rightX, y, width: split.rightWidth, height: LANE_CLOSE_BUTTON_HEIGHT },
          t('ascent.lane.close'),
          () => closeLane(self),
          { variant: 'ghost', fontSize: '12px' },
        ));
      }
    } else if (backSharesRow && laneOpts.back) {
      const y = hudSheetHeight() - LANE_CLOSE_BUTTON_OFFSET;
      const split = footerSplit(content.x, content.width, t('ascent.lane.close'));
      self.modalLayer.add(self.ui.button(
        { x: split.leftX, y, width: split.leftWidth, height: LANE_CLOSE_BUTTON_HEIGHT },
        t('ascent.pick.back'),
        laneOpts.back,
        { variant: 'ghost', fontSize: '12px' },
      ));
      self.modalLayer.add(self.ui.button(
        { x: split.rightX, y, width: split.rightWidth, height: LANE_CLOSE_BUTTON_HEIGHT },
        t('ascent.lane.close'),
        () => closeLane(self),
        { variant: 'primary', fontSize: '13px' },
      ));
    } else {
      laneCloseButton(self, content);
    }
  };

  return { content, addRow, addHeading, addNote, addWidget, finish };
}

/** Standard footer for a lane browser: one button back to the map. */
function laneCloseButton(self: ConquestUIScene, content: UIBounds): void {
  self.modalLayer.add(self.ui.button(
    {
      x: content.x,
      y: hudSheetHeight() - LANE_CLOSE_BUTTON_OFFSET,
      width: content.width,
      height: LANE_CLOSE_BUTTON_HEIGHT,
    },
    t('ascent.lane.close'),
    () => closeLane(self),
    { variant: 'primary', fontSize: '13px' },
  ));
}

/** Leaves a lane browser, restoring whatever pause state the player had before opening it. */
export function closeLane(self: ConquestUIScene): void {
  // Leaving the battle screen unanswered is an answer: the generals fight on and the world
  // moves. The hold only ever lasts as long as the screen that asked for it.
  self.battleAwaitingOrder = false;
  /**
   * ...and so does the command.
   *
   * A field the player took by hand is theirs until they give it up, and walking off the screen is
   * one of the three ways they do (the others are the *auto* chip and moving to another fight).
   * Without this the claim outlived the screen: the player would leave a field they had taken,
   * nobody would be on its dials, and the auto-delegate rule — which now leaves a claimed field
   * alone by design — would never step in either.
   *
   * `standing: false` deliberately: stepping out of one fight says nothing about how the player
   * wants the next one to open, and `handToGenerals` is the run-wide answer to that question.
   * A no-op when nothing is live or the fight is already the general's.
   */
  if (self.openPromptKey === 'lane:battle') delegateBattle(self.state, true, false);
  // The drum belongs to the screen that raised it. Left running, it would start a fight the
  // player has walked away from — and call `buildBattleField` on a lane that no longer exists.
  self.battleOpeningTimer?.remove();
  self.battleOpeningTimer = undefined;
  self.state.isStrategyPause = self.lanePauseBeforeOpen;

  // In the arena there is nothing behind this screen. Closing it dropped the player onto a map
  // with one province, no economy and no way back — the fight *is* the session, so leaving it
  // means leaving the fight, not stepping out of it onto a world that is not there.
  if (self.openPromptKey === 'lane:aftermath') {
    self.dismissAftermath();
    return;
  }
  if (self.state.ascent?.arena && self.openPromptKey === 'lane:battle') {
    self.events.emit('ui:arena-leave');
    return;
  }
  self.closeOverlay();
}

/**
 * Draws the offer a story is hanging on this surface, if one is.
 *
 * `openingFor` used to be called from exactly one place — the land panel — so an opening
 * declared `on: 'treasury' | 'army' | 'rival'` existed in the catalogue and appeared nowhere in
 * the world. The whole design of an opening is that it waits somewhere the player already goes.
 */
export function addStoryOpening(self: ConquestUIScene,
  on: 'land' | 'hero' | 'army' | 'rival' | 'treasury',
  subjectId: string | undefined,
  addHeading: (label: string) => void,
  addRow: (opts: { title: string; subtitle: string; border: number }, onTap?: () => void) => void,
): void {
  const opening = openingFor(self.state, on, subjectId);
  if (!opening) return;
  addHeading(t('land.section.spokenOf'));
  addRow(
    {
      title: storyText(opening.actionKey, opening.params),
      subtitle: storyText(opening.textKey, opening.params),
      border: INK_UI.gold,
    },
    () => {
      if (takeOpening(self.state, opening.storyId, opening.fragmentId)) closeLane(self);
    },
  );
}

/**
 * Replaces the current lane page with another, keeping the lane (and its pause) open.
 *
 * **The press that turned the page does not get to press the page it turned to.**
 *
 * Reported with a screenshot: *Lập quân -> Quay lại -> it also clicks the checkbox "Lập quân:
 * tướng hỏi trước" on the Quân đội page.* Both pages live on the modal layer, so the sheet rule in
 * `ui/inputGeneration` — which asks whether the press began *behind* a sheet — cannot see this at
 * all: the press began on a sheet and the release landed on a sheet. What changed underneath the
 * finger was the page.
 *
 * The Back button acts on `pointerdown` (`InkUI.button`); `clearLanePage` destroys the form and
 * `build` draws the parent page in its place, all before the finger lifts. The parent's checkbox is
 * then sitting under the pointer, and it acts on the release.
 *
 * A page turn is a teardown like any other, so it swallows the rest of the gesture the same way an
 * overlay transition does.
 */
export function replaceLanePage(self: ConquestUIScene, build: () => void): void {
  // `clearLanePage` swallows the rest of the gesture — see the note there.
  clearLanePage(self);
  buildLanePage(self, build);
}

/**
 * Builds a lane page, and guarantees a way out of whatever gets built.
 *
 * **A page has no Close button until `finish()` runs.** So anything that throws while a page is
 * filling itself in — one bad row out of nine, a hero the portrait code cannot resolve, a land
 * that marched out from under a lookup — leaves rows on the screen, `openPromptKey` still
 * `lane:…`, the world held by the lane, and no control that ends any of it. `refresh`'s recovery
 * cannot see it either: that guard fires on an *empty* modal layer, and this layer is not empty,
 * it is half a page. Reported verbatim: *Chiến sự page crash sometime — I can do nothing*, and
 * again for Tiếp viện.
 *
 * The throw is still reported to the console, so the harnesses' `no console errors` check catches
 * it and it gets fixed properly — this is a floor under the player, not a way of not knowing.
 */
function buildLanePage(self: ConquestUIScene, build: () => void): void {
  // **Remember how this page was made, so it can be made again.**
  //
  // The sheet folds by rebuilding the page under it. It used to ask the caller for a `rebuild`
  // through the `dock` option — which the two pages that have a sheet but no action list never
  // pass, so on Build and Chronicle the fold flipped a flag and redrew nothing: the sheet could
  // not be opened, could not be closed, and if it was left open by a page that *could* fold it,
  // its scrim sat over the whole page swallowing every tap. Reported as both pages being
  // completely dead.
  //
  // Every lane page arrives through here, so here is where the answer is.
  self.lanePageBuild = build;
  try {
    build();
    return;
  } catch (error) {
    console.error('[lane] page failed to build', error);
    try {
      clearLanePage(self);
      const { addNote, finish } = laneList(self, t('ascent.lane.brokenTitle'), t('ascent.lane.brokenBody'), {});
      addNote(String((error as { message?: string })?.message ?? error));
      finish();
    } catch (fallbackError) {
      // Even the apology would not draw. Leaving is the only thing left that helps.
      console.error('[lane] recovery page failed too', fallbackError);
      clearLanePage(self);
      closeLane(self);
    }
  }
}
