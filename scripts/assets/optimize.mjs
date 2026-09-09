/**
 * **Re-encode the game's art to WebP, without letting quality move.**
 *
 * The shipped art is 92 MB of PNG under `public/art` plus 28 MB of face atlases, and one
 * menu-to-run session fetches about 41 MB of it (measured 2026-09-10 against the dev server: 124
 * files, the seven map atlas pages alone 12.8 MB). Every byte of that is downloaded on a phone,
 * precached by the service worker for offline play, and carried inside the app bundles.
 *
 * PNG is a lossless format with a 1990s entropy coder. WebP is the same picture in half to a
 * fifth of the bytes, decodes at least as fast, is supported by every browser this game runs in
 * (Safari 14+, 2020), and hands Phaser exactly the same RGBA — so texture memory, GPU upload and
 * draw cost are unchanged. The win is download, cache and install size.
 *
 * **The rule this script exists to enforce is that quality does not move.** Every candidate is
 * re-encoded, decoded again, and compared with the original pixel by pixel:
 *
 * - alpha must match exactly, so no mask ever softens;
 * - colour is compared *only where the pixel is visible* — RGB under a transparent pixel is
 *   undefined and a canvas round trip rewrites it, which made a first pass report a max delta of
 *   63 on an atlas that is in fact identical everywhere you can see;
 * - the encode is kept only if it is materially smaller **and** inside the profile's bound.
 *
 * Lossless is tried first and taken whenever it pays: the menu's ground plate is 46% smaller at a
 * max delta of exactly 0. Lossy is only ever offered to continuous-tone art (`photo`), never to
 * line work or an atlas, and even there it must come in under the bound or the PNG stays.
 *
 * No new dependency: the encoder is the Chromium that Playwright already installs for the
 * harnesses, driven through a canvas.
 *
 * Usage:
 *   node scripts/assets/optimize.mjs                    # report only, writes nothing
 *   node scripts/assets/optimize.mjs --apply            # convert, rewrite references, drop the PNG
 *   node scripts/assets/optimize.mjs --only art/menu    # limit to paths containing this
 *   node scripts/assets/optimize.mjs --apply --keep-original
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, statSync, unlinkSync, readdirSync, mkdirSync } from 'node:fs';
import { join, relative, extname, basename, dirname, sep } from 'node:path';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const KEEP = args.includes('--keep-original');
const ONLY = (() => {
  const index = args.indexOf('--only');
  return index >= 0 ? args[index + 1] : undefined;
})();

/**
 * Files that stay in their original format, whatever they would save.
 *
 * Platform surfaces first: a favicon, an app icon and a maskable icon are read by browsers, app
 * stores and OS launchers that were never promised WebP, and a share card is read by unfurlers
 * (Facebook, Zalo, Discord) that mostly still are not. Then the build inputs: the royal cutouts
 * and the Đông Hồ face parts are packed into an atlas by `scripts/faces/*`, and `build-sw.mjs`
 * already refuses to precache them — converting those changes nothing a player downloads.
 */
const KEEP_FORMAT = [
  /^icon[^/]*\.png$/, /^favicon[^/]*/, /^apple-touch-icon/, /^adaptive-icon/, /^monochrome-icon/,
  /^share\//, /^screenshots?\//,
  /^faces-royal\/royal-[^/]+\.png$/, /^faces-dongho-v\d+\/parts\//,
];

/**
 * Which bound a picture is judged against — **decided by the picture, not by its path.**
 *
 * `flat` is line work, glyphs, atlases, cut-outs: anything with a hard edge against transparency.
 * Lossy WebP rings around those edges, and at the size this game draws an icon that reads as a
 * haze on the parchment, so flat art is lossless or nothing. `photo` is the painted plates and
 * the story prints — continuous tone, full bleed, drawn behind everything — where a small and
 * measured amount of loss is invisible and pays four fifths of the file.
 *
 * The two are told apart by transparency, which is the honest signal: a cut-out is mostly empty
 * paper and a painting has none at all. A first pass used a list of path prefixes and put the
 * brush-lettered wordmark — `art/menu-wordmark-*`, transparent everywhere but the strokes — in
 * with the paintings, which is exactly the art that must not be re-encoded lossily.
 */
