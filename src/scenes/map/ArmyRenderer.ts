/**
 * Army markers on the map: static seal/troop-count glyphs for armies sitting still,
 * smoothly-sliding markers (with a destination arrow) for armies under a movement
 * order, and a gold command pennant for the player's currently-selected army.
 * Pairs with the selected map-item renderer for glyphs and `roadCurve` for march geometry.
 */
import Phaser from 'phaser';
import { PLAYER_KINGDOM_ID, REALTIME_TICK_MS } from '../../game/constants';
import { ASCENT_TICK_MS } from '../../game/ascentConfig';
import { getLegTicks } from '../../game/movementConfig';
import { INK } from '../../ui/inkTheme';
import { ROAD_RUNWAY, buildRoadCurve, drawnRoadBetween, type RoadAnchor } from '../../map/roadCurve';
import { MarchRoute, reversedSpline, type RoutePoint } from '../../map/marchRoute';
import { findLand } from '../../systems/LandSystem';
import { marchEntersLand } from '../../systems/WarSystem';
import { liveBattles } from '../../systems/ascent/fronts';
import { retainHeroFace, heroFaceTextureKey } from '../../ui/FaceRenderer';
import type { Army, GameState, Land } from '../../state/types';
import { hostKitFor, setHostStepping } from '../../ui/ink/devices';
import { setConquestArmyStepping } from '../../ui/ink/figureStamps';
import type { MapItemRenderer } from '../../ui/MapItemRenderer';
import { houseBanner } from '../../ui/ascent/houseBanner';

type WorldTransform = (value: number) => number;
type SettlementAnchor = (land: Land) => { x: number; y: number };
type ArmyPointerHandler = (armyId: string, pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData) => void;
/** How far through the current economy tick the world's clock is, 0..1. */
type TickPhase = () => number;

/** Where a standing host waits, relative to its seat: beside the compound, not on the road. */
const MARKER_OFFSET_X = 18;
const MARKER_OFFSET_Y = -28;
/** Where the general's face sits beside a standing host, relative to the marker's ground line. */
const FACE_BADGE_X = 26;
const FACE_BADGE_Y = -34;
/**
 * The general's portrait beside his host.
 *
 * 26 put a face three and a quarter times a soldier's height next to the men it belonged to, which
 * on a map where a five-metre house is 11.2 px made the badge the largest thing in the province
 * after the citadel. 19 still reads at a glance and stops competing with the host it labels.
 */
const FACE_BADGE_SIZE = 32; // read at arm's length on a phone: the first pass at 25 was still called small

/** How long a host takes to settle onto its destination once the leg resolves. */
const ARRIVE_MS = 320;
/** Milliseconds between dust puffs behind a marching column. */
/** How far the block rises on a step, and how long a step takes. */
const MARCH_TREAD = -0.9;
const MARCH_TREAD_MS = 340;
const DUST_INTERVAL_MS = 45;
/** The same pigment the ground shadow uses, so a puff reads as dust and not as sage paint. */
const DUST_INK = 0x2a2118;
/** How long one puff lingers before it has faded entirely. */
/**
 * How long a puff lasts — and therefore how long the trail is.
 *
 * A column crosses about a hundred and fifty points a second, so at half a second of life the
 * trail stretched ninety points behind the men and every puff in it was most of the way faded:
 * a long grey smear detached from the host rather than dust at its heels. Measured, not guessed
 * (`shot-march-map.mjs` prints the distance from the marker to each live puff).
 *
 * Cut again with the march column. At 300 ms the live puffs measured 12 to 50 points behind the
 * marker and 20 to 52 points across on screen — a chain of five dark ellipses, each about as wide
 * as the host, strung out on the bare road behind it. That chain is the "shadow of the moving army"
 * players report: a shadow belongs *under* a thing, and these were beside it with nobody on them.
 * At 200 ms the trail is a third as long, and the puffs now rise along the column's own length
 * rather than from one point at its head — so they read as ground under marching men.
 */
const DUST_LIFE_MS = 200;

/**
 * How far a marker paints around its own anchor, for the view index.
 *
 * A host is drawn from its feet up and out: the column, the standards beside it, the general's
 * portrait badge above the shoulder, and the dust behind. Generous rather than tight — the cost of
 * over-reaching is one marker drawn just off-screen.
 */
const MARKER_REACH = 90;

/**
 * How far along a leg a host walks when it will not enter the province at the other end.
 *
 * The road runs gate to gate, so the province line sits near the middle of it — and the middle is
 * where a host that has come to fight for a place stands: on the edge of its own ground, with the
 * target's fields in front of it. Not 1: at 1 the marker arrives somewhere the army never goes,
 * and the walk back from there is the jump this replaces.
 */
const FRONTIER_T = 0.5;

/**
 * How far ahead of the host its column's heading is read, as a fraction of the march.
 *
 * A march opens with a short step from where the host stands down to its gate, and the road only
 * begins after it. Filing the column along that first step would point it at the gate and rebuild
 * it a second later when the road turned it; reading the heading a little way ahead — and never
 * before the road itself — files it along the road from the first stride.
 */
const HEADING_LOOKAHEAD = 0.06;

/**
 * How far a march may drift from the order's own clock before it is re-timed, as a fraction of
 * the leg.
 *
 * A march is a tween and an order is a count of ticks, and the two used to be tied together once,
 * when the leg was drawn — against a tick whose phase nobody read. So a two-season march set off
 * seven seconds before a tick that came in five, arrived early and stood at the far gate waiting
 * for the state to catch up, or arrived late and jumped. Every refresh now compares where the
 * marker is with where the clock says the host is, and re-times the rest of the walk to what is
 * left on the clock; a march of x seasons is on the road for x seasons and arrives on the tick.
 */
const CLOCK_SLACK = 0.03;

/** The economy clock the current mode runs on — marches are paced against it. */
function tickMs(state: GameState): number {
  return state.gameMode === 'ascent' ? ASCENT_TICK_MS : REALTIME_TICK_MS;
}

