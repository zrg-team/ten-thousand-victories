import type { HexTile, MapGenConfig } from '../map/hexMapGenerator';
import type { WaveShapeId } from '../game/ascentConfig';
// Type-only both ways — `formations.ts` imports `ArmyComposition` from here — so the cycle is
// erased at compile and there is no runtime edge in either direction.
import type { BattleFormation } from '../data/ascent/formations';

export type ResourceKey = 'food' | 'supplies' | 'gold' | 'humans';

export type LandType = 'castle' | 'farm' | 'market' | 'iron' | 'temple' | 'enemyCastle' | 'wilderness';

export type LandBuildingType =
  | 'farm' | 'mine' | 'market' | 'wall' | 'tower' | 'barracks' | 'communalHall'
  // Era-unlocked advanced districts (empire mode): new economic levers that only become
  // available as the realm advances, so later eras genuinely expand what you can build.
  | 'harbor' | 'workshop' | 'guild' | 'university';

/**
 * A province's economic focus. Chosen by the player to tilt a district hard toward one
 * role (with a trade-off elsewhere), so each land becomes a live decision rather than a
 * uniform build queue. `balanced` is the neutral default.
 *
 * `garrison` is offered in Dragon Ascent only, and `fortress` means something different there:
 * see `ASCENT_FOCUS_MULT` in `ResourceSystem`. The classic modes keep the original six and the
 * original numbers.
 */
export type LandSpecialization =
  | 'balanced' | 'breadbasket' | 'mining' | 'trade' | 'populous' | 'fortress' | 'garrison';

/**
 * Realm-wide tax stance — a live "guns vs. butter" lever. Heavier taxes fill the treasury
 * but cost stability and slow population growth; a lenient hand does the reverse.
 */
export type TaxPolicy = 'lenient' | 'balanced' | 'harsh';

/** A constructed building on a district: its type and current upgrade level. */
export interface LandBuildingInstance {
  type: LandBuildingType;
  level: number;
}

export type MapRenderMode = 'terrain' | 'control';

export type HeroType = 'general' | 'governor' | 'minister' | 'agent';

export type UnitType = 'militia' | 'spearmen' | 'archers' | 'crossbowmen' | 'heavyInfantry' | 'lightCavalry' | 'royalGuard' | 'warElephants' | 'siegeEngine' | 'riverMarines';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export type KingdomPersonality =
  | 'player'
  | 'aggressive'
  | 'defensive'
  | 'economic'
  | 'diplomatic'
  | 'expansionist';

export interface ResourceBag {
  food: number;
  supplies: number;
  gold: number;
  humans: number;
}

export interface TerrainSummary {
  plains: number;
  fields: number;
  riceFields: number;
  forest: number;
  mountains: number;
  hills: number;
  water: number;
  fortress: number;
  shrine: number;
}

export interface Land {
  id: string;
  name: string;
  type: LandType;
  ownerId: string;
  /** Centroid of this land's hex tiles, computed at map generation time. */
  x: number;
  y: number;
  defense: number;
  /**
   * Đồn điền has already stood this province up as a colony (defense ×1.5, once). Without the
   * flag the colony bonus compounded every tick — measured: ×1.5 a tick from tick 82 of a run,
   * power at 1e99 by tick 600, the threat gauge meaningless for the rest of the run.
   */
  colonised?: boolean;
  loyalty: number;
  neighbors: string[];
  buildings: LandBuildingInstance[];
  buildingCapacity: number;
  terrainSummary: TerrainSummary;
  outputs: ResourceBag;
  isVisible: boolean;
  isExplored: boolean;
  special: string;
  /** People living here. Gained as humans resource on acquisition. */
  population: number;
  /** Local militia strength. Drives noble power and affects all acquisition methods. */
  localSoldiers: number;
  /** Whether a settled community exists. Gates which acquisition methods are available. */
  hasVillage: boolean;
  /** Per-kingdom trust (0–100). Defaults to 40 when not set. */
  trust: Record<string, number>;
  /** Player-chosen economic focus for this province. Absent = 'balanced'. */
  specialization?: LandSpecialization;
  /** Season the focus was last set (Dragon Ascent), so a fresh choice is given time to work. */
  focusSetTurn?: number;
  /**
   * How far this province actually obeys the throne's standing law, 0–100 (empire/ascent only).
   *
   * Not the same thing as `loyalty`, and the difference is the point: loyalty is whether they want
   * you as their ruler, compliance is whether they carry out your decrees. A province can adore the
   * dynasty and still ignore a land survey — *phép vua thua lệ làng*, the king's rule loses to the
   * village's custom.
   *
   * Optional so saves written before the decree system need no migration; read it through
   * `landCompliance()` in `DecreeSystem`, which defaults it to `BASE_COMPLIANCE`.
   */
  compliance?: number;
  /**
   * Walls knocked down in a fought defence, waiting to be rebuilt (ascent only).
   *
   * A breach counter rather than a stored undamaged figure, because `defense` has a dozen additive
   * writers — fortify purchases, hero arrivals, decrees, stories — and every one of them has to
   * keep composing. `dissolveGarrisonLevies` subtracts the breach from `defense` and records it
   * here; `repairProvincialDefence` walks it back a little each season.
   */
  wallsBreached?: number;
  /**
   * The turn this province's garrison levy last went home (ascent only). Militia does not begin
   * regrowing until `MILITIA_REGROW_DELAY` seasons after that — a district that has just been
   * fought over is not raising a fresh watch the same afternoon.
   */
  levyReturnedTurn?: number;
  /**
   * A host is at the walls and has not tried them yet (ascent only).
   *
   * The siege clock, and the reason a relief march is a verb. An invader used to arrive and
   * resolve the assault on the same tick, so "march a host to the province under attack" was an
   * order that could never arrive in time — the fight was over before the muster screen closed.
   * Now the walls hold for `ceil(defense / SIEGE_DEFENSE_PER_TICK)` seasons and the player has a
   * window to muster, march and be counted in the roll.
   *
   * Distinct from `state.siegeOrders`, which is the clock that runs *after* an assault is won and
   * flips the flag. This one runs *before* the assault. Optional so saves written before it need
   * no migration; see `tickSieges` in InvasionSystem, which is the only writer.
   */
  siege?: LandSiege;
  /**
   * The invasion wave during which this province was last lost (ascent only).
   *
   * Stamped by `detectConquests` and read by `retakeBonus` — the attacker's edge that makes
   * `lose -> muster -> take it back` a loop rather than a one-way ratchet. Cleared on retake.
   */
  lostAtWave?: number;
  /**
   * How spent the province's turnout is, 0..1 (ascent only).
   *
   * The men behind the walls after a fought defence: wounded, scattered, burying the dead. Raised
   * by `dissolveGarrisonLevies` by the share of the turnout that fell and worked back to zero over
   * `GARRISON_RECOVER_SEASONS` by `recoverGarrison`. Scales the walls' term of the next turnout and
   * of the hidden roll alike (`raiseGarrisonLevy`, `landGarrisonPower`), so the fought fight and
   * the roll keep agreeing. Separate from `wallsBreached`, which is the masonry and heals slower.
   */
  garrisonExhaustion?: number;
  /**
   * Building levels a fought defence knocked down, by type, waiting to be rebuilt (Dragon
   * Ascent). Each entry is one level taken off one building of that type; `rebuildRuins` puts
   * them back a level at a time, or the restore card pays to put them back at once. A list rather
   * than a count so the rebuild knows *what* was burnt.
   */
  ruins?: LandBuildingType[];
  /** The wave the restore card was last raised for this province, so one fight asks once. */
  restoreAskedWave?: number;
  /** Turn until which the province rebuilds at treble pace — a `steady` restore was paid for. */
  restoreHasteUntil?: number;
}

/** A host standing at a province's walls, waiting out the siege clock before it assaults. */
export interface LandSiege {
  /** The invader that opened the clock. Other hosts arriving later wait out the same one. */
  attackerId: string;
  kingdomId: string;
  kingdomName: string;
  /** Seasons the walls still hold. At zero the assault resolves on the next invasion step. */
  ticksLeft: number;
  /** What the clock was set to, so a badge can draw progress rather than a bare countdown. */
  ticks: number;
  /** The turn the walls were invested, so an arrival can be told from a host that never left. */
  openedTurn?: number;
  /**
   * Ids of our hosts already standing here when the clock opened.
   *
   * The relief reward is for a march that arrived. Without this a garrison that never moved was
   * paid for being where it already was, once per assault cycle, for as long as the siege ran.
   */
  presentAtOpen?: string[];
  /**
   * Set once a field host of ours *arrives* after the walls were invested — the relief reward is
   * paid on that edge, once per siege, and is deliberately not cleared when the clock renews.
   */
  relieved?: boolean;
}

/** Authored land data before hex-map generation fills in position/adjacency. */
export type LandTemplate = Omit<Land, 'x' | 'y' | 'neighbors' | 'buildingCapacity' | 'terrainSummary' | 'outputs' | 'isVisible' | 'isExplored' | 'population' | 'localSoldiers' | 'hasVillage' | 'trust'>;

export type GameMode = 'rival' | 'campaign' | 'empire' | 'ascent';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'ironman';

/** A pausing intelligence alert — a spy/agent warns of an incoming attack so the player can act. */
export interface ThreatAlert {
  id: string;
  kind: 'incoming' | 'coalition' | 'vassalage';
  kingdomId: string;
  kingdomName: string;
  warlordName?: string;
  /** Seasons of lead time before the host musters. */
  turns: number;
  /** How the host compares to the player's defensible strength: 'weaker' | 'even' | 'stronger'. */
  strength: 'weaker' | 'even' | 'stronger';
}

/** A field engagement awaiting the player's tactical call. */
export interface PendingBattle {
  /**
   * Which side of the field is ours (Dragon Ascent). Absent means a defence — the original and
   * only shape: an invader striking ground we hold. `offence` is a host of ours storming
   * someone else's province, staged by `stageWatchedAssault`; `invaderArmyId` is then empty and
   * `attackerArmyIds` names our hosts.
   */
  role?: 'defence' | 'offence';
  attackerArmyIds?: string[];
  invaderArmyId: string;
  landId: string;
  landName: string;
  kingdomId: string;
  kingdomName: string;
  isGreat: boolean;
  /** Pre-computed odds so the decision screen can show the stakes. */
  attackerPower: number;
  defenderPower: number;
  /**
   * No field host stands here — the province is defending itself (Throne of Empires).
   *
   * The decision is the same three verbs, but they mean different things and the screen says so:
   * there is no general to delegate to and no army to withdraw, so "charge / delegate / retreat"
   * would be describing a host that is not on the field. Sally, hold, or open the gates.
   */
  garrisonOnly?: boolean;
  /** Men of the province's own watch, for the screen to name. */
  militia?: number;
}

/** An off-map empire's army marching on the realm (empire mode). Keyed to an `Army.id`. */
export interface InvasionRecord {
  armyId: string;
  kingdomId: string;
  /** 'raid' pillages a border district then withdraws; 'conquest' besieges to capture land. */
  intent: 'raid' | 'conquest';
  /** Land the host is currently marching toward. */
  targetLandId?: string;
  /**
   * What this host is trying to do, assigned when it spawns (Dragon Ascent).
   *
   * `spearhead` goes for the most valuable province, `flanker` for the weakest-held one — and each
   * `hunter` marches at the player's largest field host instead of at any province, re-reading
   * where it stands every tick, which is the one shape a realm cannot answer by garrisoning.
   * flanker picks a different target so a coalition genuinely spreads out rather than queueing
   * down one road. `raider` pillages a border province and withdraws. `withdrawing` is the state a
   * host enters when it decides it cannot win the fight in front of it.
   *
   * Optional so it round-trips through the save with no migration; hosts without one fall back to
   * the original capital-or-nearest behaviour.
   */
  plan?: 'spearhead' | 'flanker' | 'raider' | 'hunter' | 'withdrawing';
  /** Ticks the host has wanted to withdraw. Hysteresis, so a host does not oscillate. */
  retreatTicks?: number;
  /** Set once a raider has pillaged; it then turns for the map edge and despawns. */
  pillaged?: boolean;
  /** Edge land a withdrawing raider heads back to before despawning. */
  exitLandId?: string;
  /** Part of a telegraphed Great Invasion (boss coalition); yields larger spoils. */
  great?: boolean;
  /**
   * Ticks this host's court can keep it in the field before calling it home.
   *
   * The mechanism that makes an invasion an *event* rather than a permanent condition. Counted
   * down every tick the host is on the map and refilled by success — taking a province is worth
   * `CAMPAIGN_TICKS_ON_CAPTURE`, sacking one less, a won field battle less again — so a war that
   * is going well sustains itself and one that stalls at the walls starves. At zero the host sets
   * `plan = 'withdrawing'` and leaves by the path a spent raider already uses.
   *
   * Before this, nothing anywhere read an invader's supply: `progressArmyLogistics` opens with
   * `if (army.kingdomId !== PLAYER_KINGDOM_ID) continue;`, so the `rations` and `provisions`
   * written onto every spawned host were decorative and a conquest host that could win simply
   * marched for ever at zero upkeep.
   *
   * Optional so it round-trips through an old save; a record without one is topped up on its
   * first tick rather than being treated as already spent.
   */
  campaignTicks?: number;
  /**
   * Men this host mustered with, so "how spent is it" can be asked without guessing.
   *
   * Read by the regroup rule below and by the withdrawal check: a host reduced to a fraction of
   * what it marched with has been beaten, whatever its orders say, and grinding on against the
   * same walls every single season is not a war — it was measured as six consecutive assaults on
   * one province at 796, 387, 178, 74, 25 and 14 battle power, each one of them a separate
   * decision put to the player.
   */
  mustered?: number;
  /**
   * Share of this host's strength already taken by provinces it marched *past* rather than took.
   *
   * Kept on the record rather than derived, because "how much has this column bled on the road"
   * cannot be read back off `army.units` — a host also loses men to battles, and the campaign
   * ceiling (`PASSING_CAMPAIGN_MAX`) is about the road alone. Optional so it round-trips through
   * a save written before the frontier could touch a passing column at all.
   */
  passingLoss?: number;
  /**
   * Turn from which this host may attack again after being thrown back.
   *
   * A repulsed host does not re-form and charge the same gate the following morning. Two seasons
   * of hysteresis, which is also what stops one lost battle becoming a prompt every tick until
   * the host is annihilated.
   */
  regroupUntil?: number;
}

export interface KingdomKing {
  name: string;
  personality: KingdomPersonality;
  age: number;
}

export interface CampaignConfig {
  seaSides: 0 | 1 | 2 | 3;
  difficulty: Difficulty;
  /** Optional dynasty founder chosen at setup (empire mode) — a starting Legendary hero. */
  founderId?: string;
}

export interface CampaignScore {
  turnsAlive: number;
  armiesDefeated: number;
  largestArmyDefeated: number;
  peakLandsHeld: number;
  /**
   * The butcher's bill of the whole reign, both ways, in men rather than in hosts.
   *
   * All four are optional because a save written before the Reckoning asked for them has none of
   * them; every reader defaults to 0. Kept by `recordEngagement`, which every settled fight now
   * passes through — watched or delegated, defence or assault.
   */
  enemySoldiersSlain?: number;
  ownSoldiersLost?: number;
  /** Engagements settled, of any kind. `armiesDefeated` counts only hosts wiped out entirely. */
  engagements?: number;
  /** Defences that ended with the ground still ours. */
  defencesHeld?: number;
}

export interface DynastyStatus {
  farmerUnrest: number;
  nobleRelations: number;
  consecutiveLowStability: number;
}

export interface SpyReport {
  id: string;
  tick: number;
  message: string;
}

export interface CampaignEvent {
  id: string;
  type: 'bandit-raid' | 'flood' | 'drought' | 'noble-uprising' | 'merchant-bounty' | 'plague' | 'dynasty-attack';
  scheduledTick: number;
  sourceKingdomId?: string;
  targetLandId?: string;
  resolved: boolean;
}

/** Source category of an opinion modifier, used for icons/grouping in the UI. */
export type OpinionSource =
  | 'gift'
  | 'trade'
  | 'tribute'
  | 'treaty'
  | 'request'
  | 'war'
  | 'raid'
  | 'trait'
  | 'reputation'
  /** A story beat, an arrival, a border incident — something that happened, and is remembered. */
  | 'event'
  /** Warming one court cools the court it feuds with. See `FEUD_ENVY_SHARE`. */
  | 'envy';

/**
 * A single reason an empire's opinion of the player is higher or lower. Opinion
 * (cached as `Kingdom.relations`) is the personality baseline plus the sum of these.
 * Modifiers with a `decay` shrink toward 0 each tick (temporary); without it they
 * persist while their condition holds (standing).
 */
