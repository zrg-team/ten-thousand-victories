/**
 * The `affairs` lane, and only that: one grid of the surviving rival empires — power, opinion, war
 * appetite, and the badges for a pact, a vassal and our ambassador — plus the rival a story has
 * taken an interest in.
 *
 * Nothing is decided in the lane. Tapping a realm closes it and emits `ui:ascent-envoy`, and the
 * envoy sheet that answers is a prompt elsewhere — which is why this file has no second page and
 * no scroll-area teardown of its own. Rivals are never sorted, so a realm keeps its corner of the
 * grid from one repaint to the next and four tiles read as a comparison.
 */
import { PLAYER_KINGDOM_ID } from '../../../game/constants';
import { getEmpirePower, hasPact } from '../../../systems/DiplomacySystem';
import { INK_UI } from '../../../ui/InkUI';
import { isVassal } from '../../../systems/ascent/VassalSystem';
import { hostsInTheField } from '../../../systems/ascent/CourtBargains';
import { statChips } from '../../../ui/statChips';
import { t } from '../../../i18n';
import type { ConquestUIScene } from '../../ConquestUIScene';


/** The rival empires as they stand: power, opinion, pacts, and who has our ambassador. */
export function showAffairsScreen(self: ConquestUIScene): void {
  const state = self.state;
  const rivals = state.kingdoms.filter(
    (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated,
  );
  const { addWidget, addHeading, addRow, finish } = self.laneList(t('action.affairs'), t('ascent.lane.worldBody'));

  // Four neighbours, one under the other. They were paired into a grid to keep all four above the
  // fold, but half the width is not enough for a realm's name and its standing: every title wrapped
  // to two or three lines, so the grid was taller than the list it was avoiding *and* harder to
  // read. There is not enough on this page to need columns — reported exactly that way.
  addWidget(0, (parent, width) => self.actionTiles(parent, width, rivals.map((kingdom) => {
    const relations = Math.round(kingdom.relations ?? 50);
    // Who they feud with, and whether one of their hosts is standing on our ground right now.
    //
    // Both are decisions the player is being asked to make on this screen and neither was on it.
    // The feud is what makes "warm this one, cool that one" legible instead of arithmetic the
    // player has to reverse-engineer from the numbers moving; the season count is what makes
    // holding out a plan — a host with two seasons left is a very different problem from one
    // with twelve, and until now they looked identical.
    const feud = state.kingdoms.find((other) => other.id === kingdom.feudWith && !other.isDefeated);
    const theirHost = hostsInTheField(state, kingdom.id)[0];
    return {
      title: `${kingdom.name}  ·  ${relations}`,
      // The two figures are glyph-and-number; the rest of the line is *not a figure* and stays in
      // words. "Strength 1250 · War appetite 0" was the whole reason this row needed two lines.
      costs: statChips([
        ['strength', Math.round(getEmpirePower(state, kingdom))],
        ['appetite', Math.round(kingdom.warAppetite ?? 0)],
        // Only while one of their hosts is standing on our ground: the seasons it can keep
        // standing there is the figure that makes holding out a plan.
        theirHost ? ['seasons', Math.max(0, theirHost.campaignTicks ?? 0)] : undefined,
      ]),
      note: [
        feud ? t('ascent.world.feud', { kingdom: feud.name }) : undefined,
        hasPact(kingdom) ? t('ascent.world.pact') : undefined,
        isVassal(kingdom) ? t('ascent.vassal.badge') : undefined,
        kingdom.ambassadorHeroId ? t('ascent.world.ambassador') : undefined,
      ].filter(Boolean).join('  ·  '),
      // Green when content, red once cold enough to march.
      border: isVassal(kingdom) ? INK_UI.jade
        : relations >= 55 ? INK_UI.jade : relations >= 35 ? INK_UI.gold : INK_UI.cinnabar,
      onTap: () => {
        self.closeLane();
        self.events.emit('ui:ascent-envoy', kingdom.id);
      },
    };
  }), { columns: 1, chipSize: 'stat' }));
  // The rival a story has taken an interest in, on the screen where rivals live.
  self.addStoryOpening('rival', undefined, addHeading, addRow);

  finish();
}
