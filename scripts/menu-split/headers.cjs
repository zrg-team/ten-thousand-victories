/**
 * Saves and restores the hand-written header block on each split module.
 *
 * `extract.cjs` writes a placeholder header, so re-cutting the partition would throw away the real
 * ones. Save before a re-run, restore after; files whose contents genuinely changed will want their
 * header read again by a human, and `restore` says which those are.
 *
 *   node scripts/menu-split/headers.cjs save <dir>
 *   node scripts/menu-split/headers.cjs restore <dir>
 */
const fs = require('fs');
const path = require('path');

const MODE = process.argv[2];
const STORE = process.argv[3];
const OUT_DIR = 'src/scenes/menu';
const PLACEHOLDER = 'part of the front page, split out of MenuScene';

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir.split(path.sep).join('/'), e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) files.push(p);
  }
};
walk(OUT_DIR);

/** The leading block comment, if the file opens with one. */
function headerOf(text) {
  if (!text.startsWith('/**')) return null;
  const end = text.indexOf('*/');
  return end < 0 ? null : text.slice(0, end + 2);
}

if (MODE === 'save') {
  const store = {};
  let kept = 0;
  for (const f of files) {
    const h = headerOf(fs.readFileSync(f, 'utf8'));
    if (!h || h.includes(PLACEHOLDER)) continue;
    store[f] = h;
    kept++;
  }
  fs.writeFileSync(STORE, JSON.stringify(store, null, 1));
  console.log(`saved ${kept} hand-written header(s) of ${files.length} module(s)`);
} else if (MODE === 'restore') {
  const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  let restored = 0;
  const missing = [];
  const stale = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const h = headerOf(text);
    if (!store[f]) { missing.push(f); continue; }
    if (!h || !h.includes(PLACEHOLDER)) continue; // already hand-written, leave it
    fs.writeFileSync(f, store[f] + text.slice(h.length));
    restored++;
  }
  for (const f of Object.keys(store)) if (!files.includes(f)) stale.push(f);
  console.log(`restored ${restored} header(s)`);
  if (missing.length) console.log(`NO SAVED HEADER (write one): ${missing.join(', ')}`);
  if (stale.length) console.log(`saved header for a file that no longer exists: ${stale.join(', ')}`);
} else {
  console.error('usage: headers.cjs save|restore <store.json>');
  process.exit(2);
}
