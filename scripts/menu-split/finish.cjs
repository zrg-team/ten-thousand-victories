/**
 * The tidying that follows `extract.cjs`, kept together so the whole split is one command.
 *
 * 1. drops imports the scene no longer needs (the code that needed them moved),
 * 2. redraws the import punctuation the pruning left ragged,
 * 3. regroups the scene's members so the facade reads as a table of contents.
 *
 *   node scripts/menu-split/finish.cjs
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC = 'src/scenes/MenuScene.ts';
const OUT_DIR = 'src/scenes/menu';

const modules = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir.split(path.sep).join('/'), e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) modules.push(p);
  }
};
walk(OUT_DIR);
const all = [SRC, ...modules];

const run = (script) => execFileSync(process.execPath, [script, ...all], { encoding: 'utf8' });
process.stdout.write(run('scripts/conquest-split/prune-imports.cjs').split('\n').slice(-3).join('\n') + '\n');
run('scripts/conquest-split/format-imports.cjs');
process.stdout.write(execFileSync(process.execPath, ['scripts/menu-split/order-facade.cjs'], { encoding: 'utf8' }));
console.log(`${SRC}: ${fs.readFileSync(SRC, 'utf8').split('\n').length} lines`);
