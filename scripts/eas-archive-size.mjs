/**
 * What would `eas build` upload, and how big is it?
 *
 * EAS refuses a project archive over 2 GB, and it only finds that out after spending a minute and
 * a half compressing one. This answers the same question in about a second, before a build.
 *
 * It is a re-implementation of the EAS CLI's own upload filter, deliberately kept faithful to it:
 *
 *   - the archive root is the git repository root, not the Expo project folder;
 *   - `.easignore` is read from that root and from nowhere else — a copy beside `eas.json` is
 *     never read (this is what made the archive reach 2.1 GB in the first place);
 *   - when `.easignore` exists it REPLACES every .gitignore in the tree rather than adding to it;
 *   - `.git` and `node_modules` are dropped on top of it, always;
 *   - a directory that is excluded is not descended into, exactly as `fs.cp`'s filter behaves.
 *
 * Usage:  node scripts/eas-archive-size.mjs [--all]
 *         --all  list every entry rather than the twenty largest
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The same `ignore` package the EAS CLI uses, borrowed from the Expo project's install. */
const require = createRequire(path.join(root, 'apps/mobile/package.json'));
let ignore;
try {
  ignore = require('ignore');
} catch {
  console.error("Cannot find the 'ignore' package. Run `npm --prefix apps/mobile install` first.");
  process.exit(1);
}

const easignorePath = path.join(root, '.easignore');
if (!fs.existsSync(easignorePath)) {
  console.error('No .easignore at the repository root — every nested .gitignore would be used');
  console.error('instead, and on Windows most of them are silently inert. See .easignore.');
  process.exit(1);
}

// Two matchers, in the CLI's order: its own defaults, then the file.
const matchers = [
  ignore().add('.git\nnode_modules\n'),
  ignore().add(fs.readFileSync(easignorePath, 'utf8')),
];
const ignored = (rel) => matchers.some((m) => m.ignores(rel));

/** Bytes per top-level entry of the archive, and the total. */
const bytes = new Map();
let total = 0;

function walk(dir, key) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (ignored(rel)) continue;
    if (entry.isDirectory()) {
      walk(full, key ?? rel);
    } else if (entry.isFile()) {
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        // A file that vanished mid-walk would not have been uploaded either.
      }
      const bucket = key ?? rel;
      bytes.set(bucket, (bytes.get(bucket) ?? 0) + size);
      total += size;
    }
  }
}

walk(root, null);

const mib = (n) => (n / 1024 ** 2).toFixed(1).padStart(9);
const rows = [...bytes].sort((a, b) => b[1] - a[1]);
const shown = process.argv.includes('--all') ? rows : rows.slice(0, 20);

console.log(`\nWhat \`eas build\` would upload from ${root}\n`);
for (const [name, size] of shown) console.log(`${mib(size)} MiB  ${name}`);
if (shown.length < rows.length) console.log(`${' '.repeat(13)}… and ${rows.length - shown.length} more`);

const LIMIT = 2 * 1024 ** 3;
console.log(`\n${mib(total)} MiB total — ${(total / 1024 ** 3).toFixed(2)} GiB of the 2.00 GiB EAS allows`);
if (total > LIMIT) {
  console.log('\nOver the limit. `eas build` will refuse this upload. Add the offender to .easignore.');
  process.exit(1);
}