export interface OpinionModifier {
  id: string;
  label: string;
  value: number;
  /** Per-tick magnitude reduction toward 0. Omit for standing modifiers. */
  decay?: number;
  source: OpinionSource;
}

/** A binding agreement between an empire and the player. */
/**
 * A rival crown that has sworn to the player (Dragon Ascent). Absent means sovereign.
 *
 * Lives on the `Kingdom` rather than in a table on `AscentState` because every consumer already
 * holds a `Kingdom` and never the ascent state — `pickAggressor`, `aggressors`, `rivals`,
 * `tickRivalRealms`, `launchOffMapInvasion`, the affairs screen. Three of those are shared with
 * empire mode and have no business reaching into `state.ascent`. It also means `rebirthEmpire`,
 * which already clears `treaties` and `warAppetite` on the kingdom, clears this in the same
 * place: a new realm in the same seat owes you nothing.
 */
export interface Vassalage {
  /** Turn the oath was sworn. */
  sinceTurn: number;
  /** 0-100, drifting toward how much they fear you. Below the break point they tear it up. */
  loyalty: number;
  /** Gold a season currently flowing, recomputed as their strength moves. */
  tributeGold: number;
  /** How they were brought to it. */
  source: 'envoy' | 'arrival';
}

export interface Treaty {
  type: 'non-aggression';
  /** Turn the treaty lapses. */
  expiresTurn: number;
}

export interface Kingdom {
  id: string;
  name: string;
  color: number;
  personality: KingdomPersonality;
  isDefeated: boolean;
  king?: KingdomKing;
  /** Cached opinion 0-100 = baseline + sum(opinionModifiers). Source of truth is the modifier list. */
  relations?: number;
  hostilityTimer?: number;
  /** Itemised reasons behind `relations`. */
  opinionModifiers?: OpinionModifier[];
  /** Rises each time the player gifts; raises the cost and dampens the gain of further gifts. Decays over time. */
  giftFatigue?: number;
  /** 0-100; how much they believe the player's word. Gates treaty acceptance; lost by breaking deals. */
  trust?: number;
  /** Active treaties with the player. */
  treaties?: Treaty[];
  /** Escalation meter; rises with low opinion + low fear, triggers an invasion when it tops out. */
  warAppetite?: number;
  /** Evolving military-strength index (empire sim, ~20-120). Drives invasion size/odds and inter-empire wars. */
  power?: number;
  /** Internal order 0-100 (empire sim). Low → less aggressive, vulnerable to conquest/collapse. */
  stability?: number;
  /** Hero id seated as the player's ambassador here (standing opinion gain + intel). */
  ambassadorHeroId?: string;
  /** Which power this realm is dressed as, rolled at muster. One of `ENEMY_WARDROBES`. */
  wardrobe?: ArmyWardrobe;
  /** How this realm deploys — its formation's shape. Rolled with the wardrobe. */
  composition?: ArmyComposition;
  /** Sworn to the player. See `systems/ascent/VassalSystem`. */
  vassalage?: Vassalage;
  /** Cumulative years this empire has existed under its current identity (reset on rebirth). */
  age?: number;
  /**
   * The court this one is in a hereditary feud with. Symmetric, fixed at worldgen.
   *
   * The mechanism behind *"cannot have good relation with all kingdoms"*. Warming a court cools
   * its feud partner by `FEUD_ENVY_SHARE` of the same amount, so the arithmetic itself — with no
   * tutorial anywhere — says two friends and two enemies is the best board available, and which
   * two is the strategic question.
   *
   * Optional: an in-flight save from before this existed simply has no feuds, and `applyEnvy`
   * is a no-op for it.
   */
  feudWith?: string;
}

/** One option on a foreign-affairs event card. */
export interface ForeignChoice {
  id: string;
  label: string;
  description: string;
  /** Resources spent (negative) or gained (positive) when chosen. */
  delta?: Partial<ResourceBag>;
  /** Decaying opinion change with the asking empire. */
  opinionDelta?: number;
  /** Standing opinion change with the asking empire (e.g. a marriage bond). */
  opinionStanding?: number;
  /** Opinion change with a named third-party empire (`ForeignCard.rivalId`). */
  rivalOpinionDelta?: number;
  prestigeDelta?: number;
  trustDelta?: number;
  /** Adds escalation pressure toward an invasion by the asking empire. */
  provoke?: number;
  /** Clears the asking empire's war preparations. */
  appease?: boolean;
  /** Choice is only credible with a standing army (leverage gate). */
  requiresArmy?: boolean;
}

/** An empire-tied dilemma presented to the player (Phase 3 foreign event deck). */
export interface ForeignCard {
  id: string;
  kingdomId: string;
  kingdomName: string;
  rivalId?: string;
  rivalName?: string;
  title: string;
  description: string;
  choices: ForeignChoice[];
}

export interface UnitCounts {
  spearmen: number;
  archers: number;
  heavyInfantry: number;
}

export interface Army {
  id: string;
  kingdomId: string;
  name: string;
  landId: string;
  units: UnitCounts;
  /**
   * How this host deploys — which shape its formation takes on the field.
   *
   * Purely how it is *drawn*: the blocks and their sizes. Absent on most hosts, in which case the
   * realm's standing doctrine is used, and failing that the host's own `units` are read.
   */
  composition?: ArmyComposition;
  generalHeroId?: string;
  morale: number;
  supply: number;
  /** Food units carried by the army; depletes each economy tick. */
  rations: number;
  /** Supply units carried by the army; depletes each economy tick and affects march speed/morale. */
  provisions: number;
  level: number;
  experience: number;
  experienceToNextLevel: number;
  unpaidTicks?: number;
  /**
   * Seasons of wages this host has already been paid in goods, and how many are still running.
   *
   * The realm's second answer to an empty treasury: a veteran is carried on the granaries rather
   * than lost to the arrears clock (see `KIND_GOODS_PER_GOLD`). `inKindSeasons` is the grace still
   * standing from the current settlement, `inKindSettlements` is how many settlements this host
   * has had of the two it is allowed. Both optional so a host round-trips through an older save.
   */
  inKindSeasons?: number;
  inKindSettlements?: number;
  /** Consecutive seasons this host has been out of rations — what the starvation warning counts. */
  starvingTicks?: number;
  /** Elite tier (0 = levy, 1 = trained, 2 = royal guard); each tier adds battle power. */
  elite?: number;
  /**
   * A refit under way (Dragon Ascent): fresh men marching in, new kit being fitted, or drill.
   *
   * While it stands the host takes NO orders — the standing-order tick skips it, the autopilot
   * leaves it be, and every order surface says why. It still defends the ground it stands on:
   * being attacked is not an action. The paid-for gain lands when `ticksLeft` runs out
   * (`tickArmyRefits`), not in the instant the coin left the treasury.
   */
  refit?: { kind: 'equip' | 'reinforce' | 'drill'; ticksLeft: number; total: number; gain: number };
  /**
   * A supply column on the road (Dragon Ascent). The baggage arrives spread over the column's
   * remaining ticks rather than on the tap; the host acts freely while it comes. `food` and
   * `supplies` are what is still to deliver.
   */
  resupplyRun?: { ticksLeft: number; food: number; supplies: number };
  /**
   * Full command delegated to this army's hero: the general autonomously marches to
   * intercept the nearest incoming invasion, so the player can let a trusted hero run the
   * frontier instead of micro-managing every march.
   */
  autoDefend?: boolean;
  /**
   * A province's own garrison, turned out to fight as a host for the length of one battle.
   *
   * Raised by `raiseGarrisonLevy` and dissolved the moment the engagement ends — survivors go
   * back into the province's `localSoldiers`. It exists because a watchable battle needs an
   * `Army` on the defending tile, and without it every province the field hosts were not
   * standing on resolved its defence as a silent dice roll.
   */
  isLevy?: boolean;
  /**
   * A host that fights for the realm but is not the realm's to command — a story's auxiliary
   * (Dragon Ascent). Holds the `templateId` of the story that raised it.
   *
   * `templateId` rather than the story's id, and for three reasons: a story may retire its slot
   * and seed again, a terminal deletes the `ActiveStory` outright while the host is meant to
   * outlive the ending, and the id itself is minted from a counter that resets on reload.
   *
   * It draws no wage and eats none of the realm's rations. It lives on what it was *given* and
   * thins out when it was not, which is the only reason a gift to it is a decision rather than a
   * button. It cannot be ordered, cannot be recalled, and the autopilot may neither march it nor
   * dissolve it — see `systems/story/patrons.ts`.
   *
   * Absent on every host in every other mode, which is what makes every read of it inert outside
   * Ascent without a single `gameMode` check.
   */
  patron?: string;
  /**
   * Turn this host stops fighting at the recalled-from-the-fields penalty (ngụ binh ư nông).
   *
   * Only ever set while that decree stands. Read by `armyPower`, so a host called back off the
   * harvest is measurably worse everywhere the game asks how strong it is — the field battle, the
   * odds roll, and the defence readout alike.
   */
  recalledUntil?: number;
  /**
   * Consecutive seasons this host has stood at home with no order (ngụ binh ư nông).
   *
   * A count rather than a flag, and that distinction is the whole mechanic: a host is only *in the
   * fields* once it has been still for `FARMING_AFTER` seasons, so only a genuinely idle army feeds
   * the realm and only a genuinely idle army is unready when it is called back. Measured with a
   * flag instead, every ordinary march counted as a recall and the autopilot — which moves hosts
   * constantly — left every army permanently at three-quarters strength.
   */
  idleTicks?: number;
  /**
   * Militia a garrison levy actually drew from its province, so dissolving it returns at most
   * what it took — the walls' share of the turnout must not become standing militia.
   */
  levyDrawn?: number;
  /**
   * Men this levy mustered with, so what is left of it can be read as a *share*.
   *
   * Recorded rather than inferred: `dissolveGarrisonLevies` needs to know how badly the turnout was
   * mauled in order to charge the walls for it, and by then the only other number in reach is
   * `levyDrawn`, which is the militia share alone and says nothing about the walls'.
   */
  levyMustered?: number;
  /**
   * The host's standing order (Dragon Ascent). Absent means `auto`: the autopilot may march it,
   * send it home, or leave it — the original behaviour, kept for old saves, the royal host and
   * every host raised by the autopilot itself. Any other order takes the host out of the
   * autopilot's hands: it is moved only by the order, and never dissolved as a remnant.
   */
  orders?: ArmyOrders;
  /**
   * Whether this host's battles are fought by its general rather than watched and steered by the
   * player (Dragon Ascent). Absent means the player takes the field.
   *
   * `ascent.autoResolveBattles` already said this for the WHOLE run, and only from Settings —
   * all fights or none. A realm with six hosts does not want that answer: the border garrison
   * skirmishing every other season is exactly what you want handled for you, and the royal host
   * storming a capital is exactly what you do not. So the question is asked per host, on the host's
   * own sheet, and the run-wide switch still overrides it.
   */
  autoResolve?: boolean;
}

/**
 * What a host of the player's is doing until told otherwise (Dragon Ascent).
 *
 *  - `auto`   — the autopilot commands it (march on the front, intercept, go home).
 *  - `defend` — hold `landId`; walk back if displaced and the road is open, otherwise hold here.
 *  - `attack` — reach and storm `landId`; falls back to `defend` where it stands once the land is
 *               taken or the assault is thrown back. `force` storms below the odds gate.
 *  - `follow` — keep station with another host of ours, on its province or the nearest owned one.
 *  - `hunt`   — pursue an enemy host until it is caught or gone (`issueHuntOrder`, re-issued).
 *
 * `holding` / `struck` are the order's own memory, so a change of state is announced once and
 * the tick never spins on an unreachable target.
 */
export type ArmyOrders =
  | { kind: 'auto' }
  | { kind: 'defend'; landId: string; holding?: boolean; hostileTransit?: boolean }
  | { kind: 'attack'; landId: string; hostileTransit?: boolean; struck?: boolean; holding?: boolean; force?: boolean }
  | { kind: 'follow'; armyId: string; holding?: boolean }
  | { kind: 'hunt'; armyId: string };

/** An in-progress march: an army advancing one land per leg toward `path`'s last entry. */
export interface MovementOrder {
  armyId: string;
  /** Remaining land ids to visit, in order. The last entry is the final destination. */
  path: string[];
  /** Ticks accumulated toward completing the current leg (path[0]). */
  progress: number;
  /** Ticks required to complete the current leg (path[0]). */
  legRequired: number;
  /**
   * The host being hunted, if this march is a pursuit.
   *
   * A pursuit differs from a march in that its destination moves: `progressMovementOrders`
   * re-paths toward the quarry's current province whenever it has shifted, and drops the order
   * when the quarry is gone. Optional, so it round-trips through the save with no migration.
   */
  pursueArmyId?: string;
  /** Explicitly authorized reinforcement passage through hostile intermediate provinces. */
  hostileTransit?: boolean;
  hostileCrossed?: number;
}

/** Core hero stats (0-100). Drive court position bonuses and land assignment bonuses. */
export interface HeroStats {
  /** Army power in battle. */
  martial: number;
  /** Recruitment speed, build/upgrade speed, march speed. */
  logistics: number;
  /** Resource output %, building cost reduction. */
  administration: number;
  /** Influence gain, peaceful acquisition speed. */
  diplomacy: number;
  /** Stability regen, land loyalty regen. */
  loyalty: number;
  /** Favor generation, army morale regen, recruitment via fame. */
  renown: number;
}

export interface Hero {
  id: string;
  name: string;
  type: HeroType;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  upkeepGold: number;
  description: string;
  effect: string;
  stats: HeroStats;
  /** While seated in court, biases the politics card draw toward this card type. */
  cardBias?: PoliticsCard['type'];
  /** While seated in court, adds this card template to the active politics deck. */
  signatureCardId?: string;
  assignedTo?: string;
  /** 0 = fresh, 100 = exhausted. Reframed as "Energy" (100 - fatigue) in the hero hub;
   *  active hero actions (missions/abilities) spend it, resting recovers it. */
  fatigue: number;
  /** Battles won while commanding (empire mode); a veteran general grows in martial skill. */
  battlesWon?: number;
  /** Missions completed (empire mode); drives renown growth and earned traits. */
  missionsDone?: number;
  /** Earned traits (e.g. "Veteran", "Conqueror") shown on the hero card. */
  traits?: string[];

  // ── Portrait identity (see ui/faces/heroLook.ts) ──
  /**
   * Who this person is, for the portrait. **Not** a style axis: the wardrobe is chosen from
   * this, and the seed only picks within what it allows.
   *
   * Required, because it is not a style axis and must never be left to a seed: before this
   * existed, every one of the five heroes the game names as a woman rendered with facial
   * hair. `resolveHeroLook` still reads the Vietnamese honorific out of the name (Bà, Nữ,
   * Công Chúa, Ông) as a safety net for any hero reconstructed from an older save.
   */
  sex: 'man' | 'woman';
  /** Monastics get a wardrobe of their own — shaven, kesa, and nothing else. */
  monastic?: boolean;
  /**
   * A one-off that fires when this champion joins the roster. Rulers only — see `heroArrivals`.
   */
  arrival?: HeroArrivalId;
  /**
   * Which century this hero dresses in. Đại Việt did not wear one costume for a thousand
   * years, and the roster already spans the dynasties by name. Unset means "pick from the
   * common eras by seed", which is what keeps a drafted roster visually varied.
   */
  era?: HeroEra;
}

/**
 * What a champion brings the moment they join — the one-off that makes a Legendary land.
 *
 * A string id into `data/heroArrivals.ts`, not a payload object and certainly not a function.
 * A function throws `DataCloneError`: `heroDeck` is `structuredClone(heroTemplates)` and the
 * whole state is cloned again on save, so it would fail on the *save* path, which is the worst
 * place to find out. A payload object survives the clone but bakes balance numbers into save
 * data, so a save from before a tuning pass keeps the old numbers forever. A string resolves
 * through a registry at fire time, keeps the numbers in `ascentConfig`, and an unknown id is a
 * lookup miss rather than a crash.
 */
export type HeroArrivalId =
  | 'host' | 'land' | 'vassal' | 'truce' | 'card' | 'treasury' | 'walls' | 'levy';

/**
 * The dress eras the portrait system knows. Each is a different wardrobe, not a palette swap:
 * the Nguyễn reform of 1744 replaced the crossed lapel with a standing collar, so a Nguyễn
 * official in áo giao lĩnh is simply the wrong century.
 */
export type HeroEra = 'dinh' | 'ly' | 'tran' | 'le' | 'tayson' | 'nguyen';

/** The kind of active mission a hero can be dispatched on (empire mode). One per hero type. */
export type HeroMissionKind = 'raid' | 'sabotage' | 'taxCircuit' | 'quellUnrest';

