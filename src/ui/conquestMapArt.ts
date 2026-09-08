import type Phaser from 'phaser';
import atlasPages from './conquestAtlasPages.json';
import { maxTextureSize } from './ink/textureLimits';
const authoredPages: Record<string, { page: string; frame: string; width: number; height: number; family: string; image: string; atlas: string }> = atlasPages;
import type { ArmyWardrobe } from '../state/types';
import type { Stamp, StampBox } from './ink/stamp';
import dongHoV4Assets from './conquestDongHoV4Assets.json';
import dongHoV4Walks from './conquestDongHoV4Walks.json';
import travelerVariants from './conquestTravelerVariants.json';

// One registry serves map, battlefield and History. Only reviewed redraws are listed here;
// missing wardrobes keep their own historical silhouettes until their redraw is ready.
const reviewedDongHoPaths: Readonly<Record<string, string>> = dongHoV4Assets;

export type ConquestArtFamily =
  | 'flora' | 'settlements' | 'buildings' | 'terrain' | 'life' | 'markers' | 'figures';
export type ConquestArtSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type ConquestArtProjection =
  | 'isometric-30' | 'front-orthographic-30' | 'character-facing' | 'flat-overlay';
export type ConquestArtCamera =
  | 'southwest-dimetric-30' | 'front-centered-elevation-30' | 'character-facing' | 'screen-space';

export type ConquestArtScaleClass =
  | 'small-prop' | 'house' | 'civic-building' | 'tower' | 'industry'
  | 'rural-settlement' | 'village' | 'town' | 'citadel';

/**
 * A semantic world-size contract for authored art.
 *
 * Fitting every PNG into the same rectangle made a shallow farmstead larger than a tall citadel:
 * the transparent crop and aspect ratio, rather than the depicted architecture, chose the scale.
 * A reviewed asset now states how tall it is on the map. The source aspect ratio still decides its
 * width, and `maxWorldWidth` is only a safety rail for unusually wide masters.
 */
export interface ConquestArtScaleContract {
  class: ConquestArtScaleClass;
  worldHeight: number;
  maxWorldWidth?: number;
}

export interface ConquestArtAsset {
  id: string;
  family: ConquestArtFamily;
  /** Path below `public/`; omitted when the procedural fallback won review. */
  path?: string;
  textureKey?: string;
  /** Normalised authored-image anchor. World props use bottom-centre foot contact. */
  anchor: Readonly<{ x: number; y: number }>;
  /** Intended footprint around the world anchor, in design units. */
  designBounds: Readonly<StampBox>;
  runtimeScale: number;
  /** Fixed semantic display size for structures; dynamic terrain continues to fit caller geometry. */
  scaleContract?: Readonly<ConquestArtScaleContract>;
  projection: ConquestArtProjection;
  /** Camera contract used to author world-space sprites; prevents mixed frontal/isometric art. */
  cameraView: ConquestArtCamera;
  /** Buildings/settlements contain no baked people or tile surfaces. */
  contentPolicy?: 'structure-only-transparent';
  bakedPeople?: false;
  bakedTerrain?: false;
  /** Character sheets are authored facing viewer-right; opposing hosts mirror at runtime. */
  nativeFacing?: -1 | 1;
  season?: ConquestArtSeason;
  state?: string;
  theme?: ArmyWardrobe | string;
  proceduralFallback: string;
  accepted: boolean;
}

const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
const flora = ['tree', 'grass', 'bamboo', 'banana', 'areca', 'banyan'] as const;
const authoredTreeVariants = ['tree-jackfruit', 'tree-lychee', 'tree-pomelo', 'tree-silk-cotton'] as const;
const authoredKarstVariants = [
  'karst-classic', 'karst-three-spire', 'karst-seven-spire', 'karst-stepped', 'karst-tower',
] as const;
const settlements = [
  'hamlet', 'village', 'market-town', 'shrine-village', 'farmstead', 'mine-camp',
  'citadel-dinh', 'citadel-ly', 'citadel-tran', 'citadel-le', 'citadel-nguyen',
] as const;
const buildings = [
  'thatched-house', 'tiled-house', 'communal-hall', 'pagoda-tower', 'swept-yard', 'village-pond',
  'bamboo-hedge', 'kitchen', 'buffalo-byre', 'grain-bin', 'well', 'haystack',
  'mine-bank', 'mine-adit', 'mine-timbers', 'spoil-heap', 'baskets', 'mine-worker',
  'improvement-farm', 'improvement-mine', 'improvement-market', 'improvement-wall',
  'improvement-tower', 'improvement-barracks', 'improvement-communal-hall',
  'improvement-harbor', 'improvement-workshop', 'improvement-guild', 'improvement-university',
] as const;
const terrain = [
  'diep-paper', 'plains', 'dry-fields', 'forest-floor', 'fortress-ground', 'shrine-ground',
  'paddy-flooded', 'paddy-fallow', 'paddy-transplanted', 'paddy-ripe', 'paddy-nursery',
  'paddy-system-flooded', 'paddy-system-fallow', 'paddy-system-transplanted',
  'paddy-system-ripe', 'paddy-system-nursery',
  'water-surface', 'shoreline-brush', 'water-flow', 'karst-range', 'soft-ridge', 'road-brush',
  'town-lane', 'timber-bridge', 'fog-cloud', 'distant-haze', 'winter-mist', 'spring-blossom',
] as const;
const life = [
  'farmer', 'traveler', 'buffalo', 'buffalo-rider', 'calf', 'ox-cart', 'egret-up', 'egret-down',
  'spring-petal', 'autumn-leaf', 'winter-snow',
] as const;
const markers = [
  'flag-yellow-seal', 'flag-red-moon', 'flag-layered-square', 'flag-red-fringe-yellow',
  'flag-yellow-medallion', 'flag-ngu-sac', 'rival-flag-yellow-seal', 'rival-flag-red-moon',
  'rival-flag-layered-square', 'rival-flag-red-fringe-yellow', 'rival-flag-yellow-medallion',
  'rival-flag-ngu-sac', 'capital-standard', 'destination-standard', 'selection-seal',
  'capital-highlight', 'acquisition', 'build', 'recruit', 'siege', 'battle', 'march-dust',
  'route-brush',
] as const;
const themes: readonly ArmyWardrobe[] = [
  'dinh', 'ly', 'tran', 'le', 'trinh', 'nguyenLord', 'tayson', 'nguyen',
  'song', 'yuan', 'ming', 'qing', 'champa',
];
const tiers = ['levy', 'trained', 'royal'] as const;
// The game has two ranged composition slots for backwards compatibility. Both deliberately use
// the single reviewed third-column ranged pose from the four-visual army contract.
const arms = ['spear', 'sword', 'skirmish', 'bow', 'mounted'] as const;
const rejectedTerrain = new Set<(typeof terrain)[number]>([
  'diep-paper', 'plains', 'dry-fields', 'forest-floor', 'fortress-ground', 'shrine-ground',
  // The single rectangular plates read as loose UI tiles at wide zoom.  They remain in review,
  // but the connected shared-bund field systems below are the accepted runtime family.
  'paddy-flooded', 'paddy-fallow', 'paddy-transplanted', 'paddy-ripe', 'paddy-nursery',
  'water-surface', 'shoreline-brush', 'water-flow', 'road-brush', 'town-lane',
  'fog-cloud', 'distant-haze', 'winter-mist', 'spring-blossom',
]);
const rejectedBuildings = new Set<(typeof buildings)[number]>(['mine-worker']);

