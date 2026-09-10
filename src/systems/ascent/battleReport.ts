/**
 * Every engagement, written down and put in front of somebody.
 *
 * **The defect this exists for.** Measured over four 400-tick runs (~23 minutes of play each): a
 * run settles **20–96 engagements** and the battle screen opens for **6–15** of them. Everything
 * else reported itself to `state.message` and to `logEvent` — and Dragon Ascent runs
 * `ConquestUIScene`, which reads neither (`StorySystem` says so in as many words), while
 * `WhisperLine` renders only log entries carrying a story `ref`. So a province could be attacked,
 * hold, and be attacked again with no line, no mark and no card: the user report, verbatim —
 * *sometimes the enemy attacks my land but no fight is shown*. Across the same four runs on the
 * old code, **4–15 fights a run** reached the player at all.
 *
 * After: every engagement is filed, and the Reckoning's dispatch surfaces **12–42 a run** — one
 * card a wave, which is the cadence `raiseAftermath` was already written for.
 *
 * It was never a "one battle at a time" bug. One watched battle at a time is a deliberate design
 * (see `worthWatching` and `maybeRequestBattleDecision`); the bug is that the other engagements
 * were not *reported*, and the machinery to report them already existed and was starving. The
 * Reckoning's dispatch section — "Elsewhere" — was written for exactly this and, measured, came
 * back empty every time, because only fights that went through `finishBattle` ever reached
 * `battleHistory`.
 *
 * So the record is now written at the one choke point every settlement passes through, watched or
 * not, and `raiseAftermath`'s existing once-a-wave gate does the rationing.
 */
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { liveBattles } from './fronts';
import { provinceIsFalling } from '../LandSystem';
import type { AscentBattleRecord, GameState } from '../../state/types';

/** How many finished fights the run keeps. The dispatch reads back through them. */
const HISTORY_KEPT = 24;

/**
 * Files one finished engagement and, if it is the player's turn to hear about it, raises the card.
 *
 * The single entry point: `finishBattle` and `finishAssault` call it for the fights the player
 * watched, and `resolveInvaderBattle` calls it for every one they did not.
 */
export function recordEngagement(state: GameState, record: AscentBattleRecord): void {
  const ascent = state.ascent;
  if (!ascent) return;
  const history = (ascent.battleHistory ??= []);
  history.push(record);
  tallyBlood(state, record);
  tallyCommand(state, record);
  raiseAftermath(state);
  if (history.length > HISTORY_KEPT) history.splice(0, history.length - HISTORY_KEPT);
}

/**
 * The butcher's bill of the whole reign, kept as it is spent.
 *
 * `campaignScore.armiesDefeated` counted only hosts wiped out to the last man, which across a
 * long run is a handful — nothing that could stand as the line *this is what your dynasty did*.
 * Headcount is what the Reckoning wants and what a player recognises, and it is already in every
 * record; nobody was adding it up.
 */
/**
 * What each champion's command actually amounted to, kept as it happens.
 *
 * The Reckoning wanted to name the general who carried the reign — *list the heroes that stood
 * with you, and highlight the one who fought the most* — and the number was already in every
 * record and thrown away, exactly as the butcher's bill above it was. It could not simply be
 * counted at the end either: `battleHistory` is a ring capped at `HISTORY_KEPT`, so by the last
 * wave a long run has forgotten the first forty fights a founder led.
 *
 * Keyed by hero id rather than by host, because a champion outlives the armies they are given,
 * and kept on run state rather than on the `Hero` so a commander who dies still counted. Wins use
 * the same reading as `defencesHeld` above: the enemy routed, or was spent against us.
 */
function tallyCommand(state: GameState, record: AscentBattleRecord): void {
  const ascent = state.ascent;
  const heroId = record.generalHeroId;
  if (!ascent || !heroId) return;
  const tally = (ascent.commandTally ??= {});
  const entry = (tally[heroId] ??= { fought: 0, won: 0 });
  entry.fought += 1;
  if (record.outcome === 'they-rout' || record.outcome === 'spent') entry.won += 1;
}

function tallyBlood(state: GameState, record: AscentBattleRecord): void {
  const score = state.campaignScore;
  if (!score) return;
  score.enemySoldiersSlain = (score.enemySoldiersSlain ?? 0)
    + Math.max(0, Math.round(record.theirStart - record.theirEnd));
  score.ownSoldiersLost = (score.ownSoldiersLost ?? 0)
    + Math.max(0, Math.round(record.ourStart - record.ourEnd));
  score.engagements = (score.engagements ?? 0) + 1;
  const theirs = record.outcome === 'they-rout' || record.outcome === 'spent';
  if (record.role === 'defence' && theirs) score.defencesHeld = (score.defencesHeld ?? 0) + 1;
}

