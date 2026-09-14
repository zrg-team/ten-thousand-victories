// Diagnostic: run Dragon Ascent ticks headless (seeded, naive harness policy) and log every
// watched battle tick by tick — who is enrolled, advances, morale, the last log lines — plus the
// realm's armies, invaders, an economy line every ten ticks, and each prompt answered.
//
// Usage: node test_scripts/diag/diag-ascent-battles.mjs [_ ] [ticks] [rngSeed]
//        AUTO=1 …   → battles handed to the generals (roll path)
import { chromium } from 'playwright';

const SEED = Number(process.argv[2] ?? 20260812);
const TICKS = Number(process.argv[3] ?? 60);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`http://127.0.0.1:5179/?capture=1&rng=${process.argv[4] ?? 20260808}&auto=${process.env.AUTO ?? '0'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate((s) => window.__startBenchGame(s, 'ascent', 'v1'), SEED);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(500);

const out = await page.evaluate(async (ticks) => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  let seedRng = Number(new URLSearchParams(location.search).get('rng') ?? 20260808) >>> 0;
  Math.random = () => {
    seedRng = (seedRng + 0x6d2b79f5) | 0;
    let t = Math.imul(seedRng ^ (seedRng >>> 15), 1 | seedRng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  if (new URLSearchParams(location.search).get('auto') === '1') st.ascent.autoResolveBattles = true;
  window.__mandateState = st;
  let methodCursor = 0;
  const lines = [];
  const size = (a) => a.units.spearmen + a.units.archers + a.units.heavyInfantry;
  const firstChoice = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': {
        const open = p.target.methods.filter((m) => !m.blockedReason);
        return open.length > 0 ? open[methodCursor++ % open.length].method : 'back';
      }
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'parliament': {
        const card = st.politicsDeck.find((c) => c.id === p.cardId);
        if (!card) return 'decline';
        const affordable = card.choices.find((c) => Object.entries(c.effects.resourceDelta ?? {})
          .every(([k, v]) => (v ?? 0) >= 0 || st.resources[k] >= Math.abs(v)));
        return affordable ? affordable.id : 'decline';
      }
      case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
      case 'battle': return 'hold';
      // The province card: take the free, permanent lever where there is one —
      // posting a champion spends the one person the court has.
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
      default: return 'ok';
    }
  };
  let prevKey = null;
  for (let i = 0; i < ticks; i += 1) {
    const before = st.armies.filter((a) => a.kingdomId === 'dai-viet').map((a) => `${a.name}:${size(a)}@${a.landId}`);
    advanceAscentTick(st);
    const b = st.ascent.activeBattle;
    const mine = st.armies.filter((a) => a.kingdomId === 'dai-viet').map((a) => `${a.name}:${size(a)}@${a.landId}${a.isLevy ? '(levy)' : ''}`);
    const inv = (st.invasions ?? []).map((r) => { const a = st.armies.find((x) => x.id === r.armyId); return a ? `${a.name}:${size(a)}@${a.landId}${r.plan ? '/' + r.plan : ''}->${r.targetLandId ?? '?'}` : 'gone'; });
    if (b) {
      lines.push(`t${i} BATTLE ${b.key} round ${b.round}/${b.totalRounds} ours=${b.ourNow}/${b.ourStart} theirs=${b.theirNow}/${b.theirStart} adv=${b.ourAdvance.toFixed(2)}+${b.theirAdvance.toFixed(2)} morale=${Math.round(b.ourMorale)}/${Math.round(b.theirMorale)} outcome=${b.outcome} ourIds=${(b.ourArmyIds||[]).join('|')} theirIds=${(b.theirArmyIds||[]).join('|')} broken=${b.brokenHostIds.join('|')}`);
      if (b.log.length) lines.push(`   log: ${b.log.slice(-4).join(' / ')}`);
    }
    if (st.message) lines.push(`t${i} MSG ${st.message}`);
    lines.push(`t${i} ALL=[${st.armies.map((a) => `${a.id}/${a.kingdomId}:${size(a)}@${a.landId}`).join(', ')}] moves=[${st.movementOrders.map((o) => `${o.armyId}->${o.path.join('>')}`).join(', ')}] gold=${Math.round(st.resources.gold)}(${Math.round(st.resourceRates.gold)}) prompt=${st.pendingAscentPrompt?.kind ?? '-'}`);
    lines.push(`t${i} mine=[${mine.join(', ')}] inv=[${inv.join(', ')}] lands=${st.lands.filter((l) => l.ownerId === 'dai-viet').length} pending=${st.pendingBattle ? st.pendingBattle.landName : '-'} watched=${st.ascent.lastWatchedKey}`);
    if (i % 10 === 0) {
      const led = st.ascentLedger?.gold;
      const troops = st.armies.filter((a) => a.kingdomId === 'dai-viet' && !a.isLevy).reduce((n, a) => n + size(a), 0);
      lines.push(`t${i} ECON gold=${Math.round(st.resources.gold)} rate=${Math.round(st.resourceRates.gold)} gross=${led ? Math.round(led.gross) : '?'} demand=${led ? Math.round(led.demand) : '?'} heroes=${st.heroes.length} payroll=${st.heroes.reduce((n, h) => n + h.upkeepGold, 0)} troops=${troops} unpaid=${(st.unpaidLandIds ?? []).length} humans=${Math.round(st.resources.humans)} food=${Math.round(st.resources.food)}(${Math.round(st.resourceRates.food)}) lands=${st.lands.filter((l) => l.ownerId === 'dai-viet').length} front=${st.ascent.frontLandId ?? '-'} marches=${st.ascent.autopilotStats.marches}`);
    }
    let guard = 0;
    while (st.pendingAscentPrompt && guard++ < 10) {
      const p = st.pendingAscentPrompt;
      if (p.kind === 'run-over') { lines.push(`t${i} RUN OVER`); break; }
      const ch = firstChoice(p); lines.push(`t${i} PROMPT ${p.kind} -> ${ch}`);
      if (!resolveAscentPrompt(st, ch)) break;
    }
    if (st.isDefeated) { lines.push(`t${i} DEFEATED cause=${st.ascent.endCause}`); break; }
  }
  const summary = {};
  for (const l of lines) {
    const m = l.match(/^t\d+ MSG (.*)$/);
    if (!m) continue;
    const key = /repelled|beaten back|withdraw beyond/i.test(m[1]) ? 'repelled'
      : /storms .* lays siege/i.test(m[1]) ? 'stormed'
      : /falls!|has fallen/i.test(m[1]) ? 'fell'
      : /raid/i.test(m[1]) ? 'raid'
      : /Battle joined/i.test(m[1]) ? 'battleStart'
      : null;
    if (key) summary[key] = (summary[key] ?? 0) + 1;
  }
  lines.push('SUMMARY ' + JSON.stringify(summary));
  return lines;
}, TICKS);
console.log(out.join('\n'));
console.log('ERRORS', errors);
await browser.close();
