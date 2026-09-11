/**
 * The gameplay trailer: captures it, letters it, encodes it.
 *
 * Every frame is the real game, played. A run is staged the way
 * `test_scripts/shot/shot-readme.mjs` stages the README's pictures — pinned seed, frozen clock,
 * every card answered — and then Phaser's rAF loop is taken away and the world is cranked one
 * thirtieth of a second at a time. That is the whole trick. Headless Chromium rasterises through
 * SwiftShader and cannot draw this game in real time at 1170x2080; on its own clock it does not
 * have to. A frame that takes 300 ms to draw still lands on the timeline at its own 1/30 s, so the
 * film is smooth no matter what the machine was doing.
 *
 * Three stages, each re-runnable on its own, because the captions get rewritten far more often
 * than the gameplay gets recaptured:
 *
 *     node scripts/trailer/build-trailer.mjs --stage capture     # drive the game -> raw frames
 *     node scripts/trailer/build-trailer.mjs --stage compose     # crop, letter, dip -> composed
 *     node scripts/trailer/build-trailer.mjs --stage encode      # -> mp4
 *     node scripts/trailer/build-trailer.mjs                     # all three
 *
 * Needs a dev server (`yarn dev`, port 5179 by default) and an ffmpeg. ffmpeg is deliberately not a
 * dependency of this repository — 70 MB of binary to cut one marketing asset should not be in
 * every contributor's install — so pass `--ffmpeg <path>` or set `$FFMPEG`.
 *
 *     --only country,realm    capture a slice while tuning one cut
 *     --url                   dev server origin
 *     --frames <dir>          where raw frames live (default: scripts/trailer/out/raw)
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CUTS, HIGHLIGHT, RAMP, captionTimeline } from './film.mjs';
import { advance, boot, frameOn, installCrank, crank, newPage, toMenu, FIRST_CHOICE, FPS } from './game.mjs';

const arg = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const URL = arg('--url', process.env.DEV_URL ?? 'http://127.0.0.1:5179');
const STAGE = arg('--stage', 'all');
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
/**
 * Which language the film is in — the game's and the captions', together.
 *
 * Both are cut, and neither is a subtitled version of the other: the page boots in that language so
 * every screen under the lettering is the real localised interface, and the captions are written in
 * it rather than translated into it. Everything downstream is named for it, so the two live side by
 * side and one never overwrites the other's frames.
 */
/**
 * Which sheet the film is cut on — the phone column or the desktop's wide surface.
 *
 *   phone    360x640 at 3.25x = 1170x2080 device px. `GAME_HEIGHT` is taken from the window's
 *            aspect, so the game lays out at 390x693: a 9:16 column, full bleed, no letterbox.
 *   desktop  1920x1080 at 1x. `DESKTOP_DESIGN_HEIGHT` is a constant 760, so the sheet is 1351x760
 *            and one design unit is 1.42 px. The HUD is a single top bar, the lanes dock, and the
 *            map fills the window — which is the whole reason for a second cut.
 *
 * The desktop page must *ask* for its layout on the URL: see `toMenu`.
 */
const SURFACES = {
  phone: { width: 360, height: 640, scale: 3.25, out: [1080, 1920], seam: 272, seamShort: 140 },
  // One bar, one seam. The desktop chrome is a single row about 64 design units tall, so unlike the
  // phone there is no second HUD row and no lane page that starts higher — every screen shares it.
  desktop: { width: 1920, height: 1080, scale: 1, layout: 'desktop', out: [1920, 1080], seam: 68, seamShort: 68 },
};
const SURFACE = arg('--surface', 'phone');
const LANDSCAPE_FILM = SURFACE === 'desktop';
const VIEW = SURFACES[SURFACE] ?? SURFACES.phone;
const view = () => ({ ...VIEW, lang: LANG });

const LANG = arg('--lang', 'en');
const SUFFIX = `${SURFACE === 'phone' ? '' : `-${SURFACE}`}${LANG === 'en' ? '' : `-${LANG}`}`;
const RAW = arg('--frames', `scripts/trailer/out/raw${SUFFIX}`);
const COMPOSED = `scripts/trailer/out/composed${SUFFIX}`;
const OUT = arg('--out', `scripts/trailer/out/van-thang-trailer${SUFFIX}-${VIEW.out[0]}x${VIEW.out[1]}.mp4`);
const GIF = arg('--gif', `docs/readme/trailer${SUFFIX}.gif`);

// The capture surface. 360x640 CSS at 3.25x gives 1170x2080 device pixels, and the game's own
// design surface resolves to 390x693 there — a 9:16 sheet, so the trailer is full bleed with no
// letterbox anywhere. The 90 spare pixels of width are the push-in's whole travel: the compositor
// crops them back to 1080 rather than zooming the map camera, which would re-bake the ground.
const SEED = 20260901;
/**
 * The fight is auditioned separately from the realm, and for a different quality.
 *
 * A defence is only a chapter if it *lasts*: the first fight this film used was over in seven
 * seconds of game time — the province simply fell — so two of the three battle cuts photographed
 * the map with a notice on it. Driven to exhaustion across five seed/tick pairs
 * (`test_scripts/scratch/_trailer-fight-length.mjs`), this one runs past forty seconds and puts two
 * hosts a side on the field, which is also the most there is to look at. Re-audition rather than
 * nudging the number if a balance pass moves it.
 */
const BATTLE_SEED = 1337;
const BATTLE_AFTER = 60;

const seconds = (n) => Math.round(n * FPS);

// ── in-page helpers ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything the film asks of a live page, installed once per page.
 *
 * `drain` needs the resolver, and importing it here rather than per call matters: an in-page
 * `import('/src/x.ts')` after the dev server has served an HMR-stamped URL can hand back a second
 * copy of the module. One import, held, is one instance.
 */
