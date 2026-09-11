import { PLAYER_KINGDOM_ID } from '../../game/constants';
import { addCourtModifier } from '../CourtSystem';
import { addOpinionModifier } from '../DiplomacySystem';
import { t } from '../../i18n';
import { applyResourceDelta } from '../ResourceSystem';
import { scaledGain } from '../ascent/priceScale';
import { pushToast } from '../empire/notifications';
import { launchPunitiveHost } from '../ascent/EnemyCommandDirector';
import { findPowerCard } from '../../data/ascentCards';
import { getProject as findProject } from '../../data/edicts';
import { generateHero } from '../../data/heroFactory';
import { recordEcho } from './echoes';
import type { StoryCtx } from './types';
import type {
  Army, AscentRarity, Hero, Kingdom, Land, LandBuildingType, ResourceBag,
} from '../../state/types';

/**
 * The outcome vocabulary.
 *
 * A story fragment should read like a sentence about the world, not like a patch to `GameState`.
 * Everything a story is allowed to do to the player lives here, once, with the guards in one
 * place — so a fragment says `defectHost(ctx)` and cannot forget to clear the general, strand the
 * army on a province nobody owns, or leave a court seat pointing at a hero who no longer exists.
 *
 * Grouped the way the design document groups them: war, rebellion, heroes, land, resources,
 * diplomacy, **rules**, and legacy. The rules layer is the one that matters most — a resource
 * swing is forgotten within a minute, while a card entering your draft deck changes how the rest
 * of the run is *played*.
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

export function ourLands(ctx: StoryCtx): Land[] {
  return ctx.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
}

export function ourHosts(ctx: StoryCtx): Army[] {
  return ctx.state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
}

export function theirHosts(ctx: StoryCtx): Army[] {
  return ctx.state.armies.filter((army) => army.kingdomId !== PLAYER_KINGDOM_ID);
}

function headcount(army: Army): number {
  return army.units.spearmen + army.units.archers + army.units.heavyInfantry;
}

function scaleUnits(army: Army, factor: number): void {
  army.units.spearmen = Math.max(0, Math.floor(army.units.spearmen * factor));
  army.units.archers = Math.max(0, Math.floor(army.units.archers * factor));
  army.units.heavyInfantry = Math.max(0, Math.floor(army.units.heavyInfantry * factor));
}

/** Detaches a hero from every office, seat and command. Used before removing or moving them. */
function unseat(ctx: StoryCtx, hero: Hero): void {
  const { state } = ctx;
  hero.assignedTo = undefined;
  for (const seat of Object.keys(state.court.seats)) {
    const key = seat as keyof typeof state.court.seats;
    if (state.court.seats[key] === hero.id) state.court.seats[key] = undefined;
  }
  for (const army of state.armies) {
    if (army.generalHeroId === hero.id) army.generalHeroId = undefined;
  }
  state.heroMissions = (state.heroMissions ?? []).filter((mission) => mission.heroId !== hero.id);
}

// ── War ─────────────────────────────────────────────────────────────────────

/** A host arrives already raised. The one gain that is felt immediately rather than banked. */
export function grantHost(ctx: StoryCtx, size: number, at?: Land): Army | undefined {
  const home = at ?? ctx.land() ?? ourLands(ctx)[0];
  if (!home) return undefined;
  const army: Army = {
    id: `story-host-${ctx.story.id}-${ctx.state.turn}`,
    kingdomId: PLAYER_KINGDOM_ID,
    name: home.name,
    landId: home.id,
    units: {
      spearmen: Math.round(size * 0.6),
      archers: Math.round(size * 0.28),
      heavyInfantry: Math.round(size * 0.12),
    },
    morale: 88,
    supply: 70,
    rations: Math.round(size * 0.3),
    provisions: Math.round(size * 0.2),
    level: 1,
    experience: 0,
    experienceToNextLevel: 140,
  };
  ctx.state.armies.push(army);
  ctx.note('soldiers', size);
  return army;
}

/** Veterans folded into whatever host we already have. Cheaper drama than a whole new army. */
export function reinforceHosts(ctx: StoryCtx, soldiers: number): void {
  const hosts = ourHosts(ctx).sort((a, b) => headcount(b) - headcount(a));
  if (hosts.length === 0) return;
  const each = Math.floor(soldiers / hosts.length);
  for (const army of hosts) {
    army.units.spearmen += Math.round(each * 0.6);
    army.units.archers += Math.round(each * 0.3);
    army.units.heavyInfantry += Math.round(each * 0.1);
    army.morale = Math.min(100, army.morale + 6);
  }
  ctx.note('soldiers', each * hosts.length);
}

/** A free elite tier on every host. Small number, large felt difference. */
export function grantEliteTier(ctx: StoryCtx): void {
  for (const army of ourHosts(ctx)) {
    army.elite = Math.min(2, (army.elite ?? 0) + 1);
  }
  ctx.note('elite', 1);
}

/**
 * A host defects — **with its general**, which is the whole sting. Losing an army is arithmetic;
 * losing the man you trusted with it is a story.
 */
