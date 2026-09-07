import { isEndlessMode, PLAYER_KINGDOM_ID } from '../../game/constants';
import { getLegTicks } from '../../game/movementConfig';
import {
  CAMPAIGN_TICKS_BASE,
  CAMPAIGN_TICKS_MAX,
  CAMPAIGN_TICKS_ON_SACK,
  CAMPAIGN_TICKS_ON_WIN,
  EARLY_WAVE_GRACE,
  GARRISON_LEVY_FLOOR,
  LEVY_POWER_PER_MAN,
  MAX_HOSTS_PER_KINGDOM,
  PASSING_REPORT_MEN,
  RELIEF_GOLD_REWARD,
  RELIEF_LOYALTY_REWARD,
  SIEGE_DEFENSE_PER_TICK,
  SIEGE_MAX_TICKS,
  SIEGE_MIN_TICKS,
  SIEGE_RENEW_SHARE,
  waveMatchFactor,
} from '../../game/ascentConfig';
import { findLand, getAcquisitionTicksRequired } from '../LandSystem';
import {
  armyPower,
  attackLand,
  combinedDefencePower,
  createBattlePreview,
  grantGeneralExperience,
  issueMoveOrder,
  masonryPowerPerDefense,
  militiaPowerPerMan,
  terrainDefenseMultiplier,
  garrisonPower,
} from '../WarSystem';
import {
  applyResourceDelta,
  getFocusGarrisonMult,
  refreshAllLandOutputs,
} from '../ResourceSystem';
import { getPlayerMilitary } from '../DiplomacySystem';
import { addMandate } from './MandateSystem';
import { enemyColumnsAt } from '../ascent/BattleSystem';
import { defenceCommanderOf } from '../ascent/landCommand';
import { recordEngagement } from '../ascent/battleReport';
import { chargeProvinceForDefence, hiddenDefenceLossShare } from '../ascent/RestoreSystem';
import { applyHostileMarchLoss, passingColumnLoss } from '../ascent/hostileMarch';
import { hasRoomForAnotherFront, liveBattles } from '../ascent/fronts';
import {
  openingVolleyShare,
  pursuitLossShare,
  soundTheBronzeDrum,
  tryReformBrokenHost,
} from '../ascent/DoctrineSystem';
import { pushToast } from './notifications';
import { grantDeed } from '../../state/cabinet';
import { noteRubbing } from '../ascent/Inheritance';
import type {
  Army, AscentBattleRecord, Difficulty, EraId, GameState, InvasionRecord, Kingdom, KingdomPersonality, Land,
  PendingBattle,
} from '../../state/types';
import { t } from '../../i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function totalUnits(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

export function difficultyArmyScale(difficulty: Difficulty | undefined): number {
  if (difficulty === 'easy') return 0.7;
  if (difficulty === 'hard') return 1.35;
  if (difficulty === 'ironman') return 1.7;
  return 1.0;
}

/**
 * Ceiling on a wave's total size as a multiple of the player's defensible military
 * (troops + garrison). This keeps a telegraphed host a beatable *wall* that tracks the
 * player's power instead of an unwinnable spike — a prepared realm can repel it, an
 * unprepared one loses ground rather than the whole realm to a 0-vs-thousands wipe.
 */
function defensibleCapRatio(difficulty: Difficulty | undefined): number {
  if (difficulty === 'easy') return 1.25;
  if (difficulty === 'hard') return 2.1;
  if (difficulty === 'ironman') return 2.6;
  return 1.7;
}

/**
 * What a host walking onto this realm actually has to beat.
 *
 * `getPlayerMilitary` — which is what sized a wave before — is every soldier plus **every** wall
 * in the realm, summed. A wave is then spent against one province. So the figure the clamp was
 * reasoning about and the figure the fight was decided by differed by the province count, and the
 * gap grew every time the player expanded. Measured: at sixteen provinces the clamp was sizing
 * against ~9,600 and the province that got attacked defended with ~330.
 *
 * The honest reading is what a single host meets: the realm's field hosts, because they can march
 * to the fight, plus the garrison of the *median* province, because that is the ground it will
 * have to stand on. Median rather than mean so one heavily-walled seat does not speak for a dozen
 * frontier villages — which is the exact error the old figure made.
 */
function defensibleStrength(state: GameState): number {
  const field = state.armies.reduce((sum, army) => (
    army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy ? sum + armyPower(state, army) : sum
  ), 0);
  const held = playerLands(state);
  // The seat is excluded whenever there is anything else, because it is not a typical province
  // and never was: `createCampaignLands` forces it to `defense >= 52` against a generated median
  // of 17, so a two-province realm's "median" was its own capital and it drew a wave sized
  // against the one province a host cannot take.
  const sample = held.length > 1 ? held.filter((land) => land.type !== 'castle') : held;
  const garrisons = (sample.length > 0 ? sample : held)
    .map((land) => (land.defense * masonryPowerPerDefense(state) + land.localSoldiers * militiaPowerPerMan(state))
      * terrainDefenseMultiplier(land))
    .sort((a, b) => a - b);
  const median = garrisons.length > 0 ? garrisons[Math.floor(garrisons.length / 2)] : 0;
  return field + median;
}

/**
 * What the calendar expects a realm to be able to field by now.
 *
 * The reference `defensibleStrength` is measured against, so that being *ahead* of it is what
 * draws a heavier wave — and being at or below it draws the ordinary one. Calibrated against
 * played runs: a realm at turn 16 measures ~720, at turn 32 ~1,170, at turn 56 ~2,090, against
 * this curve's 754 / 987 / 1,337. So an ordinarily-played realm sits at or a little under the
 * line early and pulls ahead of it as its provinces mature, which is exactly when the wave should
 * start answering back.
 *
 * Sizing the wave *directly* on the realm was tried here first and is the trap: when the target
 * is a multiple of what the player has, investment cancels out of the arithmetic entirely and a
 * province held for thirty seasons falls at the same rate as one claimed last week. Measured, it
 * put P(the median province falls) at 100% across every tenure at turn 40 and beyond.
 */
function expectedDefensibleStrength(turn: number): number {
  return 520 * (1 + Math.min(3.0, turn * 0.028));
}

/**
 * What a doctrine musters — its signature on the field, readable from the arms it brings.
 *
 * Every invader used to march at 60/28/12 whatever crown sent it, so an aggressive power and a
 * counting-house power were the same host with a different name: measured in `battle-lab`
 * (2026-09-04), the three doctrines produced 17%, 20% and 20% win rates under identical play.
 * The mix is the half of a doctrine the composition matchup can read (spears rout heavy, heavy
 * crush archers, archers shred spears — `compositionMatchup`); the other half is the shape it
 * opens in (`doctrineOpening`, BattleSystem). Each is *power-normalised* at the spawn, so the
 * doctrine changes what the host is made of and never how much of it there is.
 */
function doctrineHostMix(personality: KingdomPersonality | undefined): { spearmen: number; archers: number; heavy: number } {
  switch (personality) {
    // Comes on hard: a heavy core to break a line by weight.
    case 'aggressive': return { spearmen: 0.50, archers: 0.15, heavy: 0.35 };
    // Stands and shoots: bows behind a spear hedge, and little that charges.
    case 'defensive': return { spearmen: 0.45, archers: 0.42, heavy: 0.13 };
    // Spends other people's soldiers reluctantly: light, cheap, and mostly at range.
    case 'economic':
    case 'diplomatic': return { spearmen: 0.58, archers: 0.34, heavy: 0.08 };
    // Takes ground with numbers: the reference profile, spears forward.
    default: return { spearmen: 0.60, archers: 0.28, heavy: 0.12 };
  }
}

/** Battle power per soldier of a mix, before morale, supply and level — see `armyPower`. */
function mixPower(mix: { spearmen: number; archers: number; heavy: number }): number {
  return mix.spearmen * 1 + mix.archers * 1.25 + mix.heavy * 1.8;
}
/** The 60/28/12 profile `INVADER_POWER_PER_SOLDIER` was derived from. */
const REFERENCE_MIX_POWER = mixPower({ spearmen: 0.60, archers: 0.28, heavy: 0.12 });

function personalityWeight(kingdom: Kingdom): number {
  if (kingdom.personality === 'aggressive') return 1.15;
  if (kingdom.personality === 'expansionist') return 1.08;
  if (kingdom.personality === 'economic') return 0.85;
  return 0.95;
}

function playerLands(state: GameState): Land[] {
  return state.lands.filter((l) => l.ownerId === PLAYER_KINGDOM_ID);
}

function playerCapital(state: GameState): Land | undefined {
  return state.lands.find((l) => l.ownerId === PLAYER_KINGDOM_ID && l.type === 'castle');
}

function nearestLand(from: Land, candidates: Land[]): Land | undefined {
  let best: Land | undefined;
  let bestDist = Infinity;
  for (const land of candidates) {
    const d = (land.x - from.x) ** 2 + (land.y - from.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = land;
    }
  }
  return best;
}

/** First land to move to along the shortest path from `fromId` to `toId`, across any owner. */
function findInvasionStep(state: GameState, fromId: string, toId: string): string | undefined {
  if (fromId === toId) {
    return undefined;
  }
  const cameFrom = new Map<string, string>();
  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const land = findLand(state, current);
    if (!land) {
      continue;
    }
    for (const neighborId of land.neighbors) {
      if (visited.has(neighborId)) {
        continue;
      }
      visited.add(neighborId);
      cameFrom.set(neighborId, current);
      if (neighborId === toId) {
        let step = neighborId;
        while (cameFrom.get(step) !== fromId) {
          step = cameFrom.get(step) as string;
        }
        return step;
      }
      queue.push(neighborId);
    }
  }
  return undefined;
}

/**
 * Every land walkable from `fromId`, by the same edges `findInvasionStep` walks.
 *
 * The map is not always one piece. `generateMap` can leave a district group with no land bridge
 * to the rest — an island, or a range the roads never crossed — and an invader dropped in one of
 * those can never reach the player. Anything that *sends* a host somewhere has to ask this first.
 */
function reachableFrom(state: GameState, fromId: string): Set<string> {
  const seen = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  while (queue.length > 0) {
    const land = findLand(state, queue.shift() as string);
    if (!land) continue;
    for (const neighborId of land.neighbors) {
      if (seen.has(neighborId)) continue;
      seen.add(neighborId);
      queue.push(neighborId);
    }
  }
  return seen;
}

