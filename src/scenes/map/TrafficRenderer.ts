/**
 * Roads connecting settlements, plus the animated ox-carts and travelers that
 * wander along them. Pairs with selected environment and item renderers.
 */
import Phaser from 'phaser';
import { drawnRoadBetween } from '../../map/roadCurve';
import { axialToPixel } from '../../map/hex';
import {
  addNaturalTravelMotion,
  advanceNaturalTravelMotion,
  faceTravel,
  setNaturalTravelMotionActive,
  type NaturalMotionKind,
  type Walkable,
} from '../../ui/ink/life';
import { LIVING_PX_PER_M } from '../../ui/ink/proportion';
import { hashString } from '../../utils/math';
import { trafficPerRoad } from '../../game/lifeSettings';
import type { GameState, Land } from '../../state/types';
import type { MapRenderer } from '../../ui/MapRenderer';
import type { MapItemRenderer } from '../../ui/MapItemRenderer';

type WorldTransform = (value: number) => number;
type SettlementAnchor = (land: Land, toward?: Land) => { x: number; y: number };

/** A wanderer and the looping tween that walks it, so the loop can be stopped and restarted. */
interface TrafficMover {
  object: Phaser.GameObjects.GameObject & { setPosition(x: number, y: number): unknown };
  tween: Phaser.Tweens.Tween;
}