/** An in-flight hero mission that resolves after a number of economy ticks (empire mode). */
export interface HeroMission {
  id: string;
  heroId: string;
  kind: HeroMissionKind;
  /** Rival empire the mission acts against (raid/sabotage). */
  targetKingdomId?: string;
  ticksRemaining: number;
  totalTicks: number;
}

/** A personal hero dilemma the roster raises for a decision (empire mode). */
export type HeroEventKind = 'ambition' | 'exhaustion' | 'loyalty';

/** A pending hero-authored decision card, resolved via a two-way choice. */
export interface HeroEvent {
  id: string;
  heroId: string;
  kind: HeroEventKind;
}

export interface CourtModifier {
  id: string;
  label: string;
  remainingTicks?: number;
  resourceRateModifier?: Partial<ResourceBag>;
  recruitSpeedModifier?: number;
  courtCardSpeedModifier?: number;
  /** Additive share on army battle power (0.08 = +8%). Summed across modifiers into `armyPowerMult`. */
  armyPowerModifier?: number;
  armyXpModifier?: number;
  buildingCostModifier?: number;
  buildSpeedBonus?: number;
  upgradeSpeedBonus?: number;
  acquisitionCostModifier?: number;
  armyGoldUpkeepModifier?: number;
  buildingGoldUpkeepModifier?: number;
  buildingSuppliesUpkeepModifier?: number;
  marketGoldOutputModifier?: number;
  recruitmentSupplyCostModifier?: number;
  nextArmyLevelBonus?: number;
  nextArmyArchersBonus?: number;
  nextArmyHeavyBonus?: number;
  battleSupplyCostModifier?: number;
  armyLevelCapBonus?: number;
  /**
   * Extra provinces the realm may court at once (Dragon Ascent). A plain count, not a share —
   * it is summed, never folded into a multiplier. See `getClaimSlots`.
   */
  claimSlotBonus?: number;
}

export interface CourtEffect extends Partial<Omit<CourtModifier, 'id' | 'label' | 'remainingTicks'>> {
  resourceDelta?: Partial<ResourceBag>;
  durationTicks?: number;
  permanent?: boolean;
  freeBuilding?: LandBuildingType;
  freeUpgrade?: LandBuildingType;
  freeHeroDraft?: true | HeroType;
  completeBuildOrder?: boolean;
  completeUpgradeOrder?: boolean;
  restoreArmyReadiness?: boolean;
  defenseBoost?: number;
  favorDelta?: number;
  stabilityDelta?: number;
  influenceDelta?: number;
  nextCourtCardSoon?: boolean;
  extraCourtDraw?: boolean;
  duplicateNextCourtChoice?: boolean;
  relationsAllDelta?: number;
  hostilityResetAll?: boolean;
}

export interface PoliticsChoice {
  id: string;
  label: string;
  description: string;
  effects: CourtEffect;
}

export interface PoliticsCard {
  id: string;
  title: string;
  type: 'problem' | 'law' | 'opportunity' | 'crisis';
  seasons?: Season[];
  description: string;
  choices: [PoliticsChoice, PoliticsChoice];
}

export interface BattlePreview {
  attackerArmyId: string;
  targetLandId: string;
  winChance: number;
  attackerPower: number;
  defenderPower: number;
}

export interface BattleResult {
  attackerArmyId: string;
  targetLandId: string;
  victory: boolean;
  attackerPower: number;
  defenderPower: number;
  /** Ticks until the besieged district falls; only set when `victory` is true. */
  siegeTicks?: number;
  /** Fate of the commanding general on a defeat (empire-mode battlefield stakes). */
  generalFate?: 'wounded' | 'slain';
  /** Name of the general whose fate is reported, for the result screen. */
  generalName?: string;
}

/** An in-progress siege: a victorious army occupies the land while it slowly falls to the attacker. */
export interface SiegeOrder {
  landId: string;
  armyId: string;
  attackerKingdomId: string;
  /** Land the besieging army marched from, used if the player retreats instead of waiting it out. */
  fromLandId: string;
  progress: number;
  required: number;
}

export type AcquisitionMethod = 'bribe' | 'diplomacy' | 'intimidation' | 'settle' | 'occupy' | 'conquest';

export interface AcquisitionOrder {
  landId: string;
  buyerId: string;
  progress: number;
  required: number;
  costGold: number;
  method: AcquisitionMethod;
  /** Hero assigned to a diplomatic claim. */
  heroId?: string;
  /** Army applying pressure in an intimidation order. */
  armyId?: string;
}

export interface BuildOrder {
  landId: string;
  building: LandBuildingType;
  kind: 'build' | 'upgrade';
  /** Index into land.buildings; only set for kind === 'upgrade'. */
  buildingIndex?: number;
  progress: number;
  required: number;
}

/** An in-progress training order: a new army being assembled at `landId` over several ticks. */
/** Chosen army composition doctrine — shapes the spearmen/archer/heavy mix (unit counters). */
export type ArmyComposition = 'balanced' | 'spears' | 'archers' | 'shock' | 'horse';

/**
 * Which army a host is dressed and deployed as.
 *
 * Declared here rather than in the renderer because it is **run state**: it is rolled at muster,
 * saved with the game and read back on load. `devices.ts` re-exports it as `FigureTheme` and does
 * the drawing; nothing else needs to know the list.
 *
 * Eight Việt — the four on the Mandate ladder, the three lord periods, which are what a rival
 * Việt kingdom wears, and Đinh at the head of the line. Four northern, each paired to the era it
 * historically came in. One Chăm.
 *
 * Đinh was missing for as long as this list existed, and the cost was specific: the roster names
 * seventeen champions of the tenth century — Đinh Bộ Lĩnh, Ngô Quyền, Lê Đại Hành among them — and
 * `song` sat here the whole time, so the game could dress the army that invaded in 981 but not
 * the one that met it.
 */
export type ArmyWardrobe =
  | 'dinh' | 'ly' | 'tran' | 'le' | 'trinh' | 'nguyenLord' | 'tayson' | 'nguyen'
  | 'song' | 'yuan' | 'ming' | 'qing'
  | 'champa';

/** The five powers a rival can be drawn from. Chăm is the only one that is not northern. */
export const ENEMY_WARDROBES = ['song', 'yuan', 'ming', 'qing', 'champa'] as const;

/** The eight a Việt realm — the player's, or a rival lord's — can be dressed in. */
export const VIET_WARDROBES = ['dinh', 'ly', 'tran', 'le', 'trinh', 'nguyenLord', 'tayson', 'nguyen'] as const;

/**
 * What this run's armies look like, rolled once at muster from the map seed.
 *
 * Rolled rather than earned so that two runs do not open on the same picture. The Mandate track
 * still advances the **tier** — levy to trained to royal guard — and the settlements; what is
 * chosen here is which dynasty's wardrobe that ladder is climbed in.
 */
export interface MusterRoll {
  /** The player's dynasty, drawn from `VIET_WARDROBES`. */
  dynasty: ArmyWardrobe;
  /** The player's opening deployment. */
  composition: ArmyComposition;
}

/** Pre-battle tactical plan — trades win chance against casualties. */
export type BattleStance = 'assault' | 'balanced' | 'cautious';

export interface RecruitmentOrder {
  /** Standing order stamped on the host the moment it musters (Dragon Ascent). */
  orders?: ArmyOrders;
  id: string;
  landId: string;
  heroId: string;
  totalSoldiers: number;
  rations: number;
  provisions: number;
  progress: number;
  required: number;
  composition?: ArmyComposition;
}

export type CourtPositionId =
  | 'marshal'
  | 'quartermaster'
  | 'treasurer'
  | 'steward'
  | 'chancellor'
  | 'spymaster'
  | 'censor'
  | 'masterOfHorse';

/** Kingdom-wide court state: seated heroes, unlocked seats, and political stats. */
export interface CourtState {
  /** Position id -> seated hero id. */
  seats: Partial<Record<CourtPositionId, string>>;
  /** Positions the player can currently assign heroes to. */
  unlockedSeats: CourtPositionId[];
  /** Internal order; low stability raises rebellion/crisis risk. 0-100. */
  stability: number;
  /** Diplomatic capital; spent on peaceful actions, gained from court bonuses. 0-100. */
  influence: number;
  /** Accumulates each economy tick; a new hero draft arrives once it reaches favorThreshold. */
  favor: number;
  favorThreshold: number;
  /** Economy ticks remaining before the next politics card may be drawn. */
  cardCooldown: number;
}

/** Visual accent shared by transient toasts and the persistent event log. */
export type NotificationKind = 'info' | 'reward' | 'threat' | 'milestone';

/** A transient on-screen notification pushed by gameplay systems (empire mode). */
export interface Toast {
  id: string;
  text: string;
  /** Visual accent: neutral info, a reward/gain, a warning/threat, or a milestone. */
  kind: NotificationKind;
  /** Economy tick the toast was created on; the UI expires it after a few ticks. */
  createdTurn: number;
}

/**
 * A persistent notification entry. Every gameplay notification (empire toasts and
 * campaign event messages) is appended here so the player can open a paused log and
 * read the full history — the single source of truth behind the notification bell.
 */
/**
 * Where a notification came from, when it came from a running story.
 *
 * Present only on Chronicle lines. It is what lets a whisper be *tapped* — the one-line strip
 * shows the headline, the story page behind it holds the scene the line was cut from.
 */
export interface GameEventRef {
  storyId: string;
  templateId: string;
  fragmentId: string;
}

export interface GameEvent {
  id: string;
  text: string;
  kind: NotificationKind;
  /** Economy tick the event occurred on. */
  turn: number;
  /** False until the player opens the log; drives the unread badge count. */
  read: boolean;
  /** Set when a story said this, so the entry can be opened rather than only read. */
  ref?: GameEventRef;
}

export type DirectiveTier = 'short' | 'medium' | 'epic';

/**
 * A live objective shown on the Directives board (empire mode). Its `metricKey`
 * selects a pure evaluator over GameState; when `current` reaches `target` the
 * directive completes and pays out Mandate + optional resources.
 */
export interface Directive {
  id: string;
  templateId: string;
  tier: DirectiveTier;
  metricKey: string;
  target: number;
  /** Metric value captured when the directive was issued (for delta-based goals). */
  baseline: number;
  current: number;
  rewardMandate: number;
  rewardResources?: Partial<ResourceBag>;
  /** Turn by which a timed (prep) directive must complete, else it fails. */
  deadline?: number;
  complete: boolean;
  failed?: boolean;
}

export type EraId = 'founding' | 'rivalry' | 'empires' | 'mandate';

/**
 * The four estates the throne governs through — scholar, farmer, merchant, soldier.
 *
 * The traditional order (sĩ · nông · công · thương) with the military restored to it, because in
 * Đại Việt it always was. Every decree pleases some and angers others, which is what makes a law a
 * decision rather than a purchase: there is no free reform.
 *
 * This is also the wire that connects decrees to the rest of the game. One shared 0–100 number per
 * estate reaches the summon pool, the rout threshold, revolt spawning and edict-point income, so
 * interactions between systems fall out of the model instead of being hand-authored one by one.
 */
export type EstateId = 'si' | 'nong' | 'thuong' | 'vo';

export const ESTATE_IDS: EstateId[] = ['si', 'nong', 'thuong', 'vo'];

/**
 * Which school of statecraft a decree belongs to.
 *
 * Enact enough of one and its capstone unlocks while the opposing school locks for the run — Pháp
 * gia against Phật gia is Hồ Quý Ly against the Lý–Trần settlement; Nho gia against Binh gia is Lê
 * Thánh Tông's civil bureaucracy against Tây Sơn arms.
 */
export type SchoolId = 'phap' | 'nho' | 'binh' | 'phat';

/** The four instruments raised by the world rather than chosen off a list. See `decree-offer`. */
export type DecreeInstrument = 'sac' | 'du' | 'hich' | 'le';

/** Kingdom-wide progression track (empire mode). Fills from directives + battles. */
export interface MandateState {
  points: number;
  era: EraId;
  /** Ids of edicts the player has enacted (permanent CourtModifiers). */
  edicts: string[];
  /**
   * Standing of each estate, 0–100, starting at 50 and drifting back toward it.
   *
   * Optional so a save written before the decree system needs no migration — always read it
   * through `estateStanding()` in `DecreeSystem`, never off this field directly.
   */
  estates?: Record<EstateId, number>;
  /** Per-decree resentment accrued since enactment, keyed by decree id. Cleared by an amnesty. */
  decreeResentment?: Record<string, number>;
  /**
   * Provinces a `sắc phong thành hoàng` has bound a tutelary spirit to: land id → hero name.
   *
   * Keyed by name rather than by hero id on purpose — the whole point of the investiture is that
   * it outlives the person, so it must still resolve after the hero has left the roster, died, or
   * been written into a Chronicle echo in a run that no longer holds their record.
   */
  tutelary?: Record<string, string>;
  /** Ticks since the exam hall last seated a graduate (khoa cử). */
  examTicks?: number;
  /** Decrees whose `hịch`/`dụ` effect is live, with the tick it lapses on. */
  temporary?: Record<string, number>;
  /**
   * Decrees a finished Chronicle story has put within reach (`grantDecree`).
   *
   * A separate list from `edicts` because being *taught* a law is not the same as passing it: the
   * player still chooses it off the card and still pays for it. This only bypasses the era gate,
   * which is the whole point — a run learns something out of order because of what happened to it.
   */
  taughtDecrees?: string[];
  /** Edicts a hostile empire has passed against the realm, with the turn each lapses on. */
  rivalDecrees?: Array<{ kingdomId: string; decreeId: string; until: number }>;
  /** Schools of statecraft whose capstone this reign has taken. */
  capstones?: SchoolId[];
  /** Unspent points available to enact edicts. */
  edictPoints: number;
  /** Era transitions already announced, so we only fire the toast/unlock once. */
  reachedEras: EraId[];
  /** Set true once the player has reached the final era (ascension unlocked). */
  ascensionReady?: boolean;
  /** Set true when the Ascension directive completes — triggers the prestige win. */
  ascended?: boolean;
  /** True once the ascension directive has been issued, so it is only issued once. */
  ascensionIssued?: boolean;
}

/** A telegraphed major invasion the player can prepare for or defuse (empire mode). */
export interface Ultimatum {
  id: string;
  kingdomId: string;
  targetLandId?: string;
  /** Economy turn the host will muster. */
  dueTurn: number;
  /** Total soldiers the announced host will field. */
  hostSize: number;
  /** True for a once-per-era named-warlord coalition. */
  isGreatInvasion: boolean;
  warlordName?: string;
  /** Set when the player defuses it via pact/tribute before dueTurn. */
  defused?: boolean;
}

// ── Dragon Ascent (`gameMode: 'ascent'`) ────────────────────────────────────
// An endless auto-conquest run: the empire plays itself and the player's whole
// input is a stream of pausing card prompts. See systems/ascent/.

/** Power Draft card rarity. Maps onto the Hero rarity ladder for summons. */
export type AscentRarity = 'bronze' | 'silver' | 'gold' | 'jade';

/**
 * The screens the bottom action bar opens. Deliberately the classic modes' menu — Build /
 * Heroes / Court / Army / Affairs — so this mode is navigated the same way the rest of the
 * game already is. Conquest is not here: like the classic modes, it is reached by selecting
 * a province on the map.
 */
export type AscentLane = 'build' | 'heroes' | 'court' | 'army' | 'affairs' | 'battle' | 'chronicle' | 'ledger';

// ── The Chronicle (Sử Ký) ───────────────────────────────────────────────────
//
// Stories are not quests. A story is a persistent object with a cast it has taken an
// interest in, a bag of numbers recording what has happened, and a pool of fragments it
// picks from by *salience* rather than in order. It has no length, so nothing here counts
// beats or reports progress — see `systems/story/StorySystem.ts`.

/**
 * How loudly a fragment speaks.
 *
 * `whisper` is the bulk of every pool and costs nothing: one line in the header strip, no
 * pause, no prompt-queue slot. `card` pauses and asks. `blow` pauses and *tells* — no
 * options, something has happened. A story that only ever asks is a story the player
 * controls, and control is the opposite of drama.
 */
export type StoryVolume = 'whisper' | 'card' | 'blow';

/**
 * Where a beat sits against the record — the Chronicle's source class.
 *
 * Three rather than two, because two would force a lie. `chinh-su` is the dynastic annals
 * (Đại Việt sử ký toàn thư, Việt sử lược). `da-su` is legend and unofficial history — told, not
 * recorded, which is what Thánh Gióng has always been and what Trần Quốc Toản's death is.
 * `ngoai-truyen` is this realm's own variation: it did not happen.
 *
 * Lives here rather than in `systems/story/types.ts` because the saved shapes below need it and
 * that file imports from this one.
 */
