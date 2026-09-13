/**
 * Publish one over-the-air update to every binary of the current release line.
 *
 *   yarn mobile:eas:update                  sync the web build, then publish
 *   node scripts/eas-update.mjs --dry-run   print the plan and run the native check only
 *   node scripts/eas-update.mjs --record    after shipping the first binaries of a NEW line
 *                                           (1.2.0 …), record its native side and stop
 *   … -- --message "text"                   anything after `--` goes to every `eas update`
 *
 * **Why more than one publish.** The runtime is the release line (see `app.config.js`): every
 * 1.1.x binary built from now on is runtime `1.1`. The binaries already in players' hands were
 * built under the old full-version policy and carry `1.1.0`, `1.1.1` and `1.1.2` — baked in,
 * unchangeable — so the same update is published once per runtime in `LEGACY_RUNTIMES`. The
 * first publish bundles; the rest reuse that bundle (`--skip-bundler`), since only the manifest's
 * runtime differs.
 *
 * **Why the native check.** An update is only JavaScript and assets. Delivered to a binary whose
 * native side differs from the code that expects it, it crashes on launch. So the native inputs
 * are hashed and compared with the hash recorded for this line in `native-lines.json`; a patch
 * release that changed them is refused: bump to the next minor and ship new store builds.
 */
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const here = join(import.meta.dirname, '..');
const root = join(here, '..', '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const line = version.split('.').slice(0, 2).join('.');

/**
 * Runtimes of binaries built before the runtime became the line, per line. Each was checked to
 * share the line's native side (builds 554–579: no native module, plugin or patch change; only
 * icons and dev scripts). A line started after this rule needs no entry: its binaries are `1.2`.
 */
const LEGACY_RUNTIMES = {
  '1.1': ['1.1.0', '1.1.1', '1.1.2'],
};

/** The inputs prebuild turns into native code: dependencies, the static config, plugins, patches. */
function nativeHash() {
  const hash = createHash('sha256');
  const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
  hash.update(JSON.stringify({ dependencies: pkg.dependencies, devDependencies: pkg.devDependencies }));
  const lock = JSON.parse(readFileSync(join(here, 'package-lock.json'), 'utf8'));
  const { '': _self, ...packages } = lock.packages ?? {};
  hash.update(JSON.stringify(packages));
  const app = JSON.parse(readFileSync(join(here, 'app.json'), 'utf8')).expo;
  // Store numbers, not native code: app.config.js overwrites them on every build anyway.
  delete app.version;
  if (app.ios) delete app.ios.buildNumber;
  if (app.android) delete app.android.versionCode;
  hash.update(JSON.stringify(app));
  for (const folder of ['plugins', 'patches']) {
    const dir = join(here, folder);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      hash.update(`${folder}/${name}\n`);
      hash.update(readFileSync(join(dir, name)));
    }
  }
  return hash.digest('hex');
}

const args = process.argv.slice(2);
const passThrough = args.includes('--') ? args.slice(args.indexOf('--') + 1) : [];
const flags = args.includes('--') ? args.slice(0, args.indexOf('--')) : args;
const dryRun = flags.includes('--dry-run');
const record = flags.includes('--record');

const linesFile = join(here, 'native-lines.json');
const lines = existsSync(linesFile) ? JSON.parse(readFileSync(linesFile, 'utf8')) : {};
const current = nativeHash();

if (record) {
  lines[line] = current;
  writeFileSync(linesFile, `${JSON.stringify(lines, null, 2)}\n`);
  console.log(`recorded the native side of line ${line}: ${current.slice(0, 12)}`);
  process.exit(0);
}

if (!lines[line]) {
  console.error(`No native record for line ${line}. If store binaries of ${line}.x are live and were built
from this native side, run \`node scripts/eas-update.mjs --record\` once, commit native-lines.json, and try again.`);
  process.exit(1);
}
if (lines[line] !== current) {
  console.error(`The native side changed since the ${line}.x binaries were built (a dependency, app.json,
plugins/ or patches/). An update would reach ${line}.x phones whose native code does not match it.
Bump the root package.json to the next minor (e.g. ${line.split('.')[0]}.${Number(line.split('.')[1]) + 1}.0), ship new store builds,
then run \`node scripts/eas-update.mjs --record\` for the new line.`);
  process.exit(1);
}

const runtimes = [line, ...(LEGACY_RUNTIMES[line] ?? [])];
let message = passThrough.includes('--message') || passThrough.includes('-m') ? undefined : '';
if (message === '') {
  try {
    message = `${version}: ${execFileSync('git', ['log', '-1', '--format=%s'], { cwd: root }).toString().trim()}`;
  } catch {
    message = version;
  }
}

console.log(`version ${version} → runtimes ${runtimes.join(', ')}${dryRun ? ' (dry run)' : ''}`);
if (dryRun) process.exit(0);

const windows = process.platform === 'win32';
// The global `eas` CLI, as the old `eas update` script used — not `npx eas`: eas-cli is not a
// dependency here, and npx would go looking for an unrelated npm package named "eas". Windows runs
// `eas.cmd` through the shell, which joins arguments with spaces — so a commit message would arrive
// as a dozen arguments. Quote each one for cmd.exe; elsewhere nothing is joined.
const quote = (arg) => (windows ? `"${String(arg).replace(/"/g, '""')}"` : arg);
runtimes.forEach((runtime, index) => {
  const command = [
    'update', '--branch', 'production', '--non-interactive',
    ...(message !== undefined ? ['--message', message] : []),
    ...(index > 0 ? ['--skip-bundler'] : []),
    ...passThrough,
  ];
  console.log(`\n── runtime ${runtime} ──`);
  const result = spawnSync('eas', command.map(quote), {
    cwd: here,
    stdio: 'inherit',
    shell: windows,
    env: { ...process.env, VAN_THANG_RUNTIME: runtime },
  });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    console.error(`eas update failed for runtime ${runtime}; the runtimes before it were published.`);
    process.exit(result.status || 1);
  }
});
console.log(`\npublished ${version} to ${runtimes.join(', ')}`);
