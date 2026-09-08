// The manual's "play a guided run" button: does it reach a real run, and does the coach follow it?
//
// Driven the way a player drives it — front page, How to Play, press the button — because the
// whole feature is a handoff across three scenes (GuideScene starts ConquestScene, which launches
// ConquestUIScene, which reads a module flag neither of them carries) and every part that can
// break is in the seams rather than in any one of them.
//
// No `?tour=1` here on purpose. A guided run must coach a *driven* browser too, or the flag is not
// really doing what it claims: `hasSeenRunTour` refuses under `navigator.webdriver`, and the guided
// path is supposed to bypass that refusal because the player explicitly asked for it.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`ok   ${label}`); }
  else { failed += 1; console.log(`FAIL ${label}${detail ? `  — ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// A page that reloads or crashes mid-run reports itself as "execution context was destroyed",
// which names the symptom and not the cause. These two name the cause.
page.on('crash', () => errors.push('THE PAGE CRASHED'));
// Counted rather than reported: the first navigation is the `goto` below, and a listener that
// calls that an error reports a failure on every single run. What matters is a SECOND one — the
// page reloading under the harness, which surfaces as "execution context was destroyed" and names
// the symptom rather than the cause.
let navigations = 0;
page.on('framenavigated', (frame) => {
  if (frame !== page.mainFrame()) return;
  navigations += 1;
  if (navigations > 1) errors.push(`THE PAGE RELOADED (${frame.url()})`);
});

/** The world-position of the first button on a scene whose label matches. */
const buttonAt = (sceneKey, pattern) => page.evaluate(([key, source]) => {
  const scene = window.__phaserGame.scene.getScene(key);
  const re = new RegExp(source);
  const walk = (list) => {
    for (const child of list ?? []) {
      const label = child.list?.find?.((k) => k.type === 'Text' && re.test(k.text));
      if (label) {
        const m = label.getWorldTransformMatrix();
        return { x: m.tx, y: m.ty };
      }
      const deeper = child.list ? walk(child.list) : null;
      if (deeper) return deeper;
    }
    return null;
  };
  return walk(scene?.children?.list);
}, [sceneKey, pattern]);

// English, explicitly. This file asserts its labels in English and Vietnamese is the product
// default now, so without this it hunts for "How to Play" while the button reads "Cách chơi" and
// reports the door as missing. `verify-classic-page` pins the language for the same reason.
await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.waitForTimeout(1200);

// ── Front page → How to Play ────────────────────────────────────────────────
const howTo = await buttonAt('MenuScene', 'How to Play');
check('the front page has a How to Play door', Boolean(howTo));
if (!howTo) { await browser.close(); process.exit(1); }
await page.mouse.click(howTo.x, howTo.y);
await page.waitForFunction(() => window.__phaserGame.scene.isActive('GuideScene'), null, { timeout: 8000 })
  .catch(() => check('How to Play opens', false));
await page.waitForTimeout(700);

// ── The guided-run button, on the tab the reader lands on ───────────────────
const play = await buttonAt('GuideScene', 'Conquest copilot');
check('the manual offers a guided run on the tab it opens', Boolean(play));
if (!play) { await browser.close(); process.exit(1); }

await page.mouse.click(play.x, play.y);
const reached = await page.waitForFunction(
  () => window.__phaserGame.scene.isActive('ConquestUIScene'),
  null,
  { timeout: 20000 },
).then(() => true).catch(() => false);
check('pressing it starts a real Dragon Ascent run', reached);
await page.waitForTimeout(1500);

// The run opens behind its own cards; answer them the way the other ascent scripts do.
const barUp = () => page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
  .children.list.some((c) => c.constructor?.name === 'ActionBar' && c.visible));
for (let guard = 0; guard < 24 && !(await barUp()); guard += 1) {
  await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    if (!scene.openPromptKey) return;
    scene.events.emit('ui:ascent-choice', String(scene.openPromptKey).split(',').pop() || 'ok');
  });
  await page.waitForTimeout(500);
}
check('the run reaches a playable frame', await barUp());

const guided = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  return { guidedRun: scene.guidedRun, tourUp: Boolean(scene.runTour), shown: [...scene.tourStagesShown] };
});
check('the run knows it is a guided one', guided.guidedRun === true, JSON.stringify(guided));
check('the coach started on the opening cards', guided.shown.length > 0, JSON.stringify(guided));