const HELPERS = `
window.__trailerInit = async () => {
  const game = window.__phaserGame;
  const world = game.scene.getScene('ConquestScene');
  const ui = game.scene.getScene('ConquestUIScene');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { FORMATION_RING } = await import('/src/data/ascent/formations.ts');
  window.__scroll = () => ({ x: world.cameras.main.scrollX, y: world.cameras.main.scrollY });
  window.__panTo = (x, y) => {
    const cam = world.cameras.main;
    const zoom = world.mapZoom ?? cam.zoom;
    cam.scrollX = Math.max(0, Math.min(x, Math.max(0, world.worldWidth - 390 / zoom)));
    cam.scrollY = Math.max(0, Math.min(y, Math.max(0, world.worldHeight - 693 / zoom)));
  };
  window.__stuck = [];
  /**
   * Answers whatever is standing, and does not spin when the answer is refused.
   *
   * The first cut of this answered with the first affordable option and looped eight times on the
   * same card. That is fine until a card offers an option the resolver then declines — a tribute
   * priced above the treasury, a method that fails — because 'resolveAscentPrompt' leaves the
   * prompt exactly where it was and the next pass answers it the same way. Measured: a rival
   * demanding tribute stood over the battle screen for the whole nineteen seconds of the fight
   * chapter, and every frame of it was a photograph of a card nobody was answering.
   *
   * So: if the prompt did not move, take the answer that always works — the one that declines —
   * and if that does not move it either, stop and record it rather than spending the cut trying.
   */
  window.__drain = () => {
    const st = window.__mandateState;
    const DECLINES = ['refuse', 'endure', 'defy', 'decline', 'hold', 'pass', 'skip', 'back', 'ok'];
    let guard = 0;
    let answered = 0;
    while (st.pendingAscentPrompt && st.pendingAscentPrompt.kind !== 'run-over' && guard++ < 8) {
      answered += 1;
      const standing = st.pendingAscentPrompt;
      resolveAscentPrompt(st, window.__firstChoice(standing, guard));
      if (st.pendingAscentPrompt !== standing) continue;
      const ids = (standing.options || []).map((o) => (typeof o === 'string' ? o : o.id));
      const out = ids.find((id) => DECLINES.includes(id)) || ids[ids.length - 1];
      if (out) resolveAscentPrompt(st, out);
      if (st.pendingAscentPrompt === standing) {
        window.__stuck.push(standing.kind + ' [' + ids.join(',') + ']');
        break;
      }
    }
    st.lastStoryOutcome = undefined;
    if (st.ascent) st.ascent.pendingAftermath = undefined;
    // Tell the interface, take the sheet down, and redraw — all three, or the card is still on the
    // film.
    //
    // Answering in state is only the first of three. 'state-changed' is the second: without it the
    // shell is never told, and the card it had already drawn stays on screen over a fight that is
    // running fine underneath — which is how a rival's tribute demand stood over the whole battle
    // chapter, with nothing reporting it because as far as the drain was concerned no prompt was
    // pending.
    //
    // The third is this redraw, and it is the one that cost a flash in the opening cut. A card
    // raised by a tick is *drawn* during that tick; the drain answers it on the next frame and
    // 'closeOverlay' takes it down synchronously — but the screenshot captures the canvas as last
    // rendered, and nothing had rendered since. So a summon card stood over the country for three
    // frames: a modal that opens and shuts for a tenth of a second, which is exactly as ugly as it
    // sounds. A zero-delta step redraws without advancing the world by so much as a millisecond.
    if (answered > 0) {
      ui.events.emit('state-changed');
      try { if (ui.closeOverlay) ui.closeOverlay(); } catch (e) { /* nothing was open */ }
      window.__phaserGame.step(window.__clock, 0);
    }
    return answered;
  };
  /**
   * The fight, kept on screen.
   *
   * A card arriving mid-fight does two things: it draws itself over the battle, and it closes the
   * lane underneath. Answering it is only half the repair — the screen then comes back as the map,
   * and the rest of the chapter is three cuts of a battle nobody can see. 'battleUi' is the fight
   * screen's own record, so it is also the honest test of whether the fight is on screen.
   */
  window.__holdBattle = () => {
    const st = window.__mandateState;
    window.__drain();
    if (!st.ascent || !st.ascent.activeBattle) return;
    // Whether the fight is actually on screen. 'battleUi' alone is not the test — it is a record
    // and it outlives the page it describes — but the container it holds is a real Phaser object,
    // and a destroyed one has no scene. Answering a card also re-raises the next one queued behind
    // it on the same 'state-changed', and openLane refuses while a prompt stands, so this simply
    // tries again next frame rather than trying to be clever about the order.
    const page = ui.battleUi && ui.battleUi.orders;
    if (page && page.scene) return;
    if (st.pendingAscentPrompt) return;
    ui.openLane('battle');
    ui.events.emit('ui:battle-order', 'take-field');   // and it is ours again, not the officers'
    ui.resumeBattleForOrder();                          // a fight reopened is a fight held again
  };

  window.__stuck = [];
  /**
   * Answers whatever is standing, and does not spin when the answer is refused.
   *
   * The first cut of this answered with the first affordable option and looped eight times on the
   * same card. That is fine until a card offers an option the resolver then declines — a tribute
   * priced above the treasury, a method that fails — because 'resolveAscentPrompt' leaves the
   * prompt exactly where it was and the next pass answers it the same way. Measured: a rival
   * demanding tribute stood over the battle screen for the whole nineteen seconds of the fight
   * chapter, and every frame of it was a photograph of a card nobody was answering.
   *
   * So: if the prompt did not move, take the answer that always works — the one that declines —
   * and if that does not move it either, stop and record it rather than spending the cut trying.
   */
  window.__drain = () => {
    const st = window.__mandateState;
    const DECLINES = ['refuse', 'endure', 'defy', 'decline', 'hold', 'pass', 'skip', 'back', 'ok'];
    let guard = 0;
    let answered = 0;
    while (st.pendingAscentPrompt && st.pendingAscentPrompt.kind !== 'run-over' && guard++ < 8) {
      answered += 1;
      const standing = st.pendingAscentPrompt;
      resolveAscentPrompt(st, window.__firstChoice(standing, guard));
      if (st.pendingAscentPrompt !== standing) continue;
      const ids = (standing.options || []).map((o) => (typeof o === 'string' ? o : o.id));
      const out = ids.find((id) => DECLINES.includes(id)) || ids[ids.length - 1];
      if (out) resolveAscentPrompt(st, out);
      if (st.pendingAscentPrompt === standing) {
        window.__stuck.push(standing.kind + ' [' + ids.join(',') + ']');
        break;
      }
    }
    st.lastStoryOutcome = undefined;
    if (st.ascent) st.ascent.pendingAftermath = undefined;
    // Tell the interface, take the sheet down, and redraw — all three, or the card is still on the
    // film.
    //
    // Answering in state is only the first of three. 'state-changed' is the second: without it the
    // shell is never told, and the card it had already drawn stays on screen over a fight that is
    // running fine underneath — which is how a rival's tribute demand stood over the whole battle
    // chapter, with nothing reporting it because as far as the drain was concerned no prompt was
    // pending.
    //
    // The third is this redraw, and it is the one that cost a flash in the opening cut. A card
    // raised by a tick is *drawn* during that tick; the drain answers it on the next frame and
    // 'closeOverlay' takes it down synchronously — but the screenshot captures the canvas as last
    // rendered, and nothing had rendered since. So a summon card stood over the country for three
    // frames: a modal that opens and shuts for a tenth of a second, which is exactly as ugly as it
    // sounds. A zero-delta step redraws without advancing the world by so much as a millisecond.
    if (answered > 0) {
      ui.events.emit('state-changed');
      try { if (ui.closeOverlay) ui.closeOverlay(); } catch (e) { /* nothing was open */ }
      window.__phaserGame.step(window.__clock, 0);
    }
    return answered;
  };
  /**
   * The fight, kept on screen.
   *
   * A card arriving mid-fight does two things: it draws itself over the battle, and it closes the
   * lane underneath. Answering it is only half the repair — the screen then comes back as the map,
   * and the rest of the chapter is three cuts of a battle nobody can see. 'battleUi' is the fight
   * screen's own record, so it is also the honest test of whether the fight is on screen.
   */
  window.__holdBattle = () => {
    // Reopen on the *event that closes it* rather than on a test of whether it is open. There is
    // no honest test: 'battleUi' is the fight screen's record and it outlives the page it was
    // built for, so a guard on it never fires and the chapter finishes on the map. What closes the
    // lane is a card arriving — so if a card was answered this frame, put the fight back.
    const answered = window.__drain();
    const st = window.__mandateState;
    if (answered > 0 && st.ascent && st.ascent.activeBattle) {
      ui.openLane('battle');
      ui.resumeBattleForOrder();   // a fight reopened is a fight held again
    }
  };
  window.__stats = () => {
    const s = world.performanceStats && world.performanceStats();
    if (!s) return { busy: false, mark: '' };
    return {
      busy: Boolean(s.sceneryPending || s.refreshPending || (s.ground && s.ground.pending)),
      mark: [s.ground && s.ground.builds, s.ground && s.ground.invalidations, s.fog && s.fog.builds].join('/'),
    };
  };
  window.__pending = () => (window.__mandateState.pendingAscentPrompt || {}).kind || null;
  /**
   * Where to put a thumb, in design units. Read off the live widgets — 'coachBounds' and the
   * action bar's own 'slotBounds' are what the in-game tour points at, so these are the buttons
   * themselves rather than an approximation of where a button probably is.
   */
  window.__target = (kind) => {
    const st = window.__mandateState;
    if (kind === 'battle-button') {
      const b = ui.actionBar && ui.actionBar.slotBounds && ui.actionBar.slotBounds('battle');
      return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
    }
    if (kind === 'tempo-press') {
      const bu = ui.battleUi;
      if (!bu) return { fail: 'no battleUi' };
      if (!bu.orders || !bu.orders.scene) return { fail: 'fight page torn down' };
      const b = bu.coachBounds && bu.coachBounds.stance;
      if (!b) return { fail: 'no stance box on coachBounds' };
      return { x: b.x + b.width * 0.8, y: b.y + b.height / 2 };
    }
    if (kind === 'shape-any') {
      const bu = ui.battleUi;
      const battle = st.ascent && st.ascent.activeBattle;
      if (!battle) return { fail: 'no active battle' };
      if (!bu) return { fail: 'no battleUi' };
      if (!bu.orders || !bu.orders.scene) return { fail: 'fight page torn down' };
      const b = bu.coachBounds && bu.coachBounds.formation;
      if (!b) return { fail: 'no formation box on coachBounds' };
      // Their shape, or the one they are re-forming into if they have telegraphed it. Each shape
      // beats the two that follow it round the ring, so the answer to shape j is j - 1.
      const theirs = battle.theirFormationTarget || battle.theirFormation;
      const j = FORMATION_RING.indexOf(theirs);
      const n = FORMATION_RING.length;
      // Both counters, and never the shape we are already standing in: ordering the shape the host
      // already holds is a real order that changes nothing on screen, so the film shows a thumb
      // going down and the ranks not moving.
      const answers = j < 0 ? [0, 1] : [(j - 1 + n) % n, (j - 2 + n) % n];
      const pick = answers.find((k) => FORMATION_RING[k] !== battle.ourFormation) ?? answers[0];
      const seg = b.width / n;
      return {
        x: b.x + seg * (pick + 0.5), y: b.y + b.height / 2,
        note: FORMATION_RING[pick] + ' answers ' + theirs + ' (we hold ' + battle.ourFormation + ')',
      };
    }
    // The draft fan's four cards. Each is a Phaser Zone of identical size inside its own card
    // container, and the fan browses on 'pointerover' — a mouse crossing them raises each in turn,
    // which is the same gesture a thumb sliding across the fan makes.
    if (kind === 'fan-cards') {
      const zones = [];
      const walk = (obj) => {
        if (!obj) return;
        if (obj.type === 'Zone' && obj.input && obj.input.enabled && obj.getBounds) {
          const r = obj.getBounds();
          zones.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) });
        }
        const kids = obj.list || (obj.getChildren && obj.getChildren());
        if (kids) kids.forEach(walk);
      };
      walk(ui.modalLayer);
      const groups = {};
      zones.forEach((z) => { const key = z.w + 'x' + z.h; (groups[key] = groups[key] || []).push(z); });
      const fan = Object.keys(groups).map((k) => groups[k])
        .filter((g) => g.length >= 3)
        .sort((a, b) => b[0].w * b[0].h - a[0].w * a[0].h)[0];
      if (!fan) return { fail: 'no fan zones on screen' };
      fan.sort((a, b) => a.x - b.x);
      return { cards: fan };
    }
    // The summon deck. Its input is on the *scene*, not on a hit area, so there is nothing
    // interactive to find — the thing to locate is the deck container itself, and a press anywhere
    // inside it starts a drag.
    if (kind === 'card-stack') {
      let best;
      const walk = (obj) => {
        if (!obj) return;
        if (obj.type === 'Container' && obj.getBounds) {
          const r = obj.getBounds();
          if (r.width > 300 && r.width < 392 && r.height > 190 && r.height < 400) {
            if (!best || r.width * r.height > best.area) {
              best = { x: r.x + r.width / 2, y: r.y + r.height / 2, area: r.width * r.height };
            }
          }
        }
        const kids = obj.list || (obj.getChildren && obj.getChildren());
        if (kids) kids.forEach(walk);
      };
      walk(ui.modalLayer);
      return best ? { x: best.x, y: best.y } : { fail: 'no card stack on screen' };
    }
    if (kind === 'option') {
      // Every prompt lays a full-screen interactive backdrop first, so a naive "topmost
      // interactive thing" is the dim and the tap does nothing. Filter it out by size, then take
      // the topmost of what is left.
      const found = [];
      const walk = (obj) => {
        if (!obj) return;
        if (obj.input && obj.input.enabled && obj.getBounds) {
          const r = obj.getBounds();
          if (r.width > 140 && r.width < 380 && r.height > 24 && r.height < 220) found.push(r);
        }
        const kids = obj.list || (obj.getChildren && obj.getChildren());
        if (kids) kids.forEach(walk);
      };
      walk(ui.modalLayer);
      if (found.length === 0) return null;
      found.sort((a, b2) => a.y - b2.y);
      const r = found[0];
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  };
  window.__order = (order) => ui.events.emit('ui:battle-order', order);
  window.__choose = () => {
    const st = window.__mandateState;
    const p = st.pendingAscentPrompt;
    if (!p) return false;
    ui.events.emit('ui:ascent-choice', window.__firstChoice(p, 1));
    return true;
  };
  return true;
};`;

