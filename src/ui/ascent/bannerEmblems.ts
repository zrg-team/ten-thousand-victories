import Phaser from 'phaser';
import { PIGMENT } from '../ink/palette';
import { DYNASTY_SIGNS as BANNER_EMBLEMS, type DynastySign as BannerEmblem } from '../../data/dynastySigns';
import { addDynastySignIcon, type DynastySignArtId } from '../conquestUiIcons';

export const BANNER_EMBLEM_SIZE = 64;

/** Saved IDs stay stable, including the original crown ID for the bronze drum. */
export function bannerEmblem(id: string): BannerEmblem {
  return (BANNER_EMBLEMS as readonly string[]).includes(id) ? id as BannerEmblem : 'crown';
}

const ART: Record<BannerEmblem, DynastySignArtId> = {
  crown: 'bronze-drum', banner: 'banner', blade: 'blade', grain: 'grain',
  branch: 'bamboo', tortoise: 'turtle', lotus: 'lotus', lacBird: 'lac-bird',
  dragon: 'dragon', phoenix: 'phoenix', tiger: 'tiger', buffalo: 'herd',
  carp: 'carp', mountain: 'terrain', wave: 'wave', star: 'star',
};

/**
 * **How far each motif's ink actually reaches, measured from the middle of its own print.**
 *
 * The number is a multiple of the print's half-width, so 1.0 means the ink touches the edge of
 * the square and anything above it means the motif uses its corners. Read off the alpha of
 * `signs-v1.webp` (2026-09-10, all sixteen): the blade runs corner to corner at **1.226**, the
 * phoenix 1.136, while the star stops at 0.892 and the bronze drum at 0.906.
 *
 * That spread is why one shared scale cannot be right for a *round* sign. At a size that keeps
 * the sword inside the seal's ring the drum floats small in the middle of it, and at a size that
 * fills the disc for the drum the sword's point and pommel cross the rule — which is what the
 * round mark did: its emblem was drawn 1.5 radii wide for every motif, putting the blade's ink at
 * 0.92 radii, past the inner seam at 0.91 and hard against the ring itself.
 *
 * `emblemFitScale` divides by the motif's own reach, so all sixteen fill the same circle.
 */
const INK_REACH: Record<DynastySignArtId, number> = {
  blade: 1.226, phoenix: 1.136, banner: 1.095, tiger: 1.086, carp: 1.075,
  terrain: 1.035, 'lac-bird': 1.022, herd: 1.022, grain: 1.012, dragon: 1.004,
  turtle: 1.003, wave: 0.996, bamboo: 0.959, lotus: 0.936, 'bronze-drum': 0.906,
  star: 0.892,
};

/**
 * The scale at which this motif's farthest ink lands exactly `inkRadius` from its centre.
 *
 * For a caller drawing inside a circle that is the whole fit: pass the radius the ink may reach
 * and the motif is centred and contained whatever shape it is.
 */
export function emblemFitScale(id: string, inkRadius: number): number {
  const reach = INK_REACH[ART[bannerEmblem(id)]] ?? 1.1;
  return (inkRadius / reach) * 2 / BANNER_EMBLEM_SIZE;
}

/** The same generated motif appears in the editor, seals, map flags and battle standards.
 * Field and trim colors remain on the enclosing cloth; the print keeps its original pigments.
 */
export function drawBannerEmblem(
  scene: Phaser.Scene, id: string, fill = PIGMENT.hoePale,
  ink = PIGMENT.muc, ground = PIGMENT.diepHi,
): Phaser.GameObjects.Container {
  const semantic = bannerEmblem(id);
  const artwork = addDynastySignIcon(scene, ART[semantic], BANNER_EMBLEM_SIZE);
  return scene.add.container(0, 0, [artwork]).setSize(BANNER_EMBLEM_SIZE, BANNER_EMBLEM_SIZE)
    .setData('bannerEmblem', semantic).setData('bannerPigments', { fill, ink, ground })
    .setData('conquestUiIcon', artwork.getData('conquestUiIcon'));
}