export class TrafficRenderer {
  private cartMarkers = new Map<string, TrafficMover>();
  private travelerMarkers = new Map<string, TrafficMover[]>();
  /** The world-space span of each road, so the view index can place its movers without chasing them. */
  private moverSpans = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  /** Whether the world's clock is stopped. New movers are created to match. */
  private paused = false;
  /** Movers held back by the view index because their road is off-screen. */
  private culled = new Set<string>();
  /** Cross-layer keep-out such as a live nameplate; evaluated at the mover's current world point. */
  private obscured?: (x: number, y: number) => boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapRenderer: MapRenderer,
    private readonly mapItems: MapItemRenderer,
  ) {}

  setObscuredTest(test: ((x: number, y: number) => boolean) | undefined): void {
    this.obscured = test;
  }

  /**
   * Holds or releases every cart and traveler on the map.
   *
   * These loop on `repeat: -1` and so used to keep walking through a pause: the player stopped
   * the clock and the realm's roads carried on regardless, which reads as the pause not having
   * worked. A stopped clock now stops the world it is the clock for.
   */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      for (const mover of this.movers()) {
        mover.tween.pause();
        setNaturalTravelMotionActive(mover.object as unknown as Walkable, false);
      }
      return;
    }
    // Releasing the clock must not release the movers the camera has culled — they are still
    // off-screen, and resuming them here would quietly undo the view culling on every unpause.
    for (const target of this.cullTargets()) {
      if (this.culled.has(target.id)) {
        continue;
      }
      const mover = this.moverById(target.id);
      mover?.tween.resume();
      if (mover) setNaturalTravelMotionActive(mover.object as unknown as Walkable, true);
    }
  }

  private movers(): TrafficMover[] {
    return [...this.cartMarkers.values(), ...[...this.travelerMarkers.values()].flat()];
  }

  /**
   * Every mover with the road it walks, for the view index.
   *
   * Indexed by the road's midpoint and half its length rather than by where the mover happens to
   * be, so a cart never has to be re-indexed as it walks. Culling these is the largest single
   * saving on the map: each one runs an `onUpdate` every frame that evaluates a spline, for every
   * road pair in the country, whether or not the camera is anywhere near it.
   */
  cullTargets(): Array<{ id: string; x: number; y: number; radius: number }> {
    const out: Array<{ id: string; x: number; y: number; radius: number }> = [];
    for (const [key, span] of this.moverSpans) {
      const x = (span.x1 + span.x2) / 2;
      const y = (span.y1 + span.y2) / 2;
      const radius = Math.hypot(span.x2 - span.x1, span.y2 - span.y1) / 2 + 40;
      // `::` because a road key is itself `landA|landB` — splitting these on `|` is ambiguous.
      if (this.cartMarkers.has(key)) {
        out.push({ id: `cart::${key}`, x, y, radius });
      }
      const walkers = this.travelerMarkers.get(key) ?? [];
      for (let index = 0; index < walkers.length; index += 1) {
        out.push({ id: `walk::${key}::${index}`, x, y, radius });
      }
    }
    return out;
  }

  /**
   * Holds or releases one mover because the camera has left or reached its road.
   *
   * Deliberately does not fight `setPaused`: releasing a mover while the world's clock is stopped
   * only makes it visible again, it does not start it walking. The two reasons a cart can be still
   * are independent, and the clock outranks the camera.
   */
  setCulled(id: string, culled: boolean): void {
    const mover = this.moverById(id);
    if (!mover) {
      return;
    }
    if (culled) {
      this.culled.add(id);
      mover.tween.pause();
      setNaturalTravelMotionActive(mover.object as unknown as Walkable, false);
    } else {
      this.culled.delete(id);
      if (!this.paused) {
        mover.tween.resume();
        setNaturalTravelMotionActive(mover.object as unknown as Walkable, true);
      }
    }
    (mover.object as unknown as { setVisible(v: boolean): unknown }).setVisible(!culled);
  }

  private moverById(id: string): TrafficMover | undefined {
    const parts = id.split('::');
    if (parts[0] === 'cart') {
      return this.cartMarkers.get(parts[1]);
    }
    return this.travelerMarkers.get(parts[1])?.[Number(parts[2])];
  }

  /**
   * Walks one mover back and forth along its road, forever.
   *
   * Created already held when the world is paused, so a settlement revealed while the clock is
   * stopped does not arrive with its traffic already moving.
   */
  /**
   * How long a road takes to walk, from how long the road is.
   *
   * Every wanderer used to get a duration picked by hand -- 20 to 38 seconds for a traveller, 16
   * to 29 for a cart -- over a curve whose length is set by where two settlements happen to sit.
   * The same figure therefore ambled down a short road and sprinted a long one, and measured on
   * the map the traveller was covering ground at about **1.8 m/s**: a jog, not a walk. Now that
   * the walk cycle is driven by distance (see `walkStrideFor`), that speed came straight out in
   * the legs, which is what "the animation is too fast" was actually describing.
   *
   * Pacing by length instead gives one honest speed across the whole map, and the seed only
   * varies it a little -- some people walk faster than others; nobody walks four times faster.
   */
  private roadDuration(curve: Phaser.Curves.Spline, seed: number, metresPerSecond: number): number {
    const length = Math.max(1, curve.getLength());
    const spread = 0.88 + ((seed % 25) / 100);
    const pace = metresPerSecond * spread * LIVING_PX_PER_M;
    // A yoyo tween's `duration` is one direction, and the ease spends the middle of each leg
    // faster than the ends; the mean over a leg is still `length / pace`.
    return Phaser.Math.Clamp((length / pace) * 1000, 4000, 120000);
  }

  private walk(
    mover: Phaser.GameObjects.GameObject & {
      setPosition(x: number, y: number): unknown;
      setScale?(x: number, y: number): unknown;
    },
    curve: Phaser.Curves.Spline,
    seed: number,
    duration: number,
    motion: NaturalMotionKind,
  ): TrafficMover {
    // Starts at the road head, always. The seed used to be dropped straight into `t`, which looks
    // like a stagger and is not one: a tween interpolates from *its start value* to 1 over the
    // whole duration, so a traveller seeded at t = 0.8 spent that entire duration shuffling across
    // the last fifth of his road -- a fifth of the intended speed, over a fifth of the road, and a
    // different fifth for every traveller. That is where the 63-fold spread in measured gait came
    // from. The stagger is applied to the *tween* below instead, where it costs no speed.
    const progress = { t: 0 };
    let facing = 0;
    let positioned = false;
    const step = () => {
      if (!mover.active) return;
      const point = curve.getPoint(progress.t);
      const previousX = (mover as unknown as { x: number }).x;
      const previousY = (mover as unknown as { y: number }).y;
      // Face the way you are going. These tweens yoyo, so half of every round trip is spent
      // travelling backwards down the same road — and a cart drawn with its ox in front becomes an
      // ox being pushed along behind it. Nothing else on the map moves, so it is the one thing on
      // screen the eye is already following.
      //
      // `faceTravel` multiplies the step's direction by the direction the glyph was *drawn* in.
      // The authored Đông Hồ cart faces right while the procedural fallback faces left, so each
      // renderer declares its own native direction instead of this loop guessing from the subject.
      // Keep the dead zone tiny: a spline can have a long, almost vertical stretch whose x travel
      // is subtle but still visible over time, and retaining the old direction there reads as the
      // ox pushing its cart backwards.
      const heading = point.x - (mover as unknown as { x: number }).x;
      if (Math.abs(heading) > 0.001) {
        const next = heading < 0 ? -1 : 1;
        if (next !== facing) {
          facing = next;
          if (mover.setScale) faceTravel(mover as unknown as Walkable, next);
        }
      }
      mover.setPosition(point.x, point.y);
      if (positioned) {
        advanceNaturalTravelMotion(
          mover as unknown as Walkable,
          Math.hypot(point.x - previousX, point.y - previousY),
        );
      }
      positioned = true;
      // Step behind a massif and you are behind it.
      //
      // Everything drawn into the map's cached image takes its turn in one back-to-front order, so
      // rock covers what stands behind it. A cart cannot join that order — it is a live object
      // above the whole cached image, which is exactly why it was last seen strolling up a
      // limestone cliff — so it asks the same question directly and stops drawing itself while the
      // rock is in the way. It keeps walking; the road still runs where it ran. You just cannot see
      // through a mountain.
      const shown = !(this.mapRenderer.isBehindRelief?.(point.x, point.y) ?? false)
        && !(this.obscured?.(point.x, point.y) ?? false);
      const view = mover as unknown as { visible: boolean; setVisible(value: boolean): unknown };
      if (view.visible !== shown) {
        view.setVisible(shown);
      }
    };
    addNaturalTravelMotion(this.scene, mover as unknown as Walkable, motion, seed);
    step();
    const tween = this.scene.tweens.add({
      targets: progress,
      t: 1,
      duration,
      yoyo: true,
      repeat: -1,
      // Linear, because the pace is now a speed rather than a duration and an ease would undo it:
      // `Sine.easeInOut` runs the middle of every leg at pi/2 -- over half again -- the mean, so a
      // 1.25 m/s walk peaked at 1.96 m/s mid-road while crawling at both ends. Distance drives the
      // legs, so that swing was visible as the gait speeding up and slowing down for no reason.
      // The yoyo turn is now abrupt, but it happens at a settlement gate, where turning round is
      // what the figure is doing anyway.
      ease: 'Linear',
      paused: this.paused,
      onUpdate: step,
    });
    // Spread the road's walkers along it without touching their pace. `seek` is in milliseconds
    // into the tween and a yoyo cycle is two legs; the coarse delta is deliberate -- this only has
    // to look unsynchronised, and a 16ms step would iterate thousands of times per traveller.
    const cycle = duration * 2;
    tween.seek(((seed % 100) / 100) * cycle, 500);
    step();
    setNaturalTravelMotionActive(mover as unknown as Walkable, !this.paused);
    return { object: mover, tween };
  }

  /** Stops a mover's loop before destroying it, so its `onUpdate` cannot outlive its target. */
  private retire(mover: TrafficMover): void {
    mover.tween.remove();
    mover.object.destroy();
  }

  /**
   * Drops a road's span once nothing walks it any more.
   *
   * Carts and travellers are retired independently, so the span survives until both are gone —
   * otherwise retiring a cart would strand its road's travellers outside the view index, and they
   * would never be culled again.
   */
  private forgetSpan(key: string, ...culledIds: string[]): void {
    for (const id of culledIds) {
      this.culled.delete(id);
    }
    if (!this.cartMarkers.has(key) && !this.travelerMarkers.has(key)) {
      this.moverSpans.delete(key);
    }
  }

  /** Remembers where a road runs, so its movers can be indexed once instead of tracked. */
  private recordSpan(key: string, curve: Phaser.Curves.Spline): void {
    const start = curve.getStartPoint();
    const end = curve.getEndPoint();
    this.moverSpans.set(key, { x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  }

  /**
   * Every water hex's world centre, bucketed by a tile-sized grid.
   *
   * Roads are splines between settlement anchors and have no idea what they pass over, so asking
   * "is this point on water" has to be answered geometrically. A bucket keeps it to nine lookups
   * instead of a walk of every wet cell on the map, which matters because a redraw asks it a few
   * thousand times.
   */
  private waterIndex(state: GameState, wx: WorldTransform, wy: WorldTransform): {
    cell: number;
    at(x: number, y: number): boolean;
  } {
    const hexSize = state.mapConfig.hexSize;
    const cell = Math.max(1, hexSize * 1.72);
    const buckets = new Map<string, Array<{ x: number; y: number }>>();
    for (const tile of state.hexTiles) {
      if (tile.terrain !== 'water') {
        continue;
      }
      const pixel = axialToPixel(tile.coord, hexSize);
      const point = { x: wx(pixel.x), y: wy(pixel.y) };
      const key = `${Math.floor(point.x / cell)}:${Math.floor(point.y / cell)}`;
      const list = buckets.get(key);
      if (list) {
        list.push(point);
      } else {
        buckets.set(key, [point]);
      }
    }
    // The hex inradius. This was half of it, which made every wet run measure short and left the
    // bridges as planks in midstream instead of crossings that reach both banks.
    const reach = cell * (Math.sqrt(3) / 2);
    return {
      cell,
      at: (x, y) => {
        const bx = Math.floor(x / cell);
        const by = Math.floor(y / cell);
        for (let ox = -1; ox <= 1; ox += 1) {
          for (let oy = -1; oy <= 1; oy += 1) {
            for (const point of buckets.get(`${bx + ox}:${by + oy}`) ?? []) {
              if (Math.hypot(x - point.x, y - point.y) <= reach) {
                return true;
              }
            }
          }
        }
        return false;
      },
    };
  }

  /**
   * Puts a crossing wherever a road runs over water.
   *
   * Samples the road, finds each unbroken run of wet samples, and hands the theme the middle of
   * that run with the road's bearing through it. A road that only clips a corner of one cell is
   * left alone — a bridge for two sample points is a plank in a puddle.
   */
  private drawCrossings(
    graphics: Phaser.GameObjects.Graphics,
    curve: Phaser.Curves.Spline,
    water: { cell: number; at(x: number, y: number): boolean },
    roadWidth: number,
  ): void {
    if (!this.mapRenderer.drawBridge) {
      return;
    }
    const points = curve.getSpacedPoints(64);
    let runStart = -1;
    const spans: Array<{ from: number; to: number }> = [];
    for (let index = 0; index < points.length; index += 1) {
      const wet = water.at(points[index].x, points[index].y);
      if (wet && runStart < 0) {
        runStart = index;
      } else if (!wet && runStart >= 0) {
        spans.push({ from: runStart, to: index - 1 });
        runStart = -1;
      }
    }
    if (runStart >= 0) {
      spans.push({ from: runStart, to: points.length - 1 });
    }

    // One crossing per road, and it has to reach both banks.
    //
    // The deck is measured from the last dry sample BEFORE the water to the first dry sample
    // AFTER it, not across the wet run — a deck sized to the water alone stops at the waterline
    // and reads as a raft moored midstream. Bank to bank is what makes it a bridge.
    //
    // Three things disqualify a span. A road running *along* a bank is wet for its whole length
    // and is not a crossing (`maxSpan`). A road meeting a wide channel at a shallow angle dips in
    // and out repeatedly, so only the longest span on a road is built — otherwise the decks chain
    // into what looks like a plank laid down the valley. And water narrow enough to step over gets
    // nothing at all: a cart fords a stream, and a bridge over two metres of water looks absurd.
    const maxSpan = water.cell * 6;
    const minSpan = water.cell * 0.9;

    let best: { from: number; to: number; length: number } | undefined;
    for (const span of spans) {
      const length = Math.hypot(
        points[span.to].x - points[span.from].x,
        points[span.to].y - points[span.from].y,
      );
      if (length < minSpan || length > maxSpan) {
        continue;
      }
      if (!best || length > best.length) {
        best = { from: span.from, to: span.to, length };
      }
    }
    if (!best) {
      return;
    }

    // Step back to dry ground on each side. Clamped to the ends of the road, so a crossing right
    // at a settlement still gets a deck rather than running off the end of the curve.
    const landward = Math.max(0, best.from - 1);
    const seaward = Math.min(points.length - 1, best.to + 1);
    const a = points[landward];
    const b = points[seaward];
    const midIndex = Math.round((landward + seaward) / 2);
    const mid = points[midIndex];
    const ahead = points[Math.min(points.length - 1, midIndex + 1)];
    const behind = points[Math.max(0, midIndex - 1)];
    const angle = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
    this.mapRenderer.drawBridge(graphics, mid, angle, Math.hypot(b.x - a.x, b.y - a.y), roadWidth);
  }

  /** Draws dirt roads connecting each land's settlement (village/city/castle/mine) to its neighbors. */
  drawConnections(state: GameState, wx: WorldTransform, wy: WorldTransform, getAnchor: SettlementAnchor): Phaser.GameObjects.Graphics {
    // Roads and bridges must sit above every flat terrain surface (grass, water,
    // paddies and coast), while remaining below standing scenery and settlements.
    const graphics = this.scene.add.graphics().setDepth(0.5);
    const water = this.waterIndex(state, wx, wy);
    const crossings: Array<{ curve: Phaser.Curves.Spline; width: number }> = [];

    for (const land of state.lands) {
      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        // Each pair once, from the lower id: the orientation its meander is seeded on, and the
        // one `drawnRoadBetween` reproduces for everything that walks it — carts, travellers
        // and marching hosts alike.
        if (!neighbor || land.id > neighbor.id) {
          continue;
        }
        const road = drawnRoadBetween(state, land, neighbor, getAnchor, wx, wy);
        if (!road) {
          continue;
        }
        const { curve } = road;
        this.drawRoad(graphics, curve, this.roadWidth(land), this.roadWidth(neighbor));
        crossings.push({ curve, width: Math.max(this.roadWidth(land), this.roadWidth(neighbor)) });
      }
    }

    // Every bridge after every road, so a crossing is never buried under the next road drawn.
    for (const crossing of crossings) {
      this.drawCrossings(graphics, crossing.curve, water, crossing.width);
    }

    return graphics;
  }

  /**
   * Animated ox-carts shuttling along roads between farms and the cities they're connected
   * to. Existing carts are left running (and their tweens untouched) so this can be called
   * again on every refresh to pick up newly-revealed settlements as fog of war lifts.
   */
  drawCarts(
    state: GameState,
    wx: WorldTransform,
    wy: WorldTransform,
    getAnchor: SettlementAnchor,
    getCityCenter: (land: Land) => { x: number; y: number } | undefined,
  ): Phaser.GameObjects.GameObject[] {
    const activeKeys = new Set<string>();
    // `none` and `few` put no carts on the roads at all. The loop still runs so an existing cart
    // is retired when the setting drops — the sweep at the bottom keys off `activeKeys`.
    const wanted = trafficPerRoad().carts;

    for (const land of state.lands) {
      if (wanted < 1 || land.type !== 'farm' || !land.isVisible || !this.hasSettlement(land)) {
        continue;
      }

      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor || !neighbor.isVisible || !this.hasSettlement(neighbor) || !getCityCenter(neighbor)) {
          continue;
        }

        const key = `${land.id}|${neighbor.id}`;
        activeKeys.add(key);
        if (this.cartMarkers.has(key)) {
          continue;
        }

        // The road as it is drawn, not one of the cart's own. Keyed `farm|city`, this rebuilt the
        // spline with its ends swapped whenever the farm's id sorted after the city's, and a
        // swapped seed bows the meander to the other side — so half the carts rode the verge.
        const road = drawnRoadBetween(state, land, neighbor, getAnchor, wx, wy);
        if (!road) {
          continue;
        }
        const { curve } = road;
        this.recordSpan(key, curve);

        const cart = this.mapItems.createCart();
        cart.setDepth(69);

        const seed = hashString(`cart|${key}`);
        this.cartMarkers.set(key, this.walk(cart, curve, seed, this.roadDuration(curve, seed, 0.95), 'cart'));
      }
    }

    for (const [key, cart] of this.cartMarkers) {
      if (!activeKeys.has(key)) {
        this.retire(cart);
        this.cartMarkers.delete(key);
        this.forgetSpan(key, `cart::${key}`);
      }
    }

    return this.movers().map((mover) => mover.object);
  }

  /**
   * Slow-walking ink travelers wandering every road between connected settlements, for a
   * livelier map. Existing travelers are left running so this can be called again on every
   * refresh to pick up newly-revealed settlements as fog of war lifts.
   */
  drawTravelers(state: GameState, wx: WorldTransform, wy: WorldTransform, getAnchor: SettlementAnchor): Phaser.GameObjects.GameObject[] {
    const activeKeys = new Set<string>();

    for (const land of state.lands) {
      for (const neighborId of land.neighbors) {
        const neighbor = state.lands.find((candidate) => candidate.id === neighborId);
        if (!neighbor || land.id > neighbor.id || !land.isVisible || !neighbor.isVisible || !this.hasSettlement(land) || !this.hasSettlement(neighbor)) {
          continue;
        }

        const key = `${land.id}|${neighbor.id}`;
        activeKeys.add(key);
        if (this.travelerMarkers.has(key)) {
          continue;
        }

        const road = drawnRoadBetween(state, land, neighbor, getAnchor, wx, wy);
        if (!road) {
          continue;
        }
        const { curve } = road;
        this.recordSpan(key, curve);
        const travelers: TrafficMover[] = [];
        const appearanceSeed = hashString(`traveler-look|${state.mapSettings.seed}|${key}`);

        for (let index = 0; index < trafficPerRoad().travellers; index += 1) {
          const traveler = this.mapItems.createTraveler(appearanceSeed, index);
          traveler.setDepth(69);
          const seed = hashString(`traveler|${key}|${index}`);
          travelers.push(this.walk(traveler, curve, seed, this.roadDuration(curve, seed, 1.25), 'person'));
        }

        this.travelerMarkers.set(key, travelers);
      }
    }

    for (const [key, travelers] of this.travelerMarkers) {
      if (!activeKeys.has(key)) {
        travelers.forEach((traveler, index) => {
          this.retire(traveler);
          this.culled.delete(`walk::${key}::${index}`);
        });
        this.travelerMarkers.delete(key);
        this.forgetSpan(key);
      }
    }

    return [...this.travelerMarkers.values()].flat().map((mover) => mover.object);
  }

  /** Roads are wider where they meet a bigger settlement: castles widest, then cities/temples, then villages/mines. */
  private roadWidth(land: Land): number {
    if (land.type === 'castle' || land.type === 'enemyCastle') {
      return 7 + land.buildings.length * 0.45;
    }
    if (land.type === 'market' || land.type === 'temple') {
      return 5 + land.buildings.length * 0.35;
    }
    return 3 + land.buildings.length * 0.25;
  }

  private hasSettlement(land: Land): boolean {
    return land.hasVillage;
  }

  /**
   * Draws a dirt-road-styled curve as many short segments so its width can taper between
   * the two settlements it connects (wider at a castle, narrower at a village/mine), with
   * an earthy bed and a slightly lighter, narrower worn track on top.
   */
  private drawRoad(graphics: Phaser.GameObjects.Graphics, curve: Phaser.Curves.Spline, widthFrom: number, widthTo: number): void {
    this.mapRenderer.drawRoad(graphics, curve.getSpacedPoints(32), widthFrom, widthTo);
  }
}