export function defectHost(ctx: StoryCtx, toKingdomId?: string): Army | undefined {
  const hosts = ourHosts(ctx).filter((army) => army.generalHeroId);
  const army = hosts.sort((a, b) => headcount(b) - headcount(a))[0] ?? ourHosts(ctx)[0];
  if (!army) return undefined;

  const rival = toKingdomId
    ?? ctx.rival()?.id
    ?? ctx.state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated)?.id;
  if (!rival) return undefined;

  const general = ctx.state.heroes.find((hero) => hero.id === army.generalHeroId);
  army.kingdomId = rival;
  army.morale = Math.min(100, army.morale + 12);
  if (general) {
    unseat(ctx, general);
    ctx.state.heroes = ctx.state.heroes.filter((hero) => hero.id !== general.id);
    army.name = general.name;
  }
  return army;
}

/**
 * The realm largest host marches over the border and is not here any more.
 *
 * The lever, as opposed to the wager: a wager spends resources you could have spent on the
 * army, and this spends *the army*. The host is removed from the map outright - it cannot
 * defend, cannot be recalled, and does not appear in defensePower - and its strength is
 * remembered so a later beat can bring it home.
 *
 * Deliberately a removal rather than a flag on the army. Every system that counts our strength
 * would otherwise have to learn about a new kind of absence, and each one that forgot would
 * quietly hand the player back the defence they had just gambled.
 *
 * Returns the soldiers committed, or 0 when there was no host to send.
 */
export function commitHostAbroad(ctx: StoryCtx, key = 'abroad'): number {
  const host = ourHosts(ctx).filter((army) => !army.isLevy)
    .sort((a, b) => headcount(b) - headcount(a))[0];
  if (!host) return 0;
  const size = headcount(host);
  ctx.remember(key, size);
  ctx.remember(`${key}Level`, host.level ?? 1);
  ctx.state.armies = ctx.state.armies.filter((army) => army.id !== host.id);
  ctx.note('hostAbroad', size);
  return size;
}

/** Brings home what `commitHostAbroad` sent, at whatever share of it survived. */
export function returnHostFromAbroad(ctx: StoryCtx, share = 1, key = 'abroad'): number {
  const size = Math.round(ctx.recall(key) * share);
  ctx.remember(key, 0);
  if (size <= 0) return 0;
  const host = grantHost(ctx, size);
  if (host) host.level = Math.max(1, ctx.recall(`${key}Level`));
  return size;
}

/** The host is still ours and will not move. Not routed, not lost — refusing, and they know it. */
export function mutinyHosts(ctx: StoryCtx, seasons: number): void {
  for (const army of ourHosts(ctx)) {
    army.morale = Math.max(10, army.morale - 35);
    army.unpaidTicks = (army.unpaidTicks ?? 0) + seasons;
  }
  ctx.state.movementOrders = ctx.state.movementOrders.filter(
    (order) => !ourHosts(ctx).some((army) => army.id === order.armyId),
  );
}

/** Rations spoil on the road. Quiet, and it decides the next battle. */
export function spoilRations(ctx: StoryCtx): void {
  for (const army of ourHosts(ctx)) {
    army.rations = Math.floor(army.rations * 0.35);
    army.supply = Math.max(10, army.supply - 25);
  }
}

/** An enemy general is killed; their host loses the edge he gave it. */
export function killEnemyGeneral(ctx: StoryCtx): boolean {
  const army = theirHosts(ctx).find((candidate) => candidate.generalHeroId);
  if (!army) return false;
  army.generalHeroId = undefined;
  army.morale = Math.max(15, army.morale - 25);
  ctx.note('enemyGeneral', 1);
  return true;
}

/** A host disperses before it ever arrives. */
export function disperseIncoming(ctx: StoryCtx, share = 1): number {
  const incoming = theirHosts(ctx);
  let gone = 0;
  for (const army of incoming) {
    if (Math.random() > share) continue;
    gone += headcount(army);
    ctx.state.armies = ctx.state.armies.filter((candidate) => candidate.id !== army.id);
    ctx.state.invasions = (ctx.state.invasions ?? []).filter((rec) => rec.armyId !== army.id);
  }
  if (gone > 0) ctx.note('enemySoldiers', -gone);
  return gone;
}

/** A great host, launched now, outside the wave cycle. The loudest thing a story can do. */
export function launchHostNow(ctx: StoryCtx, sizeMult = 1): boolean {
  const rival = ctx.rival()
    ?? ctx.state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
  if (!rival) return false;
  const launched = launchPunitiveHost(ctx.state, rival.id, { conquest: true, sizeMult });
  if (launched) ctx.note('hostLaunched', undefined, rival.name);
  return launched;
}

// ── Rebellion ───────────────────────────────────────────────────────────────

/**
 * Provinces secede and form a hostile power out of your own realm — **keeping your buildings**.
 * Everything you paid for is now pointed at you, which is what makes this worse than losing a
 * battle for the same ground.
 */
export function secede(ctx: StoryCtx, count: number, leader?: Hero): Land[] {
  const rebel = ctx.state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
  if (!rebel) return [];
  const taken = ourLands(ctx)
    .filter((land) => land.id !== ctx.state.ascent?.capitalLandId)
    .sort((a, b) => a.loyalty - b.loyalty)
    .slice(0, count);
  for (const land of taken) {
    land.ownerId = rebel.id;
    land.loyalty = 55;
  }
  if (leader) {
    unseat(ctx, leader);
    ctx.state.heroes = ctx.state.heroes.filter((hero) => hero.id !== leader.id);
  }
  return taken;
}

