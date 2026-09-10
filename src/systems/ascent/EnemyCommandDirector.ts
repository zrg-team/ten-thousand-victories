/**
 * The rival empires as commanders rather than a metronome.
 *
 * Ten minutes of Dragon Ascent produced no battle at all, and five separate things were causing it:
 *
 *  1. Waves fired on a fixed `WAVE_INTERVAL_TICKS` countdown, and `launchWave` skipped the spawn
 *     entirely whenever `waveBudgetSpent` was true — so a realm holding its own simply stopped
 *     being attacked.
 *  2. Hosts spawned on the neutral district *farthest* from the capital and walked one hop a tick.
 *  3. That walk was a bare `army.landId = step`, which bypasses `MovementOrder` and therefore the
 *     march tween, the dust, and the marching column — an invader teleported between provinces.
 *  4. It made no difference anyway, because `refreshPlayerVisibility` lights only owned lands and
 *     their neighbours, so the approach happened entirely in the dark.
 *  5. Targeting was capital-or-nearest, with no notion of value, of splitting up, or of retreat —
 *     so even an invasion that arrived was not a campaign anyone could read or answer.
 *
 * This director owns the first, second and fifth of those. The third and fourth are fixed in
 * `InvasionSystem.tickInvasions` and `LandSystem.refreshPlayerVisibility` respectively, both
 * ascent-gated.
 *
 * Runs before `tickInvasions` each tick so a host spawned this tick marches on the same tick it
 * was given its orders.
 */
import { isVassal } from './VassalSystem';
import { NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID } from '../../game/constants';
import {
  ENEMY_LAUNCH_DRAW,
  ENEMY_PRESSURE_DIVISOR,
  ENEMY_RETREAT_HYSTERESIS_TICKS,
  ENEMY_RETREAT_POWER_RATIO,
  MAX_LIVE_INVADER_HOSTS,
  MIN_RAID_SOLDIERS,
  RAID_POWER_SHARE,
  INVADER_POWER_PER_SOLDIER,
  COALITION_JOIN_BELOW_RELATIONS,
  COALITION_JOIN_DRAW,
  COALITION_JOIN_RATIO,
  COALITION_JOIN_SHARE,
  EARLY_WAVE_GRACE,
  RIVAL_CLAIM_INTERVAL_TICKS,
  RIVAL_CLAIM_MAX_SHARE,
} from '../../game/ascentConfig';
import { launchOffMapInvasion } from '../empire/InvasionSystem';
import { pushToast } from '../empire/notifications';
import { getPlayerTroops } from '../ResourceSystem';
import { provinceIsFalling } from '../LandSystem';
import { getEmpirePower } from '../DiplomacySystem';
import { armyPower } from '../WarSystem';
import { ambitionHeat } from './AmbitionSystem';
import { contestedDefencePower, landGarrisonPower } from './PowerSystem';
import { laggedDefencePower, peaceFloorBreached, waveSoldierBudget } from './WaveDirector';
import { t } from '../../i18n';
import type { GameState, InvasionRecord, Kingdom, Land } from '../../state/types';

// ─── Who attacks, and when ────────────────────────────────────────────────────

/**
 * How badly one rival wants to march on the player, as a 0..1 pressure.
 *
 * The weights are the ones `WaveDirector.pickAggressor` and `ThreatDirector.threatWeight` already
 * use, so the empire that has been snarling at the player through the diplomacy screen is the one
 * that actually turns up. Relations dominate: a kingdom the player has been paying tribute to is
 * genuinely safer than one they have been defying, which is what makes the diplomacy lane matter.
 */
function aggressionPressure(state: GameState, kingdom: Kingdom): number {
  const hostility = Math.max(0, 100 - (kingdom.relations ?? 50));
  const appetite = Math.max(0, kingdom.warAppetite ?? 0);
  const power = Math.max(0, kingdom.power ?? 40);
  const raw = hostility * 1.0 + appetite * 0.55 + power * 0.25;
  // Ambition is a property of the run rather than of any one rival — the player's own expansion is
  // what draws attention — so it scales every rival's appetite together.
  return Math.max(0, Math.min(1, (raw * ambitionHeat(state)) / ENEMY_PRESSURE_DIVISOR));
}

/**
 * A rival whose ground the player has just come to border, if any.
 *
 * Compares the set of rivals the realm touches against the set it touched last tick, so this fires
 * once per new frontier rather than every tick the frontier exists. The player's own provinces are
 * the reference: a rival becomes "contested" the moment one of its lands neighbours one of theirs.
 */
