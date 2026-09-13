/**
 * A breaking host asks before it dissolves.
 *
 * Reported: "Cấm Quân đã tan rã" with 1.2k grain, 1.1k goods and 2.0k gold in the stores — the
 * ledger dissolved a starving host and the only answer on the card was "So be it". Now a host
 * with men still standing is held at its breaking point, and the `host-lost` card carries a rescue
 * offer priced at the realm's scale (`hostRescue.ts`).
 *
 * Headless: builds one realm, hands it hosts in each crisis, and drives `progressArmyLogistics`
 * and `resolveAscentPrompt` directly.
 *
 *   node test_scripts/verify/verify-host-rescue.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5179';
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });

const r = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { progressArmyLogistics } = await import('/src/systems/WarSystem.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { hostRescueQuote } = await import('/src/systems/ascent/hostRescue.ts');
  const { PLAYER_KINGDOM_ID } = await import('/src/game/constants.ts');
  const { HOST_RESCUE_MORALE } = await import('/src/game/ascentConfig.ts');

  const fresh = () => {
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    for (let i = 0; i < 40 && !st.armies.some((a) => a.kingdomId === PLAYER_KINGDOM_ID && !a.isLevy); i += 1) {
      advanceAscentTick(st);
    }
    const template = st.armies.find((a) => a.kingdomId === PLAYER_KINGDOM_ID && !a.isLevy);
    st.armies = st.armies.filter((a) => a.kingdomId !== PLAYER_KINGDOM_ID);
    st.ascent.promptQueue = [];
    st.pendingAscentPrompt = undefined;
    st.resources.gold = 2000;
    st.resources.food = 1200;
    st.resources.supplies = 1100;
    st.resourceRates.gold = 115;
    return { st, template };
  };
  const addHost = (st, template, id, over = {}) => {
    const home = st.lands.find((l) => l.ownerId === PLAYER_KINGDOM_ID) ?? st.lands[0];
    const army = {
      ...JSON.parse(JSON.stringify(template)),
      id, name: id, kingdomId: PLAYER_KINGDOM_ID, landId: home.id,
      isLevy: false, patron: undefined, generalHeroId: undefined,
      units: { spearmen: 60, archers: 25, heavyInfantry: 8 },
      morale: 4, rations: 0, provisions: 0, starvingTicks: 6, unpaidTicks: 0,
      refit: undefined, resupplyRun: undefined, rescueOffered: undefined,
      inKindSeasons: undefined, inKindSettlements: undefined,
      ...over,
    };
    st.armies.push(army);
    return army;
  };
  const cards = (st) => [st.pendingAscentPrompt, ...st.ascent.promptQueue].filter((p) => p?.kind === 'host-lost');
  const surface = (st, armyId) => {
    const at = st.ascent.promptQueue.findIndex((p) => p.kind === 'host-lost' && p.rescue?.armyId === armyId);
    if (at >= 0) st.pendingAscentPrompt = st.ascent.promptQueue.splice(at, 1)[0];
  };
  const out = {};
  if (!fresh().template) return { error: 'no host to clone' };

  // 1. Starving, rich realm: held, and asked.
  {
    const { st, template } = fresh();
    const host = addHost(st, template, 'camQuan');
    progressArmyLogistics(st);
    const card = cards(st)[0];
    out.held = {
      stillThere: st.armies.includes(host),
      rescue: card?.rescue,
      reason: card?.reason,
      men: card?.men,
    };
    // A second season while the card stands: still held, still one card.
    progressArmyLogistics(st);
    out.heldAgain = { stillThere: st.armies.includes(host), cards: cards(st).length };

    const before = { ...st.resources };
    const quote = hostRescueQuote(st, host);
    surface(st, host.id);
    const answered = resolveAscentPrompt(st, 'rescue');
    out.rescued = {
      answered,
      stillThere: st.armies.includes(host),
      morale: host.morale,
      rations: host.rations,
      provisions: host.provisions,
      starving: host.starvingTicks,
      paid: {
        gold: before.gold - st.resources.gold,
        food: before.food - st.resources.food,
        supplies: before.supplies - st.resources.supplies,
      },
      quote: quote.cost,
      cardsLeft: cards(st).length,
      wantMorale: HOST_RESCUE_MORALE,
    };
    // Fed: the next season does not dissolve it.
    progressArmyLogistics(st);
    out.afterSeason = { stillThere: st.armies.includes(host), cards: cards(st).length };
  }

  // 2. The same host in a far richer realm costs more.
  {
    const { st, template } = fresh();
    const host = addHost(st, template, 'base');
    const base = hostRescueQuote(st, host).cost;
    st.ascent.priceScale = 3;
    st.ascent.wealthScale = { gold: 1.6, food: 1.4, supplies: 1.4 };
    st.resources.gold = 20000;
    st.resources.food = 20000;
    st.resources.supplies = 20000;
    const rich = hostRescueQuote(st, host).cost;
    const big = addHost(st, template, 'big', { units: { spearmen: 600, archers: 250, heavyInfantry: 80 } });
    const bigCost = hostRescueQuote(st, big).cost;
    out.scale = { base, rich, bigCost };
  }

  // 3. Let them go: dissolves, people come home, no second card.
  {
    const { st, template } = fresh();
    const host = addHost(st, template, 'released');
    progressArmyLogistics(st);
    const humans = st.resources.humans;
    // Starvation took its share in the season the host was held, so read the men it still has.
    const men = host.units.spearmen + host.units.archers + host.units.heavyInfantry;
    surface(st, host.id);
    resolveAscentPrompt(st, 'ok');
    out.released = {
      gone: !st.armies.includes(host),
      humansBack: st.resources.humans - humans,
      cards: cards(st).length,
      men,
    };
  }

  // 4. A realm that cannot pay loses it at once, and the card says the price.
  {
    const { st, template } = fresh();
    st.resources.gold = 0;
    st.resources.food = 0;
    st.resources.supplies = 0;
    const host = addHost(st, template, 'poor');
    progressArmyLogistics(st);
    const card = cards(st)[0];
    out.poor = { gone: !st.armies.includes(host), rescue: card?.rescue, unaffordable: card?.unaffordable };
  }

  // 5. Arrears with an empty treasury and full storehouses: offered, paid in goods.
  {
    const { st, template } = fresh();
    st.resources.gold = 0;
    st.resourceRates.gold = -40;
    const host = addHost(st, template, 'unpaid', { morale: 70, rations: 400, provisions: 300, starvingTicks: 0, unpaidTicks: 4, level: 1, elite: 0 });
    progressArmyLogistics(st);
    const card = cards(st)[0];
    out.unpaid = { stillThere: st.armies.includes(host), reason: card?.reason, cost: card?.rescue?.cost };
    if (card) {
      surface(st, host.id);
      resolveAscentPrompt(st, 'rescue');
      out.unpaid.after = { stillThere: st.armies.includes(host), unpaid: host.unpaidTicks };
    }
  }

  // 6. A dropped card is not re-raised: the held host dissolves the next season.
  {
    const { st, template } = fresh();
    const host = addHost(st, template, 'dropped');
    progressArmyLogistics(st);
    const offered = cards(st).length;
    st.ascent.promptQueue = [];
    st.pendingAscentPrompt = undefined;
    progressArmyLogistics(st);
    out.dropped = { offered, gone: !st.armies.includes(host), rescueCards: cards(st).filter((c) => c.rescue).length };
  }

  return out;
});

if (r.error) {
  check('fixture', false, r.error);
} else {
  check('a starving host in a stocked realm is held, not dissolved', r.held.stillThere, JSON.stringify(r.held));
  check('and the card offers a priced rescue', Boolean(r.held.rescue?.cost?.gold) && r.held.reason === 'starved',
    JSON.stringify(r.held.rescue));
  check('it stays held while the card stands, with one card', r.heldAgain.stillThere && r.heldAgain.cards === 1,
    JSON.stringify(r.heldAgain));
  check('rescue keeps the host and restores it',
    r.rescued.answered && r.rescued.stillThere && r.rescued.morale >= r.rescued.wantMorale
      && r.rescued.rations > 0 && r.rescued.provisions > 0 && r.rescued.starving === 0,
    JSON.stringify(r.rescued));
  check('rescue charges exactly the quoted price',
    r.rescued.paid.gold === (r.rescued.quote.gold ?? 0)
      && r.rescued.paid.food === (r.rescued.quote.food ?? 0)
      && r.rescued.paid.supplies === (r.rescued.quote.supplies ?? 0),
    JSON.stringify({ paid: r.rescued.paid, quote: r.rescued.quote }));
  check('the relieved host survives the next season', r.afterSeason.stillThere && r.afterSeason.cards === 0,
    JSON.stringify(r.afterSeason));
  check('the price scales with the realm',
    r.scale.rich.gold > r.scale.base.gold && r.scale.rich.food > r.scale.base.food,
    JSON.stringify({ base: r.scale.base, rich: r.scale.rich }));
  check('and with the size of the host', r.scale.bigCost.gold > r.scale.rich.gold,
    JSON.stringify(r.scale.bigCost));
  check('letting them go dissolves it and sends the men home, with no second card',
    r.released.gone && r.released.humansBack === r.released.men && r.released.cards === 0,
    JSON.stringify(r.released));
  check('a realm that cannot pay loses the host, and the card names the price',
    r.poor.gone && !r.poor.rescue && Boolean(r.poor.unaffordable),
    JSON.stringify(r.poor));
  check('arrears with an empty treasury are offered and paid in goods',
    r.unpaid.stillThere && r.unpaid.reason === 'unpaid' && !r.unpaid.cost?.gold && (r.unpaid.cost?.supplies ?? 0) > 0
      && r.unpaid.after?.stillThere && r.unpaid.after?.unpaid === 0,
    JSON.stringify(r.unpaid));
  check('a dropped offer is not re-raised; the host dissolves', r.dropped.offered === 1 && r.dropped.gone && r.dropped.rescueCards === 0,
    JSON.stringify(r.dropped));
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: a breaking host asks before it dissolves, at the realm\'s price'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
