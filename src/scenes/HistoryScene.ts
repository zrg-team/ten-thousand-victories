import { preloadStoryPrints } from '../ui/storyPrint';
import { preloadConquestMapArt } from '../ui/conquestMapArt';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { applyRenderScale, designPointer } from '../game/graphicsQuality';
import { heroBio, heroName, heroTypeLabel, t } from '../i18n';
import { historyText } from '../i18n/history';
import { storyCatalogIds, storyTitle } from '../i18n/story';
import type { EraRule, HistoryEra } from '../data/history';
import {
  ERA_PERIODS,
  FIGURE_DATES,
  FIGURE_ERA_OVERRIDE,
  figureYear,
  GLOSSARY_TERMS,
  HISTORY_ERAS,
  type HistoryGroup,
  STORY_ANCHORS,
  STORY_GROUPS,
  TERM_GROUPS,
  ungroupedIds,
} from '../data/history';
import { heroTemplates } from '../data/heroes';
import { REAL_FIGURES } from '../data/heroNames';
import type { Hero } from '../state/types';
import { BACK_BAR_BAND, BACK_BAR_HEIGHT, InkUI, INK_UI, INK_UI_HEX, type InkScrollArea } from '../ui/InkUI';
import { scrollGestureConsumedTap } from '../ui/InkUI';
import { createMapRenderer, type MapRenderer } from '../ui/MapRenderer';
import { renderHeroFaceInBox } from '../ui/FaceRenderer';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { inkPath } from '../ui/ink/stroke';
import { armyShape, clearPlate, type FigureArm, type FigureTier } from '../ui/ink/devices';
import { bucketFor, figurePlaceScale, figureStamp, stampedArmy } from '../ui/ink/figureStamps';
import { placeStamp } from '../ui/ink/stamp';
import { PIGMENT } from '../ui/ink/palette';
import type { ArmyComposition, ArmyWardrobe } from '../state/types';
import { RULE_COLOUR } from '../ui/ink/eraRule';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import { attachPagePaper } from '../ui/ink/paperSheet';
import { attachDesktopBackdrop } from '../ui/desktopBackdrop';

type HistoryTab = 'dynasties' | 'figures' | 'stories' | 'army' | 'terms';

const TABS: readonly HistoryTab[] = ['dynasties', 'figures', 'stories', 'army', 'terms'];

/**
 * The seven Việt wardrobes, in the order they happened.
 *
 * `VIET_WARDROBES` is the same seven and is what the muster rolls from; this is only the reading
 * order, because the three lord periods overlap in time and a chronological sort would interleave
 * them. Đại Việt only: the northern powers and Chăm are drawn by the same code and worn by rivals
 * every run, but this page is about the army the player raises.
 */
const VIET_WARDROBE_ORDER: readonly ArmyWardrobe[] =
  ['ly', 'tran', 'le', 'trinh', 'nguyenLord', 'tayson', 'nguyen'];

/** `spear` first: it is what a levy holds, and the tier chips open on the levy. */
const ARMY_ARMS: readonly FigureArm[] = ['spear', 'sword', 'skirmish', 'bow', 'mounted'];

/** The five ways the same host can be deployed. Shape of the formation, nothing else. */
const ARMY_DOCTRINES: readonly ArmyComposition[] = ['balanced', 'spears', 'archers', 'shock', 'horse'];

/**
 * The host the formation plate draws, in men.
 *
 * Fixed rather than taken from a live army so the five doctrines can be read against each other:
 * change the deployment and only the deployment changes. Forty-four marks, which is the size the
 * design document plates.
 */
/**
 * How far a 144x128 authored sheet may be blown up on the wardrobe plate.
 *
 * The plate is the biggest a soldier is ever drawn in this game — several times the size the
 * battlefield asks for — so the fit is capped rather than left to fill the frame: past about a
 * doubling the woodblock's edges go to porridge, and a crisp small soldier reads better than a
 * large soft one.
 */
const MAX_PLATE_UPSCALE = 2.1;

const ARMY_PLATE_MEN = 2420;

const SIDE = 12;
const LIST_WIDTH = GAME_WIDTH - SIDE * 2;
const CARD_GAP = 8;
/**
 * How far a row steps in from the heading it belongs to.
 *
 * Small on purpose. The heading already carries a colour bar, a marker and a count; ten units is
 * enough for the eye to read the rows as *under* it, and any more of it eats the width the prose
 * needs at 390.
 */
const ROW_INDENT = 10;
/** Where the scrolling list starts: under the title, the subtitle and the tab strip. */
const LIST_TOP = 108;
/** The way back sits at the foot; the list gives up `BACK_BAR_BAND` to clear it. Same as the manual. */
const PORTRAIT = 46;
/** The Dynasties timeline: the rail's own x, and where the cards start to the right of it. */
const RAIL_X = 14;
const TIMELINE_X = 30;
/** Header and tabs sit above the list, so they win the tap. See `chrome`. */
const CHROME_DEPTH = 5;

/**
 * The heading a group falls under when nobody has filed it.
 *
 * Not a group in `data/history` — a hand-written grouping goes stale the moment a fifty-second
 * story is registered, and the failure mode is silent: the entry simply stops appearing on a page
 * whose whole job is being complete about the record. Everything unfiled lands here instead, and
 * `verify-history.mjs` fails while this heading has anything under it.
 */
const OTHER_GROUP = 'other';

/**
 * The real record behind the game, as four lists you can read.
 *
 * A scene rather than another `mode` on `MenuScene`: this is four sections with a scrolling list
 * and an expanding detail, and the menu is already the longest file in `scenes/` without carrying
 * a scroll surface anywhere in it.
 *
 * Almost none of the text here is new. The champions' biographies, the story titles and the ruler
 * capsules are the ones the game already prints elsewhere; what this scene adds is the ordering,
 * the dates, and one paragraph per entry saying what we changed. Nothing on this page is allowed
 * to blur those two apart — every entry that has an opinion labels it as ours.
 */
export class HistoryScene extends Phaser.Scene {
  private ui!: InkUI;
  private mapRenderer!: MapRenderer;
  private tab: HistoryTab = 'dynasties';
  /** The one open accordion row, by a key unique across every tab. */
  private expanded?: string;
  /**
   * The one open section on each tab, by group id, or `''` for a tab shut all the way down.
   *
   * Per tab rather than one field, because a reader who opened the campaigns and went to look
   * something up in the glossary should find the campaigns still open when they come back. It is
   * the same argument as `pendingScroll` — a page that forgets where you were makes you navigate
   * twice for every thing you wanted to read once.
   */
  private openSection: Record<HistoryTab, string> = {
    dynasties: ERA_PERIODS[0]?.id ?? '',
    // Resolved in `create`: the first age that anybody is actually filed under. Written flat here
    // because the roster has to be read to know which one that is.
    figures: '',
    stories: STORY_GROUPS[0]?.id ?? '',
    // Not a list. The wardrobe is a plate you change, and it has no sections to shut.
    army: '',
    terms: TERM_GROUPS[0]?.id ?? '',
  };
  /**
   * The section header the next re-render should park itself on, and where it landed.
   *
   * Toggling a section changes the height of everything below it and — when it is the section
   * being *shut* — everything below it moves up by the height of the whole section. Carrying the
   * old offset across, which is right for opening a card, throws the heading you just pressed
   * clean off the screen. So a header tap does not preserve the offset: it puts the header it
   * pressed at the top of the window, which is the same place it would be on any other page that
   * has accordions in it.
   */
  private anchorSection?: string;
  private anchorY?: number;
  /**
   * The section whose rows should come in on a stagger, set only when a section is being *opened*.
   *
   * Opening a drawer replaces the page under the reader's thumb in one frame: eight rows that were
   * not there are suddenly there, and the eye has to go and find out what happened. The stagger is
   * the answer to "what changed" — the rows arrive in reading order, from the heading downwards,
   * so the movement itself points at where to start.
   *
   * Not set when a section is shut — that is `collapseSection`'s job, and it runs on the rows that
   * are still on the page rather than on the ones about to be built.
   */
  private revealSection?: string;
  /**
   * True while a section is folding away.
   *
   * The collapse animates the rows that are *already drawn* and only rebuilds when they have gone,
   * so for those two hundred milliseconds the page is showing a layout that no longer matches
   * `openSection`. A second tap in that window would animate a second collapse over the top of the
   * first and rebuild twice; this makes the page ignore taps until it has caught up with itself.
   */
  private closing = false;
  private content: Phaser.GameObjects.GameObject[] = [];
  /**
   * Held separately because a scroll area is not a GameObject: it hangs four handlers off the
   * scene's own pointer stream and has to be told to let go of them. Destroying the objects it
   * drew would leave those behind, and the next list would scroll two lists at once.
   */
  private scroll?: InkScrollArea;
  /**
   * Where the list should stand after the next re-render.
   *
   * Opening an entry rebuilds the whole list, and a rebuilt scroll area starts at the top — so
   * tapping the fortieth champion answered by throwing the reader back to the first. Carrying the
   * offset across keeps the row you touched under the finger that touched it. A tab change sets it
   * to zero on purpose: that IS a new list.
   */
  private pendingScroll = 0;
  private pendingAnchor?: ReturnType<InkScrollArea['snapshotAnchor']>;
  /** What the Army tab is currently showing. Opens on the dynasty the game itself defaults to. */
  private armyTheme: ArmyWardrobe = 'ly';
  private armyTier: FigureTier = 1;
  private armyArm: FigureArm = 'sword';
  private armyDoctrine: ArmyComposition = 'balanced';