/** Lets the scene finish its chunked work on our clock instead of on a timeout. */
async function settleCranked(page, maxFrames = 900) {
  let previous = null;
  let quiet = 0;
  for (let spent = 0; spent < maxFrames; spent += 10) {
    await crank(page, 10);
    const now = await page.evaluate(() => window.__stats());
    quiet = !now.busy && previous?.mark === now.mark ? quiet + 1 : 0;
    previous = now;
    if (quiet >= 4) break;
  }
  await crank(page, 6);
}

// ── the pages ───────────────────────────────────────────────────────────────────────────────────

/**
 * One page per run the film needs, booted once. Each returns the page plus whatever the cuts on it
 * need to know — the province a fight opened on, say.
 */
const PAGES = {
  async run(browser) {
    const page = await newPage(browser, view());
    await boot(page, URL, SEED, 'ascent', VIEW.layout);
    const state = await advance(page, 65, { seed: SEED });
    console.log(`   run: ${JSON.stringify(state)}`);
    // `advance` sinks the tick accumulator so a photograph stays still. A film wants the opposite:
    // the country has to keep ticking under the camera, which is the whole claim of the first cut.
    await page.evaluate(() => { window.__phaserGame.scene.getScene('ConquestScene').ascentAccumulator = 0; });
    await page.evaluate(HELPERS);
    await page.evaluate(FIRST_CHOICE);
    await page.evaluate(() => window.__trailerInit());
    await installCrank(page);
    return { page, state };
  },
  async battle(browser) {
    const page = await newPage(browser, view());
    await boot(page, URL, BATTLE_SEED, 'ascent', VIEW.layout);
    const state = await advance(page, 400, { stopOnBattle: true, battleAfter: BATTLE_AFTER, seed: BATTLE_SEED });
    console.log(`   battle: ${JSON.stringify(state)}`);
    if (!state.battle) throw new Error('no fight opened — re-audition the battleAfter threshold');
    await page.evaluate(HELPERS);
    await page.evaluate(FIRST_CHOICE);
    await page.evaluate(() => window.__trailerInit());
    // Put a champion over the field.
    //
    // A defence that nothing was posted to is fought by its officers, and the header says so — a
    // grey box reading "no commander" where the face goes, which is the game telling the truth
    // about a province nobody was sent to. It is not what the trailer is about: the claim being
    // made is that the general on the plate is the hero you summoned and paid. So the province is
    // given the commander a played run would have given it, by the same two routes the game uses
    // (`defenceCommanderOf`): the general of a host standing here, or the governor posted to it.
    const commander = await page.evaluate(() => {
      const st = window.__mandateState;
      const battle = st.ascent.activeBattle;
      const free = st.heroes
        .filter((h) => h.kingdomId === 'dai-viet' || !h.kingdomId)
        .sort((a, b) => (b.martial ?? 0) - (a.martial ?? 0))[0];
      if (!free) return null;
      const host = st.armies.find((a) => a.kingdomId === 'dai-viet' && a.landId === battle.landId && !a.isLevy);
      if (host) host.generalHeroId = free.id;
      else free.assignedTo = battle.landId;
      window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
      return { name: free.name, as: host ? 'general of the host' : 'governor of the province' };
    });
    console.log(`   commander: ${commander ? `${commander.name}, ${commander.as}` : 'none available'}`);
    // The same accumulator the run page has to reset, and it bit harder here: `boot` sinks it to
    // -1e9 to hold the world still for the first frame, and only the non-battle branch of
    // `advance` puts it back. Left sunk, the fight never takes another beat — three cuts of a
    // battle screen frozen at "72 rounds left", with the ranks standing still and the losses not
    // moving, which is the one thing this chapter cannot afford.
    await page.evaluate(() => { window.__phaserGame.scene.getScene('ConquestScene').ascentAccumulator = 0; });
    await installCrank(page);
    const battleLandId = await page.evaluate(() => window.__mandateState.ascent.activeBattle.landId);
    return { page, state, battleLandId };
  },
  async story(browser) {
    const page = await newPage(browser, view());
    await toMenu(page, URL, VIEW.layout);
    await page.evaluate(FIRST_CHOICE);
    // A headless run to the first Chronicle beat that carries an authored woodblock print, handed
    // to the real scene. Sixteen of the forty-nine do; the rest are drawn by the scene's own ink,
    // and the trailer should show one of the sixteen.
    const found = await page.evaluate(async () => {
      const { createAscentGameState } = await import('/src/state/GameState.ts');
      const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
      const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
      const { storyBeatPrint } = await import('/src/ui/storyPrint.ts');
      const runTo = (accept, ticks) => {
        let s = 20260816 >>> 0;
        Math.random = () => {
          s = (s + 0x6d2b79f5) | 0;
          let t = Math.imul(s ^ (s >>> 15), 1 | s);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
        for (let i = 0; i < ticks; i += 1) {
          advanceAscentTick(st);
          let guard = 0;
          while (st.pendingAscentPrompt && guard++ < 8) {
            const p = st.pendingAscentPrompt;
            if (p.kind === 'story-beat' && accept(p)) return { state: st, beat: p.templateId };
            if (p.kind === 'run-over') break;
            resolveAscentPrompt(st, window.__firstChoice(p, guard));
          }
        }
        return { state: st, beat: null };
      };
      // Prefer the beats a Vietnamese reader would name without being asked — the divine crossbow,
      // the stakes in the Bach Dang, the pass at Chi Lang, the sword returned to the lake. Any
      // illustrated beat is a good picture; these are the ones that are the point of the project.
      const ICONIC = ['dien-hong', 'no-than', 'river-stakes', 'chi-lang', 'ho-guom', 'dai-cao', 'binh-trong'];
      const wanted = runTo(
        (p) => ICONIC.includes(p.templateId) && Boolean(storyBeatPrint(p.templateId, p.fragmentId)),
        1400,
      );
      const illustrated = wanted.beat
        ? wanted
        : runTo((p) => Boolean(storyBeatPrint(p.templateId, p.fragmentId)), 900);
      const chosen = illustrated.beat ? illustrated : runTo(() => true, 400);
      // The receipts of every beat answered on the way here stand in slots of their own, and the
      // shell raises them over the pending card.
      chosen.state.lastStoryOutcome = undefined;
      if (chosen.state.ascent) chosen.state.ascent.pendingAftermath = undefined;
      window.__shotState = chosen.state;
      return { beat: chosen.beat, turn: chosen.state.turn };
    });
    console.log(`   story: ${JSON.stringify(found)}`);
    await page.evaluate(() => window.__phaserGame.scene.start('ConquestScene', { state: window.__shotState }));
    await page.waitForTimeout(3200);
    await page.evaluate(HELPERS);
    await page.evaluate(() => window.__trailerInit());
    await installCrank(page);
    return { page, state: found };
  },
  async menu(browser) {
    const page = await newPage(browser, view());
    await toMenu(page, URL, VIEW.layout);
    await page.waitForTimeout(1200);
    // No tip on the end card.
    //
    // The front page raises one of the fifty tips a second or three after it builds — right for a
    // player standing at the menu, and a speech bubble across the middle of the plate for a title
    // card. Cancelling the timer is not enough on its own: the delay is `1400 + random * 1600`
    // against a wait of 1200, so it is a race, and the Vietnamese cut lost it — the same code
    // photographed a clean card in English and a tip in Vietnamese.
    //
    // Two locks instead. `render()` rebuilds the page, which destroys a badge already standing;
    // then the fresh timer is cancelled *and* `tipAnchor` is cleared, which is the thing both
    // `armTipBadge` and `showTipBadge` bail on. After this there is no arrangement of timers that
    // can put a tip on the card.
    await page.evaluate(() => {
      const menu = window.__phaserGame.scene.getScene('MenuScene');
      if (!menu) return;
      menu.tipBadgeTimer?.remove();
      menu.tipBadgeTimer = undefined;
      menu.render();
      menu.tipBadgeTimer?.remove();
      menu.tipBadgeTimer = undefined;
      menu.tipBadgeShown = true;
      menu.tipAnchor = undefined;
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const game = window.__phaserGame;
      game.loop.stop();
      window.__clock = 100000;
      window.__tick = (dt) => { window.__clock += dt; game.step(window.__clock, dt); };
      // The front page has no world scene, so there is nothing chunked to wait for.
      window.__stats = () => ({ busy: false, mark: '' });
      window.__drain = () => {};
    });
    return { page, state: {} };
  },
};

// ── capture ─────────────────────────────────────────────────────────────────────────────────────

async function capture() {
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const specs = [];
  let frame = 0;
  const started = Date.now();

  const wanted = CUTS.filter((cut) => ONLY.length === 0 || ONLY.includes(cut.id));
  const groups = [...new Set(wanted.map((cut) => cut.page))];

  for (const group of groups) {
    console.log(`\n== ${group} ==`);
    const ctx = await PAGES[group](browser);
    const { page } = ctx;
    page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error' && !text.includes('[vite]')) errors.push(`CONSOLE ${text.slice(0, 160)}`);
    });
    ctx.frameOn = async (opts) => {
      const at = await frameOn(page, { ...opts, skipSettle: true });
      await settleCranked(page);
      return at;
    };
    ctx.drain = (p) => p.evaluate(() => window.__drain());
    // Asked once per page: every tap and gesture below converts design units through it.
    const css = await designToCss(page);

    for (const cut of wanted.filter((c) => c.page === group)) {
      const total = seconds(cut.seconds);
      if (cut.stage) await cut.stage(page, ctx);
      await settleCranked(page, 240);
      ctx.scroll = group === 'menu' ? { x: 0, y: 0 } : await page.evaluate(() => window.__scroll());

      // Taps are placed on the timeline, not in the loop, so a cut reads as a script.
      const taps = (cut.taps ?? []).map((tap) => ({ ...tap, frame: seconds(tap.at), fired: false, at: null }));
      const moves = (cut.gestures ?? []).map((g) => ({ ...g, frame: seconds(g.at), fired: false }));
      let track = [];                       // pointer steps still to play, in frame order
      let held = null;                      // the fan card a browse came to rest on
      let ripple = null;

      for (let i = 0; i < total; i += 1) {
        // Gestures first: they own the pointer for the frames they run over.
        for (const move of moves) {
          if (move.fired || i < move.frame) continue;
          move.fired = true;
          const found = await page.evaluate(
            (k) => window.__target(k),
            move.kind === 'browse-fan' ? 'fan-cards' : move.kind === 'take-fan' ? 'fan-cards' : 'card-stack',
          );
          if (!found || found.fail) {
            console.log(`      ${move.kind}: ${found?.fail ?? 'nothing to touch'}`);
            continue;
          }
          const anchorAt = move.kind === 'take-fan'
            ? { card: held ?? found.cards[Math.floor((found.cards.length - 1) / 2)] }
            : found;
          const built = gestureTrack(move.kind, anchorAt);
          if (built.hold) held = built.hold;
          track = track.concat(built.steps.map((step) => ({ ...step, frame: i + step.at })));
          if (move.kind !== 'browse-fan') ripple = { dx: anchorAt.card?.x ?? found.x, dy: anchorAt.card?.y ?? found.y, from: i };
        }
        for (const step of track.filter((one) => one.frame === i)) {
          await page.mouse.move(step.x * css, step.y * css);
          if (step.down) await page.mouse.down();
          if (step.up) await page.mouse.up();
        }
        track = track.filter((one) => one.frame > i);

        for (const tap of taps) {
          if (tap.fired || i < tap.frame) continue;
          const at = await doTap(page, tap.find, tap.hold ?? 0, css);
          // A miss is usually a timing accident rather than a wrong target — a card was up for a
          // beat, or the dock was between rebuilds — so a tap keeps trying for a second before it
          // gives up, instead of silently not happening.
          const missed = !at || at.fail;
          if (missed && i < tap.frame + 30) { tap.why = at?.fail ?? 'no target'; continue; }
          tap.fired = true;
          if (missed) console.log(`      tap ${tap.find}: gave up — ${tap.why ?? 'no target'}`);
          if (!missed) ripple = { dx: at.x, dy: at.y, from: i };
          if (at?.held) tap.releaseAt = i + Math.round((tap.hold ?? 0) * FPS);
        }
        for (const tap of taps) {
          if (tap.releaseAt !== undefined && i >= tap.releaseAt) {
            tap.releaseAt = undefined;
            await page.mouse.up();
          }
        }
        // A card raised mid-cut would stand over the country for the rest of the shot. The cuts
        // that let the world run answer them as they arrive; the cuts that are *about* a card do
        // not, obviously.
        if (cut.drain) await page.evaluate((keep) => (keep ? window.__holdBattle() : window.__drain()), Boolean(cut.keepBattle));
        if (cut.step) await cut.step(page, i, total, ctx);
        await page.screenshot({
          path: `${RAW}/${String(frame).padStart(5, '0')}.jpg`,
          type: 'jpeg',
          quality: 95,
        });
        // Only what the capture alone knows. The lettering is *not* baked in here — see the note
        // on `compose` — so `--stage compose` really can re-letter without recapturing.
        specs.push({ frame, cut: cut.id, i, total, ripple: ripple ? { ...ripple } : undefined });
        frame += 1;
        await crank(page, 1, cut.speed ?? 1);
      }
      const stuck = await page.evaluate(() => { const s = window.__stuck || []; window.__stuck = []; return [...new Set(s)]; });
      if (stuck.length) console.log(`      cards that would not answer: ${stuck.join(' | ')}`);
      const rate = frame / ((Date.now() - started) / 1000);
      console.log(`   ${cut.id.padEnd(10)} ${String(total).padStart(4)} frames   ${rate.toFixed(1)} fps`);
    }
    await page.close();
  }

  writeFileSync(`${RAW}/specs.json`, JSON.stringify(specs));
  await browser.close();
  const real = errors.filter((e) => !e.includes('failed to connect to websocket'));
  if (real.length) console.log(`\npage errors:\n  ${real.slice(0, 8).join('\n  ')}`);
  console.log(`\n${frame} frames · ${(frame / FPS).toFixed(1)}s · ${((Date.now() - started) / 1000 / 60).toFixed(1)} min`);
}

