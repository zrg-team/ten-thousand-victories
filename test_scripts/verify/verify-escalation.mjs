/**
 * The escalation ladder, held to its table.
 *
 * Two promises: as a run's waves mount, the fight's effective dials stop going below the
 * `ASCENT_BATTLE_ESCALATION` floors (pace, enemy tier, bubble linger) — but a floor only ever
 * RAISES, so a player already above one feels nothing; and the wave curve answers the realm's
 * own power through `waveMatchFactor`, monotonically and capped. Both are pure reads, so this
 * is cheap enough to run on every change to either table.
 *
 * Usage: node test_scripts/verify/verify-escalation.mjs
 */
import { boot, report } from '../perf/_boot.mjs';

const { browser, page, errors } = await boot({ dpr: 1, quality: 'low' });
await page.waitForFunction(() => window.__phaserGame?.scene?.isActive('MenuScene'), null, { timeout: 30000 });

const out = await page.evaluate(async () => {
  const O = await import('/src/game/battleOptions.ts');
  const C = await import('/src/game/ascentConfig.ts');
  const r = {};

  // A soft-playing player: everything at its gentlest.
  O.setBattleDifficulty('easy');
  O.setBattleSpeed('slow');

  O.setBattleEscalationWave(0);
  r.calm = { beats: O.battleBeatsPerTick(), react: O.battleReactDelay(), bubble: O.battleBubbleMs(), rims: O.battleRimsShown() };

  O.setBattleEscalationWave(6);   // pace floor: normal
  r.w6 = { beats: O.battleBeatsPerTick(), react: O.battleReactDelay() };

  O.setBattleEscalationWave(10);  // enemy floor: medium, bubbles capped 3500
  r.w10 = { react: O.battleReactDelay(), bubble: O.battleBubbleMs(), rims: O.battleRimsShown() };

  O.setBattleEscalationWave(16);  // enemy floor: hard — the rims go out
  r.w16 = { react: O.battleReactDelay(), bubble: O.battleBubbleMs(), rims: O.battleRimsShown() };

  O.setBattleEscalationWave(20);  // nightmare floor — no bubbles, never a beat of rest
  r.w20 = { react: O.battleReactDelay(), bubble: O.battleBubbleMs(), answersEven: O.battleAnswersEven() };

  // ── The counter marks ──
  //
  // Three separate ways for them to go, and each has to work on its own: the player asking in
  // Settings, the tier the invader is playing at, and the wave the run has reached.
  O.setBattleDifficulty('easy');
  O.setBattleEscalationWave(0);
  O.setBattleHints('hide');
  r.hintsOffByChoice = O.battleRimsShown();
  O.setBattleHints('show');
  r.hintsBackOn = O.battleRimsShown();
  // Wave 30 takes them whatever the player set, and on the gentlest enemy there is.
  O.setBattleEscalationWave(30);
  r.hintsGoneLate = O.battleRimsShown();
  O.setBattleEscalationWave(0);
  // Outside a run — the arena, a classic siege — the wave is 0 and the choice is the player's.
  r.hintsHomeAgain = O.battleRimsShown();

  // A player already at the top: the ladder has nothing to add, at any wave.
  O.setBattleDifficulty('nightmare');
  O.setBattleSpeed('fast');
  O.setBattleEscalationWave(0);
  const top0 = { react: O.battleReactDelay(), beats: O.battleBeatsPerTick() };
  O.setBattleEscalationWave(20);
  const top20 = { react: O.battleReactDelay(), beats: O.battleBeatsPerTick() };
  r.topUnmoved = JSON.stringify(top0) === JSON.stringify(top20);

  // The wave-match curve: free lead below threshold, monotonic above it, capped.
  const f = C.waveMatchFactor;
  r.curve = {
    under: f(100, 100),
    atThreshold: f(114, 100),
    above: f(150, 100),
    higher: f(200, 100),
    capped: f(10000, 100),
    cap: C.WAVE_MATCH_PLAYER.cap,
  };

  // The Skirmish pin beats both the profile and the wave caps - and clears clean.
  O.setBattleDifficulty('easy');
  O.setBattleEscalationWave(20);
  O.setBattleBubbleOverride(6000);
  r.pinBeatsCaps = O.battleBubbleMs();
  O.setBattleBubbleOverride(-1);
  r.pinAlways = O.battleBubbleMs();
  O.setBattleBubbleOverride(0);
  r.pinNone = O.battleBubbleMs();
  O.setBattleBubbleOverride(undefined);
  r.pinCleared = O.battleBubbleMs();

  O.setBattleEscalationWave(0);
  O.setBattleDifficulty('medium');
  O.setBattleSpeed('normal');
  O.setBattleHints('show');
  return r;
});

await browser.close();

report([
  ['wave 0: the gentle dials are untouched', out.calm.beats === 3 && out.calm.react === 2
    && out.calm.bubble === Infinity && out.calm.rims === true, JSON.stringify(out.calm)],
  ['wave 6: the pace floor lifts slow to normal', out.w6.beats === 4 && out.w6.react === 2, JSON.stringify(out.w6)],
  ['wave 10: the enemy floor lifts easy to medium, bubbles capped', out.w10.react === 0
    && out.w10.bubble === 2400 && out.w10.rims === true, JSON.stringify(out.w10)],
  ['wave 16: hard floor — the rims go out, bubbles brief', out.w16.react === -1
    && out.w16.bubble === 900 && out.w16.rims === false, JSON.stringify(out.w16)],
  ['wave 20: nightmare floor — no words, no rest', out.w20.react === -2
    && out.w20.bubble === 0 && out.w20.answersEven === true, JSON.stringify(out.w20)],
  ['a player already at the top feels nothing', out.topUnmoved === true, ''],
  ['no free wave under the strength threshold', out.curve.under === 1 && out.curve.atThreshold === 1,
    JSON.stringify(out.curve)],
  ['strength above threshold is answered, monotonically', out.curve.above > 1
    && out.curve.higher > out.curve.above, JSON.stringify(out.curve)],
  ['the answer is capped', out.curve.capped === out.curve.cap, `${out.curve.capped} vs cap ${out.curve.cap}`],
  ['the marks go out when the player asks', out.hintsOffByChoice === false, ''],
  ['and come back when they ask again', out.hintsBackOn === true, ''],
  ['wave 30 takes the marks on the gentlest setting there is', out.hintsGoneLate === false, ''],
  ['outside a run the choice belongs to the player again', out.hintsHomeAgain === true, ''],
  ['the Skirmish pin beats profile and wave caps', out.pinBeatsCaps === 6000, `got ${out.pinBeatsCaps}`],
  ['pin -1 keeps the words forever', out.pinAlways === Infinity, `got ${out.pinAlways}`],
  ['pin 0 silences the field', out.pinNone === 0, `got ${out.pinNone}`],
  ['clearing the pin restores the ladder', out.pinCleared === 0, `wave 20 nightmare floor -> ${out.pinCleared}`],
  ['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')],
]);