/** A province turns hostile on its own — no foreign hand, and no army to blame. */
export function revolt(ctx: StoryCtx, land?: Land): Land | undefined {
  const target = land ?? ourLands(ctx).sort((a, b) => a.loyalty - b.loyalty)[0];
  const rebel = ctx.state.kingdoms.find((k) => k.id !== PLAYER_KINGDOM_ID && !k.isDefeated);
  if (!target || !rebel || target.id === ctx.state.ascent?.capitalLandId) return undefined;
  target.ownerId = rebel.id;
  target.loyalty = 40;
  return target;
}

/** The capital riots. There is no enemy; it is your own people, and prosperity is what did it. */
export function capitalRiots(ctx: StoryCtx): void {
  const capital = ctx.state.lands.find((land) => land.id === ctx.state.ascent?.capitalLandId);
  ctx.state.court.stability = Math.max(0, ctx.state.court.stability - 26);
  if (capital) {
    capital.loyalty = Math.max(0, capital.loyalty - 30);
    capital.population = Math.floor(capital.population * 0.9);
    capital.defense = Math.max(1, capital.defense - 8);
  }
  applyResourceDelta(ctx.state, { gold: -Math.floor(ctx.state.resources.gold * 0.25) });
}

/** A noble house stops paying, and nothing you do restarts it. */
export function withholdTax(ctx: StoryCtx, seasons: number, land?: Land): void {
  const target = land ?? ctx.land() ?? ourLands(ctx)[0];
  if (!target) return;
  target.loyalty = Math.max(0, target.loyalty - 18);
  addCourtModifier(ctx.state, {
    id: `withhold-${ctx.story.id}-${ctx.state.turn}`,
    label: target.name,
    remainingTicks: seasons,
    resourceRateModifier: { gold: -Math.max(4, Math.round(target.outputs?.gold ?? 6)) },
  });
}

/** A permanent floor under a region's loyalty — the one boon that never wears off. */
export function loyaltyFloor(ctx: StoryCtx, floor: number, only?: Land): void {
  const lands = only ? [only] : ourLands(ctx);
  for (const land of lands) land.loyalty = Math.max(land.loyalty, floor);
  ctx.note('loyaltyFloor', floor, only ? only.name : undefined);
}

// ── Heroes ──────────────────────────────────────────────────────────────────

/**
 * A hero who cannot be drafted, carrying a trait that exists nowhere else.
 *
 * The trait is the point. A story-only hero with ordinary stats is a stat stick with a good
 * anecdote; one whose trait names what they did is a person the player remembers.
 */
export function grantStoryHero(
  ctx: StoryCtx,
  opts: { trait: string; martial?: number; admin?: number; loyalty?: number; renown?: number },
): Hero {
  const hero = generateHero(ctx.state.turn * 7919 + ctx.story.spoken.length, {
    id: `story-${ctx.story.id}-${ctx.state.turn}`,
    rarity: 'Epic',
  });
  hero.stats.martial = opts.martial ?? hero.stats.martial;
  hero.stats.administration = opts.admin ?? hero.stats.administration;
  hero.stats.loyalty = opts.loyalty ?? 70;
  hero.stats.renown = opts.renown ?? hero.stats.renown;
  hero.traits = [...(hero.traits ?? []), opts.trait];
  ctx.state.heroes.push(hero);
  ctx.note('hero', 1, hero.name);
  return hero;
}

/** A hero dies. No roll, no save, no ransom — which is exactly why it lands. */
export function killHero(ctx: StoryCtx, hero?: Hero): Hero | undefined {
  const target = hero ?? ctx.hero();
  if (!target) return undefined;
  unseat(ctx, target);
  ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== target.id);
  ctx.note('heroLost', 1, target.name);
  return target;
}

/** A hero leaves quietly and goes back into the world. A later run may name them. */
export function heroLeaves(ctx: StoryCtx, hero?: Hero, leaveEcho = true): Hero | undefined {
  const target = hero ?? ctx.hero();
  if (!target) return undefined;
  unseat(ctx, target);
  ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== target.id);
  ctx.state.heroDeck.push(target);
  // `ctx.speaking` for the same reason as in `StorySystem.makeCtx`: called from an option's
  // `apply` the id has not been pushed yet, and the echo would be filed under the previous beat.
  if (leaveEcho) recordEcho(ctx.story.templateId, ctx.speaking ?? ctx.story.spoken[ctx.story.spoken.length - 1] ?? '', target.name);
  ctx.note('heroLeft', 1, target.name);
  return target;
}

/** Two heroes bond. Every battle they fight together is better, for as long as both live. */
export function bondHeroes(ctx: StoryCtx, a?: Hero, b?: Hero): boolean {
  const first = a ?? ctx.hero();
  const second = b ?? ctx.otherHero() ?? ctx.state.heroes.find((h) => h.id !== first?.id);
  if (!first || !second) return false;
  first.traits = [...(first.traits ?? []), `Sworn: ${second.name}`];
  second.traits = [...(second.traits ?? []), `Sworn: ${first.name}`];
  first.stats.loyalty = Math.min(100, first.stats.loyalty + 15);
  second.stats.loyalty = Math.min(100, second.stats.loyalty + 15);
  addCourtModifier(ctx.state, {
    id: `bond-${first.id}-${second.id}`,
    label: `${first.name} · ${second.name}`,
    armyPowerModifier: 0.12,
  });
  ctx.note('sworn', undefined, `${first.name} · ${second.name}`);
  return true;
}