/** Puts a thumb on a real button, and says where it went so the compositor can mark it. */
/**
 * How many CSS pixels one design unit is, on whichever sheet this page laid out.
 *
 * Every widget this film touches reports itself in design units, and Playwright clicks in CSS
 * pixels. On the phone the sheet is the 390 column, so the factor was written as `VIEW.width / 390`
 * — which on the desktop's 1351-unit surface is out by 3.5x, and would put every tap and every
 * gesture somewhere off the right of the screen. Asked of the running game instead.
 */
async function designToCss(page) {
  const sheet = await page.evaluate(async () => {
    try {
      return (await import('/src/game/constants.ts')).surfaceWidth();
    } catch {
      return 390;
    }
  });
  return VIEW.width / sheet;
}

async function doTap(page, kind, hold = 0, css = VIEW.width / 390) {
  const at = await page.evaluate((k) => window.__target(k), kind);
  if (!at || at.fail) return at?.fail ? { fail: at.fail } : null;
  if (at.note) console.log(`      tap ${kind}: ${at.note}`);
  // A hold is not a long tap here: several of this game's cards are answered by *holding* the row
  // ("Hold a card to choose it"), and the fill that runs round the card while the thumb is down is
  // drawn by the scene on its own clock. So the press goes down here and the release is scheduled
  // on the timeline — the frames in between are captured, and the hold plays on camera.
  await page.mouse.move(at.x * css, at.y * css);
  await page.mouse.down();
  if (hold > 0) return { ...at, held: true };
  await page.mouse.up();
  await crank(page, 2);
  // A prompt that is still standing means the tap missed something — every option in this game is
  // a real hit area, so rather than photograph a card being ignored, answer it the way the bar
  // would. (Kept as a fallback and reported, because a miss is worth knowing about.)
  if (kind === 'option') {
    const stillUp = await page.evaluate(() => window.__pending());
    if (stillUp) {
      console.log(`      tap option: card still up (${stillUp}) — answering it directly`);
      await page.evaluate(() => window.__choose());
    }
  }
  return at;
}