/** Presses whatever the tour's forward button says until the card is gone. */
const closeTour = async () => {
  for (let guard = 0; guard < 10; guard += 1) {
    const gone = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      if (!scene.runTour) return true;
      for (const child of scene.children.list) {
        const label = child.list?.find?.((k) => k.type === 'Text'
          // Every label the forward button can carry: mid-walkthrough cards finish with
          // "Got it", the map-and-bar stage offers to start playing, and a tour with
          // somewhere to send the player ends on "Play now".
          && /^(Next|Got it|Start playing|Play now|Tiếp|Đã rõ|Vào chơi|Chơi ngay)$/.test(k.text));
        if (label) {
          // Both halves: `InkUI.button` acts on the press, the Copilot's own controls on the
          // release, and this loop has to drive whichever kind the card is carrying.
          const hit = child.list.find((k) => k.type === 'Rectangle');
          hit?.emit('pointerdown', { id: 7, downTime: 0 }, 0, 0, { stopPropagation() {} });
          hit?.emit('pointerup', { id: 7, downTime: 0 }, 0, 0, { stopPropagation() {} });
          return false;
        }
      }
      return false;
    });
    if (gone) return true;
    await page.waitForTimeout(200);
  }
  return page.evaluate(() => !window.__phaserGame.scene.getScene('ConquestUIScene').runTour);
};
check('the opening cards can all be dismissed', await closeTour());

// ── The world stops while a card is being read ──────────────────────────────
//
// The fault this guards: a stage is chosen against the screen as it is when the stage opens, but
// the `Copilot` then runs its own steps to the end without asking again. With the clock still
// turning underneath, a doctrine card could arrive on card two of four — and card three would go
// on to explain the action bar while pointing at a bar that card had hidden. Measured before the
// fix: the coach described one screen while the player was looking at another.
const halted = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.tourStagesShown.clear();
  scene.state.isStrategyPause = false;
  scene.openPromptKey = '';
  scene.renderActionBar();
  const duringCard = scene.state.isStrategyPause;
  return { raised: Boolean(scene.runTour), duringCard };
});
check('a coach card stops the clock', halted.raised && halted.duringCard === true,
  JSON.stringify(halted));
await closeTour();
const released = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
  .state.isStrategyPause);
check('and hands it back when the card closes', released === false, String(released));

// A player who stopped the clock themselves must not find it running again afterwards.
const kept = await page.evaluate(async () => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.tourStagesShown.clear();
  scene.state.isStrategyPause = true;
  scene.renderActionBar();
  return Boolean(scene.runTour);
});
check('a card was raised over a paused run', kept);
await closeTour();
const stillPaused = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene')
  .state.isStrategyPause);
check('a pause the player set themselves survives the card', stillPaused === true);
await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.state.isStrategyPause = false;
  scene.tourStagesShown.clear();
});

// ── The staged moments, walked in the order a run reaches them ──────────────
//
// Forced rather than waited for: `muster` needs the first wave two seasons out and `aftermath` a
// wave survived, which is minutes of real clock. The condition is what is under test.
//
// Each pass closes the standing card FIRST. Without that the checks read one stage behind — the
// coach raises one card per frame, so a pass that leaves the previous one up simply returns it
// again, and every assertion after the first fails for a reason that is entirely the harness's.
const stage = async (setup, wanted) => {
  // Pumps until the wanted stage appears rather than assuming it is next in line. The coach raises
  // ONE card per frame, and stages get inserted between existing ones as the walkthrough grows —
  // when the bar was split into a card per button, every assertion after it started reading the
  // stage before the one it named and failed for a reason that was entirely the harness's.
  for (let pump = 0; pump < 12; pump += 1) {
    await closeTour();
    await page.evaluate((source) => {
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      // eslint-disable-next-line no-new-func
      new Function('scene', 'state', 'ascent', source)(scene, scene.state, scene.state.ascent);
      scene.renderActionBar();
    }, setup);
    await page.waitForTimeout(220);
    const state = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
      return { up: Boolean(scene.runTour), shown: [...scene.tourStagesShown] };
    });
    if (!wanted || state.shown.includes(wanted)) return state;
  }
  return page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    return { up: Boolean(scene.runTour), shown: [...scene.tourStagesShown] };
  });
};

let seen = await stage('', 'opening');
check('a clear frame raises the strip-and-readout walkthrough',
  seen.shown.includes('opening'), JSON.stringify(seen.shown));