  constructor() {
    super('HistoryScene');
  }

  preload(): void {
    preloadStoryPrints(this, import.meta.env.BASE_URL);
    // The authored soldier sheets. Boot preloads only the map's families now, and the run scenes
    // fetch the figures when they need them — so a page opened straight from the menu found no
    // sheet and `figureStamp` quietly baked the procedural understudy onto the Army plate, the
    // exact drift the plate's own comment says it cannot have. Loaded here, once per visit; the
    // atlas is skipped when a run has already brought it in.
    preloadConquestMapArt(this, import.meta.env.BASE_URL, ['figures'], false);
  }

  create(): void {
    applyRenderScale(this);
    applyPaperFX(this);
    attachPagePaper(this);
    // The desktop's sheet beyond the column: the front page's landscape, faint, so this reads as a
    // page lying on the same desk. Nothing on the phone.
    attachDesktopBackdrop(this);
    this.ui = new InkUI(this);
    this.mapRenderer = createMapRenderer(this);
    // The sheet, and nothing else. The menu's diorama is a fine thing to arrive at and a poor
    // thing to read a page of prose over.
    this.mapRenderer.drawBackground(GAME_WIDTH, GAME_HEIGHT).setDepth(-10);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
    // The page develops onto the paper rather than replacing it. Fading in from the sheet's own
    // colour (`#e9dfc2`) means only the ink arrives: no black flash, no white one, and the
    // parchment under it never appears to change.
    this.cameras.main.fadeIn(190, 0xe9, 0xdf, 0xc2);
    // People opens on the first age anybody is actually filed under. Three of the eleven headings
    // have no written-up champion at all, so opening on `HISTORY_ERAS[0]` would greet the reader
    // with an empty drawer and no reason given for it.
    const peopled = this.figuresByEra();
    this.openSection.figures = HISTORY_ERAS.find((era) => peopled.get(era.id)?.length)?.id ?? '';
    this.render();
  }

  private render(): void {
    this.clear();
    this.renderHeader();
    this.renderTabs();
    this.renderList();
  }

  /**
   * Registers a piece of page chrome above the list.
   *
   * The depth is load-bearing, not decoration. Rows scrolled off the top of the list keep live hit
   * rectangles sitting under the header — a geometry mask hides pixels, not hit areas — and with
   * `input.topOnly` on, whichever object is on top takes the event and nothing else sees it. Sat at
   * the same depth as the list, the header lost: pressing Back after a scroll did nothing at all,
   * because a card nobody could see had already claimed the tap.
   */
  private chrome<T extends Phaser.GameObjects.GameObject & { setDepth(value: number): T }>(object: T): T {
    this.content.push(object.setDepth(CHROME_DEPTH));
    return object;
  }

  private renderHeader(): void {
    this.chrome(this.ui.backBar(
      GAME_HEIGHT - BACK_BAR_HEIGHT - 10,
      () => this.scene.start('MenuScene'),
    ));

    this.chrome(this.add.text(GAME_WIDTH / 2, 14, t('history.title'), {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '19px',
      fontStyle: '700',
    }).setOrigin(0.5, 0));

    this.chrome(this.add.text(GAME_WIDTH / 2, 44, this.tab === 'army' ? historyText('army.subtitle') : t('history.subtitle'), {
      color: '#6b5230',
      fontFamily: UI_FONT,
      fontSize: '11px',
      align: 'center',
      wordWrap: { width: LIST_WIDTH - 20 },
    }).setOrigin(0.5, 0));
  }

  private renderTabs(): void {
    // Five across a 390 sheet leaves 70 apiece, down from 88 when there were four. The labels are
    // one word in both languages for exactly this reason — "Dynasties / Triều đại" fits at 10px,
    // "Historical figures" would not have fitted at any size.
    const width = Math.floor((LIST_WIDTH - 4 * 4) / 5);
    TABS.forEach((tab, index) => {
      this.chrome(this.ui.button(
        { x: SIDE + index * (width + 4), y: 70, width, height: 28 },
        t(`history.tab.${tab}` as 'history.tab.dynasties'),
        () => {
          if (this.tab === tab) {
            return;
          }
          this.tab = tab;
          this.pendingScroll = 0; this.pendingAnchor = undefined;
          // A new list starts at the top and with nothing open. Carrying an expansion across tabs
          // means opening one and finding a different page already scrolled into its middle.
          this.expanded = undefined;
          this.render();
        },
        { variant: this.tab === tab ? 'secondary' : 'ghost', fontSize: '10px' },
      ));
    });
  }

  /** The list window: everything under the tab strip, less a hair of margin at the foot. */
  private listHeight(): number {
    return GAME_HEIGHT - LIST_TOP - 10 - BACK_BAR_BAND;
  }

  private renderList(): void {
    const height = this.listHeight();
    const scroll = this.ui.scrollArea({ x: SIDE, y: LIST_TOP, width: LIST_WIDTH, height });
    this.scroll = scroll;
    // `addTo` is not optional and is not a convenience: it parents the area's swallow-zone and its
    // content in that order, so the cards sit above the zone. Left at the scene root the zone is
    // created after the container and therefore lands on top of it, and with `input.topOnly` on it
    // eats every tap the list was supposed to receive — the rows render, scroll, and do nothing.
    const layer = this.add.container(0, 0);
    scroll.addTo(layer);
    this.content.push(layer);

    // Every list stacks by each card's OWN reported height. `InkUI.card` grows to fit whatever its
    // body wraps to and the requested height is only a minimum, so a fixed stride would overlap the
    // moment an entry ran to a third line — which in Vietnamese most of them do.
    const used = this.tab === 'dynasties' ? this.buildDynasties(scroll)
      : this.tab === 'figures' ? this.buildFigures(scroll)
      : this.tab === 'stories' ? this.buildStories(scroll)
      : this.tab === 'army' ? this.buildArmy(scroll)
      : this.buildTerms(scroll);

    scroll.setContentHeight(Math.max(height, used));
    // A header tap parks on that header; anything else keeps the reader where they were. Both go
    // through `setScroll`, which clamps — so a section near the foot of a short list comes to rest
    // as far down as the list actually goes rather than scrolling past its own end.
    if (this.anchorY !== undefined) scroll.setScroll(this.anchorY - 4);
    else if (this.pendingAnchor) scroll.restoreAnchor(this.pendingAnchor);
    else scroll.setScroll(this.pendingScroll);
    this.anchorSection = undefined;
    this.anchorY = undefined;
    // One render, one arrival. Left set, the next rebuild — opening a card, pressing a chip —
    // would replay the whole section's stagger for a change that touched one row.
    this.revealSection = undefined;
  }

  // ── Sections ──

