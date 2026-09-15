import type Phaser from 'phaser';
import type { LandscapeContext } from '../MapRenderer';
import type { Season } from '../../state/types';
import { PIGMENT } from './palette';
import { inkPath, mulberry32, type Pt } from './stroke';
import { mixPigment } from './season';

/**
 * Exactly the map's road colours (`DongHoMapRenderer.drawRoad`): a mucSoft edge under a hòe-pale plate.
 * A bund is a path people walk, so it reads as one with the roads rather than as a field's border.
 */
const DIRT = PIGMENT.hoePale;
const DIRT_EDGE = PIGMENT.mucSoft;
/** The rut worn down its middle: the same ochre, only a breath deeper. */
const DIRT_WORN = mixPigment(PIGMENT.hoePale, PIGMENT.nau, 0.3);
import { planRiceTiles } from './riceTilePlan';

export interface RiceParcel {
  /** The actual axial terrain-cell key. */
  id: string;
  district: string;
  seed: number;
  corners: Pt[];
  centre: Pt;
  area: number;
}
export type RiceStage = 'flooded' | 'seedlings' | 'green' | 'ripe' | 'stubble';
export interface RicePlan { parcels: RiceParcel[]; tileSize: number; eligibleCells: number }
export interface RiceEdge { a: Pt; b: Pt; uses: number }

export function connectedRiceGround(): boolean {
  return !['original', 'carved', 'jade', 'harvest'].includes(new URLSearchParams(location.search).get('riceart') ?? '');
}

/** The optional comparison keeps every shared hex bund; the ordinary map encloses the union. */
export function riceBorderMode(): 'outer' | 'tiles' {
  return new URLSearchParams(location.search).get('riceborders') === 'tiles' ? 'tiles' : 'outer';
}

export function pointInRice(p: RiceParcel, at: Pt): boolean {
  let side = 0;
  for (let i = 0; i < p.corners.length; i++) {
    const a = p.corners[i], b = p.corners[(i + 1) % p.corners.length];
    const cross = (b.x - a.x) * (at.y - a.y) - (b.y - a.y) * (at.x - a.x);
    if (Math.abs(cross) < 0.001) continue;
    if (side && Math.sign(cross) !== side) return false;
    side = Math.sign(cross);
  }
  return true;
}

function edgeDistance(at: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(at.x - a.x - dx * t, at.y - a.y - dy * t);
}

export function riceTouchesCircle(p: RiceParcel, at: Pt, radius: number): boolean {
  return pointInRice(p, at) || p.corners.some((a, i) => edgeDistance(at, a, p.corners[(i + 1) % p.corners.length]) < radius);
}

/** Test the complete crown against the complete cultivated cell. */
export function riceTouchesBox(p: RiceParcel, box: { left: number; right: number; top: number; bottom: number }): boolean {
  const rect = [{x:box.left,y:box.top},{x:box.right,y:box.top},{x:box.right,y:box.bottom},{x:box.left,y:box.bottom}];
  const axes = [p.corners, rect].flatMap(points => points.map((a, i) => {
    const b = points[(i + 1) % points.length]; return {x:a.y-b.y,y:b.x-a.x};
  }));
  return axes.every(axis => {
    const a = p.corners.map(v => v.x * axis.x + v.y * axis.y), b = rect.map(v => v.x * axis.x + v.y * axis.y);
    return Math.max(...a) > Math.min(...b) + .0001 && Math.max(...b) > Math.min(...a) + .0001;
  });
}

export function planRiceGround(ctx: LandscapeContext): RicePlan { return planRiceTiles(ctx); }

export function riceEdges(plan: RicePlan): RiceEdge[] {
  const edges = new Map<string, RiceEdge>();
  for (const p of plan.parcels) for (let i = 0; i < p.corners.length; i++) {
    const a = p.corners[i], b = p.corners[(i + 1) % p.corners.length];
    const key = [a.x.toFixed(3) + ',' + a.y.toFixed(3), b.x.toFixed(3) + ',' + b.y.toFixed(3)].sort().join('/');
    const edge = edges.get(key);
    if (edge) edge.uses++; else edges.set(key, { a, b, uses: 1 });
  }
  return [...edges.values()];
}