/**
 * The road a host is on, and how far along it the host has got.
 *
 * Kept from the moment a leg is drawn until the host has *left* the road — which is after the
 * order has gone, because a march that ends at the frontier holds there for the fight and walks
 * home along the same road afterwards, and a march the tick resolved a little early walks the
 * rest of the way to the far stand along it too.
 */
interface MarchLeg {
  route: MarchRoute;
  /** Fraction of the route the host walks under its order — 1, or `FRONTIER_T` when it stops at the line. */
  legEnd: number;
  /** Where the road proper begins and ends along the route, as fractions of its length. */
  roadStartU: number;
  roadEndU: number;
  fromId: string;
  toId: string;
  /** The march tween's counter: how far along `legEnd` the host is, 0..1. */
  progress: { t: number };
  /** Where the host actually is on the route right now, 0..1 by distance — marching or walking home. */
  at: number;
  /** Which way the host is walking the route: 1 toward `toId`, -1 back toward `fromId`. */
  direction: 1 | -1;
  /**
   * Where the order's clock stood when this leg was drawn: the ticks already banked on it, and
   * how far through the current tick the world was. An order's ticks are counted at tick
   * boundaries, so a march issued two thirds of the way through a tick resolves a third of a
   * tick later — not a whole one — and the walk is timed against that, not the count.
   */
  clock: { progress0: number; phase0: number };
}

/**
 * The province a host is engaged against without standing on it — where its picket stands.
 *
 * A host that has marched to fight for a place stops at the province line and fights from there:
 * the state leaves `army.landId` on its own ground for the whole of a watched battle, and an
 * intimidation keeps the pressuring host at home too. Both used to end the host's movement order
 * the moment they opened, and the renderer read "no order, away from its stand" as "walk home" —
 * so the column marched out, turned round, and marched back while the fight it had gone to was
 * still on. This names the fight it went to, so it can stand there until it is over.
 */
function engagementLand(state: GameState, army: Army): string | undefined {
  for (const battle of liveBattles(state)) {
    if (battle.landId === army.landId) continue;
    if ((battle.ourArmyIds ?? []).includes(army.id) || (battle.theirArmyIds ?? []).includes(army.id)) {
      return battle.landId;
    }
  }
  const pressure = state.acquisitionOrders.find(
    (order) => order.method === 'intimidation' && order.armyId === army.id,
  );
  return pressure && pressure.landId !== army.landId ? pressure.landId : undefined;
}