const foot = { left: -16, right: 16, top: -48, bottom: 4 } as const;
// A pony is wider and the rider taller than the foot box. Keeping foot-sized metadata here hid
// the extraction mistake: the source PNG had already lost everything outside its nominal cell.
const mounted = { left: -28, right: 34, top: -79, bottom: 5 } as const;
const settlementBounds = { left: -90, right: 90, top: -76, bottom: 24 } as const;
const buildingBounds = { left: -28, right: 28, top: -46, bottom: 6 } as const;
const terrainBounds = { left: -48, right: 48, top: -42, bottom: 42 } as const;
const markerBounds = { left: -18, right: 18, top: -42, bottom: 5 } as const;

function acceptedAsset(
  id: string,
  family: ConquestArtFamily,
  designBounds: StampBox,
  extra: Partial<Pick<
    ConquestArtAsset,
    'season' | 'state' | 'theme' | 'runtimeScale' | 'scaleContract' | 'anchor' | 'projection'
  >> = {},
  accepted = true,
): ConquestArtAsset {
  return {
    id,
    family,
    path: accepted ? reviewedDongHoPaths[id] ?? `art/conquest-dongho/${id.replaceAll('.', '/')}.png` : undefined,
    textureKey: accepted ? `conquest-art:${id}` : undefined,
    anchor: extra.anchor ?? { x: 0.5, y: family === 'terrain' ? 0.5 : 0.96 },
    designBounds,
    runtimeScale: extra.runtimeScale ?? 1,
    scaleContract: extra.scaleContract,
    projection: extra.projection ?? 'flat-overlay',
    cameraView: (extra.projection ?? 'flat-overlay') === 'front-orthographic-30'
      ? 'front-centered-elevation-30'
      : (extra.projection ?? 'flat-overlay') === 'isometric-30'
        ? 'southwest-dimetric-30'
        : (extra.projection ?? 'flat-overlay') === 'character-facing'
          ? 'character-facing'
          : 'screen-space',
    contentPolicy: family === 'settlements' || family === 'buildings'
      ? 'structure-only-transparent'
      : undefined,
    bakedPeople: family === 'settlements' || family === 'buildings' ? false : undefined,
    bakedTerrain: family === 'settlements' || family === 'buildings' ? false : undefined,
    nativeFacing: family === 'figures' ? 1 : undefined,
    season: extra.season,
    state: extra.state,
    theme: extra.theme,
    proceduralFallback: accepted
      ? `current procedural ${family} renderer when missing, corrupt, unloaded, or overridden`
      : 'current procedural renderer (generated review limit exhausted)',
    accepted,
  };
}

const floraBounds: Record<(typeof flora)[number], StampBox> = {
  tree: { left: -13, right: 13, top: -25, bottom: 3 },
  grass: { left: -3, right: 3, top: -3, bottom: 1 },
  bamboo: { left: -11, right: 11, top: -25, bottom: 3 },
  banana: { left: -8, right: 8, top: -13, bottom: 2 },
  areca: { left: -7, right: 7, top: -31, bottom: 3 },
  banyan: { left: -25, right: 25, top: -43, bottom: 4 },
};