/** Two heroes fall out and cannot serve together again. */
export function feudHeroes(ctx: StoryCtx, a?: Hero, b?: Hero): boolean {
  const first = a ?? ctx.hero();
  const second = b ?? ctx.otherHero() ?? ctx.state.heroes.find((h) => h.id !== first?.id);
  if (!first || !second) return false;
  first.traits = [...(first.traits ?? []), `Feud: ${second.name}`];
  second.traits = [...(second.traits ?? []), `Feud: ${first.name}`];
  first.stats.loyalty = Math.max(0, first.stats.loyalty - 12);
  second.stats.loyalty = Math.max(0, second.stats.loyalty - 12);
  // One of them will not take an order from the other's province.
  if (second.assignedTo && second.assignedTo === first.assignedTo) second.assignedTo = undefined;
  ctx.note('feud', undefined, `${first.name} · ${second.name}`);
  return true;
}

/** A hero is taken, and can be ransomed, stormed for, or left. */
export function captureHero(ctx: StoryCtx, hero?: Hero): Hero | undefined {
  const target = hero ?? ctx.hero();
  if (!target) return undefined;
  unseat(ctx, target);
  target.traits = [...(target.traits ?? []), 'Captive'];
  return target;
}

/** A permanent stat gain, the kind a draft cannot buy. */
export function temper(ctx: StoryCtx, stat: keyof Hero['stats'], by: number, hero?: Hero): void {
  const target = hero ?? ctx.hero();
  if (!target) return;
  const before = target.stats[stat];
  target.stats[stat] = Math.max(0, Math.min(100, target.stats[stat] + by));
  // The move that landed, not the one asked for: the stat clamps at both ends, and a card that
  // claims +14 renown on a man already at 96 is lying about the only thing it did.
  if (target.stats[stat] !== before) ctx.note(stat, target.stats[stat] - before, target.name);
}

// ── Land ────────────────────────────────────────────────────────────────────

/** A province joins with no battle: full population, buildings intact. */
export function joinBloodlessly(ctx: StoryCtx, land?: Land): Land | undefined {
  const target = land ?? ctx.state.lands.find(
    (candidate) => candidate.ownerId !== PLAYER_KINGDOM_ID
      && ourLands(ctx).some((mine) => mine.neighbors.includes(candidate.id)),
  );
  if (!target) return undefined;
  target.ownerId = PLAYER_KINGDOM_ID;
  target.loyalty = Math.max(target.loyalty, 70);
  applyResourceDelta(ctx.state, { humans: Math.round(target.population * 0.2) });
  ctx.note('land', 1, target.name);
  return target;
}

/** A building appears, paid for by somebody else. */
export function freeBuilding(ctx: StoryCtx, type: LandBuildingType, land?: Land): boolean {
  const target = land ?? ctx.land();
  if (!target || target.buildings.length >= target.buildingCapacity) return false;
  target.buildings.push({ type, level: 1 });
  ctx.note('building', 1, target.name);
  return true;
}

/**
 * A permanent terrain work — a dyke, a canal, stakes in a riverbed. Changes what the land *is*
 * rather than what it currently produces, so it survives every later focus change.
 */
export function terrainWork(ctx: StoryCtx, opts: { defense?: number; food?: number; gold?: number }, land?: Land): void {
  const target = land ?? ctx.land();
  if (!target) return;
  target.defense += opts.defense ?? 0;
  if (target.outputs) {
    target.outputs.food += opts.food ?? 0;
    target.outputs.gold += opts.gold ?? 0;
  }
  if (opts.defense) ctx.note('landDefense', opts.defense, target.name);
  if (opts.food) ctx.note('landFood', opts.food, target.name);
  if (opts.gold) ctx.note('landGold', opts.gold, target.name);
}

/** A province is razed: people gone, buildings gone, and it stays yours. */
export function raze(ctx: StoryCtx, land?: Land): Land | undefined {
  const target = land ?? ctx.land();
  if (!target) return undefined;
  target.population = Math.floor(target.population * 0.45);
  target.buildings = target.buildings.slice(0, Math.max(0, target.buildings.length - 2));
  target.defense = Math.max(1, Math.floor(target.defense * 0.5));
  target.loyalty = Math.max(0, target.loyalty - 20);
  return target;
}

/** Plague, or a surge. One number, applied honestly. */
export function population(ctx: StoryCtx, factor: number, land?: Land): void {
  const targets = land ? [land] : ourLands(ctx);
  for (const target of targets) target.population = Math.max(10, Math.floor(target.population * factor));
}

// ── Resources ───────────────────────────────────────────────────────────────

/**
 * Exactly this many. **Not scaled, ever** — see `bounty` for the other meaning.
 *
 * Two kinds of caller depend on that literalness and would break if this scaled:
 *
 *  - bags already computed from live state — `{ gold: -take }` where `take` is a share of the
 *    treasury, or `{ humans: men }` counted off a host. Scaling those scales a proportion twice.
 *  - repayments and settlements that must match a figure fixed earlier in the same story.
 *
 * So the choice is made in the vocabulary rather than in a wrapper: an author writing `windfall`
 * is saying *this number*, and one writing `bounty` is saying *this much, to a realm like ours*.
 */
export function windfall(ctx: StoryCtx, bag: Partial<ResourceBag>): void {
  applyResourceDelta(ctx.state, bag);
  for (const [key, value] of Object.entries(bag)) {
    if (value) ctx.note(key, value);
  }
}

