/**
 * The one sound the game makes: paper under the thumb (src/ui/sound/SoundDirector.ts).
 *
 * An ambient music layer was built here and cut after an ear review — see the note at the top of
 * SoundDirector. What is left is a press effect, and the three things that can break it are the
 * autoplay policy, the toggle, and the wiring into `InkUI`'s press paths.
 *
 * No sound is provable from a screenshot, so this drives the director's own debug surface plus a
 * real press on a real button. Chromium is launched with autoplay allowed — without the flag the
 * context stays suspended and the checks below would be testing the browser, not the game.
 *
 * Usage: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-sound.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

const debug = () => page.evaluate(async () => {
  const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
  return soundDirector.debug();
});

// ── every shipped track actually has sound in it ───────────────────────────
/**
 * The check that should have existed from the first commit.
 *
 * The peaceful set was encoded at 40 kbps and lamejs produced files of exactly the right size
 * that decode to **complete silence**. They shipped, the game loaded them, the element played
 * them, every other check passed, and the player heard nothing — twice, across two rounds of me
 * blaming the volume. A file's existence is not evidence that it makes a noise.
 */
{
  const tracks = await page.evaluate(async () => {
    const { AMBIENT_MUSIC } = await import('/src/ui/sound/SoundDirector.ts');
    const files = [
      ...new Set([...AMBIENT_MUSIC.menu, ...AMBIENT_MUSIC.map]),
    ].map((f) => `/audio/ambient/${f}`);
    for (const f of ['legionnaire.mp3', 'juggernaut.mp3', 'vanguard.mp3',
      'song-of-the-forge.mp3', 'terminus.mp3']) files.push(`/audio/battle/${f}`);

    const ctx = new AudioContext();
    const rows = [];
    for (const f of files) {
      try {
        const buf = await ctx.decodeAudioData(await (await fetch(f)).arrayBuffer());
        const d = buf.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < d.length; i += 11) sum += d[i] * d[i];
        rows.push({ f, rms: Number(Math.sqrt(sum / Math.ceil(d.length / 11)).toFixed(3)) });
      } catch (err) {
        rows.push({ f, rms: -1, err: String(err).slice(0, 60) });
      }
    }
    await ctx.close();
    return rows;
  });
  const silent = tracks.filter((t) => t.rms < 0.01);
  check('every shipped track decodes to actual sound', silent.length === 0,
    silent.length ? silent.map((t) => `${t.f} rms=${t.rms}`).join(' | ')
      : `${tracks.length} files, rms ${Math.min(...tracks.map((t) => t.rms)).toFixed(2)}–${Math.max(...tracks.map((t) => t.rms)).toFixed(2)}`);
  // And no bed may be wildly quieter than the others, or one screen is silent in practice.
  const quietest = Math.min(...tracks.map((t) => t.rms));
  const loudest = Math.max(...tracks.map((t) => t.rms));
  check('and they sit within a sane loudness range of each other', loudest / quietest <= 3,
    `${quietest.toFixed(3)} … ${loudest.toFixed(3)}`);
}

// ── nothing before a gesture ───────────────────────────────────────────────
// An AudioContext built at load is one the browser refuses to start, and it logs for every use.
{
  const d = await debug();
  check('no audio context before a gesture', d.context === 'none', JSON.stringify(d));
  check('sound is on by default', d.enabled === true, JSON.stringify(d));
}

// ── a real press builds and unlocks it ─────────────────────────────────────
// A press on the front page: every InkUI control routes through soundDirector.tap().
await page.mouse.click(195, 844 - 60);
await page.waitForTimeout(500);
{
  const d = await debug();
  check('the first press unlocks the context', d.context === 'running', `context=${d.context}`);
}

// ── the voice runs without throwing, at a press-run's rate ─────────────────
// The ripple envelope is re-rolled per press; a fast run of taps is the case that would surface
// a scheduling error (a ramp to zero, a stop before start).
{
  const result = await page.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    for (let i = 0; i < 12; i += 1) soundDirector.tap();
    return soundDirector.debug();
  });
  check('a fast run of presses does not fault', result.context === 'running', JSON.stringify(result));
}

