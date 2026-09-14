/**
 * The menu's shared numbers and the page type.
 *
 * `MenuMode` names the pages; the rest is the footer stack measured up from the bottom edge, the
 * arrival animation, the illustration plate offsets and the wind. A leaf: every module imports it,
 * it imports no sibling.
 */
import { GAME_HEIGHT } from '../../game/constants';
import { isDesktopLayout } from '../../platform/layout';
import { allowsDonationLinks } from '../../platform/shell';
import { CARD_ICON_SIZE } from '../../ui/CardIcons';

export type MenuMode = 'main' | 'classic' | 'confirm-new' | 'legacy' | 'dynasty' | 'temple';

/**
 * The front page's footer, measured up from the bottom edge.
 *
 * The support row — two independent links offering a coffee or a pull request — sits on the
 * sheet's edge, with the settings button just above it. The row holds pressable phrases rather
 * than buttons, so its height is the touch band they are centred in, not the type's visual height.
 *
 * 46 leaves both links their full touch height and separates them from the build stamp below.
 *
 * The button column stops at `SETTINGS_TOP`; the three settings rows that used to live there have
 * their own page now, and what is left above the footer is breathing room for the art.
 */
export const SUPPORT_ROW_HEIGHT = 46;
/**
 * The build stamp on the very bottom edge, under the support sentence.
 *
 * It was only ever on the settings page, which is two taps away and not where anybody thinks to
 * look when they are trying to say which version they are running. On the front page it is the
 * last thing on the sheet, in the quietest type the page has, doing what a colophon does: present
 * for whoever needs it, invisible to whoever does not.
 *
 * It sits on the bottom edge itself, below the 14 of margin the rest of the footer keeps — a
 * colophon belongs at the foot of the sheet, not floating one gap above it. `VERSION_EDGE` is all
 * that is left under it, and it is not zero because a descender on the last line of a page needs
 * somewhere to go, and because a phone with rounded corners eats the last few rows.
 *
 * 30 is the 9px line plus the air above it, and the air is most of it: the support actions keep
 * full-size touch areas even though their type is quiet, so a band sized to the type alone would
 * put the build stamp inside the links' hit region.
 *
 * The whole footer stack moves up by what this band takes and the art lane above it loses the
 * same, which is slack it had.
 */
export const VERSION_ROW_HEIGHT = 22;
export const VERSION_EDGE = 6;
/**
 * The install mark's size, and the gap between it and the build stamp it rides.
 *
 * Module-level because two pages lay the pair out and they have to agree: the front page centres
 * icon and colophon as one group, and the settings plate reserves the same slot to the left of its
 * own stamp. The scale is the one the three footer utility icons use — see `renderInstallMark`.
 */
/**
 * The pages that play an arrival, and the shape of it.
 *
 * `PAGE_ARRIVAL_BAND` is what counts as the same line: a row's parts sit within eight units of
 * each other, so that much slack groups a row without ever swallowing the row under it.
 * Settings used to be the second page here; it is its own scene now (`SettingsScene`).
 */
export const ARRIVING_PAGES = new Set<MenuMode>(['classic']);
export const PAGE_ARRIVAL_RISE = 6;
export const PAGE_ARRIVAL_BAND = 8;
/**
 * The wind: how far from the hand a gust is still felt, how fast a leaf may be carried, and how
 * far past the edge one drifts before it comes back on the other side.
 */
/**
 * How far down its own frame the mountain plate is drawn, as a fraction of the illustration's
 * height. The range and the valley are separate 1536x1024 sheets in one registration; at that
 * registration the karst feet stop just above the ground's far bank, so the plate's bare paper
 * showed between the peaks. See the placement in `drawDongHoIllustration`.
 */
