/**
 * The dynamic half of the app config. `app.json` is still the static base; Expo reads this file
 * instead and hands it that object as `config`, so everything not overridden below passes through
 * untouched.
 *
 * It exists to make one number mean one thing across three surfaces. Before it, the web build's
 * version came from the repository root's `package.json`, the cabinet's came from a hand-edited
 * copy in `app.json`, and the two had already drifted a release apart — the game showed 0.3.4 in
 * its own menu while the site it was built from said 0.3.5. There is no way to keep two hand-kept
 * copies of the same number in step, so there is now only one.
 *
 *   version      the repository root's package.json — the number players see, everywhere
 *   buildNumber  the commit count — the same stamp the web build and the cabinet already use
 *
 * ## Why the build number is read from a file rather than from git
 *
 * `git rev-list` is the true source, and it is `scripts/sync-web.mjs` that runs it, writing the
 * answer to `assets/web-version.json`. This file reads that answer rather than asking git again,
 * because this config is evaluated **twice**: once here, and once more by `expo prebuild` on an
 * EAS build machine — which receives an upload of the working tree and has no repository history
 * to count. Asking git there yields nothing, and the fallback would silently disagree with the
 * number computed locally. The stamp is uploaded with everything else in `assets/`, so both
 * evaluations read the same byte.
 *
 * The git call below is only for the case where nothing has been synced yet.
 */
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const pkg = require(join(root, 'package.json'));

/**
 * **The native runtime: which binaries an over-the-air update may be delivered to.**
 *
 * expo-updates hands an update only to a binary whose runtime version matches it exactly. This was
 * `{ policy: 'appVersion' }` — the full version, bumped with every web release — so every release
 * moved the runtime too: the 1.1.5 update was published for runtime 1.1.5 while every phone ran a
 * 1.1.2 binary, and no phone could see it.
 *
 * **The runtime is the release line: major.minor.** Every 1.1.x binary is runtime `1.1` and takes
 * every 1.1.x update; 1.2.0 starts runtime `1.2`, which no 1.1 binary is ever offered. So the
 * rule is: **a patch release (1.1.x) must not touch the native side** — no Expo SDK upgrade, no
 * native module added or updated, nothing in `plugins/`, `patches/` or `app.json` that prebuild
 * turns into native code. A change like that is a minor release: bump to 1.2.0 and ship new store
 * binaries. `scripts/eas-update.mjs` checks this before it publishes (`native-lines.json`).
 *
 * The binaries built before this rule carry their full version (1.1.0, 1.1.1, 1.1.2) and cannot be
 * changed from here; `scripts/eas-update.mjs` publishes each update to those runtimes as well, by
 * evaluating this file once per runtime with `VAN_THANG_RUNTIME` set.
 */
const releaseLine = (version) => version.split('.').slice(0, 2).join('.');
const runtimeVersion = process.env.VAN_THANG_RUNTIME || releaseLine(pkg.version);

/** A positive integer, or undefined. Guards every path below against `NaN` reaching the stores. */
const count = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

function buildNumber() {
  const stamp = join(__dirname, 'assets', 'web-version.json');
  if (existsSync(stamp)) {
    try {
      const fromStamp = count(JSON.parse(readFileSync(stamp, 'utf8')).build);
      if (fromStamp) return fromStamp;
    } catch {
      // A truncated stamp is not worth failing a build over; fall through to git.
    }
  }

  try {
    const fromGit = count(
      execFileSync('git', ['rev-list', '--count', 'HEAD'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim(),
    );
    if (fromGit) return fromGit;
  } catch {
    // No git, or no history. A source tarball, or an EAS builder.
  }

  /**
   * Never zero. Play rejects a versionCode of 0 outright, and an iOS build number of "0" sorts
   * below every build already uploaded — both fail at the store rather than here.
   */
  return 1;
}

module.exports = ({ config }) => {
  const build = buildNumber();
  return {
    ...config,
    version: pkg.version,
    runtimeVersion,
    ios: { ...config.ios, buildNumber: String(build) },
    android: { ...config.android, versionCode: build },
  };
};
