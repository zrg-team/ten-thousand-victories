/**
 * Hands the game's shell build to this cabinet.
 *
 * Reads `dist-shell/` from the repository root — written by `yarn build:shell` up there — and
 * copies it whole into `web/`, which `main.js` serves from `app://van-thang`. Whole, and replaced
 * every time: a stale `index.html` pointing at a chunk the new build renamed is the one failure
 * that looks like a bug in the game rather than in the sync.
 *
 * It also carries the game's version into this cabinet's `package.json`, because that is the
 * number Electron stamps on the binary and the one the settings page prints beside the game's
 * own — the repository is the only place a version is typed (`docs/development/desktop-builds.md`).
 *
 * Run from `apps/desktop`: `npm run sync`.
 */
import { cp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cabinet = resolve(here, '..');
const root = resolve(cabinet, '../..');
const source = join(root, 'dist-shell');
const target = join(cabinet, 'web');

if (!(await stat(source).catch(() => null))?.isDirectory()) {
  console.error(`No ${source}.\nRun \`yarn build:shell\` in the repository root first.`);
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });

const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const ownPath = join(cabinet, 'package.json');
const own = JSON.parse(await readFile(ownPath, 'utf8'));
// And where the published site keeps the desktop's game updates (`scripts/desktop-web-manifest.mjs`
// writes them under `desktop/` in the Pages deploy), from the same `homepage` every other URL of the
// site derives from.
const updateUrl = `${rootPackage.homepage.replace(/\/+$/, '')}/desktop`;
if (own.version !== rootPackage.version || own.vanThang?.updateUrl !== updateUrl) {
  own.version = rootPackage.version;
  own.vanThang = { ...own.vanThang, updateUrl };
  await writeFile(ownPath, `${JSON.stringify(own, null, 2)}\n`);
  console.log(`version ${rootPackage.version} and update URL ${updateUrl} carried into apps/desktop/package.json`);
}
if (!(await stat(join(target, 'version.json')).catch(() => null))) {
  // Without it the cabinet cannot tell which game it holds, and takes any download as newer.
  console.error('dist-shell/version.json is missing — rebuild with `yarn build:shell`.');
  process.exit(1);
}

const files = [];
const walk = async (dir) => {
  const { readdir } = await import('node:fs/promises');
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push((await stat(path)).size);
  }
};
await walk(target);
const bytes = files.reduce((sum, size) => sum + size, 0);
console.log(`web/  ${files.length} files  ${(bytes / 1024 / 1024).toFixed(2)} MB  version ${rootPackage.version}`);
