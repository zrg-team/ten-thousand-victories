/**
 * Publishes the shell build for the desktop cabinet's updater.
 *
 * The phone app gets a newer game through EAS Update and the web through its service worker. The
 * desktop cabinet has neither, so it reads this: a manifest of every file in `dist-shell/` with its
 * size and sha256, written to `<out>/<line>/manifest.json`, where `line` is the version's
 * major.minor. A 1.1 cabinet asks for `1.1/manifest.json` and never sees a 1.2 game — the same rule
 * the phone's runtime version keeps (`apps/mobile/app.config.js`).
 *
 * **Most of the bytes are already published.** The shell build and the web build differ in
 * `index.html` and the hashed bundle under `assets/`; `art/`, `faces/`, `audio/` and the rest of
 * `public/` are copied verbatim into both. So with `--web dist` a file whose bytes match the web
 * build's copy is not written again — its manifest entry points at the web build's own URL — and
 * only the files unique to the shell build are copied under `<out>/<line>/files/`. On Pages that is
 * a few megabytes beside the site instead of a second 126 MB copy of it.
 *
 * Run in the deploy after `yarn build` (which wrote `dist/sw.js`) and `yarn build:shell`:
 *
 *   node scripts/desktop-web-manifest.mjs --web dist --out dist/desktop
 *
 * After `build-sw.mjs` on purpose: the worker precaches what it finds in `dist/`, and a web player
 * has no business downloading the desktop cabinet's files.
 *
 * Without `--web` every file is copied (a local test server, where there is no web build to share).
 * `--version` / `--build` override the numbers in `version.json` — for harnesses that need a "newer"
 * build of the same bytes; never in a deploy.
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const shellDir = resolve(option('shell') ?? 'dist-shell');
const webDir = option('web') ? resolve(option('web')) : undefined;
const outDir = resolve(option('out') ?? 'dist-desktop');

const versionFile = join(shellDir, 'version.json');
const info = JSON.parse(await readFile(versionFile, 'utf8').catch(() => {
  console.error(`No ${versionFile}. Run \`yarn build:shell\` first — it writes version.json.`);
  process.exit(1);
}));
if (option('version')) info.version = option('version');
if (option('build')) info.build = option('build');
const build = Number.parseInt(info.build, 10);
if (!/^\d+\.\d+\.\d+/.test(info.version) || !Number.isFinite(build) || build <= 0) {
  // A build number of 0 is a checkout git could not count, and every cabinet would read it as
  // older than the game it already holds. Refuse rather than publish an update nobody takes.
  console.error(`version.json needs a semver and a positive build number, got ${JSON.stringify(info)}.`);
  process.exit(1);
}
const line = info.version.split('.').slice(0, 2).join('.');
const lineDir = join(outDir, line);
const manifestPath = join(lineDir, 'manifest.json');

// Sharing a web file needs a relative URL from the manifest to it, so the output must sit inside
// the web build — `dist/desktop`, as the deploy publishes it.
const shares = webDir !== undefined && !relative(webDir, outDir).startsWith('..');
if (webDir && !shares) {
  console.warn(`--out ${outDir} is not inside --web ${webDir}; every file will be copied.`);
}

const walk = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
};
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const toUrl = (posixPath) => posixPath.split('/').map((part) => (part === '..' ? part : encodeURIComponent(part))).join('/');

await rm(lineDir, { recursive: true, force: true });
await mkdir(lineDir, { recursive: true });

const files = [];
let hostedBytes = 0;
let sharedBytes = 0;
let hostedCount = 0;
for (const full of (await walk(shellDir)).sort()) {
  const path = relative(shellDir, full).split(sep).join('/');
  const { size } = await stat(full);
  const hash = await sha256(full);
  let url;
  if (shares) {
    const twin = join(webDir, ...path.split('/'));
    const twinStat = await stat(twin).catch(() => null);
    if (twinStat?.isFile() && twinStat.size === size && await sha256(twin) === hash) {
      url = toUrl(posix.relative(relative(webDir, lineDir).split(sep).join('/'), path));
      sharedBytes += size;
    }
  }
  if (!url) {
    const target = join(lineDir, 'files', ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(full, target);
    url = toUrl(`files/${path}`);
    hostedBytes += size;
    hostedCount += 1;
  }
  files.push({ path, size, sha256: hash, url });
}

const manifest = {
  schema: 1,
  line,
  version: info.version,
  build: String(build),
  date: info.date ?? '',
  files,
};
await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
console.log(`desktop ${line}: version ${info.version} build ${build}, ${files.length} files`);
console.log(`  copied ${hostedCount} files (${mb(hostedBytes)} MB) under ${relative(process.cwd(), join(lineDir, 'files'))}`);
console.log(`  shared ${files.length - hostedCount} files (${mb(sharedBytes)} MB) with the web build`);
