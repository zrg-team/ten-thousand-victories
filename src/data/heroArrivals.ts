import { commitHeroAssignment } from '../systems/heroes/HeroService';
import {
  ARRIVAL_HOST_MIN,
  ARRIVAL_HOST_SHARE,
  ARRIVAL_TREASURY_SEASONS,
  ARRIVAL_TRUCE_SEASONS,
  ARRIVAL_WALL_DEFENCE,
  INVADER_POWER_PER_SOLDIER,
} from '../game/ascentConfig';
import { PLAYER_KINGDOM_ID } from '../game/constants';
import { applyResourceDelta, refreshAllLandOutputs } from '../systems/ResourceSystem';
import { contestedDefencePower } from '../systems/ascent/PowerSystem';
import { grantVassalage, sovereignRivals } from '../systems/ascent/VassalSystem';
import { addOpinionModifier, getEmpirePower } from '../systems/DiplomacySystem';
import { refreshPlayerVisibility } from '../systems/LandSystem';
import { t } from '../i18n';
import type { GameState, Hero, HeroArrivalId, Land } from '../state/types';

/**
 * What a ruler brings the moment they join.
 *
 * These are the twenty-four sovereigns, and the point of them is that a Legendary pull should
 * *change the board*, not add another percentage. Every one is built from something the game
 * already does — a host, a province changing hands, a crown bending the knee — so nothing here
 * needs a new system.
 *
 * `apply` returns false when the world cannot honour it (no free province, the vassal cap
 * already reached). The caller falls back to `treasury`, so a Legendary is never a dud.
 *
 * Numbers live in `ascentConfig`, not in the hero data: the hero carries only the id, so a save
 * written before a tuning pass gets the new numbers rather than the old ones.
 */
export interface HeroArrival {
  id: HeroArrivalId;
  apply: (state: GameState, hero: Hero) => boolean;
}

/** Nearest province the realm does not hold, preferring quiet ground. */
function nearestFreeLand(state: GameState): Land | undefined {
  const owned = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  const seen = new Set<string>();
  for (const land of owned) {
    for (const id of land.neighbors) {
      if (seen.has(id)) continue;
      seen.add(id);
      const neighbour = state.lands.find((candidate) => candidate.id === id);
      if (neighbour && neighbour.ownerId !== PLAYER_KINGDOM_ID) return neighbour;
    }
  }
  return undefined;
}

