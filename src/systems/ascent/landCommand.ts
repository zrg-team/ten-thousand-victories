import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { heroActive } from '../heroes/heroModel';
import type { GameState, Hero, Land } from '../../state/types';

/**
 * Who commands the defence of a province — the one question five different places were answering
 * for themselves, and all five were answering it wrong.
 *
 * Every one of them read the same thing: *some non-levy host standing on this ground has a
 * `generalHeroId`*. That is fine when a field army is home, and it is the whole story when one is
 * not — which is most waves. A province the player has posted a governor to, walked into by an
 * invader while the hosts are elsewhere, turns out its walls as a garrison levy, and
 * `raiseGarrisonLevy` sets no general on it. So the fight opened under nobody: no rally, the
 * general AI running on a default martial of 45, the header reading *chưa có chủ tướng* and the
 * Reckoning crediting *tướng lĩnh dưới quyền*. Reported as: the hero assigned to a land should be
 * the hero who commands its defence.
 *
 * The order matters and is not arbitrary. A general who marched a host here outranks the resident
 * governor — they brought an army, the governor brought a seal — so the host is checked first and
 * the governor is the fallback rather than the rule.
 *
 * Deliberately a *resolver* rather than a `generalHeroId` stamped on the levy. That was the smaller
 * diff and the larger blast radius: a levy carrying a general is a leaderless-host check satisfied
 * (`CourtLaneSystem`), an appointment offered over a host that exists for one battle, a muster
 * blocked because a transient army names its commander (`MusterSystem`), and a
 * `releaseHeroAssignment` that now matches something it never used to. The levy stays what it is —
 * the province's walls turned out for one fight — and the *question* moves instead.
 *
 * Phaser-free and free of `CourtSystem`, which imports far too much to be pulled into
 * `BattleSystem`; the governor relation is one field on the hero and needs nothing else.
 */
export function defenceCommanderOf(state: GameState, land: Land | undefined): Hero | undefined {
  if (!land) return undefined;

  // 1. A field host standing here, under its own general.
  const led = state.armies.find((army) => army.kingdomId === PLAYER_KINGDOM_ID
    && army.landId === land.id
    && !army.isLevy
    && army.generalHeroId);
  if (led?.generalHeroId) {
    const general = state.heroes.find((hero) => hero.id === led.generalHeroId);
    if (general && heroActive(general)) return general;
  }

  // 2. Failing that, whoever holds the province. `assignedTo` is a tagged string — `court:<seat>`,
  // an army id, an errand — and a bare land id is exactly the governorship (`assignHeroToLand`).
  return state.heroes.find((hero) => hero.assignedTo === land.id && heroActive(hero));
}

/** The same answer as a name, for the paths that only ever wanted one. */
export function defenceCommanderName(state: GameState, land: Land | undefined): string | undefined {
  return defenceCommanderOf(state, land)?.name;
}