const lifeBounds: Record<(typeof life)[number], StampBox> = {
  farmer: { left: -6, right: 6, top: -12, bottom: 2 },
  traveler: { left: -10, right: 10, top: -31, bottom: 4 },
  buffalo: { left: -23, right: 23, top: -25, bottom: 5 },
  'buffalo-rider': { left: -24, right: 24, top: -34, bottom: 5 },
  calf: { left: -14, right: 14, top: -17, bottom: 4 },
  'ox-cart': { left: -29, right: 29, top: -29, bottom: 6 },
  'egret-up': { left: -15, right: 15, top: -10, bottom: 10 },
  'egret-down': { left: -15, right: 15, top: -10, bottom: 10 },
  'spring-petal': { left: -4, right: 4, top: -4, bottom: 4 },
  'autumn-leaf': { left: -4, right: 4, top: -4, bottom: 4 },
  'winter-snow': { left: -4, right: 4, top: -4, bottom: 4 },
};

const floraRuntimeScale: Record<(typeof flora)[number], number> = {
  // Every number below was re-measured off a rendered map once sizing followed the ink rather
  // than the cell (`inkExtent`); the old values were compensating for padding that is now gone.
  tree: 0.896,
  grass: 0.72,
  bamboo: 0.826,
  banana: 0.79,
  areca: 0.92,
  banyan: 0.94,
};

const BUILDING_SCALE: Record<(typeof buildings)[number], ConquestArtScaleContract> = {
  'thatched-house': { class: 'house', worldHeight: 15 },
  'tiled-house': { class: 'house', worldHeight: 15 },
  'communal-hall': { class: 'civic-building', worldHeight: 18 },
  'pagoda-tower': { class: 'tower', worldHeight: 36, maxWorldWidth: 20 },
  'swept-yard': { class: 'small-prop', worldHeight: 7 },
  'village-pond': { class: 'small-prop', worldHeight: 8 },
  'bamboo-hedge': { class: 'small-prop', worldHeight: 9 },
  kitchen: { class: 'house', worldHeight: 13 },
  'buffalo-byre': { class: 'house', worldHeight: 12 },
  'grain-bin': { class: 'small-prop', worldHeight: 13, maxWorldWidth: 13 },
  well: { class: 'small-prop', worldHeight: 9, maxWorldWidth: 10 },
  haystack: { class: 'small-prop', worldHeight: 8, maxWorldWidth: 10 },
  'mine-bank': { class: 'industry', worldHeight: 14 },
  'mine-adit': { class: 'industry', worldHeight: 14 },
  'mine-timbers': { class: 'industry', worldHeight: 12 },
  'spoil-heap': { class: 'small-prop', worldHeight: 7 },
  baskets: { class: 'small-prop', worldHeight: 6 },
  'mine-worker': { class: 'small-prop', worldHeight: 10 },
  'improvement-farm': { class: 'industry', worldHeight: 12 },
  'improvement-mine': { class: 'industry', worldHeight: 16 },
  'improvement-market': { class: 'civic-building', worldHeight: 13 },
  // A completed wall is fitted around its settlement by the caller. This value is the standalone
  // fallback size used by galleries and any future non-enclosure placement.
  'improvement-wall': { class: 'civic-building', worldHeight: 16 },
  'improvement-tower': { class: 'tower', worldHeight: 22, maxWorldWidth: 16 },
  'improvement-barracks': { class: 'civic-building', worldHeight: 14 },
  'improvement-communal-hall': { class: 'civic-building', worldHeight: 17 },
  'improvement-harbor': { class: 'industry', worldHeight: 17 },
  'improvement-workshop': { class: 'industry', worldHeight: 15 },
  'improvement-guild': { class: 'civic-building', worldHeight: 17 },
  'improvement-university': { class: 'civic-building', worldHeight: 17 },
};

/**
 * Reviewed against the v4 roofs and the standalone 15-unit house. A larger settlement adds
 * buildings and courtyard depth; it must not turn each roof into a much larger building.
 * Capitals sit just above the town band, with walls and halls carrying their importance.
 * Width limits also keep shallow composites from sprawling across neighbouring map features.
 */
const SETTLEMENT_SCALE: Record<(typeof settlements)[number], ConquestArtScaleContract> = {
  hamlet: { class: 'rural-settlement', worldHeight: 32, maxWorldWidth: 56 },
  village: { class: 'village', worldHeight: 38, maxWorldWidth: 60 },
  'market-town': { class: 'town', worldHeight: 40, maxWorldWidth: 62 },
  'shrine-village': { class: 'town', worldHeight: 44, maxWorldWidth: 64 },
  farmstead: { class: 'rural-settlement', worldHeight: 28, maxWorldWidth: 56 },
  'mine-camp': { class: 'rural-settlement', worldHeight: 32, maxWorldWidth: 56 },
  // Wide, low palace compounds must not grow just to fill a height target.
  'citadel-dinh': { class: 'citadel', worldHeight: 50, maxWorldWidth: 64 },
  'citadel-ly': { class: 'citadel', worldHeight: 52, maxWorldWidth: 64 },
  'citadel-tran': { class: 'citadel', worldHeight: 52, maxWorldWidth: 64 },
  'citadel-le': { class: 'citadel', worldHeight: 52, maxWorldWidth: 64 },
  'citadel-nguyen': { class: 'citadel', worldHeight: 52, maxWorldWidth: 64 },
};

