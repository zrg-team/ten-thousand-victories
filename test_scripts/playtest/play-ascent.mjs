// Plays Dragon Ascent the way a thinking player would, and writes a full journal of the
// experience: every prompt raised, every option offered (with whether it was actually
// affordable), what was chosen, and the power/threat/economy curves season by season.
//
// This is a *review* harness, not a regression gate — verify-ascent.mjs is that. The point
// here is to answer "is this fun", so it measures the things fun is made of: decision
// density, how many decisions were real choices rather than one legal move, whether the
// threat curve ever actually threatens, and whether the player's picks change the outcome.
//
// Usage: node test_scripts/playtest/play-ascent.mjs [seed] [maxTicks] [--shots]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const SEED = Number(process.argv[2] ?? 424242);
const MAX_TICKS = Number(process.argv[3] ?? 320);
const SHOTS = process.argv.includes('--shots');

if (SHOTS) mkdirSync('output/web-game/play', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 });
await page.evaluate((s) => window.__startBenchGame(s, 'ascent', 'v1'), SEED);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(600);

await page.evaluate(() => {
  window.__play = {};
});

// ── The policy + instrumentation, injected once ──────────────────────────────
await page.evaluate(async () => {
  const st = window.__mandateState;
  const PID = 'dai-viet';

  const TICK = await import('/src/systems/ascent/AscentTick.ts');
  const RES = await import('/src/systems/ascent/AscentResolver.ts');
  const PW = await import('/src/systems/ascent/PowerSystem.ts');
  const WD = await import('/src/systems/ascent/WaveDirector.ts');
  const I18N = await import('/src/i18n/index.ts');

  const owned = () => st.lands.filter((l) => l.ownerId === PID);
  const armySize = () => st.armies.filter((a) => a.kingdomId === PID)
    .reduce((s, a) => s + a.units.spearmen + a.units.archers + a.units.heavyInfantry, 0);

  const log = { prompts: [], seasons: [], events: [], deaths: [] };
  const seenToast = new Set();

  // ── Reading a prompt the way the player reads the screen ───────────────────
  function describe(p) {
    switch (p.kind) {
      case 'founder': return { title: 'Choose your founder', opts: p.options.map((id) => ({ id, label: id, ok: true })) };
      case 'power-draft': return {
        title: `Power Draft (level ${p.level})`,
        opts: [...p.cards.map((id) => ({ id, label: id, ok: true })), { id: 'skip', label: 'skip', ok: true }],
      };
      case 'conquer-target': return {
        title: 'Which province',
        opts: [...p.targets.map((t) => ({
          id: t.landId,
          label: `${t.landName} [${t.methods.filter((m) => !m.blockedReason).map((m) => m.method).join('/') || 'none open'}]`,
          ok: t.methods.some((m) => !m.blockedReason),
        })), { id: 'hold', label: 'hold', ok: true }],
      };
      case 'conquer-method': return {
        title: `How to take ${p.target.landName}`,
        opts: [...p.target.methods.map((m) => ({
          id: m.method,
          label: `${m.method}${m.blockedReason ? ` (BLOCKED: ${m.blockedReason})` : ''}${m.winChance ? ` ${m.winChance}%` : ''}`,
          ok: !m.blockedReason,
        })), { id: 'back', label: 'back', ok: true }],
      };
      case 'hero-choice': return {
        title: `A champion answers (${p.source}${p.pityUsed ? ', pity' : ''})`,
        opts: [...p.heroIds.map((id) => ({ id, label: id, ok: true })), { id: 'pass', label: 'pass', ok: true }],
      };
      case 'court-appointment': return {
        title: `Where does ${p.heroId} serve`,
        opts: p.options.map((o) => ({ id: o.id, label: `${o.id}${o.blockedReason ? ' (BLOCKED)' : ''}`, ok: !o.blockedReason })),
      };
      case 'law-choice': return {
        title: `Decree a law (${p.points} pts)`,
        opts: [...p.projectIds.map((id) => ({ id, label: id, ok: true })),
          ...p.taxOptions.map((tx) => ({ id: `tax:${tx}`, label: `tax ${tx}`, ok: true }))],
      };
      case 'parliament': return { title: `Parliament: ${p.cardId}`, opts: (() => {
        const card = st.activePoliticsCard ?? st.politicsDeck.find((c) => c.id === p.cardId);
        return (card?.choices ?? []).map((c) => ({ id: c.id, label: c.id, ok: true })).concat([{ id: 'decline', label: 'decline', ok: true }]);
      })() };
      case 'envoy': return {
        title: `Envoy to ${p.kingdomName} (rel ${Math.round(p.relations)}, pow ${Math.round(p.power)})`,
        opts: p.options.map((o) => ({ id: o.id, label: `${o.id}${o.affordable === false ? ' (unaffordable)' : ''}`, ok: o.affordable !== false })),
      };
      case 'battle': {
        const b = st.ascent.activeBattle;
        return {
          title: `Battle at ${b?.landName} vs ${b?.kingdomName} — round ${b?.round}/${b?.totalRounds}`,
          opts: ['press', 'hold', 'retreat', 'auto'].map((id) => ({ id, label: id, ok: true })),
        };
      }
      // The province card: take the free, permanent lever where there is one —
      // posting a champion spends the one person the court has.
      case 'province-order': return (p.options.find((o) => o.role === 'focus') ?? p.options[0]).id;
      case 'famine': return {
        title: `Famine — short ${Math.round(p.shortfall)} food/season`,
        opts: p.options.map((o) => ({ id: o.id, label: `${o.id}${o.food ? ` +${Math.round(o.food)}f` : ''}${o.affordable ? '' : ' (unaffordable)'}`, ok: o.affordable })),
      };
      case 'rival-demand': return {
        title: `${p.kingdomName} demands ${p.demand}${p.gold ? ` (${Math.round(p.gold)}g)` : ''}`,
        opts: p.options.map((o) => ({ id: o.id, label: `${o.id}${o.affordable === false ? ' (unaffordable)' : ''}`, ok: o.affordable !== false })),
      };
      case 'empire-response': return {
        title: `Wave ${p.wave} from ${p.kingdomName} — threat ${Math.round(p.threat)}`,
        opts: p.options.map((o) => ({
          id: o.id,
          label: `${o.id}${o.cost?.gold ? ` ${o.cost.gold}g` : ''}${o.winChance ? ` win ${o.winChance}%` : ''}${o.affordable ? '' : ' (unaffordable)'}`,
          ok: o.affordable,
        })),
      };
      case 'wave-result': return { title: `Great Invasion ${p.wave} ${p.survived ? 'held' : 'LOST'}`, opts: [{ id: 'ok', label: 'ok', ok: true }] };
      case 'run-over': return { title: `RUN OVER score ${p.score}`, opts: [{ id: 'ok', label: 'ok', ok: true }] };
      default: return { title: p.kind, opts: [] };
    }
  }

  // ── A thinking player's policy ─────────────────────────────────────────────
  // Deliberately not "first option": a review of whether choices matter is worthless if the
  // reviewer never chooses. This plays to survive: army when threatened, economy when safe,
  // never pays extortion it can dodge, and takes ground when the odds are good.
  function choose(p, d) {
    const legal = d.opts.filter((o) => o.ok);
    const pick = (id) => legal.find((o) => o.id === id)?.id;
    const threatRatio = st.ascent.threat / Math.max(1, st.ascent.defensePower);
    const gold = st.resources.gold;

    switch (p.kind) {
      case 'founder': return legal[0].id;

      case 'power-draft': {
        // Prefer army when under pressure, economy when comfortable — the actual read.
        const wantArmy = threatRatio > 0.55;
        const byName = (frag) => p.cards.find((c) => c.includes(frag));
        const armyPick = byName('army') ?? byName('war') ?? byName('levy') ?? byName('drill') ?? byName('wall') ?? byName('fort');
        const ecoPick = byName('gold') ?? byName('trade') ?? byName('farm') ?? byName('market') ?? byName('tax');
        return (wantArmy ? (armyPick ?? ecoPick) : (ecoPick ?? armyPick)) ?? p.cards[0];
      }

      case 'conquer-target': {
        const takeable = p.targets.filter((t) => t.methods.some((m) => !m.blockedReason));
        if (!takeable.length) return 'hold';
        // Don't open a new front while a wave is on the map.
        if (st.invasions?.length && threatRatio > 0.7) return 'hold';
        return takeable[0].landId;
      }

      case 'conquer-method': {
        const open = p.target.methods.filter((m) => !m.blockedReason);
        if (!open.length) return 'back';
        // Bloodless first when it's affordable; storm only at good odds.
        const order = ['settle', 'bribe', 'diplomacy', 'intimidation', 'occupy', 'siege'];
        for (const want of order) {
          const m = open.find((o) => o.method === want);
          if (!m) continue;
          if ((want === 'siege' || want === 'occupy') && (m.winChance ?? 0) < 55) continue;
          return m.method;
        }
        return 'back';
      }

      case 'hero-choice': return p.heroIds[0];

      case 'battle': {
        // Press when winning, pull out when the host is being gutted — the read a player makes.
        const b = st.ascent.activeBattle;
        if (!b) return 'hold';
        const oursLeft = b.ourNow / Math.max(1, b.ourStart);
        const theirsLeft = b.theirNow / Math.max(1, b.theirStart);
        if (oursLeft < 0.45 && oursLeft < theirsLeft) return 'retreat';
        return oursLeft > theirsLeft ? 'press' : 'hold';
      }

      case 'famine': {
        // Buy the way out when the treasury allows it; otherwise trade whatever store is
        // least needed. Enduring is the last resort, exactly as a player would treat it.
        return pick('buy-grain') ?? pick('slaughter-herds') ?? pick('requisition') ?? 'endure';
      }

      case 'court-appointment': {
        const free = p.options.filter((o) => !o.blockedReason);
        // Keep a commander spare when a wave is near; otherwise fill the court.
        const wantsField = threatRatio > 0.5 || st.armies.filter((a) => a.kingdomId === PID).length === 0;
        const reserve = free.find((o) => o.id === 'reserve');
        const seat = free.find((o) => o.id !== 'reserve');
        return (wantsField ? (reserve ?? seat) : (seat ?? reserve)).id;
      }

      case 'law-choice': return legal[0].id;
      case 'parliament': return legal[0].id;

      case 'envoy': return pick('trade') ?? pick('gift') ?? legal[0].id;

      case 'rival-demand': {
        // Pay only when genuinely outmatched; otherwise refuse and take the consequences.
        const weak = threatRatio > 0.85;
        if (p.demand === 'tribute') return (weak && pick('pay')) || pick('refuse') || legal[0].id;
        if (p.demand === 'coalition') return (gold > 3000 && pick('buy-off')) || pick('pact') || pick('endure') || legal[0].id;
        return pick('defy') || legal[0].id;
      }

      case 'empire-response': {
        const opt = (id) => p.options.find((o) => o.id === id && o.affordable);
        const best = [...p.options].filter((o) => o.affordable && o.winChance).sort((a, b) => b.winChance - a.winChance)[0];
        // Losing badly and rich → mercenaries. Comfortable → endure and bank momentum.
        if (best && best.winChance < 65 && opt('hire-mercenaries')) return 'hire-mercenaries';
        if (best && best.winChance < 55 && opt('buy-off')) return 'buy-off';
        if (best && best.winChance < 80 && opt('send-host')) return 'send-host';
        if (best && best.winChance < 85 && opt('fortify')) return 'fortify';
        return 'endure';
      }

      default: return legal[0]?.id ?? d.opts[0]?.id;
    }
  }

  window.__play.run = (ticks) => {
    let promptsThisCall = 0;
    for (let i = 0; i < ticks; i++) {
      // Answer everything the game asks before letting time move — the player is at the wheel.
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 12) {
        const p = st.pendingAscentPrompt;
        if (p.kind === 'run-over') break;
        const d = describe(p);
        const choiceId = choose(p, d);
        const realChoice = d.opts.filter((o) => o.ok).length;
        // Spread between the best and worst affordable outcome. A card whose options all
        // predict the same result is a fake decision, and this is how that shows up.
        const chances = (p.options ?? []).filter((o) => o.affordable && o.winChance).map((o) => o.winChance);
        // Does buying anything actually change the outcome? With a threshold-and-noise battle
        // model the honest question is not "how many points apart are these options" but
        // "does any of them move the realm across the line".
        let decisive = null;
        if (p.kind === 'empire-response') {
          const base = p.options.find((o) => o.id === 'endure')?.winChance ?? 0;
          decisive = p.options.some((o) => o.affordable && o.id !== 'endure'
            && ((o.winChance ?? 0) > base + 5 || o.id === 'buy-off'));
        }
        log.prompts.push({
          turn: st.turn, kind: p.kind, title: d.title,
          opts: d.opts.map((o) => o.label), legal: realChoice, chose: choiceId,
          spread: chances.length > 1 ? Math.max(...chances) - Math.min(...chances) : null,
          decisive,
          power: st.ascent.power, threat: Math.round(st.ascent.threat),
          def: st.ascent.defensePower, gold: Math.round(st.resources.gold),
        });
        promptsThisCall++;
        if (!RES.resolveAscentPrompt(st, choiceId)) {
          log.events.push(`T${st.turn} !! unresolvable ${p.kind} choice=${choiceId}`);
          st.pendingAscentPrompt = undefined;
          break;
        }
      }
      if (st.pendingAscentPrompt?.kind === 'run-over' || st.isDefeated) break;

      const landsBefore = owned().length;
      TICK.advanceAscentTick(st);

      for (const toast of (st.toasts ?? [])) {
        if (seenToast.has(toast.id)) continue;
        seenToast.add(toast.id);
        if (toast.kind === 'threat') log.events.push(`T${st.turn} ⚔ ${toast.text}`);
      }
      const landsAfter = owned().length;
      if (landsAfter < landsBefore) log.deaths.push(`T${st.turn} lost ${landsBefore - landsAfter} province(s) → ${landsAfter}`);

      log.seasons.push({
        turn: st.turn, year: st.year, lands: owned().length, army: armySize(),
        power: st.ascent.power, def: st.ascent.defensePower, threat: Math.round(st.ascent.threat),
        wave: st.ascent.wave, level: st.ascent.level,
        gold: Math.round(st.resources.gold), goldRate: Math.round(st.resourceRates.gold),
        food: Math.round(st.resources.food), foodRate: Math.round(st.resourceRates.food),
        invasions: st.invasions?.length ?? 0,
        paused: Boolean(st.pendingAscentPrompt),
        // `beginBattle` stamps this once per engagement it opens. Counting `battle` prompts does
        // not work — a battle is a *lane* the player opens from the action bar, not a prompt — and
        // an engagement can open and finish inside one tick, so sampling `activeBattle` misses it.
        watchKey: st.ascent.lastWatchedKey ?? null,
      });
    }
    return promptsThisCall;
  };

  window.__play.report = () => ({
    log,
    over: Boolean(st.isDefeated),
    finalTurn: st.turn, finalYear: st.year,
    score: st.pendingAscentPrompt?.kind === 'run-over' ? st.pendingAscentPrompt.score : null,
    waves: st.ascent.wave, wavesSurvived: st.ascent.wavesSurvived,
    lands: owned().length, level: st.ascent.level,
    peakPower: st.ascent.peakPower,
  });

  window.__play.snapshot = () => ({
    turn: st.turn, kind: st.pendingAscentPrompt?.kind ?? null,
  });
});