/**
 * A one-time reward or forfeit, worth what it should be worth to a realm this size.
 *
 * The authored figure is the floor and the opening pays exactly it; a realm four times richer
 * pays or is paid roughly three times as much. Use this for a purse, a gift, a fine, a haul —
 * anything the story hands over once.
 *
 * **Do not use it for a per-season effect.** A recurring grant is permanent, stacks, and
 * multiplies against a growing realm, and scaling one is how a card becomes an engine —
 * `stipend`, `debt` and `exactTribute` all stay flat on purpose. Nor for a bag whose value was
 * computed from live state, or one paired with a recurring counterweight: scaling the gain half
 * of `debaseCurrency` while its repayment stayed flat would turn a loan into a gift.
 *
 * What lands is what the Chronicle records — `ctx.note` sees the scaled figure, so the outcome
 * sheet never quotes a number the treasury did not move by.
 */
export function bounty(ctx: StoryCtx, bag: Partial<ResourceBag>): void {
  windfall(ctx, scaledGain(ctx.state, bag));
}

/** The treasury is seized. All of it, which is the only version of this worth writing. */
export function seizeTreasury(ctx: StoryCtx): number {
  const taken = Math.floor(ctx.state.resources.gold);
  applyResourceDelta(ctx.state, { gold: -taken });
  ctx.note('gold', -taken);
  return taken;
}

/**
 * **Per-season, so never scaled.** A recurring grant is permanent, stacks, and multiplies against
 * a realm that is itself growing — scaling one is how a card becomes an engine. Only one-time
 * sums wear the realm's scale, through `bounty`. Do not "fix" this to match them.
 */
/** A debt that services itself every season until it is done with you. */
export function debt(ctx: StoryCtx, perSeason: number, seasons: number): void {
  addCourtModifier(ctx.state, {
    id: `debt-${ctx.story.id}-${ctx.state.turn}`,
    label: 'Nợ',
    remainingTicks: seasons,
    resourceRateModifier: { gold: -perSeason },
  });
  ctx.note('debt', perSeason);
}

/**
 * **Per-season, so never scaled.** A recurring grant is permanent, stacks, and multiplies against
 * a realm that is itself growing — scaling one is how a card becomes an engine. Only one-time
 * sums wear the realm's scale, through `bounty`. Do not "fix" this to match them.
 */
/** A standing gain for a while — a trade route, a tribute redirected, a good harvest. */
export function stipend(ctx: StoryCtx, bag: Partial<ResourceBag>, seasons: number, label: string): void {
  addCourtModifier(ctx.state, {
    id: `stipend-${ctx.story.id}-${ctx.state.turn}`,
    label,
    remainingTicks: seasons,
    resourceRateModifier: bag,
  });
  ctx.note('stipend', seasons, label);
}

/** The granary spoils. Not a rate change — the stores themselves. */
export function spoilGranary(ctx: StoryCtx, share = 0.6): void {
  applyResourceDelta(ctx.state, { food: -Math.floor(ctx.state.resources.food * share) });
}

// ── Diplomacy ───────────────────────────────────────────────────────────────

/**
 * Move a court's opinion **through the ledger**, which is the only place it survives.
 *
 * `Kingdom.relations` is a cache: `recomputeOpinion` rebuilds it from
 * `naturalBaseline(personality) + sumModifiers(...)` and throws away whatever was there. Every
 * story verb below used to assign it directly, so a truce worth +45 lasted exactly until the next
 * gift, ambassador year or politics card — measured, often inside the same game year that granted
 * it. The stories were writing to a whiteboard the ledger wipes.
 *
 * Decays slowly rather than standing for ever: a story is a *memory* of something, and the courts
 * forgetting is what keeps the board moving.
 */
type StoryOpinionLabel =
  | 'diplo.mod.story'
  | 'diplo.mod.standing'
  | 'diplo.mod.coalition'
  | 'diplo.mod.truce';

function moveOpinion(kingdom: Kingdom, turn: number, by: number, labelKey: StoryOpinionLabel): void {
  addOpinionModifier(kingdom, {
    id: `story-${labelKey}-${turn}-${Math.floor(Math.random() * 100000)}`,
    label: t(labelKey),
    value: Math.max(-100, Math.min(100, by)),
    decay: 0.6,
    source: 'event',
  });
}

export function opinion(ctx: StoryCtx, by: number, kingdomId?: string): void {
  const target = kingdomId
    ? ctx.state.kingdoms.find((k) => k.id === kingdomId)
    : ctx.rival();
  if (!target) return;
  moveOpinion(target, ctx.state.turn, by, 'diplo.mod.story');
  ctx.note('opinion', by, target.name);
}

/** Every third party that was watching revises its opinion at once. */
export function standing(ctx: StoryCtx, by: number): void {
  for (const kingdom of ctx.state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) continue;
    moveOpinion(kingdom, ctx.state.turn, by, 'diplo.mod.standing');
  }
  ctx.note('standing', by);
}

/** A coalition: everyone who already disliked you decides together. */
export function coalition(ctx: StoryCtx): number {
  let joined = 0;
  for (const kingdom of ctx.state.kingdoms) {
    if (kingdom.id === PLAYER_KINGDOM_ID || kingdom.isDefeated) continue;
    if ((kingdom.relations ?? 50) > 45) continue;
    kingdom.warAppetite = Math.min(100, (kingdom.warAppetite ?? 0) + 45);
    moveOpinion(kingdom, ctx.state.turn, -15, 'diplo.mod.coalition');
    joined += 1;
  }
  if (joined > 0) ctx.note('coalition', joined);
  return joined;
}