function newlyContestedRival(state: GameState): Kingdom | undefined {
  const ascent = state.ascent;
  if (!ascent) return undefined;

  const ownedIds = new Set(
    state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).map((land) => land.id),
  );
  const touching = new Set<string>();
  for (const land of state.lands) {
    if (land.ownerId === PLAYER_KINGDOM_ID || land.ownerId === 'neutral') continue;
    if (land.neighbors.some((id) => ownedIds.has(id))) touching.add(land.ownerId);
  }

  const known = new Set(ascent.borderedRivalIds ?? []);
  ascent.borderedRivalIds = [...touching];
  for (const kingdomId of touching) {
    if (known.has(kingdomId)) continue;
    const kingdom = state.kingdoms.find((k) => k.id === kingdomId && !k.isDefeated);
    if (kingdom && !isVassal(kingdom)) return kingdom;
  }
  return undefined;
}

/** Rivals that could plausibly march. */
function aggressors(state: GameState): Kingdom[] {
  // Vassals excluded: an oath that does not stop the marching is not an oath.
  return state.kingdoms.filter(
    (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated && !isVassal(kingdom),
  );
}

/** Whether any hostile host is currently standing on or beside the player's ground. */
function contactIsLive(state: GameState): boolean {
  const owned = new Set(
    state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).map((land) => land.id),
  );
  return state.armies.some((army) => {
    if (army.kingdomId === PLAYER_KINGDOM_ID) return false;
    if (owned.has(army.landId)) return true;
    const at = state.lands.find((land) => land.id === army.landId);
    return Boolean(at?.neighbors.some((id) => owned.has(id)));
  });
}

/**
 * Decides whether a rival marches this tick.
 *
 * A random draw against each rival's pressure rather than a shared countdown, so contact is
 * genuinely unpredictable and a hostile neighbour is genuinely more dangerous than a friendly one.
 * Two guards keep that honest in both directions:
 *
 *  - a floor, because the defect this exists to fix is "ten minutes, no battle", and a run of bad
 *    rolls must not be allowed to reproduce it;
 *  - the existing live-threat ceiling, so incursions cannot stack into an unanswerable pile.
 */
function maybeLaunch(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  /**
   * The ceiling, and it is now a queue rather than a quota.
   *
   * `WaveDirector` runs its own metronome, so this director is a *second* source of hosts on the
   * same map, and its ceiling used to be "half of `MAX_LIVE_INVADER_HOSTS`" — three. Which is
   * three unscheduled hosts on top of whatever the schedule had already sent. Measured on seed
   * 20080: the wave-1 host landed at tick 11 with 864 men, and at tick 19 the northern rival put
   * **three more** on the map, 254 + 221 + 261, against a realm whose field army was 460 men.
   * Four hosts from two crowns, in the first wave. On seed 12161 the same thing at tick 12.
   *
   * That is the reported "it makes multiple invasions at the same time", and the answer the raid
   * path has always used is the right one for this too — `maybeRaid` opens with
   * `if ((state.invasions?.length ?? 0) > 0) return;`. Weather waits for the last front to
   * finish. What arrives *on top* of a live invasion should only ever be the schedule's own
   * wave, a coalition the player was warned about, or a story's answer to something they did.
   *
   * The peace floor is unaffected in the only sense that matters: a host standing on the map
   * already *is* contact, so the guarantee this director exists for is being met while it waits.
   */
  if ((state.invasions?.length ?? 0) > 0) return;

  const candidates = aggressors(state);
  if (candidates.length === 0) return;

  // The floor is now the *peace floor* — long while the realm is young, tightening as the run
  // ages, and jittered so it is never a number the player can count to. `WaveDirector` owns it
  // because the same threshold decides whether the scheduled wave ignores the relations dial.
  const forced = peaceFloorBreached(state);

  // The opening is the schedule's alone. A draw that fires inside the grace puts a second host
  // on the map between two waves the realm has been promised are single columns — the peace
  // floor still marches through it, because a guarantee of contact is the one thing the grace
  // must not suspend.
  if (!forced && ascent.wave <= EARLY_WAVE_GRACE) return;

  let chosen: Kingdom | undefined;
  if (forced) {
    // The floor fired: send the angriest, so a forced attack still reads as coming from the
    // empire the player has most reason to expect it from.
    chosen = candidates.reduce((worst, kingdom) => (
      aggressionPressure(state, kingdom) > aggressionPressure(state, worst) ? kingdom : worst
    ), candidates[0]);
  } else {
    // One draw per rival per tick. The coefficient is small on purpose: at three rivals this is
    // roughly one unscheduled march every forty ticks, which sits *under* the wave director's
    // twelve-tick metronome rather than competing with it. The randomness is what makes contact
    // unpredictable; the volume comes from the schedule, and the floor below guarantees the worst
    // case. Tuned up from a coefficient four times this, which produced a permanent siege.
    for (const kingdom of candidates) {
      if (Math.random() < aggressionPressure(state, kingdom) * ENEMY_LAUNCH_DRAW) {
        chosen = kingdom;
        break;
      }
    }
  }
  if (!chosen) return;

  // **A raid, not a wave.**
  //
  // This sent a full `waveSoldierBudget` — the whole scheduled wave, spawned outside the schedule,
  // with no response card, no wave counter and nothing telling the player it had happened. On the
  // reported run it fired in Year 4 alongside the wave-2 host, which is how a realm with 460 field
  // soldiers ended up facing two full-sized invasions in the same year.
  //
  // The floor exists to guarantee *contact*, not to double the difficulty curve. A raid-sized host
  // is contact: it is a real battle, it is survivable, and it resets the clock — which is all the
  // guarantee was ever for.
  const budget = Math.round(laggedDefencePower(state) * RAID_POWER_SHARE / INVADER_POWER_PER_SOLDIER);
  // One host in the opening, not a rolled coalition.
  //
  // Without `forceCoalition` the spawner rolls `armyCount` off relations and sends up to three at
  // once — so the map-is-clear rule above still let a single cold-relations march put three hosts
  // on the board. It only started showing once conquered ground began sticking: a realm that keeps
  // its provinces crosses `RAID_MIN_LANDS` in the first waves, and `verify-ascent-opening` caught
  // seed 12161 at four hosts from two crowns during wave 2, defeated by wave 5. The grace has to
  // bound the *shape* of what arrives, not only how often.
  launchOffMapInvasion(state, chosen.id, {
    totalSoldiers: Math.max(MIN_RAID_SOLDIERS, budget),
    ...(ascent.wave <= EARLY_WAVE_GRACE ? { forceCoalition: 1 } : {}),
  });
  ascent.lastContactTurn = state.turn;
  if (forced) {
    pushToast(state, t('ascent.enemy.marchForced', { kingdom: chosen.name }), 'threat');
  }
}

