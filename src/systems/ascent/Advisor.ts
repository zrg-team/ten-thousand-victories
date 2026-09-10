import type { GameState } from '../../state/types';
import type { TranslationKey } from '../../i18n';
import {
  AMBITION_DECAY_PER_WAVE,
  AMBITION_HEAT_MAX,
  TREASURY_GRAFT_RATE,
  STORE_WASTE_RATE,
  CAPITAL_GRACE_TICKS,
  WAVE_BASELINE_GROWTH,
  WAVE_GRACE_TICKS,
} from '../../game/ascentConfig';
import { formatNumber } from '../../utils/format';
import { treasuryGraftFrom } from './priceScale';
import { STORE_KEYS, marketCapacity, storeWasteFrom } from './GranarySystem';
import { resourceLabel } from '../../i18n';
import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { heatFor } from './AmbitionSystem';
import { contestedFronts } from './battleReport';
import { landSupply } from './SupplySystem';

/**
 * The in-run advisor: what the numbers mean, and what to do about them.
 *
 * **Why this exists.** Dragon Ascent runs itself and asks the player questions, and the questions
 * are answerable only if you know what the band at the top is telling you. It shows POWER, THREAT,
 * a verdict and an ambition multiplier, and every one of those is a number the player is expected
 * to *act on* — but nothing on that band, or anywhere else in the run, says which way to act. A
 * manual on the front page cannot help here either: by the time it matters the player is eleven
 * waves into a run and the page is two scenes away.
 *
 * So this reads the live state and says one thing. Not a tutorial that plays once and retires —
 * a standing reading of the run that stays useful at wave 40, because at wave 40 the question is
 * still "am I behind, and what do I do about it".
 *
 * **The rules it follows, and they are rules rather than taste:**
 *
 * - *Say the number.* Every line quotes the figure it is about. "Your defence is weak" is an
 *   opinion; "THREAT 1,240 against a defence of 890" is the thing the player can check against
 *   the band and learn to read for themselves. The advisor's job is to make itself unnecessary.
 * - *Name the lever.* A tip that describes a problem without saying which screen fixes it has
 *   moved the work rather than done it. Every piece of advice above `calm` carries an action.
 * - *One at a time.* A list of six things to worry about is a list nobody reads. The ranking is
 *   total and the strip shows the top of it.
 * - *Never lie to flatter.* The verdict compares THREAT against `defensePower` — what can
 *   actually fight — and not against POWER, which includes a treasury that will not hold a wall.
 *   This is the same comparison `AscentHud` colours the figure by, deliberately: two readouts of
 *   the same situation that disagreed would be worse than either alone.
 *
 * Phaser-free by the same rule as every other system here, which is what lets a harness run
 * hundreds of ticks and assert what the advisor said at each one.
 */
export type AdviceTone = 'urgent' | 'chance' | 'calm';

export interface Advice {
  id: string;
  tone: AdviceTone;
  /** Higher speaks first. Ties are impossible: every rule below has its own number. */
  priority: number;
  /** The one line the strip shows. */
  line: TranslationKey;
  /** The paragraph behind it: what the number means and why it is being raised now. */
  body: TranslationKey;
  /** Interpolated into both, so a line and its explanation can never quote different figures. */
  params: Record<string, string | number>;
  /**
   * The screen that answers it, as an action-bar key.
   *
   * `undefined` means there is nothing to press — the advice is a reading rather than a task, and
   * offering a button that goes somewhere unrelated would be worse than offering none.
   */
  lane?: string;
}

/** Percentage, rounded, for the prose. */
const pct = (value: number): number => Math.round(value * 100);

/**
 * Everything true about the run right now, ranked.
 *
 * Returns all of them rather than just the winner: the strip shows the top one, and a harness
 * asserting "the advisor noticed the treasury" should not have to arrange for that to be the
 * single most urgent thing in the realm.
 */