const TRANSPARENT_LIMIT = 0.02;
const PROFILES = {
  // Quality 1 only. Chromium's WebP at 1 is lossless for most pictures and within a level or two
  // of it for the rest, which is why the bound is a small number rather than a flat zero — see
  // the metric below. Lossy is never offered here: measured on the map's own pages, quality 0.98
  // saves 61% and puts a visible peak error of 126 into the line work. That is a different
  // drawing, and this script's whole promise is that it is not.
  flat: { qualities: [1], maxDelta: 2, maxRmse: 1 },
  // A full-bleed painting has no hard edge to ring, so the ladder is allowed — under a bound that
  // is still tighter than the difference between two JPEG encoders.
  photo: { qualities: [1, 0.95, 0.9], maxDelta: 16, maxRmse: 3 },
};

/** Everything under `public/`, as paths relative to it, with forward slashes on every platform. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(relative(PUBLIC, full).split('\\').join('/'));
  }
  return out;
}

/** The text files that can name an asset: source, the shell page, manifests, atlas metadata. */
function referenceFiles() {
  const files = [join(ROOT, 'index.html')];
  const scan = (dir, filter) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) scan(full, filter);
      else if (filter.test(entry.name)) files.push(full);
    }
  };
  scan(join(ROOT, 'src'), /\.(ts|tsx|json)$/);
  scan(join(ROOT, 'scripts'), /\.(mjs|js|json)$/);
  scan(PUBLIC, /\.(json|webmanifest|html)$/);
  return files;
}

const everyImage = walk(PUBLIC).filter((rel) => /\.(png|jpe?g|webp)$/i.test(rel));
const candidates = everyImage
  .filter((rel) => /\.(png|jpe?g)$/i.test(rel))
  .filter((rel) => !KEEP_FORMAT.some((rule) => rule.test(rel)))
  .filter((rel) => (ONLY ? rel.includes(ONLY) : true))
  .sort();

/**
 * **A bare file name may only be rewritten when the whole game has exactly one of them.**
 *
 * The manifests name a file three ways — `public/art/…/hamlet.png`, `art/…/hamlet.png`, and an
 * atlas's own `meta.image` as just `hamlet.png` — so all three have to be matched. But there is a
 * `conquest-dongho/settlement/hamlet.png` *and* a `conquest-dongho-v4/settlement/hamlet.png`, and
 * a pass that searched and replaced the bare name rewrote both at once: manifests were left
 * pointing at WebP files that were never written, and the assets whose turn came later reported
 * as "named nowhere" because their `.png` had already been renamed out of the file.
 *
 * The census is therefore taken over **every image under `public/`** — not over the candidate
 * list, and certainly not over what `--only` narrowed it to. Slicing the run must not change what
 * the run believes about names: a first attempt counted the slice, decided `atlas.png` was
 * unique, and rewrote the *other two* face packs' atlases to a WebP that did not exist.
 */
const nameCounts = new Map();
for (const rel of everyImage) {
  const key = basename(rel).replace(/\.(png|jpe?g|webp)$/i, '');
  nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
}
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The name as a whole path segment: quoted or after a slash, and ending at a delimiter. */
const segment = (name) => new RegExp(`(?<=["'\`/])${escapeRe(name)}(?=["'\`,\\s)\\]])`, 'g');

if (candidates.length === 0) {
  console.log('nothing to do');
  process.exit(0);
}

// Read every reference file once. The same buffer is searched for each asset and, under --apply,
// written back at the end — so a manifest naming forty assets is parsed once, not forty times.
const refs = new Map(referenceFiles().map((file) => [file, readFileSync(file, 'utf8')]));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('data:text/html,<title>encode</title>');