/**
 * A gesture, as a pointer track laid on the timeline.
 *
 * A tap can be done between two frames. A gesture cannot: browsing a fan *is* the pointer crossing
 * four cards, and a flick *is* the distance travelled before the release — so both have to happen
 * across frames the camera is actually recording, one move per frame, or the film shows a card
 * changing with nothing touching it.
 *
 * Every step is `{ at, x, y, down, up }` in design units, `at` counted from the frame the gesture
 * fires on. The capture loop plays whichever steps are due before it takes each shot.
 *
 * The thresholds are the game's own, in design units, and they are why the numbers here are what
 * they are: `CardFan` takes a card on a rise of 44 that beats its own sideways drift, and
 * `CardStack` advances on a sideways 52 and lifts on a rise of 58.
 */
function gestureTrack(kind, at) {
  const steps = [];
  const glide = (from, to, frames, extra = {}) => {
    for (let f = 1; f <= frames; f += 1) {
      const u = f / frames;
      steps.push({ at: steps.length ? steps[steps.length - 1].at + 1 : 1, x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u, ...(f === frames ? extra : {}) });
    }
  };

  if (kind === 'browse-fan') {
    const cards = at.cards;
    const middle = cards[Math.floor((cards.length - 1) / 2)];
    // Across every card left to right, then back to rest on the middle one — the browse a thumb
    // makes, and the reason the description panel above changes four times.
    steps.push({ at: 0, x: cards[0].x, y: cards[0].y });
    for (let i = 1; i < cards.length; i += 1) glide(cards[i - 1], cards[i], 7);
    glide(cards[cards.length - 1], middle, 8);
    return { steps, hold: middle };
  }
  if (kind === 'take-fan') {
    const card = at.card;
    steps.push({ at: 0, x: card.x, y: card.y, down: true });
    glide(card, { x: card.x, y: card.y - 72 }, 9, { up: true });
    return { steps };
  }
  if (kind === 'swipe-next') {
    steps.push({ at: 0, x: at.x, y: at.y, down: true });
    glide(at, { x: at.x + 78, y: at.y }, 7, { up: true });
    return { steps };
  }
  if (kind === 'swipe-take') {
    steps.push({ at: 0, x: at.x, y: at.y, down: true });
    glide(at, { x: at.x, y: at.y - 86 }, 9, { up: true });
    return { steps };
  }
  return { steps };
}