// ── The decision card must follow a decision the player actually made ───────
//
// Reported from a real run: the card said "that was a decision" over a board where none had been
// answered. `promptsAnswered` was already three by then — the mandate, the founder and the court
// appointment are all prompts, and the walkthrough had just walked the player through every one
// of them — so it fired the instant the scripted part ended, pointing at a band that had not
// moved. It now measures from the hand-over instead of from zero.
const premature = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.tourStagesShown.clear();
  scene.promptsAtHandover = -1;
  // Exactly the state after the opening cards: three prompts answered, none of them the player's
  // own decision, and the walkthrough not yet finished.
  scene.promptsAnswered = 3;
  const stage = scene.tourStages().find((s) => s.id === 'decision');
  return { fires: stage.when(), answered: scene.promptsAnswered };
});
check('the decision card does not fire on the opening cards',
  premature.fires === false, JSON.stringify(premature));

const afterHandover = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  // The `go` stage records the line to measure from as it builds its card.
  scene.tourStages().find((s) => s.id === 'go').steps();
  const stage = scene.tourStages().find((s) => s.id === 'decision');
  const quietAfterHandover = stage.when();
  scene.promptsAnswered += 1;
  return { quietAfterHandover, afterOneMore: stage.when(), line: scene.promptsAtHandover };
});
check('nor immediately after the walkthrough lets go',
  afterHandover.quietAfterHandover === false, JSON.stringify(afterHandover));
check('but it does once a real decision is answered',
  afterHandover.afterOneMore === true, JSON.stringify(afterHandover));

seen = await stage('scene.promptsAnswered += 1;', 'decision');
check('answering a decision raises the decision card',
  seen.shown.includes('decision'), JSON.stringify(seen.shown));

seen = await stage('ascent.wave = 0; ascent.ticksToWave = 2;', 'muster');
check('the first muster raises the muster card',
  seen.shown.includes('muster'), JSON.stringify(seen.shown));

seen = await stage('ascent.wavesSurvived = 1;', 'aftermath');
check('surviving a wave raises the aftermath card',
  seen.shown.includes('aftermath'), JSON.stringify(seen.shown));

seen = await stage('scene.promptsAnswered = 4; ascent.wavesSurvived = 3;');
check('no stage fires twice', seen.up === false, JSON.stringify(seen));

const overCard = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.tourStagesShown.clear();
  ['mandate', 'founder', 'court'].forEach((id) => scene.tourStagesShown.add(id));
  scene.openPromptKey = 'law-choice:probe';
  scene.renderActionBar();
  const raised = Boolean(scene.runTour);
  scene.openPromptKey = '';
  return raised;
});
check('no map-or-bar stage fires while a card owns the screen', overCard === false);

// ── The walkthrough opens on the first gameplay decision ───────────────────
//
// The whole complaint that produced this stage: a new player's first screen is the throne card,
// asking a permanent question about three options they have never seen, and the coach used to wait
// for a clear frame — so it opened by explaining the readout band to somebody who had already
// guessed. `?tour=1` is needed because a first run is what is under test and `hasSeenRunTour`
// refuses under `navigator.webdriver`.
const first = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const firstErrors = [];
first.on('pageerror', (e) => firstErrors.push(e.message));
first.on('console', (m) => { if (m.type() === 'error') firstErrors.push(m.text()); });
await first.goto(`${BASE}/?capture=1&tour=1`, { waitUntil: 'domcontentloaded' });
await first.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
// Let Boot finish its art preload before the bench starts a scene using the same atlas.
await first.waitForFunction(() => window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await first.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await first.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'), null, { timeout: 30000 });
// A new dynasty now opens its optional customizer and an inheritance summary before decisions.
for (let setup = 0; setup < 2; setup += 1) {
  await first.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    if (['coronation', 'inheritance'].includes(scene.state.pendingAscentPrompt?.kind)) scene.choose('skip');
  });
  await first.waitForTimeout(150);
}
await first.waitForTimeout(1800);

const onFirstCard = await first.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  return {
    promptKey: scene.openPromptKey,
    tourUp: Boolean(scene.runTour),
    shown: [...scene.tourStagesShown],
    stages: scene.tourStages().map((s) => s.id),
  };
});
check('the first gameplay screen is a decision card',
  onFirstCard.promptKey.startsWith('mandate'), onFirstCard.promptKey);
check('the coach is already up over it, with nothing to wait for',
  onFirstCard.tourUp && onFirstCard.shown.includes('mandate'), JSON.stringify(onFirstCard));
check('the walkthrough is more than the opening four',
  onFirstCard.stages.length >= 7, JSON.stringify(onFirstCard.stages));
