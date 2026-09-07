/**
 * Stages the unpacked builds as Steam depot content.
 *
 * `electron-builder --dir` writes one unpacked folder per platform under `../dist/`; this copies
 * each into `content/<platform>/`, which the depot definitions beside this file point at, and
 * strips the two things that must never ship: the local `steam_appid.txt` (Steam sets the real
 * id, and a stray file means the build launches as App 480) and debug symbols.
 *
 * Then:  steamcmd +login <account> +run_app_build <absolute path>/app_build.vdf +quit
 *
 * Run from `apps/desktop`: `node steam/stage.mjs`. Nothing here needs Steam installed.
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const content = join(here, 'content');

/** electron-builder's unpacked folder names → the depot folder each feeds. */
const PLATFORMS = [
  ['win-unpacked', 'windows'],
  ['mac', 'macos'],
  ['mac-arm64', 'macos'],
  ['linux-unpacked', 'linux'],
];

const built = new Set(await readdir(dist).catch(() => []));
let staged = 0;
for (const [folder, platform] of PLATFORMS) {
  if (!built.has(folder)) continue;
  const from = join(dist, folder);
  const to = join(content, platform);
  await rm(to, { recursive: true, force: true });
  await mkdir(to, { recursive: true });
  await cp(from, to, {
    recursive: true,
    filter: (path) => !/steam_appid\.txt$|\.pdb$/i.test(path),
  });
  const size = await folderSize(to);
  console.log(`${platform.padEnd(8)} <- ${folder}  ${(size / 1024 / 1024).toFixed(1)} MB`);
  staged += 1;
}

if (staged === 0) {
  console.error(`Nothing under ${dist}. Run \`npm run dist\` (or \`yarn desktop:build\` at the root) first.`);
  process.exit(1);
}
console.log(`\nstaged under ${content} — now: steamcmd +login <account> +run_app_build ${join(here, 'app_build.vdf')} +quit`);

async function folderSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? await folderSize(path) : (await stat(path)).size;
  }
  return total;
}