/** A connected field grows as one basin, with variation between field groups. */
export function riceStage(season: Season, seed: number): RiceStage {
  const phase = mulberry32(seed + 881)();
  switch (season) {
    case 'Spring': return phase < .16 ? 'flooded' : phase < .78 ? 'seedlings' : 'green';
    case 'Summer': return phase < .18 ? 'seedlings' : phase < .38 ? 'ripe' : 'green';
    case 'Autumn': return phase < .23 ? 'stubble' : 'ripe';
    case 'Winter': return 'stubble';
  }
}

const COLOURS = {water:0x9bb0a4, waterInk:0x637f78, mud:0xa18b60, green:0x819a42, greenLight:0xacc164,
  leaf:0x426330, gold:0xd4b544, goldLight:0xebd477, grain:0x795d28, bank:0x78864a, bankTop:0xb1b776};

function crop(g: Phaser.GameObjects.Graphics, at: Pt, h: number, stage: RiceStage): void {
  const {x,y} = at;
  if (stage === 'stubble') {
    g.lineStyle(h*.15,PIGMENT.nau,.85).lineBetween(x-h*.25,y,x-h*.32,y-h*.42).lineBetween(x+h*.2,y,x+h*.24,y-h*.36);
    g.lineStyle(h*.15,COLOURS.goldLight,.95).lineBetween(x,y,x,y-h*.55); return;
  }
  const ripe = stage === 'ripe', tone = ripe ? COLOURS.grain : COLOURS.leaf;
  g.lineStyle(h*.2,tone,1).lineBetween(x,y,x-h*.6,y-h*.8).lineBetween(x,y,x,y-h*1.12).lineBetween(x,y,x+h*.55,y-h*.86);
  g.lineStyle(h*.12,ripe?COLOURS.goldLight:COLOURS.greenLight,1).lineBetween(x,y-h*.96,x,y-h*.18);
  if (ripe) {
    g.lineStyle(h*.12,COLOURS.grain,1).strokePoints([{x,y},{x,y:y-h*1.08},{x:x+h*.55,y:y-h*.84}],false);
    g.fillStyle(COLOURS.goldLight,1).fillEllipse(x+h*.55,y-h*.84,h*.5,h*.26);
  }
}