check('it covers the throne, the founder and the court appointment',
  ['mandate', 'founder', 'court'].every((id) => onFirstCard.stages.includes(id)),
  JSON.stringify(onFirstCard.stages));

// Marking the tour seen must not switch off the rest of this run's stages — it did, and a player
// got exactly one card ever.
const keepsGoing = await first.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.runTourDone = true;              // what closing the first card does
  scene.openPromptKey = 'founder:probe';
  scene.renderActionBar();
  return { tourUp: Boolean(scene.runTour), shown: [...scene.tourStagesShown] };
});
check('a stage closing does not end the walkthrough',
  keepsGoing.tourUp && keepsGoing.shown.includes('founder'), JSON.stringify(keepsGoing));

// And the map/bar stages still wait for a frame the player can actually see.
const waitsForClear = await first.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.tourStagesShown.add('court');
  scene.openPromptKey = 'law-choice:probe';   // a card with no stage of its own
  scene.renderActionBar();
  const raised = Boolean(scene.runTour);
  scene.openPromptKey = '';
  return raised;
});
check('a stage about the map does not speak over a card', waitsForClear === false);

firstErrors.forEach((e) => errors.push(`first-run: ${e}`));
// ── The resource strip, explained one store at a time ───────────────────────
//
// The strip was the last unexplained thing on the screen and the first a player looks at: four
// icons, four numbers, four signed rates, none of which says what it is. Each store now gets its
// own card pointed at its own slot — and the slot has to be READ from the strip, because `reflow`
// packs the row by measured width, so a realm holding 29.1k gold puts the people icon somewhere a
// hardcoded rectangle would miss entirely.
const strip = await first.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const opening = scene.tourStages().find((s) => s.id === 'opening');
  const steps = opening.steps();
  const stores = steps.filter((s) => s.id.startsWith('res-'));
  return {
    ids: steps.map((s) => s.id),
    boxes: stores.map((s) => s.target()),
  };
});
check('every store on the strip gets its own card',
  ['res-food', 'res-supplies', 'res-gold', 'res-people'].every((id) => strip.ids.includes(id)),
  JSON.stringify(strip.ids));
check('and each card points at a different slot',
  new Set(strip.boxes.map((b) => Math.round(b.x))).size === 4, JSON.stringify(strip.boxes));
check('the slots sit in the header strip, left to right',
  strip.boxes.every((b) => b.y >= 0 && b.y < 60 && b.width > 20)
  && strip.boxes.every((b, i) => i === 0 || b.x > strip.boxes[i - 1].x),
  JSON.stringify(strip.boxes));

// ── The action bar, one button at a time ────────────────────────────────────
//
// It was a single card naming all six screens, which is a paragraph rather than an explanation:
// the reader finishes it knowing there are six of something and not which is which. Each button
// now lights on its own, and the rectangle comes from `actionBarSlots` — the same function the bar
// lays itself out from — so what is lit is the button rather than a guess at where one probably
// is. The keys come from the live bar too: `battle` exists only while a siege does.
const bar = await first.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  const stage = scene.tourStages().find((s) => s.id === 'bar');
  const steps = stage.steps();
  return {
    ids: steps.map((s) => s.id),
    boxes: steps.map((s) => s.target()),
    barTop: window.__phaserGame.scale.gameSize.height / (window.RENDER_SCALE ?? 1) - 50,
  };
});
check('every button on the bar gets its own card',
  ['build', 'heroes', 'court', 'army', 'affairs', 'chronicle', 'pause', 'menu']
    .every((key) => bar.ids.includes(`bar-${key}`)),
  JSON.stringify(bar.ids));
check('each card lights one button, not the whole bar',
  bar.boxes.every((b) => b.width < 120) && new Set(bar.boxes.map((b) => b.x)).size === bar.boxes.length,
  JSON.stringify(bar.boxes.map((b) => [b.x, b.width])));
check('and the lit rectangles march left to right along the bar',
  bar.boxes.every((b, i) => i === 0 || b.x > bar.boxes[i - 1].x),
  JSON.stringify(bar.boxes.map((b) => b.x)));

