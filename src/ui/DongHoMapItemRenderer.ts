import Phaser from 'phaser';
import { InkMapItemRenderer } from './InkMapItemRenderer';
import type { ProgressBadgeVariant } from './MapItemRenderer';
import type { LandBuildingType } from '../state/types';
import { UI_FONT } from './fonts';
import { PIGMENT } from './ink/palette';
import { armyAnchor, armyFootprint, armyShape, clashDevice, compositionFor, drawArmy, figure, marchInPlace, marchOf, seal, HOST_STEP_KEY, type HostKit } from './ink/devices';
import { drawFieldPlot } from './ink/settlements';
import { citadel, drawnEra, GroundSpacer, hamlet, village } from './ink/settlements';
import { hatchPoly, inkPath, mulberry32, printedShape, thickPath, washFill, type Pt } from './ink/stroke';
import { areca, bamboo, banyan, buffalo, farmer, groundShadow, hayStack, house, thap, tree } from './ink/props';
import { grazeInSmallArea, livingSprite, setNativeFacing } from './ink/life';
import { bakedBuffalo } from './ink/sprites';
import { GROUND_SCALE } from './ink/proportion';

/**
 * How much room the map gives a formation, against the plate geometry it inherits.
 *
 * 2.72 is not a taste: it is `4.6 / 1.691`, the ratio between the file pitch the map had before the
 * formation work and the one the doc's plate uses. Measured at `GROUND_SCALE`, it takes the pitch
 * from 1.72 px to 4.69 px against a figure 3.23 px wide — men that stand beside each other rather
 * than inside each other.
 *
 * The battle screen passes its own `drawScale` and is left alone; it already has `BATTLE_HOST_SCALE`.
 */
const MAP_HOST_SPREAD = 4.6 / (16 / 9.46);
// A host on the road keeps the same room; `marchColumn` re-spends it — tight across the road and
// open along it — rather than shrinking everything, which is what made a file of sixteen men read
// as five. See `MARCH_ALONG` / `MARCH_ACROSS`.
import { LABEL_KEEP_OUT } from './MapItemRenderer';
import { createPlayerLandFlag } from './playerFlag';
import { stampedArmy } from './ink/figureStamps';
import { placeStamp, stamp, stampsEnabled } from './ink/stamp';
import { conquestArtStamp } from './conquestMapArt';
import { conquestTravelerArtId } from './conquestTravelerStyles';

/**
 * Chains loose segments back into the loops they were cut from.
 *
 * Hex boundary edges arrive unordered; drawn as they come they are only ever a pile of sticks. A
 * loop can be walked, rounded and given a fill, which is what turns a set of cell borders into a
 * wall somebody built.
 */
function chainEdges(edges: Array<[number, number, number, number]>): Pt[][] {
  const key = (x: number, y: number): string => `${Math.round(x * 2)}:${Math.round(y * 2)}`;
  const open = edges.map(([x1, y1, x2, y2]) => [{ x: x1, y: y1 }, { x: x2, y: y2 }] as [Pt, Pt]);
  const used = new Array<boolean>(open.length).fill(false);
  const byPoint = new Map<string, number[]>();
  open.forEach(([a, b], index) => {
    for (const point of [a, b]) {
      const bucket = byPoint.get(key(point.x, point.y));
      if (bucket) {
        bucket.push(index);
      } else {
        byPoint.set(key(point.x, point.y), [index]);
      }
    }
  });

  const loops: Pt[][] = [];
  for (let start = 0; start < open.length; start += 1) {
    if (used[start]) {
      continue;
    }
    used[start] = true;
    const chain: Pt[] = [open[start][0], open[start][1]];
    let grew = true;
    while (grew) {
      grew = false;
      const tail = chain[chain.length - 1];
      for (const index of byPoint.get(key(tail.x, tail.y)) ?? []) {
        if (used[index]) {
          continue;
        }
        const [a, b] = open[index];
        const next = key(a.x, a.y) === key(tail.x, tail.y) ? b : a;
        if (key(next.x, next.y) === key(chain[0].x, chain[0].y)) {
          used[index] = true;
          grew = false;
          break;
        }
        used[index] = true;
        chain.push(next);
        grew = true;
        break;
      }
    }
    if (chain.length >= 3) {
      loops.push(chain);
    }
  }
  return loops;
}

/**
 * One thing standing on a settlement's ground, and the line it stands on.
 *
 * `draw` goes into a shared buffer; `object` is a live game object (an animal that walks). Both
 * carry their ground `y` so `paintByGround` can put them in the order a human eye expects.
 */
interface GroundPart {
  y: number;
  draw?: (g: Phaser.GameObjects.Graphics) => void;
  object?: () => Phaser.GameObjects.GameObject;
}

/** One Chaikin pass: cuts every corner, so a hexagon relaxes toward the bank of earth it stands for. */
function smoothLoop(loop: Pt[]): Pt[] {
  if (loop.length < 3) {
    return loop;
  }
  const out: Pt[] = [];
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % loop.length];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return out;
}

/**
 * Đông Hồ rendering for everything drawn *on* the map: settlements, hosts, seals.
 *
 * Extends the ink renderer rather than reimplementing it, so the parts this art direction has
 * nothing new to say about — carts, travellers, progress badges, building glyphs — keep working
 * unchanged. What is overridden is the handful of things the document argues about:
 *
 *  · **hosts are sized by the number of men in them.** A nine-thousand-man army is visibly a
 *    different object from a two-thousand-man one, with no label to read. This is the single
 *    highest-value change in the whole art direction.
 *  · **settlements are drawn in oblique**, two faces visible, so a roof sits on the land rather
 *    than floating over it.
 *  · **ownership is a stamped seal**, in the only saturated red on the map.
 */
/**
 * How far above the paper scrap the order glyph stands.
 *
 * Its own constant because the glyph is now placed rather than drawn at an offset, and the bob on
 * the hammer is written against it - two copies of -27 would drift the first time either moved.
 */
const GLYPH_Y = -27;