// ── the toggle silences and persists ───────────────────────────────────────
{
  const result = await page.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    soundDirector.setEnabled(false);
    soundDirector.tap();
    const off = soundDirector.debug();
    const stored = localStorage.getItem('mandate:sound:v1');
    soundDirector.setEnabled(true);
    soundDirector.tap();
    const back = soundDirector.debug();
    return { off, stored, back };
  });
  check('off suspends the context', result.off.enabled === false && result.off.context !== 'running',
    JSON.stringify(result.off));
  // `{ enabled, music }` since the beds got their own switch; the master's half is what this reads.
  let persisted = null;
  try { persisted = JSON.parse(result.stored); } catch { /* not JSON */ }
  check('and persists', persisted?.enabled === false, String(result.stored));
  check('on takes it back', result.back.enabled === true, JSON.stringify(result.back));
}

// ── the beds are not a media player, and have a switch of their own ────────
/**
 * The music used to stream through `<audio>` elements, and the phone showed a Now Playing card
 * for it on the lock screen and in the Dynamic Island — a bed at eight percent under a map,
 * with transport controls. Reported as *"sound play feel like a music player"*. A media element
 * is what earns that card, so the proof is that none ever plays: every bed is decoded and played
 * from a buffer in the same context as the paper effects.
 */
{
  const result = await page.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let mediaPlays = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function patched(...args) { mediaPlays += 1; return play.apply(this, args); };
    let created = 0;
    const AudioCtor = window.Audio;
    window.Audio = function counted(...args) { created += 1; return new AudioCtor(...args); };
    try {
      soundDirector.setEnabled(true);
      soundDirector.setMusicEnabled(true);
      soundDirector.tap();
      soundDirector.ambientMusic('map');
      await wait(2600);
      const onMap = soundDirector.debug();
      soundDirector.battleMusic('probe:media', false, 0.5);
      await wait(1600);
      const inFight = soundDirector.debug();
      soundDirector.stopBattleMusic();
      await wait(700);

      // MUSIC off: the beds stop, the paper goes on, the context stays up.
      soundDirector.setMusicEnabled(false);
      await wait(800);
      const musicOff = soundDirector.debug();
      soundDirector.tap();
      const tapWithMusicOff = soundDirector.debug();
      soundDirector.battleMusic('probe:refused', false, 0.5);
      await wait(300);
      const fightRefused = soundDirector.debug();
      const stored = JSON.parse(localStorage.getItem('mandate:sound:v1') ?? '{}');
      // MUSIC on again: the screen that last asked gets its bed back.
      soundDirector.setMusicEnabled(true);
      await wait(2600);
      const musicBack = soundDirector.debug();
      soundDirector.ambientMusic('none');
      await wait(800);
      return { mediaPlays, created, onMap, inFight, musicOff, tapWithMusicOff, fightRefused, stored, musicBack };
    } finally {
      HTMLMediaElement.prototype.play = play;
      window.Audio = AudioCtor;
    }
  });
  check('the map bed plays from a decoded buffer', result.onMap.ambientPlaying === true && result.onMap.ambientAt > 1
    && result.onMap.decoded >= 1, JSON.stringify(result.onMap));
  check('the battle bed plays from a decoded buffer', result.inFight.musicPlaying === true && result.inFight.music !== 'none',
    JSON.stringify(result.inFight));
  check('no media element is ever created or played for a bed', result.mediaPlays === 0 && result.created === 0,
    `Audio() ×${result.created}, play() ×${result.mediaPlays}`);
  check('MUSIC off stops the beds and keeps the context', result.musicOff.ambient === 'none' && result.musicOff.music === 'none'
    && result.musicOff.musicEnabled === false && result.musicOff.context === 'running', JSON.stringify(result.musicOff));
  check('the paper still sounds with MUSIC off', result.tapWithMusicOff.enabled === true && result.tapWithMusicOff.context === 'running');
  check('a fight with MUSIC off plays no bed', result.fightRefused.music === 'none', JSON.stringify(result.fightRefused));
  check('the music switch persists beside the master', result.stored.music === false && result.stored.enabled === true,
    JSON.stringify(result.stored));
  check('MUSIC on gives the map its bed back', result.musicBack.ambient === 'map' && result.musicBack.ambientGain > 0.005,
    JSON.stringify(result.musicBack));
}