/** What the compositor is told about one frame. */
function spec(cut, i, total, frame, ripple, timeline = []) {
  const u = total <= 1 ? 1 : i / (total - 1);
  const time = i / FPS;
  const kb = cut.kenburns;
  const out = { frame, zoom: kb ? kb.from + (kb.to - kb.from) * u : 1, ax: kb?.ax ?? 0, ay: kb?.ay ?? 0 };

  // The opening card, over the first second and a bit of the film. A trailer's first frame is its
  // poster; this one was the blank sheet the first shot fades in from.
  const INTRO_HOLD = Math.round(1.1 * FPS);
  const INTRO_FADE = Math.round(0.7 * FPS);
  if (frame < INTRO_HOLD + INTRO_FADE) {
    out.intro = frame <= INTRO_HOLD ? 1 : 1 - (frame - INTRO_HOLD) / INTRO_FADE;
  }

  // The dip to paper: only at a chapter's edge, so the cuts inside a chapter stay hard and quick.
  const fadeFrames = 7;
  let fade = 0;
  if (cut.open && i < fadeFrames) fade = 1 - i / fadeFrames;
  if (cut.end && i > total - fadeFrames * 3) fade = Math.max(fade, 0);
  out.fade = fade;

  // ── which line, and whether the plate is up ────────────────────────────────────────────────────
  //
  // Two questions, two answers, and they are deliberately not the same one. The *lettering* is
  // whichever caption is strongest at this frame, cross-fading through any hand-over. The *plate*
  // belongs to the run that caption sits in — see `captionTimeline` — so it stays put while the
  // lines change under it and comes down once, at the end of the run.
  const ramp = (at, from, to) => Math.min(
    Math.min(1, Math.max(0, (at - (from - RAMP)) / RAMP)),
    Math.min(1, Math.max(0, (to + RAMP - at) / RAMP)),
  );
  let strongest = null;
  let best = 0;
  for (const entry of timeline) {
    const alpha = ramp(frame, entry.from, entry.to);
    if (alpha > best) { best = alpha; strongest = entry; }
  }
  // A frame in the gap *between* two captions of one run has no visible lettering — and the plate
  // still belongs there, holding while one line hands over to the next. Emitting only when some
  // caption is lit is what put the paper back down in the middle of its own run: the sheet vanished
  // for the six tenths of a second between two lines and came back for the second one, which is the
  // blink this whole timeline exists to remove. So if a run covers this frame, that run's entry
  // carries it, at zero lettering.
  if (!strongest) {
    strongest = timeline.find((entry) => frame >= entry.runFrom - RAMP && frame <= entry.runTo + RAMP);
  }
  if (strongest) {
    // `vi` carries its own lines, written rather than translated; without one, the English stands.
    const c = strongest.caption;
    const said = LANG !== 'en' && c[LANG] ? c[LANG] : c;
    out.caption = {
      line: said.line, line2: said.line2, y: strongest.y, band: strongest.band,
      alpha: best, plate: ramp(frame, strongest.runFrom, strongest.runTo),
    };
  }
  if (ripple) {
    const age = (i - ripple.from) / (FPS * 0.75);
    if (age >= 0 && age <= 1) out.ripple = { dx: ripple.dx, dy: ripple.dy, age };
  }
  if (cut.end) {
    // The card comes up over the front page rather than replacing it.
    out.end = Math.min(1, Math.max(0, (time - 0.5) / 0.9));
    out.lang = LANG;
  }
  return out;
}