export type Historicity = 'chinh-su' | 'da-su' | 'ngoai-truyen';

/**
 * The generic woodblock band behind a card. Chosen by tag, never by story.
 *
 * Deliberately not per-story art: a template binds a random hero and a random province, so a
 * picture specific to one instance is a lie on every other map. The same band appearing
 * across many stories is correct rather than a compromise.
 */
export type StoryBand =
  | 'court' | 'river' | 'field' | 'coast' | 'mountain' | 'march'
  | 'fire' | 'granary' | 'night' | 'crowd' | 'shrine' | 'border';

/** The subjects a story has bound. Any of them may be absent. */
export interface StoryCast {
  heroId?: string;
  otherHeroId?: string;
  landId?: string;
  kingdomId?: string;
}

/** A story instance living in the save. */
/**
 * One condition a charge is judged on. Every kind is a predicate over state the engine already
 * keeps — see `systems/story/charges.ts`, which is the only thing that reads these.
 */
export interface StoryGoal {
  kind:
    | 'build' | 'relations' | 'relationsAny' | 'lands' | 'wave' | 'host' | 'hold'
    | 'treasury' | 'seat' | 'battle'
    // Added for the annals: a realm at peace with everyone, a realm that has built widely, and a
    // realm that has not lost a province in a while. All three are things a player might set out
    // to do anyway, which is the test every goal kind has to pass.
    | 'peace' | 'buildings' | 'noLandLost';
  building?: LandBuildingType;
  landId?: string;
  kingdomId?: string;
  /** Relations at or above / at or below. Both may be set to describe a band. */
  atLeast?: number;
  atMost?: number;
  /** Provinces, waves, hosts, empires, victories — whichever the kind counts. */
  count?: number;
  /** `host`: men in one host. */
  soldiers?: number;
  /** `host`: each qualifying host must have a general. */
  generaled?: boolean;
  /** `hold`: consecutive seasons the province must stay ours. */
  seasons?: number;
  /** `treasury`: gold on hand. */
  gold?: number;
  /** `seat`: which chair, and how good the hero in it must be. */
  position?: CourtPositionId;
  rarity?: Hero['rarity'];
  /** `battle`: only count fights defending our own ground. */
  great?: boolean;
}

/**
 * An undertaking the player has accepted from a story, still outstanding.
 *
 * Holds no callbacks by design: keeping or breaking one writes a flag into the story's memory and
 * heats it, and the story's own fragments say what that meant. See `systems/story/charges.ts`.
 */
export interface StoryCharge {
  id: string;
  storyId: string;
  templateId: string;
  /** Text-key suffix: `<templateId>.charge.<key>.{sworn,kept,broken,watching}`. */
  key: string;
  goals: StoryGoal[];
  acceptedTurn: number;
  /** Absolute turn the oath lapses. Absent means it stands until kept. */
  dueTurn?: number;
  /** Counters for the goals that measure duration rather than a state. */
  progress: Record<string, number>;
}

export interface ActiveStory {
  id: string;
  templateId: string;
  cast: StoryCast;
  /** Flat bag of numbers. Story progress is just another number — no special machinery. */
  memory: Record<string, number>;
  /**
   * Every fragment this story has spoken, in order, with the season it fired.
   *
   * `spoken` already holds the ids, but ids without seasons cannot be read back as a story —
   * and reading the story back is the whole point of the story page. The screen renders this
   * as "Đã xảy ra": the case the story has been building, finally on one screen. Optional so
   * saves from before the page load cleanly; those fall back to `spoken` without dates.
   */
  history?: { fragmentId: string; turn: number; outcome?: StoryOutcome[] }[];
  /** Hidden closeness-to-acting. Never shown; the only tell is how often it whispers. */
  temperature: number;
  seededTurn: number;
  lastSpokeTurn: number;
  /** Fragment ids already fired. Ids are an append-only compatibility contract. */
  spoken: string[];
  /** Set when a card/blow is waiting for the decision director to raise it. */
  waiting?: string;
  /**
   * Season `waiting` was set, so a card can be let go after it has been held too long.
   *
   * The stale clock used to read `lastSpokeTurn`, which measures something else entirely: a story
   * that whispers while holding a card kept resetting it, so it held the card for the rest of the
   * run and squatted a live slot in silence. Measured, four of eight live stories ended a run in
   * exactly that state, six of eight having never said a word.
   */
  waitingSince?: number;
  /**
   * Season this story may pick another card. Set when it lets a stale one go.
   *
   * Without it the release does nothing: the same tick re-runs the draw with the card slot free
   * and picks the very same fragment straight back, so the story holds it for the rest of the run
   * and says nothing else the whole time. The rest window is what makes the release mean what its
   * comment claims — the story is turned back to its ambient pool, and if it has nothing there it
   * runs dry and gives the slot to one that has.
   */
  cardRestUntil?: number;
  /**
   * An offer currently hanging on one of this story's subjects.
   *
   * Deliberately *not* `waiting`. An opening must not silence the story that made it — a player
   * who ignores an offer would otherwise mute that story for the rest of the run, which is the
   * opposite of "ignoring it is free and is also an answer".
   */
  offer?: string;
  /** Season the offer stops being available. It goes without announcing that it has. */
  offerUntil?: number;

  // ── The trunk ─────────────────────────────────────────────────────────────
  //
  // All optional, so a save written before nodes existed loads without a migration step: see
  // `nodeOf` in StorySystem, which resolves an absent `node` to the template's entry.

  /** The node this story is standing in — see `StoryNode`. Ids are append-only. */
  node?: string;
  /**
   * Every node passed through, in order.
   *
   * This is what the story page draws as a spine: where the story went, where it left the
   * record, and where it is now. `history` answers "what was said"; this answers "which way it
   * went", and they are not the same question.
   */
  path?: string[];
  /** Least historical class the path has touched. Never decreases — see `StoryCtx.drift`. */
  drift?: Historicity;
  /** Turn the story entered its current node, for the patience clock. */
  nodeSince?: number;

  /**
   * The cast's names, copied at bind time.
   *
   * The cast is held by id and the world is allowed to take people away: a general killed in a
   * battle this story knows nothing about, exiled by another story, or lost with a province. When
   * that happens every line already spoken about them re-renders with the subject missing —
   * observed live on the story page as `S76  was taken.`
   *
   * An annal that forgets the name of the man it is about is not an annal, so the name is frozen
   * when the story seeds and `storyParams` falls back to it. Not in `memory`, which is numbers.
   */
  names?: { hero?: string; other?: string; land?: string; rival?: string };

  /**
   * Consecutive ticks this story has had nothing it could say.
   *
   * A story whose pool is exhausted used to hold one of the eight live slots until the run ended:
   * measured, two to five per run sat there having never spoken at all, and the catalogue is only
   * large if a run walks around it. Past `DRY_TICKS_BEFORE_RETIRE` it lets go of the slot.
   */
  dryTicks?: number;
}

/**
 * A line in the Chronicle. Stored as key + params rather than resolved text, so the record
 * re-translates when the player changes language.
 */
/**
 * Somebody the realm buried and did not forget.
 *
 * Distinct from a `ChronicleEntry`, which is ring-buffered at sixty and will be evicted by a long
 * run — a shrine the record forgets is not a shrine. Stored as a key and params like every other
 * player-visible string here, so it re-translates when the language changes; the *name* is the one
 * thing kept as literal text, exactly as `ActiveStory.names` keeps it, because a memorial that
 * forgets the name of the man it is for is not a memorial.
 */
export interface Memorial {
  id: string;
  /** The name, frozen. Never a lookup — the person is gone by definition. */
  name: string;
  templateId: string;
  /** Text-key suffix: `<templateId>.memorial.<key>`. */
  key: string;
  turn: number;
  /** Where the shrine stands, if anywhere. */
  landId?: string;
  /** A floor under that province's loyalty, held for the rest of the run. */
  loyaltyFloor?: number;
  /** Invasions the person actually stood through. The shrine is built to this scale. */
  deeds?: number;
}

/**
 * One thing an answer did to the realm — a key and a number, never resolved text.
 *
 * The same discipline as the rest of this record: nothing here has been rendered yet, so it
 * re-translates when the player switches language. `kind` resolves against
 * `ascent.story.outcome.<kind>` and is interpolated with `{n}` and `{name}`.
 */
export interface StoryOutcome {
  kind: string;
  /** Signed. Absent for a thing that has no count — a card, a decree, a name. */
  amount?: number;
  /** A name the line needs, frozen at the moment it happened. */
  name?: string;
}

export interface ChronicleEntry {
  id: string;
  templateId: string;
  fragmentId: string;
  turn: number;
  params: Record<string, string | number>;
  /** Ended well, ended badly, or simply stopped. Drives the entry's accent only. */
  tone: NotificationKind;
  /**
   * Which record this ending belongs to, stamped from `story.drift` at the terminal.
   *
   * Absent on entries written before the tag existed; the page reads those as `chinh-su`.
   */
  historicity?: Historicity;
  /**
   * What the ending actually did to the realm.
   *
   * Kept here as well as on `ActiveStory.history` because the story is deleted the instant a
   * terminal fires, and the record has to outlive it.
   */
  outcome?: StoryOutcome[];
  /**
   * Every beat the story spoke, in the order it spoke them — copied off `ActiveStory.history` at
   * the terminal, because the story itself is deleted the instant one fires.
   *
   * This is what lets a finished story be *read* rather than merely listed. Sử ký's recorded tab
   * had one line per ending and no way in; the beats were kept for the length of the telling and
   * then thrown away, so the one thing a chronicle is for — going back and reading what happened —
   * was the one thing it could not do.
   *
   * Optional, so a save written before this shipped simply shows its ending without a timeline and
   * nothing has to be migrated.
   */
  history?: { fragmentId: string; turn: number; outcome?: StoryOutcome[] }[];
  /**
   * The champion the story was about, if it had one — stamped at the terminal from `story.cast`.
   *
   * `params` carries their *name* because the fragment text interpolates it, and a name is not
   * enough to draw a face. The archive page wants the face: a story is about somebody, and a page
   * that only names them reads as a report where the live story page reads as a life.
   */
  heroId?: string;
}

/**
 * What the world looked like last tick, so stories can notice what changed without every
 * other system having to push events at them.
 */
export interface StoryWatch {
  lands: number;
  heroes: number;
  gold: number;
  food: number;
  battlesWon: number;
  wavesSurvived: number;
  courtSeatsFilled: number;
  /**
   * Heroes carrying the `Captive` trait, so a capture is something a story can *react* to.
   *
   * Optional because saves written before it exists have no count; those read as 0, which at
   * worst reports one spurious capture on the first tick after loading.
   */
  captives?: number;
}

/**
 * One resource's row in the ledger: what came in, what went out, what was left.
 *
 * The header strip has only ever shown the net figure, which is why the player could watch
 * every number rise for ten years and still not know why — a net with no breakdown teaches
 * nothing. Gross and demand are the two halves the strip was hiding.
 */
export interface AscentLedgerLine {
  gross: number;
  demand: number;
  net: number;
}

/** A place that is currently going without, and what kind of want it is. */
export interface AscentShortfall {
  landId: string;
  kind: 'food' | 'supplies' | 'gold';
  /** Season it was first noticed, so the ledger can say how long it has stood. */
  sinceTurn: number;
}

/** The realm's books, recomputed every economy tick (ascent only). */
export interface AscentLedger {
  food: AscentLedgerLine;
  supplies: AscentLedgerLine;
  gold: AscentLedgerLine;
  shortfalls: AscentShortfall[];
  /**
   * Where the season's gold goes, so the books can name what eats the treasury: hero payroll,
   * hosts, the provinces' wages, building upkeep, graft, and the tax an unpaid province keeps.
   */
  goldParts?: { payroll: number; hosts: number; wages: number; buildings: number; graft: number; softcap: number; withheld: number };
  /** Grain rotted and goods spoiled this season, above the stores' waste line. See `GranarySystem`. */
  waste?: { food: number; supplies: number };
}

/** An optional offer a story hangs on a subject the player already visits. Never an order. */
export interface StoryOpening {
  storyId: string;
  fragmentId: string;
  /** Resolved text key for the line shown in the sheet. */
  textKey: string;
  params: Record<string, string | number>;
  /** Label on the tappable row. */
  actionKey: string;
}

export type AscentLaneStatus = 'ready' | 'busy' | 'alert' | 'blocked';

export type AscentConquestMethod = 'bribe' | 'diplomacy' | 'intimidation' | 'settle' | 'occupy' | 'siege';

/** Live pressure per system, used for the bar's status dots and the idle/starvation counters. */
export interface AscentLaneState {
  conquer: AscentLaneStatus;
  court: AscentLaneStatus;
  world: AscentLaneStatus;
  lastDecisionTurn: Partial<Record<'conquer' | 'court' | 'world', number>>;
}

export interface AscentConquestPlan {
  id: string;
  landId: string;
  method: AscentConquestMethod;
  heroId?: string;
  armyId?: string;
  createdTurn: number;
  status: 'queued' | 'executing' | 'blocked' | 'complete' | 'failed';
  reason?: string;
}

/** Cumulative run activity — drives the run summary and the verify script. */
export interface AscentLaneStats {
  conquestsByMethod: Record<AscentConquestMethod, number>;
  appointments: number;
  edictsEnacted: number;
  parliamentAnswered: number;
  envoyActions: Record<string, number>;
  /** Demands answered — the counterpart to `envoyActions`, which the player initiates. */
  rivalAnswers?: number;
  /** Units of grain and goods sold through the markets, over the run. */
  storesSold?: number;
}

/** One stack level of a Power Draft card: what it applies, and the numbers printed on the card. */
export interface PowerCardLevel {
  /** Applied via `applyCourtEffect`. Use `permanent: true` for stacking cards. */
  effect: CourtEffect;
  /** Raw values the i18n card template interpolates (e.g. `{ pct: 8 }`). */
  display: Record<string, number>;
}

export interface PowerCardDef {
  id: string;
  rarity: AscentRarity;
  maxStacks: number;
  /** `levels[n]` is the payload for taking the card the (n+1)-th time; the last entry repeats. */
  levels: PowerCardLevel[];
  /** Only offered when this holds (e.g. needs a standing army). */
  requires?: (state: GameState) => boolean;
  /** When this and `evolvesWith` are both maxed, both retire and `evolvesInto` is granted. */
  evolvesWith?: string;
  evolvesInto?: string;
  /** Relative weight inside its rarity bucket. Defaults to 1. */
  weight?: number;
  /** Evolution results are granted, never rolled. */
  evolutionOnly?: boolean;
  /**
   * Offered only on the founding screen, never in a mid-run draft.
   *
   * The opening advantage is a real card rather than a bespoke system precisely so it costs
   * nothing: `applyCourtEffect` applies it, the `ascent.card.<id>` strings render it, and
   * `powerCardView` reads it. The only thing it must not do is turn up again at level three.
   */
  openingOnly?: boolean;
  /**
   * Granted only by seeing a story through, never rolled in a draft.
   *
   * These are the Chronicle's strongest reward and the reason to keep an oath: a card that exists
   * nowhere else in the game, named for the thing that actually happened in Vietnamese history.
   */
  storyOnly?: boolean;
}

/** One counter-play offered on the Empire Response prompt. */
export interface EmpireResponseOption {
  id: 'send-host' | 'hire-mercenaries' | 'fortify' | 'buy-off' | 'endure';
  /** For `send-host`: the hero picked inline on the same modal. */
  heroId?: string;
  cost?: Partial<ResourceBag>;
  /**
   * Projected win chance 0-100 — present only on the options that actually change *this*
   * battle. Absent on `send-host` (its levy is still mustering when the host lands) and on
   * `buy-off` (there is no battle to win), because quoting odds there duplicated Endure's
   * number and made five distinct answers read as one.
   */
  winChance?: number;
  delayTicks?: number;
  momentum?: number;
  /** For `send-host`: how large the levy being raised is. */
  soldiers?: number;
  /** For `fortify`: points of permanent provincial defence bought. */
  defence?: number;
  affordable: boolean;
}

/**
 * One way to take a province. Every method a province admits is offered — the ones the realm
 * cannot afford or staff right now come through greyed with a concrete `blockedReason`, because
 * seeing the locked options is how the player learns the system.
 */
export interface ConquestMethodOption {
  method: AscentConquestMethod;
  /** Resources spent up front. `humans` for settle, `gold` for bribe, `supplies` for diplomacy. */
  cost?: Partial<ResourceBag>;
  /** Ticks until the province flips, once started. */
  ticks: number;
  /** Loyalty the province starts with under your banner. */
  loyalty: number;
  /** 0-100: success odds for bribe, battle odds for siege, 100 for the certain methods. */
  chance: number;
  /** The hero or host this method would commit, resolved for the card's detail line. */
  heroId?: string;
  armyId?: string;
  /** Why it cannot be chosen right now; `undefined` means takeable. */
  blockedReason?: string;
}