// ── the settings row is there to turn it off with ──────────────────────────
{
  const found = await page.evaluate(async () => {
    // Its own page now, reached the way the footer reaches it.
    const game = window.__phaserGame;
    game.scene.getScene('MenuScene').scene.start('SettingsScene');
    await new Promise((resolve) => setTimeout(resolve, 800));
    const settings = game.scene.getScene('SettingsScene');
    let seen = false;
    let music = false;
    const walk = (objects) => {
      for (const o of objects) {
        if (o.text && /SOUND|ÂM THANH/.test(o.text)) seen = true;
        // The beds' own state lives on the same row: Off / Effects / All.
        if (o.text && /^(Effects|Hiệu ứng)$/.test(o.text)) music = true;
        if (o.list) walk(o.list);
      }
    };
    walk(settings.children.list);
    settings.scene.start('MenuScene');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { seen, music };
  });
  check('the settings page carries the sound row', found.seen);
  check('and the row offers effects without the beds', found.music);
}

// ── the card voice, and the components that were silent ────────────────────
// Reported: *"some cards click do not have sound."* `optionCard`, `CardFan` and `CardStack`
// never went through `InkUI`, so every prompt card in the mode was mute. This presses a REAL
// card on a REAL prompt and counts the voice — a static "does it import" check would have
// passed on the broken build.
{
  const result = await page.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    const before = { plain: 0 };
    const original = soundDirector.card.bind(soundDirector);
    let fired = 0;
    soundDirector.card = () => { fired += 1; original(); };
    // The voice itself must run without faulting before anything is asked of the wiring.
    soundDirector.card();
    const voiceOk = fired === 1 && soundDirector.debug().context === 'running';
    fired = 0;
    void before;
    return { voiceOk, fired };
  });
  check('the card voice runs', result.voiceOk === true, JSON.stringify(result));
}

{
  // A prompt built out of option cards, on screen, pressed with a real finger.
  const pressed = await page.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    window.__startBenchGame(1337, 'ascent');
    return typeof soundDirector.card === 'function';
  });
  void pressed;
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 20000 });

  const found = await page.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const state = window.__mandateState;
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    // Walk on to a prompt that is built from option cards — the coronation and the founding
    // card draw themselves and are not what was reported.
    for (let i = 0; i < 8 && state.pendingAscentPrompt
      && state.pendingAscentPrompt.kind !== 'mandate'; i += 1) {
      const p = state.pendingAscentPrompt;
      resolveAscentPrompt(state, p.kind === 'coronation' ? 'skip' : (p.options?.[0] ?? 'ok'));
    }
    ui.openPromptKey = '';
    ui.refresh();
    // A card, not the sheet: taller than a button and far shorter than the scroll area that
    // holds it. Bounded on both sides, or this picks the 744-tall input zone and only lands on
    // a card by luck.
    let best;
    const walk = (objects) => {
      for (const o of objects) {
        if (o.input?.enabled && o.getBounds) {
          const b = o.getBounds();
          if (b.height >= 60 && b.height <= 260 && b.width >= 90
            && (!best || b.height > best.height)) best = b;
        }
        if (o.list) walk(o.list);
      }
    };
    walk(ui.modalLayer.list);
    window.__soundProbe = 0;
    const original = soundDirector.card.bind(soundDirector);
    soundDirector.card = () => { window.__soundProbe += 1; original(); };
    return best
      ? { kind: state.pendingAscentPrompt?.kind, x: best.centerX, y: best.centerY, h: Math.round(best.height) }
      : { kind: state.pendingAscentPrompt?.kind, x: 0, y: 0, h: 0 };
  });
  check('a prompt of cards is on screen', found.h >= 60, JSON.stringify(found));

  if (found.h >= 60) {
    // Held past CARD_HOLD_MS (70): these cards refuse a brush on purpose.
    await page.mouse.move(found.x, found.y);
    await page.mouse.down();
    await page.waitForTimeout(160);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const fired = await page.evaluate(() => window.__soundProbe);
    check('pressing a prompt card sounds it', fired > 0, `card() fired ${fired}×`);
  } else {
    check('pressing a prompt card sounds it', false, 'no card found to press');
  }
}