/**
 * Puts the fight that just ended in front of the player.
 *
 * Everything this card shows was already being written down and then thrown away: the butcher's
 * bill, what the field cost, whether the walls turned out, who held the line. The screen closed on
 * a strip of message text, so the most consequential thing in the mode ended by simply vanishing.
 *
 * It also gathers the fights the generals settled alone since the last card. Delegation is meant to
 * be a legitimate way to play, and a run-wide switch that makes two thirds of the war disappear
 * into silence is not that — it is a way of turning the game off.
 */
export function raiseAftermath(state: GameState): void {
  const ascent = state.ascent;
  const history = ascent?.battleHistory;
  if (!ascent || !history?.length) return;
  // The arena already returns to its own setup screen carrying the result. A card on top of that
  // would be the same news twice.
  if (ascent.arena) return;
  const record = history[history.length - 1];

  // A fight the generals fought alone does not stop the game to report itself.
  //
  // The first version raised a card for every finished fight and then tried to gather the
  // delegated ones underneath it — which could never find any, because each of them had already
  // raised and cleared its own card. Measured over a 260-tick run with two fights handed over,
  // every dispatch section came back empty.
  //
  // So a delegated fight waits. A fight the player watched carries the whole backlog with it, and
  // if the player is delegating everything the backlog still surfaces once a wave, which is what
  // stops a run-wide hand-over from turning the war silent.
  const from = Math.min(ascent.aftermathReported ?? 0, history.length);
  const backlog = history.slice(from, history.length - 1).filter((r) => r.delegated);
  if (record.delegated) {
    // And never over a live field. Silent engagements are settled all over the map while a
    // watched fight runs, and a dispatch about a province three provinces away must not take the
    // screen off the one the player is standing on. It simply waits in `battleHistory`: the next
    // call carries it, and the fight they are in collects the whole backlog when it ends — which
    // is the behaviour this function was already written for.
    if (liveBattles(state).length > 0) return;
    if (ascent.lastDispatchWave === ascent.wave) return;
    ascent.lastDispatchWave = ascent.wave;
  }
  ascent.pendingAftermath = { record, alsoFought: backlog };
  ascent.aftermathReported = history.length;
}

/** One province with an enemy host on it or beside it. */
export interface AscentFront {
  landId: string;
  landName: string;
  kingdomName: string;
  theirMen: number;
  ourMen: number;
  besieged: boolean;
  /**
   * The walls are carried and the flag has not turned yet — a *hostile* claim on ground still
   * ours. `besieged` is true for any claim including our own siege of someone else; this is the
   * one that means the player is losing this province right now, and it is what the board and the
   * province card label. See `hostileClaimAt`.
   */
  falling: boolean;
  /**
   * Seasons the walls hold before the host at them storms (`land.siege`), when one is standing
   * there. Distinct from `besieged`, which is the clock that runs *after* an assault is won.
   */
  assaultTicks?: number;
  /** True when a battle is actually being fought here, watched or held by a general. */
  live: boolean;
  /** True for the one live front the player is standing on — `ascent.activeBattle`. */
  commanded: boolean;
}

/**
 * Is the realm being attacked *right now*?
 *
 * The cheap form of `contestedFronts`, for the one caller that only needs the yes/no: the action
 * bar, which asks it on every state-changed emit. It early-returns on the first hostile thing it
 * finds instead of building a row for every one of them.
 *
 * **The defect it was written for.** The Battle button existed exactly while `ascent.activeBattle`
 * did — and `warBoard` was built on the premise that *"the button always leads somewhere while the
 * realm is under attack"*, which was never true, because the button was not on the bar to lead
 * anywhere. Reported verbatim: *the enemy attacked my capital, there was no Giao chiến icon, I
 * lost and do not know why.* A siege raises no watched battle — the besieger stops making contact
 * the moment it sits down under the walls — so from the bar's point of view the war had ended.
 *
 * Deliberately narrower than a front: a rival's standing army on its own ground next door is not
 * an attack, and lighting the bar for it would leave the button permanently on and permanently
 * meaningless. What counts is a hostile host on ground we hold, a siege on ground we hold, or a
 * host under invasion orders within one province of it.
 */
export function realmUnderAttack(state: GameState): boolean {
  if (liveBattles(state).length > 0) return true;
  const ours = new Set(state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .map((land) => land.id));
  if (ours.size === 0) return false;
  if (state.siegeOrders.some((order) => ours.has(order.landId))) return true;
  const invading = new Set((state.invasions ?? []).map((record) => record.armyId));
  for (const army of state.armies) {
    if (army.kingdomId === PLAYER_KINGDOM_ID || army.isLevy) continue;
    if (army.units.spearmen + army.units.archers + army.units.heavyInfantry <= 0) continue;
    if (ours.has(army.landId)) return true;
    if (!invading.has(army.id)) continue;
    const here = state.lands.find((land) => land.id === army.landId);
    if (here?.neighbors.some((id) => ours.has(id))) return true;
  }
  return false;
}