// ── The card is inside a thumb's reach ──────────────────────────────────────
//
// This is played one-handed. A card against the top of an 844-unit phone puts its buttons about
// 780 units from the thumb: visible, explained, unpressable. Whatever the card is pointing at —
// and the strip is at the very top — the buttons stay at the foot.
const reach = await first.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
  // Raise a fresh card rather than measuring whatever the earlier checks left behind — those
  // destroy and re-raise the tour several times, and a stale one measures as nothing at all.
  scene.runTour?.destroy();
  scene.runTour = undefined;
  scene.tourStagesShown.clear();
  scene.openPromptKey = '';
  // A live prompt also hides the bar, and `maybeRunTour` refuses over one for any stage that is
  // not about a card. The run has been ticking through this whole file, so one may well be up.
  scene.state.pendingAscentPrompt = undefined;
  scene.renderActionBar();
  // Recursive, and measured in world units. The tour's buttons are nested a container deeper than
  // a one-level scan reaches, so this read 0 — "the buttons are at the very top of the screen" —
  // and failed a check about thumb reach on a card whose buttons were never found at all.
  let buttonTop = 0;
  const seek = (list, depth) => {
    for (const child of list ?? []) {
      if (child.type === 'Text' && /^(Next|Skip|Got it|Tiếp|Bỏ qua|Đã rõ)$/.test(child.text)) {
        buttonTop = Math.max(buttonTop, child.getWorldTransformMatrix().ty);
      }
      if (child.list && depth < 5) seek(child.list, depth + 1);
    }
  };
  seek(scene.children.list, 0);
  const target = scene.runTour ? 'up' : 'none';
  return {
    buttonTop,
    target,
    active: scene.tourActive,
    height: window.__phaserGame.scale.gameSize.height,
  };
});
check('the card keeps its buttons within reach of a thumb',
  reach.target === 'up' && reach.buttonTop > reach.height / 2,
  JSON.stringify(reach));


await first.close();

// ── The front page's tour ends by handing over a game, not a manual ─────────
//
// The last card used to offer "How to play", which opened four pages of prose — a tour that
// answers "how do I play" with "go and read". It now starts a real run with the walkthrough on.
// `?tour=1` is required: the front-page tour is suppressed under `navigator.webdriver` like every
// other one here.
const handoff = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const handoffErrors = [];
handoff.on('pageerror', (e) => handoffErrors.push(e.message));
handoff.on('console', (m) => { if (m.type() === 'error') handoffErrors.push(m.text()); });
// English first, so that picking Tiếng Việt below is a real switch.
//
// `Copilot` only makes the *other* language pressable — `if (option.id !== current)` — so on a page
// that already opened in Vietnamese, which is the product default, this section asked the card to
// switch to the language it was in, found a label with no handler on it, and reported that nothing
// was stored. Nothing was: nothing had been asked for.
await handoff.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));
await handoff.goto(`${BASE}/?capture=1&tour=1`, { waitUntil: 'domcontentloaded' });
await handoff.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await handoff.waitForTimeout(1400);

const pressOnMenu = (pattern) => handoff.evaluate((source) => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const re = new RegExp(source);
  for (const child of scene.children.list) {
    const label = child.list?.find?.((k) => k.type === 'Text' && re.test(k.text));
    if (label) {
      const hit = child.list.find((k) => k.type === 'Rectangle');
      hit?.emit('pointerdown', { id: 11, downTime: 0 }, 0, 0, { stopPropagation() {} });
      hit?.emit('pointerup', { id: 11, downTime: 0 }, 0, 0, { stopPropagation() {} });
      return true;
    }
  }
  return false;
}, pattern);

// ── The first card offers the language ──────────────────────────────────────
//
// A tour is the first thing a new player sees and it comes up in whatever the browser defaulted
// to, while the switch that would fix it is a two-word line at the foot of a page this very tour
// is covering with its veil: the one moment the choice is most needed is the one moment the usual
// control cannot be reached.
const pickLanguage = (label) => handoff.evaluate((want) => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const languageId = want === 'Tiếng Việt' ? 'vi' : 'en';
  const semanticHit = scene.children.list.find((child) => child.getData?.('languageOption') === languageId
    && child.depth >= 900);
  if (semanticHit) {
    semanticHit.emit('pointerdown', { id: 21, downTime: 0 }, 0, 0, { stopPropagation() {} });
    semanticHit.emit('pointerup', { id: 21, downTime: 0 }, 0, 0, { stopPropagation() {} });
    return true;
  }
  for (const child of scene.children.list) {
    if (child.type !== 'Text' || child.text !== want || child.depth < 900) continue;
    const m = child.getWorldTransformMatrix();
    const hit = scene.children.list.find((r) => r.type === 'Rectangle' && r.depth >= 900
      && Math.abs(r.x - (m.tx + child.width / 2)) < 4);
    if (hit) {
      hit.emit('pointerdown', { id: 21, downTime: 0 }, 0, 0, { stopPropagation() {} });
      hit.emit('pointerup', { id: 21, downTime: 0 }, 0, 0, { stopPropagation() {} });
      return true;
    }
  }
  return false;
}, label);