// ── the action bar: six lanes, six voices ──────────────────────────────────
// The bar draws its own buttons and never went through `InkUI`, so all six were silent — the
// reported *"can you specifically [sound] for Build, Hero, Court, Army, Foreign, Story"*.
{
  const table = await page.evaluate(async () => {
    const { LANE_VOICES } = await import('/src/ui/sound/SoundDirector.ts');
    return Object.keys(LANE_VOICES);
  });
  const want = ['build', 'heroes', 'court', 'army', 'affairs', 'chronicle'];
  check('every lane on the bar has its own voice', want.every((k) => table.includes(k)),
    table.join(' '));

  const distinct = await page.evaluate(async () => {
    const { LANE_VOICES } = await import('/src/ui/sound/SoundDirector.ts');
    // Two lanes that sound the same are one lane as far as the ear is concerned.
    const fingerprints = Object.entries(LANE_VOICES).map(([id, v]) =>
      `${id}:${v.paper.centre}/${v.paper.ripples}/${v.paper.peak}/${v.knock ? 1 : 0}/${v.second ? 1 : 0}`);
    const shapes = fingerprints.map((f) => f.split(':')[1]);
    return { unique: new Set(shapes).size, total: shapes.length, fingerprints };
  });
  check('and no two of them are the same sound', distinct.unique === distinct.total,
    `${distinct.unique}/${distinct.total} distinct`);

  // And the bar itself is wired: a real press on a real lane button.
  const barPress = await page.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    // Close whatever sheet is up, so the bar is the thing under the finger.
    ui.modalLayer.removeAll(true);
    ui.openPromptKey = '';
    window.__mandateState.pendingAscentPrompt = undefined;
    ui.refresh();
    window.__laneProbe = [];
    const original = soundDirector.lane.bind(soundDirector);
    soundDirector.lane = (action) => { window.__laneProbe.push(action); original(action); };
    // The bar's own hit areas sit at the foot of the scene, outside the modal layer.
    const bottom = [];
    const walk = (objects) => {
      for (const o of objects) {
        if (o.input?.enabled && o.getBounds) {
          const b = o.getBounds();
          if (b.centerY > 700 && b.width > 20 && b.width < 120 && b.height > 20) {
            bottom.push({ x: Math.round(b.centerX), y: Math.round(b.centerY) });
          }
        }
        if (o.list) walk(o.list);
      }
    };
    walk(ui.children.list);
    bottom.sort((a, b) => a.x - b.x);
    return bottom[0] ?? null;
  });
  check('the bar exposes its lane buttons', barPress !== null, JSON.stringify(barPress));

  if (barPress) {
    await page.mouse.click(barPress.x, barPress.y);
    await page.waitForTimeout(250);
    const heard = await page.evaluate(() => window.__laneProbe);
    check('pressing a lane sounds that lane', heard.length > 0, `lane(${heard.join(',')})`);
  } else {
    check('pressing a lane sounds that lane', false, 'no bar button found');
  }
}