// ── compose ─────────────────────────────────────────────────────────────────────────────────────

async function compose() {
  /**
   * The captions are derived here, not read back.
   *
   * They used to be computed at capture time and written into `specs.json`, which quietly made
   * `--stage compose` a lie: rewriting a line in `film.mjs` and re-composing re-lettered the film
   * with the *old* words, because the old words were in the sidecar. The frames on disk are the
   * only thing capture is authoritative about; everything a caption needs — the text, the band,
   * the fades — comes from the film, every time.
   */
  const byId = new Map(CUTS.map((cut) => [cut.id, cut]));
  const raw = JSON.parse(readFileSync(`${RAW}/specs.json`, 'utf8'));
  const timeline = captionTimeline(raw);
  const specs = raw.map((one) => spec(byId.get(one.cut), one.i, one.total, one.frame, one.ripple, timeline));
  rmSync(COMPOSED, { recursive: true, force: true });
  mkdirSync(COMPOSED, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: VIEW.out[0], height: VIEW.out[1] } });
  page.on('pageerror', (e) => console.log(`compositor: ${e.message}`));
  // The compositor is served by the dev server too, so it holds an HMR socket like any other page —
  // and a compose is two minutes long. Any write anywhere in the repo during it (editing a caption,
  // saving this file) pushes a full reload, the page navigates out from under the loop, and the run
  // dies on `Execution context was destroyed` a frame or two in. Cut the socket, as the game pages
  // already do; the compositor has no use for live reload.
  await page.routeWebSocket('**', (ws) => ws.close());
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Location.prototype, 'reload', { value: () => {}, configurable: true });
    } catch { /* the socket block is the load-bearing half */ }
  });
  await page.goto(`${URL}/scripts/trailer/compose.html?w=${VIEW.out[0]}&h=${VIEW.out[1]}&seam=${VIEW.seam}&seamShort=${VIEW.seamShort}&src=${VIEW.width * VIEW.scale}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__composeReady === true, null, { timeout: 30000 });

  const started = Date.now();
  for (const one of specs) {
    const name = String(one.frame).padStart(5, '0');
    const raw = readFileSync(`${RAW}/${name}.jpg`).toString('base64');
    const url = await page.evaluate(
      (s) => window.__compose(s),
      { ...one, frame: `data:image/jpeg;base64,${raw}` },
    );
    writeFileSync(`${COMPOSED}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
    if (one.frame % 120 === 0) {
      const rate = (one.frame + 1) / ((Date.now() - started) / 1000);
      process.stdout.write(`\r  composed ${one.frame + 1}/${specs.length}  ${rate.toFixed(1)} fps   `);
    }
  }
  process.stdout.write('\n');
  await browser.close();
}

// ── encode ──────────────────────────────────────────────────────────────────────────────────────

function findFfmpeg() {
  const explicit = arg('--ffmpeg', process.env.FFMPEG);
  if (explicit && existsSync(explicit)) return explicit;
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  if (onPath.status === 0) {
    const first = onPath.stdout.split(/\r?\n/).find(Boolean);
    if (first && existsSync(first)) return first;
  }
  try {
    return createRequire(import.meta.url)('ffmpeg-static');
  } catch {
    return undefined;
  }
}

/**
 * The score: the game's own two tracks, cut to the film's own chapters.
 *
 * Not written for this — `public/audio/` ships five battle tracks and three ambient ones, and
 * `SoundDirector` already says which belong where: `menu`/`map` draw on *jade-kings-throne*, and a
 * great host at the capital is the `epic` list, which is where *terminus* lives. So the trailer is
 * scored with the pair the game itself would have chosen for these screens, rather than with
 * something picked by ear from the folder.
 *
 * The battle window is read off `CUTS` rather than typed in, so the score follows the film: move a
 * chapter and the music moves with it. The arithmetic is arranged so the two cross-fades cancel and
 * the bed lands exactly on the film's length —
 *
 *     (from + XF/2) + (to - from + XF) + (total - to + XF/2) - 2·XF  =  total
 */
const SCORE = {
  ambient: 'public/audio/ambient/jade-kings-throne.mp3',
  battle: 'public/audio/battle/terminus.mp3',
  crossfade: 1.5,
  /**
   * The fight has to be the loudest thing in the film, and out of the box it is the quietest.
   *
   * Measured with `loudnorm` over the first minute of each: *jade-kings-throne* is **-21.3 LUFS**
   * and *terminus* is **-26.7**. Mixed as they ship, the battle chapter came out ~8 dB under the
   * map — a fight scored quieter than a field of rice. So the battle segment is lifted the 5.4 it
   * is down, plus a couple more so it sits *above* the bed where it belongs.
   */
  battleGain: '2.5dB',
  /**
   * Where in the battle track the fight starts, and it is not the beginning.
   *
   * These are game tracks, written to come up under a scene that has already started — *terminus*
   * opens at **-31 dB** and does not reach full until about 100 seconds in. Started at 0, the
   * loudest chapter of the film was scored with a track's quiet introduction, which is why lifting
   * it by 7.5 dB still left it under the map. Measured in 25-second windows: -31.4 at 0, -24.1 at
   * 25, -19.9 at 75, **-18.9 at 100**. So the fight is cut in at 95 and runs through the loud
   * middle. The ambient is the opposite case and is left at 0: it opens soft, which is what a title
   * card wants, and the reprise picks it up at 55 where it is full.
   */
  battleStart: 95,
  /**
   * And the bed as a whole is lifted to sit where a trailer sits. `volume` alone can clip a peak,
   * so a limiter follows it — cheap insurance on a file that will be handed to platforms that
   * re-encode it.
   */
  masterGain: '3dB',
  /** Where the closing ambient picks the track up again, so it is not the same phrase twice. */
  reprise: 55,
};

