import Phaser from 'phaser';
import { FACE_PART_DEFS, type FacePartDef } from './faces/parts.generated';
import { resolveHeroLook, type HeroLook } from './faces/heroLook';
import { dynastyLookStamp, getDynasty } from '../state/dynasty';
import { getActiveMapTheme } from './mapTheme';
import { PIGMENT } from './ink/palette';
import { hatchPoly, inkPath, washFill } from './ink/stroke';
import type { Hero } from '../state/types';
import { placeStamp, stamp } from './ink/stamp';
import { registerGpuBake, unregisterGpuBake } from '../game/gpuBakes';
import { ACTIVE_HERO_FACE_ART_PACK, heroFaceHeadwearSupported } from './faces/artPack';
import donghoV2Defs from './faces/dongho-v2.defs.json';
import { donghoWardrobeParts } from './faces/donghoWardrobe';
import { donghoHead, fitDonghoPart } from './faces/donghoFit';
import royalDefs from './faces/royal.defs.json';

/**
 * Hero portraits, composed from independently versioned part atlases.
 *
 * This used to draw every portrait from Phaser primitives at runtime — twenty-odd rectangles
 * and ellipses per face, built fresh on every render. That is why the faces all looked alike:
 * an axis-aligned box is an axis-aligned box, so the only variation available was interior
 * detail on an identical outline, and at the sizes portraits are actually drawn (five call
 * sites, from 0.32× to 1.16×) most of that detail was sub-pixel.
 *
 * The default pack ships generated PNG components in `public/faces-dongho-v2/`; the original
 * SVG pack in `public/faces/` remains selectable. Both use the same part IDs and design space,
 * one runtime atlas, and one cached image per hero. Three consequences worth knowing:
 *
 *  - **Parts that carry a run-chosen colour are drawn white and tinted.** Six skin tones cost
 *    one file. Parts with a fixed colour — the black lacquer of a khăn vấn —
 *    ship their colour and are never tinted.
 *  - **Positions come from the selected manifest.** V2 has complete garment assemblies and
 *    revised anchors; earlier packs retain their original bounds. Saved part IDs stay valid.
 *  - **Runtime work is bounded.** The loader fetches one atlas instead of hundreds of SVGs and
 *    a composed hero becomes one cached Image instead of a dozen live clothing/hat layers.
 *
 * The public surface is unchanged: `renderHeroFace`, `renderHeroFaceInBox`, and
 * `HERO_FACE_EXTENT` behave exactly as before, so the four calling scenes needed no edits.
 */

/** One image plus atlas metadata, and one GPU texture for the complete part library. */
// A selection is fixed for this page load. Saved looks keep their original part IDs.
const FACE_ART_PACK = ACTIVE_HERO_FACE_ART_PACK;
const FACE_ATLAS_TEXTURE_KEY = FACE_ART_PACK.texture;

const ACTIVE_PART_DEFS: readonly FacePartDef[] = FACE_ART_PACK.id === 'dongho-v2'
  ? donghoV2Defs as FacePartDef[] : FACE_PART_DEFS;
const PART_BY_KEY = new Map<string, FacePartDef>([...ACTIVE_PART_DEFS, ...royalDefs as FacePartDef[]].map((part) => [part.key, part]));
const ROYAL_ATLAS = 'face:royal';

/**
 * Visual extent of a portrait at scale 1, relative to its container origin.
 *
 * Derived from the generator's design space rather than measured by hand — the old comment
 * here had to name which hat and which shoulder set the bounds, and went stale the moment
 * either changed. Callers sizing a portrait against a box must still use these rather than the
 * plate, because the tallest headwear overhangs it.
 */
const bounds = ACTIVE_PART_DEFS.reduce(
  (acc, part) => ({
    top: Math.min(acc.top, part.cy - part.h / 2),
    bottom: Math.max(acc.bottom, part.cy + part.h / 2),
    left: Math.min(acc.left, part.cx - part.w / 2),
    right: Math.max(acc.right, part.cx + part.w / 2),
  }),
  { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity },
);

