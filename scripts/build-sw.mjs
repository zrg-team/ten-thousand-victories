/**
 * Seals the finished build into a service worker, so the game plays with the network off.
 *
 * Runs after `vite build` (see the `build` script in package.json). It walks `dist/`, sorts what it
 * finds into the shell and the art, hashes the lot, and writes `dist/sw.js` from
 * `scripts/sw-template.js`.
 *
 * Why a hand-rolled worker rather than vite-plugin-pwa: this repo has exactly one runtime
 * dependency, and Workbox's default `maximumFileSizeToCacheInBytes` is 2 MiB — it would refuse the
 * game's 3.4 MB bundle and precache a shell that cannot boot, quietly.
 *
 * The version is a hash of the *contents* of everything precached, not a timestamp. A rebuild that
 * changes nothing produces a byte-identical `sw.js`, the browser sees no new worker, and the player
 * is never told there is an update when there is not one.
 *
 * Usage: node scripts/build-sw.mjs [--dist dir] [--base /path/]
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const argOf = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
};

const DIST = resolve(ROOT, argOf('--dist', 'dist'));

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** The sub-path the game is served from — `/ten-thousand-victories/` on Pages, `/` anywhere else. */
const BASE = (() => {
  const override = argOf('--base', undefined);
  if (override) return override.endsWith('/') ? override : `${override}/`;
  const { homepage } = PKG;
  if (typeof homepage !== 'string' || homepage.length === 0) return '/';
  const { pathname } = new URL(homepage);
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
})();

/**
 * Not precached, and each for its own reason:
 *   · `sw.js` — a worker that caches itself can never be replaced.
 *   · dotfiles — `.nojekyll` and friends are for the server, not the client.
 *   · `share/` — the link-preview card (`scripts/build-share.mjs`). It is 170 kB drawn for
 *     Facebook, X, Discord and Zalo; nothing inside the game ever requests it, so precaching it
 *     would be 170 kB every installed player must fetch before the game is allowed to boot, to
 *     hold a picture only a crawler will ever see.
 *
 * Everything else in `dist/` is the game, and all of it is sealed. (The deploy workflow used to
 * copy `public/` a second time into `dist/public/`, which this skipped; that copy was a duplicate
 * of files already at the root of `dist/` and nothing ever loaded from it, so it is gone.)
 */
const skip = (rel) =>
  rel === 'sw.js' || rel.startsWith('share/') || rel.split('/').some((part) => part.startsWith('.'))
  // Portrait source PNGs are editable assets; runtime and offline play only need the atlas.
  || /^faces-dongho-v\d+\/(parts\/|provenance\.json$)/.test(rel);

/** The art: fetched by the Phaser loader at runtime, and survivable if one is missing. */
const isOptional = (rel) => rel.startsWith('faces/')
  || /^faces-dongho-v\d+\//.test(rel)
  || rel.startsWith('support/')
  // The battle music: 6.3 MB of it, fetched only when a fight opens and silent-by-design if it
  // never arrives. Install-critical it would be two thirds of everything a player waits for
  // before the game will boot offline, to hear a bed that plays at five percent volume.
  || rel.startsWith('audio/')
  // Generated conquest sprites always have procedural fallbacks. Keeping them out of the
  // install-critical shell prevents the optional pack from delaying first offline readiness.
  || /^art\/conquest-dongho(?:-v\d+)?\//.test(rel)
  // Card illustrations retain icon/band fallbacks when optional art is unavailable.
  || rel.startsWith('art/story-prints/')
  // Optional generated choice motifs fall back to the local glyph when unavailable.
  || rel.startsWith('art/story-choice-icons/')
  // The throne hall retains its procedural fallback if the print is unavailable.
  || rel.startsWith('art/ascent/');

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
};

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`build-sw: no build to seal at ${DIST} — run \`vite build\` first.`);
  process.exit(1);
}

const entries = files
  .map((full) => ({ full, rel: relative(DIST, full).split('\\').join('/') }))
  .filter(({ rel }) => !skip(rel))
  .sort((a, b) => (a.rel < b.rel ? -1 : 1));

if (entries.length === 0) {
  console.error(`build-sw: ${DIST} holds nothing to cache.`);
  process.exit(1);
}

const template = readFileSync(join(HERE, 'sw-template.js'), 'utf8');

const fingerprint = createHash('sha256');
// The worker's own source is part of the version. Without this a fix to the fetch handler ships
// under the old cache name and inherits whatever the broken one put there.
fingerprint.update(`sw-template:${createHash('sha256').update(template).digest('hex')}\n`);
for (const entry of entries) {
  fingerprint.update(`${entry.rel}:${createHash('sha256').update(readFileSync(entry.full)).digest('hex')}\n`);
}
const version = fingerprint.digest('hex').slice(0, 12);

const url = (rel) => `${BASE}${rel}`;
const critical = [];
const optional = [];
for (const { rel } of entries) {
  // The shell is asked for twice under two names — a cold launch of an installed app requests the
  // directory, a reload requests the file — and `caches.match` does not know they are the same
  // page. Both are cached; the worker answers navigations with the directory form.
  if (rel === 'index.html') critical.push(BASE, url(rel));
  else (isOptional(rel) ? optional : critical).push(url(rel));
}

const list = (urls) => `[\n${urls.map((entry) => `  ${JSON.stringify(entry)},`).join('\n')}\n]`;

// Function replacements, not string ones. `String.replace` reads `$&` and `$'` in a replacement
// string as instructions, and three of these four replacements are file names. Nothing in `dist/`
// carries a `$` today, and a build that silently emitted a corrupt worker would be a poor way to
// find out that had changed.
const worker = [
  ["'__CACHE_VERSION__'", JSON.stringify(version)],
  ["'__APP_VERSION__'", JSON.stringify(PKG.version ?? '')],
  ['__PRECACHE_CRITICAL__', list(critical)],
  ['__PRECACHE_OPTIONAL__', list(optional)],
  ['__SHELL_URL__', JSON.stringify(BASE)],
].reduce((source, [placeholder, value]) => source.replace(placeholder, () => value), template);

writeFileSync(join(DIST, 'sw.js'), worker);

const bytes = entries.reduce((total, entry) => total + statSync(entry.full).size, 0);
console.log(
  `sw.js  ${version}  ${critical.length} shell + ${optional.length} art  ${(bytes / 1024 / 1024).toFixed(2)} MB  base ${BASE}`,
);