/** One province card on the Conquer prompt. */
export interface ConquestTarget {
  landId: string;
  landName: string;
  landKind: 'wilderness' | 'village' | 'rival';
  /** Name of the current holder, for rival-held provinces. */
  ownerName?: string;
  garrison: number;
  /** i18n key suffix for the province's draw (`gold` | `food` | `iron` | `shrine` | `plain`). */
  rewardTag: string;
  /**
   * The economic focus the ground is best made for, and how well (0-100). The reward tag reads
   * today's outputs, which for an unbuilt village is nothing — so every village said "open
   * country" and the one thing a claim is chosen for, what the land can *become*, was nowhere
   * on the card.
   */
  suits?: { focus: LandSpecialization; pct: number };
  /** Best chance across every takeable method. Drives ordering, not the card's headline. */
  bestChance: number;
  /** True when at least one open method cannot fail — the province is takeable at no risk. */
  hasCertainMethod: boolean;
  methods: ConquestMethodOption[];
  /** Set when a claim or siege is already running here. */
  busyReason?: string;
}

/** One answer to a famine. Each spends a different store, so the choice is a real trade. */
export interface FamineOption {
  id: 'buy-grain' | 'slaughter-herds' | 'requisition' | 'endure';
  cost?: Partial<ResourceBag>;
  /** Food this option puts back in the granary. */
  food?: number;
  affordable: boolean;
}

/** One answer on the restore card. See the `restore-land` prompt. */
export interface RestoreOption {
  id: 'haste' | 'steady' | 'endure';
  cost?: Partial<ResourceBag>;
  affordable: boolean;
}

/**
 * One answer to what a province is for, or who holds it.
 *
 * `effect` is the difference the order makes, already worked out against this province rather
 * than promised in the abstract: seasonal output for a focus, the defence multiplier for the
 * walls, the commander's martial for a posting. A card that says *+9 food a season from Bạch
 * Trại* is a decision; one that says *improves food* is a slogan.
 */
export interface ProvinceOrderOption {
  /** `focus:<specialization>` · `governor:<heroId>` · `hold`. */
  id: string;
  role: 'focus' | 'governor' | 'hold';
  focus?: LandSpecialization;
  heroId?: string;
  heroName?: string;
  /** The court seat this champion would be taken from, when there is no idle one to send. */
  fromSeat?: string;
  /** The stat this posting is judged on — the province's focus decides which. */
  keyStat?: keyof HeroStats;
  /** What it changes, in the unit the card is about. */
  effect?: number;
  affordable: boolean;
}

/** One posting offered on the Appointment prompt. */
export interface AppointmentOption {
  /** `court:<positionId>` · `governor:<landId>` · `general:<armyId>` · `reserve` · `dismiss`. */
  id: string;
  role: 'court' | 'governor' | 'general' | 'dismiss';
  /** Resolved seat / province / host name. */
  title: string;
  /** The concrete bonus this hero's stats produce there, e.g. `+23% army power`. */
  effect: string;
  /** Who they would displace, if anyone. */
  detail?: string;
}

/** One answer to a rival's demand. */
export interface RivalDemandOption {
  id: 'pay' | 'refuse' | 'buy-off' | 'endure' | 'submit' | 'defy';
  cost?: Partial<ResourceBag>;
  affordable: boolean;
}

/** One action offered on the Envoy prompt. */
export type EnvoyOptionId =
  | 'gift' | 'gift-lavish' | 'grain' | 'trade' | 'exchange-buy' | 'exchange-sell'
  | 'tribute' | 'ambassador' | 'pact' | 'aid' | 'buyoff' | 'denounce'
  | 'vassalize' | 'release' | 'ignore';

export interface EnvoyOption {
  id: EnvoyOptionId;
  cost?: Partial<ResourceBag>;
  influenceCost?: number;
  /** For `ambassador`: the hero posted to that court. */
  heroId?: string;
  affordable: boolean;
  /**
   * Why an option cannot be taken, when the reason is a *standing* the player could have built
   * rather than a price they could have paid.
   *
   * Shown on the card instead of hiding the row. An option that vanishes teaches nothing; one
   * that says "needs standing of 70" tells the player what a warmer neighbour would have been
   * worth, which is the whole argument this mode has to make for diplomacy being worth playing.
   */
  blockedBy?: 'standing' | 'cooling' | 'no-battle' | 'no-host' | 'no-charter';
}

/** Every pausing decision Dragon Ascent can raise. Exactly one is live at a time. */
export type AscentPrompt =
  /**
   * Lễ Đăng Quang — the rite that makes the king, before anything else in the run.
   *
   * Raised exactly once in a player's life, gated on the dynasty store rather than on any scene
   * flag: an HMR dual instance of a scene flag re-raises it, and a store does not. It carries no
   * options because it is not a choice between things the systems know about — the four steps
   * are drawn by hand and write the founder into the dynasty store themselves. The resolver
   * accepts *any* answer and, if nothing was made, writes a rolled king, so a driver that
   * answers blind and a player who taps Skip leave the store in the same shape.
   */
  | { kind: 'coronation' }
  /**
   * Gia sản dòng họ — what the house already owns, read out before the reign is handed anything.
   *
   * A summary, not a decision, and it sits here for a reason: every meta-progression the player
   * has banked between runs — the house's level and traits, the seals slotted into the opening
   * hand, the champions the founding will lay out — was applied *silently* inside
   * `createAscentGameState`. Five stores paid out and the run simply started, so a player who had
   * spent an hour filling the Dynasty Deck opened their next reign to exactly the screen a first-
   * time player sees. The in-run inheritance chip says all of this at the *end* of a run; nothing
   * said it at the beginning.
   *
   * It carries no payload. Every number on it is read live from the stores at draw time — the
   * same rule `hasTrait` follows at each of its read sites — so the screen can never quote a
   * figure the run is not actually holding.
   */
  | { kind: 'inheritance' }
  /**
   * The first card of a run: which advantage the reign opens with.
   *
   * You are not choosing who you are — you are the king, and that was never in question. You are
   * choosing what the throne already holds when the first season turns. Options are ids of
   * `openingOnly` cards in `data/ascentCards.ts`.
   */
  | { kind: 'mandate'; options: string[] }
  /**
   * The founding: the champion who raises the dynasty.
   *
   * One champion recorded in the Codex leads the card; the rest is drawn from the whole deck.
   */
  | { kind: 'founder'; options: string[] }
  | { kind: 'power-draft'; cards: string[]; rerollCost: number; level: number }
  /** Step one of a conquest: which province. */
  | { kind: 'conquer-target'; targets: ConquestTarget[] }
  /**
   * Step two: how to take it. Raised by resolving `conquer-target`, or by tapping the map.
   *
   * `notice` carries the outcome of the attempt the player just made here, when that attempt
   * was made and refused — a bribe the nobles pocketed, a march no host was free to take. The
   * sheet re-opens with it stated, because a refusal that closes the sheet silently is
   * indistinguishable from a tap that never registered.
   */
  | { kind: 'conquer-method'; target: ConquestTarget; notice?: string }
  /** A champion arrives — from the gacha roll or from the court's Favor draft. */
  | { kind: 'hero-choice'; heroIds: string[]; source: 'summon' | 'court'; pityUsed: boolean }
  /** Where the new champion serves. Always follows a `hero-choice`. */
  | { kind: 'court-appointment'; heroId: string; options: AppointmentOption[] }
  /** A permanent law: an edict/wonder from REALM_PROJECTS, or the tax dial. */
  | { kind: 'law-choice'; projectIds: string[]; points: number; taxOptions: TaxPolicy[] }
  /**
   * The four instruments the throne does not reach for — they are raised *by* the world.
   *
   * One prompt kind for all four rather than four kinds, and that is a budget decision, not a
   * shortcut. The decision director already has nine kinds competing, four of which once fired
   * zero times in a 320-tick run before ageing was added; adding four more unbudgeted would drown
   * the mode. As one family they share a single cooldown and a single slot in `CONSIDER_ORDER`,
   * and `buildDecreeOffer` decides which instrument is most worth the interruption — a hịch when
   * a Great Invasion is telegraphed always outranks a village asking about its market days.
   */
  | {
    kind: 'decree-offer';
    instrument: DecreeInstrument;
    /** Candidate decrees, best first. */
    projectIds: string[];
    /** Province or champion the instrument is aimed at, where it takes a target. */
    targetId?: string;
    targetName?: string;
  }
  /**
   * What kind of realm this is going to be. Offered once per era, and the only thing in the mode
   * that changes how the autopilot plays rather than what the player does themselves.
   */
  | { kind: 'doctrine'; options: AscentDoctrine[]; era: EraId }
  /** The court speaks: one card drawn from `state.politicsDeck`. */
  | { kind: 'parliament'; cardId: string }
  /** The granary is empty and still draining. What the realm does about it. */
  | { kind: 'famine'; shortfall: number; options: FamineOption[] }
  /**
   * A province was fought over and the fight cost it: how hard does the throne push the
   * rebuilding? Raised by `chargeProvinceForDefence` once per province per wave, only for damage
   * worth a decision. `haste` pays the whole bill and the province is whole at once; `steady`
   * pays under half for treble pace; `endure` pays nothing and the district heals on its own
   * clocks — walls over `WALL_REPAIR_SEASONS`, the turnout over `GARRISON_RECOVER_SEASONS`, a
   * building level every `RUIN_REBUILD_TICKS`.
   */
  | {
      kind: 'restore-land';
      landId: string;
      landName: string;
      /** Masonry the fight knocked down, waiting to be rebuilt. */
      breach: number;
      /** Building levels burnt. */
      ruins: number;
      /** Militia who did not come back — people, charged to the district. */
      dead: number;
      /** Share of the turnout still recovering, 0–1. */
      spent: number;
      options: RestoreOption[];
    }
  /**
   * What a province is for, and who holds it — asked when the realm is visibly short of
   * something, or a province is standing open.
   *
   * One kind rather than two, for the same budget reason `decree-offer` gives: the director
   * already weighs ten kinds, and *tell this district to grow rice* and *post this champion to
   * it* are two answers to one question, not two questions. Offering them on one card is also
   * what makes it a decision — the focus is free and permanent, the champion is a person you
   * only have one of.
   */
  | {
    kind: 'province-order';
    landId: string;
    landName: string;
    /**
     * What raised it: the resource the realm is bleeding, ground left open, or — once, in the
     * opening — a seat that has not yet been told what it is for.
     */
    reason: 'food' | 'supplies' | 'gold' | 'undefended' | 'setup';
    /** The resource the proposed focus is chosen for; the shortage itself, or the setup's pick. */
    resource?: 'food' | 'supplies' | 'gold';
    /** The realm's net rate for that resource, so the card can show what it is answering. */
    rate?: number;
    options: ProvinceOrderOption[];
  }
  /**
   * The autopilot asks before it musters.
   *
   * A host raised on the player's behalf used to simply appear: a commander taken off a seat, a
   * fifth of the population under arms, the granary emptied into a baggage train — announced by
   * a toast, if at all. The plan is the exact one `raiseHostWithPlan` would run, so the number
   * on the card is the number the muster costs. `Chỉnh lại` hands the same plan to the raise
   * form; `Chưa cần` silences the autopilot for `MUSTER_DECLINE_TICKS`.
   */
  | {
      kind: 'muster-proposal';
      heroId: string;
      plan: {
        heroId?: string;
        soldiers: number;
        rations: number;
        provisions: number;
        composition: ArmyComposition;
        orders: ArmyOrders;
      };
      landId: string;
      /** Seasons until the host stands. */
      ticks: number;
      /** Supplies the muster itself burns, beside the baggage the plan carries. */
      suppliesCost: number;
      /** Why now: the realm is under its host target, or a wave is close. */
      purpose: 'target' | 'pressure';
      /** The front the host will press once raised, when a March Order stands. */
      frontLandId?: string;
    }
  /** A rival empire makes a demand of its own: tribute, coalition, or submission. */
  | {
      kind: 'rival-demand';
      demand: 'tribute' | 'coalition' | 'vassalage';
      kingdomId: string;
      kingdomName: string;
      gold?: number;
      ticks?: number;
      memberNames?: string[];
      options: RivalDemandOption[];
    }
  /** A rival empire, and what to do about it. */
  | { kind: 'envoy'; kingdomId: string; kingdomName: string; relations: number; power: number; options: EnvoyOption[] }
  /**
   * Something that happened between two courts, and what the realm does about it.
   *
   * The only diplomacy card the player does not start. See `WorldEventSystem` for why most of them
   * name a second court: the interesting question in this mode is never whether to be liked, it is
   * by whom — and an event that forces a side is the cheapest way to make that concrete.
   */
  | {
      kind: 'world-event';
      eventId: string;
      kingdomId: string;
      kingdomName: string;
      otherKingdomId?: string;
      otherKingdomName?: string;
      options: { id: string; cost?: Partial<ResourceBag>; affordable: boolean }[];
    }
  | {
      kind: 'empire-response';
      wave: number;
      threat: number;
      kingdomId: string;
      kingdomName: string;
      ticksToArrival: number;
      options: EmpireResponseOption[];
    }
  | { kind: 'wave-result'; wave: number; survived: boolean; lines: string[] }
  /**
   * A host of the realm's own is gone, and it was the ledger that took it.
   *
   * Tells rather than asks. A toast is the right weight for "this host is in trouble"; it is the
   * wrong weight for "this host no longer exists", which a player can miss entirely and then spend
   * the rest of the run wondering what happened to their army. The card names the host, says which
   * bill went unpaid, and says how many men walked home — so the loss is an event with a cause
   * rather than an absence.
   */
  | {
      kind: 'host-lost';
      armyName: string;
      reason: 'unpaid' | 'starved' | 'broken';
      /** Men still on their feet when it dissolved — the same number that goes home. */
      men: number;
    }
  | {
      kind: 'run-over';
      score: number;
      legacyEarned: number;
      /** How the dynasty actually fell, so the summary can say something specific. */
      cause: AscentEndCause;
      /** Name of the province whose loss ended it, when there was one. */
      landName?: string;
      /** Best single-run score before this one — the number the player is chasing. */
      previousBest: number;
      legacyTotal: number;
      /**
       * What kind of reign this was, named off its school, capstone and heaviest law.
       *
       * The summary previously had nothing to say about *how* the realm was governed, only how
       * long it lasted — which is why a decree-heavy run and a decree-free one read identically at
       * the end. Two runs that score the same should not close on the same sentence.
       */
      reign?: string;
      reignDetail?: string;
    }
  /**
   * The house grows: one dynasty level, two traits, one pick.
   *
   * Step two of the run-over **ceremony**, raised on the terminal path after the Reckoning and
   * never through the decision director — its per-kind cooldowns and court-phase window would
   * happily swallow or delay a card the player must answer before the run can end.
   *
   * Two options and no reroll, on purpose: a pick has to be a fork, not a menu. The un-taken six
   * wait for later levels.
   */
  | {
      kind: 'dynasty-level';
      level: number;
      /** The run score that bought this level — the card is shown while the run is still warm. */
      score: number;
      /** Trait ids, exactly two (fewer only when the table is nearly exhausted). */
      options: string[];
      /** Picks still queued behind this one, so the card can say a second is coming. */
      remaining: number;
    }
  /**
   * Bind a seal — step three of the ceremony, between the house growing and the closing screen.
   *
   * The three offered are cards this run actually **played**, not random loot: the one the
   * player binds is the one they have a story about. The chosen card lands in the Cabinet of
   * Seals as copy-or-new, and binding an evolution also teaches the forge its recipe. `options`
   * may be shorter than three when the reign played fewer distinct cards; a reign that played
   * none skips the step entirely (`advanceCeremony` never raises an unanswerable card).
   */
  | {
      kind: 'bind-card';
      /** Card ids played this run, best-rarity first, at most three. */
      options: string[];
    }
  /**
   * The last step of the ceremony: what the next reign opens holding.
   *
   * A summary, not a decision — "go again" has to visibly mean "go again *with*". The empty
   * opening-hand and companion rows are deliberate: the screen teaches the shape of what Phases
   * 3 and 4 will put in them before either exists.
   */
  | {
      kind: 'next-reign';
      /** Champions the founding card will deal — 5 with Second Founder, otherwise 3. */
      founderCount: number;
      traits: string[];
      level: number;
      /** Ancestral-code articles already law at the founding. */
      codes: number;
    }
  /**
   * One fragment of a running story, speaking loudly enough to stop the world.
   *
   * Carries no beat number and no total, on purpose: the player must not be able to tell
   * whether this is the second thing this story has said or the ninth. `options` is empty
   * for a `blow`, which tells rather than asks.
   */
  | {
      kind: 'story-beat';
      storyId: string;
      templateId: string;
      fragmentId: string;
      volume: StoryVolume;
      band?: StoryBand;
      /** Portrait shown beside the band, when a person is speaking. */
      speakerHeroId?: string;
      /** Interpolation for the title/body/option text keys. */
      params: Record<string, string | number>;
      options: StoryPromptOption[];
      /** One line from a seated hero. Not neutral — see `advisorFor`. */
      advisorHeroId?: string;
      advisorKey?: string;
    };

