/**
 * The map breathing: kitchen smoke over the villages, mist banks carried on the wind, butterflies
 * over the forest and meadows, and smoke over a live fight. Desktop layout only
 * (`mapLifeLevel`), off / calm / full in Settings.
 *
 * ## Why
 *
 * Measured on a mid-run Ascent map (desktop, 2026-09-15): between repaints **0.04-0.06% of the
 * screen changed per second**. Terrain, trees, paddies, water and houses are one baked texture —
 * which is what made the map affordable — so the only thing alive in a still frame was a handful of
 * walkers and three skeins of egrets. Every effect here is ambient motion laid *over* the bake, so
 * the bake keeps paying for itself.
 *
 * ## Shape
 *
 * One Phaser particle emitter per effect, each on one small baked white texture and tinted, emitting
 * only at points inside the camera's view. Particles are batched quads — the opposite of the live
 * `Graphics` replay that is this game's measured cost floor — and every emitter has a hard cap. The
 * butterflies are a few plain images moved by hand.
 *
 *  - **khói bếp** — white wisps climb very slowly from chimney points over each settlement's own
 *    house footprint (one for a hamlet, three for a citadel) and hang there, leaning a little with a
 *    slow shared wind. More in winter.
 *  - **the wind** — shown only by what it carries: soft white mist banks drifting across the map
 *    along the wind, a few at a time, breathing wider and fading in and out over twenty-odd seconds.
 *    The shape is the menu's cloud bank (`drawMountainMist`), feathered and without its inked edge.
 *    White on the điệp sheet is nearly the sheet: at the menu's own opacity a bank brightened the
 *    paper by 3-4 luminance and could not be seen; at double density with hard edges it became a
 *    crisp white streak. Feathered lobes give a visible band with no edge (`_mist-visibility.mjs`).
 *  - **a live fight** — the smoke of a burning settlement: a full soot column pouring up off the
 *    roofs, dark where it leaves them and paling to grey as it climbs and leans with the wind, with a
 *    few embers lifting through it. No flames are drawn — drawn flame tongues were built twice and read
 *    as orange blobs at every size; the smoke's colour is what says fire.
 *  - **butterflies** — small gold or brown woodblock wings over forest and meadow,
 *    each round a slowly wandering centre that the wind leans. None in winter.
 *
 * **Never draw a person here.** A poled sampan with its boatman was built and rejected on sight: the
 * figures on this map are authored art, and a figure drawn by script does not belong to it. Wind
 * drawn as lines was rejected twice — brush-stroke gusts across the map, then strokes bowing the rice.
 * Wind here is the game's existing mist motif moving, and nothing else: no bodies, no lines drawn
 * through the air.
 *
 * Nothing here darkens the ground or grains it (both rejected); smoke is a column, not a wash.
 * Stops with the rest of the world when the map is halted or hidden (`MapScene.syncWorldMotion`).
 */
import Phaser from 'phaser';
import { renderScaleNow } from '../../game/graphicsQuality';
import { mapLifeLevel, reducedMotion, setLifeSettings, type MapLifeLevel } from '../../game/lifeSettings';
import { PIGMENT } from '../../ui/ink/palette';
import { LIVING_PX_PER_M } from '../../ui/ink/proportion';
import { BUTTERFLY_TEXTURE, BUTTERFLY_FRAME_SIZE, BUTTERFLY_WING_PIXELS, BUTTERFLY_WINGBEAT } from '../../ui/ink/butterflyArt';
import type { Season } from '../../state/types';

/** A settlement as the renderer needs it: where, how big, and where its houses stand (world units). */
export interface LifeSettlement {
  id: string;
  x: number;
  y: number;
  /** The settlement's visual clearance radius. */
  r: number;
  /** 1 hamlet / farmstead / camp, 2 village / market / shrine, 3 citadel. */
  tier: 1 | 2 | 3;
  bounds?: { left: number; right: number; top: number; bottom: number };
}

/** What the map knows and this layer asks for. Each is called on a slow cadence, never per frame. */
export interface MapLifeSource {
  settlements(): LifeSettlement[];
  /** Centres of visible forest and meadow hexes, where the butterflies keep. */
  forestCells(): Array<{ x: number; y: number }>;
  /** A hex's radius in world units: how far a swarm may wander from home. */
  cellRadius(): number;
  /** Where a fight or a siege is going on, in world units, with the settlement's radius. */
  fights(): Array<{ x: number; y: number; r: number }>;
  season(): Season;
}