export const HERO_FACE_EXTENT = {
  top: bounds.top,
  bottom: bounds.bottom,
  left: bounds.left,
  right: bounds.right,
} as const;
export const HERO_FACE_W = HERO_FACE_EXTENT.right - HERO_FACE_EXTENT.left;
export const HERO_FACE_H = HERO_FACE_EXTENT.bottom - HERO_FACE_EXTENT.top;

/**
 * The frame a printed portrait sits in: hatched paper with a hand-pulled contour, weighted by rank
 * so a Legendary still announces itself without a slab of lacquer behind the face.
 */
function drawCartouche(scene: Phaser.Scene, rank: number): Phaser.GameObjects.GameObject {
  // Five ranks, five stamps: the frame is a wash, a hatch and a contour that never change, and
  // hero lists put a dozen of them on screen — as live Graphics each re-tessellated per frame.
  const st = stamp(scene, `ui:cartouche:${rank}`, {
    left: HERO_FACE_EXTENT.left, right: HERO_FACE_EXTENT.right,
    top: HERO_FACE_EXTENT.top, bottom: HERO_FACE_EXTENT.bottom,
  }, (g, x, y, raster) => {
    g.translateCanvas(x, y);
    cartoucheInk(g, rank, raster);
    g.translateCanvas(-x, -y);
  }, { raster: 'super', pool: 'ui', pad: 2 });
  return placeStamp(scene, st, 0, 0);
}

function cartoucheInk(g: Phaser.GameObjects.Graphics, rank: number, k = 1): void {
  const left = (HERO_FACE_EXTENT.left + 2) * k;
  const right = (HERO_FACE_EXTENT.right - 2) * k;
  const top = (HERO_FACE_EXTENT.top + 2) * k;
  const bottom = (HERO_FACE_EXTENT.bottom - 2) * k;
  const box = [
    { x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom },
  ];
  washFill(g, box, PIGMENT.diepLo, rank * 31 + 7, 0.55, 1.2);
  hatchPoly(g, box, 0.8 * k, 6 * k, PIGMENT.mucSoft, 0.07, 0.7);
  inkPath(g, box, rank * 17 + 3, {
    width: (1 + rank * 0.35) * k,
    alpha: 0.5 + rank * 0.1,
    colour: rank >= 3 ? PIGMENT.son : PIGMENT.muc,
    wobble: 0.9,
    step: 12,
    closed: true,
  });
}

/**
 * Queues every face part for loading. Call from a scene's `preload`.
 *
 * Safe to call more than once: Phaser skips a key that is already in the texture manager, so a
 * scene that preloads defensively costs nothing.
 */
export function preloadHeroFaces(scene: Phaser.Scene): void {
  const baseUrl = import.meta.env.BASE_URL;
  // All 54 generated royal pieces share the PNG sheet described by atlas.json.
  if (!scene.textures.exists(ROYAL_ATLAS)) scene.load.atlas(ROYAL_ATLAS, `${baseUrl}faces-royal/atlas.webp`, `${baseUrl}faces-royal/atlas.json`);
  if (scene.textures.exists(FACE_ATLAS_TEXTURE_KEY)) return;
  scene.load.atlas(FACE_ATLAS_TEXTURE_KEY, `${baseUrl}${FACE_ART_PACK.image}`, `${baseUrl}${FACE_ART_PACK.atlas}`);
}

/** True once the parts are in the texture manager — the portrait needs them to draw anything. */
export function heroFacesReady(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(FACE_ATLAS_TEXTURE_KEY)) return false;
  return scene.textures.get(FACE_ATLAS_TEXTURE_KEY).has(FACE_PART_DEFS[0].key);
}