function capital(state: GameState): Land | undefined {
  return state.lands.find((land) => land.id === state.ascent?.capitalLandId)
    ?? state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

/** Scaled off what is currently coming at the realm — a flat number wins turn three and is noise at wave 25. */
function arrivalHostSize(state: GameState): number {
  const incoming = contestedDefencePower(state) * ARRIVAL_HOST_SHARE;
  return Math.max(ARRIVAL_HOST_MIN, Math.round(incoming / INVADER_POWER_PER_SOLDIER));
}

export const HERO_ARRIVALS: Record<HeroArrivalId, HeroArrival> = {
  host: {
    id: 'host',
    apply: (state, hero) => {
      const seat = capital(state);
      if (!seat) return false;
      const soldiers = arrivalHostSize(state);
      state.armies.push({
        id: `arrival-${hero.id}`,
        kingdomId: PLAYER_KINGDOM_ID,
        name: t('ascent.arrival.hostName', { name: hero.name }),
        landId: seat.id,
        units: {
          spearmen: Math.round(soldiers * 0.6),
          archers: Math.round(soldiers * 0.28),
          heavyInfantry: Math.round(soldiers * 0.12),
        },
        generalHeroId: hero.id,
        morale: 88,
        supply: 90,
        rations: 110,
        provisions: 70,
        level: 1,
        experience: 0,
        experienceToNextLevel: 100,
        autoDefend: true,
      });
      hero.assignedTo = `arrival-${hero.id}`;
      if (hero.growth) commitHeroAssignment(state, hero, { kind: 'host', armyId: hero.assignedTo });
      return true;
    },
  },

  land: {
    id: 'land',
    apply: (state) => {
      const land = nearestFreeLand(state);
      if (!land) return false;
      land.ownerId = PLAYER_KINGDOM_ID;
      land.loyalty = Math.max(land.loyalty, 70);
      applyResourceDelta(state, { humans: Math.round(land.population * 0.2) });
      refreshAllLandOutputs(state);
      refreshPlayerVisibility(state);
      return true;
    },
  },

  vassal: {
    id: 'vassal',
    // The weakest crown still its own master. No gold and no fear floor — the champion's own
    // standing is what buys it — but the cap and the last-sovereign rule still hold, which is
    // why this is the one arrival that can honestly fail.
    apply: (state) => {
      const target = sovereignRivals(state)
        .sort((a, b) => getEmpirePower(state, a) - getEmpirePower(state, b))[0];
      return target ? grantVassalage(state, target, 'arrival') : false;
    },
  },

  truce: {
    id: 'truce',
    apply: (state) => {
      const angriest = state.kingdoms
        .filter((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated && !k.vassalage)
        .sort((a, b) => (b.warAppetite ?? 0) - (a.warAppetite ?? 0))[0];
      if (!angriest) return false;
      // Through the ledger. Written straight onto `relations` this was the single most
      // expensive thing in the game to lose silently: the next `recomputeOpinion` — a gift, an
      // ambassador year, a politics card — rebuilt the field from baseline + modifiers and threw
      // all forty-five points away, often inside the same game year the arrival granted them.
      addOpinionModifier(angriest, {
        id: 'arrival-truce',
        label: t('diplo.mod.truce'),
        value: 45,
        decay: 0.5,
        source: 'event',
      });
      angriest.warAppetite = Math.max(0, (angriest.warAppetite ?? 0) - 60);
      angriest.hostilityTimer = 0;
      const ascent = state.ascent;
      if (ascent) ascent.ticksToWave += ARRIVAL_TRUCE_SEASONS;
      return true;
    },
  },

  card: {
    id: 'card',
    // A power enters the realm's canon and a draft comes with it — the draft is what lets the
    // player *use* it rather than read about it.
    apply: (state, hero) => {
      const ascent = state.ascent;
      if (!ascent) return false;
      ascent.pendingLevelUps += 1;
      ascent.draftWeights.gold = (ascent.draftWeights.gold ?? 0) + 6;
      void hero;
      return true;
    },
  },

  treasury: {
    id: 'treasury',
    // Seasons of income, not a flat lump, so it lands the same weight early and late.
    apply: (state) => {
      const rates = state.resourceRates;
      applyResourceDelta(state, {
        gold: Math.max(320, Math.round(Math.max(0, rates.gold) * ARRIVAL_TREASURY_SEASONS)),
        food: Math.max(140, Math.round(Math.max(0, rates.food) * ARRIVAL_TREASURY_SEASONS)),
        supplies: Math.max(90, Math.round(Math.max(0, rates.supplies) * ARRIVAL_TREASURY_SEASONS)),
      });
      return true;
    },
  },

  walls: {
    id: 'walls',
    apply: (state) => {
      const seat = capital(state);
      if (!seat) return false;
      for (const land of state.lands) {
        if (land.ownerId !== PLAYER_KINGDOM_ID) continue;
        const share = land.id === seat.id ? 1 : 0.4;
        land.defense += Math.round(ARRIVAL_WALL_DEFENCE * share);
        land.localSoldiers += Math.round(40 * share);
      }
      refreshAllLandOutputs(state);
      return true;
    },
  },

  levy: {
    id: 'levy',
    apply: (state) => {
      const hosts = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy);
      if (hosts.length === 0) return false;
      for (const host of hosts) {
        for (const key of Object.keys(host.units) as Array<keyof typeof host.units>) {
          host.units[key] = Math.round((host.units[key] ?? 0) * 1.35);
        }
        host.morale = 100;
        host.supply = Math.max(host.supply, 90);
        host.elite = Math.min(2, (host.elite ?? 0) + 1);
      }
      return true;
    },
  },
};

export function findArrival(id: string | undefined): HeroArrival | undefined {
  return id ? HERO_ARRIVALS[id as HeroArrivalId] : undefined;
}

/**
 * What the card promises, before you take it.
 *
 * Deliberately qualitative — no numbers — so retuning `ascentConfig` can never desync the card
 * from the effect. Same discipline as `ascent.founder.gift.*`.
 */
export function arrivalPreview(hero: Hero): string | undefined {
  if (!hero.arrival) return undefined;
  return t(`ascent.arrival.${hero.arrival}` as Parameters<typeof t>[0]);
}