export class DongHoMapItemRenderer extends InkMapItemRenderer {
  /**
   * A host, drawn as the number of men it contains.
   *
   * One mark stands for about fifty-five soldiers and the block is wider than deep, the way a host
   * on the march is. Nobody counts the figures; the eye compares two blocks and gets the ratio
   * right, which is the whole point.
   */
  override createArmyMarker(
    total: number, isPlayer: boolean, _kingdomColor?: number, flagSeed?: number, kit?: HostKit,
    drawScale?: number,
  ): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const graphics = scene.add.graphics();
    // The kingdom colour is deliberately ignored. Painting a rival's host in its saturated banner
    // hue made every enemy garrison the loudest thing on the map — a scarlet swarm beside a seat
    // drawn in ink. Ownership is carried by the standard riding with the host and by the hatch on
    // the ground under it, never by the men. The player's own host takes the fuller black.
    const colour = isPlayer ? PIGMENT.muc : PIGMENT.mucSoft;
    // The same rate as everything else standing on the ground.
    //
    // This used to be 0.6 against a farmer's 0.85, on the reasoning that a soldier in a block is
    // seen from further off than a farmer in the paddy. That is not how a map works — both are on
    // the same sheet, at the same distance — and the result was that a villager out-stood a
    // soldier by half again, with the buffalo beside them larger than either. A host reads as a
    // host because of its ranks and its standard, not because its men are drawn short.
    // The map's one ground scale, unless the caller is the battle screen — see the interface.
    const scale = drawScale ?? GROUND_SCALE;
    // A host is a formation, not a block: a loose screen forward, the shield wall as the main body,
    // the bows behind it and the horse as a wing off the flank. `armyAnchor` puts the lot of it
    // where the single block used to stand, so everything hung off this marker stays registered.
    // Room between the men, which the map lost when the formation took on the plate's geometry.
    //
    // Doc 12 files a soldier 16 units from his neighbour and draws him 42 units tall; at
    // `GROUND_SCALE` that lands as a 1.72 px pitch on a figure 3.23 px wide, so every man sat half
    // inside the next one and a 2,400-strong host was 33 px across. The battle screen was given its
    // room back by raising `BATTLE_HOST_SCALE`; nobody re-checked the map, where a host is drawn a
    // third of that size and there is no such dial.
    //
    // This opens the *gaps* and nothing else: the figures keep the size `proportion.ts` measures
    // for them, so a soldier still stands against a house and a buffalo exactly as before.
    const mapKit = { ...(kit ?? {}), spread: drawScale ? 1 : MAP_HOST_SPREAD };
    /**
     * **The formation goes in here, and leaving it out was visible from across the room.**
     *
     * `drawArmy` derives its own shape internally and passes `kit.shape` when it does, so on the
     * battle screen the men stood in Thế Chông or Thế Nỏ — the line thrown forward, the horse
     * pulled back, the bows banked deep. This call did not pass it, so the ground and the standards
     * were laid out for the *base* arrangement instead: two pale ellipses in open grass with nobody
     * on them, blocks of men standing on nothing, and a banner planted a block clear of the host
     * carrying it.
     *
     * One shape for the whole marker. `armyAnchor` reads it too, so the host is centred on where
     * its men actually are rather than on where they would have stood in no formation at all.
     */
    const shape = armyShape(
      Math.max(1, total), compositionFor(mapKit), scale, kit?.mustered, mapKit.spread ?? 1,
      mapKit.shape, mapKit.markCap,
      // **Hành quân.** A host between provinces closes up and files one block behind another;
      // standing, it keeps the doctrine's own spread arrangement. Same drawing either way — only
      // the geometry the blocks are laid out on changes.
      marchOf(mapKit),
    );
    const at = armyAnchor(shape);

    // The ground each block stands on. One patch per block, because the gaps between them are what
    // makes the deployment readable.
    armyFootprint(graphics, at.x, at.y, shape, scale);
    container.add(graphics);

    // Each rank on its own object so the block has a cadence. A host that never moves is the
    // largest still object on a map where the roads, the herds and the water all move.
    //
    // Stamped by default: one baked image per man instead of ~150 live path segments that
    // Phaser 4 re-triangulates every frame the marker stands. `?nostamp=1` keeps the live-ink
    // path below alive for A/B — the two draw the same men from the same `planArmy` walk.
    if (stampsEnabled()) {
      // This request is explicitly for Conquest gameplay. The same map-item renderer can also be
      // selected by classic/campaign modes, so scene identity—not the art theme—is the boundary.
      // Those legacy scenes keep their existing one-image stamps and rank cadence unchanged.
      const conquestArmyFrames = scene.scene.key === 'ConquestScene'
        || scene.scene.key === 'ConquestUIScene';
      const army = stampedArmy(
        scene, at.x, at.y, Math.max(1, total), Math.round(total) + 17, colour, scale, mapKit,
        conquestArmyFrames,
      );
      container.add(army.container);
      if (army.animation) container.setData('conquestArmyFrameAnimation', army.animation);
      else container.setData(HOST_STEP_KEY, marchInPlace(scene, army.ranks, scale));
    } else {
      const ranks: Phaser.GameObjects.Graphics[] = [];
      drawArmy(
        graphics, at.x, at.y, Math.max(1, total), Math.round(total) + 17, colour, scale,
        mapKit,
        (index) => {
          while (ranks.length <= index) {
            const layer = scene.add.graphics();
            ranks.push(layer);
            container.add(layer);
          }
          return ranks[index];
        },
      );
      container.setData(HOST_STEP_KEY, marchInPlace(scene, ranks, scale));
    }