const BADGE_TEXTURE_PREFIX = 'hero-face:';
// 1.5× is crisp above the largest in-game portrait scale while cutting the full-roster cache
// to 56% of its former 2× area. Source parts remain 2× inside the atlas.
const BADGE_RASTER = 1.5;
/** Render textures kept alive for as long as their saved texture is: destroying one destroys the other. */
const badgeTextures = new Map<string, Phaser.GameObjects.RenderTexture>();
const badgeRefs = new Map<string, { refs: number; used: number; bytes: number }>();
/** Visible and pooled images retain their texture until destruction, including hidden scene owners. */
export function retainHeroFace(image: Phaser.GameObjects.Image): Phaser.GameObjects.Image {
  const key = image.texture.key, entry = badgeRefs.get(key);
  if (!entry) return image;
  entry.refs++; entry.used = performance.now();
  image.once(Phaser.GameObjects.Events.DESTROY, () => { entry.refs = Math.max(0, entry.refs - 1); entry.used = performance.now(); evictBadges(); });
  return image;
}
function evictBadges(except?: string): void {
  const limit = 16 * 1048576;
  let bytes = [...badgeRefs.values()].reduce((n, entry) => n + entry.bytes, 0);
  for (const [key, entry] of [...badgeRefs].filter(([key, entry]) => key !== except && entry.refs === 0).sort((a, b) => a[1].used - b[1].used)) {
    if (bytes <= limit) break;
    bytes -= entry.bytes; unregisterGpuBake(key); badgeTextures.get(key)?.texture.destroy(); badgeTextures.get(key)?.destroy(); badgeTextures.delete(key); badgeRefs.delete(key);
  }
}
export function portraitCacheStats() { return { count: badgeRefs.size, bytes: [...badgeRefs.values()].reduce((n, e) => n + e.bytes, 0), retained: [...badgeRefs.values()].filter(e => e.refs > 0).length }; }


/**
 * A hero's portrait as a single texture, baked once and reused — for the map, where a face
 * beside every standing host would otherwise be fifteen tinted images each.
 *
 * Returns the texture key, or nothing when the parts are not loaded yet or the GL context is
 * lost (drawing into a render texture then dereferences a null binding, exactly as the map's
 * own bake guards against). Callers fall back to `renderHeroFaceInBox` or draw nothing.
 */
export function heroFaceTextureKey(scene: Phaser.Scene, hero: Hero): string | undefined {
  const theme = getActiveMapTheme().id;
  // The made king's look is part of his identity, and none of the fields above carry it: the
  // Temple re-dresses the same id, the same name, the same era and the same rank, so without the
  // stamp `textures.exists` hits on the portrait from *before* the change and the Temple appears
  // to do nothing at all. Empty for every hero the Coronation has not touched, so the roster's
  // cache keys are byte-identical to what they were.
  const identity = `${hero.id}|${hero.name}|${hero.era ?? ''}|${hero.sex ?? ''}|${hero.type}|${hero.rarity}|${hero.monastic === true}|${lookStampFor(hero)}`;
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i += 1) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const key = `${BADGE_TEXTURE_PREFIX}${FACE_ART_PACK.id}:${theme}:${hero.id}:${(hash >>> 0).toString(36)}`;
  if (scene.textures.exists(key)) return key;
  if (!heroFacesReady(scene)) return undefined;
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (renderer?.contextLost || renderer.gl.isContextLost()) return undefined;

  const width = Math.ceil(HERO_FACE_W * BADGE_RASTER);
  const height = Math.ceil(HERO_FACE_H * BADGE_RASTER);
  const target = scene.make.renderTexture({ width, height }, false);
  // A closure, so a restored GL context can paint the same texture again (`game/gpuBakes.ts`);
  // every badge already placed from this key comes back with it. The hero is snapshotted by
  // reference — the key already carries everything about him the picture depends on.
  const paint = (into: Phaser.Scene): void => {
    // The face is drawn about its own origin, with parts reaching left of and above it; shift so
    // the whole extent lands inside the texture.
    const face = buildHeroFaceLayers(into, hero);
    face.setPosition(-HERO_FACE_EXTENT.left * BADGE_RASTER, -HERO_FACE_EXTENT.top * BADGE_RASTER);
    face.setScale(BADGE_RASTER);
    target.clear();
    target.draw(face);
    // Phaser 4 buffers the draw and executes it in `render`. This has to run before the face is
    // destroyed on the next line, or the buffer flushes against a dead game object and the badge
    // is saved blank — and a blank badge is cached forever, because `textures.exists` then hits.
    target.render();
    face.destroy(true);
  };
  paint(scene);
  target.saveTexture(key);
  badgeTextures.set(key, target);
  badgeRefs.set(key, { refs: 0, used: performance.now(), bytes: width * height * 4 });
  evictBadges(key);
  registerGpuBake(scene.game, key, () => {
    if (!badgeTextures.has(key) || !scene.textures.exists(key) || !heroFacesReady(scene)) {
      unregisterGpuBake(key);
      return;
    }
    paint(scene.game.scene.getScenes(true)[0] ?? scene);
  });
  return key;
}