const lifeRuntimeScale: Record<(typeof life)[number], number> = {
  farmer: 0.82,
  // 0.323. The number has come off the map twice.
  //
  // It was 0.42, which drew a walking traveller at 1.64x a soldier against a contract that gives
  // every person on the ground one rate; cutting it to 0.256 fixed the median but was really
  // cancelling a hardcoded 1.5x that only the *road* call site applied — so villages and roads
  // still drew the same asset 1.9x apart. With that multiplier gone and both paths stamping from
  // these bounds, the compensation has to go too: 0.256 left the traveller 21% short of the
  // soldier walking beside him.
  traveler: 0.323,
  // 0.76: the walked buffalo measured 1.18x the living rate.
  buffalo: 0.76,
  'buffalo-rider': 0.88,
  calf: 0.72,
  // 0.54: the walked rig measured 1.29x.
  'ox-cart': 0.54,
  'egret-up': 0.90,
  'egret-down': 0.90,
  'spring-petal': 0.55,
  'autumn-leaf': 0.55,
  'winter-snow': 0.55,
};

function markerRuntimeScale(state: (typeof markers)[number]): number {
  if (state === 'selection-seal' || state === 'capital-highlight') return 0.85;
  if (['acquisition', 'build', 'recruit', 'siege', 'battle', 'march-dust', 'route-brush'].includes(state)) {
    return 0.68;
  }
  return 0.72;
}

export const CONQUEST_MAP_ART: readonly ConquestArtAsset[] = [
  ...seasons.flatMap((season) => flora.map((plant) => acceptedAsset(
    `flora.${plant}.${season}`, 'flora', floraBounds[plant], {
      season, runtimeScale: floraRuntimeScale[plant], projection: 'isometric-30',
    },
  ))),
  ...seasons.flatMap((season) => authoredTreeVariants.map((variant) => acceptedAsset(
    `flora.${variant}.${season}`, 'flora', floraBounds.tree, {
      season, state: variant, runtimeScale: floraRuntimeScale.tree, projection: 'isometric-30',
    },
  ))),
  ...settlements.map((state) => acceptedAsset(
    `settlement.${state}`, 'settlements', settlementBounds,
    {
      state,
      theme: state.startsWith('citadel-') ? state.slice('citadel-'.length) : undefined,
      scaleContract: SETTLEMENT_SCALE[state],
      projection: 'front-orthographic-30',
    },
  )),
  ...buildings.map((state) => acceptedAsset(`building.${state}`, 'buildings', buildingBounds, {
    state, scaleContract: BUILDING_SCALE[state], projection: 'front-orthographic-30',
  }, !rejectedBuildings.has(state))),
  ...terrain.map((state) => acceptedAsset(`terrain.${state}`, 'terrain', terrainBounds, {
    state,
    anchor: { x: 0.5, y: 0.5 },
    projection: state.startsWith('paddy-') || state === 'timber-bridge'
      ? 'front-orthographic-30'
      : 'isometric-30',
  }, !rejectedTerrain.has(state))),
  ...authoredKarstVariants.map((state) => acceptedAsset(`terrain.${state}`, 'terrain', terrainBounds, {
    state, anchor: { x: 0.5, y: 0.96 }, projection: 'isometric-30',
  })),
  ...life.map((state) => acceptedAsset(`life.${state}`, 'life', lifeBounds[state], {
    state,
    runtimeScale: lifeRuntimeScale[state],
    // Egrets cross the sky rather than stand on the ground. Both wing frames share a centred
    // transparent canvas, so a centred anchor keeps the body level throughout the wingbeat.
    anchor: state.startsWith('egret-') ? { x: 0.5, y: 0.5 } : undefined,
    projection: state.endsWith('petal') || state.endsWith('leaf') || state.endsWith('snow')
      ? 'flat-overlay'
      : 'character-facing',
  })),
  ...markers.map((state) => acceptedAsset(`marker.${state}`, 'markers', markerBounds, {
    state, runtimeScale: markerRuntimeScale(state), projection: 'flat-overlay',
  })),
  ...Object.entries(travelerVariants).map(([id, variant]) => ({
    ...acceptedAsset(id, 'life', lifeBounds.traveler, {
      state: id.replace('life.', ''), runtimeScale: lifeRuntimeScale.traveler,
      projection: 'character-facing',
    }),
    path: variant.stillPath,
  })),
  ...themes.flatMap((theme) => tiers.flatMap((tier) => arms.map((arm) => acceptedAsset(
    `figure.${theme}.${tier}.${arm}`, 'figures', arm === 'mounted' ? mounted : foot,
    {
      state: `${tier}.${arm}`, theme, projection: 'character-facing',
      // Mounted sprites use a 432-unit normalization board instead of the nominal 384-unit cell
      // so the full pony fits. This reciprocal compensation preserves rider/body height.
      // Halved against the old cell-fitted numbers because a figure's box is a *reach* box — a
      // raised spear tops out near 60 above the feet — while the PNG's ink is the whole drawing,
      // spear included. Fitting ink to reach made every soldier 1.76x the rate the farmer beside
      // him stands at; measured on a map with hosts on it, and corrected by that factor.
      runtimeScale: arm === 'mounted' ? 0.754 : 0.856,
    },
  )))),
] as const;

const TREE_ART_IDS = ['tree', ...authoredTreeVariants] as const;

/** Five reviewed silhouettes, selected from the fixed scatter seed so repainting never replants. */
export function conquestTreeArtId(season: ConquestArtSeason, seed: number): string {
  const index = Math.abs(Math.trunc(seed)) % TREE_ART_IDS.length;
  return `flora.${TREE_ART_IDS[index]}.${season}`;
}

/** Five normalized limestone silhouettes; all share a 240×160 bottom-centred runtime canvas. */
export function conquestKarstArtId(seed: number): string {
  const index = Math.abs(Math.trunc(seed)) % authoredKarstVariants.length;
  return `terrain.${authoredKarstVariants[index]}`;
}

const byId = new Map(CONQUEST_MAP_ART.map((asset) => [asset.id, asset] as const));