/** Tile-shaped seasonal ground; the crop material and edge graph use the same footprint. */
export function* paintRiceGround(g: Phaser.GameObjects.Graphics, plan: RicePlan, season: Season, textured=false): Generator<void> {
  g.clear();
  const unit = plan.tileSize / 30.96;
  const stages: Record<RiceStage,number> = {flooded:0,seedlings:0,green:0,ripe:0,stubble:0};
  for (const p of plan.parcels) {
    const stage = riceStage(season,p.seed); stages[stage]++;
    const wet = stage === 'flooded' || stage === 'seedlings';
    if (!textured) {
      const fill = wet ? COLOURS.water : stage === 'stubble' ? COLOURS.mud : stage === 'ripe' ? COLOURS.gold : COLOURS.green;
      // Subpixel overlap closes raster seams; the outer bund covers the same tiny allowance.
      const points = p.corners.map(a => ({x:p.centre.x+(a.x-p.centre.x)*1.006,y:p.centre.y+(a.y-p.centre.y)*1.006}));
      g.fillStyle(fill,1).fillPoints(points,true);
      const sx=4.2*unit, sy=sx*.5/Math.sqrt(3);
      const h=(stage==='stubble'?1:stage==='seedlings'?1.7:2.85)*unit;
      for(let row=Math.ceil((p.centre.y-plan.tileSize)/sy);row*sy<p.centre.y+plan.tileSize;row++) {
        for(let col=Math.ceil((p.centre.x-plan.tileSize)/sx);col*sx<p.centre.x+plan.tileSize;col++) {
          const at={x:col*sx+(row%2)*sx*.5,y:row*sy};
          if(!pointInRice(p,{x:at.x-h,y:at.y-h*1.3}) || !pointInRice(p,{x:at.x+h,y:at.y+unit}))continue;
          if(stage==='flooded') {
            if((row+col)%5!==0)continue;
            g.lineStyle(.5*unit,COLOURS.waterInk,.6).lineBetween(at.x-h,at.y,at.x+h,at.y);
            g.lineStyle(.5*unit,PIGMENT.diepHi,.7).lineBetween(at.x,at.y+unit,at.x+h,at.y+unit);
          } else crop(g,at,h,stage);
        }
      }
    }
    yield;
  }
  const edges=riceEdges(plan),mode=riceBorderMode();
  const bunds=edges.filter(e=>e.uses===1 || mode==='tiles');
  for(const {a,b,uses} of bunds) {
    // The bund as a walked dirt path, not a ruled border: the map's own road recipe — a quiet soot
    // edge under an ochre earth plate, both wobbling with the same seed — narrower than a road, with
    // a worn rut down its middle, pebbles and footprints, and grass tufts growing in along its verges.
    // The seed comes from the edge's own endpoints, so every season repaints the identical path.
    const seed = Math.abs(Math.round(a.x * 7 + a.y * 13 + b.x * 3 + b.y * 5));
    const rand = mulberry32(seed);
    const width = (uses===1 ? 1.9 : 1.2) * unit;
    const wobble = .45 * unit, step = 5 * unit;
    const line = [a, b];
    // Same pairing, edge-over-plate alpha and wobble as a road, only narrower.
    inkPath(g, line, seed, { width: width + 1 * unit, alpha: .62, colour: DIRT_EDGE, wobble, step, bleed: .1 });
    inkPath(g, line, seed, { width, alpha: .96, colour: DIRT, wobble, step, bleed: .1 });
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length, ny = dx / length;
    // A broken rut where feet and buffalo wear the crest down.
    for (let t = rand() * .2; t < .9; t += .22 + rand() * .18) {
      const u = Math.min(1, t + .08 + rand() * .08);
      g.lineStyle(.34 * unit, DIRT_WORN, .4)
        .lineBetween(a.x + dx * t, a.y + dy * t, a.x + dx * u, a.y + dy * u);
    }
    // Pebbles and trodden marks on the path.
    const marks = Math.max(1, Math.round(length / (5 * unit)));
    for (let k = 0; k < marks; k++) {
      const t = rand(), off = (rand() - .5) * width * .7;
      g.fillStyle(PIGMENT.mucFaint, .35)
        .fillCircle(a.x + dx * t + nx * off, a.y + dy * t + ny * off, (.22 + rand() * .2) * unit);
    }
    // Grass growing in at both verges.
    const tufts = Math.max(1, Math.round(length / (7 * unit)));
    for (let k = 0; k < tufts; k++) {
      const t = rand(), side = rand() < .5 ? -1 : 1;
      const x = a.x + dx * t + nx * side * (width * .55), y = a.y + dy * t + ny * side * (width * .55);
      const h = (.9 + rand() * .7) * unit;
      g.lineStyle(.28 * unit, rand() < .5 ? COLOURS.leaf : COLOURS.green, .8)
        .lineBetween(x, y, x - h * .35, y - h).lineBetween(x, y, x + h * .1, y - h * 1.15).lineBetween(x, y, x + h * .45, y - h * .8);
    }
    yield;
  }
  g.setData('riceGround',{season,parcels:plan.parcels.length,districts:new Set(plan.parcels.map(p=>p.district)).size,
    eligibleCells:plan.eligibleCells,area:plan.parcels.reduce((sum,p)=>sum+p.area,0),stages,
    sharedEdges:edges.filter(e=>e.uses===2).length,perimeterEdges:edges.filter(e=>e.uses===1).length,
    drawnBunds:bunds.length,borderMode:mode,textured,style:'rice-clumps-v5',bundStyle:'dirt-path'});
}
