/**
 * The numbers and small pure helpers more than one area of the Dragon Ascent HUD needs — the battle
 * dock's bands, the lane and prompt footers, the rarity palette, the `BattleMarker` record.
 *
 * They sit together because this file imports no sibling and touches no scene, which is what lets
 * `battle/`, `lanes/`, `prompts/` and `screens/` import it directly instead of bouncing off a
 * forwarding method. A sibling import added here is what would start a cycle.
 *
 * `BATTLE_DOCK_HEIGHT` is a sum: move a band above it and the dock moves with it, and what it must
 * not do is print through the exits at `BATTLE_EXITS_OFFSET`. `verify-battle-dock` measures the
 * real tap targets at 620, the shortest screen `GAME_HEIGHT` clamps to.
 */
import Phaser from 'phaser';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { hudSheetWidth } from '../../game/cameraLayout';
import { INK_UI, type UIBounds } from '../../ui/InkUI';
import { type BattleFormation } from '../../data/ascent/formations';
import { CARD_ICON_SIZE, type CardIconId } from '../../ui/CardIcons';
import type { StoryOutcome, Army, AscentPrompt, AscentRarity, GameState, Hero } from '../../state/types';


/**
 * The battle screen's bands.
 *
 * The field used to be a fixed 168px — a fifth of the screen, on which two blocks of figures
 * stood on nothing. It is the thing the screen exists to show, so it now takes whatever is left
 * once the parts that cannot shrink have been paid for.
 *
 * Sized as a band rather than a number because `GAME_HEIGHT` is derived from the device aspect
 * and clamps as low as 620: a fixed height that fits a tall phone pushes the dock off an SE.
 */
export const BATTLE_RAILS_HEIGHT = 56;
/**
 * Two strips of deliberately different weight. Fixed: the orders must never scroll.
 *
 * Bottom-up, because that is the order of how often each is touched — the formation strip is worked
 * three to five times an engagement and owns the thumb's own band; the stance strip is worked once
 * or twice and sits above it, smaller and further away. See `docs/14-five-shapes-two-dials.html`.
 *
 *   stance label 12 + segments 30 = 42
 *   gap 6
 *   formation label 12 + chips 52 = 64
 *
 * 112 and not a point more. At 122 this printed five pixels through the lane's Close button on a
 * 620-high screen — the field is already at its 150 floor there, so it cannot give the dock any
 * more room and every extra point comes straight out of the one control that gets you out of a
 * fight. `verify-battle-dock` measures it at 620 for exactly this reason.
 */
// 36, up from 30: the forty-eight points the battle header gave back (see `battleHeaderFrame`)
// are spent on the two dials, which is where a thumb actually lands.
export const BATTLE_STANCE_HEIGHT = 36;
/**
 * 64, up from 52.
 *
 * The chip carries a glyph, an order and — sometimes — a state line, and in Vietnamese the order
 * itself is two words that wrap: `XUNG PHONG`, `GIƯƠNG KHIÊN`. Glyph 15 + two lines of 13 + a
 * state line of 11 is 54 of content in a 52-point box, so `đang chuyển thế · 1` printed out of the
 * bottom of the chip and into the exits below it. Measured against the longest pair the catalog
 * has, not against the English.
 */
// 72, up from 64, out of the same forty-eight.
export const BATTLE_FORMATION_HEIGHT = 72;
/**
 * The band above both dials: what the enemy is doing, what this beat is costing, and — when an
 * order has just landed — whether it was worth making.
 *
 * It is paid for by deleting the two strip labels it replaces. `THẾ TRẬN — FORMATION` over a row of
 * chips that now carry their own icons and verbs was a caption naming what the reader is looking
 * at, and the dock has no 12 points to spend on that: `BATTLE_DOCK_HEIGHT` was already trimmed
 * 122 → 112 because it printed through the lane's Close button at 620, and the field is at its 150
 * floor there and cannot give any back. Two labels out, one band in, same 112.
 */
export const BATTLE_READOUT_HEIGHT = 26;
/**
 * Ten points between the two dials, three above the top one.
 *
 * The strips answer different questions on different clocks — how hard to press, and what shape to
 * stand in — and at a three-point gap they read as one nine-button grid with a size change halfway
 * down it. Ten is enough that the eye takes them as two rows without a rule being drawn between
 * them, and it comes out of the field, which has the points to spare everywhere above the 620 floor.
 */