/**
 * Reviewed 2x2 walk sheets for the authored living-map subjects that visibly travel.
 *
 * The still PNGs remain the source/fallback. Each sheet has four equal 627px cells and was audited
 * for real alpha and four distinct poses. `contentHeight`, `baselines`, and optional torso
 * `anchorsX` come from the opaque-pixel audit so changing frames does not make the subject jump
 * merely because ImageGen placed one pose differently inside its cell.
 */
export interface ConquestWalkSheet {
  kind: 'person' | 'buffalo' | 'cart';
  sourceTextureKey: string;
  textureKey: string;
  path: string;
  frameWidth: 627;
  frameHeight: 627;
  contentHeight: number;
  baselines: readonly [number, number, number, number];
  anchorsX?: readonly [number, number, number, number];
  /** Real-world height, in metres, that the sprite's drawn ink height stands for. */
  subjectMetres: number;
  /** Ground distance, in metres, that the four poses together cover — one full gait cycle. */
  cycleMetres: number;
}

/**
 * World distance between pose changes for a walker drawn `visibleHeight` pixels tall.
 *
 * The gait used to be a hand-tuned constant per sheet, which is a number with no way to be right:
 * it silently encodes a drawn size, so any change to the art scale desynchronises the legs from
 * the ground. Measured on the road, the traveller's 0.45 came out at **0.083 m per pose** against
 * a real 0.35 — the legs cycled about four and a half times faster than the ground it covered,
 * which is exactly the sewing-machine trot a player reads as "too fast".
 *
 * Deriving it from the sprite's own drawn height instead makes the cadence a consequence of the
 * scale contract rather than a second opinion about it.
 */
export function walkStrideFor(sheet: ConquestWalkSheet, visibleHeight: number): number {
  const pixelsPerMetre = Math.max(0.001, visibleHeight) / sheet.subjectMetres;
  return (sheet.cycleMetres / 4) * pixelsPerMetre;
}

const originalWalkSheets: readonly ConquestWalkSheet[] = [
  {
    kind: 'person',
    sourceTextureKey: 'conquest-art:life.farmer',
    textureKey: 'conquest-art:life.farmer-walk',
    path: 'art/conquest-dongho/life/farmer-walk.png',
    frameWidth: 627,
    frameHeight: 627,
    contentHeight: 579,
    baselines: [589, 590, 595, 594],
    subjectMetres: 1.62,
    cycleMetres: 1.35,
  },
  {
    kind: 'person',
    sourceTextureKey: 'conquest-art:life.traveler',
    textureKey: 'conquest-art:life.traveler-walk',
    path: 'art/conquest-dongho/life/traveler-walk.png',
    frameWidth: 627,
    frameHeight: 627,
    contentHeight: 549,
    // Contact A, rear-foot lift, contact B, front-foot lift. The two passing
    // frames deliberately plant opposite feet; otherwise the tiny map figure
    // reads as the same leg pose sliding along the road.
    baselines: [569, 575, 553, 559],
    // Median torso centres, not whole-silhouette centres. The pole, bag, and
    // changing feet make the four cell bounds differ by over 60 source pixels;
    // a shared 313.5px origin turned that into visible left/right jitter.
    anchorsX: [347, 284, 358, 288],
    subjectMetres: 1.68,
    // A shade longer than the farmer's: someone crossing provinces walks out, someone working a
    // field shuffles between rows.
    cycleMetres: 1.45,
  },
  {
    kind: 'buffalo',
    sourceTextureKey: 'conquest-art:life.buffalo',
    textureKey: 'conquest-art:life.buffalo-walk',
    path: 'art/conquest-dongho/life/buffalo-walk.png',
    frameWidth: 627,
    frameHeight: 627,
    contentHeight: 350,
    baselines: [515, 514, 488, 488],
    // Drawn height is withers plus head, not shoulder height.
    subjectMetres: 1.55,
    cycleMetres: 1.7,
  },
  {
    kind: 'cart',
    sourceTextureKey: 'conquest-art:life.ox-cart',
    textureKey: 'conquest-art:life.ox-cart-walk',
    path: 'art/conquest-dongho/life/ox-cart-walk.png',
    frameWidth: 627,
    frameHeight: 627,
    contentHeight: 363,
    baselines: [499, 499, 487, 485],
    // The rig's drawn height is the ox and the cart's rail, and the four poses carry both the
    // hooves and the wheel; an ox in draught walks shorter than one at liberty.
    subjectMetres: 1.7,
    cycleMetres: 1.5,
  },
] as const;

const reviewedWalks = dongHoV4Walks as unknown as Readonly<Record<string,
  Pick<ConquestWalkSheet, 'path' | 'frameWidth' | 'frameHeight' | 'contentHeight' | 'baselines' | 'anchorsX'>>>;

/** Select reviewed art and its measured frame anchors together, preserving each role's gait. */
export const CONQUEST_WALK_SHEETS: readonly ConquestWalkSheet[] = [
  ...originalWalkSheets.map(sheet => ({
    ...sheet,
    ...reviewedWalks[sheet.textureKey.replace('conquest-art:', '')],
  })),
  ...Object.entries(travelerVariants).map(([id, variant]): ConquestWalkSheet => ({
    kind: 'person', sourceTextureKey: `conquest-art:${id}`,
    textureKey: `conquest-art:${id}-walk`, path: variant.path,
    frameWidth: 627, frameHeight: 627, contentHeight: variant.contentHeight,
    baselines: variant.baselines as [number, number, number, number],
    anchorsX: variant.anchorsX as [number, number, number, number],
    subjectMetres: 1.68, cycleMetres: 1.45,
  })),
];