/**
 * Renders a portrait scaled and positioned to sit fully inside `box`, centred within it.
 * Use this anywhere a portrait shares a card with text; `renderHeroFace` alone takes a raw
 * centre point and will happily overflow its container.
 */
export function renderHeroFaceInBox(
  scene: Phaser.Scene,
  hero: Hero,
  box: { x: number; y: number; width: number; height: number },
  maxScale = 1,
): Phaser.GameObjects.Container {
  const scale = Math.min(box.width / HERO_FACE_W, box.height / HERO_FACE_H, maxScale);
  // The origin is not the middle of the artwork, so offset by the extent's own centre.
  const centreOffsetY = (HERO_FACE_EXTENT.top + HERO_FACE_EXTENT.bottom) / 2;
  return renderHeroFace(
    scene,
    hero,
    box.x + box.width / 2,
    box.y + box.height / 2 - centreOffsetY * scale,
    scale,
  );
}

export function renderHeroFace(
  scene: Phaser.Scene,
  hero: Hero,
  x: number,
  y: number,
  scale: number,
): Phaser.GameObjects.Container {
  const root = scene.add.container(x, y).setScale(scale);
  const textureKey = heroFaceTextureKey(scene, hero);
  if (textureKey) {
    const centreX = (HERO_FACE_EXTENT.left + HERO_FACE_EXTENT.right) / 2;
    const centreY = (HERO_FACE_EXTENT.top + HERO_FACE_EXTENT.bottom) / 2;
    root.add(retainHeroFace(scene.add.image(centreX, centreY, textureKey)).setDisplaySize(HERO_FACE_W, HERO_FACE_H));
    return root;
  }

  // Loading/context-loss fallback: keep the old direct composition path so a portrait can
  // never disappear merely because its cache could not be created.
  root.add(buildHeroFaceLayers(scene, hero));
  return root;
}

/**
 * The made king's look stamp, when this hero is him — otherwise the empty string.
 *
 * Keyed the way `resolveHeroLook` keys the same decision: on the founder's id *or* name, because
 * the throne's hero carries the constant id `'king'`.
 */
function lookStampFor(hero: Hero): string {
  const founder = getDynasty().founder;
  if (!founder?.look) return '';
  if (hero.id !== founder.id && hero.name !== founder.name) return '';
  return dynastyLookStamp();
}

/**
 * A portrait from a look the caller already has, with no cache in the way.
 *
 * The Coronation's preview: every stepper tap composes a different king, and the baked path is
 * keyed on a hero's identity rather than on a look, so it would serve the same face back for
 * every tap. One build per tap is the right cost — that is a tap, not a frame, and the frame
 * ledger's cost floor is live Graphics *per frame*, which this never is.
 */