// ── Run in chunks so screenshots can be taken at live moments ────────────────
const CHUNK = 20;
let done = 0;
let shot = 0;
while (done < MAX_TICKS) {
  await page.evaluate((n) => window.__play.run(n), Math.min(CHUNK, MAX_TICKS - done));
  done += CHUNK;
  const snap = await page.evaluate(() => window.__play.snapshot());
  if (SHOTS && shot < 8) {
    await page.evaluate(() => {
      window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
    });
    await page.waitForTimeout(260);
    await page.screenshot({ path: `output/web-game/play/t${String(snap.turn).padStart(3, '0')}.png` });
    shot++;
  }
  const r = await page.evaluate(() => window.__play.report());
  if (r.over) break;
}

const out = await page.evaluate(() => window.__play.report());
await browser.close();

// ── Report ───────────────────────────────────────────────────────────────────
const { log } = out;
const L = [];
const say = (s = '') => { L.push(s); console.log(s); };

say(`═══ DRAGON ASCENT — PLAYTHROUGH seed ${SEED} ═══`);
say('');
say('── DECISION LOG ──');
for (const p of log.prompts) {
  say(`T${String(p.turn).padStart(3)} [${p.kind.padEnd(17)}] ${p.title}`);
  say(`      opts: ${p.opts.join(' | ')}`);
  say(`      → ${p.chose}   (pow ${p.power} def ${p.def} threat ${p.threat} gold ${p.gold})`);
}