// ── the bed under a fight ──────────────────────────────────────────────────
// Quiet, battle-only, louder with the size of the field, gone when the screen is left.
{
  const music = await page.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const shell = await import('/src/scenes/conquest/battle/shell.ts');
    const layers = await import('/src/scenes/conquest/layers.ts');

    let s = 20260903 >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (p) => {
      const o = p.options ?? [];
      switch (p.kind) {
        case 'founder': return p.options[0];
        case 'power-draft': return p.cards?.[0] ?? 'skip';
        case 'conquer-target': return p.targets?.[0]?.landId ?? 'hold';
        case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
        case 'hero-choice': return p.heroIds?.[0] ?? 'pass';
        case 'court-appointment': return p.options[0].id;
        case 'law-choice': return p.projectIds?.[0] ? `edict:${p.projectIds[0]}` : 'hold';
        case 'muster-proposal': return 'accept';
        case 'doctrine': return p.options?.[0] ?? 'hold';
        case 'coronation': return 'skip';
        default: return o.length ? (o.find((x) => x.affordable) ?? o[0]).id : 'ok';
      }
    };
    const drain = (st) => { let g = 0; while (st.pendingAscentPrompt && g++ < 40) resolveAscentPrompt(st, pick(st.pendingAscentPrompt)); };

    const st = createAscentGameState({ difficulty: 'normal' });
    drain(st);
    for (let i = 0; i < 400; i += 1) {
      advanceAscentTick(st); drain(st); st.isDefeated = false;
      const b = st.ascent.activeBattle;
      if (b && !b.over && (b.beats?.length ?? 0) > 0) break;
    }
    const battle = st.ascent.activeBattle;
    if (!battle?.beats?.length) return { reached: false };

    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const kept = ui.state;
    ui.state = st;
    const settle = () => new Promise((r) => setTimeout(r, 260));
    try {
      const last = battle.beats[battle.beats.length - 1];

      // A skirmish: the bed plays, and plays quietly.
      last.ourNow = 900; last.theirNow = 800;
      shell.showBattle(ui);
      // Past the 1.2s fade-in: the assertion is about the level it settles at, not the ramp.
      await new Promise((r) => setTimeout(r, 1500));
      const small = soundDirector.debug();

      // The same fight, ten times the men: louder, but still a bed.
      last.ourNow = 11_000; last.theirNow = 12_000;
      ui.updateBattle();
      await new Promise((r) => setTimeout(r, 1500));
      const large = soundDirector.debug();

      // Left: the music goes with the screen.
      layers.clearLanePage(ui);
      await new Promise((r) => setTimeout(r, 700));
      const after = soundDirector.debug();

      // And the epic tier is a different track from the ordinary one.
      last.ourNow = 900; last.theirNow = 800;
      shell.showBattle(ui);
      await settle();
      const ordinaryTrack = soundDirector.debug().music;
      layers.clearLanePage(ui);
      await new Promise((r) => setTimeout(r, 700));
      last.ourNow = 14_000; last.theirNow = 15_000;
      shell.showBattle(ui);
      await settle();
      const epicTrack = soundDirector.debug().music;
      layers.clearLanePage(ui);
      return { reached: true, small, large, after, ordinaryTrack, epicTrack };
    } finally {
      ui.state = kept;
    }
  });

  check('a real fight was reached', music.reached === true);
  check('a fight plays a bed', music.small?.music !== 'none', JSON.stringify(music.small));
  check('and it is quiet', music.small?.musicGain > 0 && music.small?.musicGain <= 0.17,
    `gain ${music.small?.musicGain}`);
  check('a bigger field is louder', music.large?.musicGain > music.small?.musicGain,
    `${music.small?.musicGain} -> ${music.large?.musicGain}`);
  check('but never loud', music.large?.musicGain <= 0.19, `gain ${music.large?.musicGain}`);
  check('leaving the screen stops it', music.after?.music === 'none', JSON.stringify(music.after));
  check('an epic field draws a different track', Boolean(music.epicTrack)
    && music.epicTrack !== music.ordinaryTrack, `${music.ordinaryTrack} vs ${music.epicTrack}`);
  check('the epic track is one of the two held back',
    ['song-of-the-forge.mp3', 'terminus.mp3'].includes(music.epicTrack), String(music.epicTrack));
}

// ── the peaceful bed, and the one-bed-at-a-time rule ───────────────────────
{
  const quiet = await page.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // The map asks; it should be playing and quiet.
    soundDirector.ambientMusic('map');
    await wait(2800);
    const onMap = soundDirector.debug();

    // A fight takes the room: the peaceful bed goes silent, the battle bed plays.
    soundDirector.battleMusic('probe:land', false, 0.2);
    await wait(1400);
    const duringFight = soundDirector.debug();

    // And the map gets it back when the fight ends.
    soundDirector.stopBattleMusic();
    await wait(2600);
    const afterFight = soundDirector.debug();

    soundDirector.ambientMusic('none');
    await wait(900);
    const left = soundDirector.debug();
    return { onMap, duringFight, afterFight, left };
  });

  check('the map plays a peaceful bed', quiet.onMap.ambient === 'map'
    && quiet.onMap.ambientGain > 0.005, JSON.stringify(quiet.onMap));
  check('and it stays well under the battle floor', quiet.onMap.ambientGain < 0.15,
    `ambient ${quiet.onMap.ambientGain} vs battle floor 0.15`);
  check('a fight silences it — never two beds at once',
    quiet.duringFight.music !== 'none' && quiet.duringFight.ambientGain < 0.005,
    JSON.stringify(quiet.duringFight));
  check('and the map gets it back afterwards', quiet.afterFight.music === 'none'
    && quiet.afterFight.ambientGain > 0.005, JSON.stringify(quiet.afterFight));
  check('leaving the screen stops it', quiet.left.ambient === 'none', JSON.stringify(quiet.left));
}