/** A card's option, resolved for display. */
export interface StoryPromptOption {
  id: string;
  cost?: Partial<ResourceBag>;
  affordable: boolean;
  /** Text key suffix for a reason the option is closed, when it is. */
  blockedKey?: string;
}

/**
 * The four ways a realm can be told to grow.
 *
 * This is the player briefing the autopilot rather than overruling it: the pick moves the weights
 * `autoBuild` scores against, the number of hosts the realm keeps, how eagerly it buys land, and
 * which rarities the Power Draft favours. It never takes an order away from the automation, which
 * is the whole point on a phone — measured, four completely different play policies finished
 * within 16% of each other because the autopilot built the same realm every time regardless.
 */
export type AscentDoctrine = 'fortify' | 'expand' | 'enrich' | 'arm';

export type AscentPromptKind = AscentPrompt['kind'];

/**
 * The tempo a host is fighting at. **Not** a tactic — a temperature.
 *
 * This used to be a three-way ring that carried the matchup as well as the tempo, and the two jobs
 * fought: `press` and `hold` had the same exchange ratio to three decimals, so pressing was simply
 * the same trade delivered faster. Splitting them is the whole of `docs/14-five-shapes-two-dials`:
 * **the shape decides which way the men are spent, the stance decides how fast.**
 *
 * It is also the dial that winds the dock. A stance is an order sent down the line rather than a
 * shape the men take: it lands on the **next** beat, and from then on it sets how fast the wind
 * clocks recover — `BATTLE_STANCE_RECOVERY`. Pressing freezes the dock and defending refills it
 * at double rate, which is what turns choosing aggression into a bet: the price is not blood, it
 * is the answers you will want three beats from now.
 *
 * No stance is ever locked. The four-beat lock this dial used to carry is retired — a game may
 * take your good options away, it may not take away the brake, and now that the stance carries
 * recovery a lock would freeze a player out of their own dock.
 */
/**
 * Named `FieldStance` and not `BattleStance` because that name is already taken by the pre-battle
 * plan the classic odds roll uses (`attackLand`, `BattlePreviewPanel`). Different system, different
 * clock, and the two must never be confused: that one is chosen once before a fight nobody watches,
 * this one is worked during an engagement on screen.
 */
export type FieldStance = 'withdraw' | 'defend' | 'balanced' | 'press';

/** A field engagement in progress, exchange by exchange. */
export interface AscentBattle {
  landId: string;
  landName: string;
  invaderArmyId: string;
  kingdomId: string;
  kingdomName: string;
  isGreat: boolean;
  round: number;
  totalRounds: number;
  stance: FieldStance;
  /** What the invader is fighting at this beat, from its doctrine. */
  theirStance: FieldStance;
  /**
   * A stance ordered but not yet in force. Lands at the top of the next beat.
   *
   * The order/effect split is what makes the two dials different *kinds* of control rather than
   * two of the same one — see `FieldStance`.
   */
  stancePending?: FieldStance;
  /** Beats spent disengaging, once the stance is `withdraw`. */
  withdrawBeats?: number;
  /**
   * Which dials the player has taken, one flag each.
   *
   * Until a dial is taken the host's own commander works it — see `generalPlaysBeat`. A line
   * standing flat while the invader reads the board every beat is not a harder fight, it is a
   * broken one.
   *
   * **Per dial, and not one flag, because one flag was a trap.** `playerSteered` used to gate the
   * commander entirely: touching *either* dial stopped him playing *both*, and stopped him
   * committing the reserve and calling the rally as well — neither of which the player has a
   * button for. Measured over forty fights of the same engagement, a player who pressed one
   * formation chip and then watched traded at **0.28** against **1.96** for never touching the
   * screen at all. The dial was not merely weak, it was worse than useless, and nothing said so.
   *
   * He now hands over exactly what was taken and goes on working the rest.
   */
  steeredFormation?: boolean;
  steeredStance?: boolean;
  /**
   * The player has taken this field by hand, and holds it until they give it up.
   *
   * **The grace window does not apply to a field somebody claimed.** `ASCENT_AUTO_DELEGATE_BEATS`
   * exists for a field that *opens* under the player and is then ignored — the code's own words,
   * "an uncommanded field is an implicitly delegated one". Tapping *Cầm quân lại* is the opposite
   * of ignoring it, and a take-back happens past beat ten by definition, so the rule used to hand
   * the field straight back on the next season. Reported as *i take control -> game back to auto*,
   * and it looked like closing the screen caused it because the battle lane holds the economy
   * clock: no tick runs while you are standing on the field, so the hand-back fires on the first
   * one after you leave.
   *
   * Set by an explicit claim — the take-back chip, or walking onto a side fight with
   * `focusBattle`. Cleared by the three ways a player gives the field up, and only those:
   * handing it to the general (*auto* / *Rời trận*), leaving the screen (`closeLane`), or moving
   * to another fight (the field left behind). Nothing else takes it away.
   */
  claimed?: boolean;

  /**
   * The shape each side is standing in — the fast dial, and the whole rock-paper-scissors.
   *
   * See `data/ascent/formations.ts` for the ring. Unlike the stance these are *instant to order and
   * slow to complete*: the order sets `formationTarget` and a `reformBeats` clock, and during that
   * window the host has **no shape at all** — the tilt reads zero and it deals less and takes more.
   * The question the whole fight is built around is whether the counter is worth the beats.
   */
  ourFormation: BattleFormation;
  theirFormation: BattleFormation;
  formationTarget?: BattleFormation;
  reformBeats?: number;
  /**
   * What `reformBeats` counted down *from*, so the dock can draw how far an order has travelled.
   *
   * Carried on the battle rather than held by the strip because `battleOrderSignature` includes
   * `reformBeats` — the strip is torn down and rebuilt on every beat of a re-form, and a tween
   * started on press would restart each time. The bar is drawn from state or it cannot be drawn.
   */
  reformTotalBeats?: number;
  /**
   * The beat an order actually landed on, and whether the shape it landed in beats theirs.
   *
   * The dock says so for a beat or two. Same reason as `reformTotalBeats`: a rebuild must not be
   * able to swallow the one moment the player pressed the chip for.
   */
  landedBeat?: number;
  landedCountered?: boolean;
  /**
   * Men each side actually lost on the last beat — the price the dock prints.
   *
   * Measured, never re-derived. A second copy of the exchange formula living in the view would be
   * one refactor away from disagreeing with the fight it claims to describe.
   */
  lastBeatLoss?: { ours: number; theirs: number };
  /**
   * How the exchange is going, kept so the screen can say so.
   *
   * `wonLast` is the beat just fought and nothing more — winning is announced the moment it is
   * true, because a round that went your way is the feedback that tells you the shape you picked
   * was right.
   *
   * Losing is deliberately **not** its mirror. One bad exchange is noise; a banner for it would
   * flicker on and off every other beat and teach the player to ignore it. `lostRun` and
   * `beatsSinceOurShape` together are the case worth interrupting for: three rounds going against
   * us and no order given in that time, which is a player who has not noticed they are being
   * countered. See `buildBattleReadout`.
   */
  wonLast?: boolean;
  lostRun?: number;
  beatsSinceOurShape?: number;
  theirFormationTarget?: BattleFormation;
  theirReformBeats?: number;
  /** Beats their shape is frozen for, bought by a Moment. Their re-form clock does not run. */
  theirShapeLockBeats?: number;
  /**
   * The invader's own dồn sức: he has doubled down on a winning shape against a player who has
   * stopped answering. Amplifies the tilt both ways while it stands and folds the moment either
   * side re-forms or his heart collapses — see `advanceEnemyWager`. Difficulty-gated; easy never.
   */
  theirCommitted?: boolean;
  /** Beats before he may wager again after one folds — his pip regen, in effect. */
  theirWagerClock?: number;
  /** The next change of shape costs no beats at all, bought by a Moment. */
  freeReform?: boolean;
  /**
   * Stamina: pips in hand for changing shape. Two to start, one spent per change, one back every
   * `BATTLE_STAMINA_REGEN_BEATS` on `staminaClock`. Absent = full (old saves). See docs/20.
   */
  stamina?: number;
  staminaClock?: number;
  /**
   * Dồn sức: a second pip wagered on the shape currently held. While it stands, the formation
   * tilt is amplified BOTH ways — a winning matchup wins bigger, a losing one bleeds worse — so
   * it is a dice roll a confident read cashes in and a wrong read pays for. Cleared the moment
   * the shape changes: the wager rides one stand.
   */
  committed?: boolean;
  /**
   * The invader's temper, from his kingdom's personality (great waves are always `cunning`).
   * Decides how fast he answers once losing and whether he presses — printed beside his name on
   * the strength rail, because a personality the player cannot see is just weather.
   */
  commanderTemper?: 'hasty' | 'measured' | 'stubborn' | 'cunning';
  /** Hosts that have broken and left the line, either side. */
  brokenHostIds: string[];
  /** Men of ours lost so far, so an orderly withdrawal can recover its stragglers. */
  ourLostTotal: number;
  /** Morale we opened with, so a rally can be scaled by how far the line has sagged. */
  ourStartMorale: number;
  /**
   * How far each line has left its own camp, 0 (at the tents) to 1 (at the enemy's).
   * Drives where the soldiers are drawn, and is what makes posture *visible*: pressing walks
   * your line across the field, holding keeps it on its own ground.
   */
  ourAdvance: number;
  theirAdvance: number;
  /**
   * Battle morale, mirrored onto `army.morale` every beat. `armyPower` multiplies by it, so a
   * line that starts failing keeps failing — this is the fight's tipping point.
   */
  ourMorale: number;
  theirMorale: number;
  /** Hosts present on each side last beat, so arriving relief can be announced. */
  ourHostCount: number;
  theirHostCount: number;
  /** Men held at camp at the outset, committed once mid-fight. */
  reserve: { spearmen: number; archers: number; heavyInfantry: number };
  reserveSpent: boolean;
  /** The general's one steadying moment. Absent entirely when nobody leads the host. */
  rallySpent: boolean;
  rallyPower: number;
  /** Defensive multiplier of the ground being fought over (`terrainDefenseMultiplier`). */
  terrainEdge: number;
  /**
   * How each side's arms meet the other's, from `compositionMatchup`. Written every beat so the
   * screen can state it in words rather than leaving the player to infer it from two bar charts.
   */
  ourMatchup?: number;
  theirMatchup?: number;
  outcome: 'fighting' | 'they-rout' | 'we-rout' | 'spent';
  /** Headcounts at the outset, so the strength bars have a denominator. */
  ourStart: number;
  theirStart: number;
  ourNow: number;
  theirNow: number;
  /** One line per exchange, oldest first. */
  log: string[];
  /** Set once the last exchange has run or a host has broken. */
  over: boolean;
  /**
   * Which side of the field is ours. `defence` is an invader striking ground we hold — the
   * original engagement; `offence` is a host of ours storming someone else's province. Absent
   * on saves written before assaults were watchable, and read as `defence`.
   */
  role?: 'defence' | 'offence';
  /** Identity of the engagement, so the screen opens itself once per fight and not per beat. */
  key?: string;
  /**
   * The hosts on each side, by id. Membership is explicit rather than "whoever stands on the
   * province": the invader that opens a defence is standing on the *adjacent* land when contact
   * is made, and an assault's own hosts stand on their origin. Enrolment happens per beat (see
   * `enrolArrivals`), so relief still simply appears the beat it arrives.
   */
  ourArmyIds?: string[];
  theirArmyIds?: string[];
  /** Beats spent closing on an assault, so a defender that never advances cannot stall the fight. */
  approachBeats?: number;
  /** The host the reserve was held back from, so committing it (or returning it) refills that host. */
  reserveHostId?: string;
  /**
   * The decision on the table right now, if any — see `BattleMoment`.
   *
   * Set by `fightRound` when the fight produces one, cleared when it is answered or when it
   * lapses. At most `BATTLE_MOMENTS_PER_FIGHT` in an engagement.
   */
  moment?: BattleMoment;
  /** How many Moments this fight has already raised, so it cannot become whack-a-mole. */
  momentsRaised?: number;
  /** Questions already asked this fight, so none is asked twice. */
  momentIds?: string[];
  /** Beat the last question was asked on, so they are spread across the fight rather than bunched. */
  momentLastBeat?: number;
  /** Beats left on a bonus a Moment bought, and what it is worth while it lasts. */
  momentBonus?: {
    beats: number;
    dealt: number;
    morale: number;
    /** Multiplier on what the line *takes* while the bonus lasts. Below 1 is protection. */
    taken?: number;
    /** Beats the formation tilt is sharpened for — `BATTLE_FORMATION_TILT_SHARP` instead of the usual. */
    sharpBeats?: number;
    /** Beats the tilt cannot be turned *against* us for. A floor, not a ceiling. */
    guardBeats?: number;
  };
  /**
   * The fight is being run by whoever holds the field, not by the player.
   *
   * Handing over used to call `finishBattle` — a one-way door that ended the engagement on the
   * spot and threw away the rest of it. It hands over the *remainder* now: the battlefield keeps
   * running, the general takes the orders beat by beat, and the player can take the field back at
   * any point. Delegation has to be a way of playing, not a way of skipping.
   */
  delegated?: boolean;
  /** The commander holding the field, and how well they read a beat. */
  generalName?: string;
  generalMartial?: number;
  /**
   * The fight as a queue of moments, oldest first — see `BattleBeat`.
   *
   * The simulation still runs `BATTLE_BEATS_PER_TICK` beats in one burst on the economy tick, and
   * must keep doing so: it is deterministic, it is what every harness drives, and re-timing it
   * would move the `Math.random` call order for every mode. What was missing is that the *screen*
   * had no way to show a burst as anything but a jump, so an entire engagement arrived in four or
   * five frozen steps with three and a half seconds of nothing between them.
   *
   * So the beats are recorded rather than re-timed. The view drains one per `BATTLE_TICK_MS` and
   * animates between them; a headless run simply never drains, and nothing about the fight changes.
   */
  beats?: BattleBeat[];
}

/**
 * One beat of a fight, as the screen needs to replay it.
 *
 * Deliberately a flat snapshot rather than a diff: the view can be opened, closed and reopened
 * mid-engagement, and a queue of diffs would be meaningless to a screen that missed the first ten.
 * Per-host figures are carried because the block is redrawn from them — a host's mark count comes
 * from its own headcount, which is what makes the ranks thin as men fall.
 */
export interface BattleBeat {
  /** Arrows still flying, or the lines already met. */
  phase: 'approach' | 'clash';
  /** Exchange number after this beat; the approach does not spend the round budget. */
  round: number;
  ourNow: number;
  theirNow: number;
  ourAdvance: number;
  theirAdvance: number;
  ourMorale: number;
  theirMorale: number;
  /** Men lost this beat, each side — the floaters, and the only per-beat delta the view needs. */
  ourLoss: number;
  theirLoss: number;
  /** Every host on the field this beat, so the view can size and shade each column on its own. */
  ourHosts: BattleBeatHost[];
  theirHosts: BattleBeatHost[];
  /** The line this beat added to `log`, if any. */
  line?: string;
  /** Hosts that broke on this beat, either side — the moment worth a shake. */
  broke?: string[];
  /**
   * What each side stood in and how much of it was bows, at THIS beat. The screen replays beats
   * a tick behind the fight, so the arrows it draws must come from the beat being shown, not from
   * the battle's current state — or a volley would rain from a shape already walked out of.
   */
  ourShape?: BattleFormation;
  theirShape?: BattleFormation;
  ourBows?: number;
  theirBows?: number;
}

export interface BattleBeatHost {
  id: string;
  men: number;
  morale: number;
}

/**
 * A decision with a deadline, raised by the fight itself.
 *
 * Deliberately **not** a reflex test. The mode's whole language is standing orders, and Dragon
 * Ascent already offers to fight without you — per host and per run — so punishing a player for
 * looking away would contradict a feature that is already shipped. What a timer is good for here
 * is forcing a *judgement* while the fight is still moving.
 *
 * Which is why letting it lapse is not a failure state: whoever holds the field answers it, using
 * the doctrine they would have used anyway. Missing a Moment costs you the edge, never the fight.
 * That makes delegation the substrate of the mechanic rather than an escape from it.
 */