const walkSheetBySourceTexture = new Map(
  CONQUEST_WALK_SHEETS.map((sheet) => [sheet.sourceTextureKey, sheet] as const),
);

export function conquestWalkSheetForTexture(textureKey: string, frame?: string | number): ConquestWalkSheet | undefined {
  return walkSheetBySourceTexture.get(typeof frame === 'string' && frame.startsWith('conquest-art:') ? frame : textureKey);
}

/**
 * Side of one cell in the reduced sheet a walker is actually drawn from.
 *
 * The authored sheets are 627-pixel cells and a map walker stands about nine world pixels, so the
 * GPU was minifying them **68 to 1** through a plain `LINEAR` filter with no mipmaps. Four texels
 * out of a 68x68 footprint is not a sample of the pose, it is four arbitrary points inside it, and
 * two things follow. The figure spreads: measured against the reduced sheet at the same drawn size,
 * the same traveller laid down **228 units of ink instead of 120** — a smear across nearly twice
 * his own area rather than a person with legs. And at the edges of a 2x2 sheet the sampler
 * straddles the cell boundary, so a drawn pixel of pose 0 blends in pose 1. That is "sometimes it
 * overlaps multiple frames", and it was the sampling, never the pose cycle.
 *
 * 64 keeps a cell at or above the size it is ever drawn at (nine world pixels at zoom 2 on a DPR-3
 * panel is about 55 device pixels), so minification is gentle and the browser's own canvas
 * resampling — a proper box filter, unlike the GPU's four-tap — does the reduction once at load.
 */
const WALK_CELL = 64;

/** Reduced-sheet key for a walk sheet, and the frames laid out in one row so no cell can bleed. */
export function conquestWalkSheetSmallKey(sheet: ConquestWalkSheet): string {
  return `${sheet.textureKey}:x${WALK_CELL}`;
}

/**
 * Builds the reduced sheet once per walk sheet, if it is not there already.
 *
 * Laid out as one row of four rather than the source's 2x2, because a row means every cell has a
 * transparent neighbour above and below it — nothing to bleed in even if a future filter change
 * starts sampling wider.
 */
export function ensureConquestWalkSheetSmall(
  scene: Phaser.Scene,
  sheet: ConquestWalkSheet,
): string | undefined {
  const key = conquestWalkSheetSmallKey(sheet);
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(sheet.textureKey)) return undefined;
  try {
    const source = scene.textures.get(sheet.textureKey).getSourceImage() as CanvasImageSource;
    const canvas = document.createElement('canvas');
    canvas.width = WALK_CELL * 4;
    canvas.height = WALK_CELL;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (let i = 0; i < 4; i += 1) {
      ctx.drawImage(
        source,
        (i % 2) * sheet.frameWidth, Math.floor(i / 2) * sheet.frameHeight,
        sheet.frameWidth, sheet.frameHeight,
        i * WALK_CELL, 0, WALK_CELL, WALK_CELL,
      );
    }
    scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, {
      frameWidth: WALK_CELL, frameHeight: WALK_CELL, endFrame: 3,
    });
    return key;
  } catch {
    return undefined;
  }
}

/** How many source pixels one reduced cell stands for, so baselines carry across unchanged. */
export const WALK_CELL_SIZE = WALK_CELL;

export function conquestArtAsset(id: string): ConquestArtAsset | undefined {
  return byId.get(id);
}

/** `?mapart=procedural` is the baseline and emergency rollback switch. */
export function proceduralConquestArtForced(): boolean {
  try {
    const query = new URLSearchParams(window.location.search).get('mapart');
    if (query) return query === 'procedural';
    return localStorage.getItem('mandate:conquest-map-art:v1') === 'procedural';
  } catch {
    return false;
  }
}

export function preloadConquestMapArt(scene: Phaser.Scene, baseUrl: string, families?: readonly ConquestArtFamily[], walks = true): void {
  if (proceduralConquestArtForced()) return;
  const assets = CONQUEST_MAP_ART.filter(asset => asset.accepted && asset.path && asset.textureKey && (!families || families.includes(asset.family)));
  const pages = new Set<string>();
  for (const asset of assets) {
    const page = authoredPages[asset.textureKey!];
    if (page && maxTextureSize(scene) >= 2048 && !new URLSearchParams(location.search).has('noartatlas')) {
      if (pages.has(page.page) || scene.textures.exists(page.page)) continue;
      pages.add(page.page);
      scene.load.atlas(page.page, `${baseUrl}${page.image}`, `${baseUrl}${page.atlas}`);
    } else if (!scene.textures.exists(asset.textureKey!)) scene.load.image(asset.textureKey!, `${baseUrl}${asset.path}`);
  }
  // A failed atlas has the same original-image fallback as a device with a small texture limit.
  const failed = (file: { key: string }) => {
    if (!pages.delete(file.key)) return;
    for (const asset of assets) if (authoredPages[asset.textureKey!]?.page === file.key && !scene.textures.exists(asset.textureKey!)) {
      scene.load.image(asset.textureKey!, `${baseUrl}${asset.path}`);
    }
  };
  if (pages.size > 0) scene.load.on('loaderror', failed);
  // Phaser emits loaderror for transport failures, but an HTTP 200 image that cannot
  // decode goes directly through File.onProcessError. Queue the same originals
  // before that path completes the loader, so scene.create still waits for them.
  for (const file of scene.load.list) if (pages.has(file.key)) {
    const processError = file.onProcessError;
    file.onProcessError = function () { failed(this); processError.call(this); };
  }
  if (pages.size > 0) scene.load.once('complete', () => scene.load.off('loaderror', failed));
  if (walks) for (const sheet of CONQUEST_WALK_SHEETS) {
    if (!scene.textures.exists(sheet.textureKey)) scene.load.spritesheet(sheet.textureKey, `${baseUrl}${sheet.path}`, {
      frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight, endFrame: 3,
    });
  }
}