export const BATTLE_DIAL_GAP = 10;
export const BATTLE_DOCK_HEIGHT = BATTLE_READOUT_HEIGHT + 3 + BATTLE_STANCE_HEIGHT + BATTLE_DIAL_GAP
  + BATTLE_FORMATION_HEIGHT;
/**
 * Where the two exits sit, measured up from the bottom edge.
 *
 * Its own number rather than the lane's `LANE_CLOSE_BUTTON_OFFSET`, because this screen is the one
 * with a full dock above them: twelve points of daylight between the formation strip and the
 * buttons that end the fight is not enough on a real handset, and every other lane has a whole
 * empty sheet there. Ten lower than the lane's, which is ten more the dock does not have to share.
 */
export const BATTLE_EXITS_OFFSET = 56;
/**
 * A glyph per shape, so a chip can be recognised rather than read.
 *
 * Each one draws the *arrangement* its shape puts the men in, seen from above — the same reading
 * the field gives, at 15 points. See `docs/14-five-shapes-two-dials.html` for the ring itself.
 */
export const FORMATION_ICON: Record<BattleFormation, CardIconId> = {
  chong: 'spears',
  xung: 'horse',
  tan: 'skirmish',
  quy: 'tortoise',
  no: 'bows',
};

/**
 * The battlefield's rectangle: the full width of the sheet, at the content's own vertical place.
 *
 * Its own function because four things have to agree about it — the panel, the ground, the stencil
 * that ends the ground at the paper's edge, and the bounds the coach points at — and when they were
 * four copies of `content.x` arithmetic, widening the field meant finding all four.
 */
export function battleFieldBox(content: UIBounds, fieldHeight: number): UIBounds {
  // The HUD's sheet, not the column: on the desktop the battle takes a wider stage (`hudSheet.ts`).
  return { x: 0, y: content.y, width: hudSheetWidth(), height: fieldHeight };
}

/**
 * Room kept clear at the foot of a scrolling prompt for its fixed buttons.
 *
 * One 40px button, plus breathing space above and below. Prompts that pin buttons below their list
 * pass this to `promptScrollBody` and place them at `GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8`.
 */
/**
 * The band a prompt keeps clear at its foot, measured **up from the bottom of the screen**: a
 * 40pt button row, the "hold to choose" line above it, and eight points under it.
 *
 * Up from the screen, not down from the content box, because those are two different bottoms —
 * the box stops about twenty points short — and reserving against one while pinning the buttons
 * to the other left a band of nothing between the hint and the buttons. Reported as exactly that.
 */
export const PROMPT_FOOTER_HEIGHT = 64;
/** Of that band, the room above the buttons the hold hint is printed in. */
export const PROMPT_HINT_ROOM = 16;

/**
 * **One shape for a two-button foot, everywhere in the mode.**
 *
 * Lanes stacked the way back above the way out; prompts set them side by side; a page with its own
 * action did something else again — so the same pair of controls moved depending on which file
 * drew it. Reported as exactly that. This is the rule now, and both frames call it:
 *
 *   left = the way back (ghost) · right = the way out (accent)
 *
 * The right side is sized to its label, because "close" and "keep the point for later" are both
 * dismissals and only one of them fits in a third of the width.
 */
export function footerSplit(
  x: number,
  width: number,
  rightLabel: string,
): { leftX: number; leftWidth: number; rightX: number; rightWidth: number } {
  const gap = 8;
  const rightWidth = Math.round(width * (rightLabel.length > 12 ? 0.42 : 0.34));
  const leftWidth = width - rightWidth - gap;
  return { leftX: x, leftWidth, rightX: x + leftWidth + gap, rightWidth };
}

/**
 * Enemy hosts the player can actually see, and so can act on.
 *
 * Visibility is the honest gate here: offering a hunt against a host standing in the dark would
 * hand the player information the map is deliberately withholding.
 */
export function visibleHostileHosts(state: GameState): Army[] {
  return state.armies.filter((army) => {
    if (army.kingdomId === PLAYER_KINGDOM_ID) return false;
    const at = state.lands.find((land) => land.id === army.landId);
    return Boolean(at?.isVisible);
  });
}

