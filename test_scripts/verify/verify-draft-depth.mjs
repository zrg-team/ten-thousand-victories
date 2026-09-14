/**
 * Draft depth — §8 of the Tông Phả review ("why upgrades rarely show").
 *
 * Eight seeded runs are played headlessly to run-over by the same always-legal driver
 * `verify-ascent` uses, except that it takes an upgrade whenever one is offered and otherwise the
 * first new card. The draft is tallied: what share of the cards offered are upgrades, how many
 * drafts contain one once the player holds two un-maxed cards, and how many runs end with a
 * deepened deck. Then the rubbing lottery is sampled: how many reveals it takes a held card to
 * reach its third copy, over two hundred trials.
 *
 * Gates (the dossier's numbers, measured where the reserved slot applies — the first two drafts of
 * any run cannot offer an upgrade, and this driver's runs are short): once two un-maxed cards are
 * held, upgrades are ≥ 25% of the cards offered and ≥ 90% of drafts carry one; a run that saw six
 * or more drafts ends with two or more cards at stack 2+; the median rubbings to a third copy is
 * ≤ 8. Card effects are untouched by the tuning — `verify-cabinet` holds that line.
 *
 * Usage: node test_scripts/verify/verify-draft-depth.mjs   (a dev server must already be running)
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const SEEDS = [1337, 4242, 99, 7793, 2026, 311, 725, 5514];

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

console.log('=== EIGHT RUNS ===');
const runs = [];
for (const seed of SEEDS) {
  const run = await page.evaluate(async (seed) => {
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const { findPowerCard } = await import('/src/data/ascentCards.ts');
    let s = seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // A clean house and cabinet: the tally is about the run's own draft, not a carried hand.
    localStorage.removeItem('mandate:dynasty:v1');
    localStorage.removeItem('mandate:cabinet:v1');
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const stacks = () => st.ascent.cardStacks;
    const stackOf = (id) => stacks()[id] ?? 0;
    const unmaxedHeld = () => Object.keys(stacks()).filter((id) => stackOf(id) > 0 && stackOf(id) < (findPowerCard(id)?.maxStacks ?? 1));
    const tally = { drafts: 0, offered: 0, upgradeOffers: 0, draftsWithUpgrade: 0, draftsAfterTwoHeld: 0, draftsAfterTwoHeldWithUpgrade: 0, offeredAfterTwoHeld: 0, upgradesAfterTwoHeld: 0 };
    const seen = new Set();
    let methodCursor = 0;
    let doctrineCursor = 0;
    // `verify-ascent`'s always-legal driver, with one change: the draft prefers an upgrade.
    const choose = (p) => {
      switch (p.kind) {
        case 'founder': return p.options[0];
        case 'power-draft': {
          if (!seen.has(p)) {
            seen.add(p);
            const held = unmaxedHeld();
            const upgrades = p.cards.filter((id) => stackOf(id) > 0);
            tally.drafts += 1;
            tally.offered += p.cards.length;
            tally.upgradeOffers += upgrades.length;
            if (upgrades.length > 0) tally.draftsWithUpgrade += 1;
            if (held.length >= 2) {
              tally.draftsAfterTwoHeld += 1;
              tally.offeredAfterTwoHeld += p.cards.length;
              tally.upgradesAfterTwoHeld += upgrades.length;
              if (upgrades.length > 0) tally.draftsAfterTwoHeldWithUpgrade += 1;
            }
          }
          return p.cards.find((id) => stackOf(id) > 0) ?? p.cards[0] ?? 'skip';
        }
        case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
        case 'conquer-method': {
          const open = p.target.methods.filter((m) => !m.blockedReason);
          return open.length > 0 ? open[methodCursor++ % open.length].method : 'back';
        }
        case 'hero-choice': return p.heroIds[0] ?? 'pass';
        case 'court-appointment': return p.options[0].id;
        case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
        case 'doctrine': return p.options[doctrineCursor++ % p.options.length];
        case 'parliament': {
          const card = st.politicsDeck.find((c) => c.id === p.cardId);
          if (!card) return 'decline';
          const affordable = card.choices.find((c) => Object.entries(c.effects.resourceDelta ?? {})
            .every(([k, v]) => (v ?? 0) >= 0 || st.resources[k] >= Math.abs(v)));
          return affordable ? affordable.id : 'decline';
        }
        case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        case 'world-event': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        case 'battle': return 'hold';
        case 'province-order': return (p.options.find((o) => o.role === 'focus') ?? p.options[0]).id;
        case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
        case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        case 'story-beat':
          return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
        case 'empire-response': {
          const merc = p.options.find((o) => o.id === 'hire-mercenaries' && o.affordable);
          if (merc && st.resources.gold > 2500) return merc.id;
          return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        }
        case 'dynasty-level': return p.options[0];
        default: return 'ok';
      }
    };
    let ticks = 0;
    let over = false;
    while (!over && ticks < 6000) {
      ticks += 1;
      advanceAscentTick(st);
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) {
        const p = st.pendingAscentPrompt;
        if (p.kind === 'run-over' || p.kind === 'next-reign') { over = true; break; }
        if (!resolveAscentPrompt(st, choose(p))) {
          // A refused answer: clear it rather than spin — this harness measures the draft, not the prompt.
          st.pendingAscentPrompt = undefined;
          break;
        }
      }
      if (st.isDefeated) over = true;
    }
    const deck = Object.entries(stacks()).filter(([, n]) => n > 0).map(([id, n]) => `${id}:${n}`);
    const deep = Object.values(stacks()).filter((n) => n >= 2).length;
    return { seed, waves: st.ascent.wavesSurvived, ticks, ...tally, deck, deep };
  }, seed);
  runs.push(run);
  console.log(`seed ${String(run.seed).padEnd(5)} waves ${String(run.waves).padEnd(3)} drafts ${String(run.drafts).padEnd(3)} offered ${String(run.offered).padEnd(3)} upgrades ${String(run.upgradeOffers).padEnd(3)} with-upgrade ${run.draftsWithUpgrade}/${run.drafts} after-2-held ${run.draftsAfterTwoHeldWithUpgrade}/${run.draftsAfterTwoHeld} deep ${run.deep}  ${run.deck.join(' · ')}`);
}

const offered = runs.reduce((sum, run) => sum + run.offered, 0);
const upgrades = runs.reduce((sum, run) => sum + run.upgradeOffers, 0);
const after = runs.reduce((sum, run) => sum + run.draftsAfterTwoHeld, 0);
const afterWith = runs.reduce((sum, run) => sum + run.draftsAfterTwoHeldWithUpgrade, 0);
const upgradeShare = offered > 0 ? upgrades / offered : 0;
const afterShare = after > 0 ? afterWith / after : 0;
const offeredAfter = runs.reduce((sum, run) => sum + run.offeredAfterTwoHeld, 0);
const upgradesAfter = runs.reduce((sum, run) => sum + run.upgradesAfterTwoHeld, 0);
const afterOfferShare = offeredAfter > 0 ? upgradesAfter / offeredAfter : 0;
// The first two drafts of any run cannot offer an upgrade, so the whole-run share is a function
// of run length as much as of the draft; the reserved slot's own promise is measured where it
// applies. The whole-run share is printed beside it.
check('once two un-maxed cards are held, upgrades are at least a quarter of the cards offered', afterOfferShare >= 0.25,
  `${(afterOfferShare * 100).toFixed(1)}% of ${offeredAfter} (whole run: ${(upgradeShare * 100).toFixed(1)}% of ${offered})`);
check('nearly every draft carries an upgrade once two un-maxed cards are held', afterShare >= 0.9, `${(afterShare * 100).toFixed(1)}% of ${after} drafts`);
check('every run that saw six or more drafts ends with two or more cards at stack 2+',
  runs.filter((run) => run.drafts >= 6).every((run) => run.deep >= 2) && runs.some((run) => run.drafts >= 6),
  runs.map((run) => `${run.drafts}d:${run.deep}`).join(','));
check('every run reached at least one draft', runs.every((run) => run.drafts >= 1), runs.map((run) => run.drafts).join(','));

console.log('\n=== THE RUBBING LOTTERY ===');
const lottery = await page.evaluate(async () => {
  const cab = await import('/src/state/cabinet.ts');
  const { POWER_CARDS } = await import('/src/data/ascentCards.ts');
  let s = 4242;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  localStorage.removeItem('mandate:dynasty:v1');
  const target = POWER_CARDS.find((card) => card.rarity === 'bronze' && !card.evolutionOnly && !card.storyOnly);
  const trials = [];
  for (let trial = 0; trial < 200; trial += 1) {
    localStorage.setItem('mandate:cabinet:v1', JSON.stringify({
      rubbings: 500, rubbingPity: 0, cards: { [target.id]: { level: 1, copies: 1 } }, deeds: [], learnedRecipes: [], openingHand: [], packsBought: 0,
    }));
    cab.resetCabinetCache?.();
    let pulls = 0;
    for (; pulls < 200; pulls += 1) {
      const reveal = cab.revealRubbing();
      if (!reveal) break;
      const held = cab.getCabinet().cards[target.id];
      if (held && (held.level >= 2 || held.copies >= 3)) break;
    }
    trials.push(pulls + 1);
  }
  trials.sort((a, b) => a - b);
  localStorage.removeItem('mandate:cabinet:v1');
  cab.resetCabinetCache?.();
  return { target: target.id, median: trials[Math.floor(trials.length / 2)], p90: trials[Math.floor(trials.length * 0.9)] };
});
check('a held card reaches its third copy in eight rubbings on the median', lottery.median <= 8,
  `${lottery.target}: median ${lottery.median}, p90 ${lottery.p90}`);

console.log('\n=== THE DEAL AND THE BINDER ===');
{
  // The deal, in the rendered run: backs turn in order, the held card last, inside 1.6 s planned.
  const run = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const runErrors = [];
  run.on('pageerror', (e) => runErrors.push(e.message));
  await run.addInitScript(() => { localStorage.clear(); localStorage.setItem('mandate:language:v1', 'en'); });
  await run.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await run.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await run.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
  await run.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await run.waitForTimeout(800);
  await run.evaluate(async () => {
    const game = window.__phaserGame;
    const scene = game.scene.getScene('ConquestScene');
    const ui = game.scene.getScene('ConquestUIScene');
    const { offerPowerDraft } = await import('/src/systems/ascent/PowerDraftSystem.ts');
    const state = scene.state;
    state.pendingAscentPrompt = undefined;
    state.ascent.promptQueue = [];
    state.ascent.cardStacks['iron-levy'] = 1;
    state.ascent.cardStacks['rice-tribute'] = 1;
    state.ascent.pendingLevelUps = 1;
    offerPowerDraft(state);
    if (!state.pendingAscentPrompt && state.ascent.promptQueue.length > 0) state.pendingAscentPrompt = state.ascent.promptQueue.shift();
    scene.refresh();
    ui.events.emit('state-changed');
    game.step(performance.now(), 16);
  });
  await run.waitForTimeout(4000);
  const deal = await run.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const scene = window.__phaserGame.scene.getScene('ConquestScene');
    return { deal: ui.data.get('cardFanDeal'), cards: scene.state.pendingAscentPrompt?.cards ?? [] };
  });
  const held = deal.deal?.held ?? [];
  const order = deal.deal?.order ?? [];
  const heldLast = held.length === 0 || held.every((id) => order.indexOf(id) >= order.length - held.length);
  check('the draft deals every card, the held card turns last, inside 1.6 s planned',
    Boolean(deal.deal) && order.length === deal.cards.length && heldLast && deal.deal.totalMs <= 1600,
    deal.deal ? `${order.join(' → ')} (held: ${held.join(',') || 'none'}) in ${deal.deal.totalMs} ms` : 'no deal');
  check('a held card is on the table once two are held', held.length >= 1, `${held.length} held of ${deal.cards.length}`);
  check('the draft page raises no error', runErrors.length === 0, runErrors.slice(0, 2).join(' | '));
  await run.close();

  // The binder: a real face for every held seal, silhouettes for the unfound, both languages.
  for (const lang of ['en', 'vi']) {
    const binder = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const binderErrors = [];
    binder.on('pageerror', (e) => binderErrors.push(e.message));
    await binder.addInitScript((code) => {
      localStorage.clear();
      localStorage.setItem('mandate:language:v1', code);
      localStorage.setItem('mandate:cabinet:v1', JSON.stringify({
        rubbings: 2, rubbingPity: 3, deeds: [], learnedRecipes: [], openingHand: ['salt-roads'], packsBought: 0,
        cards: { 'salt-roads': { level: 2, copies: 2 }, 'feigned-retreat': { level: 1, copies: 3 }, 'fire-arrows': { level: 3, copies: 0 }, 'granary-edict': { level: 1, copies: 0 } },
      }));
    }, lang);
    await binder.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await binder.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await binder.evaluate(() => { const game = window.__phaserGame; game.scene.stop('MenuScene'); game.scene.start('CabinetScene'); });
    await binder.waitForTimeout(1200);
    const faces = await binder.evaluate(() => {
      const c = window.__phaserGame.scene.getScene('CabinetScene');
      const list = c.scroll?.content.list ?? [];
      const faceKeys = new Set(list.filter((o) => o.type === 'Image' && String(o.texture?.key ?? '').startsWith('card-face:')).map((o) => o.texture.key.split(':')[1]));
      const silhouettes = list.filter((o) => o.type === 'Text' && o.text === '?').length;
      const filters = list.filter((o) => o.type === 'Text' && /^(All|Held|Lv2\+|Ready|Tất cả|Đang giữ|Sẵn sàng)$/.test(o.text)).length;
      const ring = list.find((o) => o.getData?.('pityRing') !== undefined)?.getData('pityRing');
      return { faces: [...faceKeys], silhouettes, filters, ring };
    });
    const heldIds = ['salt-roads', 'feigned-retreat', 'fire-arrows', 'granary-edict'];
    check(`${lang} — the binder shows a real face for every held seal and silhouettes for the unfound`,
      heldIds.every((id) => faces.faces.includes(id)) && faces.silhouettes >= 40 && faces.filters === 4 && typeof faces.ring === 'number',
      `faces ${faces.faces.length}, silhouettes ${faces.silhouettes}, filters ${faces.filters}, pity ring ${faces.ring}`);
    check(`${lang} — the binder raises no error`, binderErrors.length === 0, binderErrors.slice(0, 2).join(' | '));
    await binder.close();
  }
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0 ? 'PASS: the deck deepens' : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
