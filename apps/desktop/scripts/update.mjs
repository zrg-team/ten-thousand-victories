/**
 * Publish the game to every desktop cabinet of the current release line — the desktop's
 * `mobile:eas:update`.
 *
 *   yarn desktop:update                         check, deploy main, wait until cabinets can see it
 *   node apps/desktop/scripts/update.mjs --dry-run   the checks and the plan, nothing triggered
 *   node apps/desktop/scripts/update.mjs --record    after shipping the first installers / Steam build
 *                                                    of a NEW line (1.2.0 …), record its cabinet side
 *   node apps/desktop/scripts/update.mjs --check     the cabinet check alone (the deploy runs this)
 *
 * **Where an update comes from.** Not this machine: the Pages deploy of `main` builds the shell
 * build and publishes `desktop/<line>/manifest.json` beside the site (`scripts/desktop-web-manifest.mjs`),
 * and every cabinet on that line reads it (`apps/desktop/updater.js`). So publishing is "get this
 * commit deployed": the script refuses a commit that is not on `origin/main`, follows the deploy that
 * a push already started (or starts one), and waits until the live manifest carries this build.
 *
 * **Why the cabinet check.** An update is only the game. Delivered to a cabinet whose `main.js`,
 * `preload.js`, `updater.js` or Electron differs from what the game expects, it can fail to start —
 * the updater would roll it back, but the player would be left on an old game with no way forward.
 * So the cabinet's inputs are hashed and compared with the hash recorded for this line in
 * `native-lines.json`, exactly as the phone's native side is: a patch release that changed them is
 * refused. Bump to the next minor, ship new installers and a Steam build, `--record` the new line.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const here = join(import.meta.dirname, '..');
const root = join(here, '..', '..');
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = rootPackage.version;
const line = version.split('.').slice(0, 2).join('.');
const manifestUrl = `${rootPackage.homepage.replace(/\/+$/, '')}/desktop/${line}/manifest.json`;
const WORKFLOW = 'deploy-github-pages.yml';

/** What the installed cabinet runs: its three scripts, its package (minus the numbers the sync writes), its locked dependencies. */
function cabinetHash() {
  const hash = createHash('sha256');
  for (const name of ['main.js', 'preload.js', 'updater.js']) {
    hash.update(`${name}\n`);
    // Line endings normalised: a Windows checkout with autocrlf is the same cabinet as CI's.
    hash.update(readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n'));
  }
  const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
  delete pkg.version;
  delete pkg.vanThang;
  hash.update(JSON.stringify(pkg));
  const lock = JSON.parse(readFileSync(join(here, 'package-lock.json'), 'utf8'));
  const { '': _self, ...packages } = lock.packages ?? {};
  hash.update(JSON.stringify(packages));
  return hash.digest('hex');
}

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const record = flags.includes('--record');
const checkOnly = flags.includes('--check');

const linesFile = join(here, 'native-lines.json');
const lines = existsSync(linesFile) ? JSON.parse(readFileSync(linesFile, 'utf8')) : {};
const current = cabinetHash();

if (record) {
  lines[line] = current;
  writeFileSync(linesFile, `${JSON.stringify(lines, null, 2)}\n`);
  console.log(`recorded the cabinet side of line ${line}: ${current.slice(0, 12)}`);
  process.exit(0);
}
if (!lines[line]) {
  console.error(`No cabinet record for line ${line}. If ${line}.x installers or a Steam build are out and were
built from this cabinet, run \`node apps/desktop/scripts/update.mjs --record\` once, commit
apps/desktop/native-lines.json, and try again.`);
  process.exit(1);
}
if (lines[line] !== current) {
  console.error(`The desktop cabinet changed since the ${line}.x installers were built (main.js, preload.js,
updater.js, apps/desktop/package.json or its lock). A game update would reach ${line}.x cabinets
that do not match it. Bump the root package.json to the next minor (e.g. ${line.split('.')[0]}.${Number(line.split('.')[1]) + 1}.0), ship new
installers and a Steam build, then run \`node apps/desktop/scripts/update.mjs --record\` for the new line.`);
  process.exit(1);
}
if (checkOnly) {
  console.log(`cabinet side of line ${line} matches its record`);
  process.exit(0);
}

const git = (...args) => execFileSync('git', args, { cwd: root }).toString().trim();
const gh = (...args) => execFileSync('gh', args, { cwd: root }).toString().trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

git('fetch', 'origin', 'main', '--quiet');
const head = git('rev-parse', 'HEAD');
const build = Number(git('rev-list', '--count', 'HEAD'));
const onMain = spawnSync('git', ['merge-base', '--is-ancestor', head, 'origin/main'], { cwd: root }).status === 0;
const mainHead = git('rev-parse', 'origin/main');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;

console.log(`version ${version} → desktop line ${line}`);
console.log(`  HEAD ${head.slice(0, 8)} (build ${build})${dirty ? ', with uncommitted changes that will NOT be published' : ''}`);
console.log(`  origin/main ${mainHead.slice(0, 8)}${onMain ? '' : ' — HEAD is not on it'}`);
console.log(`  feed ${manifestUrl}`);

if (!onMain) {
  console.error('\nThe deploy publishes origin/main. Push or merge this commit to main first.');
  process.exit(1);
}

const live = async () => {
  try {
    const response = await fetch(`${manifestUrl}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};
const published = await live();
const mainBuild = Number(git('rev-list', '--count', 'origin/main'));
console.log(`  live: ${published ? `version ${published.version} build ${published.build}` : 'nothing published for this line yet'}`);
if (published && Number(published.build) >= mainBuild) {
  console.log(`\nAlready published: cabinets on ${line} can see build ${published.build}.`);
  process.exit(0);
}
if (dryRun) {
  console.log(`\n(dry run) would deploy origin/main (build ${mainBuild}) and wait for the feed to show it.`);
  process.exit(0);
}

// Follow the deploy the push already started; start one only if there is none for main's head.
const runsFor = () => JSON.parse(gh('run', 'list', '--workflow', WORKFLOW, '--commit', mainHead, '--json', 'databaseId,status,conclusion,event', '--limit', '5'));
let run = runsFor().find((r) => r.status !== 'completed' || r.conclusion === 'success');
if (!run) {
  console.log(`\nno deploy of ${mainHead.slice(0, 8)} yet — starting one`);
  gh('workflow', 'run', WORKFLOW, '--ref', 'main');
  for (let i = 0; i < 30 && !run; i += 1) {
    await sleep(2000);
    run = runsFor().find((r) => r.status !== 'completed');
  }
  if (!run) {
    console.error('The deploy was requested but no run appeared. Check the Actions tab.');
    process.exit(1);
  }
}
if (run.status !== 'completed') {
  console.log(`\nfollowing deploy run ${run.databaseId}`);
  const watched = spawnSync('gh', ['run', 'watch', String(run.databaseId), '--exit-status', '--interval', '10'], { cwd: root, stdio: 'inherit' });
  if (watched.status !== 0) {
    console.error(`Deploy run ${run.databaseId} failed; nothing new reached the cabinets.`);
    process.exit(1);
  }
}

// Pages serves the new site a little after the run reports success.
console.log(`\nwaiting for the feed to show build ${mainBuild}`);
for (let i = 0; i < 60; i += 1) {
  const now = await live();
  if (now && Number(now.build) >= mainBuild) {
    console.log(`published ${now.version} build ${now.build} to desktop line ${line} — cabinets pick it up within 30 minutes, or at once from "Check for updates"`);
    process.exit(0);
  }
  if (i === 0 && !now) console.log('  (no manifest yet — if this persists, the deploy skipped the desktop step: see its log for the cabinet check)');
  await sleep(10000);
}
console.error('The deploy finished but the feed still shows an older build after 10 minutes. Open the deploy log.');
process.exit(1);