/** A rival collapses into civil war, and their ground comes loose. */
export function civilWar(ctx: StoryCtx, kingdomId?: string): boolean {
  const target = kingdomId
    ? ctx.state.kingdoms.find((k) => k.id === kingdomId)
    : ctx.rival();
  if (!target) return false;
  target.stability = Math.max(0, (target.stability ?? 60) - 45);
  target.power = Math.max(10, (target.power ?? 60) * 0.55);
  for (const army of ctx.state.armies) {
    if (army.kingdomId !== target.id) continue;
    scaleUnits(army, 0.5);
    army.morale = Math.max(15, army.morale - 30);
  }
  // Two of their border provinces stop being defended.
  for (const land of ctx.state.lands) {
    if (land.ownerId !== target.id) continue;
    land.defense = Math.max(1, Math.floor(land.defense * 0.6));
    land.loyalty = Math.max(0, land.loyalty - 25);
  }
  return true;
}

/**
 * **Per-season, so never scaled.** A recurring grant is permanent, stacks, and multiplies against
 * a realm that is itself growing — scaling one is how a card becomes an engine. Only one-time
 * sums wear the realm's scale, through `bounty`. Do not "fix" this to match them.
 */
/** Tribute imposed on *them*, collected automatically for a while. */
export function exactTribute(ctx: StoryCtx, perSeason: number, seasons: number): void {
  stipend(ctx, { gold: perSeason }, seasons, ctx.rival()?.name ?? 'Cống');
}

// ── Rules — the layer that changes how the run is played ────────────────────

/**
 * A Power card enters the draft deck permanently.
 *
 * The most valuable thing in this file. A resource swing is forgotten inside a minute; a rule you
 * now own changes every decision for the rest of the run, and it is the outcome players describe
 * to each other afterwards.
 */
export function grantPowerCard(ctx: StoryCtx, cardId: string): boolean {
  const ascent = ctx.state.ascent;
  if (!ascent) return false;
  const card = findPowerCard(cardId);
  if (!card || ascent.retiredCards.includes(cardId)) return false;
  ascent.cardStacks[cardId] = (ascent.cardStacks[cardId] ?? 0) + 1;
  ctx.note('card', 1, card.id);
  return true;
}

/** A rule you were relying on is taken back. You are the king; you were still not consulted. */
export function suppressPowerCard(ctx: StoryCtx, cardId?: string): string | undefined {
  const ascent = ctx.state.ascent;
  if (!ascent) return undefined;
  const held = Object.keys(ascent.cardStacks).filter((id) => (ascent.cardStacks[id] ?? 0) > 0);
  const target = cardId ?? held.sort((a, b) => (ascent.cardStacks[b] ?? 0) - (ascent.cardStacks[a] ?? 0))[0];
  if (!target) return undefined;
  delete ascent.cardStacks[target];
  ascent.retiredCards.push(target);
  ctx.note('cardLost', 1, target);
  return target;
}

/** Bias the draft toward or away from a rarity, for the rest of the run. */
export function tiltDraft(ctx: StoryCtx, rarity: AscentRarity, by: number): void {
  const ascent = ctx.state.ascent;
  if (!ascent) return;
  ascent.draftWeights[rarity] = Math.max(0.1, (ascent.draftWeights[rarity] ?? 1) + by);
  ctx.note('draftTilt', by, rarity);
}

/** A level-up owed immediately — a draft the player did not earn by fighting. */
export function grantDraft(ctx: StoryCtx, count = 1): void {
  const ascent = ctx.state.ascent;
  if (!ascent) return;
  ascent.pendingLevelUps += count;
  ctx.note('draft', count);
}

/** The wave clock moves. Slower is a reprieve; faster is a story acting against you. */
export function shiftWaveClock(ctx: StoryCtx, seasons: number): void {
  const ascent = ctx.state.ascent;
  if (!ascent) return;
  const before = ascent.ticksToWave;
  ascent.ticksToWave = Math.max(1, ascent.ticksToWave + seasons);
  // The move the clock actually made, not the one that was asked for — it floors at one season,
  // and a story that bought four when three were left must not claim four.
  if (ascent.ticksToWave !== before) ctx.note('waveClock', ascent.ticksToWave - before);
}

/** An extra province the realm may court at once, permanently. */
export function grantClaimSlot(ctx: StoryCtx, count = 1): void {
  addCourtModifier(ctx.state, {
    id: `claim-slot-${ctx.story.id}`,
    label: 'Sứ đoàn',
    claimSlotBonus: count,
  });
  ctx.note('claimSlot', count);
}

/** Edict points, so a story can hand the player a law they have not earned. */
export function grantEdictPoints(ctx: StoryCtx, count = 1): void {
  if (!ctx.state.mandate) return;
  ctx.state.mandate.edictPoints = (ctx.state.mandate.edictPoints ?? 0) + count;
  ctx.note('edictPoints', count);
}

/**
 * A story that ends teaches the throne a law.
 *
 * The strongest thing the Chronicle can do to a run, and the reason it belongs beside
 * `grantPowerCard` rather than in the story file: a resource swing is forgotten within a minute,
 * while a decree the realm only holds because of something that *happened to it* changes how the
 * rest of the run is governed. The counting-house ending in embezzlement is what puts the registry
 * tallies within reach — history teaching the court something it would not otherwise have known.
 *
 * Adds the decree to the pool rather than enacting it: the player still chooses, and still pays.
 */