    // The standard rides with the host and multiplies with it, so size reads twice over.
    //
    // Planted on the men's own ground, derived from the same `shape` and `scale` the shadow uses
    // rather than from a tuned offset. Every term matters:
    //
    //  · `hostSpan` gives where the FEET are. `shape.width/height` is the block's pitch and
    //    overshoots the outermost figure by a full spacing — the mistake the shadow made once and
    //    the flag then made again, independently.
    //  · the anchor is `-height`, so the front rank stands at `-height + spanY`.
    //  · `createPlayerLandFlag` carries its own foot offset — pole base at `+8`, ground ellipse at
    //    `+10` — which nobody had subtracted. That alone put the standard a constant ~9 px in front
    //    of the men it belongs to, at every army size, which is why it read as floating.
    // Down from 0.72 with the men. A standard is carried by somebody, so it wants to read at three
    // or four times a soldier's height, not six — at the old size the banner was the host and the
    // block behind it was texture.
    // Three and a half times a soldier's height, measured on the battle screen where both are
    // large enough to compare. It grows with the men — a bigger host is drawn bigger and its
    // standard has to come with it — but the *ratio* is the thing being fixed, and at 0.5 it came
    // out near five, with a cloth wider than the block it belonged to.
    const FLAG_SCALE = 0.37 * (scale / GROUND_SCALE);
    const FLAG_FOOT = 10 * FLAG_SCALE;
    // Wider than the cloth (25 * FLAG_SCALE), or three standards stack into one smear.
    const FLAG_STEP = 14 * (scale / GROUND_SCALE);
    const frontRankY = at.y + shape.top + shape.height;
    const standards = Math.max(1, Math.min(3, Math.round(total / 4000)));
    // The realm's own standard, the one its provinces fly — not a style rolled from the headcount,
    // which changed as the host bled and let two realms' hosts share a design. Every standard a
    // large host carries is the same standard: several of one banner reads as one realm.
    const seed = flagSeed ?? Math.round(total);
    /**
     * **The standard rides at the head of the column.**
     *
     * Standing, it is planted inside the block's left edge and that is fine — a host holding ground
     * has no head. On the road it does: a banner at the *back* of a column marching east is the one
     * detail that says the host is walking away from its own colours. So the pole follows the road,
     * to whichever end of the drawn host is furthest along it, and the extra standards a large host
     * carries step back down the column rather than always to the right.
     *
     * Only the x follows the heading. The foot stays on the front rank's ground line, because that
     * is the line everything in this container is painted against — moving it up to the head of a
     * north-bound column would put the cloth on top of the men standing nearer the viewer.
     */
    const lead = mapKit.marching ? Math.cos(mapKit.marchHeading ?? 0) : 0;
    const flagX = at.x + shape.left + (lead > 0 ? shape.width : 0);
    const flagStep = lead > 0.3 ? -FLAG_STEP : FLAG_STEP;
    // The battle screen plants standards at the field's edges instead — see `HostKit.standards`.
    if (mapKit.standards !== false) {
      for (let index = 0; index < standards; index += 1) {
        const flag = isPlayer
          ? createPlayerLandFlag(scene, false, seed)
          : createPlayerLandFlag(scene, false, seed, true);
        flag.setPosition(flagX + index * flagStep, frontRankY - FLAG_FOOT);
        flag.setScale(FLAG_SCALE);
        container.add(flag);
      }
    }
    return container;
  }

  /** Ownership, stamped. The only saturated red on the map is the player's own. */
  override createSelectionFlag(): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const generated = conquestArtStamp(scene, 'marker.selection-seal', {
      left: -18, right: 18, top: -38, bottom: 2,
    });
    if (generated) {
      container.add(placeStamp(scene, generated, 0, -10));
      return container;
    }
    const graphics = scene.add.graphics();
    seal(graphics, 0, -20, 18, 'star');
    container.add(graphics);
    return container;
  }

  /**
   * A settlement in oblique, its form decided by what the land IS rather than by how many hexes it
   * happens to own. A castle is a walled seat at one hex or at nine; sizing that off the cluster
   * count is what made the player's own capital read thinner than a rival's.
   */
  override addCityCluster(
    cluster: Phaser.GameObjects.Container,
    centers: ReadonlyArray<{ x: number; y: number }>,
    isShrine: boolean,
    kind?: 'city' | 'market' | 'shrine',
  ): void {
    if (centers.length === 0) {
      return;
    }
    const seed = Math.round(centers[0].x * 13 + centers[0].y * 7);
    const rand = mulberry32(seed);

    const sorted = [...centers].sort((a, b) => a.y - b.y);
    const anchor = sorted[Math.floor(sorted.length / 2)];
    // How much more ground a bigger holding spreads over. **Not a size** — a settlement's props are
    // drawn at `GROUND_SCALE` like everything else on the map, and this only says a large province
    // sprawls a little wider than a small one. It used to multiply the scale, which is how a big
    // province's buffalo came out larger than a small province's buffalo, and both larger than the
    // soldiers standing beside them.
    const spread = Math.min(1.15, 0.8 + sorted.length * 0.06);
    const parts: GroundPart[] = [];
    // The same ground rule the hamlet itself follows, one level up: an outlying hamlet must not be
    // dealt the seat's ground, and a tree must not be dealt a hamlet's. Each composite claims the
    // room it actually paints into — the seat first, because it is the thing the province is.
    const spacer = new GroundSpacer();
    // The name plate's strip, claimed before anything is placed. A village printed its own name
    // across a roof about as often as not, and no amount of painting order fixes a plate and a
    // house dealt the same ground.
    spacer.claim(anchor.x, anchor.y + LABEL_KEEP_OUT.y, LABEL_KEEP_OUT.rx, LABEL_KEEP_OUT.ry);
    /** A hamlet where there is room for one, or nowhere. */
    const outlier = (centre: { x: number; y: number }, jitter: number, dy: number): void => {
      const at = spacer.fit(
        () => ({ x: centre.x + (rand() - 0.5) * jitter * spread, y: centre.y + dy }),
        58 * GROUND_SCALE,
        22 * GROUND_SCALE,
      );
      if (at) {
        parts.push({ y: at.y, draw: (g) => hamlet(g, at.x, at.y, GROUND_SCALE, seed + 100 + centre.x, 3) });
      }
    };

    if (isShrine || kind === 'shrine') {
      spacer.claim(anchor.x, anchor.y + 6, 70 * GROUND_SCALE, 26 * GROUND_SCALE);
      spacer.claim(anchor.x - 22, anchor.y + 2, 20 * GROUND_SCALE, 9 * GROUND_SCALE);
      parts.push({ y: anchor.y + 2, draw: (g) => banyan(g, anchor.x - 22, anchor.y + 2, GROUND_SCALE, seed + 40) });
      parts.push({ y: anchor.y + 6, draw: (g) => village(g, anchor.x, anchor.y + 6, GROUND_SCALE, seed) });
    } else if (kind === 'market') {
      spacer.claim(anchor.x, anchor.y + 4, 70 * GROUND_SCALE, 26 * GROUND_SCALE);
      parts.push({ y: anchor.y + 4, draw: (g) => village(g, anchor.x, anchor.y + 4, GROUND_SCALE, seed) });
      for (const centre of sorted.slice(0, 2)) {
        outlier(centre, 26, 20);
      }
    } else {
      spacer.claim(anchor.x - 38 * GROUND_SCALE, anchor.y + 12, 62 * GROUND_SCALE, 24 * GROUND_SCALE);
      for (const centre of sorted.slice(0, Math.min(3, sorted.length - 1))) {
        outlier(centre, 30, 22);
      }
      parts.push({ y: anchor.y + 12, draw: (g) => citadel(g, anchor.x - 38 * GROUND_SCALE, anchor.y + 12, GROUND_SCALE, drawnEra(), seed) });
    }

    // The herd grazes at the edge of the settlement, where it actually lives — not scattered
    // through the paddy, and never far from the roofs. Each animal gets its own object rather than
    // going into the settlement's buffer with the houses: a buffalo baked into the same graphics as
    // the roofs behind it can never take a step, and a herd standing perfectly still is the one
    // thing on a drawn map that reads as the picture having frozen.
    // Every animal in the country used to be exactly the same height, because every call site
    // passed a bare `GROUND_SCALE` — so a herd read as a rank of counters rather than as livestock.
    // Size is an INSTANCE scale here, not part of the texture key (see `bakedBuffalo`), so a spread
    // costs nothing: the same four textures serve however many animals at whatever sizes.
    const beastScale = (): number => GROUND_SCALE * (0.9 + rand() * 0.22);
    spacer.claim(anchor.x - 34 * spread, anchor.y + 34, 16 * GROUND_SCALE, 7 * GROUND_SCALE);
    const leadScale = beastScale();
    parts.push({ y: anchor.y + 34, object: () => this.grazingBuffalo(anchor.x - 34 * spread, anchor.y + 34, leadScale, seed + 700, rand() > 0.55) });
    // A calf beside its dam: the same texture at a little over half, which is what turns two
    // animals into a herd rather than two animals.
    if (rand() > 0.5) {
      const calfScale = GROUND_SCALE * 0.58;
      spacer.claim(anchor.x - 20 * spread, anchor.y + 38, 10 * GROUND_SCALE, 5 * GROUND_SCALE);
      parts.push({ y: anchor.y + 38, object: () => this.grazingBuffalo(anchor.x - 20 * spread, anchor.y + 38, calfScale, seed + 710, false) });
    }
    if (sorted.length > 3) {
      spacer.claim(anchor.x + 30 * spread, anchor.y + 40, 16 * GROUND_SCALE, 7 * GROUND_SCALE);
      const secondScale = beastScale();
      parts.push({ y: anchor.y + 40, object: () => this.grazingBuffalo(anchor.x + 30 * spread, anchor.y + 40, secondScale, seed + 720, false) });
    }

    for (const centre of sorted) {
      if (centre === anchor || rand() > 0.45) {
        continue;
      }
      const at = spacer.fit(
        () => ({ x: centre.x + (rand() - 0.5) * 40, y: centre.y + 16 }),
        20 * GROUND_SCALE,
        9 * GROUND_SCALE,
      );
      if (at) {
        parts.push({ y: at.y, draw: (g) => tree(g, at.x, at.y, GROUND_SCALE, seed + 200 + centre.x) });
      }
    }

    this.paintByGround(cluster, parts);
  }

  /**
   * Paints a settlement's parts back to front, by the ground each one stands on.
   *
   * A village used to be drawn in the order the code happened to mention things — hamlets, the
   * seat, then every tree — so a tree standing in *front* of a roof was painted over it and the
   * roof appeared to be behind a tree it was nearer than. The eye reads a scene bottom-up: what is
   * lower on the sheet is nearer, and nearer things cover farther ones.
   *
   * The shared `Graphics` is split around any live object in the list, because a container renders
   * its children in list order — so a buffalo added first is behind every roof no matter where it
   * is standing. Splitting costs one extra buffer per animal and is what lets the herd walk in
   * front of the houses it lives beside.
   */
  private paintByGround(cluster: Phaser.GameObjects.Container, parts: GroundPart[]): void {
    const scene = this.scene as Phaser.Scene;
    const ordered = [...parts].sort((a, b) => a.y - b.y);
    let layer: Phaser.GameObjects.Graphics | undefined;

    for (const part of ordered) {
      if (part.draw) {
        if (!layer) {
          layer = scene.add.graphics();
          cluster.add(layer);
        }
        part.draw(layer);
      } else if (part.object) {
        cluster.add(part.object());
        // Anything nearer than this object has to go into a buffer drawn after it.
        layer = undefined;
      }
    }
  }

  /**
   * One water buffalo on its own object, wandering a small patch of its own field.
   *
   * Drawn from a **baked texture**, not a live `Graphics`. The animal is several hundred path
   * segments and never changes shape, so as a `Graphics` every one of them was re-submitted sixty
   * times a second, forty-odd animals at a time, to show a picture that was identical to the last
   * frame. Baked once and stamped as images, the herd costs a texture and some transforms — and
   * the variants are deliberately few so the copies batch into one draw call rather than flushing
   * per object.
   *
   * The procedural buffalo faces left; the authored sprite faces right. The stamp declares which
   * convention it uses so either one can turn toward its next grazing step.
   */
  private grazingBuffalo(x: number, y: number, scale: number, seed: number, rider: boolean): Phaser.GameObjects.Image {
    const scene = this.scene as Phaser.Scene;
    const calf = !rider && scale < GROUND_SCALE * 0.7
      ? conquestArtStamp(scene, 'life.calf')
      : undefined;
    const baked = calf
      ? { ...calf, nativeFacing: 1 as const }
      : bakedBuffalo(scene, seed, rider);
    const animal = livingSprite(scene, baked, x, y, scale);
    // A ridden animal is being taken somewhere and keeps closer to its herder; a loose one drifts.
    grazeInSmallArea(scene, animal, x, y, rider ? 9 : 14, seed, baked.nativeFacing);
    return animal;
  }

  /** A small holding: two or three roofs and a tree, at the same line weight as everything else. */
  override addBuildingGroup(
    cluster: Phaser.GameObjects.Container,
    x: number,
    y: number,
    isShrine: boolean,
    houseCount: number,
  ): void {
    const scene = this.scene as Phaser.Scene;
    const graphics = scene.add.graphics();
    const seed = Math.round(x * 11 + y * 5);
    if (isShrine) {
      banyan(graphics, x - 10, y + 2, GROUND_SCALE, seed);
    }
    hamlet(graphics, x, y, GROUND_SCALE, seed, Math.max(2, Math.min(6, houseCount)));
    cluster.add(graphics);
  }

  /**
   * The capital's ring, in ink rather than in gold. A stamped seal says whose it is; the ring only
   * has to say "this one", so it is the quietest mark on the map that still reads.
   */
  override createCapitalHighlight(width = 88, height = 44): Phaser.GameObjects.Graphics {
    const graphics = (this.scene as Phaser.Scene).add.graphics();
    // **The ground the seat stands on, not a fixed oval it has outgrown.**
    //
    // This drew 88 x 44 whatever was standing on it. A citadel is drawn up to 116 wide and 86 tall,
    // so the ring stopped enclosing the settlement and started *crossing* it: a hard grey ellipse
    // arc through the middle of the compound with its two ends sticking out either side, sitting in
    // the static bake where nothing on the map explains it. Reported, correctly, as a random line
    // behind the castle.
    graphics.fillStyle(PIGMENT.hoePale, 0.1);
    graphics.fillEllipse(0, 4, width, height);
    // No hard contour any more. The wash alone says "this seat is the realm's"; a 1.2-wide ellipse
    // outline around an ink-drawn town is the one mark on this map with a perfect geometric edge,
    // and at any size that is what makes it read as a rendering artefact rather than as paper.
    seal(graphics, width * 0.45, -height * 0.27, 15, 'star');
    return graphics;
  }

  /**
   * A worked corner beside a settlement — hands, not more bunds. The landscape lattice already
   * owns the fields here; see `createFarmCluster`.
   */
  override addCropPatch(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const g = (this.scene as Phaser.Scene).add.graphics();
    const seed = Math.round(x * 3 + y * 11);
    const rand = mulberry32(seed);
    // `scale` positions the patch, it does not size the people in it: a farmer stands the same
    // height as a soldier wherever the patch happens to be, which is the promise `proportion.ts`
    // makes and the one this call used to break by a factor of 1.4.
    farmer(g, x - 6 * scale, y, GROUND_SCALE, seed);
    if (rand() > 0.45) {
      farmer(g, x + 8 * scale, y + 5 * scale, GROUND_SCALE, seed + 7);
    } else {
      hayStack(g, x + 10 * scale, y + 4 * scale, GROUND_SCALE, seed + 9);
    }
    cluster.add(g);
  }

  /**
   * A city's rampart, as a bank of rammed earth rather than a tracing of the grid.
   *
   * The segments arrive as raw hex edges. Drawn one at a time — however thin, however wobbled —
   * they keep every 120° corner, and a walled town reads as a pale honeycomb laid over the map:
   * the grid deciding shape, which is the one thing it may never do. So the edges are chained back
   * into their loops and rounded off first, and the result is drawn as a thing built out of earth:
   * a band with a fill, a shadowed inner face, a contour, and battlement ticks along the crest.
   */
  override drawCityWall(graphics: Phaser.GameObjects.Graphics, edges: Array<[number, number, number, number]>): void {
    for (const loop of chainEdges(edges)) {
      const wall = smoothLoop(smoothLoop(loop));
      if (wall.length < 3) {
        continue;
      }
      const seed = Math.round(wall[0].x * 13 + wall[0].y * 7);
      const band = thickPath([...wall, wall[0]], wall.map(() => 5.4));
      washFill(graphics, band, PIGMENT.diepLo, seed, 0.92);
      hatchPoly(graphics, band, 0.7, 3.6, PIGMENT.nau, 0.16);
      inkPath(graphics, [...wall, wall[0]], seed + 1, {
        width: 1.15, alpha: 0.72, colour: PIGMENT.muc, wobble: 0.9, step: 12,
      });
      // Battlements: short ticks standing off the crest, spaced along the loop by arc length so
      // they stay even however the smoothing has stretched each span.
      let carried = 0;
      for (let i = 0; i < wall.length; i += 1) {
        const a = wall[i];
        const b = wall[(i + 1) % wall.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const span = Math.hypot(dx, dy) || 1;
        for (let along = 7 - carried; along < span; along += 14) {
          const t = along / span;
          const nx = -dy / span;
          const ny = dx / span;
          inkPath(graphics, [
            { x: a.x + dx * t + nx * 2.4, y: a.y + dy * t + ny * 2.4 },
            { x: a.x + dx * t + nx * 5.4, y: a.y + dy * t + ny * 5.4 },
          ], seed + i * 7 + along, { width: 0.9, alpha: 0.5, colour: PIGMENT.muc, wobble: 0.3, step: 4 });
        }
        carried = (carried + span) % 14;
      }
    }
  }

  /**
   * The lanes inside a town, as lanes — not as a drawing of which hexes are adjacent.
   *
   * The segments offered are every adjacent pair of seat hexes, so a four-hex seat arrives as a
   * complete graph and the default draws all of it: a broad translucent triangle mesh with the
   * hex spacing legible in it, laid straight over the roofs. A town has lanes that reach every
   * quarter, not a road between every pair of them, so this keeps a minimum spanning tree of the
   * segments — the shortest set that still connects the whole seat — and draws each as a rutted
   * track that bends on its way.
   */
  drawCityRoad(graphics: Phaser.GameObjects.Graphics, segments: Array<[number, number, number, number]>): void {
    const parent = new Map<string, string>();
    const find = (node: string): string => {
      let root = node;
      while ((parent.get(root) ?? root) !== root) {
        root = parent.get(root) ?? root;
      }
      parent.set(node, root);
      return root;
    };
    const at = (x: number, y: number): string => `${Math.round(x)}:${Math.round(y)}`;

    const ordered = [...segments].sort(
      (a, b) => Math.hypot(a[0] - a[2], a[1] - a[3]) - Math.hypot(b[0] - b[2], b[1] - b[3]),
    );
    for (const [ax, ay, bx, by] of ordered) {
      const rootA = find(at(ax, ay));
      const rootB = find(at(bx, by));
      if (rootA === rootB) {
        continue;
      }
      parent.set(rootA, rootB);

      const seed = Math.round(ax + ay * 3 + bx * 7 + by * 11);
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const nx = -(by - ay);
      const ny = bx - ax;
      const length = Math.hypot(nx, ny) || 1;
      const bow = ((seed % 7) - 3) * 0.9;
      const lane = [
        { x: ax, y: ay },
        { x: mx + (nx / length) * bow, y: my + (ny / length) * bow },
        { x: bx, y: by },
      ];
      // Same pigment and weight as the open road (DongHoMapRenderer.drawRoad): a town lane is
      // the same rutted earth as the track that leads to it, not a darker second material.
      // The old two-pass nauDark stroke read as charcoal against the roads it joined.
      inkPath(graphics, lane, seed, { width: 2, alpha: 0.24, colour: PIGMENT.nau, wobble: 1.4, step: 14 });
    }
  }

  /**
   * A farm is the farmSTEAD. The fields are already there.
   *
   * `drawLandscape` lays one paddy lattice across the whole delta, so a farm that draws its own
   * plots on top puts a second, differently-angled set of bunds over the first and the ground
   * turns to mud. What is missing at this scale is the people: the houses, the straw stack after
   * harvest, the buffalo, someone bent in the water.
   */
  override createFarmCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const seed = Math.round(scale * 977 + upgradeLevel * 31);
    const rand = mulberry32(seed);

    // Ordered by the ground each stands on, not by the order they are listed: the areca beside the
    // houses is behind them, the farmer out in front of them is in front.
    // `scale` lays the cluster out; it does not size what stands in it. Every prop here is drawn at
    // `GROUND_SCALE`, like the same prop anywhere else on the map.
    const parts: GroundPart[] = [
      { y: -2 * scale, draw: (g) => hamlet(g, 4 * scale, -2 * scale, GROUND_SCALE, seed, 3 + Math.min(3, upgradeLevel)) },
      { y: 6 * scale, draw: (g) => hayStack(g, -26 * scale, 6 * scale, GROUND_SCALE, seed + 200) },
      { y: 16 * scale, draw: (g) => farmer(g, 26 * scale, 16 * scale, GROUND_SCALE, seed + 400) },
      // The farm's own animal, working rather than posed.
      // The farm's animal takes the same size spread as the herd — one bare GROUND_SCALE
      // everywhere is what made every trâu on the map identical.
      { y: 20 * scale, object: () => this.grazingBuffalo(-30 * scale, 20 * scale, GROUND_SCALE * (0.9 + rand() * 0.22), seed + 300, rand() > 0.5) },
    ];
    if (upgradeLevel > 0) {
      parts.push({ y: 6 * scale, draw: (g) => areca(g, 34 * scale, 6 * scale, GROUND_SCALE, seed + 500) });
    }
    if (upgradeLevel > 1) {
      parts.push({ y: -8 * scale, draw: (g) => bamboo(g, -34 * scale, -8 * scale, GROUND_SCALE, seed + 600) });
    }

    this.paintByGround(container, parts);
    return container;
  }

  /**
   * Mỏ — a hillside cut, not a cottage.
   *
   * This was the last thing on the map still coming out of the isometric renderer: a flat
   * grey-blue hut with no contour, twice the size of everything near it. What an iron working
   * actually looks like from above is a bite taken out of a slope, spoil tipped below it, timber
   * props at the mouth, and the hands that work it living beside it.
   */
  /**
   * A mine is a small dark mouth at the foot of a bank, not a shed on a rock.
   *
   * The first pass drew the cut as a closed contour — so it read as a boulder set down on the
   * hillside rather than earth cut back into it — and made the adit a quarter of the face wide,
   * which at map scale is a barn door. The bank is now open along its base so it merges into the
   * ground, and the mouth is a low arch you have to stoop through, with the work around it doing
   * the explaining: spoil tipped downhill, baskets, and someone carrying.
   */
  override createMineCluster(scale: number, upgradeLevel: number): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const g = scene.add.graphics();
    const seed = Math.round(scale * 613 + upgradeLevel * 37);
    const rand = mulberry32(seed);
    const s = scale;

    // The bank of cut earth: filled and shaded, but contoured only along the crest, so the base
    // has no line to read as an edge and the ground carries straight into it.
    const crest: Pt[] = [
      { x: -26 * s, y: -3 * s }, { x: -19 * s, y: -15 * s }, { x: -6 * s, y: -20 * s },
      { x: 9 * s, y: -18 * s }, { x: 20 * s, y: -9 * s }, { x: 26 * s, y: -1 * s },
    ];
    washFill(g, [...crest, { x: 26 * s, y: 4 * s }, { x: -26 * s, y: 4 * s }], PIGMENT.diepLo, seed, 0.9);
    hatchPoly(g, [...crest, { x: 26 * s, y: 4 * s }, { x: -26 * s, y: 4 * s }], -0.9, 3.4 * s, PIGMENT.nau, 0.14);
    inkPath(g, crest, seed + 1, { width: 1.1 * s, alpha: 0.78, wobble: 0.5 * s, step: 7 });
    for (let seam = 0; seam < 4; seam += 1) {
      const sx = -15 * s + seam * 9 * s;
      inkPath(g, [{ x: sx, y: -15 * s + rand() * 4 * s }, { x: sx + (rand() - 0.5) * 3 * s, y: -3 * s }], seed + seam, {
        width: 0.55 * s, alpha: 0.26, wobble: 0.4 * s, step: 7,
      });
    }

    // The adit: a low arch at the foot of the bank, under one timber lintel.
    const mouth: Pt[] = [{ x: -4 * s, y: 1 * s }];
    for (let i = 0; i <= 8; i += 1) {
      const a = Math.PI + (i / 8) * Math.PI;
      mouth.push({ x: Math.cos(a) * 4 * s, y: -4.5 * s + Math.sin(a) * 4 * s });
    }
    mouth.push({ x: 4 * s, y: 1 * s });
    printedShape(g, mouth, PIGMENT.muc, seed + 10, { width: 0.8 * s, alpha: 0.8, wobble: 0.15 * s, step: 4, fillAlpha: 0.78 });
    inkPath(g, [{ x: -5.5 * s, y: -8 * s }, { x: 5.5 * s, y: -8.4 * s }], seed + 30, {
      width: 1.1 * s, alpha: 0.7, colour: PIGMENT.nau, wobble: 0.15 * s, step: 4,
    });
    for (const dx of [-4.6, 4.6]) {
      inkPath(g, [{ x: dx * s, y: -8 * s }, { x: dx * s, y: 1 * s }], seed + 20 + dx, {
        width: 0.8 * s, alpha: 0.6, colour: PIGMENT.nau, wobble: 0.1 * s, step: 4,
      });
    }

    // Spoil tipped down the slope, and the baskets it is carried out in.
    for (let heap = 0; heap < 2 + Math.min(2, upgradeLevel); heap += 1) {
      const hx = -17 * s + heap * 13 * s + (rand() - 0.5) * 4 * s;
      const spoil: Pt[] = [];
      for (let i = 0; i <= 10; i += 1) {
        const a = Math.PI + (i / 10) * Math.PI;
        spoil.push({ x: hx + Math.cos(a) * 6.5 * s, y: 7 * s + Math.sin(a) * 3.4 * s });
      }
      spoil.push({ x: hx + 6.5 * s, y: 8 * s }, { x: hx - 6.5 * s, y: 8 * s });
      printedShape(g, spoil, PIGMENT.diepDeep, seed + 40 + heap, { width: 0.6 * s, alpha: 0.42, wobble: 0.3 * s, step: 5, fillAlpha: 0.7 });
    }
    for (const bx of [11, 15.5]) {
      printedShape(g, [
        { x: (bx - 2.2) * s, y: 4 * s }, { x: (bx + 2.2) * s, y: 4 * s },
        { x: (bx + 1.6) * s, y: 8 * s }, { x: (bx - 1.6) * s, y: 8 * s },
      ], PIGMENT.nau, seed + 60 + bx, { width: 0.5 * s, alpha: 0.6, wobble: 0.15 * s, step: 4, fillAlpha: 0.55 });
    }
    figure(g, -21 * s, 9 * s, GROUND_SCALE, PIGMENT.muc, false);
    figure(g, 6 * s, 8 * s, GROUND_SCALE, PIGMENT.muc, false);
    container.add(g);
    // the hands that work it live beside it
    const homes = scene.add.graphics();
    hamlet(homes, 26 * s, 14 * s, GROUND_SCALE, seed + 100, 2 + Math.min(3, upgradeLevel));
    container.add(homes);
    return container;
  }

  /** A cottage is a nhà tranh, at the same line weight as every other roof on the map. */
  override addCottage(cluster: Phaser.GameObjects.Container, x: number, y: number, scale: number): void {
    const g = (this.scene as Phaser.Scene).add.graphics();
    groundShadow(g, x + 13 * GROUND_SCALE, y + 1, 17 * GROUND_SCALE, 0.08);
    house(g, x - 13 * GROUND_SCALE, y, GROUND_SCALE, Math.round(x * 7 + y * 3));
    cluster.add(g);
  }

  /**
   * The mark a constructed building leaves on the map. Drawn rather than glyphed, so a granary
   * beside a temple beside a barracks reads as three buildings and not three icons.
   */
  override createBuildingGlyph(building: LandBuildingType, x: number, y: number): Phaser.GameObjects.GameObject[] {
    const generatedId = `building.improvement-${building === 'communalHall' ? 'communal-hall' : building}`;
    const generated = conquestArtStamp(
      this.scene as Phaser.Scene,
      generatedId,
      { left: -19, right: 19, top: -28, bottom: 6 },
    );
    if (generated) {
      return [placeStamp(this.scene as Phaser.Scene, generated, x, y)];
    }
    const g = (this.scene as Phaser.Scene).add.graphics();
    const seed = Math.round(x * 11 + y * 5);
    switch (building) {
      case 'communalHall':
      case 'university':
        // The two that are civic rather than productive get the tiered tower.
        thap(g, x, y, GROUND_SCALE, seed, 4);
        break;
      case 'market':
      case 'guild':
      case 'harbor':
        house(g, x - 8, y, GROUND_SCALE, seed, true);
        hayStack(g, x + 12, y, GROUND_SCALE, seed + 5);
        break;
      case 'barracks':
      case 'wall':
      case 'tower':
        house(g, x - 8, y, GROUND_SCALE, seed, true);
        figure(g, x + 12, y, GROUND_SCALE, PIGMENT.muc, true);
        break;
      case 'farm':
        hayStack(g, x, y, GROUND_SCALE, seed);
        farmer(g, x + 10, y, GROUND_SCALE, seed + 3);
        break;
      case 'mine':
        printedShape(
          g,
          [{ x: x - 7, y }, { x: x - 5, y: y - 9 }, { x: x + 5, y: y - 9 }, { x: x + 7, y }],
          PIGMENT.diepLo, seed, { width: 0.8, alpha: 0.7, wobble: 0.3, step: 5, fillAlpha: 0.9 },
        );
        printedShape(
          g,
          [{ x: x - 3, y }, { x: x - 3, y: y - 6 }, { x: x + 3, y: y - 6 }, { x: x + 3, y }],
          PIGMENT.muc, seed + 1, { width: 0.7, alpha: 0.7, wobble: 0.2, step: 4, fillAlpha: 0.7 },
        );
        break;
      default:
        house(g, x - 8, y, GROUND_SCALE, seed);
        break;
    }
    return [g];
  }

  /** One stable civilian appearance, drawn from the road's shuffled set of styles. */
  override createTraveler(appearanceSeed = 0, index = 0): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    // Stamped: the roads keep a dozen of these walking, and as live Graphics each was ~80 path
    // segments re-tessellated per frame for a figure that never changes shape.
    // The earlier 18x20 fit reduced the authored traveller to roughly eight world pixels tall,
    // below the point where its alternating feet survive texture filtering. This remains a small
    // road figure, but gives its 13px silhouette enough resolution for the walk frames to read.
    // The procedural fallback still needs a box to raster into; the authored plate does not,
    // and must not be handed one. A settlement traveller is stamped from `life.traveler`'s own
    // declared bounds while this call site gave it a box of its own — so the same asset came out
    // 8.22 px on a road and 6.47 in a village. Same asset, same bounds, same caller scale now.
    const box = { left: -13, right: 13, top: -24, bottom: 8 };
    const artId = conquestTravelerArtId(appearanceSeed, index);
    const st = conquestArtStamp(scene, artId) ?? conquestArtStamp(scene, 'life.traveler')
      ?? stamp(scene, 'world:traveler', box,
      (g, x, y, raster) => {
        farmer(g, x + -2 * raster, y + 4 * raster, GROUND_SCALE * raster, 4711);
      }, { raster: 'super', pool: 'world', pad: 2 });
    // The authored plate faces viewer-right and has a real four-frame foot/arm cycle. The
    // procedural fallback keeps the old rigid stamp and restrained whole-figure motion.
    setNativeFacing(container, 1);
    // **One size for every person on the map.**
    //
    // This carried a hardcoded 1.5x, so that a road traveller's alternating feet would survive
    // texture filtering. It bought that at the cost of the one rule the map is built on: a
    // traveller stood **1.5x a soldier and a farmer**, and because only this call site had the
    // multiplier the same asset was drawn at two sizes depending on which path made it —
    // measured on a revealed map, 12.32 px on the roads against 6.4 in the settlements, a 1.9x
    // spread inside a single asset.
    //
    // The road role keeps the shared human scale. Its authored sheet now carries wider readable
    // silhouettes, measured torso registration, and no independent bob/tilt competing with them.
    container.setData('conquestTravelerStyle', artId);
    container.add(livingSprite(scene, st, 0, 0, GROUND_SCALE)
      .setData('conquestTravelerStyle', artId));
    return container;
  }

  /**
   * A xe trâu: the animal, the shafts it is yoked into, and the cart behind it.
   *
   * The procedural drawing faces left, while the reviewed authored sprite faces right. The chosen
   * stamp declares its own convention so both the generated path and the rollback path turn toward
   * their direction of travel.
   *
   * The buffalo was small enough to be a smudge and floated a body-length ahead of the shafts with
   * nothing joining them; at this size the whole rig is about twelve pixels, so the one thing that
   * has to read is that the animal is attached to the cart and pulling it.
   *
   * Every dimension here is now in units of `GROUND_SCALE` rather than in raw pixels. The cart body
   * was written as bare numbers — a 12-pixel bed, 2.6-pixel wheels — so it stayed exactly the same
   * size no matter what the rest of the world was drawn at, and its buffalo was pulling at 0.95
   * while the herd two provinces away grazed at 0.72. A xe trâu is about two and a half metres of
   * cart behind an animal a metre and a half at the shoulder, and it now says so.
   */
  override createCart(): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    // The rig is baked whole - animal, yoke, shafts, bed and wheel - because no part of it ever
    // moves relative to another; TrafficRenderer moves and flips the container exactly as before.
    const box = { left: -14, right: 10, top: -14, bottom: 6 };
    const authored = conquestArtStamp(scene, 'life.ox-cart', box);
    setNativeFacing(container, authored ? 1 : -1);
    const st = authored ?? stamp(scene, 'world:cart', box,
      (g, x, y, raster) => {
        g.translateCanvas(x, y);
        const s = GROUND_SCALE * raster;

    // Where the animal stands, and where its body ends.
    //
    // `BUFFALO_REACH` says the drawing runs from −36 to +22 about its anchor before `UNIT.buffalo`
    // is applied, so at this scale its tail sits `6.4·s` behind the anchor. Placing the anchor so
    // that the tail lands just in front of the cart bed is what actually joins the two: the old
    // arrangement stood the animal at −14·s, which left its tail `7·s` clear of a bed starting at
    // 0, and then ran shafts nine units long across the gap. Drawn at map size that read as a
    // buffalo and a cart travelling together rather than one pulling the other.
    const oxAnchor = -8 * s;
    const oxTail = oxAnchor + 6.4 * s;

    groundShadow(g, 3 * s, 5 * s, 12 * s, 0.07);

    // The bed: a plank floor with a low rail down the side, rather than a filled block.
    printedShape(g, [
      { x: 0, y: -1.6 * s }, { x: 11 * s, y: -1.6 * s }, { x: 11 * s, y: 2 * s }, { x: 0, y: 2 * s },
    ], PIGMENT.nau, 88, { width: 0.7 * s, alpha: 0.8, wobble: 0.15 * s, step: 4, fillAlpha: 0.85 });
    // Side rail — three uprights and a top rail, which is what makes it a cart and not a crate.
    inkPath(g, [{ x: 0.6 * s, y: -1.6 * s }, { x: 10.4 * s, y: -1.6 * s }], 91, {
      width: 0.5 * s, alpha: 0.7, colour: PIGMENT.muc, wobble: 0.12 * s, step: 4,
    });
    for (const ux of [1.2, 5.5, 9.8]) {
      inkPath(g, [{ x: ux * s, y: -1.6 * s }, { x: ux * s, y: -4.2 * s }], 92 + ux, {
        width: 0.45 * s, alpha: 0.6, colour: PIGMENT.nau, wobble: 0.1 * s, step: 3,
      });
    }
    inkPath(g, [{ x: 1.2 * s, y: -4.2 * s }, { x: 9.8 * s, y: -4.2 * s }], 95, {
      width: 0.5 * s, alpha: 0.65, colour: PIGMENT.nau, wobble: 0.12 * s, step: 4,
    });

    // One wheel, not two. A xe trâu seen from the side shows the near wheel; drawing both put a
    // second rim floating behind the bed with nothing to attach it to.
    const wheelX = 6.5 * s;
    const wheelY = 3 * s;
    const wheelR = 2.8 * s;
    g.lineStyle(0.9 * s, PIGMENT.muc, 0.8);
    g.strokeCircle(wheelX, wheelY, wheelR);
    g.lineStyle(0.5 * s, PIGMENT.muc, 0.55);
    for (let spoke = 0; spoke < 4; spoke += 1) {
      const angle = (spoke / 4) * Math.PI;
      g.lineBetween(
        wheelX - Math.cos(angle) * wheelR, wheelY - Math.sin(angle) * wheelR,
        wheelX + Math.cos(angle) * wheelR, wheelY + Math.sin(angle) * wheelR,
      );
    }

    // The shafts run from the bed to the animal's flank and stop there — they are the join, so they
    // must land on the buffalo rather than reaching past it.
    for (const dy of [-0.4, 1.1]) {
      inkPath(g, [{ x: 0.4 * s, y: (-0.6 + dy) * s }, { x: oxTail - 0.5 * s, y: (-1.2 + dy) * s }], 96 + dy * 10, {
        width: 0.6 * s, alpha: 0.7, colour: PIGMENT.nau, wobble: 0.08 * s, step: 3,
      });
    }
    // The yoke across the shoulders, which is the piece that says "pulling".
    inkPath(g, [{ x: oxTail - 0.6 * s, y: -2.4 * s }, { x: oxTail - 0.6 * s, y: 1.2 * s }], 99, {
      width: 0.7 * s, alpha: 0.75, colour: PIGMENT.nau, wobble: 0.08 * s, step: 3,
    });

        buffalo(g, oxAnchor, 3.4 * s, s, 90, false);
        g.translateCanvas(-x, -y);
      }, { raster: 'super', pool: 'world', pad: 2 });
    // Authored rigs select the four-frame hoof/wheel sheet; the procedural fallback remains the
    // same static stamp and receives the restrained motion fallback in TrafficRenderer.
    container.add(livingSprite(scene, st, 0, 0));
    return container;
  }

  /** The march destination: a planted standard, in the only red on the map. */
  override createDestinationArrow(): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(0, 0);
    const generated = conquestArtStamp(scene, 'marker.destination-standard', {
      left: -14, right: 14, top: -42, bottom: 7,
    });
    if (generated) {
      container.add(placeStamp(scene, generated, 0, 0));
      container.setScale(0.8);
      return container;
    }
    container.add(createPlayerLandFlag(scene, false, 3));
    container.setScale(0.8);
    return container;
  }

  /**
   * The mark above the scrap: **what this district is busy with**, read before the numbers.
   *
   * Four of the five had no glyph at all - a build, a purchase and a muster were the same blank
   * scrap with different figures on it, so the map could tell you that something was 9/100 done
   * without telling you what. Each is a silhouette at roughly twenty units, drawn in the pigment
   * the thing itself would be: hoa hoe for coin, nau for timber, soi son for the player's own
   * standard. The two fights keep the lacquer burst, because a fight is the one of the five that
   * is urgent.
   */
  private orderGlyph(g: Phaser.GameObjects.Graphics, variant: ProgressBadgeVariant, y: number): void {
    if (variant === 'acquisition') {
      // A cash coin: round, with the square hole every Vietnamese coin was strung by.
      g.fillStyle(PIGMENT.hoe, 0.95);
      g.fillCircle(0, y, 10);
      g.fillStyle(PIGMENT.diepHi, 1);
      g.fillRect(-3.4, y - 3.4, 6.8, 6.8);
      g.lineStyle(1.4, PIGMENT.muc, 0.85);
      g.strokeCircle(0, y, 10);
      g.strokeRect(-3.4, y - 3.4, 6.8, 6.8);
      return;
    }
    if (variant === 'build') {
      // A hammer, head-on: an iron head across the top of a timber haft. The shape it replaced was
      // a mallet drawn at an angle - a brown wedge on a brown stick, which at twenty units read as
      // a flag that had fallen over.
      //
      // Just the tool, with nothing under it. A beam was drawn beneath it at first, on the theory
      // that a hammer wants something to hit; at this size it was a bar of dark pigment the width
      // of the glyph, which reads as an underline rather than as timber - and the hammer swings
      // while it stays put, so the eye takes it for a rule the icon is sitting on. None of the
      // other four stand on anything either.
      //
      // Head and haft in different pigments on purpose. Both in nau made one silhouette, and the
      // whole reading of a hammer is that the heavy part is not made of the same thing as the
      // handle: muc for the iron, nau for the wood.
      g.fillStyle(PIGMENT.nau, 0.95);
      g.fillRect(-1.8, y - 5, 3.6, 13);
      g.fillStyle(PIGMENT.muc, 0.92);
      // The head: a square face on the left, tapering to a peen on the right.
      g.fillPoints([
        { x: -8.5, y: y - 10 }, { x: 3.5, y: y - 10 },
        { x: 8.5, y: y - 7.6 }, { x: 8.5, y: y - 6 },
        { x: 3.5, y: y - 4 }, { x: -8.5, y: y - 4 },
      ], true);
      g.lineStyle(1.1, PIGMENT.diepHi, 0.5);
      g.strokePoints([{ x: -6.4, y: y - 8.4 }, { x: -6.4, y: y - 5.6 }], false, false);
      return;
    }
    if (variant === 'recruit') {
      // A muster standard. Soi son, because the men being raised are the player's own.
      g.lineStyle(2, PIGMENT.muc, 0.9);
      g.lineBetween(-5, y - 10, -5, y + 9);
      g.fillStyle(PIGMENT.son, 0.95);
      g.fillPoints([
        { x: -5, y: y - 10 }, { x: 9, y: y - 6 }, { x: -5, y: y - 1 },
      ], true);
      g.lineStyle(1.2, PIGMENT.muc, 0.8);
      g.strokePoints([
        { x: -5, y: y - 10 }, { x: 9, y: y - 6 }, { x: -5, y: y - 1 },
      ], true, true);
      g.fillStyle(PIGMENT.muc, 0.75);
      g.fillRect(-9, y + 8, 8, 2.4);
      return;
    }

    // Both fights carry the battle screen's own clash mark. A siege adds the wall it is being
    // pressed against, which is the whole difference between the two.
    if (variant === 'siege') {
      // Dropped clear of the blades and given taller teeth. Tucked directly under the hilts the
      // crenellation filled its own gaps and the wall read as one brown bar - which is to say, as
      // nothing, and the siege and the field battle became the same picture.
      g.fillStyle(PIGMENT.mucSoft, 0.9);
      g.fillRect(-14, y + 12, 28, 5);
      for (let merlon = -14; merlon < 14; merlon += 7) {
        g.fillRect(merlon, y + 5, 4, 7.5);
      }
      clashDevice(g, 0, y - 4, 0.85);
      return;
    }
    clashDevice(g, 0, y, 0.85);
  }

  /**
   * A small, slow life for each order glyph — what the district is *doing*, not merely what it is.
   *
   * One motion each, and each one is the verb: the fights breathe, the coin turns on its string,
   * the hammer falls, the standard stirs. Deliberately slow and small; these sit over a live map
   * beside armies that are themselves moving, and anything quicker reads as a fault in the paper.
   *
   * Killed with the badge. Badges are rebuilt whenever the order's progress changes — once a tick —
   * so a tween left pointing at a destroyed `Graphics` would accumulate one per badge per tick.
   */
  private animateOrderGlyph(
    container: Phaser.GameObjects.Container,
    mark: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image,
    variant: ProgressBadgeVariant,
  ): void {
    const scene = this.scene as Phaser.Scene;
    // Authored markers arrive with a small fitted scale (normally ~0.1). Tweening to an absolute
    // `scale: 1.09` discarded that fit and expanded a 20 px battle seal back to its 180 px source
    // size. Every scale animation is relative to the placed stamp's own scale. The glyph's world
    // position is deliberately never animated: progress badges are map pins, not wandering life.
    const base = mark.scaleY;
    const spec = variant === 'acquisition'
      // A cash coin hung on its string, turning edge-on and back.
      ? { scaleX: base * 0.30, duration: 1500, ease: 'Sine.easeInOut' }
      : variant === 'build'
        // A hammer can tilt without leaving the land point it identifies.
        ? { angle: 12, duration: 520, ease: 'Sine.easeInOut' }
        : variant === 'recruit'
          // The standard stirs. Small: a flag that swings reads as a windsock.
          ? { angle: 6, duration: 1100, ease: 'Sine.easeInOut' }
          // Both fights breathe, on the burst's own clock.
          : { scaleX: base * 1.06, scaleY: base * 1.06, duration: 820, ease: 'Sine.easeInOut' };

    const tween = scene.tweens.add({ targets: mark, yoyo: true, repeat: -1, ...spec });
    container.setData('progressTween', tween);
    container.once(Phaser.GameObjects.Events.DESTROY, () => tween.remove());
  }

  /** Work in progress, on a scrap of paper rather than a coloured ring. */
  override createProgressBadge(
    x: number,
    y: number,
    progress: number,
    required: number,
    variant: ProgressBadgeVariant,
  ): Phaser.GameObjects.Container {
    const scene = this.scene as Phaser.Scene;
    const container = scene.add.container(x, y);
    const g = scene.add.graphics();
    const urgent = variant === 'acquisition' || variant === 'siege' || variant === 'battle';
    const w = 60;
    const plate: Pt[] = [{ x: -w / 2, y: -12 }, { x: w / 2, y: -12 }, { x: w / 2, y: 12 }, { x: -w / 2, y: 12 }];
    washFill(g, plate, PIGMENT.diepHi, 501, 0.98, 0.25);
    inkPath(g, plate, 502, { width: 0.9, alpha: 0.78, colour: urgent ? PIGMENT.son : PIGMENT.muc,
      wobble: 0.2, step: 15, closed: true, bleed: 0.1 });
    g.fillStyle(PIGMENT.muc, 0.12).fillRect(-5, 7, 29, 2);
    const bar = scene.add.graphics();
    // The glyph occupies its own cell beside the count, with its pivot at the cell centre.
    const generated = conquestArtStamp(scene, `marker.${variant}`, {
      left: -10, right: 10, top: -10, bottom: 10,
    });
    const mark = generated
      ? placeStamp(scene, generated, -17, 0).setOrigin(0.5)
      : scene.add.graphics().setPosition(-17, 0);
    if (mark instanceof Phaser.GameObjects.Graphics) {
      this.orderGlyph(mark, variant, 0);
      mark.setScale(variant === 'siege' || variant === 'battle' ? 0.55 : 0.82);
    }
    container.add(g);
    container.add(bar);
    container.add(mark);
    this.animateOrderGlyph(container, mark, variant);

    // Rounded, always. `order.progress` is a running fractional total, and printed raw it put
    // `9.31294468968111/100` across the middle of the map.
    const text = scene.add.text(10, -8, '', {
      color: '#2a2118', fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
    }).setOrigin(0.5, 0).setResolution(4);
    container.add(text);
    let previousRatio = NaN;
    const update = (p: number, r: number): void => {
      const ratio = Math.max(0, Math.min(1, p / Math.max(1, r)));
      if (ratio !== previousRatio) {bar.clear();if(ratio>0)bar.fillStyle(urgent ? PIGMENT.son : PIGMENT.tram,0.9).fillRect(-5,7,29*ratio,2);previousRatio=ratio;}
      const label = `${Math.round(p)}/${Math.round(r)}`;
      if(text.text!==label)text.setText(label);
    };
    container.setData('updateProgress', update);update(progress, required);
    container.setSize(w, 24).setData('mapAnnotation', 'progress');
    return container;
  }
}
