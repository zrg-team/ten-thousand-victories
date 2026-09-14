/**
 * Gia sản dòng họ — the run-start screen that reads out what the house already owns.
 *
 * The feature's whole claim is that a player who has banked meta-progression is *told* about it
 * before the reign starts, so the checks are in two halves:
 *
 *   1. the queue — coronation, then the inheritance, then the mandate, then the founding, in that
 *      order and exactly once each, driven headlessly through the real factory and resolver;
 *   2. the page — booted for real in three states (a veteran house, a first reign, and the whole
 *      thing in Vietnamese) and read off the display list, because a summary that quotes a figure
 *      the run is not holding compiles perfectly.
 *
 * The stores are seeded as raw localStorage rather than through the modules: `getDynasty` and
 * `getCabinet` read localStorage on every call, so this sidesteps the dual-module-instance trap
 * that makes a harness mutate a copy of a store the game never reads.
 *
 * Usage: node test_scripts/verify/verify-inheritance-screen.mjs   (a dev server must already be running)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';
const SHOTS = 'output/web-game';
mkdirSync(SHOTS, { recursive: true });

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();

/** A house three reigns deep: four traits, two seals slotted, draws still waiting. */
const VETERAN = {
  'mandate:dynasty:v1': JSON.stringify({
    // Past the level-7 step of `2000 * 1.12^(n-1)`; the screen prints whatever level this buys.
    xp: 26000,
    traits: ['wide-draft', 'old-roads', 'deep-shelf', 'second-founder'],
    pendingPicks: 0,
    reigns: 3,
    bestScore: 4120,
    respecs: 0,
    history: [],
    traitUses: {},
  }),
  'mandate:cabinet:v1': JSON.stringify({
    cards: {
      'bach-dang-stakes': { level: 2, copies: 1 },
      'granary-edict': { level: 1, copies: 0 },
    },
    rubbings: 2,
    rubbingPity: 0,
    learnedRecipes: [],
    openingHand: ['bach-dang-stakes', 'granary-edict'],
    deeds: [],
    packsBought: 0,
  }),
};

async function open(stores, { language = 'en', viewport = { width: 390, height: 844 } } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });
  // Before navigation, not after: the language and both stores are read during boot.
  await page.addInitScript(([seed, lang]) => {
    localStorage.setItem('mandate:language:v1', lang);
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  }, [stores, language]);
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
    null, { timeout: 30000 },
  );
  return { page, errors };
}

/**
 * Every Text under the prompt, once each, with its position in design units.
 *
 * Walked from `modalLayer` alone: `promptScrollBody` adds its scroll area *to* that layer, so
 * walking `activeScrollAreas` as well counts every scrolled row twice — which reads exactly like
 * a page listing the same trait on two rows. `scrolled` is the area's own child count, kept
 * because a body that stopped scrolling would strand its last rows silently.
 *
 * `game.scale.height` is the *render* size — `GAME_HEIGHT` times the quality tier's RENDER_SCALE,
 * so it comes back 1240 on a desktop sheet that is really 620 tall, and a fit check against it
 * passes no matter how far off the bottom a control has fallen. The design height is read from
 * the constants module, which is where every layout in the game reads it.
 */
const READ_PAGE = async () => {
  const game = window.__phaserGame;
  const scene = game.scene.getScene('ConquestScene');
  const ui = game.scene.getScene('ConquestUIScene');
  const { GAME_HEIGHT } = await import('/src/game/constants.ts');
  const texts = [];
  const boxes = [];
  const seen = new Set();
  const walk = (obj, ox, oy) => {
    if (seen.has(obj)) return;
    seen.add(obj);
    const x = ox + (obj.x ?? 0);
    const y = oy + (obj.y ?? 0);
    if (obj.type === 'Text' && obj.text) {
      texts.push(obj.text);
      boxes.push({ text: obj.text, x, y, h: obj.height ?? 0 });
    }
    if (obj.list) obj.list.forEach((child) => walk(child, x, y));
  };
  ui.modalLayer.list.forEach((obj) => walk(obj, 0, 0));
  const scrolled = (ui.activeScrollAreas ?? []).map((area) => area.content.length);
  return {
    kind: scene.state.pendingAscentPrompt?.kind,
    key: ui.openPromptKey,
    modalCount: ui.modalLayer.length,
    scrolled,
    texts,
    boxes,
    gameHeight: GAME_HEIGHT,
  };
};