  /**
   * One shuttable heading, and the state that decides which one is open.
   *
   * Five tabs of flat list is what this page shipped as, and two of them ran to forty-eight and
   * fifty-one rows. Nothing was wrong with any single row; what was wrong is that a reader looking
   * for the stakes in the Bạch Đằng had to scroll past the Nika riots to find them, and a reader
   * looking for nothing in particular had no way to see what was on offer short of reading all of
   * it. Shut, a tab is now six or seven lines that say what kinds of thing are in here. Open, it
   * is the list it always was.
   *
   * One section open at a time, per tab. Independent toggles were the other option and they lose
   * the property that makes this worth doing at all: with three sections open the page is a long
   * list again, only now with headings in it.
   */
  private sectionHeader(scroll: InkScrollArea, y: number, opts: {
    key: string;
    /** The count line, already worded — "12 entries", "2 ages". Right-aligned against the title. */
    count?: string;
    /** Dates, spans: the facts about the section rather than the pitch for it. */
    meta?: string;
    note?: string;
    title: string;
    open: boolean;
    x?: number;
    width?: number;
    /** The open marker's colour. The timeline uses its own rule colours; everything else is son. */
    colour?: number;
  }): number {
    const x = opts.x ?? 0;
    const width = opts.width ?? LIST_WIDTH - 6;
    const accent = opts.colour ?? INK_UI.cinnabar;
    if (opts.key === this.anchorSection) {
      this.anchorY = y;
    }

    const holder = this.add.container(x, y);
    const skin = this.add.graphics();
    holder.add(skin);

    // Measured, not assumed — the same rule the cards follow. "The country, its capitals and its
    // borders" wraps to two lines at 13px, and a fixed header height would print the note through
    // it.
    const count = opts.count
      ? this.add.text(width - 10, 9, opts.count, {
        color: '#8a7350', fontFamily: UI_FONT, fontSize: '9px',
      }).setOrigin(1, 0)
      : undefined;
    const title = this.add.text(24, 8, opts.title, {
      color: opts.open ? '#2a2118' : '#4a3b28',
      fontFamily: TITLE_FONT,
      fontSize: '13px',
      fontStyle: '700',
      wordWrap: { width: width - 34 - (count ? count.width + 8 : 0) },
    });
    let bottom = 8 + title.height;
    holder.add(title);
    if (count) {
      holder.add(count);
    }
    if (opts.meta) {
      const meta = this.add.text(24, bottom + 3, opts.meta, {
        color: '#6b5230', fontFamily: UI_FONT, fontSize: '9px', wordWrap: { width: width - 34 },
      });
      bottom = meta.y + meta.height;
      holder.add(meta);
    }
    if (opts.note) {
      const note = this.add.text(24, bottom + 3, opts.note, {
        color: '#7a6748', fontFamily: UI_FONT, fontSize: '9px', lineSpacing: 2,
        wordWrap: { width: width - 34 },
      });
      bottom = note.y + note.height;
      holder.add(note);
    }
    const height = bottom + 9;

    skin.fillStyle(opts.open ? INK_UI.parchment : INK_UI.parchmentShade, 1);
    skin.fillRoundedRect(0, 0, width, height, 6);
    skin.lineStyle(1, INK_UI.parchmentDark, 1);
    skin.strokeRoundedRect(0, 0, width, height, 6);
    if (opts.open) {
      // A bar down the open side, so a reader scrolling inside a section can see which heading the
      // rows under their thumb belong to without going back up to read it.
      //
      // A bar and not a border. The open heading was outlined in son on all four sides and it read
      // as an error state — the cards below it are outlined too, and the loudest thing on the page
      // should be the entry you opened, not the drawer it came out of.
      skin.fillStyle(accent, 0.9);
      skin.fillRoundedRect(0, 6, 3, height - 12, 1.5);
    }

    // Drawn rather than typed. "▾" is a glyph the two UI fonts disagree about the height of, and
    // the marker has to sit on the title's first line in both languages.
    const marker = this.add.graphics();
    const cy = 8 + Math.min(title.height, 17) / 2;
    marker.fillStyle(opts.open ? accent : INK_UI.softBrush, 1);
    if (opts.open) {
      marker.fillTriangle(10, cy - 2, 18, cy - 2, 14, cy + 3.5);
    } else {
      marker.fillTriangle(11, cy - 4, 16.5, cy, 11, cy + 4);
    }
    holder.add(marker);

    const hit = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer)) {
        return;
      }
      const at = designPointer(pointer);
      if (at.y < LIST_TOP || at.y > LIST_TOP + this.listHeight()) {
        return;
      }
      this.toggleSection(opts.key);
    });
    holder.add(hit);
    // Read by the harness, so it can press a heading at whatever height that heading turned out to
    // be rather than at a pixel that was right on the day it was written.
    holder.setData('sectionKey', opts.key);
    scroll.content.add(holder);
    return y + height + CARD_GAP;
  }

  private toggleSection(key: string): void {
    if (this.closing) {
      return;
    }
    if (this.openSection[this.tab] === key) {
      this.collapseSection(key);
    } else {
      this.applyToggle(key, true);
    }
  }

  private applyToggle(key: string, opening: boolean): void {
    this.closing = false;
    this.openSection[this.tab] = opening ? key : '';
    this.revealSection = opening ? key : undefined;
    // The open card may be inside the section that just shut. Left set, it would spring open again
    // the next time that section is opened, which is not what somebody who shut it asked for.
    this.expanded = undefined;
    this.anchorSection = key;
    this.render();
  }

  /**
   * Shutting a section, as a movement rather than as a cut.
   *
   * Opening got a stagger and closing did not, and the asymmetry was the more noticeable of the
   * two: eight rows vanished between frames and everything below them jumped up by however tall
   * they had been, so the eye had no way to tell "that section folded" from "the page reloaded".
   *
   * The trick is that the rebuild happens *last*. The rows that are on the page are the ones that
   * animate — fade and settle a few units — while everything below them slides up by exactly the
   * distance the rebuilt page will put it at, which is the next heading's own y minus the first
   * row's. When the slide lands, the two layouts agree to the unit and `render` swaps one for the
   * other with nothing moving. The alternative — rebuild first, then animate — needs the old rows
   * kept alive alongside the new ones, which is two copies of the list and two answers to how tall
   * it is.
   */
  private collapseSection(key: string): void {
    const scroll = this.scroll;
    // Virtual holders are recycled in insertion order; reading order is their content-space y.
    const list = [...(scroll?.content.list ?? [])] as Phaser.GameObjects.Container[];
    list.sort((a, b) => a.y - b.y);
    const headerIndex = list.findIndex((item) => item.getData?.('sectionKey') === key);
    if (headerIndex < 0) {
      this.applyToggle(key, false);
      return;
    }
    let nextIndex = list.length;
    for (let i = headerIndex + 1; i < list.length; i += 1) {
      if (list[i].getData?.('sectionKey') != null) {
        nextIndex = i;
        break;
      }
    }
    const rows = list.slice(headerIndex + 1, nextIndex).filter((row) => typeof row.y === 'number');
    // The timeline's rail is drawn behind everything at index 0 and belongs to no one section, so
    // it cannot slide with the rest. It goes out with the fold and the rebuilt one comes back in.
    const rail = list.find((item) => item.type === 'Graphics' && list.indexOf(item) === 0);
    if (!rows.length) {
      this.applyToggle(key, false);
      return;
    }

    this.closing = true;
    const top = Math.min(...rows.map((row) => row.y));
    // Where the next heading is now, against where the rebuild will put it: exactly where the
    // first row of this section starts, because that is what a shut section leaves behind.
    const shift = nextIndex < list.length ? list[nextIndex].y - top : 0;
    const below = list.slice(nextIndex).filter((item) => typeof item.y === 'number');

    rows.forEach((row, index) => {
      this.tweens.add({
        targets: row,
        alpha: 0,
        y: row.y - 4,
        duration: 130,
        // Backwards, so the section folds towards its own heading rather than away from it.
        delay: Math.min(rows.length - 1 - index, 5) * 14,
        ease: 'Quad.easeIn',
      });
    });

    if (rail && this.tab === 'dynasties') {
      this.tweens.add({ targets: rail, alpha: 0, duration: 170, ease: 'Quad.easeIn' });
    }

    const done = (): void => this.applyToggle(key, false);
    if (shift > 0 && below.length) {
      this.tweens.add({
        targets: below,
        y: '-=' + shift,
        duration: 210,
        ease: 'Quad.easeInOut',
        onComplete: done,
      });
    } else {
      // Nothing underneath to close the gap — the last section on the tab. The fade is the whole
      // animation, so the rebuild waits for it rather than for a slide that never happens.
      this.time.delayedCall(150, done);
    }
  }

  /**
   * The groups of a tab, plus whatever the groups forgot, in catalogue order.
   *
   * The remainder is the point. `STORY_GROUPS` is written by hand against a catalogue that grows,
   * and a story registered next month would otherwise be filed nowhere and drawn nowhere — missing
   * from the one page in the game that promises to be complete about the record.
   */
  private sections(groups: readonly HistoryGroup[], all: readonly string[]): HistoryGroup[] {
    const known = new Set(all);
    const filed = groups
      .map((group) => ({ id: group.id, ids: group.ids.filter((id) => known.has(id)) }))
      .filter((group) => group.ids.length);
    const rest = ungroupedIds(groups, all);
    return rest.length ? [...filed, { id: OTHER_GROUP, ids: rest }] : filed;
  }

  private groupText(kind: 'eras' | 'stories' | 'terms', id: string, part: 'title' | 'note'): string {
    return historyText(id === OTHER_GROUP ? `groups.other.${part}` : `groups.${kind}.${id}.${part}`);
  }

  // ── The four lists ──

  /**
   * The ages, drawn as a timeline rather than as eleven identical cards.
   *
   * A stack of same-sized boxes says every age was the same size, and they were not: Bắc thuộc ran
   * for a thousand and forty-nine years and Tây Sơn for twenty-four. Card height cannot carry that
   * — it belongs to the prose — so the *rail* does. Each age is a node on one inked line, and the
   * node's area is proportional to how long the age lasted, so a thousand years of northern rule
   * reads as a blot and the Tây Sơn as a full stop. Radius goes as the square root of the span,
   * because the eye reads a disc by its area and not by its width.
   *
   * The rail is drawn last, from the node positions the cards actually landed on, and inserted
   * *behind* them — the alternative is guessing the heights of eleven wrapped paragraphs in
   * advance, which is the same mistake as a fixed stride.
   */
  private buildDynasties(scroll: InkScrollArea): number {
    const headingWidth = LIST_WIDTH - 6 - TIMELINE_X;
    const width = headingWidth - ROW_INDENT;
    const eraById = new Map(HISTORY_ERAS.map((era) => [era.id, era]));
    const periods = this.sections(ERA_PERIODS, HISTORY_ERAS.map((era) => era.id));
    const membersOf = (group: { ids: readonly string[] }): HistoryEra[] =>
      group.ids.map((id) => eraById.get(id)).filter((era): era is HistoryEra => Boolean(era));
    // One scale for two kinds of node. A shut period stands for every age inside it, so its span
    // can run past the longest single age — and a scale set by the ages alone would draw the shut
    // Bắc thuộc period SMALLER than the thousand-year age it had just swallowed.
    const longest = Math.max(
      ...HISTORY_ERAS.map((era) => era.to - era.from),
      ...periods.map((period) => {
        const members = membersOf(period);
        return Math.max(...members.map((era) => era.to)) - Math.min(...members.map((era) => era.from));
      }),
    );
    const nodes: { y: number; radius: number; colour: number }[] = [];
    let y = this.buildRuleLegend(scroll);

    for (const period of periods) {
      const members = membersOf(period);
      const sectionOpen = this.openSection.dynasties === period.id;
      const from = Math.min(...members.map((era) => era.from));
      const to = Math.max(...members.map((era) => era.to));
      // Every period is deliberately rule-homogeneous, and two of them are one age long for that
      // reason alone. A shut period draws ONE node in ONE colour and that colour is the whole
      // answer to "was this us?" — a period that mixed the two would have no honest colour to be,
      // which is the same reason `EraRule` has two values and not three. A mixed one, if anybody
      // ever writes one, is drawn in plain ink: it says nothing rather than something false.
      const rule: EraRule | undefined =
        members.every((era) => era.rule === members[0].rule) ? members[0].rule : undefined;
      const colour = rule ? RULE_COLOUR[rule] : INK_UI.brush;
      const headerY = y;
      y = this.sectionHeader(scroll, y, {
        key: period.id,
        x: TIMELINE_X,
        width: headingWidth,
        title: this.groupText('eras', period.id, 'title'),
        count: t('history.section.ages', { count: members.length }),
        meta: [
          this.range(from, to),
          t('history.era.span', { years: to - from }),
          rule && rule !== 'self' ? t(`history.rule.${rule}` as 'history.rule.self') : '',
        ].filter(Boolean).join('  ·  '),
        note: this.groupText('eras', period.id, 'note'),
        open: sectionOpen,
        colour,
      });
      // Shut, the period IS its node, sized by everything it stands for — so the rail still reads
      // as a thousand years of blot and a Tây Sơn full stop with every drawer closed. Open, the
      // heading is a tick and the ages hang under it with nodes of their own.
      nodes.push({
        y: headerY + 18,
        radius: sectionOpen ? 3.5 : 3 + 6 * Math.sqrt(Math.min(1, (to - from) / longest)),
        colour,
      });
      if (!sectionOpen) {
        continue;
      }

      for (const era of members) {
        const key = `era:${era.id}`;
        const open = this.expanded === key;
        const rulers = era.rulerSlugs
          .map((slug) => this.template(`real-${slug}`))
          .filter((hero): hero is Hero => Boolean(hero));
        const span = era.to - era.from;
        const body = open
          ? [
            historyText(`eras.${era.id}.body`),
            `${t('history.era.inGame')} — ${historyText(`eras.${era.id}.inGame`)}`,
            rulers.length ? rulers.map((hero) => heroName(hero)).join(' · ') : '',
          ].filter(Boolean).join('\n\n')
          : this.clip(historyText(`eras.${era.id}.body`), 92);
        const card = this.ui.card({ x: TIMELINE_X + ROW_INDENT, y, width, height: 62 }, {
          title: historyText(`eras.${era.id}.title`),
          // The length of the age beside its dates, because "111 BC – 938" does not announce itself
          // as ten times "1778 – 1802" until you do the subtraction.
          // The rule is named only when it is not self-rule. Printing "Vietnamese rule" on eight of
          // eleven cards is a word the colour and the legend already carry; printing it on the three
          // that broke is the whole point of having the field.
          subtitle: [
            this.range(era.from, era.to),
            t('history.era.span', { years: span }),
            era.rule === 'self' ? '' : t(`history.rule.${era.rule}` as 'history.rule.self'),
          ].filter(Boolean).join('  ·  '),
          body,
          border: open ? RULE_COLOUR[era.rule] : undefined,
        });
        this.makeTappable(card, key, width);
        scroll.content.add(card);
        if (open) {
          this.revealCard(card);
        } else if (this.revealSection === period.id) {
          this.revealRow(card, members.indexOf(era));
        }
        nodes.push({
          // Level with the title, not with the middle of a card whose height is set by its prose.
          y: y + 18,
          radius: 3 + 6 * Math.sqrt(Math.min(1, span / longest)),
          colour: RULE_COLOUR[era.rule],
        });
        y += ((card.getData('cardHeight') as number | undefined) ?? 62) + CARD_GAP;
      }
    }

    const rail = this.drawTimelineRail(nodes);
    // The rail is redrawn from scratch every render, so a section fold would otherwise snap the
    // line and its nodes to a new shape in one frame while the cards beside it were still moving.
    // `anchorSection` is set exactly on the renders that follow a heading being pressed.
    if (this.anchorSection) {
      rail.setAlpha(0);
      this.tweens.add({ targets: rail, alpha: 1, duration: 200, ease: 'Quad.easeOut' });
    }
    scroll.content.addAt(rail, 0);
    return y;
  }

  /**
   * The key to the colours, above the first age.
   *
   * A colour that means something and is never explained is decoration that looks like data. Three
   * swatches and three short phrases cost one or two rows and turn the rail into something a reader
   * can actually read.
   *
   * It wraps because it has to: an English phrase pair runs past 390 on one line, and a legend cut
   * off by the edge of the sheet is worse than no legend — the entry that goes missing is exactly
   * the colour that needed explaining.
   */
  private buildRuleLegend(scroll: InkScrollArea): number {
    const swatches = this.add.graphics();
    let x = 2;
    let row = 0;
    for (const rule of ['self', 'foreign'] as const) {
      const label = this.add.text(0, 0, t(`history.rule.${rule}` as 'history.rule.self'), {
        color: '#5a4c39',
        fontFamily: UI_FONT,
        fontSize: '10px',
      }).setOrigin(0, 0);
      if (x > 2 && x + 12 + label.width > LIST_WIDTH - 6) {
        x = 2;
        row += 1;
      }
      const centreY = row * 15 + 7;
      label.setPosition(x + 12, row * 15 + 1);
      swatches.fillStyle(RULE_COLOUR[rule], 0.92);
      swatches.fillCircle(x + 4, centreY, 4);
      scroll.content.add(label);
      x += 12 + label.width + 14;
    }
    scroll.content.add(swatches);
    return (row + 1) * 15 + 8;
  }

  /**
   * The little lift a newly opened entry gets.
   *
   * Opening a row rebuilds the list, so the card that grew is a brand new object appearing where a
   * short one stood — without this it simply blinks into place and the eye has to go and find what
   * changed. Six units and a sixth of a second is enough to say "this one"; anything longer and a
   * reader tapping down a list is waiting on the interface.
   */
  private revealCard(card: Phaser.GameObjects.Container): void {
    // Relative, not to a remembered y. A card is built inside a lazy row, and the scroll area
    // re-parents it into the row's holder the moment the builder returns, shifting its y from
    // content space to the holder's. A tween aimed at the y read *before* that shift lands the
    // card a whole row's height below its portrait — which is how an opened biography vanished
    // and left its face beside a blank. Phaser resolves `-=` on the first update, after the shift.
    card.setAlpha(0).setY(card.y + 6);
    // Tagged rather than inferred: the harness asserts the reveal ran without having to catch a
    // 170ms tween mid-flight, which is the kind of check that passes on a fast machine and fails in
    // CI for no reason anybody can reproduce.
    card.setData('revealed', true);
    this.tweens.add({
      targets: card,
      y: '-=6',
      alpha: 1,
      duration: 170,
      ease: 'Quad.easeOut',
    });
  }

  /**
   * A row arriving as part of a section that just opened.
   *
   * Same six units and same easing as `revealCard`, because it is the same gesture — one row
   * saying "I am new" — and two different arrival animations on one page reads as two different
   * pages. What is added is the delay: 26ms a row, so eight rows finish in under four tenths of a
   * second. Capped at six steps, because a section of twelve on a stagger that kept going would
   * leave the last card arriving after the reader had started reading the first, and a list still
   * moving is a list you cannot yet scroll with confidence.
   */
  private revealRow(target: Phaser.GameObjects.GameObject, index: number): void {
    const row = target as Phaser.GameObjects.Container;
    if (typeof row.y !== 'number' || typeof row.setAlpha !== 'function') {
      return;
    }
    // Relative for the same reason `revealCard` is: the row may be re-parented into a lazy holder
    // before this tween takes its first step.
    row.setAlpha(0).setY(row.y + 6);
    // Tagged rather than inferred, for the same reason the single-card reveal is: the harness can
    // assert the stagger ran without having to catch a tween mid-flight.
    row.setData('sectionRevealed', true);
    this.tweens.add({
      targets: row,
      y: '-=6',
      alpha: 1,
      duration: 170,
      delay: Math.min(index, 6) * 26,
      ease: 'Quad.easeOut',
    });
  }

  /**
   * The line down the ages: one inked segment per era, in that era's own colour.
   *
   * The rail is where "what colour means what" actually pays off. Every segment belongs to the age
   * above it, so a reader scrolling the tab watches the line run cold and stay cold for a thousand
   * years of Bắc thuộc, then turn red at Ngô Quyền and stay red. A `mixed` age is drawn as both:
   * red down to the point where the age lost the country, indigo the rest of the way — the Hồ
   * twenty-seven years in, the Nguyễn from the protectorate.
   */
  private drawTimelineRail(nodes: { y: number; radius: number; colour: number }[]): Phaser.GameObjects.Graphics {
    const rail = this.add.graphics();

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const next = nodes[i + 1];
      // The last age has no node below it to run to, so it gets a short tail instead of nothing —
      // a line that stops dead on its final dot reads as truncated rather than as finished.
      const bottom = next ? next.y : node.y + 26;
      if (bottom - node.y >= 1) {
        inkPath(rail, [{ x: RAIL_X, y: node.y }, { x: RAIL_X, y: bottom }], 4157 + i * 31, {
          width: 2.2,
          alpha: 0.72,
          colour: node.colour,
          wobble: 0.5,
          step: 22,
        });
      }
    }

    for (const node of nodes) {
      // Paper under the node first, so the rail does not show through the disc it passes behind.
      rail.fillStyle(INK_UI.parchment, 1);
      rail.fillCircle(RAIL_X, node.y, node.radius + 1.5);
      rail.fillStyle(node.colour, 0.92);
      rail.fillCircle(RAIL_X, node.y, node.radius);
      rail.lineStyle(0.9, INK_UI.brush, 0.45);
      rail.strokeCircle(RAIL_X, node.y, node.radius);
    }
    return rail;
  }

  /**
   * The champions, filed under the age they belong to — and now shut under it as well.
   *
   * The era headings were already here and were already the right split; what they were not was a
   * *control*. Fifty-one portraits is eleven screens of scrolling, so a reader who wanted the Trần
   * generals had to travel past every Lý minister to reach them, twice, once in each direction.
   * The heading each of them was already standing under is the obvious thing to make shut.
   */
  private buildFigures(scroll: InkScrollArea): number {
    let y = 0;
    const grouped = this.figuresByEra();
    for (const era of HISTORY_ERAS) {
      const group = grouped.get(era.id);
      if (!group?.length) {
        continue;
      }
      const sectionOpen = this.openSection.figures === era.id;
      y = this.sectionHeader(scroll, y, {
        key: era.id,
        title: historyText(`eras.${era.id}.title`),
        count: t('history.section.people', { count: group.length }),
        // The age's dates, not a written note. Which century a heading covers is the only thing a
        // reader needs to choose between them here, and it is a fact the data already carries.
        meta: this.range(era.from, era.to),
        open: sectionOpen,
      });
      if (!sectionOpen) {
        continue;
      }

      for (const hero of group) {
        const key = `figure:${hero.id}`;
        const open = this.expanded === key;
        const dates = FIGURE_DATES[hero.id];
        const bio = heroBio(hero);
        const opts = {
          title: heroName(hero),
          subtitle: `${heroTypeLabel(hero.type)} · ${dates ? t('history.figures.lived', { dates }) : t('history.figures.unknown')}`,
          body: open ? bio : this.clip(bio),
          border: open ? INK_UI.cinnabar : undefined,
        };
        const top = y;
        const measured = this.ui.measureCard(LIST_WIDTH - PORTRAIT - 14, PORTRAIT, opts);
        scroll.lazyRow(key, top, measured + CARD_GAP, () => {
        const y = top;
        const card = this.ui.card({ x: PORTRAIT + 8, y, width: LIST_WIDTH - PORTRAIT - 14, height: PORTRAIT }, opts);
        this.makeTappable(card, key, LIST_WIDTH - PORTRAIT - 14);
        scroll.content.add(card);
        if (open) {
          this.revealCard(card);
        }
        // The portrait rides beside the card rather than inside it, because the card grows with
        // its prose and a face stretched to match would be worse than a face that simply sits at
        // the top of a tall entry.
        const face = renderHeroFaceInBox(this, hero, { x: 0, y, width: PORTRAIT, height: PORTRAIT });
        scroll.content.add(face);
        if (this.revealSection === era.id && !open) {
          // Both on the same step. Staggered against each other, a face lands before the name
          // beside it and the row reads as two things rather than one.
          const step = group.indexOf(hero);
          this.revealRow(card, step);
          this.revealRow(face, step);
        }
        });
        y += measured + CARD_GAP;
      }
    }

    // The roster names a hundred and twenty-five real people and writes up fifty-one of them. The
    // rest get one closing card rather than fifty-one thin ones: they are listed under no century
    // and no dates because `REAL_FIGURES` carries neither, and a heading invented for them would be
    // the one kind of mistake this page cannot afford. Naming them is still worth doing — a player
    // who met Đặng Dung once should be able to confirm he was real.
    const authored = new Set(heroTemplates.map((hero) => hero.name));
    const rest = REAL_FIGURES.filter((figure) => !authored.has(figure.name)).map((figure) => figure.name);
    if (rest.length) {
      const sectionOpen = this.openSection.figures === 'also';
      y = this.sectionHeader(scroll, y, {
        key: 'also',
        title: t('history.figures.alsoDrawn'),
        count: t('history.section.people', { count: rest.length }),
        note: t('history.figures.alsoDrawnBody', { count: rest.length }),
        open: sectionOpen,
      });
      if (sectionOpen) {
        const card = this.ui.card(
          { x: ROW_INDENT, y, width: LIST_WIDTH - 6 - ROW_INDENT, height: 52 },
          { body: rest.join(' · '), muted: true },
        );
        scroll.content.add(card);
        if (this.revealSection === 'also') {
          this.revealRow(card, 0);
        }
        y += ((card.getData('cardHeight') as number | undefined) ?? 52) + CARD_GAP;
      }
    }
    return y;
  }

  /**
   * The Chronicle's episodes, filed by what kind of thing happened.
   *
   * Not by date and not by dynasty — both were tried on paper and both scatter the entries a
   * reader wants side by side. Bạch Đằng happened twice, three hundred and fifty years apart, and
   * the two tellings of Diên Hồng would land in the same century and still not land together.
   * What these entries share is a *behaviour*, which is the axis the stories were written on in
   * the first place. `world` is the group that earns the scheme: five episodes that are Korean,
   * Japanese, Roman, Byzantine and Cham, marked as not ours in prose you had to open one to read,
   * and now shut behind a heading that says it.
   */
  private buildStories(scroll: InkScrollArea): number {
    const width = LIST_WIDTH - 6 - ROW_INDENT;
    let y = 0;
    for (const group of this.sections(STORY_GROUPS, storyCatalogIds)) {
      const sectionOpen = this.openSection.stories === group.id;
      y = this.sectionHeader(scroll, y, {
        key: group.id,
        title: this.groupText('stories', group.id, 'title'),
        count: t('history.section.entries', { count: group.ids.length }),
        note: this.groupText('stories', group.id, 'note'),
        open: sectionOpen,
      });
      if (!sectionOpen) {
        continue;
      }

      for (const id of group.ids) {
        const key = `story:${id}`;
        const open = this.expanded === key;
        const happened = historyText(`stories.${id}.happened`);
        const written = happened !== `stories.${id}.happened`;
        const body = !written
          ? t('history.stories.unwritten')
          : open
            ? `${happened}\n\n${t('history.stories.inGame')} — ${historyText(`stories.${id}.inGame`)}`
            : this.clip(happened);
        const opts = {
          title: storyTitle(id),
          subtitle: STORY_ANCHORS[id] ?? '',
          body,
          border: open ? INK_UI.cinnabar : undefined,
          muted: !written,
        };
        const top = y;
        const measured = this.ui.measureCard(width, 58, opts);
        scroll.lazyRow(key, top, measured + CARD_GAP, () => {
        const card = this.ui.card({ x: ROW_INDENT, y: top, width, height: 58 }, opts);
        if (written) {
          this.makeTappable(card, key, width);
        }
        scroll.content.add(card);
        if (open) {
          this.revealCard(card);
        } else if (this.revealSection === group.id) {
          this.revealRow(card, group.ids.indexOf(id));
        }
        });
        y += measured + CARD_GAP;
      }
    }
    return y;
  }

  /**
   * The glossary, in four drawers.
   *
   * `GLOSSARY_TERMS` is ordered by when a player first meets each word, which is the right order
   * for a first read and the wrong one for every read after it: somebody who has just seen "Thái
   * úy" on a hero card is looking for the offices, not for the ninth word on a list of
   * twenty-four. The reading order survives inside each drawer.
   */
  private buildTerms(scroll: InkScrollArea): number {
    const width = LIST_WIDTH - 6 - ROW_INDENT;
    let y = 0;
    for (const group of this.sections(TERM_GROUPS, GLOSSARY_TERMS)) {
      const sectionOpen = this.openSection.terms === group.id;
      y = this.sectionHeader(scroll, y, {
        key: group.id,
        title: this.groupText('terms', group.id, 'title'),
        count: t('history.section.entries', { count: group.ids.length }),
        note: this.groupText('terms', group.id, 'note'),
        open: sectionOpen,
      });
      if (!sectionOpen) {
        continue;
      }

      for (const term of group.ids) {
        const key = `term:${term}`;
        const open = this.expanded === key;
        const body = historyText(`terms.${term}.body`);
        const opts = {
          title: historyText(`terms.${term}.title`),
          body: open ? body : this.clip(body),
          border: open ? INK_UI.cinnabar : undefined,
        };
        const top = y;
        const measured = this.ui.measureCard(width, 52, opts);
        scroll.lazyRow(key, top, measured + CARD_GAP, () => {
        const card = this.ui.card({ x: ROW_INDENT, y: top, width, height: 52 }, opts);
        this.makeTappable(card, key, width);
        scroll.content.add(card);
        if (open) {
          this.revealCard(card);
        } else if (this.revealSection === group.id) {
          this.revealRow(card, group.ids.indexOf(term));
        }
        });
        y += measured + CARD_GAP;
      }
    }
    return y;
  }

  /**
   * The wardrobe, as something you turn rather than something you look at.
   *
   * The other three tabs are lists you read. This one is a plate you *change*: pick a dynasty, a
   * rank and a weapon, and the soldier at the top is redrawn through `figureStamp` — the same call
   * the battlefield and the map markers make, so the page can never drift from the game the way a
   * hand-drawn illustration of it would.
   *
   * It drifted anyway, for one release. This plate called `figure()` directly, and that *was* the
   * battlefield's call when the comment above was written; the battlefield then moved to the
   * authored Đông Hồ sheets (195 of them, one per wardrobe × rank × weapon, preloaded in every
   * scene) and left the page drawing the procedural understudy. Reported as "History page is still
   * using old render army", which is exactly what it was. Nothing is drawn by hand here now: the
   * plate asks for a stamp, and if the authored asset is missing `figureStamp` bakes `figure()`
   * itself — so `?mapart=procedural` still rolls the whole page back in one switch.
   *
   * Đại Việt only. The northern powers and Chăm have wardrobes in the code and a rival wears one
   * every run, but this page is about the army the player raises; a page that also taught you to
   * recognise the Ming would be a different page.
   *
   * The whole tab re-renders on every chip, which is what the accordion rows on the other tabs
   * already do. `pendingScroll` carries the offset across, so the chip you pressed stays under the
   * finger that pressed it.
   */
  private buildArmy(scroll: InkScrollArea): number {
    const width = LIST_WIDTH - 6;
    let y = 0;

    // ── the plate ───────────────────────────────────────────────────────
    // A framed sheet with one soldier on it, drawn large. The scale is set from the frame rather
    // than picked: the dynasty's name takes the top 30, its one identifying mark goes at the foot
    // under the soldier's feet, and the tallest thing the slot table can produce is a mounted man
    // at DRAWN 7.48. The mark sits *below* rather than beside the title because a raised sabre
    // reaches into the top right corner, and a caption a weapon is drawn through is not a caption.
    const plateHeight = 236;
    const plateFeet = plateHeight - 30;
    const plateScale = (plateFeet - 32) / 7.6;
    const plate = this.add.graphics();
    plate.fillStyle(INK_UI.parchmentShade, 1);
    plate.fillRoundedRect(0, y, width, plateHeight, 6);
    plate.lineStyle(1, INK_UI.parchmentDark, 1);
    plate.strokeRoundedRect(0, y, width, plateHeight, 6);
    scroll.content.add(plate);

    // No mounted x-nudge any more. The procedural pony reached 26 units forward against 20 back,
    // so a mounted man centred on his own origin sat visibly right of everything else and the page
    // pulled him back by 9. The authored sheet carries its own anchor and is already centred in
    // its frame, so the same correction applied twice is the error it used to fix, mirrored.
    const kind = {
        theme: this.armyTheme,
        tier: this.armyTier,
        arm: this.armyArm,
        colour: PIGMENT.muc,
        accent: PIGMENT.son,
        // The plate is one figure, not a crowd: it always takes the first wobble stream, so
        // pressing a chip and pressing it back shows the identical soldier.
      variant: 0,
      bucket: bucketFor(plateScale),
    } as const;
    // Every reviewed Vietnamese `royal` sheet now has eight transparent pixels above and below its
    // visible ink. Keep the plate figure inside its room as well: source padding protects the
    // silhouette, while this layout fit separately protects the title and caption at large scale.
    const soldier = placeStamp(
      this,
      figureStamp(this, kind),
      width / 2,
      y + plateFeet,
      figurePlaceScale(plateScale),
    );
    // Parented *before* it is measured. `getBounds` is world space, and an object that has not
    // been added yet reports coordinates that were never in it — so the content-space conversion
    // below subtracted an offset that had not been applied, and the soldier landed through his
    // own caption. The formation below reads correctly only because it is added first.
    scroll.content.add(soldier);
    /**
     * **He stands on a ground line; only his height is fitted.**
     *
     * Two earlier attempts, both wrong, both worth recording. Trusting `plateScale` — solved from
     * the procedural figure's DRAWN budget of 7.6 units, which the authored sheets do not share —
     * put the Lý swordsman's head through the dynasty's title. Centring the placed image inside
     * the plate then fixed the clipping and introduced its own fault: an authored sheet is 144x128
     * with the man nowhere near filling it, and its transparent margin is not symmetric, so
     * centring the *frame* left the Nguyễn guardsman's hat crowding the title with a hand's width
     * of empty paper under his feet. Reported twice, which is twice more than it deserved.
     *
     * The frame is not the man. What the stamp does tell us honestly is where his feet are:
     * `placeStamp` anchors the image at the sheet's registration point and `originY` is that
     * point's height within the texture, so `displayHeight * originY` is exactly how much of the
     * image stands *above* his feet. Put the feet on a line — the plate's own ground, above the
     * caption — and fit that measurement to the room between the line and the title. Scaling now
     * moves his head and nothing else, which is what a man standing on a floor does.
     */
    // The ground line, and the ceiling the man must clear. The ceiling sits well under the
    // dynasty's title rather than just below it: the ink scan finds the sabre's faintest pixel,
    // and a figure fitted hard against that line reads as *touching* the title even when it is
    // measurably clear of it. The margin is the fix for "still cut off" on a page where nothing
    // was clipped.
    const feetY = y + plateHeight - 44;
    const ceiling = y + 52;
    // Measured, not inferred. `originY` looked like the answer — it is the anchor's height within
    // the texture — but the sheets register below the drawn feet, so standing the *anchor* on the
    // line left the man hovering fifty units above the caption with his hat against the title.
    // The drawn box is the only honest measure of where a soldier begins and ends, and the same
    // world-to-content conversion the formation needs applies here.
    const origin = scroll.content.getWorldTransformMatrix();
    const ink = HistoryScene.inkBox(this, soldier.texture.key);
    const seen = () => {
      const b = soldier.getBounds();
      return {
        x: b.x - origin.tx + b.width * ink.x,
        y: b.y - origin.ty + b.height * ink.y,
        width: b.width * ink.w,
        height: b.height * ink.h,
      };
    };
    const before = seen();
    // 0.88, deliberately: filling the box exactly is what makes a plate look crowded, and this is
    // a reference plate, not a battle. The man is drawn a little inside his own room.
    const fit = Math.min(
      MAX_PLATE_UPSCALE,
      (feetY - ceiling) / Math.max(1, before.height),
      (width - 40) / Math.max(1, before.width),
    ) * 0.86;
    soldier.setScale(soldier.scale * fit);
    const after = seen();
    soldier.x += width / 2 - (after.x + after.width / 2);
    soldier.y += feetY - (after.y + after.height);

    // The dynasty's name and the one mark that identifies it, printed on the plate itself rather
    // than under it — a caption that has to be looked up is a caption nobody reads.
    scroll.content.add(this.add.text(10, y + 10, historyText(`army.${this.armyTheme}.title`), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '15px', fontStyle: '700',
    }));
    scroll.content.add(this.add.text(width / 2, y + plateHeight - 20, historyText(`army.${this.armyTheme}.mark`), {
      color: '#6b5230', fontFamily: UI_FONT, fontSize: '10px', align: 'center',
      wordWrap: { width: width - 20 },
    }).setOrigin(0.5, 0));
    y += plateHeight + CARD_GAP;

    // ── the three rows of chips ─────────────────────────────────────────
    y = this.armyChips(scroll, y, width, historyText('army.label.dynasty'), 4,
      VIET_WARDROBE_ORDER.map((theme) => ({
        key: theme,
        label: historyText(`army.${theme}.title`).split(' · ')[0],
        on: this.armyTheme === theme,
        pick: () => { this.armyTheme = theme; },
      })));

    y = this.armyChips(scroll, y, width, historyText('army.label.rank'), 3,
      ([0, 1, 2] as const).map((tier) => ({
        key: `tier${tier}`,
        label: historyText(`army.tier.${tier}.title`).split(' · ')[0],
        on: this.armyTier === tier,
        pick: () => { this.armyTier = tier; },
      })));

    y = this.armyChips(scroll, y, width, historyText('army.label.arm'), 3,
      ARMY_ARMS.map((arm) => ({
        key: arm,
        label: historyText(`army.arm.${arm}.title`).split(' · ')[0],
        on: this.armyArm === arm,
        pick: () => { this.armyArm = arm; },
      })));

    // ── and the same wardrobe as a whole army ───────────────────────────
    y = this.armyChips(scroll, y, width, historyText('army.label.formation'), 3,
      ARMY_DOCTRINES.map((doctrine) => ({
        key: doctrine,
        label: historyText(`army.doctrine.${doctrine}.title`).split(' · ')[0],
        on: this.armyDoctrine === doctrine,
        pick: () => { this.armyDoctrine = doctrine; },
      })));
    y = this.armyFormation(scroll, y, width);

    // ── what you are looking at ─────────────────────────────────────────
    // Intro first and once, then the three entries the current pick resolves to. Each is the same
    // record/confession pair the Dynasties tab uses, so the page never blurs what is documented
    // and what is us drawing something legible at eight pixels.
    const cards: Array<{ title: string; body: string }> = [
      { title: '', body: historyText('army.intro') },
      {
        title: historyText(`army.${this.armyTheme}.title`),
        body: historyText(`army.${this.armyTheme}.body`),
      },
      {
        title: historyText(`army.tier.${this.armyTier}.title`),
        body: historyText(`army.tier.${this.armyTier}.body`),
      },
      {
        title: historyText(`army.arm.${this.armyArm}.title`),
        body: historyText(`army.arm.${this.armyArm}.body`),
      },
      {
        title: historyText(`army.doctrine.${this.armyDoctrine}.title`),
        body: `${historyText(`army.doctrine.${this.armyDoctrine}.body`)}

${historyText('army.formation.note')}`,
      },
    ];
    for (const entry of cards) {
      const card = this.ui.card({ x: 0, y, width, height: 40 }, {
        title: entry.title || undefined,
        body: entry.body,
      });
      scroll.content.add(card);
      y += ((card.getData('cardHeight') as number | undefined) ?? 40) + CARD_GAP;
    }
    return y;
  }

  /**
   * The same wardrobe, deployed — a whole army rather than one man.
   *
   * An army is four blocks, not one: a loose screen forward, the shield wall as the main body, the
   * bows behind it and the horse as a wing off the flank. Drawn by `drawArmy`, which is what the
   * battlefield and the map markers both call, so the deployment on this page is the deployment in
   * the game rather than a picture of it.
   *
   * The scale is *measured*, not chosen. `armyShape` is asked for the formation at scale 1 and the
   * plate is fitted to whichever of width or height binds — a spear wall is wide and shallow, a
   * cavalry doctrine is neither, and a scale picked to suit one of them overflows on another.
   */
  /**
   * How tall a stamped soldier stands at scale 1, in design units.
   *
   * The mounted sheet is the tallest of the five and the one the budget has to clear, so it is the
   * one measured. Read off the stamp rather than the drawing: `figure()`'s 7.6 was right for the
   * procedural man and is simply a different number for the authored art.
   */
  /**
   * Where the ink actually is inside a sheet, as fractions of its frame.
   *
   * `getBounds()` on an Image measures the *frame*, and an authored figure does not fill its own:
   * the sheets are a uniform 144x128 with the man drawn wherever his weapon and stance need him,
   * so the frame's floor sits well below his feet and its ceiling well above his hat. Positioning
   * against the frame is what left the guardsman hanging with a hand's width of paper beneath him
   * on a plate that had been reported twice already.
   *
   * The source PNG is same-origin and 18k pixels, so it is scanned once and remembered: every
   * later dynasty chip on the same sheet is a map lookup. A texture that cannot be read — a
   * procedural bake rather than an authored image — returns the whole frame, which is exactly the
   * behaviour this page had before and is correct for a drawing that does fill its box.
   */
  private static readonly inkCache = new Map<string, { x: number; y: number; w: number; h: number }>();

  private static inkBox(
    scene: Phaser.Scene,
    key: string,
  ): { x: number; y: number; w: number; h: number } {
    const cached = HistoryScene.inkCache.get(key);
    if (cached) return cached;
    const whole = { x: 0, y: 0, w: 1, h: 1 };
    try {
      const source = scene.textures.get(key)?.getSourceImage() as CanvasImageSource | undefined;
      const width = Number((source as HTMLImageElement)?.width ?? 0);
      const height = Number((source as HTMLImageElement)?.height ?? 0);
      if (!source || !width || !height) return whole;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return whole;
      ctx.drawImage(source, 0, 0);
      const { data } = ctx.getImageData(0, 0, width, height);
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let py = 0; py < height; py += 1) {
        for (let px = 0; px < width; px += 1) {
          // 24 of 255: a woodblock edge fades out, and counting its faintest dust as ink puts the
          // box back where the frame was.
          if (data[(py * width + px) * 4 + 3] <= 24) continue;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
      if (maxX < 0) return whole;
      const box = {
        x: minX / width, y: minY / height,
        w: (maxX + 1 - minX) / width, h: (maxY + 1 - minY) / height,
      };
      HistoryScene.inkCache.set(key, box);
      return box;
    } catch {
      // A tainted or unreadable source is not worth taking the page down for.
      return whole;
    }
  }

  /**
   * The box the *men* occupy, which is not the box the container reports.
   *
   * `stampedArmy` builds one layer per rank index and pushes an empty one for any rank its plan
   * skips. An empty container still sits at the host's origin, and Phaser folds that origin into
   * `getBounds()` as a degenerate point — so the container measured a hundred units taller than
   * anything drawn in it, and a fit computed from that shrank a block that did not need shrinking
   * and then centred it against a corner nobody can see. Only leaves with a size are counted.
   */
  private static drawnBoundsOf(root: Phaser.GameObjects.Container): Phaser.Geom.Rectangle {
    let box: Phaser.Geom.Rectangle | undefined;
    const walk = (obj: Phaser.GameObjects.GameObject): void => {
      const child = obj as Phaser.GameObjects.Container & { getBounds?: () => Phaser.Geom.Rectangle };
      if (Array.isArray(child.list) && child.list.length > 0) {
        child.list.forEach(walk);
        return;
      }
      if (typeof child.getBounds !== 'function') return;
      const b = child.getBounds();
      if (b.width <= 0 || b.height <= 0) return;
      box = box ? Phaser.Geom.Rectangle.Union(box, b) : b;
    };
    walk(root);
    return box ?? new Phaser.Geom.Rectangle(root.x, root.y, 0, 0);
  }

  private figureUnitHeight(): number {
    const st = figureStamp(this, {
      theme: this.armyTheme, tier: this.armyTier, arm: 'mounted',
      colour: PIGMENT.muc, accent: PIGMENT.son, variant: 0, bucket: bucketFor(1),
    });
    return st.height * st.scale * figurePlaceScale(1);
  }

  private armyFormation(scroll: InkScrollArea, y: number, width: number): number {
    const plateHeight = 214;
    const plate = this.add.graphics();
    plate.fillStyle(INK_UI.parchmentShade, 1);
    plate.fillRoundedRect(0, y, width, plateHeight, 6);
    plate.lineStyle(1, INK_UI.parchmentDark, 1);
    plate.strokeRoundedRect(0, y, width, plateHeight, 6);
    scroll.content.add(plate);

    const probe = armyShape(ARMY_PLATE_MEN, this.armyDoctrine, 1);
    // A figure stands *above* the block's own depth, so the vertical budget is the deployment plus
    // one soldier — and how tall that soldier is comes from the stamp rather than from a number.
    // It used to be the literal 7.6, the procedural figure's DRAWN budget.
    const unitMan = this.figureUnitHeight();
    const scale = Math.min((width - 30) / probe.width, (plateHeight - 60) / (probe.height + unitMan));
    const shape = armyShape(ARMY_PLATE_MEN, this.armyDoctrine, scale);
    // `armyShape.left` is the leftmost file and `top` the frontmost rank, both relative to the
    // line's own centre, so this places the whole deployment rather than one of its blocks.
    const originX = -shape.left + (width - shape.width) / 2;
    const originY = y + plateHeight - 22 - shape.height;
    // `stampedArmy` walks the same `planArmy` placements `drawArmy` did — the probe above still
    // measures the block correctly — but draws each man as his authored stamp. Left un-articulated
    // on purpose: this is a deployment diagram, and a plate whose men march on the spot reads as a
    // battle rather than as the shape of one.
    const host = stampedArmy(this, originX, originY, ARMY_PLATE_MEN, 41, PIGMENT.muc, scale, {
      theme: this.armyTheme, tier: this.armyTier, accent: PIGMENT.son, composition: this.armyDoctrine,
    });
    scroll.content.add(host.container);

    /**
     * **`armyShape` measures the plan, not the picture.**
     *
     * Its width is where the *files* stand — the pitch between men — and that was the whole story
     * while each man was a few ink strokes about his own spine. An authored sheet is not: a
     * levelled spear reaches most of a man's width past the file it belongs to, so a block solved
     * to `shape.width` is drawn wider than the plate that was fitted to it, and Thế Tường Giáo —
     * the widest deployment the page can show — ran its right-hand rank off the edge. Reported.
     *
     * The same fault as the wardrobe plate above and the same answer: measure what was drawn.
     * The container holds men at absolute plan coordinates, so scaling it about its own origin
     * maps every position by the same factor, and the labels are mapped through by hand rather
     * than parented — a label inside the container would shrink with it, and 8-point type has
     * nothing to give.
     */
    const box = { x: 10, y: y + 26, width: width - 20, height: plateHeight - 26 - 26 };
    // **`getBounds` is world space; `box` is the scroll content's.** They differ by wherever the
    // list has been scrolled to and by the area's own origin, so comparing them directly placed
    // the deployment seventy-eight units above its own plate, on top of the doctrine chips. The
    // content's transform is the conversion, and it is taken once for both measurements.
    const origin = scroll.content.getWorldTransformMatrix();
    const local = (rect: Phaser.Geom.Rectangle) => ({
      x: rect.x - origin.tx, y: rect.y - origin.ty, width: rect.width, height: rect.height,
    });
    const drawn = local(HistoryScene.drawnBoundsOf(host.container));
    const k = Math.min(1, box.width / drawn.width, box.height / drawn.height);
    host.container.setScale(k);
    const scaled = local(HistoryScene.drawnBoundsOf(host.container));
    const dx = box.x + box.width / 2 - (scaled.x + scaled.width / 2);
    const dy = box.y + box.height / 2 - (scaled.y + scaled.height / 2);
    host.container.x += dx;
    host.container.y += dy;
    /** A plan point, through the fit the container just took. */
    const mapped = (px: number, py: number) => ({ x: host.container.x + px * k, y: host.container.y + py * k });

    // The block labels, each on a scrap of paper.
    //
    // A 3-point stroke was the knockout before, and it was enough against the procedural men —
    // a few thin ink lines. The authored figures are solid, so "Đao thủ 21" printed straight
    // through a rank of horsemen and the caption a diagram needs most became the least readable
    // thing on it. `clearPlate` is what the rest of the game puts under type that has to stand on
    // a drawing; the labels are built first, measured, and their plates laid under all of them so
    // no plate can cover a neighbour's words.
    const plates = this.add.graphics();
    scroll.content.add(plates);
    const labels = shape.blocks.map((block) => {
      const label = `${historyText(`army.arm.${block.arm}.title`).split(' · ')[0]} ${block.marks}`;
      const at = mapped(originX + block.x + ((block.cols - 1) * block.pitch) / 2, originY + block.feet + 4);
      return this.add.text(at.x, at.y, label, {
        color: '#4a3a22', fontFamily: UI_FONT, fontSize: '8px', align: 'center',
      }).setOrigin(0.5, 0);
    });
    for (const text of labels) {
      const b = text.getBounds();
      clearPlate(plates, b.x - 3, b.y - 1, b.width + 6, b.height + 2, Math.round(b.x + b.y));
    }
    for (const text of labels) scroll.content.add(text);

    scroll.content.add(this.add.text(width / 2, y + 8, historyText(`army.doctrine.${this.armyDoctrine}.title`), {
      color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '12px', fontStyle: '700', align: 'center',
    }).setOrigin(0.5, 0));
    return y + plateHeight + CARD_GAP;
  }

  /**
   * One labelled row of chips, wrapping at `perRow`. Returns the y it finished at.
   *
   * Drawn by hand rather than through `InkUI.button` for one reason: the tap has to be guarded
   * against the list window. A geometry mask hides pixels, not hit areas, so a chip scrolled off
   * the top of the list is still sitting there with a live hit rectangle under the header — which
   * is the fault this scene already records against its cards, where it stopped Back from working.
   */
  private armyChips(
    scroll: InkScrollArea,
    y: number,
    width: number,
    label: string,
    perRow: number,
    chips: Array<{ key: string; label: string; on: boolean; pick: () => void }>,
  ): number {
    scroll.content.add(this.add.text(2, y, label, {
      color: '#6b5230', fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
    }));
    const top = y + 14;
    const gap = 5;
    const height = 26;
    const chipWidth = Math.floor((width - (perRow - 1) * gap) / perRow);

    chips.forEach((chip, index) => {
      const cx = (index % perRow) * (chipWidth + gap);
      const cy = top + Math.floor(index / perRow) * (height + 4);
      const holder = this.add.container(cx, cy);

      const skin = this.add.graphics();
      skin.fillStyle(chip.on ? INK_UI.cinnabar : INK_UI.parchmentShade, chip.on ? 0.92 : 1);
      skin.fillRoundedRect(0, 0, chipWidth, height, 5);
      skin.lineStyle(1, chip.on ? INK_UI.cinnabarDark : INK_UI.parchmentDark, 1);
      skin.strokeRoundedRect(0, 0, chipWidth, height, 5);
      holder.add(skin);

      holder.add(this.add.text(chipWidth / 2, height / 2, chip.label, {
        color: chip.on ? INK_UI_HEX.lightText : INK_UI_HEX.inkText,
        fontFamily: UI_FONT,
        fontSize: '10px',
        align: 'center',
      }).setOrigin(0.5));

      const hit = this.add.rectangle(chipWidth / 2, height / 2, chipWidth, height, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        // A drag that ended on a chip is a scroll, not a tap — and the chips are in the middle of
        // the list, which is exactly where a reader grabs it to scroll.
        if (scrollGestureConsumedTap(pointer)) {
          return;
        }
        const at = designPointer(pointer);
        if (at.y < LIST_TOP || at.y > LIST_TOP + this.listHeight()) {
          return;
        }
        this.pendingScroll = this.scroll ? -this.scroll.content.y : 0;
      this.pendingAnchor = this.scroll?.snapshotAnchor();
        chip.pick();
        this.render();
      });
      holder.add(hit);
      scroll.content.add(holder);
    });

    return top + Math.ceil(chips.length / perRow) * (height + 4) + 2;
  }

  // ── Helpers ──

  private template(id: string): Hero | undefined {
    return heroTemplates.find((hero) => hero.id === id);
  }

  /**
   * The fifty-one real champions, filed under the age each one actually belongs to and sorted
   * inside it by year.
   *
   * Filed by *date*, not by `Hero.era`. That field dresses a portrait and has six buckets against
   * eleven ages, so grouping on it put Trưng Trắc — who died in 43 — under a heading that reads
   * 939–1009, and listed everyone with the Lê wardrobe twice because two ages wear it. On a page
   * whose entire job is being accurate about the record, that was the wrong field to reach for.
   *
   * Anyone with no dates at all falls back to their wardrobe era, which is the best guess the data
   * supports and is never contradicted by a year printed on the same card.
   */
  private figuresByEra(): Map<string, Hero[]> {
    const grouped = new Map<string, Hero[]>();
    const file = (eraId: string, hero: Hero): void => {
      const list = grouped.get(eraId);
      if (list) {
        list.push(hero);
      } else {
        grouped.set(eraId, [hero]);
      }
    };

    for (const hero of heroTemplates) {
      if (!hero.id.startsWith('real-')) {
        continue;
      }
      const override = FIGURE_ERA_OVERRIDE[hero.id];
      if (override) {
        file(override, hero);
        continue;
      }
      const year = figureYear(hero.id);
      const byYear = year === undefined
        ? undefined
        : HISTORY_ERAS.find((era) => year >= era.from && year <= era.to);
      const byWardrobe = HISTORY_ERAS.find((era) => era.heroEra === hero.era);
      const era = byYear ?? byWardrobe;
      if (era) {
        file(era.id, hero);
      }
    }

    for (const list of grouped.values()) {
      list.sort((a, b) => (figureYear(a.id) ?? Number.MAX_SAFE_INTEGER) - (figureYear(b.id) ?? Number.MAX_SAFE_INTEGER));
    }
    return grouped;
  }

  /**
   * A collapsed entry's first sentence and a bit, ended on a whole word.
   *
   * Cutting at a fixed character count mid-word reads as a rendering fault rather than as a
   * summary, which is the same reason the hero panels end on a word boundary too.
   */
  private clip(text: string, limit = 108): string {
    if (text.length <= limit) {
      return text;
    }
    const cut = text.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    const kept = cut.slice(0, lastSpace > 40 ? lastSpace : limit).trimEnd();
    // Trailing punctuation comes off before the ellipsis goes on. Cutting a Vietnamese paragraph
    // often lands just past a full stop, and "năm tám tuổi.…" renders as four dots in a row — which
    // reads as a rendering fault rather than as a summary, the same thing the word boundary above
    // exists to avoid.
    return `${kept.replace(/[.,;:·–—]+$/, '')}…`;
  }

  /** A year range, with BC written the way each language writes it. */
  private range(from: number, to: number): string {
    return t('history.yearRange', { from: this.year(from), to: this.year(to) });
  }

  private year(value: number): string {
    return value < 0 ? t('history.yearBc', { year: -value }) : String(value);
  }

  /**
   * Makes a card open and close on tap.
   *
   * The gesture check is the whole reason this is not just `setInteractive`: a card inside a
   * scrolling list must not fire because the finger happened to lift over it at the end of a drag,
   * and `InkUI.button` already refuses that same gesture for the same reason.
   */
  private makeTappable(card: Phaser.GameObjects.Container, key: string, width: number): void {
    const height = (card.getData('cardHeight') as number | undefined) ?? 48;
    // Tagged so the harness can press whichever row is actually first under the open heading. It
    // used to press a hard-coded y and assert something opened, which is a check that passes right
    // up until a heading of any height is drawn above the row it meant to press.
    card.setData('rowKey', key);
    const hit = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (scrollGestureConsumedTap(pointer) || this.closing) {
        return;
      }
      // A geometry mask hides pixels, not hit areas. Once the list has been scrolled, the rows that
      // have gone off the top are still sitting under the header with live hit rectangles on top of
      // it — so Back stopped working, and tapping the bare paper beside it silently opened a row
      // nobody could see. Only a tap that lands inside the list window counts.
      const at = designPointer(pointer);
      if (at.y < LIST_TOP || at.y > LIST_TOP + this.listHeight()) {
        return;
      }
      this.pendingScroll = this.scroll ? -this.scroll.content.y : 0;
      this.pendingAnchor = this.scroll?.snapshotAnchor();
      this.expanded = this.expanded === key ? undefined : key;
      this.render();
    });
    card.add(hit);
  }

  private clear(): void {
    // Every tween on this page targets an object about to be destroyed — a collapse mid-flight, a
    // stagger that has not finished arriving. Left running against dead objects they either throw
    // or, worse, land a `y` on a recycled one.
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.closing = false;
    this.scroll?.destroy();
    this.scroll = undefined;
    for (const item of this.content) {
      item.destroy();
    }
    this.content = [];
  }
}