function artTexture(scene: Phaser.Scene, key: string): { key: string; frame?: string; width: number; height: number } | undefined {
  const page = authoredPages[key];
  if (page && scene.textures.exists(page.page) && scene.textures.get(page.page).has(page.frame)) {
    return { key: page.page, frame: page.frame, width: page.width, height: page.height };
  }
  if (!scene.textures.exists(key)) return undefined;
  const source = scene.textures.get(key).getSourceImage() as { width: number; height: number };
  return { key, width: source.width, height: source.height };
}
export function hasConquestMapArt(scene: Phaser.Scene, id: string): boolean {
  const asset = byId.get(id);
  return !proceduralConquestArtForced() && asset?.accepted === true && !!asset.textureKey && !!artTexture(scene, asset.textureKey);
}

export interface ConquestArtDisplayMetrics {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  scale: number;
}

export interface ConquestArtStampOptions {
  /** Bypass a fixed semantic contract for geometry that must fit a caller-owned enclosure. */
  sizing?: 'contract' | 'fit-bounds';
}

/**
 * How much of an authored cell is actually ink, measured once per texture.
 *
 * **This is what a declared height has to be measured against.** Every size in this file — a
 * `scaleContract`'s `worldHeight`, a prop's `designBounds` — is a statement about how tall the
 * *thing* stands. The scale was computed against the PNG's full cell instead, so each asset came
 * out short by however much transparent margin its generator happened to leave, and every asset
 * left a different amount.
 *
 * Measured on a real map: five tree variants that all declare eight metres and share one box came
 * out at **1.20, 1.39, 1.68, 1.81 and 1.86 px per metre** — a 1.55x spread between trees standing
 * in the same field — while the contract for everything on the ground is one rate, 2.23. The
 * living things were worse: a traveller stood **1.58x** a soldier, an ox-cart 1.29x, a buffalo
 * 1.17x, and the still farmer 0.84x. That is the "sizes are inconsistent" a player sees, and it
 * was never a tuning problem — it was measuring the cell instead of the drawing inside it.
 *
 * Read from a downscaled copy: 128 rows is +/-0.8% of the height, far finer than the fault, and it
 * costs a few tenths of a millisecond per texture instead of reading 393,000 pixels.
 */
/** How far past its declared footprint a prop may spread before the width rail pulls it in. */
const WIDTH_RAIL = 1.8;

const inkExtentCache = new Map<string, { x: number; y: number }>();

export function inkExtent(
  scene: Phaser.Scene,
  textureKey: string,
  frameName?: string | number,
): { x: number; y: number } {
  const cacheKey = `${textureKey}|${frameName ?? ''}`;
  const cached = inkExtentCache.get(cacheKey);
  if (cached) return cached;
  // A cell that cannot be read is treated as all ink, which is exactly the old behaviour.
  let extent = { x: 1, y: 1 };
  try {
    const source = scene.textures.get(textureKey).getSourceImage() as CanvasImageSource & {
      width: number; height: number;
    };
    // One frame of a sheet, or the whole image when there is no sheet.
    const frame = frameName === undefined ? undefined : scene.textures.getFrame(textureKey, frameName);
    const cutX = frame ? frame.cutX : 0;
    const cutY = frame ? frame.cutY : 0;
    const cutW = frame ? frame.cutWidth : source.width;
    const cutH = frame ? frame.cutHeight : source.height;
    const SAMPLE = 128;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx && cutW > 0 && cutH > 0) {
      ctx.drawImage(source, cutX, cutY, cutW, cutH, 0, 0, SAMPLE, SAMPLE);
      const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
      let top = -1; let bottom = -1; let left = -1; let right = -1;
      for (let y = 0; y < SAMPLE; y += 1) {
        for (let x = 0; x < SAMPLE; x += 1) {
          if (data[(y * SAMPLE + x) * 4 + 3] <= 16) continue;
          if (top < 0) top = y;
          bottom = y;
          if (left < 0 || x < left) left = x;
          if (x > right) right = x;
        }
      }
      if (top >= 0) {
        extent = {
          x: Math.max(0.05, (right - left + 1) / SAMPLE),
          y: Math.max(0.05, (bottom - top + 1) / SAMPLE),
        };
      }
    }
  } catch {
    extent = { x: 1, y: 1 };
  }
  inkExtentCache.set(cacheKey, extent);
  return extent;
}

const inkFootCache = new Map<string, number>();

/**
 * Where a texture's ink ends, as a fraction of its cell height.
 *
 * The ground band's whole rule is "a thing is in front of another thing when its feet are lower
 * down the sheet" — so the band is only as honest as its idea of where a thing's feet are, and
 * that has to be the drawn ink, not the box the art was fitted into. Measured across a real map,
 * the two disagreed badly and in *both* directions:
 *
 * | asset | ink foot vs the line it sorted on |
 * |---|---|
 * | `terrain.soft-ridge` (half the relief on the map) | 13 units low, up to 20, on art 31 tall |
 * | `terrain.karst-seven-spire` | 9 units high, up to 17 |
 * | every settlement compound | 6 to 7 units high |
 * | every tree, grass and bamboo | 0 — these were always right |
 *
 * A ridge sorting 13 units behind its own feet and a town sorting 6 in front of its own is 19
 * units of error pointing the same way, so a town won against any ridge standing up to a stride
 * in front of it: the house drew over the mountain.
 */
