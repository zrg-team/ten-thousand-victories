// The Reckoning, on the real scenes.
//
// `shot-*` harnesses pass on a blank frame, so this one also reports what it found in the modal
// layer — a screenshot nobody looks at is not a check.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: Number(process.env.HEIGHT ?? 844) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
// MenuScene has to be up before the bench bootstrap fires. PreloadScene starts it, and a
// MenuScene that boots *after* the jump wipes `window.__mandateState` in its own create() — so
// waiting only for the hook to exist is a race this script won by luck.
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260812, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(600);

// Drive until a fight has been fought and its card is waiting.
const found = await page.evaluate(async () => {
  const st = window.__mandateState;
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const first = (p) => {
    const o = p.options ?? [];
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards?.[0] ?? 'skip';
      case 'conquer-target': return p.targets?.[0]?.landId ?? 'hold';
      case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
      case 'hero-choice': return p.heroIds?.[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds?.[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': return 'decline';
      default: return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
    }
  };
  for (let tick = 0; tick < 200; tick += 1) {
    advanceAscentTick(st);
    let g = 0;
    while (st.pendingAscentPrompt && g++ < 12) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
    if (st.ascent.pendingAftermath) {
      st.pendingAscentPrompt = undefined;
      // The war spreading to a second front takes the screen *ahead* of the Reckoning by design
      // (`refresh`: the decision does not wait behind the news). This harness is about the card,
      // so an announcement that happens to land on the same tick is stood down first — otherwise
      // whether the card is seen depends on which tick this seed's first fight ends on.
      st.ascent.frontsOpened = undefined;
      ui.events.emit('state-changed');
      return true;
    }
  }
  return false;
});

await page.waitForTimeout(900);
const seen = await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const texts = [];
  const walk = (o) => {
    if (o.text) texts.push(o.text);
    if (o.list) o.list.forEach(walk);
  };
  ui.modalLayer.list.forEach(walk);
  return { lane: ui.openPromptKey, texts: texts.slice(0, 24) };
});
mkdirSync('output/web-game', { recursive: true });
await page.screenshot({ path: 'output/web-game/aftermath.png' });

// ── the last fight of the run ──────────────────────────────────────────────
//
// The Reckoning waits for a clear screen, and the card that ends a run is raised on the same tick
// as the fight that ended it — so the one result that matters most was the one never shown. This
// stages exactly that: a card waiting, and `run-over` on the table with it.
const lastFight = await page.evaluate(async () => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const st = window.__mandateState;
  // Put the screen back to nothing open, then stage the collision.
  ui.dismissAftermath?.();
  ui.openPromptKey = '';
  ui.modalLayer.removeAll(true);
  // Staged the way `raiseAftermath` stages it — the view's gate is what is under test here, not
  // the raiser, which the first half of this script already exercised for real.
  const record = st.ascent.battleHistory[st.ascent.battleHistory.length - 1];
  st.ascent.pendingAftermath = record ? { record, alsoFought: [] } : undefined;
  const raised = Boolean(st.ascent.pendingAftermath);
  st.pendingAscentPrompt = {
    kind: 'run-over', score: 1200, legacyEarned: 30, cause: 'capital', previousBest: 900,
  };
  ui.refresh();
  await new Promise((r) => setTimeout(r, 400));
  return { raised, lane: ui.openPromptKey, modal: ui.modalLayer.list.length };
});
console.log('');
console.log('═══ THE LAST FIGHT OF A RUN ═══');
console.log(JSON.stringify(lastFight));

await browser.close();

console.log('═══ THE RECKONING ═══');
console.log('on screen:');
for (const t of seen.texts) console.log(`  ${t}`);

const has = (re) => seen.texts.some((x) => re.test(x));
const line = (ok, label, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${detail}`);
console.log('');
line(found, 'a fight finishes and leaves a card waiting', String(found));
line(seen.lane === 'lane:aftermath', 'the card takes the screen', seen.lane);
// The butcher's bill, what it bought, and the chronicle line — the three things the card exists
// for. Matched on shape rather than on wording so a translation edit does not fail the gate.
// The bill is a table now — four labelled rows against two columns — not a pair of bar captions
// reading "N of M fell". A card is a surface you press, and a report has nothing on it to press.
line(has(/^(Marched|Ra trận)$/) && has(/^(Fell|Ngã xuống)$/) && has(/^(Left standing|Còn lại)$/),
  "the butcher's bill is on it",
  seen.texts.filter((x) => /^(Marched|Ra trận|Fell|Ngã xuống|Left standing|Còn lại)$/.test(x)).join(' / ') || '-');
line(has(/still standing|còn/), 'what it bought is on it',
  seen.texts.find((x) => /still standing|còn/.test(x)) ?? '-');
line(has(/^Year \d+:|^Năm \d+:/), 'one line of chronicle names the place and the enemy',
  seen.texts.find((x) => /^Year \d+:|^Năm \d+:/.test(x)) ?? '-');
line(seen.texts.length >= 8, 'the card is not blank', `${seen.texts.length} strings drawn`);
line(lastFight.raised, 'a last fight leaves a card waiting', String(lastFight.raised));
line(lastFight.lane === 'lane:aftermath', 'it is read before the run-over screen', lastFight.lane);
line(errors.length === 0, 'no console errors', errors.length ? errors.slice(0, 2).join(' ; ') : 'none');