say('');
say('── SEASON CURVE (every 5th) ──');
say('turn  yr  lnd  army  POWER   def  threat  T/D   wv lv   gold(+r)   food(+r)  inv');
for (const s of log.seasons) {
  if (s.turn % 5 !== 0) continue;
  const td = (s.threat / Math.max(1, s.def)).toFixed(2);
  say(`${String(s.turn).padStart(4)} ${String(s.year).padStart(3)} ${String(s.lands).padStart(4)} ${String(s.army).padStart(5)} ${String(s.power).padStart(6)} ${String(s.def).padStart(5)} ${String(s.threat).padStart(7)} ${td.padStart(5)} ${String(s.wave).padStart(4)} ${String(s.level).padStart(2)} ${String(s.gold).padStart(6)}(+${String(s.goldRate).padStart(3)}) ${String(s.food).padStart(6)}(+${String(s.foodRate).padStart(3)}) ${String(s.invasions).padStart(3)}`);
}

say('');
say('── THREAT EVENTS ──');
log.events.slice(0, 60).forEach((e) => say(e));
say('');
say('── PROVINCES LOST ──');
say(log.deaths.length ? log.deaths.join('\n') : '(none — the realm was never actually hurt)');

// ── Fun metrics ──────────────────────────────────────────────────────────────
const ticks = log.seasons.length;
const byKind = {};
const forcedKind = {};
let forced = 0;
for (const p of log.prompts) {
  byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  if (p.legal <= 1) { forced++; forcedKind[p.kind] = (forcedKind[p.kind] ?? 0) + 1; }
}
const gaps = [];
for (let i = 1; i < log.prompts.length; i++) gaps.push(log.prompts[i].turn - log.prompts[i - 1].turn);
const avgGap = gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2) : 'n/a';
const longestQuiet = gaps.length ? Math.max(...gaps) : 0;
const tdRatios = log.seasons.map((s) => s.threat / Math.max(1, s.def));
const tense = tdRatios.filter((r) => r > 0.7).length;
const trivial = tdRatios.filter((r) => r < 0.35).length;
const lastSeason = log.seasons[log.seasons.length - 1] ?? {};