function applyInvaderLosses(army: Army, rate: number): void {
  army.units.spearmen = Math.max(0, Math.floor(army.units.spearmen * (1 - rate)));
  army.units.archers = Math.max(0, Math.floor(army.units.archers * (1 - rate)));
  army.units.heavyInfantry = Math.max(0, Math.floor(army.units.heavyInfantry * (1 - rate)));
}

function despawnInvasion(state: GameState, record: InvasionRecord): void {
  state.armies = state.armies.filter((a) => a.id !== record.armyId);
  state.siegeOrders = state.siegeOrders.filter((o) => o.armyId !== record.armyId);
  state.invasions = (state.invasions ?? []).filter((r) => r !== record);
}

/** Spoils for destroying an invading host: Mandate, loot gold, and freed prisoners. */
function grantRepelSpoils(state: GameState, hostSize: number, record: InvasionRecord): void {
  state.invasionsRepelled = (state.invasionsRepelled ?? 0) + 1;
  const great = record.great === true;
  const mandate = Math.max(5, Math.round(hostSize / 32)) * (great ? 3 : 1);
  addMandate(state, mandate);
  const lootGold = Math.round(hostSize / 12) * (great ? 2 : 1);
  const prisoners = Math.round(hostSize / 8);
  applyResourceDelta(state, { gold: lootGold, humans: prisoners });
  pushToast(state, t('empire.spoils', { gold: lootGold, prisoners, mandate }), 'reward');
}

function recordArmyDefeated(state: GameState, total: number): void {
  if (!state.campaignScore) {
    return;
  }
  state.campaignScore.armiesDefeated += 1;
  state.campaignScore.largestArmyDefeated = Math.max(state.campaignScore.largestArmyDefeated, total);
}

// ─────────────────────────────────────────────────────────────────────────────
// Spawning an invasion
// ─────────────────────────────────────────────────────────────────────────────

/** Options for a directed/telegraphed spawn (used by the ThreatDirector). */
export interface InvasionSpawnOptions {
  /** Force a specific number of hosts (a boss coalition), overriding the relations roll. */
  forceCoalition?: number;
  /** Multiplier on each host's size, for named Great Invasions. */
  sizeMult?: number;
  /** Names the hosts after a warlord (Great Invasion flavour). */
  warlordName?: string;
  /** Force conquest intent (a Great Invasion always marches on the capital). */
  forceConquest?: boolean;
  /** Force raid intent: pillage a border district and withdraw, never march on the capital. */
  forceRaid?: boolean;
  /**
   * Exact soldier budget to split across the hosts, bypassing the random roll *and* the
   * defensible-total clamp.
   *
   * The clamp sizes a wave against `getPlayerMilitary` — a raw headcount that knows nothing
   * about army level, elite tier, generals or the court's `armyPowerMult`. That is right for
   * empire mode, where none of those stack far. Dragon Ascent multiplies all four through its
   * Power Draft, so a clamped wave there is sized against a number several times smaller than
   * what will actually defend, and every card the player takes widens the gap. When the caller
   * has computed the budget from real defensive power, it must be honoured verbatim.
   */
  totalSoldiers?: number;
  /**
   * Where the hosts muster. `edge` is the far frontier and a long approach march — the window
   * the realm uses to raise and move a host, which is why it is the default and why shortening
   * it needs the wave budget softened in the same change. `inland` musters them a third of the
   * way in: they are simply *there*, which is what makes a landing feel like a landing.
   */
  staging?: 'edge' | 'inland';
  /** Plan stamped on every host of this wave, instead of the one `assignPlans` would infer. */
  plan?: InvasionRecord['plan'];
  /** Province every host of this wave marches at, when the wave's shape names one. */
  aimLandId?: string;
}