export class ArmyRenderer {
  private markers = new Map<string, Phaser.GameObjects.Container>();
  private moveLegs = new Map<string, string>();
  /** The march tween per army. Its target is a plain `{t}` counter, so `killTweensOf(marker)`
   *  can never find it — this handle is the only way to stop one. Without it, a leg change left
   *  two tweens fighting over `setPosition`, and a destroyed marker kept walking and kicking up
   *  dust until the orphan ran out on its own. */
  private moveTweens = new Map<string, Phaser.Tweens.Tween>();
  /** The road each host is on — see `MarchLeg`. */
  private routes = new Map<string, MarchLeg>();
  /**
   * Hosts walking a road under no order: home, on to the stand they have just won, or out to the
   * province line to picket a fight.
   *
   * The walk lasts up to four seconds and the map refreshes every tick, so without this the
   * second refresh found a host with no order standing away from its stand and snapped it there —
   * which is the "army teleports" this renderer keeps being accused of. A host in this set is left
   * to finish its walk; the tween's own completion takes it out.
   */
  private resting = new Set<string>();
  private destinationMarkers: Phaser.GameObjects.GameObject[] = [];
  /** Signature (`total|isPlayer`) of each marker's current visual content, so we
   *  only rebuild the expensive seal+formation when it actually changes. */
  private contentSig = new Map<string, string>();
  private selectionFlags = new Map<string, Phaser.GameObjects.Container>();
  /** The general's face beside a standing host, keyed by army; absent while it marches. */
  private faceBadges = new Map<string, { heroId: string; badge: Phaser.GameObjects.GameObject }>();
  /** Live dust puffs, so they can be cleared without leaking tweens. */
  private dust: Phaser.GameObjects.Ellipse[] = [];
  private idleDust: Phaser.GameObjects.Ellipse[] = [];
  /**
   * When each host last kicked up dust — **per host**, not one clock for the whole map.
   *
   * A single shared timestamp meant two columns on the road split one puff budget between them
   * and each got half a trail; three got a third each. The rate limit is about how often *a
   * column* kicks up dust, so it belongs to the column.
   */
  private lastDustAt = new Map<string, number>();
  /**
   * The leg each marching host is walking, end to end — so the view index can cover the whole
   * road rather than the point the marker happened to occupy when it was last indexed.
   */
  private legSpans = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  /** How far back along the road each marching host reaches — the length its dust rises along. */
  private columnReach = new Map<string, number>();
  /** Milliseconds per world unit for each host's current march, so nothing else has to guess. */
  private paceMs = new Map<string, number>();
  /** Whether the world's clock is stopped. A stopped clock stops the marches with it. */
  private paused = false;
  /**
   * The last `drawArmies` call, so a walk that ends between refreshes can redraw its host at once.
   *
   * A host walks home in formation and re-forms beside its seat when it gets there; without this
   * it stood facing the road at its stand until the next tick happened to redraw it.
   */
  private redraw?: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapItems: MapItemRenderer,
  ) {}

  /**
   * Holds or releases every march.
   *
   * A march is a tween, and a tween owes nothing to the economy tick — so the player stopped the
   * clock for a card and the hosts kept walking, ran out their legs against a tick that was not
   * coming, and stood frozen wherever they happened to finish. Dragon Ascent stops the clock
   * constantly, so that was most of the stop-start in a march. Carts, birds and weather already
   * follow the clock (`TrafficRenderer.setPaused`); armies now do too, and a paused column stops
   * kicking up dust because the tween that spawns it is no longer running.
   */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    for (const tween of this.moveTweens.values()) {
      if (paused) tween.pause();
      else tween.resume();
    }
    // And the feet with them: a host frozen on the road must not keep stepping on the spot.
    for (const [armyId, marker] of this.markers) {
      if (!this.moveTweens.has(armyId)) continue;
      const body = marker.list[0];
      if (!body) continue;
      setConquestArmyStepping(body, !paused);
      setHostStepping(body as unknown as { getData(key: string): unknown }, !paused);
    }
  }

  /**
   * The army markers, for the view index.
   *
   * Re-read on every `drawArmies`, because a host moves. Between refreshes a marker tweens along
   * its whole leg, so a marching host is indexed by **the road it is walking** — the leg's midpoint
   * and half its length — exactly as `TrafficRenderer` indexes a cart. Chasing the marker across
   * cells every frame would cost more than drawing it, and the pose-gated `syncViewCulling` would
   * not re-run for it anyway while the camera sits still.
   *
   * A fixed 200-unit reach around the last indexed point was the previous answer, and it was one
   * province-hop from being wrong: measured on a normal Ascent map (`_marchwatch`), a marker drifts
   * up to 193 units from where it was indexed inside a single leg. A longer leg — a bigger map, a
   * wider province — would have taken a visible host off the screen with it.
   */
  cullTargets(): Array<{
    id: string; object: Phaser.GameObjects.Container; x: number; y: number; radius: number;
  }> {
    return [...this.markers.entries()].map(([id, object]) => {
      const span = this.legSpans.get(id);
      if (!span) {
        return { id, object, x: object.x, y: object.y, radius: MARKER_REACH };
      }
      return {
        id,
        object,
        x: (span.x1 + span.x2) / 2,
        y: (span.y1 + span.y2) / 2,
        radius: Math.hypot(span.x2 - span.x1, span.y2 - span.y1) / 2 + MARKER_REACH,
      };
    });
  }

  /**
   * Draws every visible army's marker. Static markers sit beside their land's settlement
   * anchor; armies with an active movement order instead get a tween that walks their
   * marker down to the gate and along the drawn road to the next land, re-timed to the
   * order's own clock on every call so repeated calls during the same leg only correct
   * drift and never restart the animation.
   */
  drawArmies(
    state: GameState,
    wx: WorldTransform,
    wy: WorldTransform,
    getAnchor: SettlementAnchor,
    roadAnchor: RoadAnchor,
    tickPhase: TickPhase,
    onArmyPointerDown: ArmyPointerHandler,
  ): void {
    for (const marker of this.destinationMarkers) {
      marker.destroy();
    }
    this.destinationMarkers = [];
    this.redraw = () => this.drawArmies(state, wx, wy, getAnchor, roadAnchor, tickPhase, onArmyPointerDown);

    const activeIds = new Set<string>();
    const playerSignKey = JSON.stringify(houseBanner());

    for (const army of state.armies) {
      const land = findLand(state, army.landId);
      if (!land?.isVisible) {
        continue;
      }
      activeIds.add(army.id);

      const total = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
      const isPlayer = army.kingdomId === PLAYER_KINGDOM_ID;
      const kingdomColor = state.kingdoms.find((k) => k.id === army.kingdomId)?.color;
      // The player's host flies the realm's own standard — the seed its provinces are flagged
      // with (`MapScene.drawLandFlags`) — and a rival's a stable style of its own.
      const flagSeed = isPlayer
        ? state.mapConfig.seed
        : Math.max(0, state.kingdoms.findIndex((k) => k.id === army.kingdomId));

      let marker = this.markers.get(army.id);
      const fresh = !marker;
      if (!marker) {
        marker = this.scene.add.container(0, 0);
        marker.setDepth(70);
        this.markers.set(army.id, marker);

        if (isPlayer) {
          marker.setInteractive(new Phaser.Geom.Circle(0, -18, 28), Phaser.Geom.Circle.Contains);
          marker.on(
            'pointerdown',
            (
              pointer: Phaser.Input.Pointer,
              _localX: number,
              _localY: number,
              event: Phaser.Types.Input.EventData,
            ) => onArmyPointerDown(army.id, pointer, event),
          );
        }
      }

      // Whether this host is on the road, which decides how it is *drawn* — facing the way it
      // walks — and whether it carries its general's portrait. Read once, above the signature,
      // because the arrangement is part of what the marker is.
      const order = state.movementOrders.find((candidate) => candidate.armyId === army.id);
      const nextLand = order && order.path.length > 0 ? findLand(state, order.path[0]) : undefined;
      const marching = Boolean(order && order.path.length > 0);
      const stand = this.standingPoint(land, getAnchor, wx, wy);
      // The fight this host has gone to, if it is standing on the line of one — see `engagementLand`.
      const picketId = marching ? undefined : engagementLand(state, army);
      const picketLand = picketId ? findLand(state, picketId) : undefined;
      const walking = this.resting.has(army.id);

      // **The road first, then the men on it.** Which road the host is on has to be settled before
      // the marker's content is decided — so a new leg resolves its route here, before the redraw
      // signature, and starts walking it below, after the body it walks with has been drawn and
      // measured.
      const legKey = order && order.path.length > 0 ? `${army.id}|${land.id}|${order.path[0]}` : undefined;
      const legChanged = legKey !== undefined && this.moveLegs.get(army.id) !== legKey;
      if (legKey !== undefined && legChanged) {
        const legEnd = nextLand && !marchEntersLand(state, army, nextLand) ? FRONTIER_T : 1;
        // From wherever the host is now. A standing host is at its stand; one that is part-way
        // home from a leg that ended, or part-way down a road its order has just been re-pointed
        // from, starts the new route from where it is rather than jumping back to the stand.
        const origin = fresh ? stand : { x: marker.x, y: marker.y };
        this.routes.set(
          army.id,
          this.buildLeg(state, land, nextLand ?? land, origin, legEnd, getAnchor, roadAnchor, wx, wy),
        );
      }

      // **A picket stands on the line, facing the fight.** A host engaged against a province it
      // does not stand on holds at the frontier of the road to it — where its march stopped, or,
      // for a host that opened the fight from its own stand, marched out to now — until the fight
      // is over. Only then does it walk on (the place is taken) or home (it is not).
      let picket: MarchLeg | undefined;
      if (picketLand) {
        const existing = this.routes.get(army.id);
        if (existing && existing.fromId === land.id && existing.toId === picketLand.id) {
          picket = existing;
        } else {
          const origin = fresh ? stand : { x: marker.x, y: marker.y };
          this.stopMarch(army.id);
          this.moveLegs.delete(army.id);
          picket = this.buildLeg(state, land, picketLand, origin, FRONTIER_T, getAnchor, roadAnchor, wx, wy);
          this.routes.set(army.id, picket);
          // Marches out to the line at the pace a leg to that province would take.
          this.paceMs.set(army.id, this.legPace(state, army, picketLand, picket));
        }
        picket.direction = 1;
      }

      // **A host on the road is in formation, whichever way it is walking — or standing on it.**
      // Under an order; walking off the road its last order ended on; holding the line of a
      // fight; or about to walk home — a host whose order has just gone while it stands away from
      // its stand is about to walk home along that road, facing home, not as a standing block with
      // its general's portrait sliding along the ground. Decided here, above the signature, so the
      // formation is built once.
      let homeward: { leg: MarchLeg; forward: boolean } | undefined;
      if (!marching && !picket && !walking) {
        const last = this.routes.get(army.id);
        const away = Math.hypot(marker.x - stand.x, marker.y - stand.y);
        if (last && away > 1 && (army.landId === last.toId || army.landId === last.fromId)) {
          homeward = { leg: last, forward: army.landId === last.toId };
          last.direction = homeward.forward ? 1 : -1;
        }
      }
      const onRoad = marching || walking || Boolean(picket) || Boolean(homeward);
      const leg = onRoad ? this.routes.get(army.id) : undefined;
      // Which way the road runs where the host is — the host is drawn facing along it. Quantised
      // to eight points of the compass: the heading is part of the marker's redraw signature, and
      // a host that rebuilt every time the road bent a degree would rebuild every frame it walked.
      const heading = leg ? headingAlong(leg) : 0;
      const kit = { ...hostKitFor(state, army), marching: onRoad, marchHeading: heading };
      // The kit is part of what the marker *is*, so it belongs in the signature that decides
      // whether to redraw one. Without it an era turning, or a host being re-equipped, would
      // leave the old wardrobe on the map until the headcount happened to change.
      const sig = `${total}|${isPlayer ? playerSignKey : 0}|${kingdomColor ?? 0}|${flagSeed}`
        + `|${kit.theme ?? kit.era}|${kit.tier}|${Math.round((kit.units?.archers ?? 0) / Math.max(1, total) * 8)}`
        + `|${Math.round((kit.units?.heavyInfantry ?? 0) / Math.max(1, total) * 8)}`
        // Turning to face the road and turning back each redraw the host exactly once — twice a
        // journey, plus once more wherever the road turns a corner sharp enough to change the
        // compass point.
        + `|${onRoad ? `march:${heading.toFixed(2)}` : 'stand'}`;
      // Whether the feet move: under an order, or walking a road under none. A picket holding
      // the line stands still, facing it.
      const stepping = marching || walking;
      if (this.contentSig.get(army.id) !== sig) {
        // Kill the old formation's looping tween before destroying its container,
        // otherwise it keeps ticking against a dead object (CPU leak).
        this.killTweensDeep(marker);
        marker.removeAll(true);
        this.selectionFlags.delete(army.id);
        this.faceBadges.delete(army.id);
        const body = this.mapItems.createArmyMarker(
          total, isPlayer, kingdomColor, flagSeed, kit,
        );
        marker.add(body);
        // The authored Conquest host now carries real four-frame leg/hoof motion, so its route
        // container stays geometrically stable. Legacy modes and procedural rollback do not carry
        // that data key and retain their previous whole-block tread unchanged.
        // **Feet move when the host does.** Both cadences — the authored four-frame legs
        // and the procedural rank tread — are built stopped and started here, from the one
        // place that knows whether this host has somewhere to be. Every garrison on the map
        // used to march on the spot for the whole game.
        setConquestArmyStepping(body, stepping);
        setHostStepping(body, stepping);
        if (stepping && !body.getData('conquestArmyFrameAnimation')) {
          this.scene.tweens.add({
            targets: body,
            y: MARCH_TREAD,
            duration: MARCH_TREAD_MS,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
        this.contentSig.set(army.id, sig);
      }

      // The general's face beside a standing host, so "who is where" reads off the map. Only
      // while the host stands — a host on the road carries its standard, not a portrait — and
      // only for the player's own hosts, whose generals are the ones with faces.
      const general = isPlayer && !onRoad && !army.isLevy
        ? state.heroes.find((hero) => hero.id === army.generalHeroId)
        : undefined;
      const existing = this.faceBadges.get(army.id);
      if (existing && (!general || existing.heroId !== general.id)) {
        existing.badge.destroy();
        this.faceBadges.delete(army.id);
      }
      if (general && !this.faceBadges.has(army.id)) {
        const key = heroFaceTextureKey(this.scene, general);
        if (key) {
          const badge = retainHeroFace(this.scene.add.image(FACE_BADGE_X, FACE_BADGE_Y, key));
          const frame = this.scene.textures.getFrame(key);
          const scale = FACE_BADGE_SIZE / Math.max(1, Math.max(frame.width, frame.height));
          badge.setScale(scale);
          marker.add(badge);
          this.faceBadges.set(army.id, { heroId: general.id, badge });
        }
      }

      const selected = state.selectedArmyId === army.id;
      const hasFlag = this.selectionFlags.has(army.id);
      if (selected && !hasFlag) {
        const flag = this.mapItems.createSelectionFlag();
        marker.add(flag);
        this.selectionFlags.set(army.id, flag);
      } else if (!selected && hasFlag) {
        this.selectionFlags.get(army.id)!.destroy();
        this.selectionFlags.delete(army.id);
      }

      if (order && order.path.length > 0 && legKey !== undefined && leg) {
        // What is left on the order's clock, in ticks: the leg resolves when its banked ticks
        // reach `legRequired`, and the next one is banked at the next tick boundary — which is
        // `1 - phase` of a tick away, however recently the order was given.
        const phase = Math.max(0, Math.min(1, tickPhase()));
        const remainingTicks = Math.max(0.02, order.legRequired - order.progress - phase);
        const remainingMs = remainingTicks * tickMs(state);
        if (legChanged) {
          leg.clock = { progress0: order.progress, phase0: phase };
          this.moveLegs.set(army.id, legKey);
          this.stopMarch(army.id);
          this.scene.tweens.killTweensOf(marker);

          // **On the road, not beside it.** A marching marker sits exactly on the route: the
          // marker's origin is the host's ground line, so the men's feet are on the road they
          // walk. The standing offset that keeps a waiting host off its own gate is the route's
          // first step, not a shift applied to every point of it — which used to walk every
          // host eighteen points to the right of and twenty-eight above the road.
          //
          // A leg drawn part-way through — a save reloaded on the road — starts where the ticks
          // already banked on it say the host is; a fresh order starts at the host's own feet.
          leg.progress.t = Math.min(0.999, Math.max(0, order.progress) / Math.max(1, order.legRequired));
          leg.at = leg.progress.t * leg.legEnd;
          const start = leg.route.getPointAt(leg.at);
          marker.setPosition(start.x, start.y);
          // The whole road this leg covers, so the view index can hold the marker for all of it.
          const finish = leg.route.getPointAt(leg.legEnd);
          this.legSpans.set(army.id, { x1: start.x, y1: start.y, x2: finish.x, y2: finish.y });

          // How far back along the road this host reaches, so its dust rises along the whole host
          // rather than from the single point at its head. Measured once per leg from what was
          // actually drawn: a host's length depends on how many men it has, and a fixed offset is
          // right for exactly one army size. The AABB diagonal stands in for the long axis.
          const body = marker.list[0] as Phaser.GameObjects.Container | undefined;
          const drawn = body?.getBounds ? body.getBounds() : undefined;
          this.columnReach.set(
            army.id,
            drawn ? Math.min(70, Math.hypot(drawn.width, drawn.height) * 0.5) : 0,
          );

          // **One pace, held to the tick.** A march is timed to the order's clock, and an ease at
          // either end bends that timing: the ease-out the last leg used to carry put the men at
          // the far gate a third of a season before the state had them there. Linear, straight
          // through every province line, and the re-timing below keeps the pace honest.
          this.startMarch(army.id, marker, leg, remainingMs, 'Linear');
        } else {
          // **Re-timed to the clock, every refresh.** See `CLOCK_SLACK`. Where the host should
          // be is how much of the leg's wall time has run since it was drawn, measured against
          // how much there was to run.
          const { progress0, phase0 } = leg.clock;
          const wallTotal = Math.max(0.05, order.legRequired - progress0 - phase0);
          const wallElapsed = Math.max(0, order.progress + phase - progress0 - phase0);
          const t0 = Math.max(0, progress0) / Math.max(1, order.legRequired);
          const expected = Math.min(1, t0 + (1 - t0) * (wallElapsed / wallTotal));
          const tween = this.moveTweens.get(army.id);
          if (Math.abs(leg.progress.t - expected) > CLOCK_SLACK && (tween || leg.progress.t < 1)) {
            this.startMarch(army.id, marker, leg, remainingMs, 'Linear');
          }
        }

        const destLand = findLand(state, order.path[order.path.length - 1]);
        if (destLand) {
          const anchor = getAnchor(destLand);

          // A dashed line from the host to where it is going, under the pennant.
          //
          // The pennant alone marks the destination but says nothing about *whose* march it
          // belongs to — with two or three hosts moving at once you cannot tell which arrow is
          // which. The line makes the association explicit.
          const trail = this.scene.add.graphics();
          trail.setDepth(68);
          const fromX = marker.x;
          // The marker's own origin is the block's ground line — `drawHost` anchors at `-height`
          // so the feet land at y ≈ 0. The `+6` this used to carry started the trail below the men,
          // the same off-by-a-foot-offset the standard had.
          const fromY = marker.y;
          const toX = wx(anchor.x);
          const toY = wy(anchor.y) - 12;

          // An arrow, not a dotted rule.
          //
          // This was nine evenly-weighted dashes between two points, which says *these two places
          // are related* and nothing whatever about which way anybody is walking — the same mark
          // read identically whether the host was marching out or coming home. Two things fix it
          // without any new art: the dashes **taper**, thin at the host and heavy at the target,
          // so the line has a direction even standing still; and it ends in a **head**.
          const dx = toX - fromX;
          const dy = toY - fromY;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const HEAD = 11;
          const HEAD_HALF = 5.5;
          const shaft = Math.max(0, len - HEAD);
          const segments = 9;
          for (let i = 0; i < segments; i += 2) {
            const a = (i / segments) * shaft;
            const bEnd = Math.min(shaft, ((i + 1) / segments) * shaft);
            const t = bEnd / Math.max(1, shaft);
            trail.lineStyle(1.1 + t * 1.6, INK.sealRed, 0.34 + t * 0.4);
            trail.lineBetween(fromX + ux * a, fromY + uy * a, fromX + ux * bEnd, fromY + uy * bEnd);
          }
          // The head sits on the line's own end, pointing where the host is going.
          const tipX = fromX + ux * len;
          const tipY = fromY + uy * len;
          const backX = fromX + ux * shaft;
          const backY = fromY + uy * shaft;
          trail.fillStyle(INK.sealRed, 0.78);
          trail.fillTriangle(
            tipX, tipY,
            backX - uy * HEAD_HALF, backY + ux * HEAD_HALF,
            backX + uy * HEAD_HALF, backY - ux * HEAD_HALF,
          );
          this.destinationMarkers.push(trail);

          const arrow = this.mapItems.createDestinationArrow();
          arrow.setPosition(toX, wy(anchor.y) - 40);
          arrow.setDepth(71);
          this.destinationMarkers.push(arrow);
        }
      } else if (picket) {
        // On the line, or on the way to it. A march that stopped at the frontier is already
        // there; a host that opened the fight from its own stand walks out; a picket the tick
        // left short of the line finishes the walk. Then it holds — no walk home while the fight
        // it went to is still on.
        const short = Math.abs(picket.at - picket.legEnd) > 0.005;
        if (short && !this.moveTweens.has(army.id)) {
          const pace = this.paceMs.get(army.id) ?? this.legPace(state, army, picketLand as Land, picket);
          this.walkRoute(army.id, marker, picket, picket.legEnd, pace, 'hold');
        } else if (!short && !this.moveTweens.has(army.id)) {
          const point = picket.route.getPointAt(picket.legEnd);
          marker.setPosition(point.x, point.y);
        }
      } else if (walking) {
        // Still walking off the road from its last leg. Left alone: the walk ends at the stand on
        // its own, and interrupting it here is precisely the snap this set exists to prevent.
      } else {
        // **Coming to rest — along the road, at walking pace, whatever the distance.**
        //
        // This used to snap, then it eased over a flat 320 ms, then it slid in a straight line at
        // the pace of the march. A fixed time is a walk over a few points and a teleport over a
        // few hundred, and a few hundred is the normal case: an attack order ends with the order
        // deleted and the host still standing in its own province, so the marker had a whole leg
        // to cover. Measured at up to 1,500 units/second against a marching 100–170 — the ten-fold
        // spike a player reads as the army snapping. And a straight slide cut the corner of the
        // road it had just walked, through fields and over water.
        //
        // The frontier clamp above means there is usually only the walk back from the border left
        // to do, and this covers it **back along the road** at the pace the host was marching at,
        // so the return is a march rather than a jump. A leg the tick resolved a little before the
        // tween reached the far stand walks the rest of the way forward the same way.
        const last = this.routes.get(army.id);
        this.moveLegs.delete(army.id);
        this.stopMarch(army.id);

        const away = Math.hypot(marker.x - stand.x, marker.y - stand.y);
        if (away > 1 && homeward && last === homeward.leg) {
          this.scene.tweens.killTweensOf(marker);
          const pace = this.paceMs.get(army.id) ?? (ARRIVE_MS / 40);
          this.walkRoute(army.id, marker, homeward.leg, homeward.forward ? 1 : 0, pace, 'stand', stand);
        } else {
          this.routes.delete(army.id);
          if (away <= 1) {
            marker.setRotation(0);
          } else {
            this.scene.tweens.killTweensOf(marker);
            marker.setPosition(stand.x, stand.y);
            marker.setRotation(0);
          }
        }
      }
    }

    for (const [armyId, marker] of this.markers) {
      if (!activeIds.has(armyId)) {
        this.stopMarch(armyId);
        this.killTweensDeep(marker);
        marker.destroy();
        this.markers.delete(armyId);
        this.moveLegs.delete(armyId);
        this.routes.delete(armyId);
        this.contentSig.delete(armyId);
        this.selectionFlags.delete(armyId);
        this.faceBadges.delete(armyId);
      }
    }
  }

  /** Where a host waits when it is not on the road: beside its seat, off the gate. */
  private standingPoint(
    land: Land,
    getAnchor: SettlementAnchor,
    wx: WorldTransform,
    wy: WorldTransform,
  ): RoutePoint {
    const anchor = getAnchor(land);
    return { x: wx(anchor.x) + MARKER_OFFSET_X, y: wy(anchor.y) + MARKER_OFFSET_Y };
  }

  /** Milliseconds per world unit for a full leg to `land`, from the order the state would give it. */
  private legPace(state: GameState, army: Army, land: Land, leg: MarchLeg): number {
    return (getLegTicks(army, land, state) * tickMs(state)) / Math.max(1, leg.route.getLength());
  }

  /**
   * The whole of one leg: from where the host is, down to the gate, along the road the map draws
   * between the two provinces, and off the far gate to the stand beside the next seat.
   *
   * The road is `drawnRoadBetween` — the very spline the map painted, walked backwards when the
   * host is travelling from the higher id to the lower — so the host is on the road and crosses
   * the river where the bridge is. Where no road is drawn (one end is wilderness, or has not been
   * seen yet) the host makes a track of its own on the same sorted key, from the gate it leaves by
   * to the far seat, so it comes back by the way it went.
   */
  private buildLeg(
    state: GameState,
    from: Land,
    to: Land,
    origin: RoutePoint,
    legEnd: number,
    getAnchor: SettlementAnchor,
    roadAnchor: RoadAnchor,
    wx: WorldTransform,
    wy: WorldTransform,
  ): MarchLeg {
    const destStand = this.standingPoint(to, getAnchor, wx, wy);
    const drawn = drawnRoadBetween(state, from, to, roadAnchor, wx, wy);
    let road: Phaser.Curves.Spline;
    if (drawn) {
      road = drawn.reversed ? reversedSpline(drawn.curve) : drawn.curve;
    } else {
      const reversed = from.id > to.id;
      const lo = reversed ? to : from;
      const hi = reversed ? from : to;
      const endOf = (land: Land, toward: Land) => (land.hasVillage ? roadAnchor(land, toward) : getAnchor(land));
      const track = buildRoadCurve(state, endOf(lo, hi), endOf(hi, lo), `track|${lo.id}|${hi.id}`, wx, wy, ROAD_RUNWAY);
      road = reversed ? reversedSpline(track) : track;
    }
    const roadStart = road.getStartPoint();
    const roadEnd = road.getEndPoint();
    const route = new MarchRoute([
      new Phaser.Curves.Line(new Phaser.Math.Vector2(origin.x, origin.y), roadStart.clone()),
      road,
      new Phaser.Curves.Line(roadEnd.clone(), new Phaser.Math.Vector2(destStand.x, destStand.y)),
    ]);
    const stub = Math.hypot(roadStart.x - origin.x, roadStart.y - origin.y);
    const total = Math.max(1, route.getLength());
    return {
      route,
      legEnd,
      roadStartU: Math.min(1, stub / total),
      roadEndU: Math.min(1, (stub + road.getLength()) / total),
      fromId: from.id,
      toId: to.id,
      progress: { t: 0 },
      at: 0,
      direction: 1,
      clock: { progress0: 0, phase0: 0 },
    };
  }

  /**
   * The march itself: the leg's counter from where it is to 1 over `durationMs`, the marker
   * following the route by distance and kicking dust back along it. Replaces any march or walk
   * already under way for this host — which is how a march is re-timed to the clock.
   */
  private startMarch(
    armyId: string,
    marker: Phaser.GameObjects.Container,
    leg: MarchLeg,
    durationMs: number,
    ease: string,
  ): void {
    const previous = this.moveTweens.get(armyId);
    if (previous) {
      previous.remove();
      this.moveTweens.delete(armyId);
    }
    const remaining = Math.max(1, leg.route.getLength() * leg.legEnd * (1 - leg.progress.t));
    // How long this host takes to cover one world unit, so anything else that has to move it
    // — the walk home when an order ends — moves it at the pace it marches at rather than at
    // a flat time that becomes a teleport over any real distance.
    this.paceMs.set(armyId, Math.max(1, durationMs) / remaining);
    const progress = leg.progress;
    const marchTween = this.scene.tweens.add({
      targets: progress,
      t: 1,
      duration: Math.max(1, durationMs),
      ease,
      onUpdate: () => {
        if (!marker.active) return;
        const u = progress.t * leg.legEnd;
        leg.at = u;
        const point = leg.route.getPointAt(u);
        marker.setPosition(point.x, point.y);
        // Dust, rather than making the marker itself jiggle: the marker already contains a
        // formation with its own cadence, so tilting and bouncing the container on top made
        // the figures wobble against each other. The host travels steadily and kicks up dust
        // behind it, which reads as movement without animating the thing that was already
        // animated. Each puff rises somewhere along the host's own length, walked back from
        // the marker along the road's direction of travel.
        const tangent = leg.route.getTangentAt(u);
        const back = 4 + Math.random() * (this.columnReach.get(armyId) ?? 0);
        this.spawnDust(armyId, point.x - tangent.x * back, point.y - tangent.y * back);
      },
      onComplete: () => {
        if (this.moveTweens.get(armyId) === marchTween) this.moveTweens.delete(armyId);
      },
    });
    // Born stopped if the world is stopped: `refresh()` can hand a new leg out while a prompt
    // holds the clock, and a tween created mid-pause would be the one thing still walking.
    if (this.paused) marchTween.pause();
    this.moveTweens.set(armyId, marchTween);
  }

  /**
   * Walks a host along a road under no order, at the pace it marched at: home to its stand, on
   * to the stand of the province it has just taken, or out to the line of a fight to hold there.
   */
  private walkRoute(
    armyId: string,
    marker: Phaser.GameObjects.Container,
    leg: MarchLeg,
    targetU: number,
    pace: number,
    arrive: 'stand' | 'hold',
    stand?: RoutePoint,
  ): void {
    const distance = Math.abs(targetU - leg.at) * leg.route.getLength();
    const body = marker.list[0];
    if (body) {
      setConquestArmyStepping(body, true);
      setHostStepping(body as unknown as { getData(key: string): unknown }, true);
    }
    const walk = { u: leg.at };
    this.resting.add(armyId);
    const tween = this.scene.tweens.add({
      targets: walk,
      u: targetU,
      // Capped so a host that somehow has half the map to cross does not walk for a minute,
      // and floored so a step of two points is still a step rather than an instant.
      duration: Phaser.Math.Clamp(distance * pace, ARRIVE_MS, 4000),
      // Settles rather than springing. `Back.easeOut` overshoots and snaps back, which on
      // a container full of individually-bobbing soldiers reads as a stumble on arrival.
      ease: 'Sine.easeOut',
      onUpdate: () => {
        if (!marker.active) return;
        leg.at = walk.u;
        const point = leg.route.getPointAt(walk.u);
        marker.setPosition(point.x, point.y);
      },
      onComplete: () => {
        this.moveTweens.delete(armyId);
        this.resting.delete(armyId);
        if (!marker.active) {
          this.routes.delete(armyId);
          return;
        }
        if (body) {
          setConquestArmyStepping(body, false);
          setHostStepping(body as unknown as { getData(key: string): unknown }, false);
        }
        if (arrive === 'hold') {
          // On the line. The route stays: it is the road the host will leave by.
          return;
        }
        this.routes.delete(armyId);
        // The route ends at the stand when the leg began there. A leg that began part-way down
        // a road — an order re-pointed mid-march — ends its walk home where that road began, and
        // the last few points to the stand are one short step.
        const rest = stand ? Math.hypot(marker.x - stand.x, marker.y - stand.y) : 0;
        if (stand && rest > 1) {
          this.settleStraight(armyId, marker, stand, rest * pace);
        } else {
          if (stand) marker.setPosition(stand.x, stand.y);
          marker.setRotation(0);
          this.redraw?.();
        }
      },
    });
    if (this.paused) tween.pause();
    this.moveTweens.set(armyId, tween);
  }

  /** The straight step onto the stand, for a host that has no road under it to walk. */
  private settleStraight(
    armyId: string,
    marker: Phaser.GameObjects.Container,
    stand: RoutePoint,
    ms: number,
  ): void {
    this.resting.add(armyId);
    // Held in `moveTweens` like a march, because that is what it is: it moves the host
    // across the map for seconds, and it has to stop when the world's clock does.
    const settle = this.scene.tweens.add({
      targets: marker,
      x: stand.x,
      y: stand.y,
      rotation: 0,
      duration: Phaser.Math.Clamp(ms, ARRIVE_MS, 4000),
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.moveTweens.delete(armyId);
        this.resting.delete(armyId);
        const body = marker.active ? marker.list[0] : undefined;
        if (body) {
          setConquestArmyStepping(body, false);
          setHostStepping(body as unknown as { getData(key: string): unknown }, false);
        }
        if (marker.active) this.redraw?.();
      },
    });
    if (this.paused) settle.pause();
    this.moveTweens.set(armyId, settle);
  }

  /**
   * A puff of road dust behind a marching host.
   *
   * Rate-limited rather than emitted per frame: `onUpdate` runs every tick of the tween, and one
   * puff per frame is both a performance problem and a solid smear rather than a trail.
   */
  private spawnDust(armyId: string, x: number, y: number): void {
    const now = this.scene.time.now;
    if (now - (this.lastDustAt.get(armyId) ?? 0) < DUST_INTERVAL_MS) return;
    this.lastDustAt.set(armyId, now);

    // **Scaled to the men, not to the map.**
    //
    // A puff was eight to fourteen points across and grew to twice that, which on a host drawn
    // ten points wide is a grey ellipse larger than the column that raised it — reported as blobs
    // beside the men rather than dust behind them. A boot lifts a little dust, and there is more
    // of it than there is of any one puff: these are a third the size, half as dark, live a third
    // as long, and come twice as often.
    //
    // Cut again with the trail (see `DUST_LIFE_MS`): on screen these measured 20 to 52 points
    // across against a column eight points wide, which is not dust — it is a row of puddles. A
    // puff is now about a third of a man wide and half as dark as it was.
    const px=x-2+Math.random()*4, py=y-0.5+Math.random()*2;
    const width=3+Math.random()*2, height=1.6+Math.random();
    const puff=this.idleDust.pop()??this.scene.add.ellipse(0,0,width,height,DUST_INK,0.18);
    puff.setPosition(px,py).setSize(width,height).setScale(1).setAlpha(1).setVisible(true).setActive(true).setDepth(69);
    this.dust.push(puff);

    this.scene.tweens.add({
      targets: puff,
      alpha: 0,
      // Spreads as it settles rather than billowing: a marching column is not a cavalry charge.
      scaleX: 1.6,
      scaleY: 1.3,
      y: puff.y - 2.8,
      duration: DUST_LIFE_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        const index=this.dust.indexOf(puff);if(index>=0)this.dust.splice(index,1);
        puff.setVisible(false).setActive(false).setScale(1).setAlpha(1).setPosition(0,0);
        puff.removeInteractive();
        if(this.idleDust.length<32)this.idleDust.push(puff);else puff.destroy();
      },
    });
  }

  /** Removes an army's march or walk tween — the `{t}` counter tween no marker-keyed kill can reach. */
  private stopMarch(armyId: string): void {
    // The leg it was walking goes with it: a host that has stopped is indexed where it stands.
    this.legSpans.delete(armyId);
    this.columnReach.delete(armyId);
    this.resting.delete(armyId);
    const tween = this.moveTweens.get(armyId);
    if (tween) {
      tween.remove();
      this.moveTweens.delete(armyId);
    }
  }

  /** Scene teardown: the scene's TweenManager dies with it, but the handles must not dangle. */
  destroy(): void {
    this.redraw = undefined;
    for (const armyId of [...this.moveTweens.keys()]) {
      this.stopMarch(armyId);
    }
    this.routes.clear();
    this.clearDust();
  }

  clearDust(): void {
    for (const puff of [...this.dust,...this.idleDust]) {
      this.scene.tweens.killTweensOf(puff);
      puff.destroy();
    }
    this.dust = [];this.idleDust = [];
  }

  /** Kills tweens on a container and every nested descendant (e.g. the formation's
   *  looping bob), so destroying it doesn't leave orphaned tweens updating dead objects. */
  private killTweensDeep(obj: Phaser.GameObjects.GameObject): void {
    this.scene.tweens.killTweensOf(obj);
    const list = (obj as Phaser.GameObjects.Container).list;
    if (Array.isArray(list)) {
      for (const child of list) this.killTweensDeep(child);
    }
  }
}

/**
 * The compass point the road takes where the host is, in radians.
 *
 * Eight points, not a continuous angle: this feeds the marker's redraw signature, so it has to be
 * a value that changes rarely. Clamped to the road proper at both ends: read past the far gate, a
 * host that had reached it and stood waiting for the tick turned to face the step to its stand,
 * and the road is the only thing a host on it is ever faced along. Read ahead in the direction of
 * travel — a host walking home reads the road behind it, and faces that way.
 */
function headingAlong(leg: MarchLeg): number {
  const first = leg.roadStartU + HEADING_LOOKAHEAD;
  const last = leg.roadEndU - HEADING_LOOKAHEAD;
  const u = last > first
    ? Math.min(last, Math.max(first, leg.at + HEADING_LOOKAHEAD * leg.direction))
    : (leg.roadStartU + leg.roadEndU) / 2;
  const tangent = leg.route.getTangentAt(u);
  const step = Math.PI / 4;
  return Math.round(Math.atan2(tangent.y * leg.direction, tangent.x * leg.direction) / step) * step;
}