// How much of the run the player actually gets to watch the map, rather than read a modal.
const modalTicks = log.seasons.filter((s) => s.paused).length;
// Are the response card's options actually different from each other?
const spreads = log.prompts.filter((p) => p.spread !== null).map((p) => p.spread);
const avgSpread = spreads.length ? (spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(1) : 'n/a';
// Which conquest method actually gets used, and how monotonous is it?
const methods = {};
for (const p of log.prompts) if (p.kind === 'conquer-method') methods[p.chose] = (methods[p.chose] ?? 0) + 1;
const topMethod = Object.entries(methods).sort((a, b) => b[1] - a[1])[0];
const methodTotal = Object.values(methods).reduce((a, b) => a + b, 0);
const starving = log.seasons.filter((s) => s.foodRate < 0).length;
// Engagements are counted off the watch key changing, not off prompts. There is no `battle`
// prompt kind — the battle is a lane — so the old reading reported 0 engagements for every run
// including ones that fought dozens, which is exactly the number this harness exists to report.
let engagements = 0;
let prevWatchKey = null;
let firstBattleTurn = null;
for (const s of log.seasons) {
  if (s.watchKey !== prevWatchKey) {
    prevWatchKey = s.watchKey;
    if (s.watchKey) {
      engagements += 1;
      if (firstBattleTurn === null) firstBattleTurn = s.turn;
    }
  }
}

say('');
say('── FUN METRICS ──');
say(`run length             : ${ticks} ticks ≈ ${(ticks * 3.5 / 60).toFixed(1)} min real time`);
say(`outcome                : ${out.over ? `DEFEAT at turn ${out.finalTurn} (score ${out.score})` : `survived ${MAX_TICKS} ticks`}`);
say(`decisions              : ${log.prompts.length}  (1 per ${avgGap} ticks; longest quiet ${longestQuiet} ticks)`);
say(`ticks ending in modal  : ${modalTicks}/${ticks} (${((modalTicks / ticks) * 100).toFixed(0)}%) ← map hidden`);
say(`forced (1 legal opt)   : ${forced} / ${log.prompts.length}  ${JSON.stringify(forcedKind)}`);
say(`kinds seen             : ${JSON.stringify(byKind)}`);
say(`conquest methods used  : ${JSON.stringify(methods)} — top ${topMethod ? `${topMethod[0]} ${((topMethod[1] / methodTotal) * 100).toFixed(0)}%` : 'n/a'}`);
const responses = log.prompts.filter((p) => p.kind === 'empire-response');
const decisiveCount = responses.filter((p) => p.decisive).length;
say(`response win-% spread  : ${avgSpread} pts avg between best and worst affordable option`);
say(`  ...where gold decided : ${decisiveCount}/${responses.length} response cards had a purchase that changed the outcome`);
say(`tense seasons (T/D>.7) : ${tense}/${ticks} (${((tense / ticks) * 100).toFixed(0)}%)`);
say(`trivial (T/D<.35)      : ${trivial}/${ticks} (${((trivial / ticks) * 100).toFixed(0)}%)`);
say(`seasons losing food    : ${starving}/${ticks}`);
say(`field battles watched : ${engagements} engagements, first at turn ${firstBattleTurn ?? '—'}`);
const peakLands = Math.max(...log.seasons.map((s) => s.lands), 0);
const peakTurn = (log.seasons.find((s) => s.lands === peakLands) ?? {}).turn;
say(`provinces lost         : ${log.deaths.length}`);
say(`realm arc              : peak ${peakLands} lands @ t${peakTurn} → ended ${lastSeason.lands}`);
say(`waves                  : ${out.waves} reached, ${out.wavesSurvived} survived`);
say(`final                  : lands ${out.lands}, level ${out.level}, peak POWER ${out.peakPower}`);
say(`gold end / income      : ${lastSeason.gold} / +${lastSeason.goldRate} = ${(lastSeason.gold / Math.max(1, lastSeason.goldRate)).toFixed(1)} seasons banked`);
say(`console errors         : ${errors.length ? errors.slice(0, 4).join(' ; ') : 'none'}`);

writeFileSync(`output/play-ascent-${SEED}.txt`, L.join('\n'), 'utf8');
console.log(`\n(written to output/play-ascent-${SEED}.txt)`);