export interface BattleMoment {
  /**
   * Which question this is — the id of a `BattleMomentDef`, and the stem of its i18n keys.
   *
   * Was a union of four literals, three of which were ever raised, so every fight in a run asked
   * the same three questions in the same order. The deck lives in `data/ascent/battleMoments.ts`
   * now and has thirty entries; this is a plain string because the *content* is data.
   */
  id: string;
  /** Beat it was raised on, so the view can run the timer against the same clock the fight does. */
  raisedAtBeat: number;
  /** Ticks of the world it stays open for, during which the fight does not advance. */
  ticksLeft: number;
  /** The enemy column this is about, when it is about one. */
  hostId?: string;
  /** The name to put in the question — a host, a column, a commander. */
  subject?: string;
  /** Who answers if it lapses, and whose judgement decides how well. */
  generalName?: string;
  generalMartial?: number;
}

/** What a Moment can be answered with. Two per kind, and neither is safe. */
export type BattleMomentAnswer = 'commit' | 'steady';

/** One finished engagement, kept so the run can be read back — and measured. */
export interface AscentBattleRecord {
  turn: number;
  key: string;
  landId: string;
  landName: string;
  role: 'defence' | 'offence';
  outcome: 'they-rout' | 'we-rout' | 'spent' | 'retreat';
  rounds: number;
  ourStart: number;
  theirStart: number;
  ourEnd: number;
  theirEnd: number;
  theirHosts: number;
  ourHosts: number;
  /** True when a garrison levy stood in the line (no field host of ours, or not only one). */
  levyFought: boolean;
  /** The commander who held the field, when the player handed it over. */
  generalName?: string;
  /**
   * And who they were, so the Reckoning can put a face on the report.
   *
   * The name alone is what the chronicle line needs and it is not enough for a portrait — two
   * heroes may share one, and by the time the card is read the hosts have already been dissolved,
   * so there is nothing left on the state to look the face up from.
   */
  generalHeroId?: string;
  /** Who it was fought against, and when, so the chronicle line can name them. */
  kingdomName?: string;
  year?: number;
  season?: string;
  /** Whether the player watched it or a general fought it alone. Drives the per-wave dispatch. */
  delegated?: boolean;
  /** The wave it was fought in, so a dispatch can gather one wave's silent fights. */
  wave?: number;
}

/**
 * A finished fight waiting to be read.
 *
 * `finishBattle` used to write its record straight to the chronicle and let the lane close, so the
 * most consequential thing in the mode ended with the screen simply vanishing. The record is the
 * honest account of what happened; this is the account being *shown to somebody*.
 */
export interface AscentAftermath {
  record: AscentBattleRecord;
  /** Fights the generals settled alone since the last one the player watched. */
  alsoFought: AscentBattleRecord[];
}

/** Why a Dragon Ascent run ended. Shown on the summary so a loss is legible. */
export type AscentEndCause = 'capital' | 'annihilated';

/** The acts of growth that charge ambition. See `AMBITION_COSTS`. */
export type AmbitionReason = 'province' | 'card' | 'host';

/**
 * Where in a wave cycle the run currently stands. Derived from the wave countdown rather than
 * stored — see `ascentPhaseFor`.
 */
export type AscentPhase = 'aftermath' | 'court' | 'muster';

/**
 * How an invasion ended, graded rather than binary.
 *
 * "Did the capital fall?" is too coarse to be the only question the end banner can answer: a
 * realm that broke four hosts without losing a field and one that was pushed off two provinces
 * both read as "held", and the second is the one the player needs told. Three grades, in the
 * order the run cares about them.
 */
export type AscentWaveOutcome = 'triumph' | 'held' | 'overrun';

/**
 * What the realm looked like when an invasion landed, so the end banner can report the
 * difference rather than a bare state.
 *
 * Snapshotted at the moment the hosts spawn — not when the wave counter advances — because the
 * response card can sit open for a season, and provinces taken while deciding belong to the
 * season before the invasion, not to it.
 */
export interface AscentWaveSnapshot {
  wave: number;
  boss: boolean;
  /** Who marched, so the end banner can name the crown that was broken. */
  kingdomName?: string;
  /** Provinces owned when the hosts landed. */
  lands: number;
  /**
   * Hosts that actually spawned for this wave.
   *
   * **Zero until they land.** The snapshot is opened when the wave counter advances — that is what
   * makes "a result is owed for this wave" a single fact with a single owner — and filled in when
   * `launchWave` puts hosts on the map. A wave whose spawn was skipped for want of budget keeps a
   * zero here and is counted without being announced: there was no invasion to see.
   */
  hosts: number;
  /** Invader battle power on the map the tick it landed. */
  power: number;
  /** `state.invasionsRepelled` at landing, so hosts broken is a difference, not a guess. */
  repelledAt: number;
  /** `turn` at landing, so the banner can say how long the realm was under arms. */
  turn: number;
}

/**
 * One announcement the UI plays once and clears.
 *
 * The wave lifecycle used to reach the screen only as two lines in the header strip — the same
 * strip that carries a granary finishing — so the single most consequential event in the mode
 * was typographically identical to the least. This is the signal a full-screen banner is drawn
 * from. It is a *cue*, not a log: the director raises it, the scene consumes it and sets it to
 * undefined, and nothing else reads it.
 *
 * `id` is monotonic within a run so a scene that missed a frame can tell a fresh cue from the
 * one it already played, and so a save reloaded mid-invasion does not replay the landing.
 */
export interface AscentWaveCue {
  id: number;
  phase: 'start' | 'end';
  wave: number;
  boss: boolean;
  /** Who is marching. Named on the start cue; the end cue keeps it so the banner can credit it. */
  kingdomName?: string;
  /** Hosts that landed. */
  hosts: number;
  /** Invader power: what landed (start) or what was met (end). */
  power: number;
  // ── end only ──
  outcome?: AscentWaveOutcome;
  /** Hosts destroyed or routed off the map. */
  hostsBroken?: number;
  /** Provinces lost while the invasion stood on the map. */
  landsLost?: number;
  /** Provinces held at the end. */
  landsHeld?: number;
  /** Momentum paid for surviving it. */
  momentum?: number;
  /** Total invasions the realm has now outlived — the run's headline achievement counter. */
  survived?: number;
  /** Seasons the realm spent under arms. */
  seasons?: number;
}

export interface AscentState {
  /**
   * Skirmish only: the setup page's pin on the speech bubbles' linger, in ms. `-1` keeps them
   * forever, `0` silences them; absent, the fight follows the difficulty profile and the wave
   * escalation caps. See `battleOptions.battleBubbleMs`.
   */
  arenaBubbleMs?: number;
  /** Wave counter. Threat scales as BASE * GROWTH^wave; every 4th wave is a Great Invasion. */
  wave: number;
  ticksToWave: number;
  bossTelegraphed: boolean;
  /** True between a wave launching and the last of its hosts leaving the map. */
  waveInFlight: boolean;
  /** Whether the wave currently in flight is a Great Invasion. */
  lastWaveBoss: boolean;
  /** Invasion count at the end of the previous tick, to detect a wave finishing. */
  invasionsLastTick: number;
  /**
   * The wave whose result has not yet been reported, and the snapshot it is measured against.
   *
   * Survival used to be reported by the *next* wave's clock: the toast said "wave 6 broken" at
   * the moment wave 7 was raised, which could be five seasons after the last host of wave 6 died
   * and often landed in the same breath as the new threat. Held here instead, the result is paid
   * and announced the tick the map clears — and `startWave` keeps the old behaviour as a fallback
   * for the waves that never do clear, so the count stays honest when two overlap.
   */
  pendingWave?: AscentWaveSnapshot;
  /**
   * Banner cues the UI plays in order and clears. See `AscentWaveCue`.
   *
   * A queue rather than a slot, and that is not defensive: a wave the realm plainly holds is met
   * without a response card, so `startWave` resolves the previous invasion and launches the next
   * one **inside the same tick**. With one slot the landing overwrote the result, and the run's
   * wins were the cues that went missing — measured over a 337-tick run, 25 landings were
   * announced against 13 results.
   */
  waveCues?: AscentWaveCue[];
  /** Monotonic id for the cues above. */
  waveCueSeq?: number;
  /** Cached POWER and last tick's value, so the HUD can tween the delta ticker. */
  power: number;
  powerPrev: number;
  peakPower: number;
  /** The incoming wave's power, for the THREAT readout. Measured from live hosts when a
   *  wave is on the map, projected from the curve between waves. */
  threat: number;
  /** What the realm can actually field against a wave: hosts + fortifications. THREAT is
   *  coloured against this rather than against POWER, which includes the economy. */
  defensePower: number;
  level: number;
  /** Momentum toward the next Power Draft. */
  xp: number;
  xpToNext: number;
  /** Level-ups earned but not yet drafted — drafts stack rather than being dropped. */
  pendingLevelUps: number;
  /** How many times each Power Draft card has been taken. */
  cardStacks: Record<string, number>;
  /** Cards consumed by an evolution; never offered again. */
  retiredCards: string[];
  /** Per-rarity draft weights. Live on state so they can drift within a run. */
  draftWeights: Record<AscentRarity, number>;
  /** Summons since the last gold-or-better result (soft pity). */
  summonPity: number;
  summonsDone: number;
  /** Gold cost of the next reroll in the open draft; doubles per use, resets on resolve. */
  rerollCost: number;
  /** The province the autopilot is marching on. */
  frontLandId?: string;
  /** The seat of the dynasty. Losing it for too long ends the run — see `checkAscentDefeat`. */
  capitalLandId?: string;
  /** Consecutive ticks the capital has been in enemy hands. Resets the moment it is retaken. */
  capitalLostTicks: number;
  /**
   * The player has asked for story beats to wait for them instead of interrupting play.
   *
   * Off by default. When set, the DecisionDirector never raises a story-beat prompt: the
   * story keeps holding its card, the Chronicle lane marks it as wanting an answer, and the
   * player goes and answers it on the story page when they feel like it.
   *
   * This is the pacing dial handed to the person it actually belongs to. The Chronicle is the
   * least time-critical thing the director can raise, and a player who would rather read four
   * stories in one sitting than be stopped four times should not have to take the second deal
   * to get the first.
   */
  storyCardsMuted?: boolean;
  /** True when the front is too strong to storm, so hosts are holding at the border. */
  frontBlocked: boolean;
  /** Ticks before another Conquer prompt may be raised, so holding does not re-prompt at once. */
  marchCooldown: number;
  promptQueue: AscentPrompt[];
  /** Cumulative autopilot activity — drives the run summary and the verify script. */
  autopilotStats: { builds: number; upgrades: number; recruits: number; marches: number };
  laneState: AscentLaneState;
  conquestPlans: AscentConquestPlan[];
  decisionPressure: number;
  idleTicks: number;
  laneStats: AscentLaneStats;
  wavesSurvived: number;
  heroesSummoned: number;
  /**
   * Rubbings the cabinet's in-run faucets paid *this reign* — the tenth-wave milestone and the
   * deeds. A receipt, not a wallet: the rubbings themselves are in `mandate:cabinet:v1`, which
   * has no memory of which reign paid them. Read by `readInheritance` for the live ledger.
   * Optional so a save from before it existed loads as zero.
   */
  rubbingsEarned?: number;

  // ── Decision scheduler (see systems/ascent/DecisionDirector.ts) ──
  /** Ticks remaining before each prompt kind may be raised again. */
  promptCooldowns: Partial<Record<AscentPromptKind, number>>;
  /** Ticks each kind has been ready to speak but was outranked. Drives starvation promotion. */
  promptWaiting: Partial<Record<AscentPromptKind, number>>;
  /** Seasons before the realm will raise the famine card again. */
  famineCooldown: number;
  /**
   * The engagement the player is **commanding** — the one the battle screen shows and the one
   * every dial on it moves. Its meaning is unchanged; what changed is that it is no longer the
   * only fight that can be running.
   */
  activeBattle?: AscentBattle;
  /**
   * The other live fronts. Always delegated: one pair of hands, one field.
   *
   * A wave that strikes three provinces used to fight one of them and settle the rest as hidden
   * dice, because `maybeRequestBattleDecision` refused outright while anything was live — the
   * alternative on offer at the time was *queuing*, which froze the second invader for the length
   * of the first fight and made a three-host wave take three fights' worth of seasons to land.
   * Running them side by side is the third answer: nobody waits, the generals hold the fronts the
   * player is not standing on, and `focusBattle` moves the player between them.
   *
   * Capped at `MAX_LIVE_BATTLES - 1`. Past that the war stops being something a thumb can hold.
   */
  sideBattles?: AscentBattle[];
  /**
   * Provinces whose field defence was routed, by the wave it happened in.
   *
   * Once the line at a province has broken, a further enemy column reaching the same walls this
   * wave settles by dispatch instead of raising a fresh field: without this, the next column
   * re-opened a fight against the beaten militia's remnant — measured, a defence lost 1,394 →
   * 253 at one tick and a new fight with 253 against 3,734 the tick after, on a province whose
   * walls were already carried. A field host of ours arriving (relief) lifts the rule.
   */
  routedGround?: Record<string, number>;
  /**
   * The standing answer to *who holds the dials* — remembered across fights.
   *
   * **Default: the generals.** A run is a realm, not a duel: waves land on three provinces at
   * once and most of them are held by somebody the player appointed. Opening every field under
   * the player's own hand meant a fight nobody had asked for stopped the world for a first
   * order, and a player who had already handed the war over had to hand it over again, fight
   * after fight. Reported verbatim: *by default fight will automatically control.*
   *
   * Set by the take-back and hand-over chips, so the last thing the player did is what the next
   * field opens as. Undefined reads as true, which keeps old saves on the same rule.
   */
  handToGenerals?: boolean;
  /**
   * Set on the tick a *second* front goes live, and cleared by the screen that answers it.
   *
   * The world stops for it. Two fights at once is the one event in this mode that changes what
   * the player should be doing rather than merely how well it is going, and it used to be the
   * event that could not happen at all.
   */
  frontsOpened?: number;
  /** True while the player has handed battles back to their generals. Reversible from Settings. */
  autoResolveBattles: boolean;
  /** True when the autopilot may muster without asking. Off by default; reversible from Settings. */
  autoMusterSilently?: boolean;
  /** The turn before which the autopilot will not propose another muster — a declined card. */
  musterDeclinedUntil?: number;
  /**
   * True when the court may take a province without asking. Off by default; reversible from the
   * Build screen, where the claim slots it spends are already on show.
   */
  autoClaimSilently?: boolean;
  /** The turn before which the autopilot will not propose another claim — a declined sheet. */
  claimDeclinedUntil?: number;
  /**
   * The bar's hint card — the advisor's line said once over the lane it points at — turned off
   * for this run from the ledger sheet. Off means the dots alone, as before.
   */
  barHintsMuted?: boolean;
  /**
   * Hands-on rule (tự tay cai trị) — the fully manual run. No card the lanes could do for you is raised (the province
   * asking for orders, the court asking for a seat, the muster and claim proposals, the expansion
   * and envoy nudges), and the autopilot does not build, march, recruit or claim. Events with
   * consequences — invasions, famines, demands, stories, the draft, the ceremony — still come.
   * Set from the mandate card's checkbox and from the run menu.
   */
  hardcore?: boolean;
  /**
   * This state exists to fight one battle and nothing else — see `BattleArenaScene`.
   *
   * `advanceAscentTick` runs only the fight when it is set, so a matchup can be watched without
   * a wave landing on top of it or a card taking the screen. Never set on a real run, and never
   * written to a save: the arena builds its state fresh every time it is entered.
   */
  arena?: boolean;
  /** Wave whose engagement has already been watched. Kept for saves written before `lastWatchedKey`. */
  lastWatchedWave: number;
  /** `wave:landId` of the engagement already watched, so a siege asks once per province, not per tick. */
  lastWatchedKey?: string;
  /** The last few engagements, newest last. Optional so old saves need no migration. */
  battleHistory?: AscentBattleRecord[];
  /**
   * The fight that just ended, waiting to be read.
   *
   * Set by `finishBattle` and cleared when the player dismisses the card. It is not the same as
   * the last entry in `battleHistory`: the chronicle keeps every fight forever, and this is the
   * one that has not been shown yet.
   */
  pendingAftermath?: AscentAftermath;
  /** How far through `battleHistory` the aftermath cards have reported. */
  aftermathReported?: number;
  /** The last wave a dispatch was raised in, so delegated fights report at most once a wave. */
  lastDispatchWave?: number;
  /** Key of the last assault of ours that was watched, so a run can be measured for it. */
  lastAssaultKey?: string;
  /** Commanded hosts already warned about being a remnant, so the toast fires once per host. */
  remnantWarnedIds?: string[];
  /** Set when the run ends, so the summary can name the cause rather than shrug. */
  endCause?: AscentEndCause;
  /** Province whose fall ended the run. */
  endLandName?: string;
  /** The turn the last prompt was raised, enforcing a gap of real play between modals. */
  lastPromptTurn: number;
  /**
   * Prompts of every kind this run has actually put in front of the player.
   *
   * The Chronicle's share is measured against this. It used to be measured against `turn / 4`,
   * which is a count of *seasons*, not of prompts — and the two are not proportional: a measured
   * run raised 153 prompts in 320 seasons, so a budget that read "15% of a run's prompts" was in
   * fact handing out 7.8% of them. Optional so saves written before it loads without migration;
   * an absent count simply starts the budget over.
   */
  promptsRaised?: number;
  /** Parliament cards already drawn this run — the deck draws without replacement. */
  drawnCourtCards: string[];
  /** Ticks until the court may speak again; mirrors `court.cardCooldown` for this mode. */
  courtCardCooldown: number;
  /**
   * Defensive power recorded at each recent wave. The wave curve reads this `WAVE_LAG` waves
   * back rather than the live figure, so a strong run of picks buys real breathing room
   * instead of instantly inflating the next wave. Only the recent tail is kept.
   */
  defenceSamples: number[];