export function adviseAscent(state: GameState): Advice[] {
  const ascent = state.ascent;
  if (!ascent) return [];
  const advice: Advice[] = [];
  const add = (entry: Advice) => advice.push(entry);

  // ── The seat is gone, and the clock is running ───────────────────────────
  // Above everything, including a fight, because it is the only reading in the mode with a
  // *terminal* deadline: `checkAscentDefeat` ends the run when the grace expires. It used to
  // announce itself through `pushToast` alone — and `WhisperLine`, this mode's only reader of
  // that channel, renders nothing without a story `ref`. So the dynasty's last seasons were
  // literally unannounced: the reported case, verbatim, *I lost and do not know why*.
  if ((ascent.capitalLostTicks ?? 0) > 0) {
    const seat = state.lands.find((candidate) => candidate.id === ascent.capitalLandId);
    add({
      id: 'capital-lost',
      tone: 'urgent',
      priority: 106,
      line: 'advice.capitalLost.line',
      body: 'advice.capitalLost.body',
      params: {
        land: seat?.name ?? '',
        ticks: Math.max(0, CAPITAL_GRACE_TICKS - ascent.capitalLostTicks),
      },
      lane: 'army',
    });
  }

  // ── A siege is running on ground we still hold ───────────────────────────
  // A siege raises no watched battle: the besieger sits down under the walls and stops making
  // contact, so `beginBattle` is never asked and nothing on the map moves. The badge over the
  // province was the only thing that said so, and it says it in two digits — the seat was taken
  // at 5/6 with the run's owner watching a different field.
  const sieges = state.siegeOrders.filter((order) => (
    state.lands.some((land) => land.id === order.landId && land.ownerId === PLAYER_KINGDOM_ID)));
  if (sieges.length > 0) {
    // The seat first, whatever the clocks say: losing it ends the run and losing anything else
    // does not.
    const worst = sieges.slice().sort((a, b) => (
      (Number(b.landId === ascent.capitalLandId) - Number(a.landId === ascent.capitalLandId))
      || ((b.required - b.progress) - (a.required - a.progress))))[0];
    const land = state.lands.find((candidate) => candidate.id === worst.landId);
    const seat = worst.landId === ascent.capitalLandId;
    add({
      id: seat ? 'capital-besieged' : 'besieged',
      tone: 'urgent',
      priority: seat ? 104 : 96,
      line: seat ? 'advice.capitalSiege.line' : 'advice.besieged.line',
      body: seat ? 'advice.capitalSiege.body' : 'advice.besieged.body',
      params: {
        land: land?.name ?? '',
        ticks: Math.max(1, worst.required - worst.progress),
        n: sieges.length,
      },
      // The war lane, not the army lane. This advice is about a province being taken, and the
      // answer to it — walk onto the field against the occupier, or call the neighbours in — lives
      // on that province's front sheet. The army lane is a list of hosts, which is a step further
      // from the order than the advice implies.
      lane: 'battle',
    });
  }

  /**
   * ── A province of ours has no road home ──────────────────────────────────
   *
   * The consequence is large — 45% of what it makes, and a trade network cut down to whatever is
   * stranded with it — and the cause is a thing that happened somewhere else entirely: a district
   * between it and the seat changed hands. The toast fires on the tick it happens and then it is
   * gone, so this is what remains standing while the realm is still cut in two.
   *
   * Below the sieges deliberately. A siege has a deadline the player can miss; a severed province
   * is expensive but not urgent, and ranking it above a wall clock would push the one piece of
   * advice with a countdown off the strip.
   */
  const stranded = state.lands.filter((land) => (
    land.ownerId === PLAYER_KINGDOM_ID && landSupply(state, land.id).cutOff));
  if (stranded.length > 0) {
    // The richest of them: it is the one whose shortfall the player is actually paying for, and
    // naming the biggest loss makes the size of the problem legible from the line alone.
    const worst = stranded.slice().sort((a, b) => (
      (b.outputs.food + b.outputs.supplies + b.outputs.gold)
      - (a.outputs.food + a.outputs.supplies + a.outputs.gold)))[0];
    add({
      id: 'supply-cut',
      tone: 'urgent',
      priority: 88,
      line: 'advice.supplyCut.line',
      body: 'advice.supplyCut.body',
      params: { land: worst.name, n: stranded.length },
      // The map lane: the answer is a province to retake or claim, and that is a thing chosen on
      // the board rather than off a list of hosts.
      lane: 'build',
    });
  }

  /**
   * ── A host is at the walls and has not tried them yet ────────────────────
   *
   * The one piece of advice in this list that names an action with a *deadline the player can
   * still beat*. `land.siege` exists precisely so that "march a host to the province under
   * attack" is an order that can arrive in time, and an advisor that did not say the clock was
   * running would have left the window shut for exactly the players it was built for.
   *
   * Above `front` and below the seat's own troubles: it is more urgent than a contested border
   * (something is about to happen there) and less urgent than the dynasty ending.
   */
  const atTheWalls = state.lands.filter((land) => (
    land.ownerId === PLAYER_KINGDOM_ID && land.siege !== undefined && land.siege.ticksLeft > 0));
  if (atTheWalls.length > 0) {
    // Fewest seasons left first — the one that can still be reached and is about to stop being
    // reachable. The seat jumps the queue for the same reason it does everywhere else.
    const worst = atTheWalls.slice().sort((a, b) => (
      (Number(b.id === ascent.capitalLandId) - Number(a.id === ascent.capitalLandId))
      || ((a.siege?.ticksLeft ?? 0) - (b.siege?.ticksLeft ?? 0))))[0];
    add({
      id: 'walls',
      tone: 'urgent',
      priority: 98,
      line: 'advice.walls.line',
      body: 'advice.walls.body',
      params: {
        land: worst.name,
        kingdom: worst.siege?.kingdomName ?? '',
        ticks: worst.siege?.ticksLeft ?? 0,
        n: atTheWalls.length,
      },
      lane: 'army',
    });
  }

  // ── A fight is happening ─────────────────────────────────────────────────
  // Above everything, and it is the one piece of advice with a deadline: the beats run on the
  // world's clock whether or not anybody is watching, so a player reading this later has already
  // missed the part they could have changed.
  if (ascent.activeBattle) {
    const land = state.lands.find((candidate) => candidate.id === ascent.activeBattle?.landId);
    add({
      id: 'siege',
      tone: 'urgent',
      priority: 100,
      line: 'advice.siege.line',
      body: 'advice.siege.body',
      params: { land: land?.name ?? '' },
      lane: 'battle',
    });
  }

  // ── An enemy is on our ground and nobody is fighting them ────────────────
  // The other half of the same silence. `contestedFronts` has always known about these — the war
  // board is built out of it — but nothing ever said the board had something in it, so a wave
  // that struck a province the odds roll settled looked, from the map, like a quiet season.
  if (!ascent.activeBattle) {
    const fronts = contestedFronts(state).filter((front) => !front.besieged);
    const front = fronts[0];
    if (front) {
      add({
        id: 'front',
        tone: front.theirMen > front.ourMen ? 'urgent' : 'chance',
        priority: 94,
        line: 'advice.front.line',
        body: 'advice.front.body',
        params: {
          land: front.landName,
          kingdom: front.kingdomName,
          theirs: formatNumber(front.theirMen),
          ours: formatNumber(front.ourMen),
          n: fronts.length,
        },
        lane: 'battle',
      });
    }
  }

  // ── The opening ──────────────────────────────────────────────────────────
  // The single most wasted stretch of a run. Nothing attacks for the first ten seasons and a new
  // player spends them waiting, because nothing says they are free.
  if (ascent.wave === 0 && ascent.ticksToWave > 0) {
    add({
      id: 'opening',
      tone: 'calm',
      priority: 95,
      line: 'advice.opening.line',
      body: 'advice.opening.body',
      params: { ticks: ascent.ticksToWave, grace: WAVE_GRACE_TICKS },
      lane: 'build',
    });
  }

  // ── Am I going to survive the next wave ──────────────────────────────────
  // Against `defensePower`, the same figure the HUD colours the THREAT number by. See the class
  // note: two readouts of one situation must not disagree.
  const defence = ascent.defensePower;
  const ratio = defence > 0 ? ascent.threat / defence : 99;
  const heat = heatFor(ascent.ambition);
  /**
   * Whether the realm has stopped growing, which `ambition-cold` below reports.
   *
   * Named here because `ahead` has to know about it. Both rules end in "go and take something",
   * and a strip that says the same thing in two different sentences on two consecutive ticks
   * reads as two different pieces of advice — the player looks for the second thing to do and
   * there isn't one. `ambition-cold` is the better of the two, because it says *why* standing
   * still loses rather than only that there is room, so it wins and `ahead` stands down.
   */
  const stalled = heat <= 1.15 && ascent.wave >= 3;
  if (ascent.wave > 0 && ratio >= 1.1) {
    add({
      id: 'behind',
      tone: 'urgent',
      priority: 90,
      line: 'advice.behind.line',
      body: 'advice.behind.body',
      params: {
        threat: formatNumber(ascent.threat),
        defence: formatNumber(defence),
        ticks: ascent.ticksToWave,
      },
      lane: 'army',
    });
  } else if (ascent.wave > 0 && ratio < 0.7 && !stalled) {
    add({
      id: 'ahead',
      tone: 'chance',
      priority: 30,
      line: 'advice.ahead.line',
      body: 'advice.ahead.body',
      params: { threat: formatNumber(ascent.threat), defence: formatNumber(defence) },
      lane: 'affairs',
    });
  }

  // ── The named wave ───────────────────────────────────────────────────────
  if (ascent.bossTelegraphed) {
    add({
      id: 'boss',
      tone: 'urgent',
      priority: 88,
      line: 'advice.boss.line',
      body: 'advice.boss.body',
      params: { ticks: ascent.ticksToWave },
      lane: 'army',
    });
  }

  // ── The larder ───────────────────────────────────────────────────────────
  // Quoted in seasons of grain left rather than in a rate, because a rate is a number and a
  // countdown is a decision. Only raised once the store is genuinely short: an early realm runs a
  // small deficit constantly and a warning that is always on is a warning nobody reads.
  const foodRate = state.resourceRates.food;
  if (foodRate < 0) {
    const seasonsLeft = Math.floor(state.resources.food / -foodRate);
    if (seasonsLeft <= 12) {
      add({
        id: 'starving',
        tone: 'urgent',
        priority: 80,
        line: 'advice.starving.line',
        body: 'advice.starving.body',
        params: { seasons: seasonsLeft, rate: formatNumber(-foodRate), food: formatNumber(state.resources.food) },
        lane: 'build',
      });
    }
  }

  // ── Ambition, both ways ──────────────────────────────────────────────────
  // The mode's central dial, and the one thing a player will not work out unaided, because both
  // of its arcs are invisible: growth is charged now and billed at the next wave, and standing
  // still is charged nothing and still loses.
  if (heat >= 2.4) {
    add({
      id: 'ambition-hot',
      tone: 'urgent',
      priority: 72,
      line: 'advice.ambitionHot.line',
      body: 'advice.ambitionHot.body',
      params: {
        mult: heat.toFixed(1),
        max: AMBITION_HEAT_MAX.toFixed(1),
        shed: pct(AMBITION_DECAY_PER_WAVE),
      },
      lane: 'army',
    });
  } else if (stalled) {
    add({
      id: 'ambition-cold',
      tone: 'chance',
      priority: 62,
      line: 'advice.ambitionCold.line',
      body: 'advice.ambitionCold.body',
      params: {
        mult: heat.toFixed(1),
        growth: pct(WAVE_BASELINE_GROWTH - 1),
      },
      lane: 'affairs',
    });
  }

  // ── The treasury ─────────────────────────────────────────────────────────
  // Gold above the graft line evaporates, and it does so quietly. A player watching a number climb
  // has no way to know it is also being skimmed.
  const graftFrom = treasuryGraftFrom(state);
  if (state.resources.gold > graftFrom) {
    add({
      id: 'gold-rot',
      tone: 'chance',
      priority: 68,
      line: 'advice.goldRot.line',
      body: 'advice.goldRot.body',
      params: {
        gold: formatNumber(state.resources.gold),
        from: formatNumber(graftFrom),
        rate: pct(TREASURY_GRAFT_RATE),
        lost: formatNumber((state.resources.gold - graftFrom) * TREASURY_GRAFT_RATE),
      },
      lane: 'affairs',
    });
  }

  // ── The stores ───────────────────────────────────────────────────────────
  // Grain that rots is grain the player could have sold, fed to a host, or not grown at all. The
  // waste figure is in the ledger; the strip says it once, for the store losing the most.
  const waste = state.ascentLedger?.waste;
  if (waste) {
    const worst = [...STORE_KEYS].sort((a, b) => waste[b] - waste[a])[0];
    if (waste[worst] > 0) {
      add({
        id: 'store-rot',
        tone: 'chance',
        priority: 66,
        line: 'advice.storeRot.line',
        body: marketCapacity(state) > 0 ? 'advice.storeRot.body' : 'advice.storeRot.bodyNoMarket',
        params: {
          resource: resourceLabel(worst),
          held: formatNumber(state.resources[worst]),
          from: formatNumber(storeWasteFrom(state, worst)),
          rate: pct(STORE_WASTE_RATE),
          lost: formatNumber(waste[worst]),
        },
        lane: 'build',
      });
    }
  }

  // ── Unspent authority ────────────────────────────────────────────────────
  const points = state.mandate?.edictPoints ?? 0;
  if (points > 0) {
    add({
      id: 'edicts',
      tone: 'chance',
      priority: 58,
      line: 'advice.edicts.line',
      body: 'advice.edicts.body',
      params: { points },
      lane: 'court',
    });
  }

  // ── What the court costs ─────────────────────────────────────────────────
  // Read off the ledger rather than recomputed: `heroPayroll` is moved by two decrees that pull in
  // opposite directions, and a second implementation of it here would drift from the real one and
  // quote a number the books disagree with.
  const gold = state.ascentLedger?.gold;
  const payroll = state.ascentLedger?.goldParts?.payroll ?? 0;
  if (gold && gold.gross > 0 && payroll > gold.gross * 0.55) {
    add({
      id: 'payroll',
      tone: 'chance',
      priority: 52,
      line: 'advice.payroll.line',
      body: 'advice.payroll.body',
      params: { pct: pct(payroll / gold.gross), payroll: formatNumber(payroll) },
      lane: 'heroes',
    });
  }

  // ── Nothing is wrong ─────────────────────────────────────────────────────
  // A strip that empties has broken its promise: the player learns it is sometimes there and
  // sometimes not, and stops looking. The steady reading is always available and always last.
  add({
    id: 'steady',
    tone: 'calm',
    priority: 0,
    line: 'advice.steady.line',
    body: 'advice.steady.body',
    params: {
      wave: ascent.wave,
      ticks: ascent.ticksToWave,
      power: formatNumber(ascent.power),
      threat: formatNumber(ascent.threat),
    },
  });

  return advice.sort((a, b) => b.priority - a.priority);
}

/** The one the strip shows. Never undefined — `steady` is always in the list. */
export function topAdvice(state: GameState): Advice | undefined {
  return adviseAscent(state)[0];
}