// ── the map's running order: several pieces, shuffled, handed over ─────────
{
  const order = await page.evaluate(async () => {
    const { soundDirector, AMBIENT_MUSIC } = await import('/src/ui/sound/SoundDirector.ts');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // Ten stop/start cycles: the same piece every time, because a stop is a pause.
    const openings = [];
    for (let i = 0; i < 10; i += 1) {
      soundDirector.ambientMusic('none');
      await wait(60);
      soundDirector.ambientMusic('map');
      await wait(60);
      const d = soundDirector.debug();
      openings.push(d.ambientFile);
    }
    const queue = soundDirector.debug().ambientQueue;
    soundDirector.ambientMusic('none');
    return { openings, queue, pool: AMBIENT_MUSIC.map.length };
  });

  check('the map holds a set, not one track on repeat', order.queue >= 3,
    `${order.queue} in the running order, pool of ${order.pool}`);
  // Stop, then start, resumes: the bed is paused where it was, not reshuffled — reported as
  // *sound always starts from the beginning*. Ten stop/start cycles land on the one piece.
  check('stopping and starting the bed resumes the same piece rather than dealing a new set', new Set(order.openings).size === 1 && order.openings[0],
    `${new Set(order.openings).size} different openings in 10 entries: ${[...new Set(order.openings)].join(', ')}`);
  // Three, since the Hanoi theatre recording was cut too ("remove Ha noi sounds"): the composed pieces only.
  check('the map set is the three composed pieces', order.pool === 3, `pool of ${order.pool}`);
}

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

// ── the same thing again, in a browser with the ordinary autoplay policy ───
/**
 * Everything above runs with `--autoplay-policy=no-user-gesture-required`, where a fresh
 * AudioContext is already `running` — and that flag hid a real bug: in a real browser the
 * context starts **suspended**, `resume()` resolves a tick later, and the peaceful bed refused
 * to start against a context that was not running yet. The menu and the map were silent.
 * Reported as *"I can not hear any sound in main menu and map gameplay"*.
 *
 * So this last section throws the flag away and presses a real button like a player.
 */
{
  const plain = await chromium.launch();
  const page2 = await plain.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page2.on('pageerror', (e) => errs.push(String(e.message)));
  await page2.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page2.waitForFunction(
    () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
    null, { timeout: 30000 },
  );
  await page2.waitForTimeout(1200);

  const read = () => page2.evaluate(async () => {
    const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
    return soundDirector.debug();
  });

  // One press, exactly as a player's first press: it both unlocks the audio and must start the
  // bed the menu asked for before there was anything to play it into.
  await page2.mouse.click(195, 784);
  await page2.waitForTimeout(2500);
  const afterPress = await read();
  // The piece is decoded on the press and the 2.5 s ramp starts once it is — a few hundred
  // milliseconds after the gesture — so at 2.5 s the level is still climbing. Playing and
  // most of the way up is what "started on the first press" means.
  check('a real browser starts the menu bed on the first press',
    afterPress.ambient === 'menu' && afterPress.ambientPlaying === true && afterPress.ambientGain > 0.045,
    JSON.stringify(afterPress));

  // And the map takes over when the run starts, without needing another press.
  await page2.evaluate(() => window.__startBenchGame(1337, 'ascent'));
  await page2.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 20000 });
  await page2.waitForTimeout(3000);
  const onMap = await read();
  check('and the map bed follows into the run',
    onMap.ambient === 'map' && onMap.ambientGain > 0.06 && onMap.ambientAt > 0.5,
    JSON.stringify(onMap));
  // A tap on the page's own art, far from any control: the browser only asks for a gesture, and
  // a player whose first touch is not a button must still get the music.
  {
    const bare = await chromium.launch();
    const p3 = await bare.newPage({ viewport: { width: 390, height: 844 } });
    await p3.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await p3.waitForFunction(
      () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
      null, { timeout: 30000 },
    );
    await p3.waitForTimeout(1000);
    await p3.mouse.click(20, 120);          // the landscape, not a control
    await p3.waitForTimeout(2600);
    const d = await p3.evaluate(async () => {
      const { soundDirector } = await import('/src/ui/sound/SoundDirector.ts');
      return soundDirector.debug();
    });
    check('a tap anywhere on the page unlocks the music',
      d.ambient === 'menu' && d.ambientPlaying === true && d.ambientGain > 0.045 && d.ambientAt > 0.5,
      JSON.stringify(d));
    await bare.close();
  }

  check('no console errors in the plain browser', errs.length === 0, errs.slice(0, 2).join(' | '));
  await plain.close();
}

await browser.close();
const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) {
  console.log('FAIL: see above');
  process.exit(1);
}
console.log('PASS: paper under the thumb, and nothing else');