/**
 * Smoke, mist and butterflies are in the air, so they draw over everything on the map: travellers
 * and carts (69), hosts (70-71), badges (72), labels (73), flags (76). Smoke at 4.5 passed *under* a
 * farmer walking below a village and read as the farmer walking through the chimney. They stay under
 * the foreign haze (77.4) and the fog (77.5), so ground the player cannot see keeps them veiled.
 */
const SMOKE_DEPTH = 77.3;
const FIGHT_DEPTH = 77.31;
/**
 * Mist is over the foreign haze (77.4) as well: the haze covers most of an early map, and a pale bank
 * under it was a pale bank under a pale veil. Still under the birds (77.45) and the fog (77.5).
 */
const MIST_DEPTH = 77.42;
/** Mist banks in view at once, per level, for a view the size of a desktop map at play zoom. */
const MIST_IN_VIEW = { calm: 2, full: 3 };
/** In the air with the smoke: over the walkers, hosts and labels, under the haze and the fog. */
const BUTTERFLY_DEPTH = 77.33;
/** Enlarge the insect silhouette for readability at normal map zoom. */
const BUTTERFLY_VISIBILITY_SCALE = 2.4;
/**
 * Two butterflies, in the print's own pigments only, with the colours real ones in a Vietnamese field
 * wear and a dark edge so each can be found (`_fleck-contrast.mjs`: WCAG ratio against the real
 * paper, realm, forest floor and mountain grounds of a map frame):
 *
 *  - shell cream and pale sophora scored 1.04-1.46 on every ground — the paper's own colour, so a
 *    swarm could not be found at all;
 *  - chàm indigo scored well (4.25-5.64) but was rejected on sight: blue butterflies read as unreal;
 *  - **gold with a soot-brown edge** — the common tiger's orange and black. Gold alone scores only
 *    1.77-2.34; the edge (4.83+) is what lets it be found, the gold is what says butterfly;
 *  - **iron-brown with a soot edge** — the common browns. Brown scores 3.8-5.04 by itself.
 * Never sỏi son: that red is the player's alone.
 */
const BUTTERFLY_COLOURS: Array<{ name: string; wing: number; rim: number }> = [
  { name: 'tiger', wing: PIGMENT.hoe, rim: PIGMENT.mucSoft },
  { name: 'brown', wing: PIGMENT.nau, rim: PIGMENT.muc },
];
const SWARMS_PER_SEASON: Record<Season, number> = { Spring: 1, Summer: 1, Autumn: 0.6, Winter: 0 };

const SLOW_REFRESH_MS = 2000;
/** World units past the view edge an effect may start, so a pan does not reveal an empty rim. */
const VIEW_MARGIN = 80;

const SMOKE_PER_SEASON: Record<Season, number> = { Spring: 1, Summer: 0.75, Autumn: 1.1, Winter: 1.4 };

interface Chimney {
  x: number;
  y: number;
  nextAt: number;
}

type LifeParticle = Phaser.GameObjects.Particles.Particle & { size?: number };

interface Swarm {
  home: { x: number; y: number };
  x: number;
  y: number;
  heading: number;
  dots: Array<{
    image: Phaser.GameObjects.Image; radius: number; phase: number; speed: number;
    flutter: number; beat: number; artRow: number; wingSpan: number;
  }>;
  bornAt: number;
  lifeMs: number;
}

/** 0 at both ends of a life, 1 in the middle: a quick rise by `rise`, a slow fall from `fall`. */
function envelope(t: number, rise: number, fall: number): number {
  const up = Math.min(1, t / rise);
  const down = t < fall ? 1 : Math.max(0, 1 - (t - fall) / (1 - fall));
  return up * up * (3 - 2 * up) * down;
}