// ─── Story strikes ────────────────────────────────────────────────────────────

/**
 * A host sent *now*, because of something that just happened.
 *
 * The distinction from `maybeLaunch` is the whole point: that one is weather, this is
 * consequence. It bypasses the randomised cadence entirely so the march is legibly an answer to
 * the player's own choice, and it stamps `lastContactTurn` so the floor does not immediately send
 * a second one on top of it.
 *
 * Returns false when the map is already too crowded to add another — a punitive host that cannot
 * spawn must not be announced, or the toast promises something that never arrives.
 */
export function launchPunitiveHost(
  state: GameState,
  kingdomId: string,
  opts: { conquest?: boolean; sizeMult?: number } = {},
): boolean {
  const ascent = state.ascent;
  if (state.gameMode !== 'ascent' || !ascent) return false;
  if ((state.invasions?.length ?? 0) >= MAX_LIVE_INVADER_HOSTS) return false;
  // Not through the opening grace. A rival collapsing, a story's blow, a court answering an
  // encroachment — every consequence this sends is right at wave six and the wrong thing to put
  // between the three single columns the opening promises. Measured on the setup-phase build:
  // a collapsed empire's opportunist landed two extra hosts at wave three on three seeds of four.
  // Callers already handle `false` (the toast is not raised, the wave clock is nudged instead).
  if (ascent.wave <= EARLY_WAVE_GRACE) return false;

  const budget = Math.round(waveSoldierBudget(state, ascent.wave, false) * (opts.sizeMult ?? 1));
  launchOffMapInvasion(state, kingdomId, {
    totalSoldiers: budget,
    forceConquest: opts.conquest,
  });
  ascent.lastContactTurn = state.turn;
  return true;
}

/**
 * Attacks that answer something that just happened, bypassing every telegraph and cooldown.
 *
 * These are the ones that should feel like consequences rather than weather. Each is tied to a
 * thing the player did or a thing the world did to them, and each fires at most once for the
 * situation that caused it.
 */