/** Replaces the on-map `launchDynastyAttack` for empire mode: spawns one or more off-map hosts at the frontier. */
export function launchOffMapInvasion(state: GameState, kingdomId: string | undefined, opts: InvasionSpawnOptions = {}): void {
  // Belt and braces over the aggressor filters: a crown sworn to the player never lands a
  // host on them, whatever future caller asks for it.
  if (state.kingdoms.find((k) => k.id === kingdomId)?.vassalage) return;
  if (!isEndlessMode(state.gameMode) || !kingdomId) {
    return;
  }
  const kingdom = state.kingdoms.find((k) => k.id === kingdomId && !k.isDefeated && k.id !== PLAYER_KINGDOM_ID);
  if (!kingdom) {
    return;
  }

  const capital = playerCapital(state) ?? playerLands(state)[0];
  if (!capital) {
    return;
  }

  // Frontier staging grounds: neutral districts far from the capital — and on the player's side
  // of any water.
  //
  // Sorting by distance descending and taking the far edge put every host on whichever neutral
  // district was geometrically furthest away, which on a map whose district graph comes in more
  // than one piece is exactly the island the player cannot be reached from. Measured on seed 99:
  // all five hosts staged on `district-18`, whose component held 20 of 42 districts and **none**
  // of the player's, so they stood still for 380 seasons, filled `MAX_LIVE_INVADER_HOSTS`, and
  // the wave director stopped sending anything at all. The run played 31 waves and the battle
  // screen opened zero times — "I played six rounds and there was no fight."
  //
  // The far edge is still the muster (see the note below on why the approach march matters); it
  // is now the far edge of the ground that connects to the realm.
  const reach = reachableFrom(state, capital.id);
  // A crown musters on its own ground as readily as on nobody's. Ascent's rivals hold territory
  // now (`tickRivalExpansion`), and staging only from neutral districts would mean a world the
  // rivals had largely settled could not send a wave at all — the map would fill up and the war
  // would quietly stop.
  const allNeutral = state.lands.filter((l) => l.ownerId === 'neutral' || l.ownerId === kingdomId);
  const connected = allNeutral.filter((l) => reach.has(l.id));
  const neutralEdges = (connected.length > 0 ? connected : allNeutral)
    .sort((a, b) => ((b.x - capital.x) ** 2 + (b.y - capital.y) ** 2) - ((a.x - capital.x) ** 2 + (a.y - capital.y) ** 2));
  if (neutralEdges.length === 0) {
    return;
  }

  // Staging stays at the far edge, deliberately.
  //
  // Hosts walk one district per tick across a forty-two district map, so the far-edge muster is a
  // large part of why contact is rare — and staging them nearer was tried here. Measured across
  // three pinned-RNG seeds it collapsed two of the three runs to a single province: the approach
  // march is not padding, it is the window the realm uses to raise and move a host. Shortening it
  // needs the wave *budget* softened in the same change, which is a balance pass of its own.
  // `neutralEdges` is sorted far-to-near, so the far edge is the head of it. An inland landing
  // takes from a third of the way down that same list: still ground the crown can muster on and
  // still connected to the realm, but one or two marches out rather than a walk across the map.
  const staging = opts.staging === 'inland' && neutralEdges.length > 2
    ? neutralEdges.slice(Math.floor(neutralEdges.length * 0.62))
    : neutralEdges;

  const relations = kingdom.relations ?? 50;
  const conquestChance =
    0.4 + (relations < 35 ? 0.3 : relations < 50 ? 0.1 : 0) + (personalityWeight(kingdom) > 1 ? 0.18 : 0);
  const intent: InvasionRecord['intent'] = opts.forceRaid
    ? 'raid'
    : opts.forceConquest || Math.random() < conquestChance ? 'conquest' : 'raid';

  // Conquest with very cold relations can field a coalition of 2-3 hosts.
  let armyCount = 1;
  if (opts.forceCoalition) {
    armyCount = opts.forceCoalition;
  } else if (intent === 'conquest') {
    if (relations < 25 && Math.random() < 0.4) armyCount = 3;
    else if (relations < 40 && Math.random() < 0.5) armyCount = 2;
  }

  // **One court, three hosts.** What a crown can spend on you has a limit.
  //
  // The roll above was already relations-driven; this makes it a rule rather than a coincidence,
  // and the rule is what gives a four-host wave its meaning. Over three hosts on the map is now
  // *necessarily* more than one kingdom having decided the same thing in the same season — so a
  // coalition reads as a coalition instead of as a slightly larger ordinary wave.
  //
  // Ascent only: empire mode's pressure is budgeted per wave rather than per crown, and capping
  // its hosts silences invasions the mode counts on.
  if (state.gameMode === 'ascent') {
    const committed = (state.invasions ?? []).filter((record) => record.kingdomId === kingdomId).length;
    armyCount = Math.min(armyCount, Math.max(0, MAX_HOSTS_PER_KINGDOM - committed));
    /**
     * One host per march while the opening grace runs, whoever is asking.
     *
     * `EARLY_WAVE_GRACE` bounds how *often* a host arrives — the wave director's schedule, the
     * enemy director's marches and the raid path all wait for a clear map. It did not bound the
     * *shape*: `armyCount` is rolled off relations a few lines above, so any caller that does not
     * pass `forceCoalition` sends up to three at once on cold relations, and the callers that do
     * pass one can have it inflated by a coalition or the relations dial. Gating each of the six
     * spawners separately is how the first three leaks were missed.
     *
     * It surfaced when conquered ground began sticking (`CONQUEST_GARRISON_SHARE`): a realm that
     * keeps its provinces reaches `RAID_MIN_LANDS` in the first waves, and `verify-ascent-opening`
     * caught seed 12161 at four hosts from two crowns in wave 2 — defeated by wave 5 — and seed
     * 27999 at three hosts from a single crown. `waveHostCount` is 1 for waves 1 and 2 anyway, so
     * this takes nothing the schedule was entitled to.
     */
    if ((state.ascent?.wave ?? 0) <= EARLY_WAVE_GRACE) armyCount = 1;
  }

  const scale = difficultyArmyScale(state.campaignConfig?.difficulty) * personalityWeight(kingdom) * (opts.sizeMult ?? 1);
  const growth = 1 + Math.min(1.4, state.turn * 0.02); // later invasions hit harder, but the ramp is bounded

  // Pre-roll each host's raw size, then clamp the *total* to a defensible multiple of the
  // player's military so even a 3-host coalition can't become an unwinnable wall of thousands.
  const rawSizes = Array.from({ length: armyCount }, () => Math.round((180 + Math.floor(Math.random() * 140)) * scale * growth));
  const rawTotal = rawSizes.reduce((sum, s) => sum + s, 0);

  // An explicit budget replaces both the roll and the clamp: the caller has already sized this
  // wave against something more honest than a headcount (see `totalSoldiers`).
  let clampFactor: number;
  if (opts.totalSoldiers !== undefined) {
    // **Difficulty has to be reapplied here, or it is cancelled.**
    //
    // `rawSizes` above are rolled with `scale`, which contains `difficultyArmyScale`. Dividing
    // a fixed budget by `rawTotal` therefore divides that same factor straight back out, exactly:
    //
    //     size = rawSizes[i] * (totalSoldiers / rawTotal)      // scale appears above and below
    //
    // Every wave, every raid and every forced march passes `totalSoldiers` — so on the shipped
    // build Easy (0.7) and Ironman (1.7) spawn **byte-identical hosts**. The difficulty a player
    // chose on the setup screen has never once changed the size of anything that attacked them,
    // which is the most direct form the "unfair" report could possibly take.
    //
    // Ascent only, deliberately. This spawner is shared with Throne of Empires, whose threat
    // curve and difficulty budget were tuned against the cancelled behaviour — correcting it
    // there is a separate change with its own measurement, and `verify-modes-regression` holds
    // empire byte-identical. The bug is the same in both; the fix is scoped to the mode that
    // reported it.
    const wanted = state.gameMode === 'ascent'
      ? opts.totalSoldiers * difficultyArmyScale(state.campaignConfig?.difficulty)
      : opts.totalSoldiers;
    clampFactor = rawTotal > 0 ? wanted / rawTotal : 1;
  } else {
    /**
     * Throne of Empires: the calendar sets the band, the realm sets the number inside it.
     *
     * `rawTotal` above is a pure function of the turn — `(180..320) x personality x difficulty x
     * (1 + min(1.4, turn * 0.02))` — and the clamp beneath it was `getPlayerMilitary * 1.7`,
     * which measured (over a 1-to-16-province sweep, 30 samples a cell) **never once bound**:
     * every wave from turn 16 to turn 56 came out at exactly the calendar's 523 to 841 men
     * whatever the realm looked like. So a wave answered nothing about the player at all. Against
     * a seat forced to `defense >= 52` that is a 0% chance of taking it, at every turn tested;
     * against the median province the map generated (defence 17), 87-100%. Both halves of the
     * report — "it does not care what I have built" and "it takes everything but the capital" —
     * are that one line.
     *
     * `defensibleStrength` is the honest target, and the calendar becomes a band around it so
     * neither end runs away: a realm cannot be hit harder than the year can field, and cannot
     * make itself safe by staying small.
     */
    // The calendar still sets the wave; the realm decides whether it is answered upward. Same
    // curve Dragon Ascent uses (`waveMatchFactor`): a lead of up to 15% is free — the reward for
    // playing well — and past that the excess is answered at slope 0.55, capped at 1.7, so a
    // realm that has invested faces a real war and never an unanswerable one. `difficultyArmyScale`
    // is already inside `rawTotal` and is deliberately not reapplied: nothing here divides by it.
    const match = waveMatchFactor(defensibleStrength(state), expectedDefensibleStrength(state.turn));
    const capFloor = 260 * armyCount * difficultyArmyScale(state.campaignConfig?.difficulty);
    const totalCap = Math.max(capFloor, getPlayerMilitary(state) * defensibleCapRatio(state.campaignConfig?.difficulty));
    const target = Math.min(totalCap, Math.max(capFloor, rawTotal * match));
    clampFactor = rawTotal > 0 ? target / rawTotal : 1;
  }

  state.invasions ??= [];
  for (let i = 0; i < armyCount; i += 1) {
    const stage = staging[i % staging.length];
    const mix = doctrineHostMix(kingdom.personality);
    // The budget is a *power* budget (`INVADER_POWER_PER_SOLDIER` is derived from the 60/28/12
    // profile), so a doctrine that brings heavier men brings fewer of them: the size is scaled by
    // the reference mix's power over this one's, and every doctrine lands the same battle power
    // for the same soldier budget. `verify-ascent`'s "waves track the realm" band is unmoved.
    const size = Math.max(100, Math.round(rawSizes[i] * clampFactor * REFERENCE_MIX_POWER / mixPower(mix)));
    const army: Army = {
      id: `invasion-${kingdomId}-${state.turn}-${i}`,
      kingdomId,
      name: opts.warlordName
        ? `${opts.warlordName}'s Host`
        : `${kingdom.name} ${intent === 'conquest' ? 'War Host' : 'Raiders'}`,
      landId: stage.id,
      units: {
        spearmen: Math.floor(size * mix.spearmen),
        archers: Math.floor(size * mix.archers),
        heavyInfantry: Math.floor(size * mix.heavy),
      },
      morale: 85,
      supply: 90,
      rations: 350,
      provisions: 250,
      level: 2,
      experience: 0,
      experienceToNextLevel: 160,
    };
    state.armies.push(army);
    state.invasions.push({
      armyId: army.id,
      kingdomId,
      intent,
      great: Boolean(opts.warlordName),
      mustered: size,
      // A wave with a shape has already decided what its hosts are for; without one they are
      // left blank and `assignPlans` reads the board for them, exactly as before.
      plan: opts.plan,
      targetLandId: opts.aimLandId,
    });
  }

  state.message = t('empire.invade.muster', { kingdom: kingdom.name, armies: armyCount });
  if (opts.warlordName) {
    pushToast(state, t('empire.invade.greatMuster', { warlord: opts.warlordName, kingdom: kingdom.name }), 'threat');
  } else {
    pushToast(state, t('empire.invade.muster', { kingdom: kingdom.name, armies: armyCount }), 'threat');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Marching + resolving invasions each tick
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-command: armies whose hero holds full command (`autoDefend`) march themselves to the
 * owned district nearest the closest incoming host, to meet it there — so the player can hand
 * frontier defence to a trusted general instead of micro-managing every march.
 */
export function tickAutoDefend(state: GameState): void {
  if (!isEndlessMode(state.gameMode) || !state.invasions || state.invasions.length === 0) return;
  const invaders = state.armies.filter((a) => a.kingdomId !== PLAYER_KINGDOM_ID && totalUnits(a) > 0 && state.invasions!.some((r) => r.armyId === a.id));
  if (invaders.length === 0) return;
  const owned = playerLands(state);
  if (owned.length === 0) return;

  for (const army of state.armies) {
    if (army.kingdomId !== PLAYER_KINGDOM_ID || !army.autoDefend || totalUnits(army) <= 0) continue;
    // A host mid-refit is off the board: it holds its ground until the work is done.
    if (army.refit) continue;
    // Busy marching or besieging — leave the current order be.
    if (state.movementOrders.some((o) => o.armyId === army.id)) continue;
    if (state.siegeOrders.some((o) => o.armyId === army.id)) continue;
    const here = findLand(state, army.landId);
    if (!here) continue;
    // Nearest incoming host, then the owned district closest to it (where it will strike).
    let nearestInv: Army | undefined; let invDist = Infinity;
    for (const inv of invaders) {
      const il = findLand(state, inv.landId);
      if (!il) continue;
      const d = (il.x - here.x) ** 2 + (il.y - here.y) ** 2;
      if (d < invDist) { invDist = d; nearestInv = inv; }
    }
    const invLand = nearestInv ? findLand(state, nearestInv.landId) : undefined;
    if (!invLand) continue;
    // A province with a host already sat down at its walls outranks "nearest to the invader":
    // it is the one with a deadline, and the siege clock exists so a march can beat it. Only for
    // a host that is otherwise idle — interrupting marches was measured and collapsed the runs.
    const besieged = owned.filter((land) => land.siege && land.siege.ticksLeft > 0);
    const threatened = besieged.length > 0 ? nearestLand(here, besieged) : nearestLand(invLand, owned);
    if (threatened && threatened.id !== army.landId) {
      issueMoveOrder(state, army.id, threatened.id);
    }
  }
}

/**
 * A campaign lives on what it takes.
 *
 * Success buys a host more time in the field — and the ceiling is what stops that becoming
 * permanence. A host winning every fight it picks still has a horizon, which is what keeps
 * "hold out" a strategy the player can actually plan rather than a hope they cannot price.
 */
export function extendCampaign(record: InvasionRecord, ticks: number): void {
  record.campaignTicks = Math.min(
    CAMPAIGN_TICKS_MAX,
    (record.campaignTicks ?? CAMPAIGN_TICKS_BASE) + ticks,
  );
}

export function tickInvasions(state: GameState): void {
  if (!isEndlessMode(state.gameMode) || !state.invasions || state.invasions.length === 0) {
    return;
  }

  for (const record of [...state.invasions]) {
    const army = state.armies.find((a) => a.id === record.armyId);
    if (!army || totalUnits(army) <= 0) {
      // Already wiped out by the player elsewhere.
      if (army) {
        despawnInvasion(state, record);
      } else {
        state.invasions = (state.invasions ?? []).filter((r) => r !== record);
      }
      continue;
    }

    /**
     * A host that has been beaten does not charge the same gate again in the morning.
     *
     * Two rules, and both exist because of the same measurement. Before the player was asked to
     * decide a garrison defence, a repulsed conquest host simply re-contacted the province it had
     * just lost in front of, every single tick, until it was annihilated — six assaults on one
     * province at 796, 387, 178, 74, 25 and 14 battle power. Silent, so nobody saw it. The moment
     * those became prompts (`empireAsks`) it turned into six pauses for one decided fight, which
     * is worse than the problem it was fixing.
     *
     * So: a thrown-back host regroups for two seasons, and one reduced to a quarter of what it
     * mustered with turns for home the way a bloodied raider already does. Both read as what an
     * army would actually do, and together they leave one prompt per real assault.
     */
    // Empire only, deliberately. Dragon Ascent's pressure was tuned against hosts that grind
    // until they break, and it already has an enemy director that withdraws them on its own
    // judgement; changing that here would be a balance pass on a mode nobody reported.
    if (state.gameMode === 'empire' && !record.pillaged && record.mustered && totalUnits(army) < record.mustered * 0.25) {
      record.plan = 'withdrawing';
      record.pillaged = true;
      record.exitLandId = farthestNeutralFromCapital(state)?.id;
      const siege = state.siegeOrders.find((order) => order.armyId === army.id);
      if (siege) {
        state.siegeOrders = state.siegeOrders.filter((order) => order !== siege);
        army.landId = siege.fromLandId;
      }
      // A host ground down to a quarter of its muster has been beaten, and beating one is how
      // this mode pays for defence — Mandate, loot and freed prisoners. Without this the rule
      // above silently deleted the reward: hosts that used to be annihilated (and paid out) now
      // turn for home first, and a measured five-run sweep repelled **zero** in seventy-two
      // seasons where the old build repelled five. Scaled to what the defence actually took off
      // it, exactly as the broken-in-the-field path already does.
      recordArmyDefeated(state, record.mustered);
      grantRepelSpoils(state, Math.max(40, record.mustered - totalUnits(army)), record);
      pushToast(state, t('empire.invade.spent', { kingdom: kingdomName(state, record.kingdomId) }), 'reward');
      continue;
    }
    if (state.gameMode === 'empire' && record.regroupUntil !== undefined && state.turn < record.regroupUntil) {
      continue;
    }

    // **The campaign season.** A court can only keep a host in the field for so long.
    //
    // Nothing anywhere used to read an invader's supply: `progressArmyLogistics` opens with
    // `if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;`, so the `rations` and `provisions`
    // written onto every spawned host were decorative. Invaders ate nothing, took no attrition,
    // and were never disbanded for arrears — a conquest host strong enough to win besieged, took
    // a province, and marched on for ever at zero upkeep. That is the mechanical form of "the
    // enemy never leaves", and it is what makes losing ground feel unrecoverable rather than bad.
    //
    // Counted here, before the siege check, so a host parked under a wall is spending its season
    // like any other. Refilled by success in `resolveInvaderBattle` and `progressSiegeOrders` —
    // a campaign lives on what it takes, so a war that is going well sustains itself and one that
    // stalls at the walls starves. "Hold four more seasons" becomes a real objective.
    //
    // **Throne of Empires needs this at least as much and never had it.** Nothing there removed a
    // host except beating it: invaders draw no upkeep (`progressArmyLogistics` skips them on its
    // first line), there was no host cap, and this clock was gated to Ascent — so every wave the
    // threat director paid for simply added to the last one. Measured across four played 64-turn
    // runs: one host on the map at turn 20, three at turn 32, and **nine** by turn 56, carrying
    // more soldiers between them than a single wave's own ceiling allows. Pressure that only
    // accumulates is not a wave the player can weather; it is a tide, and the difference is the
    // whole of whether losing ground is recoverable.
    if (isEndlessMode(state.gameMode) && !record.pillaged) {
      record.campaignTicks = (record.campaignTicks ?? CAMPAIGN_TICKS_BASE) - 1;
      if (record.campaignTicks <= 0) {
        record.plan = 'withdrawing';
        record.pillaged = true; // the existing withdraw-and-despawn path
        record.exitLandId = farthestNeutralFromCapital(state)?.id;
        // Lifting the siege with it, or a host called home keeps taking the province it left.
        const siege = state.siegeOrders.find((order) => order.armyId === army.id);
        if (siege) {
          state.siegeOrders = state.siegeOrders.filter((order) => order !== siege);
          army.landId = siege.fromLandId;
        }
        pushToast(state, t('ascent.invade.supplyOut', { kingdom: kingdomName(state, record.kingdomId) }), 'reward');
        continue;
      }
    }

    // A host mid-siege stays put until progressSiegeOrders resolves it.
    if (state.siegeOrders.some((o) => o.armyId === army.id)) {
      continue;
    }

    // A host already in the line of a watched engagement is fought there, on the battle's own
    // beats. Contacting it again here would resolve the same fight a second time underneath the
    // one being watched — and with more than one field live, "the" engagement is not one battle
    // any more, so every live line is checked.
    if (liveBattles(state).some((live) => (live.theirArmyIds ?? []).includes(army.id))) {
      continue;
    }

    // A raider that has done its damage marches back to the frontier and vanishes.
    if (record.pillaged) {
      const exitId = record.exitLandId;
      if (!exitId || army.landId === exitId) {
        state.message = t('empire.invade.withdraw', { kingdom: kingdomName(state, record.kingdomId) });
        despawnInvasion(state, record);
        continue;
      }
      const step = findInvasionStep(state, army.landId, exitId);
      if (step) {
        advanceInvader(state, army, record, step);
      } else {
        despawnInvasion(state, record);
      }
      continue;
    }

    const target = chooseTarget(state, army, record);
    if (!target) {
      // Nothing left to attack (player eliminated) — let defeat checks handle it.
      continue;
    }

    const here = findLand(state, army.landId);
    const adjacentToTarget = here?.neighbors.includes(target.id) ?? false;

    if (target.ownerId === PLAYER_KINGDOM_ID && adjacentToTarget) {
      clearInvaderMarch(state, army.id);
      // Walls already carried by a column ahead of this one: join the siege, do not fight for
      // ground that is already being taken.
      if (joinsStandingSiege(state, army, target)) continue;
      // The walls first. Until the clock runs out this host is at the gates and not through them.
      if (holdAtTheWalls(state, army, record, target)) continue;
      if (maybeRequestBattleDecision(state, army, record, target)) continue;
      resolveInvaderBattle(state, army, record, target);
      continue;
    }

    // March one land closer.
    let step = findInvasionStep(state, army.landId, target.id);
    if (!step) {
      // No road to the province it was told to take. This used to `continue`, and a host with no
      // road simply stood where it was for the rest of the run — drawing no upkeep, fighting
      // nobody, and holding one of the `MAX_LIVE_INVADER_HOSTS` slots the wave director counts
      // before it sends the next wave. Five of them deadlocked a whole run.
      //
      // So: take any province of theirs this host can actually walk to, and if there is none —
      // the realm is across water from where this host stands — go home and free the slot for a
      // wave that can land.
      const reach = reachableFrom(state, army.landId);
      const alternative = nearestLand(
        findLand(state, army.landId) ?? target,
        playerLands(state).filter((land) => reach.has(land.id)),
      );
      if (!alternative) {
        state.message = t('empire.invade.withdraw', { kingdom: kingdomName(state, record.kingdomId) });
        despawnInvasion(state, record);
        continue;
      }
      record.targetLandId = alternative.id;
      step = findInvasionStep(state, army.landId, alternative.id);
      if (!step) {
        despawnInvasion(state, record);
        continue;
      }
    }
    const stepLand = findLand(state, step);
    if (stepLand?.ownerId === PLAYER_KINGDOM_ID) {
      clearInvaderMarch(state, army.id);
      if (joinsStandingSiege(state, army, stepLand)) continue;
      if (holdAtTheWalls(state, army, record, stepLand)) continue;
      if (maybeRequestBattleDecision(state, army, record, stepLand)) continue;
      resolveInvaderBattle(state, army, record, stepLand);
    } else {
      advanceInvader(state, army, record, step);
    }
  }
}

/**
 * A column reaching walls that a column ahead of it has already carried joins the siege.
 *
 * The winner of a lost defence lays a siege order and sits (`state.siegeOrders` — the loop above
 * `continue`s for it). Every *other* column sent at the same province kept making contact: the
 * province was still nominally ours until the clock ran out, so each one raised a fresh field
 * against whatever the routed line had left, or rolled dice for ground already being taken.
 * Measured on seed 4242: a 1,394-man defence lost at tick 115, a new fight with the 253 survivors
 * against 3,734 at tick 116, lost again at 118, a third rout by dispatch at 120 — one province,
 * one wave, three "fights" after the walls had fallen. Reported as *"I lost, then other fights
 * happened at the same place"*.
 *
 * So a column that finds a hostile siege standing at the province walks onto the ground and waits
 * with it — no contact, no roll, no field. It counts as a besieger from then on (`tickSieges` reads
 * hosts on the province), and a relief host of ours arriving finds every column enrolled against
 * it (`enrolArrivals` takes every hostile host on the ground). Relief is the one thing that lifts
 * this: with a field host of ours standing there the contact is a fight, as it always was. No
 * second siege order is laid — `progressSiegeOrders` would flip the province twice and announce
 * its fall twice. Dragon Ascent only; the other modes have no siege clock of this kind.
 */
function joinsStandingSiege(state: GameState, army: Army, land: Land): boolean {
  if (state.gameMode !== 'ascent' || state.ascent?.arena) return false;
  const standing = state.siegeOrders.some(
    (order) => order.landId === land.id && order.attackerKingdomId !== PLAYER_KINGDOM_ID && order.armyId !== army.id,
  );
  if (!standing) return false;
  const relieved = state.armies.some(
    (other) => other.kingdomId === PLAYER_KINGDOM_ID && other.landId === land.id && !other.isLevy && totalUnits(other) > 0,
  );
  if (relieved) return false;
  army.landId = land.id;
  return true;
}

/**
 * Seasons the walls of `land` hold a host at bay before it storms them.
 *
 * `ceil(defense / SIEGE_DEFENSE_PER_TICK)`, clamped to [`SIEGE_MIN_TICKS`, `SIEGE_MAX_TICKS`]: a
 * capital around 48 defence buys four seasons — a real window to muster and march — and a frontier
 * village buys the floor of two. The floor is the load-bearing end of that range; see
 * `SIEGE_MIN_TICKS`.
 */
export function siegeTicksFor(land: Land): number {
  return Math.max(
    SIEGE_MIN_TICKS,
    Math.min(SIEGE_MAX_TICKS, Math.ceil(Math.max(0, land.defense) / SIEGE_DEFENSE_PER_TICK)),
  );
}

/**
 * An arrival at the walls opens a clock instead of resolving on the spot (Dragon Ascent).
 *
 * Returns true when this host must wait rather than assault this tick — the caller then leaves it
 * standing where it is, exactly as it does for a host already mid-siege.
 *
 * **The defect it was written for.** An invader that reached a player province resolved the fight
 * in the same tick it arrived, so the mode's own advice — *march a host to the province under
 * attack* — named an order that could never arrive in time. The relief march existed in the UI
 * (`summonAdjacentRelief`, the war board's relief row) and could not exist in the simulation.
 *
 * One clock per province, not per host: a second column arriving waits out the first's clock
 * rather than opening its own, or a wave of three would assault on three separate seasons and the
 * window would mean nothing.
 */
function holdAtTheWalls(state: GameState, army: Army, record: InvasionRecord, land: Land): boolean {
  if (state.gameMode !== 'ascent' || land.ownerId !== PLAYER_KINGDOM_ID) return false;
  // The arena is one matchup and nothing else; a siege clock there is four seasons of an empty
  // screen. Raids are a smash-and-run by definition and keep their old immediacy.
  if (state.ascent?.arena || record.intent === 'raid') return false;

  if (!land.siege) {
    const ticks = siegeTicksFor(land);
    land.siege = {
      attackerId: army.id,
      kingdomId: record.kingdomId,
      kingdomName: kingdomName(state, record.kingdomId),
      ticksLeft: ticks,
      ticks,
      openedTurn: state.turn,
      /**
       * Who was already standing here when the walls were invested.
       *
       * The relief reward is for a march that *arrived*, and without this list a host that simply
       * never left was paid for being where it already was — every renewal of the clock, for as
       * long as the siege ran. See `tickSieges`.
       */
      presentAtOpen: state.armies
        .filter((other) => other.kingdomId === PLAYER_KINGDOM_ID
          && other.landId === land.id && !other.isLevy)
        .map((other) => other.id),
    };
    pushToast(
      state,
      t('ascent.siege.opened', { land: land.name, kingdom: kingdomName(state, record.kingdomId), ticks }),
      'threat',
    );
  }
  return land.siege.ticksLeft > 0;
}

/**
 * Runs every wall clock down a season, pays for relief that arrived, and clears the ones the war
 * has moved past. Called from `advanceAscentTick` immediately before `tickInvasions`, so a clock
 * that reaches zero is stormed on the same tick the player last had to act on it.
 *
 * The relief reward is deliberately paid *here* rather than at the assault: the thing being
 * rewarded is the march arriving in time, and a relief that arrives and then loses the fight it
 * turned up for still did the thing the mode is asking for.
 */
export function tickSieges(state: GameState): void {
  if (state.gameMode !== 'ascent') return;
  for (const land of state.lands) {
    const siege = land.siege;
    if (!siege) continue;

    /**
     * Is anybody still actually besieging this place?
     *
     * **Not "is there an enemy nearby".** The first cut asked whether any hostile host stood on the
     * province or on any neighbour of it, and a province has five or six neighbours — so a column
     * marching past on its way somewhere else kept a clock alive on ground its besieger had walked
     * away from, and the province sat "under siege" with nobody at its walls.
     *
     * The honest test is the host this clock was opened by, or another invader that has actually
     * been sent at *this* province. A passer-by with orders for somewhere else is not a siege.
     */
    const besieger = (army: Army): boolean => {
      if (army.kingdomId === PLAYER_KINGDOM_ID || army.isLevy || totalUnits(army) <= 0) return false;
      if (army.landId !== land.id && !land.neighbors.includes(army.landId)) return false;
      if (army.id === siege.attackerId) return true;
      const order = (state.invasions ?? []).find((entry) => entry.armyId === army.id);
      return Boolean(order) && order?.targetLandId === land.id;
    };
    const stillPressed = land.ownerId === PLAYER_KINGDOM_ID && state.armies.some(besieger);
    if (!stillPressed) {
      // Lifted with a host of ours standing on it: the march got there and the besieger left.
      if (siege.relieved && land.ownerId === PLAYER_KINGDOM_ID) {
        pushToast(state, t('ascent.siege.lifted', { land: land.name }), 'reward');
      }
      land.siege = undefined;
      continue;
    }

    /**
     * A field host of ours has *arrived* since the walls were invested.
     *
     * Two guards, and both are load-bearing. `relieved` is never cleared — not by a renewal after
     * a repelled assault — so the reward is once per siege, not once per assault cycle. And the
     * host has to be one that was not already standing here when the clock opened, or a garrison
     * that never moved collected +40 gold and +8 loyalty every time the besiegers were thrown
     * back and dug in again. Both together are the difference between paying for a relief march
     * and paying for a province having a host parked on it.
     */
    const arrived = state.armies.some((army) => (
      army.kingdomId === PLAYER_KINGDOM_ID
      && army.landId === land.id
      && !army.isLevy
      && totalUnits(army) > 0
      && !(siege.presentAtOpen ?? []).includes(army.id)
    ));
    if (!siege.relieved && arrived) {
      siege.relieved = true;
      land.loyalty = Math.min(100, land.loyalty + RELIEF_LOYALTY_REWARD);
      applyResourceDelta(state, { gold: RELIEF_GOLD_REWARD });
      pushToast(state, t('ascent.siege.relieved', { land: land.name, gold: RELIEF_GOLD_REWARD }), 'reward');
      // The cabinet's deed: the first relief march the account ever completes pays a rubbing.
      if (grantDeed('first-relief')) {
        noteRubbing(state);
        pushToast(state, t('ascent.cabinet.deedRelief'), 'milestone');
      }
    }

    if (siege.ticksLeft > 0) siege.ticksLeft -= 1;
  }
}

/**
 * Moves an invader one province along, as a march the player can watch.
 *
 * Empire keeps the original bare assignment. In Dragon Ascent the host is given a real
 * `MovementOrder` instead, because `ArmyRenderer` gates the entire march presentation on one
 * existing — the road curve, the leg tween timed by terrain, the dust, the marching column and the
 * destination arrow are all inside `if (order && order.path.length > 0)`. Without an order a host
 * hard-snaps between provinces, which is why invasions appeared rather than approached.
 *
 * The order is deliberately one leg long and re-issued each tick. Invader routing is decided a hop
 * at a time by `findInvasionStep` against a target that the enemy director may re-point at any
 * moment, so handing the movement system a long path would let a host keep walking a route its
 * command has already abandoned.
 */
function advanceInvader(state: GameState, army: Army, record: InvasionRecord, step: string): void {
  if (state.gameMode !== 'ascent') {
    army.landId = step;
    return;
  }

  const existing = state.movementOrders.find((order) => order.armyId === army.id);
  if (existing && existing.path[0] === step) {
    existing.progress += 1;
    if (existing.progress < existing.legRequired) return;
    // The leg is done: the host arrives, and the order is spent.
    army.landId = step;
    state.movementOrders = state.movementOrders.filter((order) => order !== existing);
    bleedPassingColumn(state, army, record);
    return;
  }

  const stepLand = findLand(state, step);
  const legRequired = stepLand ? getLegTicks(army, stepLand) : 1;
  state.movementOrders = state.movementOrders.filter((order) => order.armyId !== army.id);
  // A one-tick leg would mean the marker never renders mid-march, so the tween never plays.
  if (legRequired <= 1) {
    army.landId = step;
    bleedPassingColumn(state, army, record);
    return;
  }
  state.movementOrders.push({ armyId: army.id, path: [step], progress: 1, legRequired });
}

/**
 * The toll a column pays for the ground it walked past.
 *
 * Called on a *completed* leg, from both arrival branches above — the two-tick march and the
 * one-tick snap — because a host that crosses a watched gap in a single season has still crossed
 * it, and a rule that only bit on slow terrain would read as "mountains are safe".
 *
 * Nothing here touches a province the column steps *onto*: `tickInvasions` never walks a host onto
 * ours without fighting for it, so the only ground this can be is neutral, and the only provinces
 * that can act are the ones next to it. That is the whole idea — a host that ignores the frontier
 * and drives for the prize is shot at from both sides of the road the entire way in.
 *
 * The men are taken off the host, the turnout is charged to every province that watched, and the
 * player is told once the loss is worth a line. `record.passingLoss` carries the campaign ceiling.
 */
function bleedPassingColumn(state: GameState, army: Army, record: InvasionRecord): void {
  if (state.gameMode !== 'ascent') return;
  const land = findLand(state, army.landId);
  if (!land || land.ownerId === PLAYER_KINGDOM_ID) return;
  const before = totalUnits(army);
  if (before <= 0) return;
  const { share, watchers, spent } = passingColumnLoss(
    state, land, armyPower(state, army), record.passingLoss ?? 0,
    {
      personality: state.kingdoms.find((k) => k.id === record.kingdomId)?.personality,
      plan: record.plan,
    },
  );
  if (share <= 0 || watchers.length === 0) return;

  const lost = applyHostileMarchLoss(army, share, 0, 1);
  if (lost <= 0) return;
  record.passingLoss = (record.passingLoss ?? 0) + share;
  for (const watcher of watchers) {
    watcher.garrisonExhaustion = Math.min(1, (watcher.garrisonExhaustion ?? 0) + spent);
  }
  if (lost >= PASSING_REPORT_MEN) {
    pushToast(state, t('ascent.march.harried', {
      land: watchers[0].name,
      kingdom: kingdomName(state, record.kingdomId),
      n: lost,
    }), 'reward');
  }
  // A column bled to nothing on the road never reaches anybody's walls.
  if (totalUnits(army) <= 0) despawnInvasion(state, record);
}

/** Drops a host's march order — it has arrived, or is about to fight instead of walking. */
function clearInvaderMarch(state: GameState, armyId: string): void {
  state.movementOrders = state.movementOrders.filter((order) => order.armyId !== armyId);
}

function chooseTarget(state: GameState, army: Army, record: InvasionRecord): Land | undefined {
  const here = findLand(state, army.landId);
  const owned = playerLands(state);
  if (owned.length === 0 || !here) {
    return undefined;
  }

  // In Ascent the enemy director assigns each host a province and a reason for wanting it — a
  // spearhead goes for the prize, a flanker for weakly-held ground, and each flanker takes a
  // different one so a coalition spreads. Honour that if the target is still the player's; if it
  // has already fallen or been retaken, fall through to the original reading.
  if (state.gameMode === 'ascent' && record.targetLandId) {
    const assigned = owned.find((land) => land.id === record.targetLandId);
    if (assigned) return assigned;
  }

  if (record.intent === 'conquest') {
    // The frontier absorbs the wave. A war host cannot march straight past the border at the
    // dynasty's seat; it has to reduce whatever it meets first.
    //
    // This was Bamboo Palisade's effect, gated behind a silver card that a run drew perhaps once.
    // It is the default rule of the map now, because it is what makes width into depth — and
    // width buying nothing was half the reason expanding was survival-neutral. Measured before
    // this: a realm peaked at 6.8 provinces and ended holding 3.1, because a conquest host walked
    // through all of them to the capital. The card now buys militia instead (see
    // `palisadeMilitiaBonus`), which is the same fantasy priced as an upgrade rather than a gate.
    // Ascent only, deliberately. Empire mode shares this spawner but not this design: its threat
    // curve, its province count and its whole difficulty budget were tuned against war hosts that
    // march at the seat, and `verify-modes-regression` holds that behaviour byte-identical.
    //
    // With one exception, and it is the last piece of the Year-4 report. The frontier rule assumes
    // the frontier is *somewhere else* — but a realm holding one or two provinces has no depth to
    // absorb anything, and `nearestLand` then picks the outlying district precisely because it is
    // the weakest, while the royal host sits under `defend` orders at the seat it is not attacking.
    // Measured on the reported run: ~1,450 men against a 556-man levy on a district with 420
    // defence, with the standing 460-man host a province away and never in the fight.
    //
    // Under three provinces the host marches at the seat, where the walls and the army already
    // are. The player gets the battle they built for; the moment there is a frontier worth the
    // name, the frontier rule takes over again.
    //
    // **Throne of Empires marches on the frontier now too.** The note above says its threat curve
    // and difficulty budget were tuned against war hosts that walk at the seat — and they were,
    // right up until this pass re-tuned all three. Keeping the seat rule after it was actively
    // harmful: `createCampaignLands` forces the capital to `defense >= 52` and the realm keeps a
    // field host there, so every conquest host in the mode converged on the one province it could
    // not take. Measured after the garrison and supply work, over four played 64-turn runs: 42
    // battles, nearly all of them at the capital, and **one province lost in total**. A war that
    // is always the same fight in the same place, and always won, is not a war.
    //
    // The frontier rule is what makes width into depth: a host reduces what it meets first, so a
    // province's own garrison — the thing this pass gave the mode — is what decides whether the
    // realm has depth or only a hard centre. Under three provinces there is no frontier to speak
    // of and the host goes for the seat, where the walls and the army already are.
    if (owned.length < 3) return playerCapital(state) ?? nearestLand(here, owned);
    return nearestLand(here, owned);
  }
  return nearestLand(here, owned);
}

/**
 * Turns a province's garrison out as a host, so a defence with no field army is still a battle.
 *
 * Ascent only, and only for the watchable path. `defenderPower` already counted the garrison when
 * resolving a fight, so the *outcome* was never wrong — but `beginBattle` needs an `Army` standing
 * on the tile, and the realm's hosts are usually somewhere else. The result was that the mode's
 * best screen never opened: the wave arrived, a number was compared against another number, and
 * the province changed hands with nothing to watch or steer.
 *
 * The levy is drawn from `localSoldiers` and dissolved by `dissolveGarrisonLevies` the moment the
 * engagement ends, so it never shows up as a standing host, never draws upkeep across seasons, and
 * cannot be marched. Survivors go home to the province they came from.
 */
export function raiseGarrisonLevy(state: GameState, land: Land): Army | undefined {
  if (state.gameMode !== 'ascent' || state.ascent?.autoResolveBattles) return undefined;
  // In the arena the two hosts are exactly what the player dialled in. A province turning out
  // several thousand militia on top of them would answer a different question entirely.
  if (state.ascent?.arena) return undefined;

  // Drawn from the walls as well as the militia, because militia alone is almost always nothing.
  //
  // `localSoldiers` is seeded on the capital and on essentially nowhere else — measured, the
  // *median* player province carries zero — so a levy mustered from it could never form on the
  // provinces that actually need one. `defense` is the term every province has, and it is what
  // `defenderPower` already values a garrison by (16 per point against 2.5 per militiaman).
  //
  // Sized in *battle power*, not in bodies. The turnout used to be `militia + defense × 6` men,
  // which reads as the same strength but is not: a levy man is worth ~0.58 power in the field
  // (`armyPower` at the levy's morale and supply), so the walls came out at a fifth of what the
  // odds roll gives them, and every province a wave reached fell in the field where the roll had
  // held it. Dividing the garrison's power by the levy's power-per-man keeps the watched fight
  // and the hidden roll worth the same; `levyDrawn` keeps the walls' share out of the militia.
  // A province set to raise soldiers turns out more of them; one set to defend turns out its walls.
  // Both multipliers are 1 for every other focus, and outside Ascent this whole function returns
  // early anyway.
  // The walls' share is what the province can still turn out, not what it could before the last
  // fight — see `garrisonExhaustion`. The militia term is the men who actually exist.
  // `garrisonPower` is the one formula: walls the people can man, less the turnout the last fight
  // spent, plus the militia that exists — the same figure the roll and the HUD read.
  const masonry = garrisonPower(state, land) * getFocusGarrisonMult(state, land);
  // And the same share cap the hidden roll applies. `combinedDefencePower` is what `defenderPower`
  // returns for this province, so subtracting the field hosts back out leaves exactly what the roll
  // credits the walls with — which is what the levy has to be worth, or the fought battle and the
  // roll are two different fights again. With no host on the ground it is the full masonry, as
  // before.
  const hosts = state.armies.reduce((sum, other) => (
    other.kingdomId === PLAYER_KINGDOM_ID && other.landId === land.id && !other.isLevy
      ? sum + armyPower(state, other)
      : sum
  ), 0);
  const wallsShare = Math.max(0, combinedDefencePower(state, masonry, hosts) - hosts);
  const drawn = Math.floor(wallsShare / LEVY_POWER_PER_MAN);
  // Below a company there is nothing to form a line with — but the province is still ours, and
  // whose ground it is turns out to be the honest test of what is worth watching. A thin
  // garrison turns out a token company rather than surrendering the fight to a hidden roll;
  // `levyDrawn` remembers what it really took, so the conjured share never becomes militia.
  const muster = Math.max(GARRISON_LEVY_FLOOR, drawn);

  const levy: Army = {
    id: `levy-${land.id}-${state.turn}`,
    kingdomId: PLAYER_KINGDOM_ID,
    name: t('battle.levyOf', { land: land.name }),
    landId: land.id,
    units: {
      spearmen: Math.round(muster * 0.6),
      archers: Math.round(muster * 0.25),
      heavyInfantry: Math.round(muster * 0.15),
    },
    // Townsmen behind their own walls. Steadier than the first version's 70: sized to the same
    // power as the walls (see above), a levy that opened fifteen heart below the invader broke
    // first in every even exchange, and lost in the field the fights the odds roll had it winning.
    morale: 80,
    supply: 80,
    rations: 999,
    provisions: 999,
    level: 1,
    experience: 0,
    experienceToNextLevel: 120,
    isLevy: true,
    levyDrawn: land.localSoldiers,
    levyMustered: muster,
  };
  land.localSoldiers = 0;
  state.armies.push(levy);
  return levy;
}

/**
 * The walls of a province the player is storming, turned out as a host so the assault has
 * something to fight (Dragon Ascent). Sized like the player's own levy — the garrison term of
 * `defenderPower` divided by a levy man's battle power — so the fought assault and the odds roll
 * agree on what those walls are worth. Nothing is drawn from the province's militia: the levy is
 * a picture of its defence, and is dropped by `dissolveGarrisonLevies` when the fight ends.
 */
export function raiseEnemyGarrisonLevy(state: GameState, land: Land): Army | undefined {
  if (state.gameMode !== 'ascent') return undefined;
  // Their walls need their people too — `garrisonPower` reads manning off the province's own
  // population, so a sacked enemy district is as thin to storm as ours would be to hold.
  const men = Math.max(
    GARRISON_LEVY_FLOOR,
    Math.floor(garrisonPower(state, land) / LEVY_POWER_PER_MAN),
  );
  const levy: Army = {
    id: `garrison-${land.id}-${state.turn}`,
    kingdomId: land.ownerId,
    name: t('ascent.battle.garrisonOf', { land: land.name }),
    landId: land.id,
    units: {
      spearmen: Math.round(men * 0.6),
      archers: Math.round(men * 0.25),
      heavyInfantry: Math.round(men * 0.15),
    },
    morale: 80,
    supply: 80,
    rations: 999,
    provisions: 999,
    level: 1,
    experience: 0,
    experienceToNextLevel: 120,
    isLevy: true,
    levyDrawn: 0,
  };
  state.armies.push(levy);
  return levy;
}

/**
 * Sends home what is left of every levy, and charges the province for the rest.
 *
 * This function used to be purely restorative, and that is the whole of the reported defect: *we win
 * but lost army — but now it immediately full number in next attack*. The turnout is
 * `defense * 16 + localSoldiers * 2.5` conjured into a host at the start of a fight and deleted at
 * the end, and **nothing in combat ever touched `land.defense`** — so the walls' share, which is
 * eighty-five to ninety-five per cent of a province's defence, was created out of nothing and
 * destroyed undamaged every single time. The militia share fared no better: `min(survivors,
 * levyDrawn)` restores it whole for as long as more men survive than the province originally lent,
 * which against a `levyDrawn` of tens is very nearly always.
 *
 * So the casualties are read as a *share* of what mustered, and both halves of the turnout pay it.
 * The militia takes it directly; the walls take `WALL_ATTRITION_SHARE` of it as a breach that
 * `repairProvincialDefence` rebuilds over the following seasons. A second wave landing on a mauled
 * province now meets a mauled province.
 */
export function dissolveGarrisonLevies(state: GameState): void {
  const levies = state.armies.filter((army) => army.isLevy);
  if (levies.length === 0) return;
  for (const levy of levies) {
    const land = findLand(state, levy.landId);
    // Only if the province is still ours — a levy that lost its home has nowhere to go back to,
    // and walls that changed hands are the new owner's problem.
    if (!land || land.ownerId !== PLAYER_KINGDOM_ID) continue;
    const survivors = totalUnits(levy);
    const mustered = Math.max(1, levy.levyMustered ?? survivors);
    const lostShare = Math.max(0, Math.min(1, 1 - survivors / mustered));

    // At most what the province gave, and only the share of it that walked back. The militia is
    // real men and dies like real men; it is not a number that resets.
    const drawn = Math.min(levy.levyDrawn ?? survivors, survivors);
    const militiaBack = Math.round(drawn * (1 - lostShare));
    land.localSoldiers += militiaBack;
    /**
     * The dead were people. The militia is drawn from `land.population` (`militiaCapacity`), and
     * the men who did not come back used to vanish from `localSoldiers` and from nowhere else, so
     * the watch regrew out of the very people who had died. Charged here, bounded so a district
     * can never be emptied by its own defence.
     */
    const militiaDead = Math.max(0, (levy.levyDrawn ?? 0) - militiaBack);
    // The people pay for the dead, the turnout is spent, the walls are breached and the district
    // burnt — the same door the hidden roll now goes through, so the two paths are one fight.
    // See `chargeProvinceForDefence`.
    chargeProvinceForDefence(state, land, lostShare, militiaDead);
  }
  state.armies = state.armies.filter((army) => !army.isLevy);
}

/**
 * Requests the player's tactical decision when an invader reaches a district defended by a
 * FIELD army (not just a garrison) — unless that army's hero holds full command (`autoDefend`),
 * in which case the general decides and the fight auto-resolves. Returns true when it deferred
 * the battle to the player (the caller must then skip auto-resolution this tick).
 */
function maybeRequestBattleDecision(state: GameState, army: Army, record: InvasionRecord, land: Land): boolean {
  // Two contacts in one tick: take the one with more enemy columns.
  //
  // The first contact the invader loop reached used to win by arriving first, which is arbitrary —
  // and it matters, because Spread and Focus are inert against a single column and the probe
  // measured a mean of 1.7 columns per watched fight. A choice of orders is only a choice when
  // there is something to choose between, so a later contact this tick that brings more columns
  // takes the screen instead. Either way the caller is told the battle was deferred, which is what
  // stops this army resolving as a hidden roll behind the player's back.
  if (state.pendingBattle) {
    if (state.gameMode !== 'ascent' || state.pendingBattle.role === 'offence') return true;
    const held = findLand(state, state.pendingBattle.landId);
    if (!held || enemyColumnsAt(state, land) <= enemyColumnsAt(state, held)) return true;
    state.pendingBattle = undefined;
  }
  // Up to `MAX_LIVE_BATTLES` fields, not one.
  //
  // This clause used to read `if (live && !live.over) return false` — one watched engagement at a
  // time — with the note that queuing had been tried and rejected because it froze the second
  // invader for the length of the first fight. Running the fields side by side freezes nobody:
  // the second contact opens its own battle under a general and `focusBattle` walks the player
  // between them. Past the cap a contact is still settled by the odds roll, and now reported.
  if (!hasRoomForAnotherFront(state, land.id)) return false;
  const defender = state.armies.find((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id && totalUnits(a) > 0);
  // `autoDefend` means two different things: 'march home to intercept' (tickAutoDefend) and
  // 'fight without asking' (here). Dragon Ascent needs the first and not the second, so it
  // asks regardless unless the player has handed battles back to their generals. Inert in
  // every other mode.
  const ascentWatches = state.gameMode === 'ascent' && !state.ascent?.autoResolveBattles;
  /**
   * Throne of Empires asks too, and did not.
   *
   * The clause below used to be `if (!defender && !ascentWatches) return false` for every mode, so
   * a province with no field host standing on it changed hands on a hidden dice roll. In empire
   * that is nearly every province: the realm has one or two hosts and a dozen provinces. Measured
   * across four played 64-turn runs, the game asked the player to decide **two** battles in total
   * while five to nine invading hosts walked the map and fifteen provinces changed hands. Losing
   * a realm province by province without ever being offered the fight is the reported complaint
   * in its purest form — not that the numbers were wrong, but that nothing was ever asked.
   *
   * There is a real decision to make even with no army there: the garrison can sally (better
   * odds, and `resolveInvaderBattle` now charges the militia for a failed one), hold the walls,
   * or open the gates and save the people. One prompt at a time is already enforced above.
   */
  const empireAsks = state.gameMode === 'empire' && land.ownerId === PLAYER_KINGDOM_ID;
  if (!defender && !ascentWatches && !empireAsks) return false;
  // A decision needs two plausible answers. A host that cannot carry the walls whatever the
  // garrison is ordered to do — the 1.22 sally does not close a gap this size — is settled by the
  // roll and reported in the header, rather than stopping the game to ask a question with one
  // answer. Measured before this: a spent host generated prompts at 0.02 and 0.01 of the
  // defender's power, which read as the game malfunctioning rather than as a war.
  if (!defender && empireAsks && !ascentWatches) {
    const look = createBattlePreview(state, army.id, land.id);
    if (!look || look.attackerPower < look.defenderPower * 0.55) return false;
  }
  if (defender?.autoDefend && !ascentWatches) return false;
  // The host standing here was told its general fights its own battles. Same question the sheet
  // asks, answered per host rather than per run.
  if (defender?.autoResolve) return false;
  const preview = createBattlePreview(state, army.id, land.id);
  if (!preview) return false;
  state.pendingBattle = {
    invaderArmyId: army.id,
    landId: land.id,
    landName: land.name,
    kingdomId: record.kingdomId,
    kingdomName: kingdomName(state, record.kingdomId),
    isGreat: Boolean(record.great),
    attackerPower: preview.attackerPower,
    defenderPower: preview.defenderPower,
    ...(defender ? {} : { garrisonOnly: true, militia: Math.round(land.localSoldiers) }),
  };
  state.isPaused = true;
  return true;
}

/** Resolves a battle the player was asked to decide. Attack = first-strike edge; retreat = save the host. */
export function resolvePendingBattle(state: GameState, decision: 'attack' | 'delegate' | 'retreat'): void {
  const pb = state.pendingBattle;
  state.pendingBattle = undefined;
  state.isPaused = false;
  if (!pb) return;
  // An assault of ours that will not be watched after all takes the roll it always took.
  if (pb.role === 'offence') {
    const attacker = pb.attackerArmyIds?.[0];
    if (attacker) attackLand(state, attacker, pb.landId);
    return;
  }
  resolveBattleRecord(state, pb, decision);
}

/**
 * Settles one invader's contact with a province.
 *
 * Split from `resolvePendingBattle` so a watched engagement, which owns its record itself, can
 * hand the outcome back without a `pendingBattle` on the state. `forced` states what the field
 * already decided — a side that broke has lost, and is not asked to roll again.
 */
export function resolveBattleRecord(
  state: GameState,
  pb: PendingBattle,
  decision: 'attack' | 'delegate' | 'retreat',
  forced?: 'defence' | 'invader',
  /** True when a watched fight has already filed its own record; suppresses the second one. */
  reported = false,
): void {
  const army = state.armies.find((a) => a.id === pb.invaderArmyId);
  const land = findLand(state, pb.landId);
  const record = state.invasions?.find((r) => r.armyId === pb.invaderArmyId);
  if (!army || !land || !record) return;
  if (decision === 'retreat') {
    // Pull the field army to safety; the district falls to whatever garrison remains.
    retreatDefenders(state, land);
    resolveInvaderBattle(state, army, record, land, 1, forced, reported);
    return;
  }
  // Attack: seize the initiative for a real defender edge. Delegate: a steady hero-led stand.
  resolveInvaderBattle(state, army, record, land, decision === 'attack' ? 1.22 : 1.06, forced, reported);
}

function resolveInvaderBattle(
  state: GameState,
  army: Army,
  record: InvasionRecord,
  land: Land,
  defenderBonus = 1,
  forced?: 'defence' | 'invader',
  reported = false,
): void {
  /**
   * **Every engagement is written down here.**
   *
   * This is the one function every settlement passes through, and until now the 97% of them the
   * battle screen never opened for reported themselves to `state.message` and `logEvent` — two
   * channels Dragon Ascent's HUD does not read. Measured on a seeded 400-tick run: 261 fights,
   * 7 of them visible. See `battleReport` for the whole account.
   *
   * The headcounts are snapshotted before anything is applied and read again at the end, so the
   * record is what the field actually cost rather than what the odds roll intended.
   */
  // **By id, not by tile.** `retreatDefenders` moves a beaten host to a neighbouring province, so
  // counting who stands here afterwards reports a host that withdrew in good order with 18% losses
  // as one annihilated to the last man. The walls are counted with them because in this mode they
  // are most of the defence most of the time — `raiseGarrisonLevy` exists precisely because the
  // field hosts are usually somewhere else.
  const defenders = state.armies
    .filter((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id)
    .map((a) => a.id);
  const headcount = (): number => defenders
    .reduce((n, id) => n + totalUnits(state.armies.find((a) => a.id === id) ?? EMPTY_HOST), 0)
    + Math.max(0, Math.round(land.ownerId === PLAYER_KINGDOM_ID ? land.localSoldiers : 0));
  const openingUs = headcount();
  const openingThem = totalUnits(army);
  const filed = (outcome: AscentBattleRecord['outcome']): void => {
    if (reported || state.gameMode !== 'ascent' || !state.ascent) return;
    recordEngagement(state, {
      turn: state.turn,
      key: `${state.ascent.wave}:${land.id}:${state.turn}`,
      landId: land.id,
      landName: land.name,
      role: 'defence',
      outcome,
      // Not a beat count: nobody stood on this field. The rounds column is what the watched
      // screen counted, and a dispatch that invents one would be claiming a fight was played.
      rounds: 0,
      ourStart: openingUs,
      theirStart: openingThem,
      ourEnd: headcount(),
      theirEnd: totalUnits(army),
      theirHosts: 1,
      ourHosts: state.armies.filter((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id && !a.isLevy).length,
      levyFought: !state.armies.some((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id && !a.isLevy),
      generalName: generalOf(state, land),
      generalHeroId: generalIdOf(state, land),
      kingdomName: kingdomName(state, record.kingdomId),
      year: state.year,
      season: state.season,
      // Always: by definition the player did not watch this one.
      delegated: true,
      wave: state.ascent.wave,
    });
  };
  // Fire Arrows: the volley lands before the lines meet, so it is spent on the approach whether
  // the defence then holds or breaks. Applied ahead of the preview so the odds the battle
  // resolves on are the odds after the arrows have fallen.
  const volley = openingVolleyShare(state);
  if (volley > 0) applyInvaderLosses(army, volley);

  const preview = createBattlePreview(state, army.id, land.id);
  if (!preview) {
    return;
  }
  /**
   * The clock is spent whatever happens next.
   *
   * Cleared on a fall (the province is theirs and `siegeOrders` takes over), and re-set to
   * `SIEGE_RENEW_SHARE` of the opening clock when the walls hold — a repelled host digs back in
   * rather than going home, so the province that held once is not free for another four seasons
   * and the war keeps a rhythm the player can plan a second relief against.
   */
  if (land.siege) {
    // `relieved` and `presentAtOpen` deliberately carry over: the reward is once per siege, and a
    // renewal is the same siege having another go at the same walls. Resetting them paid a host
    // that never moved every time the besiegers were thrown back — see `tickSieges`.
    land.siege = {
      ...land.siege,
      ticksLeft: Math.max(SIEGE_MIN_TICKS, Math.round(land.siege.ticks * SIEGE_RENEW_SHARE)),
    };
  }
  const preTotal = totalUnits(army);
  // Walls give the defender a slight edge, but big/Great hosts bring siege and negate
  // much of it — you must meet them in the field. A small ±10% fuzz lets close fights
  // swing (drama) while a clearly stronger side still prevails (preparation over luck).
  const fuzz = 0.9 + Math.random() * 0.2;
  const siegeMult = record.great ? 0.72 : preTotal > 1000 ? 0.8 : 0.85;
  const victory = forced
    ? forced === 'invader'
    : preview.attackerPower >= preview.defenderPower * defenderBonus * siegeMult * fuzz;

  /**
   * A sally is a decision, so it has to be able to cost something.
   *
   * `defenderBonus` is 1.22 for "attack", 1.06 for "hold" and 1 for "withdraw". With a field host
   * on the tile the trade is already real — that host takes the extra losses. With only a
   * garrison there was nothing on the other side of the choice at all, so ordering the walls to
   * sally was strictly better than holding them, which is not a decision but a button that should
   * have been pressed for you. Now the men who go out are the province's own: they are spent
   * whether the line holds or not, and the next wave meets a thinner watch. The masonry is
   * untouched either way, because walls do not charge.
   */
  const garrisonAlone = !state.armies.some(
    (a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id && !a.isLevy && totalUnits(a) > 0,
  );
  if (!forced && defenderBonus > 1.1 && garrisonAlone && land.ownerId === PLAYER_KINGDOM_ID) {
    land.localSoldiers = Math.max(0, Math.round(land.localSoldiers * (victory ? 0.6 : 0.82)));
  }

  if (!victory) {
    applyInvaderLosses(army, 0.4);
    army.morale = Math.max(20, army.morale - 16);
    /**
     * **A held line costs the province (Dragon Ascent).**
     *
     * This branch used to charge the defender nothing at all unless it sallied — and 97% of
     * engagements resolve here, not on the battle screen. So a walls-only capital repelled wave
     * after wave for free: measured on seed 55, seventeen capital defences from wave 22 to 42,
     * every one `us 6958 -> 6958`, no army, one province, no end. The province is now spent by
     * the share the levy would have lost had the screen opened, through the same door the watched
     * fight uses, so a second host reaching the same ground this wave meets a province the first
     * one already bled. The odds the share is read from are the ones the roll was made at.
     */
    if (state.gameMode === 'ascent' && land.ownerId === PLAYER_KINGDOM_ID && !forced
      && !state.armies.some((a) => a.isLevy && a.landId === land.id)) {
      const share = hiddenDefenceLossShare(preview.attackerPower, preview.defenderPower);
      const militiaDead = Math.round(land.localSoldiers * share);
      land.localSoldiers = Math.max(0, land.localSoldiers - militiaDead);
      chargeProvinceForDefence(state, land, share, militiaDead);
    }
    // Thrown back: two seasons to re-form before it comes on again (see the regroup note in
    // `tickInvasions`, which is the only reader and is gated to empire for the same reason).
    record.regroupUntil = state.turn + 2;
    awardDefenderXp(state, land, preview.defenderPower);

    if (totalUnits(army) < 40) {
      recordArmyDefeated(state, preTotal);
      grantRepelSpoils(state, preTotal, record);
      state.message = t('empire.invade.repelled', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
      // Filed before the host is despawned — `theirEnd` reads the army, and a despawned one
      // reads as its opening strength, which would report a wiped-out invasion as a stalemate.
      filed('they-rout');
      despawnInvasion(state, record);
      return;
    }
    // A bloodied raider gives up and withdraws; a war host keeps grinding — unless it was
    // broken in the field, in which case it has been seen to run and does not get to try the
    // same gate again next tick. A host that runs leaves its dead, its baggage and its
    // stragglers behind: the spoils of a rout are the spoils of the fight, scaled to what it
    // lost, not withheld until the last man is hunted down.
    if (record.intent === 'raid' || forced === 'defence') {
      record.pillaged = true;
      record.plan = 'withdrawing';
      record.exitLandId = farthestNeutralFromCapital(state)?.id;
      if (forced === 'defence') {
        recordArmyDefeated(state, preTotal);
        grantRepelSpoils(state, Math.max(40, preTotal - totalUnits(army)), record);
        state.message = t('empire.invade.repelled', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
      }
      // A besieger that broke leaves the walls it was sitting under: the siege is lifted and
      // the host falls back to the ground it came from. Left in place, a broken host's siege
      // ran on and captured the province it had just been beaten in front of.
      const siege = state.siegeOrders.find((order) => order.armyId === army.id);
      if (siege) {
        state.siegeOrders = state.siegeOrders.filter((order) => order !== siege);
        army.landId = siege.fromLandId;
      }
      filed('they-rout');
      return;
    }
    // The line held and the host is still out there. Not a rout — `spent` is the honest word
    // for a defence that stopped an assault without breaking the army that made it, and it is
    // the outcome the Reckoning reads as "the ground is held".
    filed('spent');
    return;
  }

  // Invader wins the field. A won battle is worth a season of confidence to the campaign clock.
  extendCampaign(record, CAMPAIGN_TICKS_ON_WIN);
  applyInvaderLosses(army, 0.16);
  // Feigned Retreat: a pursuit out of formation costs the attacker more than the ground was
  // worth. This is the card that makes losing a province a move rather than only a loss.
  const pursuit = pursuitLossShare(state);
  if (pursuit > 0) applyInvaderLosses(army, pursuit);
  retreatDefenders(state, land);

  if (record.intent === 'raid') {
    land.siege = undefined;
    pillage(state, land);
    extendCampaign(record, CAMPAIGN_TICKS_ON_SACK);
    record.pillaged = true;
    record.exitLandId = farthestNeutralFromCapital(state)?.id;
    state.message = t('empire.invade.raidHit', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
    filed('we-rout');
    return;
  }

  // The walls are carried: the assault clock has nothing left to count.
  land.siege = undefined;

  // Conquest: occupy and lay siege; progressSiegeOrders flips ownership.
  const fromLandId = army.landId;
  army.landId = land.id;
  state.siegeOrders.push({
    landId: land.id,
    armyId: army.id,
    attackerKingdomId: army.kingdomId,
    fromLandId,
    progress: 0,
    required: getAcquisitionTicksRequired(land),
  });
  state.message = t('empire.invade.besiege', { kingdom: kingdomName(state, record.kingdomId), land: land.name });
  filed('we-rout');
}

/** Stands in for a host that has been despawned, so a headcount reads 0 rather than throwing. */
const EMPTY_HOST = { units: { spearmen: 0, archers: 0, heavyInfantry: 0 } } as Army;

/**
 * Who was nominally in charge here, so a dispatch can name somebody.
 *
 * The hidden-roll twin of the watched fight's commander, and it has to agree with it or the same
 * defence is credited to a governor on the screen and to nobody in the dispatch. `defenceCommanderOf`
 * is the one answer both read: the general of a host standing here first, the province's own
 * governor when the hosts are elsewhere.
 */
function generalOf(state: GameState, land: Land): string | undefined {
  return defenceCommanderOf(state, land)?.name;
}

/** The same commander, by id, so the Reckoning can draw their face rather than name them. */
function generalIdOf(state: GameState, land: Land): string | undefined {
  return defenceCommanderOf(state, land)?.id;
}

function retreatDefenders(state: GameState, land: Land): void {
  // The walls do not retreat: a garrison levy stays where it was raised and is dissolved back
  // into its province by `dissolveGarrisonLevies` once the fighting stops.
  const defenders = state.armies.filter((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id && !a.isLevy);
  for (const defender of defenders) {
    // The Bronze Drum steadies everyone still standing — ordinary on one front, and worth the
    // slot the moment the realm is fighting on three.
    soundTheBronzeDrum(state, defender.id);

    // Twice-Born: once a wave, a broken host reforms at the seat instead of scattering. It keeps
    // its men and finds its heart again, which is what makes it something to plan a defence
    // around rather than a consolation.
    if (tryReformBrokenHost(state, defender)) continue;

    const retreat = land.neighbors
      .map((id) => findLand(state, id))
      .find((l) => l?.ownerId === PLAYER_KINGDOM_ID);
    if (retreat) {
      defender.landId = retreat.id;
    }
    defender.morale = Math.max(25, defender.morale - 18);
    applyInvaderLosses(defender, 0.18);
  }
}

function awardDefenderXp(state: GameState, land: Land, defenderPower: number): void {
  const defender = state.armies.find((a) => a.kingdomId === PLAYER_KINGDOM_ID && a.landId === land.id);
  if (!defender) {
    return;
  }
  defender.experience += Math.max(8, Math.round(defenderPower / 90));
  grantGeneralExperience(state, defender, true);
  while (defender.level < 5 && defender.experience >= defender.experienceToNextLevel) {
    defender.experience -= defender.experienceToNextLevel;
    defender.level += 1;
    defender.experienceToNextLevel = 100 + (defender.level - 1) * 60;
    defender.morale = Math.min(100, defender.morale + 5);
  }
}

function pillage(state: GameState, land: Land): void {
  land.loyalty = Math.max(15, land.loyalty - 22);
  const lootGold = Math.min(state.resources.gold, 25);
  const lootFood = Math.min(state.resources.food, 35);
  applyResourceDelta(state, { gold: -lootGold, food: -lootFood });
  if (land.buildings.length > 0) {
    land.buildings.splice(Math.floor(Math.random() * land.buildings.length), 1);
  }
  if (state.dynastyStatus) {
    state.dynastyStatus.farmerUnrest = Math.min(100, state.dynastyStatus.farmerUnrest + 10);
  }
  refreshAllLandOutputs(state);
}

export function farthestNeutralFromCapital(state: GameState): Land | undefined {
  const capital = playerCapital(state) ?? playerLands(state)[0];
  if (!capital) {
    return undefined;
  }
  return state.lands
    .filter((l) => l.ownerId === 'neutral')
    .sort((a, b) => ((b.x - capital.x) ** 2 + (b.y - capital.y) ** 2) - ((a.x - capital.x) ** 2 + (a.y - capital.y) ** 2))[0];
}

function kingdomName(state: GameState, kingdomId: string): string {
  return state.kingdoms.find((k) => k.id === kingdomId)?.name ?? kingdomId;
}