function hash01(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let index = 0; index < text.length; index += 1) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export class MapLifeRenderer {
  private raster = 2;
  private smoke?: Phaser.GameObjects.Particles.ParticleEmitter;
  private fightSmoke?: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter;
  private mist: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private nextMistAt = 0;
  private swarms: Swarm[] = [];
  private nextSwarmAt = 0;
  /** Active elapsed time: pause freezes wingbeat, drift, spawn delay and lifetime. */
  private butterflyTime = 0;
  private fleckKeys: string[] = [];
  private forestCells: Array<{ x: number; y: number }> = [];

  /** The view in world units, rebuilt each frame. */
  private readonly view = new Phaser.Geom.Rectangle();
  private settlements: LifeSettlement[] = [];
  private fights: Array<{ x: number; y: number; r: number }> = [];
  private chimneys = new Map<string, Chimney[]>();
  private nextSlowRefresh = 0;
  private nextFightAt = 0;
  private paused = false;
  private level: MapLifeLevel = 'off';
  private built = false;

  constructor(private readonly scene: Phaser.Scene, private readonly source: MapLifeSource) {
    // Harness hook: switch the level live and read what is alive.
    (window as unknown as { __mapLife?: unknown }).__mapLife = {
      set: (level: MapLifeLevel) => setLifeSettings({ mapLife: level }),
      stats: () => this.stats(),
    };
  }

  /** Alive particles per effect, swarms, and the sources seen — for harnesses. */
  stats(): Record<string, number | string> {
    const alive = (emitter?: Phaser.GameObjects.Particles.ParticleEmitter) => emitter?.getAliveParticleCount() ?? 0;
    return {
      level: this.level,
      smoke: alive(this.smoke),
      fightSmoke: alive(this.fightSmoke),
      sparks: alive(this.sparks),
      swarms: this.swarms.length,
      butterflies: this.swarms.reduce((sum, swarm) => sum + swarm.dots.length, 0),
      butterflyArt: this.scene.textures.exists(BUTTERFLY_TEXTURE) ? BUTTERFLY_TEXTURE : 'procedural',
      mist: this.mist.reduce((sum, emitter) => sum + emitter.getAliveParticleCount(), 0),
      forestCells: this.forestCells.length,
      settlements: this.settlements.length,
      fights: this.fights.length,
    };
  }

  /** The shared wind: mostly eastward and a little down the sheet, turning and gusting slowly. */
  private wind(time: number): { x: number; y: number; strength: number } {
    const angle = 0.22 + 0.3 * Math.sin(time * 0.00011) + 0.12 * Math.sin(time * 0.00037 + 1.3);
    const strength = 0.75 + 0.25 * Math.sin(time * 0.00023 + 0.6);
    return { x: Math.cos(angle), y: Math.sin(angle), strength };
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    // Swarms are images moved by hand in `update`, which already stops while paused.
    for (const emitter of this.emitters()) {
      if (paused) emitter.pause();
      else emitter.resume();
    }
  }

  update(time: number, delta: number): void {
    const level = mapLifeLevel();
    if (level !== this.level) this.applyLevel(level);
    if (level === 'off' || this.paused) return;
    if (!this.built) this.build();
    // Reduced motion keeps the map breathing, only more quietly.
    const rate = (level === 'calm' ? 0.5 : 1) * (reducedMotion() ? 0.5 : 1);
    const dt = Math.min(delta, 100);

    if (time >= this.nextSlowRefresh) this.refreshSources(time);
    // From scroll and zoom, not `camera.worldView`: the map camera's origin is (0,0), and Phaser's
    // worldView is computed about the centre — at zoom it pointed a whole view away from the screen,
    // so every effect was emitting where nobody was looking (see `MapScene.syncViewCulling`).
    const camera = this.scene.cameras.main;
    const view = this.view.setTo(camera.scrollX, camera.scrollY, camera.width / camera.zoom, camera.height / camera.zoom);

    const wind = this.wind(time);
    this.emitSmoke(time, view, wind, rate);
    this.emitFights(time, view, rate);
    this.driftMist(time, view, wind, level);
    const butterflyDt = dt * (reducedMotion() ? 0.5 : 1);
    this.butterflyTime += butterflyDt;
    this.flyButterflies(this.butterflyTime, butterflyDt, view, wind, level);
  }

  destroy(): void {
    for (const emitter of this.emitters()) emitter.destroy();
    this.clearSwarms();
    this.smoke = this.fightSmoke = this.sparks = undefined;
    this.mist = [];
    this.built = false;
  }

  private emitters(): Phaser.GameObjects.Particles.ParticleEmitter[] {
    return [this.smoke, this.fightSmoke, this.sparks, ...this.mist]
      .filter((emitter): emitter is Phaser.GameObjects.Particles.ParticleEmitter => Boolean(emitter));
  }

  private applyLevel(level: MapLifeLevel): void {
    this.level = level;
    const on = level !== 'off';
    for (const emitter of this.emitters()) {
      emitter.setVisible(on);
      if (!on) emitter.killAll();
    }
    if (!on) this.clearSwarms();
  }

  // ── Textures ──────────────────────────────────────────────────────────────

  /** Draws a white texture at `raster` times its design size, once per render scale. */
  private bake(name: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics, s: number) => void): string {
    const key = `life:${name}@${this.raster}`;
    if (this.scene.textures.exists(key)) return key;
    const g = this.scene.make.graphics({}, false);
    draw(g, this.raster);
    g.generateTexture(key, Math.ceil(width * this.raster), Math.ceil(height * this.raster));
    g.destroy();
    return key;
  }

  private build(): void {
    this.raster = Math.max(2, Math.ceil(renderScaleNow()));
    const inv = 1 / this.raster;

    // A wisp: a soft core and two offset lobes, so it never reads as a clean disc.
    const smokeKey = this.bake('smoke', 32, 32, (g, s) => {
      const lobes: Array<[number, number, number]> = [[16, 17, 12], [11, 18, 8], [21, 14, 8]];
      for (const [cx, cy, radius] of lobes) {
        for (let ring = 0; ring < 6; ring += 1) {
          g.fillStyle(0xffffff, 0.16);
          g.fillCircle(cx * s, cy * s, radius * s * (1 - ring / 6));
        }
      }
    });
    // A glint: a thin four-pointed star with a bright heart.
    const glintKey = this.bake('glint', 12, 12, (g, s) => {
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(6 * s, 0, 6.8 * s, 6 * s, 5.2 * s, 6 * s);
      g.fillTriangle(6 * s, 12 * s, 6.8 * s, 6 * s, 5.2 * s, 6 * s);
      g.fillTriangle(1 * s, 6 * s, 6 * s, 5.4 * s, 6 * s, 6.6 * s);
      g.fillTriangle(11 * s, 6 * s, 6 * s, 5.4 * s, 6 * s, 6.6 * s);
      g.fillCircle(6 * s, 6 * s, 1.3 * s);
    });
    // Preserve the earlier flecks only as a missing-image / procedural-art fallback.
    this.fleckKeys = this.scene.textures.exists(BUTTERFLY_TEXTURE) ? [] : BUTTERFLY_COLOURS.map(({ name, wing, rim }) => this.bake(`fleck-${name}`, 5, 5, (g, s) => {
      g.fillStyle(rim, 1);
      g.fillCircle(2.5 * s, 2.5 * s, 2.4 * s);
      g.fillStyle(wing, 1);
      g.fillCircle(2.5 * s, 2.5 * s, 1.6 * s);
    }));

    type AnyParticle = Phaser.GameObjects.Particles.Particle | undefined;
    // Each particle draws its own size once and keeps it, so a wisp grows from its own start.
    const scaleOp = (min: number, max: number, grow: (t: number) => number) => ({
      onEmit: (particle: AnyParticle) => {
        const size = (min + Math.random() * (max - min)) * inv;
        if (particle) (particle as LifeParticle).size = size;
        return size * grow(0);
      },
      onUpdate: (particle: AnyParticle, _key: string, t: number) => ((particle as LifeParticle | undefined)?.size ?? inv) * grow(t),
    });
    const alphaOp = (peak: number, rise: number, fall: number) => ({
      onEmit: () => 0,
      onUpdate: (_particle: AnyParticle, _key: string, t: number) => peak * envelope(t, rise, fall),
    });

    this.smoke = this.scene.add.particles(0, 0, smokeKey, {
      emitting: false,
      // Very long and very slow: a kitchen fire's smoke hangs over the roofs and thins where it is.
      lifespan: { min: 11000, max: 15000 },
      speedX: 0,
      speedY: 0,
      // Starts as a thread at the roof and widens as it climbs, so it visibly comes out of the house
      // instead of appearing as a finished puff in mid-air.
      // Widens only a little as it climbs: a thin column, never a puff pooling over the roofs.
      scale: scaleOp(0.2, 0.28, (t) => 0.25 + 1.1 * Math.sqrt(t)),
      // White: the smoke of a kitchen fire seen from far off, the sheet's own brightest tone.
      alpha: alphaOp(0.6, 0.06, 0.45),
      tint: 0xffffff,
      maxAliveParticles: 700,
    }).setDepth(SMOKE_DEPTH);

    // A burning settlement's smoke: soot where it leaves the fire, thinning to a warm grey as it
    // climbs. Rises faster than kitchen smoke — a fire drives it — and grows wide above the roofs.
    this.fightSmoke = this.scene.add.particles(0, 0, smokeKey, {
      emitting: false,
      lifespan: { min: 5200, max: 7200 },
      speedX: 0,
      speedY: 0,
      scale: scaleOp(0.34, 0.5, (t) => 0.45 + 2.1 * Math.sqrt(t)),
      // Fades in over its first fifth of rise, so the roofs it leaves stay visible under the column.
      alpha: alphaOp(0.64, 0.22, 0.5),
      color: [PIGMENT.muc, PIGMENT.mucSoft, PIGMENT.mucFaint],
      colorEase: 'quad.out',
      maxAliveParticles: 900,
    }).setDepth(FIGHT_DEPTH);

    this.sparks = this.scene.add.particles(0, 0, glintKey, {
      emitting: false,
      lifespan: { min: 900, max: 1600 },
      speedX: { min: -8, max: 8 },
      speedY: { min: -34, max: -18 },
      scale: scaleOp(0.25, 0.45, (t) => 1 - 0.7 * t),
      alpha: alphaOp(0.95, 0.1, 0.35),
      color: [PIGMENT.hoePale, PIGMENT.hoe],
      maxAliveParticles: 300,
    }).setDepth(FIGHT_DEPTH + 0.01);


    // Mist banks: the three overlapping lobes of the menu's cloud bank (`drawMountainMist`), in the
    // same proportions, laid in white and FEATHERED — each lobe is a stack of shrinking ellipses, so it
    // is densest in the middle and fades to nothing at its rim. The menu's hard-edged ellipses only
    // read as soft in indigo at a low opacity; in white strong enough to see on the điệp sheet they
    // read as a crisp white streak, which is the drawn wind this layer must never be. No contour.
    const mistShapes: Array<[number, number]> = [[240, 38], [180, 30]];
    const lobes = [
      { x: -0.13, y: 0, w: 0.72, h: 0.62, a: 0.3 },
      { x: 0.17, y: 0.03, w: 0.7, h: 0.46, a: 0.22 },
      { x: 0.03, y: 0.18, w: 0.84, h: 0.2, a: 0.2 },
    ];
    const rings = 9;
    /** Total opacity a lobe reaches at its heart; its rim reaches a ninth of it. */
    const body = 4.2;
    this.mist = mistShapes.map(([span, band], index) => {
      const width = span * 1.12;
      const height = band * 1.15;
      const key = this.bake(`mist${index}`, width, height, (g, raster) => {
        const cx = (width / 2) * raster;
        const cy = (height / 2) * raster;
        for (const lobe of lobes) {
          for (let ring = 0; ring < rings; ring += 1) {
            const f = 1 - ring / rings;
            g.fillStyle(0xffffff, Math.min(1, (lobe.a * body) / rings));
            g.fillEllipse(
              cx + lobe.x * span * raster,
              cy + lobe.y * band * raster,
              lobe.w * span * raster * f,
              lobe.h * band * raster * (0.5 + 0.5 * f),
            );
          }
        }
      });
      return this.scene.add.particles(0, 0, key, {
        emitting: false,
        lifespan: { min: 20000, max: 28000 },
        speedX: 0,
        speedY: 0,
        // The bank breathes: a little wider through the middle of its life, never taller.
        scaleX: scaleOp(0.9, 1.15, (t) => 0.9 + 0.2 * Math.sin(Math.PI * t)),
        scaleY: scaleOp(0.9, 1.1, () => 1),
        // Soft: a band of pale air, never a shape with an edge.
        alpha: alphaOp(0.75, 0.25, 0.65),
        maxAliveParticles: 4,
      }).setDepth(MIST_DEPTH);
    });

    this.built = true;
    this.applyLevel(this.level);
    if (this.paused) this.setPaused(true);
  }

  // ── Sources ───────────────────────────────────────────────────────────────

  private refreshSources(time: number): void {
    this.nextSlowRefresh = time + SLOW_REFRESH_MS;
    this.settlements = this.source.settlements();
    this.forestCells = this.source.forestCells();
    this.fights = this.source.fights();
    const live = new Set(this.settlements.map((settlement) => settlement.id));
    for (const id of [...this.chimneys.keys()]) if (!live.has(id)) this.chimneys.delete(id);
  }

  private inView(view: Phaser.Geom.Rectangle, x: number, y: number, margin = VIEW_MARGIN): boolean {
    return x > view.x - margin && x < view.right + margin && y > view.y - margin && y < view.bottom + margin;
  }

  // ── Khói bếp ──────────────────────────────────────────────────────────────

  /** Chimney points over a settlement's own roofs, fixed per settlement so the smoke has a home. */
  private chimneysFor(settlement: LifeSettlement, time: number): Chimney[] {
    const cached = this.chimneys.get(settlement.id);
    if (cached) return cached;
    const count = settlement.tier;
    const points: Chimney[] = [];
    for (let index = 0; index < count; index += 1) {
      const u = hash01(settlement.id, index * 7 + 1);
      const v = hash01(settlement.id, index * 13 + 5);
      let x: number;
      let y: number;
      if (settlement.bounds) {
        // On the roofs, not in the air beside them. The structure box also spans the satellite
        // buildings, a wall and the open ground between, so points spread across the whole box
        // started smoke over empty paper and beside the hero badge. Kept to the middle of the
        // compound, just under its highest roofline, where the main hall stands.
        // The houses' own middle, not the seat point: a village's seat can stand a house-width or
        // more to the side of where its houses are drawn, and smoke there rose from bare ground.
        const b = settlement.bounds;
        const w = b.right - b.left;
        x = (b.left + b.right) / 2 + (u - 0.5) * Math.min(w * 0.3, 22);
        y = b.top + (0.18 + 0.12 * v) * (b.bottom - b.top);
      } else {
        x = settlement.x + (u - 0.5) * settlement.r * 0.8;
        y = settlement.y - settlement.r * (0.25 + 0.2 * v);
      }
      points.push({ x, y, nextAt: time + hash01(settlement.id, index * 31) * 900 });
    }
    this.chimneys.set(settlement.id, points);
    return points;
  }

  private emitSmoke(time: number, view: Phaser.Geom.Rectangle, wind: { x: number; y: number; strength: number }, rate: number): void {
    if (!this.smoke) return;
    const seasonal = SMOKE_PER_SEASON[this.source.season()] ?? 1;
    // Fewer, longer-lived puffs: the column stays as full while each wisp barely climbs.
    const interval = 1600 / (rate * seasonal);
    for (const settlement of this.settlements) {
      if (!this.inView(view, settlement.x, settlement.y, settlement.r + VIEW_MARGIN)) continue;
      // A settlement that is burning gives off soot, not the white of its kitchens.
      if (this.fights.some((fight) => Math.hypot(fight.x - settlement.x, fight.y - settlement.y) < fight.r)) continue;
      for (const chimney of this.chimneysFor(settlement, time)) {
        if (time < chimney.nextAt) continue;
        chimney.nextAt = time + interval * (0.7 + Math.random() * 0.6);
        const particle = this.smoke.emitParticleAt(chimney.x + (Math.random() - 0.5) * 3, chimney.y, 1) as unknown as LifeParticle | undefined;
        if (!particle) continue;
        // Up, and leaning with the wind; the wind also bends a wisp further as it climbs.
        particle.velocityX = wind.x * wind.strength * (0.5 + Math.random() * 0.5);
        // Slow, but rising faster than it widens, so the wisps string up into a column instead of
        // piling into one cloud above the chimney.
        particle.velocityY = -(2.4 + Math.random() * 1);
        particle.accelerationX = wind.x * wind.strength * 0.12;
      }
    }
  }

  // ── The wind, carrying mist ───────────────────────────────────────────────

  private driftMist(time: number, view: Phaser.Geom.Rectangle, wind: { x: number; y: number; strength: number }, level: MapLifeLevel): void {
    if (this.mist.length === 0 || level === 'off') return;
    // A desktop map at play zoom shows about 1200 x 650 world units; a closer view holds fewer banks.
    const room = Math.max(0.5, Math.min(1.5, (view.width * view.height) / (1200 * 650)));
    const want = Math.round(MIST_IN_VIEW[level] * room);
    const alive = this.mist.reduce((sum, emitter) => sum + emitter.getAliveParticleCount(), 0);
    if (alive >= want || time < this.nextMistAt) return;
    this.nextMistAt = time + 2500 + Math.random() * 3500;
    const emitter = this.mist[Math.floor(Math.random() * this.mist.length)];
    // Anywhere across the view, a little upwind: each bank fades in where it is, then travels.
    const x = view.x + Math.random() * view.width - wind.x * view.width * 0.2;
    const y = view.y + view.height * (0.1 + Math.random() * 0.8);
    const particle = emitter.emitParticleAt(x, y, 1) as unknown as LifeParticle | undefined;
    if (!particle) return;
    const speed = (6 + Math.random() * 4) * wind.strength;
    particle.velocityX = wind.x * speed;
    particle.velocityY = wind.y * speed * 0.35;
  }

  // ── Butterflies ───────────────────────────────────────────────────────────

  private clearSwarms(): void {
    for (const swarm of this.swarms) for (const dot of swarm.dots) dot.image.destroy();
    this.swarms = [];
  }

  private flyButterflies(time: number, dt: number, view: Phaser.Geom.Rectangle, wind: { x: number; y: number; strength: number }, level: MapLifeLevel): void {
    const seasonal = SWARMS_PER_SEASON[this.source.season()] ?? 1;
    const most = Math.round((level === 'calm' ? 4 : 9) * seasonal);
    // Winter and a lower life level apply to existing swarms as well as new ones.
    while (this.swarms.length > most) {
      for (const dot of this.swarms.pop()!.dots) dot.image.destroy();
    }
    if (most === 0) return;
    const seconds = dt / 1000;
    for (const swarm of [...this.swarms]) {
      const age = time - swarm.bornAt;
      // The centre wanders: a heading that turns smoothly, and a pull home past a cell's width.
      swarm.heading += (Math.sin(time * 0.0009 + swarm.bornAt) * 1.4 + (Math.random() - 0.5) * 0.6) * seconds;
      const away = Math.hypot(swarm.x - swarm.home.x, swarm.y - swarm.home.y);
      const reach = this.source.cellRadius() * 1.1;
      if (away > reach) {
        const homeward = Math.atan2(swarm.home.y - swarm.y, swarm.home.x - swarm.x);
        swarm.heading += Phaser.Math.Angle.Wrap(homeward - swarm.heading) * Math.min(1, seconds * 1.5);
      }
      // The wind leans the swarm a little; the pull home keeps it over its own ground.
      swarm.x += (Math.cos(swarm.heading) * 5 + wind.x * wind.strength * 2) * seconds;
      swarm.y += (Math.sin(swarm.heading) * 5 + wind.y * wind.strength * 1) * seconds;
      const fade = Math.max(0, Math.min(1, age / 1500, (swarm.lifeMs - age) / 1500));
      for (const dot of swarm.dots) {
        dot.phase += dot.speed * seconds;
        dot.beat = (dot.beat + seconds * dot.flutter) % 1;
        const x = swarm.x + Math.cos(dot.phase) * dot.radius;
        const y = swarm.y + Math.sin(dot.phase * 1.3) * dot.radius * 0.6;
        const facing = Math.atan2(y - dot.image.y, x - dot.image.x) + Math.PI / 2;
        dot.image.rotation += Phaser.Math.Angle.Wrap(facing - dot.image.rotation) * Math.min(1, seconds * 5);
        dot.image.setPosition(x, y).setAlpha(fade * 0.95);
        if (dot.artRow >= 0) {
          dot.image.setFrame(dot.artRow * 3 + BUTTERFLY_WINGBEAT[Math.floor(dot.beat * 4)]);
        }
      }
      if (age >= swarm.lifeMs) {
        for (const dot of swarm.dots) dot.image.destroy();
        this.swarms.splice(this.swarms.indexOf(swarm), 1);
      }
    }
    if (this.swarms.length >= most || time < this.nextSwarmAt || this.forestCells.length === 0) return;
    const inView = this.forestCells.filter((cell) => this.inView(view, cell.x, cell.y, -10));
    if (inView.length === 0) return;
    const home = inView[Math.floor(Math.random() * inView.length)];
    const authored = this.scene.textures.exists(BUTTERFLY_TEXTURE);
    const dots: Swarm['dots'] = [];
    const count = 2 + Math.floor(Math.random() * 3);
    for (let index = 0; index < count; index += 1) {
      const artRow = authored ? Math.floor(Math.random() * 2) : -1;
      // Keep the natural size variation, with a 2.4× visibility boost: 2.07–2.88
      // world units across. Still independent of zoom and render resolution.
      const wingSpan = (0.18 + Math.random() * 0.07) * LIVING_PX_PER_M * BUTTERFLY_VISIBILITY_SCALE;
      const size = wingSpan * (authored ? BUTTERFLY_FRAME_SIZE / BUTTERFLY_WING_PIXELS : 1);
      const texture = authored ? BUTTERFLY_TEXTURE : this.fleckKeys[Math.floor(Math.random() * this.fleckKeys.length)];
      const image = this.scene.add.image(home.x, home.y, texture, authored ? artRow * 3 : undefined)
        .setDisplaySize(size, size)
        .setData('mapButterfly', true)
        .setDepth(BUTTERFLY_DEPTH)
        .setAlpha(0);
      dots.push({ image, radius: 2 + Math.random() * 4, phase: Math.random() * Math.PI * 2,
        speed: 0.9 + Math.random() * 1.2, flutter: 4 + Math.random() * 2,
        beat: Math.random(), artRow, wingSpan });
    }
    this.swarms.push({ home, x: home.x, y: home.y, heading: Math.random() * Math.PI * 2, dots, bornAt: time, lifeMs: 18000 + Math.random() * 20000 });
    this.nextSwarmAt = time + 900 + Math.random() * 1200;
  }

  // ── A live fight ──────────────────────────────────────────────────────────

  private emitFights(time: number, view: Phaser.Geom.Rectangle, rate: number): void {
    if (!this.fightSmoke || !this.sparks || this.fights.length === 0 || time < this.nextFightAt) return;
    this.nextFightAt = time + 110 / rate;
    const wind = this.wind(time);
    for (const fight of this.fights) {
      if (!this.inView(view, fight.x, fight.y, fight.r + VIEW_MARGIN)) continue;
      // Three burning spots across the compound, so the column rises from roofs rather than one point.
      const fire = Math.floor(Math.random() * 3);
      const x = fight.x + (fire - 1) * fight.r * 0.22 + (Math.random() - 0.5) * fight.r * 0.1;
      const y = fight.y - fight.r * 0.14 + (Math.random() - 0.5) * fight.r * 0.08;
      // Two puffs a beat, a little apart, so the column is thick and never gaps.
      for (let n = 0; n < 2; n += 1) {
        const puff = this.fightSmoke.emitParticleAt(x + (Math.random() - 0.5) * 6, y - 6, 1) as unknown as LifeParticle | undefined;
        if (!puff) continue;
        // Driven up by the heat, faster than a kitchen's smoke, and leaning with the wind as it climbs.
        puff.velocityX = wind.x * wind.strength * (1.5 + Math.random() * 1.5);
        puff.velocityY = -(6 + Math.random() * 3);
        puff.accelerationX = wind.x * wind.strength * 0.5;
      }
      // Embers: a steady trickle, each drifting off on its own line.
      for (let n = 0; n < 2; n += 1) {
        if (Math.random() < 0.35) this.sparks.emitParticleAt(x + (Math.random() - 0.5) * fight.r * 0.25, y - 3, 1);
      }
    }
  }
}