function storyStrikes(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;
  if ((state.invasions?.length ?? 0) >= MAX_LIVE_INVADER_HOSTS) return;
  // The opening is the schedule's alone — see `launchPunitiveHost`. The rival count is still
  // tracked below once the grace ends, so a collapse *during* the grace is not answered late.
  if (ascent.wave <= EARLY_WAVE_GRACE) {
    ascent.lastRivalCount = aggressors(state).length;
    return;
  }

  // A rival empire falling apart is an opportunity its neighbours take — including at the player's
  // expense. Tracked against the count so it fires on the transition, not every tick afterwards.
  const liveRivals = aggressors(state).length;
  if (ascent.lastRivalCount === undefined) {
    ascent.lastRivalCount = liveRivals;
  } else if (liveRivals < ascent.lastRivalCount) {
    ascent.lastRivalCount = liveRivals;
    const opportunist = aggressors(state)
      .sort((a, b) => aggressionPressure(state, b) - aggressionPressure(state, a))[0];
    if (opportunist && launchPunitiveHost(state, opportunist.id)) {
      pushToast(state, t('ascent.enemy.powerVacuum', { kingdom: opportunist.name }), 'threat');
      return;
    }
  } else if (liveRivals > ascent.lastRivalCount) {
    ascent.lastRivalCount = liveRivals;
  }

  // Taking ground on a rival's doorstep is answered by *that* rival.
  //
  // Deliberately not "the realm grew by N provinces". Growth is already charged for, twice over —
  // `chargeAmbition` on every claim, and `ambitionHeat` scaling every wave — so a third tax on
  // expansion punishes the core loop rather than dramatising it. Measured, the growth version took
  // a run from peak 16 / ended 14 down to peak 13 / ended 7.
  //
  // Border friction is the honest trigger: it fires only when the player's new province actually
  // touches ground a rival holds, so it reads as *that empire* reacting to *that* encroachment,
  // and a player expanding into empty country is left alone.
  const borderRival = newlyContestedRival(state);
  if (borderRival && launchPunitiveHost(state, borderRival.id)) {
    pushToast(state, t('ascent.enemy.borderAlarm', { kingdom: borderRival.name }), 'threat');
  }

  // **A second crown joins a war already being fought.**
  //
  // Asked for as *"war can happen by 1 or many kingdom at the time"*, and the machinery only ever
  // half-allowed it: two courts could end up on the map together by coincidence — a border alarm
  // here, an exposed capital there — but nothing ever *decided* to pile on. A war was always one
  // kingdom's war, whatever the diplomacy screen said.
  //
  // Now a cold court watching a war go badly for the realm takes its chance, and the whole gate is
  // read off relations: the joiner must be hostile, it must not be feuding with the crown already
  // in the field (two courts that hate each other do not march together — that is what makes the
  // feud map worth reading), and the fight must be visibly going the invader's way. That last
  // clause is what stops this being noise: nobody piles onto a war the defender is winning.
  //
  // Deliberately rarer than the wave clock and capped by the same per-court and map-wide ceilings,
  // so "many kingdoms at once" stays a thing that happens to a realm that has made enemies, rather
  // than the default weather.
  // An undefended seat is an invitation. Checked against a flag so it fires once per exposure
  // rather than every tick the capital happens to be empty.
  // Same grace as the war-joiner above: an empty seat in wave one is a player who has not yet
  // been taught that the seat wants a garrison, not a player taking a risk.
  const capital = ascent.wave > EARLY_WAVE_GRACE
    ? state.lands.find((land) => land.id === ascent.capitalLandId)
    : undefined;
  if (capital && capital.ownerId === PLAYER_KINGDOM_ID) {
    const garrisoned = state.armies.some(
      (army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === capital.id,
    );
    if (!garrisoned && !ascent.capitalExposedFired) {
      const opportunist = aggressors(state)
        .sort((a, b) => aggressionPressure(state, b) - aggressionPressure(state, a))[0];
      if (opportunist) {
        ascent.capitalExposedFired = true;
        ascent.lastContactTurn = state.turn;
        launchOffMapInvasion(state, opportunist.id, {
          totalSoldiers: waveSoldierBudget(state, ascent.wave, false),
          forceConquest: true,
        });
        pushToast(state, t('ascent.enemy.capitalExposed', { kingdom: opportunist.name }), 'threat');
      }
    } else if (garrisoned) {
      ascent.capitalExposedFired = false;
    }
  }
}

/**
 * A second court piling onto a war the realm is already losing.
 *
 * See the call site for why this exists. The conditions, in the order they cost least to check:
 * a war is live, the map has room, this court is not the one fighting it, it is not feuding with
 * the court that is, it is genuinely cold, and the realm is measurably losing.
 */
function maybeJoinTheWar(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent) return;

  // Not in the opening. A second crown piling onto a war is the mode working as asked ("war can
  // happen by 1 or many kingdom at the time") and it is the wrong lesson for a player's first two
  // waves, which are the only ones that have to teach what a single fight is.
  if (ascent.wave <= EARLY_WAVE_GRACE) return;

  const live = state.invasions ?? [];
  if (live.length === 0) return;
  if (live.length >= MAX_LIVE_INVADER_HOSTS) return;

  // Only against a realm that is actually being beaten. `contestedDefencePower` is the same
  // denominator the wave director sizes against, so "losing" here means the same thing it means
  // everywhere else in the mode.
  const invaderPower = live.reduce((sum, record) => {
    const army = state.armies.find((candidate) => candidate.id === record.armyId);
    return sum + (army ? armyPower(state, army) : 0);
  }, 0);
  if (invaderPower < contestedDefencePower(state) * COALITION_JOIN_RATIO) return;

  const fighting = new Set(live.map((record) => record.kingdomId));
  const feuding = new Set(
    state.kingdoms.filter((k) => fighting.has(k.id)).map((k) => k.feudWith).filter(Boolean) as string[],
  );
  const candidates = aggressors(state).filter((kingdom) => (
    !fighting.has(kingdom.id)
    && !feuding.has(kingdom.id)
    && (kingdom.relations ?? 50) < COALITION_JOIN_BELOW_RELATIONS
  ));
  if (candidates.length === 0) return;

  // The angriest of them, and one draw — the pile-on is a risk the player has run, not a schedule.
  const joiner = candidates.reduce((worst, kingdom) => (
    aggressionPressure(state, kingdom) > aggressionPressure(state, worst) ? kingdom : worst
  ), candidates[0]);
  if (Math.random() > aggressionPressure(state, joiner) * COALITION_JOIN_DRAW) return;

  const budget = Math.round(waveSoldierBudget(state, ascent.wave, false) * COALITION_JOIN_SHARE);
  launchOffMapInvasion(state, joiner.id, { totalSoldiers: budget, forceConquest: true });
  ascent.lastContactTurn = state.turn;
  pushToast(state, t('ascent.enemy.joinsTheWar', { kingdom: joiner.name }), 'threat');
}