export function grantDecree(ctx: StoryCtx, decreeId: string): boolean {
  const mandate = ctx.state.mandate;
  if (!mandate) return false;
  if (!findProject(decreeId)) return false;
  mandate.taughtDecrees ??= [];
  if (mandate.taughtDecrees.includes(decreeId)) return false;
  mandate.taughtDecrees.push(decreeId);
  ctx.note('decree', 1);
  return true;
}

// ── Legacy ──────────────────────────────────────────────────────────────────

/** Something a later run gets to mention by name. */
export function leaveEcho(ctx: StoryCtx, name: string): void {
  // See `StorySystem.makeCtx`: an option's `apply` runs before `fire` pushes the id, so keying
  // off `spoken[last]` filed every echo left from an *answer* under the previous beat, where
  // `echoOf` could never find it again.
  recordEcho(ctx.story.templateId, ctx.speaking ?? ctx.story.spoken[ctx.story.spoken.length - 1] ?? '', name);
}

/**
 * A death the realm writes down.
 *
 * Three things at once, because a memorial that is only one of them is a trophy. It goes in the
 * reign's own record (`state.memorials`, which nothing evicts, unlike the sixty-entry Chronicle
 * ring). It becomes a standing court modifier every host feels for the rest of the run — the
 * mechanical half, and free, because `addCourtModifier` with no `remainingTicks` is already
 * permanent and already read by `armyPower`. And it goes into the cross-run echo ring marked as a
 * memorial, so a later dynasty can say the name aloud.
 *
 * Deliberately **not** a hero a later run inherits: `getFounderPool` reads authored hero
 * templates, and a person a story made up has no template to unlock. A name that comes back is
 * the honest version of that promise; a stat block is not.
 */
export function enshrine(
  ctx: StoryCtx,
  opts: { name: string; key: string; land?: Land; armyPower?: number; loyaltyFloor?: number; deeds?: number },
): void {
  const { state } = ctx;
  const id = `memorial-${ctx.story.templateId}-${opts.key}`;
  state.memorials = [...(state.memorials ?? []).filter((entry) => entry.id !== id), {
    id,
    name: opts.name,
    templateId: ctx.story.templateId,
    key: opts.key,
    turn: state.turn,
    landId: opts.land?.id,
    loyaltyFloor: opts.loyaltyFloor,
    deeds: opts.deeds,
  }];
  addCourtModifier(state, {
    id,
    label: opts.name,
    armyPowerModifier: opts.armyPower ?? 0.05,
  });
  recordEcho(ctx.story.templateId, ctx.speaking ?? ctx.story.spoken[ctx.story.spoken.length - 1] ?? '', opts.name, 'memorial');
  ctx.note('memorial', undefined, opts.name);
}

/** Says it out loud, in the header strip, in the story's own voice. */
export function announce(ctx: StoryCtx, text: string, kind: 'info' | 'reward' | 'threat' = 'info'): void {
  pushToast(ctx.state, text, kind, {
    storyId: ctx.story.id,
    templateId: ctx.story.templateId,
    fragmentId: ctx.speaking ?? ctx.story.spoken[ctx.story.spoken.length - 1] ?? '',
  });
}

// ── The auxiliary ────────────────────────────────────────────────────
//
// Re-exported rather than reimplemented, so an author reaching for a host still has one
// vocabulary to look in. The mechanics and the reasoning live in `patrons.ts`.
export { patronHost, patronStrength, raisePatronHost, reinforcePatron } from './patrons';

// ── The annals layer ────────────────────────────────────────────────────────
//
// Nine verbs added for the middle-length histories in `data/stories/annals.ts`. Each exists
// because a specific thing happened in Vietnamese history that the vocabulary above could not
// say — a diver who sank a fleet, a wall that stopped a civil war for fifty years, a paper
// currency that failed, a captive who would not change sides. A verb that only restates an
// existing one in different words is not here.

/**
 * A truce a rival will actually keep.
 *
 * Khúc Thừa Dụ took autonomy in 905 without fighting for it, and it held because the other side
 * decided it was not worth the campaign. Warms opinion far enough that `pickAggressor` — which
 * weights by `100 - relations` — stops choosing them, and states the term openly so the player
 * can plan around a quiet border rather than merely hope for one.
 */
export function truce(ctx: StoryCtx, kingdomId: string | undefined, warmth = 45): boolean {
  const kingdom = ctx.state.kingdoms.find((candidate) => candidate.id === kingdomId);
  if (!kingdom) return false;
  moveOpinion(kingdom, ctx.state.turn, warmth, 'diplo.mod.truce');
  kingdom.warAppetite = Math.max(0, (kingdom.warAppetite ?? 0) - 60);
  ctx.note('truce', undefined, kingdom.name);
  return true;
}

/**
 * Men taken straight out of the fields and put under arms.
 *
 * The corvée, and the thing every dynasty reached for when the dykes broke or the border did.
 * Deliberately *not* routed through `queueRecruitment`: there is no muster timer, no commander
 * required and no supply train — which is exactly why it is a bad idea, and why the population
 * does not come back.
 */
export function conscript(ctx: StoryCtx, soldiers: number, at?: Land): Army | undefined {
  const available = Math.max(0, Math.floor(ctx.state.resources.humans - 40));
  const taken = Math.min(soldiers, available);
  if (taken < 60) return undefined;
  applyResourceDelta(ctx.state, { humans: -taken });
  ctx.note('humans', -taken);
  return grantHost(ctx, taken, at);
}