  // ── Ambition (see systems/ascent/AmbitionSystem.ts) ──
  /**
   * Standing ambition: how much the realm has recently taken, and therefore how much larger
   * the next wave will be. Charged by growth, shed at each wave. **This is what waves are
   * sized against** — see `waveTargetPower`.
   */
  ambition: number;
  /** Charged this cycle, so the Court phase can show the dial climbing as the player commits. */
  ambitionThisWave: number;
  /**
   * The ambition multiplier locked in when the current wave was raised.
   *
   * Snapshotted rather than read live because the counter decays the moment the wave is
   * named: without this the host that actually spawns would be smaller than the number the
   * player was quoted while deciding, which is precisely the kind of quiet lie that makes a
   * readout worthless.
   */
  waveHeat: number;
  /** Every point ever charged, for the run summary. */
  ambitionSpent: number;
  /** The highest the counter reached — how far the player actually pushed it. */
  ambitionPeak: number;
  /**
   * Walls and companies bought off the response card this run. Each one makes every later gold
   * price dearer — see `warPurchaseMultiplier`. This is what bounds how much survival a
   * treasury can simply buy.
   */
  warPurchases: number;
  /**
   * The scaled purse's smoothed multiplier on routine prices (`priceScale.ts`). Optional so a
   * save written before it existed loads at 1 and steps toward the live figure.
   */
  priceScale?: number;
  /**
   * The smoothed wealth factor of each store (`priceScale.ts`): what a hoard adds to the price
   * of the things that store buys. Optional for the same save reason as `priceScale`.
   */
  wealthScale?: { gold: number; food: number; supplies: number };
  /** The opening's "what is the seat for?" card has been offered; it is asked once. */
  setupOrderOffered?: boolean;
  /** Lots of each store sold through the markets this season (`SALE_LOTS_PER_SEASON`), by turn. */
  storeSales?: Partial<Record<'food' | 'supplies', { turn: number; lots: number }>>;
  /** Wave in which Twice-Born last reformed a broken host, so it fires once per wave. */
  twiceBornWave: number;

  /**
   * Turn a hostile host was last on or beside the player's ground.
   *
   * The floor under `EnemyCommandDirector`'s randomised cadence measures from this, so a run of
   * quiet rolls cannot reproduce the "ten minutes, no battle" defect. Optional: an in-flight save
   * from before this existed reads as 0, which simply forces contact on the next tick.
   */
  lastContactTurn?: number;
  /**
   * Ticks of quiet this wave allows before a war is sent regardless of standing.
   *
   * Re-rolled once per wave by `startWave` (see `peaceFloorTicks`): long while the realm is
   * young, tightening as the run ages, and jittered so the guarantee is never a number the player
   * can count to. Held on the state rather than recomputed on demand because a jittered threshold
   * re-rolled every tick collapses into its own minimum.
   */
  peaceFloor?: number;
  /** Whether the "quiet too long" warning has already been given for this stretch of peace. */
  quietWarned?: boolean;
  /**
   * The relations dial the wave now in flight was *quoted* with, locked at `startWave`.
   *
   * Read back by `launchWave` rather than recomputed, because the response card can stand open for
   * a season and relations move while it does. A wave has to land at the size the card said it
   * would, or the price the player was asked to pay was for a different war.
   */
  waveDialBudget?: number;
  waveDialHosts?: number;
  /** The shape the wave in flight is wearing — see `waveShapeFor`. */
  waveShape?: WaveShapeId;
  /** The court that sent the wave now in flight, so the dial and the World lane agree on who. */
  waveAggressorId?: string;
  /** Turn each court last sent us a relief column, for the ask's cooldown. Keyed by kingdom id. */
  allyAidTurn?: Record<string, number>;
  /** Turn the last world event was raised, so they keep a minimum gap. */
  lastWorldEventTurn?: number;
  /**
   * Consecutive refusals per prompt kind, so a card nothing can answer is dropped rather than
   * holding the queue for the rest of the run. Cleared the moment that kind resolves. See the
   * note in `resolveAscentPrompt`.
   */
  promptRefusals?: Partial<Record<string, number>>;
  /** Whether the "capital left ungarrisoned" strike has already fired for this exposure. */
  capitalExposedFired?: boolean;
  /** Live rival count last tick, so an empire collapsing is seen as a transition. */
  lastRivalCount?: number;
  /** Rivals whose ground the realm already borders, so a *new* frontier is what triggers a strike. */
  borderedRivalIds?: string[];

  /** Ticks until the next border raid may be sent. */
  raidCooldown: number;
  /** Cooldowns on each rival-initiated demand, so they arrive as pressure not as spam. */
  tributeCooldown: number;
  coalitionCooldownTicks: number;
  vassalCooldown: number;
  /** Set when a coalition was endured: the next wave arrives as a multi-empire invasion. */
  coalitionPending: boolean;
  /** Heroes the player chose to hold free; not re-prompted until postings change. */
  reservedHeroIds: string[];
  /** The founder chosen at the run's start: never dismissed. */
  founderHeroId?: string;
  /** Consecutive seasons the treasury has sat at nothing while losing money (autopilot hygiene). */
  brokeTicks?: number;
  /** The last season the autopilot let a champion go, so it never does so twice in a row. */
  lastPayrollTrimTurn?: number;
  /** Seat count when the reserve list was last taken, so a new seat reopens the question. */
  reserveSeatMark: number;
  /** Play-earned edicts already announced, so each "within reach" toast fires exactly once. */
  knownEdictIds?: string[];
  /** What kind of realm the player has told the autopilot to build. Unset until the first choice. */
  doctrine?: AscentDoctrine;
  /**
   * The second course, held beside the first (Twin Doctrine, `dynastyTraits`).
   *
   * Composed with `doctrine` rather than replacing it: the multiplicative terms multiply and the
   * additive host count adds, so every existing reader — output, defence, claim interval, militia,
   * draft lean — keeps working with no knowledge that a second slot exists.
   */
  doctrine2?: AscentDoctrine;
  /** Eras whose doctrine card has already been offered, so each era asks exactly once. */
  doctrineErasAsked?: EraId[];
  /**
   * How far through the run-over ceremony this state has walked.
   *
   * On `AscentState` and not on the store, because it is about *this* run ending, not about the
   * house: a reload lands on the menu and the ceremony is over regardless.
   */
  ceremonyStage?: 'reckoning' | 'levels' | 'bind' | 'reign' | 'done';
  /** Champions whose `arrival` has already fired, by hero id. Not a flag on the Hero: a hero
   *  re-cloned out of the deck would lose it, and this is also what the run summary counts. */
  arrivalsFired?: string[];
  /** Rival crowns taken this run, for the summary. */
  vassalsTaken?: number;
}

export interface GameState {
  year: number;
  season: Season;
  turn: number;
  /**
   * Ticks the current season has been held, 0-based. Optional so old saves load: absent reads as 0,
   * which costs a resumed run at most one short season. See `SEASON_TICKS`.
   */
  seasonTick?: number;
  realtimeSeconds: number;
  /**
   * How far through the current economy tick the world's clock is, 0..1 — written by the scene
   * every frame, absent when the state runs headless.
   *
   * An order's ticks are banked at tick boundaries, so a march given late in a tick used to be
   * most of a tick's progress ahead of the clock the moment it was given: a one-season march
   * ordered two thirds of the way through a season arrived a third of a season later. A fresh
   * march reads this to start that far *behind* zero, so a march of x seasons takes x seasons of
   * wall time and resolves on the boundary after them — which is also what the map draws.
   */
  tickPhase?: number;
  ordersRemaining: number;
  resources: ResourceBag;
  resourceRates: ResourceBag;
  mapRenderMode: MapRenderMode;
  mapSettings: MapGenConfig & { neutralDistrictTarget: number };
  hexTiles: HexTile[];
  mapConfig: MapGenConfig;
  /** This run's wardrobe roll. Absent on saves made before the roll existed. */
  muster?: MusterRoll;
  lands: Land[];
  kingdoms: Kingdom[];
  armies: Army[];
  heroes: Hero[];
  heroDeck: Hero[];
  politicsDeck: PoliticsCard[];
  activeCourtModifiers: CourtModifier[];
  court: CourtState;
  activeHeroDraft?: Hero[];
  activePoliticsCard?: PoliticsCard;
  pendingCourtRequest?: PoliticsCard;
  isPaused: boolean;
  isStrategyPause: boolean;
  /**
   * The player is not here. Set when the tab is hidden or the window loses focus, cleared when
   * it comes back — see `game/awayPause.ts`.
   *
   * A third pause rather than a reuse of `isPaused`, because the two are cleared by different
   * things: `drainAscentPrompts`, the lane frame, the war board and the battle shell all clear
   * `isPaused` on their own schedule, and any of them firing while the player was away would
   * have started the war up again in an empty room. This one is owned by exactly one module and
   * is never written from the run's own logic.
   *
   * Never saved: a snapshot taken while away must not restore into a pause nothing will clear.
   */
  isAwayPause?: boolean;
  selectedLandId?: string;
  selectedArmyId?: string;
  latestBattlePreview?: BattlePreview;
  latestBattleResult?: BattleResult;
  /** The dead this reign put up a shrine to. Never evicted; the Chronicle's ring is. */
  memorials?: Memorial[];
  /**
   * What the last story beat did, waiting to be shown once.
   *
   * The card the player answered printed a *price* and never a result, which is most of why a
   * run of six beats can leave nobody any the wiser. Deliberately not an `AscentPrompt`: it would
   * come out of `STORY_PROMPT_SHARE` and be rationed against the story cards themselves, so it
   * is shown in the rectangle the player is already reading and costs the director nothing.
   */
  lastStoryOutcome?: {
    templateId: string;
    fragmentId: string;
    params: Record<string, string | number>;
    outcome: StoryOutcome[];
    historicity?: Historicity;
  };
  acquisitionOrders: AcquisitionOrder[];
  buildOrders: BuildOrder[];
  movementOrders: MovementOrder[];
  siegeOrders: SiegeOrder[];
  recruitmentOrders: RecruitmentOrder[];
  message: string;
  victory: boolean;
  gameMode: GameMode;
  campaignConfig?: CampaignConfig;
  campaignScore?: CampaignScore;
  dynastyStatus?: DynastyStatus;
  spyReports: SpyReport[];
  scheduledCampaignEvents: CampaignEvent[];
  /** Active off-map invasions (empire mode only). */
  invasions?: InvasionRecord[];
  /** Transient notification queue (empire mode). */
  toasts?: Toast[];
  /** Persistent notification history, read via the notification bell/log (all modes). */
  eventLog?: GameEvent[];
  /** Live objectives board (empire mode). */
  directives?: Directive[];
  /** Rotating cursor into the directive template deck, per tier. */
  directiveDeckCursor?: Record<DirectiveTier, number>;
  /** Progression track (empire mode). */
  mandate?: MandateState;
  /** Realm-wide tax stance (empire mode). Absent = 'balanced'. */
  taxPolicy?: TaxPolicy;
  /** The tax dial as a continuous 0..1 rate (Dragon Ascent's slider). Absent = read `taxPolicy`. */
  taxRate?: number;
  /** Accumulated resentment from sustained heavy taxation — compounds unrest until you ease off. */
  taxFatigue?: number;
  /** A pausing intelligence alert (spy report of an incoming attack) awaiting acknowledgement. */
  pendingThreatAlert?: ThreatAlert;
  /** A field battle awaiting the player's tactical decision (attack / delegate / retreat). */
  pendingBattle?: PendingBattle;
  /** A telegraphed major invasion awaiting its due turn (empire mode). */
  pendingUltimatum?: Ultimatum;
  /** Great Invasions already staged this run, keyed by era, so bosses fire once/era. */
  greatInvasionEras?: EraId[];
  /** Regenerating pressure budget the ThreatDirector spends to spawn invasions. */
  threatBudget?: number;
  /** Cooldown before another Grand Coalition can form against a dominant player. */
  coalitionCooldown?: number;
  /** Count of invasion hosts the player has repelled (drives some directives). */
  invasionsRepelled?: number;
  /** Number of Wonders completed (drives directives + capital art tier). */
  wondersBuilt?: number;
  /** Guards one-time Legacy banking at the terminal (victory/defeat) screen. */
  legacyBanked?: boolean;
  /** Remaining cooldown ticks per royal ability (empire mode). */
  abilityCooldowns?: Record<string, number>;
  /** In-flight hero missions resolving on a tick timer (empire mode). */
  heroMissions?: HeroMission[];
  /** Remaining cooldown ticks per hero signature ability, keyed by heroId (empire mode). */
  heroAbilityCooldowns?: Record<string, number>;
  /** A personal hero dilemma awaiting the player's decision (empire mode). */
  pendingHeroEvent?: HeroEvent;
  /** Ticks until another hero event may surface. */
  heroEventCooldown?: number;
  /** Kingdom-wide diplomatic reputation 0-100; eases deals, raised/lowered by honoring/breaking treaties. */
  prestige?: number;
  /** A foreign-affairs dilemma awaiting the player's decision. */
  pendingForeignCard?: ForeignCard;
  /** Ticks until another foreign event card may appear. */
  foreignCardCooldown?: number;
  /** Dragon Ascent run state (ascent mode only). */
  ascent?: AscentState;
  /** The single live Dragon Ascent decision; set by `drainPromptQueue`, cleared by `resolveAscentPrompt`. */
  pendingAscentPrompt?: AscentPrompt;

  // ── The Chronicle (ascent only; optional so older saves load unchanged) ──
  /** Stories currently running. Most are latent — seeded with no announcement at all. */
  stories?: ActiveStory[];
  /** Undertakings the player has sworn to a story and not yet kept. */
  storyCharges?: StoryCharge[];
  /** What has already happened, in past tense. Never a task list. */
  chronicle?: ChronicleEntry[];
  /** Last tick's world snapshot, so a story can notice what changed. */
  storyWatch?: StoryWatch;
  /** Story cards raised so far, against total prompts — holds the ~15% budget. */
  storyPromptsRaised?: number;
  /** The realm's books: gross, demand and net per resource, plus who is going without. */
  ascentLedger?: AscentLedger;
  /**
   * Provinces whose officials have stopped collecting because they have not been paid.
   *
   * An unpaid province's gold output is withheld until the treasury recovers — the coin
   * shortfall made visible as a *place*, not a subtraction. The line the player sees is the
   * same one the Reed Banner uses ("X paid no tax this season"), on purpose: from the throne,
   * a rebellion and an unpaid clerk look identical until you go and find out.
   */
  unpaidLandIds?: string[];
  /** The season each unpaid province's arrears began, so a write-off can find them (ascent). */
  unpaidSince?: Record<string, number>;
  /** Last season each shortfall kind was announced, so the header does not nag every tick. */
  shortfallToastTurns?: Partial<Record<'food' | 'supplies' | 'gold' | 'goldRatchet', number>>;
  /**
   * Templates that have already run their course this run.
   *
   * A finished story must not seed again: six stories told once each is the design, and a
   * template re-seeding mid-run puts the same opening line in the Chronicle twice, which is
   * precisely the visible repetition a salience pool is most exposed to.
   */
  storiesEnded?: string[];

  isDefeated: boolean;
  defeatReason?: 'conquest' | 'collapse';
}