// ─── Hosts that march with a plan ─────────────────────────────────────────────

/** What a province is worth taking, from what it produces and what stands on it. */
function landValue(state: GameState, land: Land): number {
  const outputs = land.outputs;
  const yield_ = (outputs?.gold ?? 0) * 1.2 + (outputs?.food ?? 0) + (outputs?.supplies ?? 0);
  const capital = land.id === state.ascent?.capitalLandId ? 90 : 0;
  return yield_ + land.buildings.length * 14 + land.population * 0.04 + capital;
}

/** Assigns each host without one a plan, and a province to carry it out on. */
function assignPlans(state: GameState): void {
  const records = state.invasions ?? [];
  const held = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (held.length === 0) return;

  /**
   * Ground a column of ours is already taking is not fresh prey.
   *
   * A province mid-claim has no walls left standing and no militia (`landGarrisonPower` reads it
   * as nearly free), so it sorted to the top of every "softest target" list and the next wave was
   * pointed straight back at ground that was already falling — three columns converging on a
   * province one of them had taken, which is what the player saw as fights that would not stop.
   *
   * **The fallback is load-bearing.** With no target at all a host stands still holding one of the
   * `MAX_LIVE_INVADER_HOSTS` slots the wave director counts before it sends the next wave; five of
   * those deadlocked a whole run once already (see `tickInvasions`'s no-road note). So if every
   * province the realm holds is falling, the filter yields and they go back to being targets.
   */
  const pool = held.filter((land) => !provinceIsFalling(state, land.id));
  const owned = pool.length > 0 ? pool : held;

  // Targets already claimed by another host, so flankers genuinely spread rather than stacking.
  const taken = new Set(
    records.map((record) => record.targetLandId).filter((id): id is string => Boolean(id)),
  );

  // **A hunter is the one plan that cannot be assigned once.** Its target is an army, and an
  // army moves — so this runs before the assignment loop below and re-points every hunter at
  // wherever the player's largest field host is standing now. Left to `assignPlans` it would be
  // stamped with the province the host happened to occupy when the wave landed, and would then
  // besiege empty ground while the host it was sent for marched away.
  const quarry = state.armies
    .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy
      && army.units.spearmen + army.units.archers + army.units.heavyInfantry > 0)
    .sort((a, b) => (b.units.spearmen + b.units.archers + b.units.heavyInfantry)
      - (a.units.spearmen + a.units.archers + a.units.heavyInfantry))[0];
  for (const record of records) {
    if (record.plan !== 'hunter') continue;
    // No host left to hunt: it turns on the ground instead, which is what an army does when the
    // field army it came for has been destroyed.
    record.targetLandId = quarry?.landId ?? state.ascent?.capitalLandId ?? record.targetLandId;
  }

  for (const record of records) {
    if (record.plan && record.targetLandId) continue;

    const army = state.armies.find((candidate) => candidate.id === record.armyId);
    if (!army) continue;

    if (record.intent === 'raid') {
      record.plan = 'raider';
      // A raider wants the nearest thing worth burning, not the best-defended prize.
      const nearest = [...owned].sort((a, b) => distance(army.landId, a, state) - distance(army.landId, b, state));
      record.targetLandId = (nearest.find((land) => !taken.has(land.id)) ?? nearest[0])?.id;
      if (record.targetLandId) taken.add(record.targetLandId);
      continue;
    }

    // Conquest hosts split: the first goes for the prize, the rest for whatever is weakly held.
    //
    // Both scores are divided by distance, and that is not decoration. Scored on value alone the
    // hosts behave like a solver rather than an army: every flanker beelines across the whole map
    // for whichever province happens to be softest, and a measured run lost 31 provinces against a
    // baseline of 13. An army marches on what is in front of it and worth taking, which is both
    // more believable and considerably less punishing.
    const spearheadExists = records.some((other) => other !== record && other.plan === 'spearhead');
    const reach = (land: Land): number => 1 + Math.sqrt(distance(army.landId, land, state)) / 220;

    if (!spearheadExists) {
      record.plan = 'spearhead';
      const best = [...owned].sort((a, b) => landValue(state, b) / reach(b) - landValue(state, a) / reach(a));
      record.targetLandId = (best.find((land) => !taken.has(land.id)) ?? best[0])?.id;
    } else {
      record.plan = 'flanker';
      // Value per unit of defence, per unit of march: what pays best for the least fighting and
      // the least walking.
      const softness = (land: Land): number => landValue(state, land)
        / Math.max(1, landGarrisonPower(state, land))
        / reach(land);
      const soft = [...owned].sort((a, b) => softness(b) - softness(a));
      record.targetLandId = (soft.find((land) => !taken.has(land.id)) ?? soft[0])?.id;
    }
    if (record.targetLandId) taken.add(record.targetLandId);
  }
}