/** Encode one image at each quality and measure what it cost, inside the browser. */
async function encode(bytes, ext, qualities) {
  return page.evaluate(async (input) => {
    const image = new Image();
    image.src = `data:image/${input.ext};base64,${input.b64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const source = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const out = [];
    for (const quality of input.qualities) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      if (!blob) continue;
      const buffer = new Uint8Array(await blob.arrayBuffer());
      const round = new Image();
      const url = URL.createObjectURL(blob);
      round.src = url;
      await round.decode();
      const check = document.createElement('canvas');
      check.width = canvas.width;
      check.height = canvas.height;
      const back = check.getContext('2d', { willReadFrequently: true });
      back.drawImage(round, 0, 0);
      const result = back.getImageData(0, 0, canvas.width, canvas.height).data;
      URL.revokeObjectURL(url);
      // **Judge the picture the way it is composited.**
      //
      // Alpha must match exactly — a mask may not soften. Colour is then weighted by that alpha:
      // an error under a pixel that is 4% opaque is 4% of an error, and an error under a fully
      // transparent one is not an error at all. The peak is taken over the pixels a viewer can
      // actually see (alpha ≥ 200), because a raw peak is always some edge pixel whose colour
      // never reaches the screen: the map's flora page scores a raw peak of 28 at quality 1 and
      // a visible peak of **1**, and treating those as the same number rejected two hundred
      // files that are, where it counts, identical.
      let maxDelta = 0;
      let alphaDelta = 0;
      let sum = 0;
      let weight = 0;
      for (let i = 0; i < source.length; i += 4) {
        const alpha = source[i + 3];
        const da = Math.abs(alpha - result[i + 3]);
        if (da > alphaDelta) alphaDelta = da;
        if (alpha <= 8) continue;
        const w = alpha / 255;
        for (let c = 0; c < 3; c += 1) {
          const d = Math.abs(source[i + c] - result[i + c]);
          if (alpha >= 200 && d > maxDelta) maxDelta = d;
          sum += w * d * d;
          weight += w;
        }
      }
      out.push({
        quality,
        bytes: buffer.length,
        maxDelta,
        alphaDelta,
        rmse: weight ? Math.sqrt(sum / weight) : 0,
        data: Array.from(buffer),
      });
    }
    let clear = 0;
    for (let i = 3; i < source.length; i += 4) if (source[i] <= 8) clear += 1;
    return {
      width: canvas.width,
      height: canvas.height,
      transparent: clear / (source.length / 4),
      out,
    };
  }, { b64: bytes.toString('base64'), ext, qualities });
}

const rows = [];
/** Files whose text changed, and the originals waiting on those writes to land. */
const touched = new Set();
const planned = [];
let beforeTotal = 0;
let afterTotal = 0;
let skipped = 0;
let unreferenced = 0;

for (const rel of candidates) {
  const absolute = join(PUBLIC, rel);
  const size = statSync(absolute).size;
  const name = basename(rel);
  // Where an asset is named: the `public/`-relative path as the game builds it, the `public/`
  // prefixed form the art manifests carry in `runtimePath`, and the bare file name an atlas's
  // own `meta.image` uses. A short bare name is not searched for — it would match anything.
  const unique = nameCounts.get(name.replace(/\.(png|jpe?g)$/i, '')) === 1;
  const hits = [...refs].filter(([, text]) => text.includes(rel)
    || text.includes(`public/${rel}`)
    || (unique && segment(name).test(text)));
  // **A build script naming a file does not make it a runtime asset.**
  //
  // `menu-layer-ground-v5.png` is named exactly once in the repo — by the generator that reads it
  // and writes `v6` beside it. Converting it would have rewritten the generator to read a WebP and
  // changed nothing a player downloads; the file is a source, and the shipped plate is v6. So the
  // decision needs a reference the *game* follows: source, the shell page, or a manifest.
  const runtime = hits.filter(([file]) => !file.includes(`${sep}scripts${sep}`));
  if (runtime.length === 0) {
    unreferenced += 1;
    rows.push({
      rel,
      size,
      note: hits.length > 0 ? 'build input — never fetched' : 'named nowhere — left alone',
    });
    continue;
  }

  const ext = extname(rel).toLowerCase() === '.png' ? 'png' : 'jpeg';
  const bytes = readFileSync(absolute);
  // Pass one is lossless, and it also reports how much of the picture is transparent — which is
  // what decides whether a lossy pass is even offered.
  const first = await encode(bytes, ext, PROFILES.flat.qualities);
  const profile = first.transparent < TRANSPARENT_LIMIT ? PROFILES.photo : PROFILES.flat;
  const out = [...first.out];
  if (profile === PROFILES.photo) {
    const lossy = await encode(bytes, ext, profile.qualities.filter((q) => q < 1));
    out.push(...lossy.out);
  }
  const within = out.filter((row) => row.alphaDelta === 0
    && row.maxDelta <= profile.maxDelta && row.rmse <= profile.maxRmse);
  const best = within.sort((a, b) => a.bytes - b.bytes)[0];
  // Three percent is not worth a changed file name and a cache miss for every returning player.
  if (!best || best.bytes >= size * 0.97) {
    skipped += 1;
    rows.push({ rel, size, note: best ? 'webp is no smaller' : 'no encode inside the bound' });
    continue;
  }

  beforeTotal += size;
  afterTotal += best.bytes;
  const target = rel.replace(/\.(png|jpe?g)$/i, '.webp');
  rows.push({
    rel,
    size,
    after: best.bytes,
    target,
    mode: best.quality === 1 ? 'lossless' : `q${best.quality}`,
    maxDelta: best.maxDelta,
    rmse: best.rmse,
    files: hits.length,
  });

  if (!APPLY) continue;

  const absoluteTarget = join(PUBLIC, target);
  mkdirSync(dirname(absoluteTarget), { recursive: true });
  writeFileSync(absoluteTarget, Buffer.from(best.data));
  for (const [file, text] of hits) {
    let next = text
      .split(`public/${rel}`).join(`public/${target}`)
      .split(rel).join(target);
    if (unique) next = next.replace(segment(name), basename(target));
    refs.set(file, next);
    touched.add(file);
  }
  // The original is *not* deleted here. See below.
  planned.push(absolute);
}

/**
 * **Write every reference first; delete the originals only once they have all landed.**
 *
 * This used to convert, rewrite and delete one asset at a time, which on Windows is a bet that
 * nobody else has a file open: a run half way through 500 assets hit `UNKNOWN: open` on a source
 * file the editor was holding, died there, and left 499 pictures deleted with only 18 of the 40
 * files that name them updated. Nothing about that state is recoverable except from git.
 *
 * So the deletes wait. Every rewritten file is written first, with a few retries for exactly that
 * transient lock, and if any of them still cannot be written then no original is removed and the
 * run says which files it could not touch.
 */
if (APPLY) {
  const failed = [];
  for (const file of touched) {
    let saved = false;
    for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
      try {
        writeFileSync(file, refs.get(file));
        saved = true;
      } catch (error) {
        if (attempt === 4) failed.push(`${file}: ${error.code ?? error.message}`);
        else await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
  if (failed.length > 0) {
    console.error('could not rewrite these files, so no original was deleted:');
    for (const line of failed) console.error(`  ${line}`);
    console.error('the .webp files are on disk; re-run when the files are free');
  } else if (!KEEP) {
    for (const absolute of planned) unlinkSync(absolute);
  }
}
await browser.close();

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
const converted = rows.filter((row) => row.target);
converted.sort((a, b) => (b.size - b.after) - (a.size - a.after));
for (const row of converted.slice(0, 30)) {
  console.log(`${kb(row.size).padStart(9)} → ${kb(row.after).padStart(9)}  `
    + `${String(Math.round(100 - (row.after / row.size) * 100)).padStart(3)}%  ${row.mode.padEnd(9)}`
    + `d${String(row.maxDelta).padStart(3)} rmse ${row.rmse.toFixed(2).padStart(5)}  ${row.rel}`);
}
if (converted.length > 30) console.log(`… and ${converted.length - 30} more`);
console.log(`\n${converted.length} of ${candidates.length} candidates convert`);
if (beforeTotal > 0) {
  console.log(`${kb(beforeTotal)} → ${kb(afterTotal)}  `
    + `(${Math.round(100 - (afterTotal / beforeTotal) * 100)}% smaller, ${kb(beforeTotal - afterTotal)} saved)`);
}
console.log(`${skipped} already as small as WebP can make them, ${unreferenced} named nowhere in the source`);
if (!APPLY) console.log('\nreport only — run again with --apply to convert and rewrite references');
