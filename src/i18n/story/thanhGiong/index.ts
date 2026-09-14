import type { StoryCatalog } from '../types';
import { legacyEn, legacyVi } from './legacy';
import { metaEn, metaVi } from './meta';
import { recordEn, recordVi } from './record';
import { refusalsEn, refusalsVi } from './refusals';
import { withoutMiracleEn, withoutMiracleVi } from './withoutMiracle';

/**
 * Thánh Gióng. Vietnamese is the source — the register of a village clerk asking for his objection
 * to be minuted does not survive a round trip through English.
 *
 * Split the way `data/stories/thanhGiong/` is split, one file per branch, each holding both
 * languages so a line is never added in one and forgotten in the other. Three keys per ambient
 * beat, and the split matters:
 *
 * - `line` is the **header strip**: one line, on a 390-pixel phone. A headline, not a scene.
 * - `scene` is the room it happened in, 40–90 words, read from the bell and the story page.
 * - `chronicle` is the **annal entry**, and stays under twelve words on purpose.
 *
 * Cards add `title`, `body`, `advice`, one key per option plus `.d`; blows add `title`, `body`, `ok`.
 * `legacy` goes first so a live key of the same name always wins.
 */
export const thanhGiongVi: StoryCatalog = { ...legacyVi, ...metaVi, ...recordVi, ...refusalsVi, ...withoutMiracleVi };
export const thanhGiongEn: StoryCatalog = { ...legacyEn, ...metaEn, ...recordEn, ...refusalsEn, ...withoutMiracleEn };