/** Straight-line distance between a host's province and another, for rough ordering. */
function distance(fromLandId: string, to: Land, state: GameState): number {
  const from = state.lands.find((land) => land.id === fromLandId);
  if (!from) return Number.POSITIVE_INFINITY;
  return (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
}

/**
 * Re-reads each host's situation and pulls it back if the fight in front of it is hopeless.
 *
 * `createBattlePreview` cannot be used here: it requires the host to be adjacent to the target
 * already, and the whole point is to make this decision while the host is still marching. So the
 * comparison is a direct one between the host's power and what is waiting for it.
 *
 * Hysteresis matters more than the threshold. Without it a host sitting near the line oscillates
 * between advancing and withdrawing every tick, which reads as a bug rather than as caution.
 */
function reconsider(state: GameState): void {
  for (const record of state.invasions ?? []) {
    if (record.plan === 'raider' || record.pillaged) continue;

    const army = state.armies.find((candidate) => candidate.id === record.armyId);
    const target = state.lands.find((candidate) => candidate.id === record.targetLandId);
    if (!army || !target) continue;

    // A host that has already reached its objective commits to the assault.
    //
    // Without this the retreat check fires on the doorstep and the host turns around one tick
    // before contact — which is precisely the "no battle ever happens" defect this director was
    // written to fix, reintroduced from the other side. Withdrawal is for a march that has become
    // pointless, not for an attack that has become costly.
    const here = state.lands.find((candidate) => candidate.id === army.landId);
    if (here?.id === target.id || here?.neighbors.includes(target.id)) {
      record.retreatTicks = 0;
      continue;
    }

    const attack = armyPower(state, army);
    const defence = landGarrisonPower(state, target)
      + state.armies
        .filter((other) => other.kingdomId === PLAYER_KINGDOM_ID && other.landId === target.id)
        .reduce((sum, other) => sum + armyPower(state, other), 0);

    const outmatched = attack < defence * ENEMY_RETREAT_POWER_RATIO;
    if (outmatched) {
      record.retreatTicks = (record.retreatTicks ?? 0) + 1;
      if (record.retreatTicks >= ENEMY_RETREAT_HYSTERESIS_TICKS && record.plan !== 'withdrawing') {
        // Rather than dying to attrition against a province it cannot take, the host looks for
        // softer ground. Only if there is none does it turn for home.
        // Same rule as `assignPlans`: a province already being claimed reads as the softest
        // ground on the map precisely because it has already been beaten, and re-pointing a
        // beaten host at it piles a third column onto a fight that is over.
        const held = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
        const pool = held.filter((land) => !provinceIsFalling(state, land.id));
        const owned = pool.length > 0 ? pool : held;
        const softer = owned
          .filter((land) => land.id !== target.id)
          .sort((a, b) => landGarrisonPower(state, a) - landGarrisonPower(state, b))[0];
        if (softer && landGarrisonPower(state, softer) * ENEMY_RETREAT_POWER_RATIO < attack) {
          record.targetLandId = softer.id;
          record.retreatTicks = 0;
        } else {
          record.plan = 'withdrawing';
          record.pillaged = true; // reuses the existing withdraw-and-despawn path
        }
      }
    } else {
      record.retreatTicks = 0;
    }
  }
}

/**
 * One tick of enemy high command. Ascent only — empire keeps its ThreatDirector and its metronome.
 */
/**
 * The map rivals live their own curve (Dragon Ascent).
 *
 * Measured at Year 10: the player's on-map strength was 9,680 against 259–780 for every rival,
 * and every war appetite read exactly zero. Two causes, both structural. The rival kingdoms on
 * the map were static scenery — `runBotTurns` is deliberately not called in this mode, so their
 * lands never fortified and their hosts never grew, while the player compounded through the
 * trade network. And nothing converted the player's dominance into danger: appetite rose only
 * from low *opinion*, and a player who never touches anyone keeps everyone's opinion fine.
 * Being enormous was not itself a provocation, and it must be — it is the one provocation a
 * peaceful, successful run cannot avoid making.
 *
 * Three cheap mirrors of the player's own curve, run every fourth tick:
 *  - **They fortify.** A rival's provinces raise their walls and militia over time, so the
 *    "thực lực" the diplomacy screen shows actually climbs.
 *  - **Dominance is a provocation.** Appetite gains a term for the player's power relative to
 *    theirs, independent of opinion. Every court in the world discusses the realm that has
 *    grown twelve times anyone's size, however politely it has behaved.
 *  - **Fear becomes an army.** Appetite topping out launches a real punitive host, sized by
 *    the gap — and stamps the coalition clock, because frightened courts talk to each other.
 */
/**
 * The rivals take the ground the player leaves.
 *
 * See `RIVAL_CLAIM_INTERVAL_TICKS`. One crown settles one neutral district at a time, working
 * outward from what it already holds so the map fills as coherent realms rather than confetti,
 * and never past `RIVAL_CLAIM_MAX_SHARE` — there has to be ground left to contest and for
 * `launchOffMapInvasion` to muster on.
 *
 * Deliberately slow and deliberately visible: a district changing hands shows on the map and in
 * the World lane, where `getEmpirePower` has always read `state.lands` and until now found
 * nothing to read. The crowns the player has been ignoring become the crowns that own the map.
 */
function tickRivalExpansion(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent || state.turn % RIVAL_CLAIM_INTERVAL_TICKS !== 0) return;
  // Not while the player is still learning what a wave is.
  if (ascent.wave <= EARLY_WAVE_GRACE) return;

  const neutral = state.lands.filter((land) => land.ownerId === NEUTRAL_OWNER_ID);
  if (neutral.length === 0) return;
  const held = state.lands.filter(
    (land) => land.ownerId !== NEUTRAL_OWNER_ID && land.ownerId !== PLAYER_KINGDOM_ID,
  ).length;
  if (held >= state.lands.length * RIVAL_CLAIM_MAX_SHARE) return;

  // The hungriest crown that is not sworn to the player.
  const candidates = aggressors(state);
  if (candidates.length === 0) return;
  const taker = candidates.reduce((best, kingdom) => (
    aggressionPressure(state, kingdom) > aggressionPressure(state, best) ? kingdom : best
  ), candidates[0]);

  // Outward from its own ground where it has any; otherwise the district furthest from the
  // player's seat, so a crown's first holding is never on the player's doorstep.
  const mine = state.lands.filter((land) => land.ownerId === taker.id);
  let target: Land | undefined;
  if (mine.length > 0) {
    const frontier = new Set<string>();
    for (const land of mine) for (const id of land.neighbors) frontier.add(id);
    target = neutral.find((land) => frontier.has(land.id));
  }
  if (!target) {
    const seat = state.lands.find((land) => land.id === ascent.capitalLandId)
      ?? state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
    target = seat
      ? neutral.reduce((far, land) => (
        (land.x - seat.x) ** 2 + (land.y - seat.y) ** 2 > (far.x - seat.x) ** 2 + (far.y - seat.y) ** 2 ? land : far
      ), neutral[0])
      : neutral[0];
  }
  if (!target) return;

  target.ownerId = taker.id;
  target.loyalty = 80;
  pushToast(state, t('ascent.enemy.settles', { kingdom: taker.name, land: target.name }), 'threat');
}

