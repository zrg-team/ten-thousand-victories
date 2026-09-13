/**
 * What a wave actually strikes, as a defence figure (beta `strikeSizing`).
 *
 * The shipped sizing reads the whole realm back into every wave — field hosts plus 35% of every
 * garrison — and then delivers the wave to *one* place. Measured with the honest skill-ceiling gate,
 * every plan loses its frontier between waves 8 and 20 and dies holding the capital alone: a
 * province adds to every wave but defends only itself. This reference sizes a wave by the ground its
 * shape marches at instead:
 *
 *   - a capital-aimed shape (hammer, decapitate) by the capital's garrison and the hosts on it;
 *   - a host-aimed shape (hunt) by the largest host and the garrison it stands in;
 *   - border and spread shapes by the median frontier province, once per column;
 *   - a Great Invasion never below the capital, whatever its shape.
 *
 * A leaf over `WarSystem` and `PowerSystem`; it must never import `WaveDirector` (which calls it)
 * or `InvasionSystem` (which would close the WarSystem ↔ InvasionSystem cycle through it).
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import type { WaveShape } from '../../game/ascentConfig';
import { armyPower } from '../WarSystem';
import { sizingGarrisonPower } from './PowerSystem';
import type { GameState } from '../../state/types';

export interface StrikeSample {
  capital: number;
  frontier: number;
  host: number;
}

export function liveStrikeSample(state: GameState): StrikeSample {
  const owned = new Set(state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).map((land) => land.id));
  const capitalId = state.ascent?.capitalLandId;
  const hostsOn = new Map<string, number>();
  let largestHost = 0;
  let largestHostLand: string | undefined;
  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID || army.isLevy) continue;
    const power = armyPower(state, army);
    hostsOn.set(army.landId, (hostsOn.get(army.landId) ?? 0) + power);
    if (power > largestHost) {
      largestHost = power;
      largestHostLand = army.landId;
    }
  }
  const garrisonOf = (landId: string | undefined): number => {
    const land = landId ? state.lands.find((candidate) => candidate.id === landId) : undefined;
    return land && owned.has(land.id) ? sizingGarrisonPower(state, land) : 0;
  };

  const capital = garrisonOf(capitalId) + (capitalId ? hostsOn.get(capitalId) ?? 0 : 0);
  const frontierValues = state.lands
    .filter((land) => owned.has(land.id) && land.id !== capitalId && land.neighbors.some((id) => !owned.has(id)))
    .map((land) => sizingGarrisonPower(state, land) + (hostsOn.get(land.id) ?? 0))
    .sort((a, b) => a - b);
  const frontier = frontierValues.length > 0 ? frontierValues[Math.floor(frontierValues.length / 2)] : capital;
  const host = largestHost > 0 ? largestHost + garrisonOf(largestHostLand) : capital;
  return { capital, frontier, host };
}

export function strikeReference(sample: StrikeSample, shape: WaveShape, boss: boolean): number {
  const columns = Math.max(1, shape.hosts + shape.kingdoms - 1);
  const aimed = shape.aim === 'capital'
    ? sample.capital
    : shape.aim === 'host'
      ? sample.host
      : sample.frontier * columns;
  return boss ? Math.max(aimed, sample.capital) : aimed;
}