/** The lane browser's close button: how far its top sits above the foot of the screen, and its height. */
// 70/46, up from 66/42: the button keeps the same 24 points of margin under it and gains four
// of height, out of the readout band the lane now covers. "Make the bottom have more space for
// the buttons" — the one control on most of these pages is the one that gets you out.
export const LANE_CLOSE_BUTTON_OFFSET = 70;
export const LANE_CLOSE_BUTTON_HEIGHT = 46;

/**
 * Room a lane browser keeps clear at its foot, derived from the button that sits there.
 *
 * The list used to reserve a hardcoded 58 while `laneCloseButton` placed itself against
 * `GAME_HEIGHT` independently, so moving either one silently overlapped the other. The 8 is the
 * breathing space between the last row and the button.
 */
export const LANE_FOOTER_HEIGHT = LANE_CLOSE_BUTTON_OFFSET - 8;

/** A pigment as CSS, for the few places a Phaser `Text` needs one of the palette's own numbers. */
export const cssHex = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;

/**
 * One host's marker on the battle field, kept beside the id it belongs to.
 *
 * The strength stamped on a marker is set when it is drawn, and the field is only redrawn when
 * the *set* of hosts changes — so without re-stamping, a column that had bled from 1,500 to
 * 900 still wore "1.5k" while the bar beneath it said otherwise.
 */
export interface BattleMarker {
  hostId: string;
  marker: Phaser.GameObjects.Container;
  count?: Phaser.GameObjects.Text;
  /**
   * What this host had when the field opened.
   *
   * Kept here rather than in state because it is a *drawing* fact: it is what lets the formation
   * spend its losses in order — the screen first, then the line, then the bows — instead of every
   * block shrinking together. Nothing in the simulation needs it.
   */
  mustered?: number;
  /** The host broke and is running. It has left the line and the line stops moving it. */
  routed?: boolean;
  /**
   * Figures the block was last drawn with — `men / MEN_PER_MARK`.
   *
   * The block is redrawn when this changes and only then. `hostShapeAt` already sizes a host by
   * its headcount, so the picture of an army shrinking was one recompute away and never made:
   * `slideMarkers` re-stamped the number over the men and moved on, and a host ground down from
   * 1,180 to 300 spent the whole fight drawing twenty-one ranks of men who were already dead.
   */
  marks?: number;
  /**
   * Half the block's drawn width, so the two lines can be kept from standing inside each other.
   *
   * `BATTLE_SEAM_GAP` is a distance between the two *centres*, and 34 units of it was chosen when
   * a host was drawn nineteen units wide. At the battle screen's own scale a large host is over
   * fifty, so the constant alone put the enemy's front rank behind our own back rank.
   */
  halfWidth?: number;
  /**
   * The host is walking onto the field (`marchIn`, battle/relief.ts). The line leaves it alone
   * until the walk lands: `slideMarkers` would kill the entrance and stand it on the line, and a
   * shape redraw would rebuild it mid-stride wherever it happened to be.
   */
  arriving?: boolean;
}

/** Men still standing in a host. */
export function hostSize(host: { units: { spearmen: number; archers: number; heavyInfantry: number } }): number {
  return host.units.spearmen + host.units.archers + host.units.heavyInfantry;
}

/** Rarity → frame colour. The one visual language shared by draft cards and summons. */
export const RARITY_COLOR: Record<AscentRarity, number> = {
  bronze: 0x9c6b3f,
  silver: 0xa8adb4,
  gold: INK_UI.gold,
  jade: INK_UI.jade,
};

/**
 * Rarity → paper wash. Bronze stays bare paper — the ordinary pull must *look* ordinary, or
 * the coloured ones stop meaning anything. The wash climbs with the tier so a jade card reads
 * as a different object across the room, not a footnote in its corner.
 */
export const RARITY_WASH: Record<AscentRarity, number> = {
  bronze: 0,
  silver: 0.05,
  gold: 0.11,
  jade: 0.15,
};
/**
 * A ledger figure, signed — except for the ones that are not deltas.
 *
 * Most lines are a change and read correctly with a sign: `−300 able men`, `+140 grain`.
 * A few carry a *total* or a level instead, and signing those says the wrong thing entirely:
 * `patron` is how many stand under the banner now, not how many joined, and "There are +1000
 * under that banner" reads as a thousand more of them.
 */