/**
 * Provinces the enemy is standing on or beside right now, worst first.
 *
 * The other half of the same defect. The dispatch says what *has* happened; nothing said what is
 * happening, so a wave striking three provinces at once looked, from the map, exactly like a wave
 * striking none. Derived rather than stored — a front is a fact about where the armies are, and a
 * stored copy of that is a copy that goes stale the moment one marches.
 */
export function contestedFronts(state: GameState): AscentFront[] {
  const ours = new Set(state.lands
    .filter((land) => land.ownerId === PLAYER_KINGDOM_ID)
    .map((land) => land.id));
  const fighting = new Set(liveBattles(state).map((battle) => battle.landId));
  const commandedLand = state.ascent?.activeBattle?.over === false
    ? state.ascent.activeBattle.landId : undefined;
  const byLand = new Map<string, { theirMen: number; kingdomName: string }>();

  for (const army of state.armies) {
    if (army.kingdomId === PLAYER_KINGDOM_ID || army.isLevy) continue;
    const men = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
    if (men <= 0) continue;
    const here = state.lands.find((land) => land.id === army.landId);
    if (!here) continue;
    // On our ground, or one step off it. Both are a front: the invader that makes contact spends
    // most of the fight standing on the *adjacent* province, which is the same reason
    // `beginBattle` has to enrol arrivals rather than read the tile it opened on.
    const touching = ours.has(here.id) ? here.id : here.neighbors.find((id) => ours.has(id));
    if (!touching) continue;
    const entry = byLand.get(touching) ?? {
      theirMen: 0,
      kingdomName: state.kingdoms.find((k) => k.id === army.kingdomId)?.name ?? army.kingdomId,
    };
    entry.theirMen += men;
    byLand.set(touching, entry);
  }

  /**
   * A field being fought is a front, whatever the army scan makes of it.
   *
   * The scan attributes each hostile host to *one* province — the one it stands on, or the first
   * neighbour of ours it touches — so two fights whose invaders share a neighbour collapsed into a
   * single row and the board listed one field while two were live. Observed directly: the board
   * saying "fighting on 1 of 1" over a run with a second general holding Hải Quận Nam.
   *
   * The battle's own headcounts are used rather than the tile's, because they are what the fight
   * is actually being decided on.
   */
  for (const battle of liveBattles(state)) {
    const entry = byLand.get(battle.landId);
    if (entry) {
      entry.theirMen = Math.max(entry.theirMen, Math.round(battle.theirNow));
      continue;
    }
    byLand.set(battle.landId, {
      theirMen: Math.round(battle.theirNow),
      kingdomName: battle.kingdomName,
    });
  }

  return [...byLand.entries()].map(([landId, entry]) => {
    const land = state.lands.find((candidate) => candidate.id === landId);
    // On a field being fought, the fight's own reading of our strength — it counts the levy that
    // turned out and the relief that marched in, which a tile scan of standing hosts does not.
    const fight = liveBattles(state).find((battle) => battle.landId === landId);
    // The militia is counted everywhere except on ground already being claimed, where it takes no
    // part on either side (`defenderPower`, `raiseGarrisonLevy`). Printing it there would promise
    // the player a garrison that will not turn out when they press the row.
    const falling = provinceIsFalling(state, landId);
    const ourMen = fight ? Math.round(fight.ourNow) : state.armies
      .filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && army.landId === landId)
      .reduce((n, army) => n + army.units.spearmen + army.units.archers + army.units.heavyInfantry, 0)
      + (falling ? 0 : land?.localSoldiers ?? 0);
    return {
      landId,
      landName: land?.name ?? landId,
      kingdomName: entry.kingdomName,
      theirMen: entry.theirMen,
      ourMen,
      besieged: state.siegeOrders.some((order) => order.landId === landId),
      falling,
      ...(land?.siege ? { assaultTicks: land.siege.ticksLeft } : {}),
      live: fighting.has(landId),
      commanded: landId === commandedLand,
    };
  })
    // The field under your own hand first, then the ones being held for you, then the ground
    // nobody is fighting on yet — worst odds first within each band.
    .sort((a, b) => (Number(b.commanded) - Number(a.commanded))
      || (Number(b.live) - Number(a.live))
      || (Number(b.besieged) - Number(a.besieged))
      || (b.theirMen / Math.max(1, b.ourMen)) - (a.theirMen / Math.max(1, a.ourMen)));
}
