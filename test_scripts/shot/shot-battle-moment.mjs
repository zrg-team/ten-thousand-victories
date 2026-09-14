// Screenshots the Moment card with a question drawn from the deck, and prints what it drew — a
// shot harness passes on a blank frame, so the strings it found are part of the check.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('output/web-game', { recursive: true });
const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
// HEIGHT shoots it on the short screen the design clamps to, which is where reachability is
// actually a question — the card sits in the order dock's band, and that band moves with the field.
const page = await browser.newPage({ viewport: { width: 390, height: Number(process.env.HEIGHT ?? 844) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate((s) => window.__startBenchGame(s, 'ascent', 'v1'), Number(process.env.SEED ?? 20260812));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene') && !!window.__mandateState,
  null, { timeout: 30000 });
await page.waitForTimeout(800);
const FIRST = `(p) => { const o = p.options ?? [];
  switch (p.kind) {
    case 'founder': return p.options[0];
    case 'power-draft': return p.cards?.[0] ?? 'skip';
    case 'conquer-target': return p.targets?.[0]?.landId ?? 'hold';
    case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
    case 'hero-choice': return p.heroIds?.[0] ?? 'pass';
    case 'court-appointment': return p.options[0].id;
    case 'law-choice': return p.projectIds?.[0] ? 'edict:' + p.projectIds[0] : 'hold';
    case 'parliament': return 'decline';
    default: return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
  } }`;
const found = await page.evaluate(async (src) => {
  const st = window.__mandateState;
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { fightRound } = await import('/src/systems/ascent/BattleSystem.ts');
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const world = window.__phaserGame.scene.getScene('ConquestScene');
  const first = eval(src);
  for (let t = 0; t < 200 && !st.ascent.activeBattle; t += 1) {
    advanceAscentTick(st); world.refresh();
    let g = 0;
    while (st.pendingAscentPrompt && g++ < 12) resolveAscentPrompt(st, first(st.pendingAscentPrompt));
    ui.events.emit('state-changed');
  }
  if (!st.ascent.activeBattle) return null;
  ui.releaseBattleHold();
  for (let i = 0; i < 40 && !st.ascent.activeBattle.moment && !st.ascent.activeBattle.over; i += 1) fightRound(st);
  ui.events.emit('state-changed');
  await new Promise((r) => setTimeout(r, 600));
  const texts = [];
  const walk = (o) => { if (o.text) texts.push(o.text); if (o.list) o.list.forEach(walk); };
  ui.battleUi?.moment?.list.forEach(walk);
  return { id: st.ascent.activeBattle.moment?.id ?? null, texts };
}, FIRST);
console.log(JSON.stringify(found, null, 1));
await page.waitForTimeout(400);
await page.screenshot({ path: `output/web-game/battle-moment${process.env.HEIGHT ? `-${process.env.HEIGHT}` : ''}.png` });
console.log('ERRORS', errors.slice(0, 3));
await browser.close();