export function renderLookInBox(
  scene: Phaser.Scene,
  look: HeroLook,
  box: { x: number; y: number; width: number; height: number },
  maxScale = 1,
): Phaser.GameObjects.Container {
  const scale = Math.min(box.width / HERO_FACE_W, box.height / HERO_FACE_H, maxScale);
  const centreOffsetY = (HERO_FACE_EXTENT.top + HERO_FACE_EXTENT.bottom) / 2;
  const root = scene.add.container(
    box.x + box.width / 2,
    box.y + box.height / 2 - centreOffsetY * scale,
  ).setScale(scale);
  root.add(buildLookLayers(scene, look));
  return root;
}

/** Builds the editable part stack once; callers normally see its baked one-Image result. */
function buildHeroFaceLayers(scene: Phaser.Scene, hero: Hero): Phaser.GameObjects.Container {
  return buildLookLayers(scene, resolveHeroLook(hero));
}

function buildLookLayers(scene: Phaser.Scene, source: HeroLook): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  // Copied, not mutated: the woodblock treatment below strips the plate from `look.parts`, and a
  // caller that keeps its own look — the Coronation's preview does — would find it edited.
  const look: HeroLook = { ...source, parts: source.parts.slice() };

  // Under the woodblock treatment the rarity plate — a dark lacquered slab with a gold rim — is
  // the one part of the portrait that fights the page it now sits on. The face itself is right;
  // it just needs paper behind it instead of a colour swatch, so the plate is replaced with an
  // inked cartouche and rank is carried by the border weight.
  const dongho = FACE_ART_PACK.id !== 'legacy';
  const printed = dongho || getActiveMapTheme().id === 'dong-ho';
  if (printed) {
    look.parts = look.parts.filter((part) => !/^plate-|^rank-/.test(part.key));
    root.add(drawCartouche(scene, look.rank));
  }
  // The research does not support randomly assigning these cultural/religious markings.
  // This is a presentation rule for the new pack; legacy art and saved looks stay intact.
  // Generated heads already contain the bald scalp: the old highlight cap would overhang it.
  if (dongho) {
    look.parts = look.parts.filter(part => heroFaceHeadwearSupported(part.key)
      && !/^(mark-tattoo(?:-|$)|mark-warpaint$|mark-brand$|scalp-dots(?:-|$)|scalp-shaven$)/.test(part.key));
  }
  if (!heroFacesReady(scene)) return root;
  if (FACE_ART_PACK.id === 'dongho-v2') look.parts = donghoWardrobeParts(look);
  const fittedHead = donghoHead(look.parts, PART_BY_KEY);

  // Paint order comes from the manifest, not from the order the wardrobe happened to push
  // parts in — the throat is layer 25 and a collar is 35, and the wardrobe builds the garment
  // before the body it hangs on. Sorting here means `heroLook` can stay readable as a
  // description of a person rather than as a paint sequence.
  const stack = look.parts
    .flatMap(wanted => {
      const def = PART_BY_KEY.get(wanted.key);
      return def ? fitDonghoPart(def, FACE_ART_PACK.id === 'dongho-v2' || /^(beard-|royal-)/.test(def.key) ? fittedHead : undefined).map(fit => ({ wanted, def: fit })) : [];
    })
    .sort((a, b) => a.def.layer - b.def.layer);

  for (const { wanted, def } of stack) {
    // A missing frame means the committed atlas is stale; draw what we can rather than throwing
    // in the middle of a roster list. The verification suite catches the mismatch.
    const atlas = def.key.startsWith('royal-') ? ROYAL_ATLAS : FACE_ATLAS_TEXTURE_KEY;
    if (!scene.textures.exists(atlas) || !scene.textures.get(atlas).has(def.key)) continue;

    const image = scene.add.image(def.cx, def.cy, atlas, def.key);
    image.setDisplaySize(def.w, def.h);
    if (def.crop) {
      const frame = image.frame;
      const top = def.crop.top ?? 0, bottom = def.crop.bottom ?? 1;
      image.setCrop(def.crop.left * frame.width, top * frame.height, (def.crop.right - def.crop.left) * frame.width, (bottom - top) * frame.height);
    }
    if (wanted.tint !== 'none') image.setTint(look.palette[wanted.tint]);
    root.add(image);
  }

  return root;
}