// ── 1. The queue: what a run raises, and in what order ──────────────────────
console.log('=== QUEUE ===');
{
  const { page, errors } = await open({});
  const order = await page.evaluate(async () => {
    const { createAscentGameState } = await import('/src/state/GameState.ts');
    const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    localStorage.removeItem('mandate:dynasty:v1');
    localStorage.removeItem('mandate:cabinet:v1');

    const state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const seen = [];
    let guard = 0;
    while (guard++ < 12) {
      drainAscentPrompts(state);
      const prompt = state.pendingAscentPrompt;
      if (!prompt) break;
      seen.push(prompt.kind);
      // 'ok' is what the inheritance and the coronation both accept; the option kinds need
      // their own id, so hand each the first thing it offers.
      const answer = prompt.kind === 'mandate' || prompt.kind === 'founder'
        ? prompt.options[0]
        : 'ok';
      if (!resolveAscentPrompt(state, answer)) break;
    }

    // A second run on a crowned house: the rite is done, the inheritance still speaks.
    const again = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const seenAgain = [];
    let guard2 = 0;
    while (guard2++ < 12) {
      drainAscentPrompts(again);
      const prompt = again.pendingAscentPrompt;
      if (!prompt) break;
      seenAgain.push(prompt.kind);
      const answer = prompt.kind === 'mandate' || prompt.kind === 'founder' ? prompt.options[0] : 'ok';
      if (!resolveAscentPrompt(again, answer)) break;
    }
    return { seen, seenAgain };
  });

  const head = order.seen.slice(0, 4).join(' → ');
  check('a first run opens coronation → inheritance → mandate → founder',
    head === 'coronation → inheritance → mandate → founder', head);
  check('the inheritance is raised exactly once',
    order.seen.filter((kind) => kind === 'inheritance').length === 1, order.seen.join(','));
  check('a crowned house still gets it, with no second coronation',
    order.seenAgain[0] === 'inheritance' && !order.seenAgain.includes('coronation'),
    order.seenAgain.slice(0, 4).join(' → '));
  check('answering it never stalls the queue', order.seen.includes('founder'));
  check('no console errors (queue)', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// ── 2. The page, for a house three reigns deep ─────────────────────────────
console.log('\n=== VETERAN HOUSE ===');
{
  const { page, errors } = await open(VETERAN);
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  // Answer the rite; the inheritance is the card behind it.
  await page.evaluate(() => {
    const game = window.__phaserGame;
    const ui = game.scene.getScene('ConquestUIScene');
    ui.events.emit('ui:ascent-choice', 'ok');
    game.step(performance.now(), 16);
  });
  await page.waitForTimeout(500);

  const drawn = await page.evaluate(READ_PAGE);
  const all = drawn.texts.join(' | ');
  check('the inheritance is what is on screen',
    drawn.kind === 'inheritance' && drawn.key === 'inheritance:inheritance', `${drawn.kind} / ${drawn.key}`);
  check('the house line names the house and its ledger',
    /Dynasty level \d+ · 3 reigns · best 4,120 pts/.test(all), all.slice(0, 160));
  check('both slotted seals are named, with their cabinet level',
    all.includes('Bạch Đằng Stakes') && all.includes('Granary Edict') && /Lv2/.test(all),
    drawn.texts.filter((text) => /Stakes|Granary|Lv\d/.test(text)).join(' / '));
  check('the hand states the ambition it charged', /\+4 ambition/.test(all));
  check('the founding count reads the Second Founder the house holds',
    /Founding: 5 champions laid out/.test(all));
  check('every other held trait is listed once, with its delta',
    all.includes('Wide Draft') && all.includes('Old Roads') && all.includes('Deep Shelf')
    && /4 cards → 5 cards in every draft/.test(all));
  // Its effect *is* the founding count, so it is named there and nowhere else — a house holding
  // it must not read the same trait as a count at the top and a row further down.
  check('Second Founder is named once, on the founding row',
    drawn.texts.filter((text) => /Second Founder/.test(text)).length === 1,
    drawn.texts.filter((text) => /Second Founder/.test(text)).join(' / '));
  check('waiting draws are surfaced with their number', /Dynasty Deck: 2 draw/.test(all));
  check('nothing on the page is a placeholder row',
    !/will fill this|chờ bản sau|undefined|NaN/.test(all));

  // Fit: the two footer controls stand inside the sheet, and no text is drawn off the bottom.
  const fit = await page.evaluate(async () => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const buttons = [];
    ui.modalLayer.list.forEach((obj) => {
      if (obj.type !== 'Container') return;
      const label = obj.list.find((child) => child.type === 'Text' && child.text);
      if (label) buttons.push({ text: label.text, x: obj.x, y: obj.y });
    });
    return { buttons, height: (await import('/src/game/constants.ts')).GAME_HEIGHT };
  });
  const begin = fit.buttons.find((b) => /Begin the reign/.test(b.text));
  const leave = fit.buttons.find((b) => /Back to the menu/.test(b.text));
  check('both footer controls are on the sheet',
    Boolean(begin) && Boolean(leave) && begin.y > 0 && leave.y + 28 <= fit.height,
    `begin y=${begin?.y}, leave y=${leave?.y}, sheet ${fit.height}`);
  check('no text is drawn below the sheet',
    drawn.boxes.every((box) => box.y <= drawn.gameHeight),
    drawn.boxes.filter((box) => box.y > drawn.gameHeight).map((box) => box.text).slice(0, 3).join(' / '));

  await page.screenshot({ path: `${SHOTS}/inheritance-veteran.png` });

  // Six rows do not fit a phone sheet, so the body scrolls — and a body that scrolls but cannot
  // reach its own last row is worse than one that clips, because nothing says the row is there.
  const reach = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const area = ui.activeScrollAreas[0];
    const last = area.content.list[area.content.list.length - 1];
    const before = area.content.y + last.y;
    area.setScroll(9999);
    window.__phaserGame.step(performance.now(), 16);
    return { before, after: area.content.y + last.y, bottom: area.bounds.y + area.bounds.height };
  });
  check('scrolling reaches the last row', reach.after < reach.before && reach.after < reach.bottom,
    `${Math.round(reach.before)} → ${Math.round(reach.after)}, viewport ends ${Math.round(reach.bottom)}`);

  // A real press on the primary, at its own drawn position — not an emitted event.
  await page.mouse.click(195, begin.y + 23);
  await page.waitForTimeout(400);
  const after = await page.evaluate(READ_PAGE);
  check('pressing Begin the reign hands the run to the mandate',
    after.kind === 'mandate', `${after.kind}`);
  check('no console errors (veteran)', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// ── 3. The first reign: the empty state has to teach, not apologise ────────
console.log('\n=== FIRST REIGN ===');
{
  const { page, errors } = await open({});
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const game = window.__phaserGame;
    game.scene.getScene('ConquestUIScene').events.emit('ui:ascent-choice', 'ok');
    game.step(performance.now(), 16);
  });
  await page.waitForTimeout(500);

  const drawn = await page.evaluate(READ_PAGE);
  const all = drawn.texts.join(' | ');
  check('the screen still opens with nothing banked', drawn.kind === 'inheritance');
  check('the one empty slot is shown and explained',
    all.includes('Empty slot') && /Dynasty Deck/.test(all) && /Opening hand · one slot/.test(all)
    && !/slot\(s\)/.test(all), all.slice(0, 200));
  check('the empty trait row promises the ladder rather than nothing',
    /None yet/.test(all) && /gains a level each reign/.test(all));
  check('the founding count falls back to three',
    /Founding: 3 champions laid out/.test(all), all.slice(0, 120));
  check('no seal is claimed that the house does not hold',
    !/Bạch Đằng|Granary Edict/.test(all));
  check('no waiting-draws row when there are none', !/draw\(s\) waiting|Dynasty Deck: /.test(all));
  await page.screenshot({ path: `${SHOTS}/inheritance-first-reign.png` });
  check('no console errors (first reign)', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// ── 4. Tiếng Việt, and the short desktop sheet ─────────────────────────────
console.log('\n=== VI + SHORT SHEET ===');
{
  // A landscape window is what clamps `GAME_HEIGHT` to its 620 floor — the sheet the four-card
  // draft used to overflow. The page must scroll rather than strand its own footer.
  const { page, errors } = await open(VETERAN, { language: 'vi', viewport: { width: 1280, height: 720 } });
  await page.evaluate(() => window.__startBenchGame(1337, 'ascent', 'v1'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const game = window.__phaserGame;
    game.scene.getScene('ConquestUIScene').events.emit('ui:ascent-choice', 'ok');
    game.step(performance.now(), 16);
  });
  await page.waitForTimeout(500);

  const drawn = await page.evaluate(READ_PAGE);
  const all = drawn.texts.join(' | ');
  check('the sheet is at its 620 short floor', drawn.gameHeight === 620, `${drawn.gameHeight}`);
  check('the page is Vietnamese throughout',
    all.includes('GIA SẢN DÒNG HỌ') && all.includes('Bắt đầu đời trị vì')
    && !/Begin the reign|Traits in force/.test(all), all.slice(0, 140));
  check('the Vietnamese trait deltas are printed, not the English',
    all.includes('Thêm Một Lá') && all.includes('Đường Xưa'));
  check('the body scrolls instead of stranding rows',
    drawn.scrolled.length > 0 && drawn.scrolled[0] >= 6, drawn.scrolled.join(','));
  check('the footer still stands inside the short sheet',
    drawn.boxes.filter((box) => /Bắt đầu đời trị vì|Về màn hình chính/.test(box.text))
      .every((box) => box.y + box.h <= drawn.gameHeight),
    `sheet ${drawn.gameHeight}`);
  await page.screenshot({ path: `${SHOTS}/inheritance-vi-short.png` });
  check('no console errors (vi)', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(failed.length === 0
  ? 'PASS: the inheritance screen opens every reign, reads the live stores, and hands on to the mandate'
  : `FAIL: ${failed.map((c) => c.label).join('; ')}`);
process.exit(failed.length === 0 ? 0 : 1);