/**
 * How far down its own frame the lotus plate is drawn, as a fraction of the illustration's height.
 *
 * On its own registration the stems end at about 0.95 of the frame, and at the near-left of the
 * valley that is still the pale sandbar rather than the river: the flowers read as standing on
 * the bank. Open water begins a little below it, so the plate sinks by this much and the stems
 * go into the water they are drawn as growing out of. See the placement in
 * `drawDongHoIllustration` and the stem anchors in `animateDongHoIllustration`, which carry the
 * same offset so every ripple still starts at a waterline.
 */
export const LOTUS_SINK = 0.035;
export const MOUNTAIN_DROP = 0.035;
export const WIND_REACH = 132;
export const WIND_TOP_SPEED = 3.4;
export const WIND_MARGIN = 26;
export const INSTALL_MARK_SCALE = 0.62;
export const INSTALL_MARK_SIZE = CARD_ICON_SIZE * INSTALL_MARK_SCALE;
export const INSTALL_MARK_GAP = 6;
/**
 * The trailer link's own line, under the support pair — on the phone column, where there are three
 * links.
 *
 * Three quiet phrases with their icons on one 390-wide line ("Mời mình ly cà phê · chung tay làm game ·
 * xem trailer") ran edge to edge with no air between them, and read as a jumble rather than as three
 * things to press. The two asks stay together as a pair; the trailer, which is about the game rather
 * than a request, takes its own centred line above the colophon.
 *
 * Zero where the row is already two (a store build, which has no coffee) and on the desktop scroll,
 * whose panel is laid out around one row.
 *
 * 48, because of what shares the foot with it. A link's touch band is 30 tall, so the trailer stands
 * `TRAILER_UNDER_PAIR` (32) under the pair to keep its band off theirs; and wherever the browser
 * offers "Install app", that mark's 44-unit touch target is centred 22 above the bottom edge and
 * reaches 44 up it (`renderInstallMark`). At 28 the trailer's band ran 19 units into that target,
 * which is drawn later and so on top: the lower half of "Xem trailer" opened the install sheet.
 * 48 lifts the whole footer until the trailer's band ends just above it.
 */
export const TRAILER_ROW_HEIGHT = allowsDonationLinks() && !isDesktopLayout() ? 48 : 0;
export const TRAILER_UNDER_PAIR = 32;
export const SUPPORT_TOP = GAME_HEIGHT - VERSION_ROW_HEIGHT - TRAILER_ROW_HEIGHT - SUPPORT_ROW_HEIGHT;
/** The language line under the utility buttons: two small flags, two labels, and thumb-sized hits. */
/**
 * The Exit button's own row, above the support sentence.
 *
 * Zero on the web, where there is nothing to exit: `renderMain` and `renderDesktopMain` both take
 * this out of the block above rather than stacking a row on top of the footer, so a browser tab's
 * page is laid out to the point where it always was.
 *
 * 38 is a 30-unit button and its air. It is a *button* and not the ghost link it was for one round
 * — *"make simple follow other game menu button exit in center of panel"* — so it needs a
 * button's room, and being centred it can no longer share a row with the support sentence.
 */
export const QUIT_ROW_HEIGHT = 38;

export const LANGUAGE_ROW_HEIGHT = 20;
/**
 * Settings and the language line are ONE block, and they are spaced like one.
 *
 * Distance is what says which things belong together — before colour, before a border, before a
 * heading. The footer had a single gap size for the whole column, so Continue sat as near to
 * Settings as it did to Classic Modes, and Settings sat as far from the language line as it did
 * from a game mode: the two settings read as strangers and a setting read as a game mode. Four
 * pixels here and a double gap above the block (see `renderMain`) is the whole of the fix.
 */
export const SETTINGS_BLOCK_GAP = 0;
export const SETTINGS_TOP = SUPPORT_TOP - 14 - LANGUAGE_ROW_HEIGHT - SETTINGS_BLOCK_GAP - 34;
export const LANGUAGE_TOP = SETTINGS_TOP + 34 + SETTINGS_BLOCK_GAP;
