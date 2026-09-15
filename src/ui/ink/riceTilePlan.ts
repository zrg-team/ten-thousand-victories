import { EDGE_DIRECTIONS, hexCorners } from '../../map/hex';
import type { LandscapeContext } from '../MapRenderer';
import { riceTouchesCircle, type RiceParcel, type RicePlan } from './riceGround';

const keyOf = (q: number, r: number): string => `${q},${r}`;

/** Cultivation replaces complete terrain cells; no inset field objects or separate survey grid. */
export function planRiceTiles(ctx: LandscapeContext): RicePlan {
  const fields = ctx.tiles.filter(t => t.terrain === 'fields' || t.terrain === 'riceFields');
  const plan: RicePlan = { parcels: [], tileSize: ctx.tileSize, eligibleCells: fields.length };
  const anchors = ctx.cultivationAnchors ?? ctx.settlementAnchors;
  const candidates = new Map<string, RiceParcel>();
  const source = new Map(fields.map(t => [keyOf(t.coord.q, t.coord.r), t]));
  const area = ctx.tileSize ** 2 * 3 * Math.sqrt(3) / 2;
  for (const tile of fields) {
    const { q, r } = tile.coord;
    const centre = ctx.centreOf(tile);
    const parcel: RiceParcel = {
      id: keyOf(q, r), district: '', seed: 0, centre, area,
      corners: hexCorners(centre, ctx.tileSize).map(([x, y]) => ({ x, y })),
    };
    // A whole tile remains dry when the settlement needs it. Never crop a rectangle out of it.
    if (anchors.some(a => riceTouchesCircle(parcel, a, (a.r ?? ctx.tileSize * 1.2) + 2))) continue;
    candidates.set(parcel.id, parcel);
  }

  const seen = new Set<string>();
  const groups: RiceParcel[][] = [];
  for (const first of candidates.values()) {
    if (seen.has(first.id)) continue;
    const group = [first]; seen.add(first.id);
    for (let i = 0; i < group.length; i++) {
      const [q, r] = group[i].id.split(',').map(Number);
      for (const d of EDGE_DIRECTIONS) {
        const key = keyOf(q + d.q, r + d.r), next = candidates.get(key);
        if (next && !seen.has(key)) { seen.add(key); group.push(next); }
      }
    }
    // Solitary field marks stay ordinary ground. Larger connected agricultural areas carry rice.
    if (group.length >= 2) groups.push(group);
  }
  groups.sort((a, b) => b.length - a.length || a[0].id.localeCompare(b[0].id));
  for (const group of groups.slice(0, 8)) {
    const district = [...group].sort((a, b) => a.id.localeCompare(b.id))[0].id;
    const [q, r] = district.split(',').map(Number);
    // The district grows together; a hex boundary must not restart the material or its season.
    const seed = (q * 7919 + r * 104729) >>> 0;
    for (const p of group) {
      p.district = district;
      p.seed = seed;
      if (ctx.isVisible(source.get(p.id)!)) plan.parcels.push(p);
    }
  }
  return plan;
}