function tickRivalRealms(state: GameState): void {
  const ascent = state.ascent;
  if (!ascent || state.turn % 4 !== 0) return;

  const playerOnMap = getPlayerTroops(state)
    + state.lands
      .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
      .reduce((sum, land) => sum + land.defense * 10, 0);

  for (const rival of state.kingdoms) {
    // A sworn crown keeps building its own provinces, but it stops wanting a war with you.
    if (isVassal(rival)) { rival.warAppetite = 0; continue; }
    if (rival.id === PLAYER_KINGDOM_ID || rival.isDefeated) continue;
    // **The courts hold no ground in this mode, and this whole director was dead because of it.**
    //
    // Ascent builds from `createEmpireGameState`, where the rivals are off-map Great Powers that
    // own no territory at all. So `holdings.length === 0` was true for every court on every pass,
    // this loop `continue`d four times a tick, and the entire dominance mirror below — the one
    // that makes the world notice a realm twelve times anyone's size — never once executed. The
    // player's report that relations and the rival empires do nothing was, again, literally true.
    //
    // Off-map courts arm through `GreatPowersSystem.tickGreatPowersYear` instead, so the fortify
    // pass is skipped for them and only the dominance read applies. On-map rivals (campaign,
    // where this file is also reachable) keep both.
    const holdings = state.lands.filter((land) => land.ownerId === rival.id);
    const offMap = holdings.length === 0;

    if (!offMap) {
      // Fortify: one province a pass raises its walls and drills its militia. Slow on purpose —
      // this is a curve, not a jump — but it compounds, which is exactly what was missing.
      const fortifying = holdings[state.turn % holdings.length];
      fortifying.defense = Math.min(90, fortifying.defense + 1);
      fortifying.localSoldiers = Math.min(1200, fortifying.localSoldiers + 12 + ascent.wavesSurvived * 2);
    }

    // Dominance. `getEmpirePower`-shaped units on both sides: troops plus walls-at-ten.
    const rivalOnMap = state.armies
      .filter((army) => army.kingdomId === rival.id)
      .reduce((sum, army) => sum + army.units.spearmen + army.units.archers + army.units.heavyInfantry, 0)
      // A court with no provinces still has a realm; `getEmpirePower` is the figure the World lane
      // already shows the player, so the comparison they can see is the comparison being made.
      + (offMap ? getEmpirePower(state, rival) : holdings.reduce((sum, land) => sum + land.defense * 10, 0));
    const ratio = playerOnMap / Math.max(120, rivalOnMap);

    if (ratio > 2) {
      // The gain is capped per pass. Left open, a tall realm (one province, a great standing
      // army) produced ratios in the hundreds — appetite filled in a single pass and every
      // rival launched a punitive host every fourth tick, a permanent siege that ground the
      // long run down to its capital. Capped, total dominance means a strike from *somewhere*
      // every dozen ticks or so, which is a world answering — not a world devouring.
      rival.warAppetite = Math.min(100, (rival.warAppetite ?? 0) + Math.min(4, (ratio - 2) * 1.2));
    } else {
      rival.warAppetite = Math.max(0, (rival.warAppetite ?? 0) - 0.5);
    }

    if ((rival.warAppetite ?? 0) >= 100) {
      rival.warAppetite = 45;
      const launched = launchPunitiveHost(state, rival.id, {
        conquest: true,
        sizeMult: Math.min(1.7, 0.9 + ratio * 0.1),
      });
      if (launched) {
        pushToast(state, t('ascent.world.dominanceStrike', { kingdom: rival.name }), 'threat');
        // Frightened courts talk to each other: dominance strikes pull the standing coalition
        // machinery forward rather than duplicating it.
        ascent.coalitionCooldownTicks = Math.max(0, ascent.coalitionCooldownTicks - 12);
      }
    }
  }
}

export function tickEnemyCommand(state: GameState): void {
  if (state.gameMode !== 'ascent' || !state.ascent) return;

  if (contactIsLive(state)) {
    state.ascent.lastContactTurn = state.turn;
  }

  tickRivalExpansion(state);
  tickRivalRealms(state);
  storyStrikes(state);
  maybeJoinTheWar(state);
  maybeLaunch(state);
  assignPlans(state);
  reconsider(state);
}