/** Which seconds of the film the fight occupies, from the cut list itself. */
function battleWindow() {
  let at = 0;
  let from;
  let to;
  for (const cut of CUTS) {
    if (cut.page === 'battle') {
      if (from === undefined) from = at;
      to = at + cut.seconds;
    }
    at += cut.seconds;
  }
  return { from: from ?? 0, to: to ?? at, total: at };
}

/** The `-i` list and the filter that turns the two tracks into one bed. */
function scoreArgs() {
  if (!existsSync(SCORE.ambient) || !existsSync(SCORE.battle)) return null;
  const { from, to, total } = battleWindow();
  const xf = SCORE.crossfade;
  const head = (from + xf / 2).toFixed(2);
  const fight = (to - from + xf).toFixed(2);
  const tail = (total - to + xf / 2).toFixed(2);
  const fadeOut = Math.max(0, total - 3.5).toFixed(2);
  const filter = [
    `[1:a]atrim=0:${head},asetpts=N/SR/TB[a0]`,
    `[2:a]atrim=${SCORE.battleStart}:${(SCORE.battleStart + Number(fight)).toFixed(2)},`
    + `asetpts=N/SR/TB,volume=${SCORE.battleGain}[a1]`,
    `[3:a]atrim=${SCORE.reprise}:${(SCORE.reprise + Number(tail)).toFixed(2)},asetpts=N/SR/TB[a2]`,
    `[a0][a1]acrossfade=d=${xf}:c1=tri:c2=tri[x1]`,
    `[x1][a2]acrossfade=d=${xf}:c1=tri:c2=tri[x2]`,
    // 48 kHz stereo out of 32 kHz mono sources: it adds no information, and it is what every player
    // and platform this file is handed expects to find.
    `[x2]afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=3.5,volume=${SCORE.masterGain},`
    + `alimiter=limit=0.89,aformat=sample_rates=48000:channel_layouts=stereo[aout]`,
  ].join(';');
  return {
    inputs: ['-i', SCORE.ambient, '-i', SCORE.battle, '-i', SCORE.ambient],
    filter: ['-filter_complex', filter, '-map', '0:v', '-map', '[aout]',
      '-c:a', 'aac', '-b:a', '192k', '-shortest'],
    says: `score: ambient to ${from}s, ${SCORE.battle.split('/').pop()} through the fight to ${to}s, ambient out`,
  };
}

async function encode() {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    console.error('No ffmpeg. Pass --ffmpeg <path>, set $FFMPEG, or put one on PATH.');
    process.exit(1);
  }
  mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  const count = readdirSync(COMPOSED).filter((f) => f.endsWith('.jpg')).length;
  console.log(`encoding ${count} frames -> ${OUT}`);
  // yuv420p and an even frame size, because every player and platform this file will be handed
  // assumes both, and the ones that do not assume them refuse the file silently.
  const score = scoreArgs();
  if (score) console.log(`   ${score.says}`);
  else console.log('   no score: the audio the game ships was not found');
  const run = spawn(ffmpeg, [
    '-y',
    '-framerate', String(FPS),
    '-i', `${COMPOSED}/%05d.jpg`,
    ...(score?.inputs ?? []),
    ...(score?.filter ?? []),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    OUT,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  run.stderr.on('data', (chunk) => { log += chunk.toString(); });
  const code = await new Promise((resolve) => run.on('close', resolve));
  if (code !== 0) {
    console.error(log.split('\n').slice(-20).join('\n'));
    process.exit(1);
  }
  console.log(`${OUT} · ${(statSync(OUT).size / 1024 / 1024).toFixed(1)} MB · ${(count / FPS).toFixed(1)}s`);
}

/**
 * The README's GIF.
 *
 * Not the whole film: 68 seconds of moving woodblock is 24 MB as a GIF whatever you do to it, and
 * no README should carry that. `HIGHLIGHT` names the seconds worth keeping, they are concatenated
 * with `select`, and the result is palettised at 360 wide and 12 fps.
 *
 * `dither=none` is the counter-intuitive part and it is worth keeping: this is flat pigment on
 * paper, so an undithered 128-colour palette is both *smaller* — 8 MB against 24 — and cleaner
 * than a dithered one, which would spray noise across every block of colour the print is made of.
 */
/**
 * How wide the GIF is drawn, which is not the same number for the two films.
 *
 * 360 is right for the phone column — a 360x640 card on a README page. The same 360 on a 16:9 frame
 * is 360x203, which is a thumbnail of a strategy screen: the HUD is unreadable and the hosts on the
 * field are four pixels tall. A landscape still needs roughly twice the width to carry the same
 * detail, and costs about the same bytes because there is less motion per pixel.
 */
const GIF_WIDTH = LANDSCAPE_FILM ? 720 : 360;

async function gif() {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    console.error('No ffmpeg. Pass --ffmpeg <path>, set $FFMPEG, or put one on PATH.');
    process.exit(1);
  }
  const run = (args) => new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let log = '';
    child.stderr.on('data', (chunk) => { log += chunk.toString(); });
    // The tail of ffmpeg's log is the only part that ever says what went wrong.
    child.on('close', (code) => (code === 0
      ? resolve()
      : reject(new Error(log.split('\n').slice(-12).join(' | ')))));
  });
  const cut = `${OUT.replace(/\.mp4$/, '')}-highlight.mp4`;
  const palette = `${OUT.replace(/[\/][^\/]+$/, '')}/palette.png`;
  const select = HIGHLIGHT.map(([from, to]) => `between(t,${from},${to})`).join('+');
  const held = HIGHLIGHT.reduce((sum, [from, to]) => sum + (to - from), 0);
  console.log(`gif: ${HIGHLIGHT.length} windows, ${held.toFixed(1)}s -> ${GIF}`);
  await run(['-y', '-i', OUT, '-vf', `select='${select}',setpts=N/FRAME_RATE/TB`, '-an', cut]);
  await run(['-y', '-i', cut, '-vf', `fps=12,scale=${GIF_WIDTH}:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=128`, palette]);
  await run(['-y', '-i', cut, '-i', palette,
    '-lavfi', `fps=12,scale=${GIF_WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
    '-loop', '0', GIF]);
  rmSync(palette, { force: true });
  rmSync(cut, { force: true });
  console.log(`${GIF} · ${(statSync(GIF).size / 1024 / 1024).toFixed(1)} MB`);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────

if (STAGE === 'capture' || STAGE === 'all') await capture();
if (STAGE === 'compose' || STAGE === 'all') await compose();
if (STAGE === 'encode' || STAGE === 'all') await encode();
if (STAGE === 'gif' || STAGE === 'all') await gif();