const ABSOLUTE_OUTCOMES = new Set(['patron', 'loyaltyFloor', 'academy', 'stipend', 'debt', 'fed', 'draftTilt']);

export function formatOutcomeAmount(entry: StoryOutcome): string {
  if (entry.amount === undefined) return '';
  const size = Math.abs(Math.round(entry.amount));
  if (ABSOLUTE_OUTCOMES.has(entry.kind)) return String(size);
  return `${entry.amount > 0 ? '+' : entry.amount < 0 ? '−' : ''}${size}`;
}

/** Left gutter a card icon occupies, glyph plus breathing room. */
export const ICON_GUTTER = CARD_ICON_SIZE + 12;

/** Width kept clear on a badged card's title line, covering the longest badge label. */
export const BADGE_CLEARANCE = 86;


/** Identity of a prompt's *content*, so a reroll re-renders but a tick does not. */
export function promptSignature(prompt: AscentPrompt): string {
  switch (prompt.kind) {
    case 'power-draft': return `${prompt.level}:${prompt.cards.join(',')}:${prompt.rerollCost}`;
    case 'conquer-target': return prompt.targets.map((target) => target.landId).join(',');
    // The notice is part of the identity: re-opening this sheet against the same province with
    // a refusal to report is a different screen from the one the player just tapped through.
    case 'conquer-method': return `${prompt.target.landId}:${prompt.target.methods.map((m) => m.method).join(',')}:${prompt.notice ?? ''}`;
    case 'hero-choice': return `${prompt.source}:${prompt.heroIds.join(',')}`;
    case 'court-appointment': return `${prompt.heroId}:${prompt.options.map((option) => option.id).join(',')}`;
    case 'law-choice': return `${prompt.points}:${prompt.projectIds.join(',')}`;
    case 'decree-offer': return `${prompt.instrument}:${prompt.targetId ?? ''}:${prompt.projectIds.join(',')}`;
    case 'doctrine': return `doctrine:${prompt.era}`;
    case 'parliament': return prompt.cardId;
    case 'envoy': return `${prompt.kingdomId}:${prompt.relations}`;
    case 'world-event': return `${prompt.eventId}:${prompt.kingdomId}:${prompt.otherKingdomId ?? ''}`;
    case 'famine': return `famine:${prompt.shortfall}`;
    case 'restore-land': return `restore:${prompt.landId}:${prompt.breach}:${prompt.ruins}:${prompt.dead}`;
    case 'province-order': return `${prompt.landId}:${prompt.reason}:${prompt.options.map((option) => option.id).join(',')}`;
    case 'muster-proposal': return `muster:${prompt.heroId}:${prompt.plan.soldiers}:${prompt.purpose}`;
    case 'rival-demand': return `${prompt.demand}:${prompt.kingdomId}`;
    case 'empire-response': return `${prompt.wave}`;
    case 'wave-result': return `${prompt.wave}`;
    case 'host-lost': return `hostLost:${prompt.armyName}:${prompt.reason}:${prompt.men}`;
    case 'story-beat': return `${prompt.storyId}:${prompt.fragmentId}`;
    case 'coronation': return 'coronation';
    // Constant, like the coronation's: the screen has no options and reads every number it prints
    // live from the stores, so nothing about its content can change while it stands.
    case 'inheritance': return 'inheritance';
    case 'mandate': return `mandate:${prompt.options.join(',')}`;
    case 'founder': return prompt.options.join(',');
    case 'run-over': return `${prompt.score}`;
    // The offer is the identity: the two rolled traits are what the player is deciding between,
    // and a second pick at the same level is a different card with the same level number on it.
    case 'dynasty-level': return `${prompt.level}:${prompt.options.join(',')}:${prompt.remaining}`;
    case 'bind-card': return `bind:${prompt.options.join(',')}`;
    case 'next-reign': return `${prompt.level}:${prompt.founderCount}:${prompt.traits.join(',')}`;
  }
}

export function heroStatLine(hero: Hero): string {
  const stats = hero.stats;
  return `⚔ ${stats.martial}   ⚙ ${stats.logistics}   ◈ ${stats.administration}`;
}