/**
 * A fleet sunk at anchor, or a siege train burned before it arrives.
 *
 * Yết Kiêu is supposed to have swum out at night and holed Mongol ships below the waterline, one
 * at a time, for long enough that the fleet stopped being a fleet. Unlike `disperseIncoming`,
 * which removes hosts outright, this *thins* every one of them — the army still lands, and it
 * lands hurt, which is the more interesting shape.
 */
export function sabotageIncoming(ctx: StoryCtx, share = 0.3): number {
  let lost = 0;
  for (const army of theirHosts(ctx)) {
    const before = headcount(army);
    scaleUnits(army, 1 - share);
    army.supply = Math.max(10, army.supply - 25);
    lost += before - headcount(army);
  }
  if (lost > 0) ctx.note('enemySoldiers', -lost);
  return lost;
}

/**
 * The enemy's supply fleet taken rather than sunk.
 *
 * Trần Khánh Dư let the Mongol war fleet pass at Vân Đồn in 1288 and then took the grain fleet
 * behind it, which is the reason the campaign collapsed. So this both starves the invasion and
 * fills our own stores — the only verb here that moves the same resource in both directions.
 */
export function plunderSupply(ctx: StoryCtx): number {
  let food = 0;
  for (const army of theirHosts(ctx)) {
    food += Math.max(0, Math.floor(army.rations * 0.7));
    army.rations = Math.floor(army.rations * 0.3);
    army.supply = Math.max(5, army.supply - 35);
    army.morale = Math.max(15, army.morale - 18);
  }
  if (food > 0) {
    applyResourceDelta(ctx.state, { food, supplies: Math.floor(food * 0.4) });
    ctx.note('food', food);
    ctx.note('supplies', Math.floor(food * 0.4));
  }
  return food;
}

/**
 * A work that outlives the reign that built it.
 *
 * The Lũy Thầy held a border for a century and a half; the Temple of Literature is still standing.
 * A monument is permanent provincial defence plus realm stability — the one effect here that
 * cannot be undone by anything, which is what makes it worth a whole story.
 */
export function monument(ctx: StoryCtx, opts: { defense: number; stability: number }, at?: Land): Land | undefined {
  const land = at ?? ctx.land() ?? ourLands(ctx)[0];
  if (!land) return undefined;
  land.defense += opts.defense;
  ctx.state.court.stability = Math.min(100, ctx.state.court.stability + opts.stability);
  ctx.note('monument', undefined, land.name);
  return land;
}

/**
 * A hero sent away, and the court steadier for it.
 *
 * Trần Thủ Độ's method. Distinct from `heroLeaves` (which is the hero's own decision) and from
 * `killHero` (which is louder and makes martyrs): an exile is the throne choosing order over a
 * person, and the stability it buys is real.
 */
export function exileHero(ctx: StoryCtx, hero?: Hero, stability = 12): Hero | undefined {
  const target = hero ?? ctx.hero();
  if (!target) return undefined;
  unseat(ctx, target);
  ctx.state.heroes = ctx.state.heroes.filter((candidate) => candidate.id !== target.id);
  ctx.state.court.stability = Math.min(100, ctx.state.court.stability + stability);
  ctx.note('heroExiled', 1, target.name);
  return target;
}

/**
 * Arrears forgiven and grievances dropped, at a price.
 *
 * Lê Thánh Tông's registries and amnesties did this on a schedule. Raises loyalty everywhere at
 * once, which is the only way to lift a realm that has gone sullen across many provinces —
 * `loyaltyFloor` sets a floor, this pays for a lift.
 */
export function amnesty(ctx: StoryCtx, by = 18): void {
  for (const land of ourLands(ctx)) {
    land.loyalty = Math.min(100, land.loyalty + by);
  }
  ctx.state.court.stability = Math.min(100, ctx.state.court.stability + 6);
  ctx.note('amnesty', by);
}

/**
 * A school that keeps producing people.
 *
 * The examinations from 1075 onward are the reason a Vietnamese dynasty could staff itself without
 * asking the aristocracy's permission. Modelled as what it actually was: not one hero, but a
 * standing supply of them, which is why this returns a modifier rather than a person.
 */
export function academy(ctx: StoryCtx, seasons: number, label: string): void {
  addCourtModifier(ctx.state, {
    id: `academy-${ctx.story.id}-${ctx.state.turn}`,
    label,
    remainingTicks: seasons,
    // The court speaks more often while the schools are running, which is what actually produces
    // people: `courtCardSpeedModifier` shortens the cooldown that gates appointments and drafts,
    // so an academy is a faster supply of trained officials rather than a stat bonus in a gown.
    courtCardSpeedModifier: 0.4,
    resourceRateModifier: { gold: 4 },
  });
  ctx.note('academy', seasons, label);
}

/**
 * A currency nobody trusts.
 *
 * Hồ Quý Ly issued paper money in 1400 and made holding bronze a crime. It raised a great deal at
 * once and then stopped working, which is the shape here: a windfall now, a rate penalty after,
 * and — the part that actually hurts — a card struck out of the draft while the experiment runs.
 */
export function debaseCurrency(ctx: StoryCtx, gain: number, seasons: number, label: string): void {
  applyResourceDelta(ctx.state, { gold: gain });
  addCourtModifier(ctx.state, {
    id: `debase-${ctx.story.id}-${ctx.state.turn}`,
    label,
    remainingTicks: seasons,
    resourceRateModifier: { gold: -Math.ceil(gain / seasons) },
    marketGoldOutputModifier: -0.25,
  });
}