export function inkFoot(
  scene: Phaser.Scene,
  textureKey: string,
  frameName?: string | number,
): number {
  const cacheKey = `${textureKey}|${frameName ?? ''}`;
  const cached = inkFootCache.get(cacheKey);
  if (cached !== undefined) return cached;
  // Unreadable art is treated as filling its cell, which is what the code did before measuring.
  let foot = 1;
  try {
    const source = scene.textures.get(textureKey).getSourceImage() as CanvasImageSource & {
      width: number; height: number;
    };
    const frame = frameName === undefined ? undefined : scene.textures.getFrame(textureKey, frameName);
    const cutX = frame ? frame.cutX : 0;
    const cutY = frame ? frame.cutY : 0;
    const cutW = frame ? frame.cutWidth : source.width;
    const cutH = frame ? frame.cutHeight : source.height;
    const SAMPLE = 128;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx && cutW > 0 && cutH > 0) {
      ctx.drawImage(source, cutX, cutY, cutW, cutH, 0, 0, SAMPLE, SAMPLE);
      const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
      for (let y = SAMPLE - 1; y >= 0; y -= 1) {
        let opaque = false;
        for (let x = 0; x < SAMPLE; x += 1) {
          if (data[(y * SAMPLE + x) * 4 + 3] > 16) { opaque = true; break; }
        }
        if (opaque) { foot = (y + 1) / SAMPLE; break; }
      }
    }
  } catch {
    foot = 1;
  }
  inkFootCache.set(cacheKey, foot);
  return foot;
}

/**
 * The world y at which a placed stamp's ink meets the ground — what it should sort on.
 *
 * Reads the image's own origin and drawn height, so it stays correct however the caller placed or
 * scaled it, and it costs one cached texture measurement per art asset.
 */
export function stampFootY(image: Phaser.GameObjects.Image): number {
  const foot = inkFoot(image.scene, image.texture.key, image.frame?.name);
  return image.y + (foot - image.originY) * image.displayHeight;
}

function displayScale(
  scene: Phaser.Scene,
  asset: ConquestArtAsset,
  source: { width: number; height: number },
  bounds: StampBox,
  options: ConquestArtStampOptions,
): number {
  // The ink, not the cell — see `inkExtent`. Both branches below declare how tall the *thing*
  // stands, so both divide the cell back down to the drawing inside it.
  const texture = asset.textureKey ? artTexture(scene, asset.textureKey) : undefined;
  const ink = texture ? inkExtent(scene, texture.key, texture.frame) : { x: 1, y: 1 };
  const inkHeight = source.height * ink.y;
  const inkWidth = source.width * ink.x;
  const contract = options.sizing === 'fit-bounds' ? undefined : asset.scaleContract;
  if (contract) {
    let scale = contract.worldHeight / inkHeight;
    if (contract.maxWorldWidth !== undefined) {
      scale = Math.min(scale, contract.maxWorldWidth / inkWidth);
    }
    return scale * asset.runtimeScale;
  }
  // **Height governs.** Every declared number in the proportion contract is a height — eight
  // metres of tree, 1.7 of a person — so a wide canopy must not make a tree short. Fitting by
  // `min(width, height)` did exactly that: the five eight-metre tree variants came out at 0.72 to
  // 0.96 of their rate purely according to how broad each one was drawn. Width stays as a rail so
  // a freak master cannot sprawl across the province, but it is a long way out of the way.
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const byHeight = height / inkHeight;
  const widthRail = (width * WIDTH_RAIL) / inkWidth;
  return Math.min(byHeight, widthRail) * asset.runtimeScale;
}

/** Adapts one authored PNG to the existing stamp contract without changing any caller geometry. */
export function conquestArtStamp(
  scene: Phaser.Scene,
  id: string,
  box?: StampBox,
  options: ConquestArtStampOptions = {},
): Stamp | undefined {
  const asset = byId.get(id);
  if (!asset?.textureKey || !hasConquestMapArt(scene, id)) return undefined;
  const source = artTexture(scene, asset.textureKey);
  if (!source?.width || !source?.height) return undefined;
  const bounds = box ?? asset.designBounds;
  const scale = displayScale(scene, asset, source, bounds, options);
  return {
    key: `generated:${id}`,
    texture: source.key,
    frame: source.frame,
    originX: asset.anchor.x,
    originY: asset.anchor.y,
    scale,
    width: source.width,
    height: source.height,
  };
}

/** Exact world rectangle a placed authored image occupies, shared by rendering and collision. */
export function conquestArtDisplayMetrics(
  scene: Phaser.Scene,
  id: string,
  box?: StampBox,
  options: ConquestArtStampOptions = {},
): ConquestArtDisplayMetrics | undefined {
  const asset = byId.get(id);
  const stamp = conquestArtStamp(scene, id, box, options);
  if (!asset || !stamp) return undefined;
  const width = stamp.width * stamp.scale;
  const height = stamp.height * stamp.scale;
  return {
    width,
    height,
    left: -asset.anchor.x * width,
    right: (1 - asset.anchor.x) * width,
    top: -asset.anchor.y * height,
    bottom: (1 - asset.anchor.y) * height,
    scale: stamp.scale,
  };
}