const offered = await handoff.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  return scene.children.list
    .filter((c) => c.type === 'Text' && c.depth >= 900)
    .map((c) => c.text);
});
check('the first card offers both languages',
  offered.includes('English') && offered.includes('Tiếng Việt'), JSON.stringify(offered));

check('the other language can be pressed', await pickLanguage('Tiếng Việt'));
await handoff.waitForTimeout(700);
const switched = await handoff.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const menuLabels = scene.children.list
    .flatMap((c) => (c.list ?? []).filter((k) => k.type === 'Text').map((k) => k.text));
  const cardLabels = scene.children.list
    .filter((c) => c.type === 'Text' && c.depth >= 900).map((c) => c.text);
  return {
    stored: localStorage.getItem('mandate:language:v1'),
    tourUp: Boolean(scene.copilot),
    cardVietnamese: cardLabels.some((text) => /Chào mừng/.test(text)),
    pageVietnamese: menuLabels.some((text) => /Rồng Thăng Long|Chế độ cổ điển/.test(text)),
  };
});
check('choosing it switches the language', switched.stored === 'vi', JSON.stringify(switched));
check('the card redraws in it rather than restarting the tour',
  switched.cardVietnamese && switched.tourUp, JSON.stringify(switched));
// Nothing in this game subscribes to `subscribeLanguageChange` — every switch re-renders its own
// scene by hand — so without wiring the page would stay in the old language behind the new card.
check('and the page underneath redraws with it', switched.pageVietnamese, JSON.stringify(switched));
// Back to English so the rest of the run reads the labels it expects.
await pickLanguage('English');
await handoff.waitForTimeout(600);

for (let card = 1; card <= 4; card += 1) {
  const advanced = await pressOnMenu('^Next$');
  if (!advanced) { check(`front-page tour card ${card} has a Next`, false); break; }
  await handoff.waitForTimeout(320);
}
const lastCard = await handoff.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const labels = [];
  for (const child of scene.children.list) {
    const label = child.list?.find?.((k) => k.type === 'Text');
    if (label) labels.push(label.text);
  }
  return labels;
});
check('the last front-page card offers to teach by playing',
  lastCard.some((text) => /Play now/.test(text)), JSON.stringify(lastCard.slice(-4)));
// Two buttons, and they are two different things: get out of the way, or take me in and show me.
// The pair used to be "Start playing" against "How to play now", which asked the player to choose
// between two ways of starting the same game — one of which silently meant "and be coached".
check('and an exit that is not a second way to start the game',
  lastCard.some((text) => /^Close$/.test(text))
  && !lastCard.some((text) => /Start playing|How to play/.test(text)),
  JSON.stringify(lastCard.slice(-5)));
// A label that wraps inside its button is the failure this row is most prone to: it carries two
// buttons and a counter on one line, and the longer of the two labels grew when it stopped
// pointing at the manual.
const NEWLINE = String.fromCharCode(10);
check('neither button on that card wraps',
  !lastCard.some((text) => /Play now|Close/.test(text) && text.includes(NEWLINE)),
  JSON.stringify(lastCard.filter((text) => text.includes(NEWLINE))));

check('pressing it is possible', await pressOnMenu('Play now'));
const landed = await handoff.waitForFunction(
  () => window.__phaserGame.scene.isActive('ConquestUIScene'),
  null,
  { timeout: 20000 },
).then(() => true).catch(() => false);
check('it opens a real run rather than the manual', landed);
if (landed) {
  await handoff.waitForTimeout(1500);
  const coached = await handoff.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('ConquestUIScene');
    return { guidedRun: scene.guidedRun, active: scene.tourActive, shown: [...scene.tourStagesShown] };
  });
  check('and the run it opens is a coached one',
    coached.guidedRun === true && coached.active === true, JSON.stringify(coached));
}
handoffErrors.forEach((e) => errors.push(`handoff: ${e}`));
await handoff.close();

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${passed}/${passed + failed} checks passed`);
console.log(failed
  ? 'FAIL: the guided run does not reach the game or does not coach it'
  : 'PASS: the manual opens a real run and coaches it step by step');
process.exit(failed ? 1 : 0);
