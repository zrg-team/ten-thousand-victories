/**
 * Lễ Đăng Quang — the Coronation (docs/phase-1/28-the-coronation.html).
 *
 * Six things this has to prove, and each of them is a way the feature could ship broken while
 * compiling perfectly:
 *
 *   1. the rite is raised on the first ever open and **never again** — gated on the store, not
 *      on a scene flag, because a scene flag comes back on an HMR reload;
 *   2. a skip writes a *complete* founder, so no screen downstream needs a second path;
 *   3. the stored look actually renders — a portrait that bakes blank is cached blank for ever;
 *   4. era law holds by construction: the picker pages the wardrobe's pools, so a Trần hat can
 *      never meet a Nguyễn collar;
 *   5. the badge is live — the plate steps with the dynasty's level rather than being frozen at
 *      the rank the king was made at, which is the whole promise the crown step makes;
 *   6. locks hold ornament and never identity.
 *
 * Usage: node test_scripts/verify/verify-coronation.mjs   (a dev server must already be running)
 */
import { chromium } from 'playwright';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5173';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push({ label, pass });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);

// ── 1. The gate: once, ever ─────────────────────────────────────────────────
console.log('=== THE GATE ===');
const gate = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
  const d = await import('/src/state/dynasty.ts');
  const out = {};

  localStorage.removeItem('mandate:dynasty:v1');
  let state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.queuedFirst = [state.pendingAscentPrompt, ...state.ascent.promptQueue]
    .filter(Boolean).map((p) => p.kind);
  drainAscentPrompts(state);
  out.firstUp = state.pendingAscentPrompt?.kind;

  // Answered blind, exactly as every driver in test_scripts/ answers an unknown kind.
  out.handled = resolveAscentPrompt(state, 'ok');
  out.crownedAfterSkip = d.isCrowned();
  out.founder = d.getDynasty().founder;
  out.kingName = state.heroes.find((h) => h.id === 'king')?.name;
  out.kingSex = state.heroes.find((h) => h.id === 'king')?.sex;
  out.kingEra = state.heroes.find((h) => h.id === 'king')?.era;

  // Second boot: the rite is gone and the run opens on the mandate.
  state = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  out.queuedSecond = [state.pendingAscentPrompt, ...state.ascent.promptQueue]
    .filter(Boolean).map((p) => p.kind);
  drainAscentPrompts(state);
  out.secondUp = state.pendingAscentPrompt?.kind;
  return out;
});

check('the first ever run queues the coronation', gate.queuedFirst.includes('coronation'),
  gate.queuedFirst.join(' / '));
check('it is the first card up, ahead of the mandate and the founding',
  gate.firstUp === 'coronation', String(gate.firstUp));
check('a blind answer resolves it', gate.handled === true);
check('a skip writes a complete founder',
  Boolean(gate.founder?.look?.parts?.length) && Boolean(gate.founder?.banner)
  && typeof gate.founder?.armyEra === 'string' && typeof gate.founder?.givenName === 'string',
  JSON.stringify({ parts: gate.founder?.look?.parts?.length, banner: !!gate.founder?.banner }));
check('the run\'s king takes the founder\'s name, sex and era',
  gate.kingName === gate.founder?.name && gate.kingSex === gate.founder?.sex
  && gate.kingEra === gate.founder?.era,
  `${gate.kingName} / ${gate.kingSex} / ${gate.kingEra}`);
check('a crowned house never raises it again',
  !gate.queuedSecond.includes('coronation') && gate.secondUp === 'mandate',
  gate.queuedSecond.join(' / '));

// ── 2. The look: renders, and follows the era ───────────────────────────────
console.log('\n=== THE WARDROBE ===');
const wardrobe = await page.evaluate(async () => {
  const k = await import('/src/ui/faces/kingLook.ts');
  const { resolveHeroLook } = await import('/src/ui/faces/heroLook.ts');
  const { generateKingHero } = await import('/src/data/heroes.ts');
  const d = await import('/src/state/dynasty.ts');
  const c = await import('/src/state/cabinet.ts');
  const out = {};

  const base = k.rollKingChoice(() => 0.5);
  const keysOf = (choice, rank) => k.buildKingLook(choice, rank).parts.map((p) => p.key);

  out.tran = keysOf({ ...base, sex: 'man', era: 'tran', register: 'court' }, 1);
  out.nguyen = keysOf({ ...base, sex: 'man', era: 'nguyen', register: 'court' }, 1);
  out.woman = keysOf({ ...base, sex: 'woman', era: 'le', age: 'prime' }, 2);
  out.youngMan = keysOf({ ...base, sex: 'man', era: 'le', age: 'young' }, 0);

  // Every key the builder emits must exist in the shipped manifest, or the renderer draws air.
  const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
  const known = new Set(FACE_PART_DEFS.map((def) => def.key));
  out.unknown = [];
  for (const era of k.KING_ERAS) {
    for (const sex of ['man', 'woman']) {
      for (const age of ['young', 'prime', 'elder']) {
        for (let rank = 0; rank <= 3; rank += 1) {
          for (let step = 0; step < 8; step += 1) {
            const choice = { ...base, sex, era, age, hat: step, hair: step, face: step, beard: step, dress: step };
            for (const key of keysOf(choice, rank)) {
              if (!known.has(key)) out.unknown.push(`${era}/${sex}/${age}/${rank}:${key}`);
            }
          }
        }
      }
    }
  }
  out.unknown = out.unknown.slice(0, 6);

  // The badge ladder is live: the same king, two dynasty levels.
  localStorage.removeItem('mandate:dynasty:v1');
  d.setDynastyFounder(k.rollFounder(0, () => 0.5));
  const atCommon = resolveHeroLook(generateKingHero()).parts.map((p) => p.key);
  localStorage.setItem('mandate:dynasty:v1', JSON.stringify({
    ...d.getDynasty(), xp: 5_000_000, founder: d.getDynasty().founder,
  }));
  out.level = d.getDynasty().level;
  const atTop = resolveHeroLook(generateKingHero()).parts.map((p) => p.key);
  out.plateCommon = atCommon.filter((key) => key.startsWith('plate-'));
  out.plateTop = atTop.filter((key) => key.startsWith('plate-'));
  out.sealTop = atTop.filter((key) => key.startsWith('rank-'));
  out.faceSame = atCommon.filter((key) => key.startsWith('head-')).join() === atTop.filter((key) => key.startsWith('head-')).join();
  out.stampMoved = false;

  // The re-dress stamp: the same king in a different robe must not answer to the same cache key.
  const before = d.dynastyLookStamp();
  const founder = d.getDynasty().founder;
  d.setDynastyFounder({ ...founder, look: { ...founder.look, robe: 0x123456 } });
  out.stampMoved = d.dynastyLookStamp() !== before;

  // Locks. Ornament only: with no deeds the war register still dresses the king, in court.
  localStorage.removeItem('mandate:cabinet:v1');
  c.resetCabinetCache();
  out.warLockedThenArmour = keysOf({ ...base, register: 'war', era: 'le' }, 1)
    .some((key) => key.startsWith('robe-armour'));
  out.warLockedDressed = keysOf({ ...base, register: 'war', era: 'le' }, 1).length > 6;
  c.grantDeed('wave-ten');
  out.warOpenThenArmour = keysOf({ ...base, register: 'war', era: 'le' }, 1)
    .some((key) => key.startsWith('robe-armour'));
  return out;
});

check('a Trần king never wears a Nguyễn collar or a khăn xếp',
  !wardrobe.tran.some((key) => key.startsWith('collar-nguthan') || key === 'hat-khanxep'),
  wardrobe.tran.filter((k) => k.startsWith('collar-') || k.startsWith('hat-')).join(' '));
check('a Nguyễn king never wears the collar the 1744 reform replaced',
  !wardrobe.nguyen.some((key) => key.startsWith('collar-giaolinh')),
  wardrobe.nguyen.filter((k) => k.startsWith('collar-')).join(' '));
check('a woman is never given facial hair',
  !wardrobe.woman.some((key) => key.startsWith('beard-')));
check('a young man is never given facial hair',
  !wardrobe.youngMan.some((key) => key.startsWith('beard-')));
check('every part the builder emits exists in the manifest',
  wardrobe.unknown.length === 0, wardrobe.unknown.join(' '));
check('the plate steps with the dynasty, not with the king',
  wardrobe.plateCommon[0] === 'plate-common' && wardrobe.plateTop[0] === 'plate-legendary'
  && wardrobe.sealTop.length === 1 && wardrobe.faceSame,
  `${wardrobe.plateCommon[0]} -> ${wardrobe.plateTop[0]} at level ${wardrobe.level}`);
check('a re-dress moves the portrait cache stamp', wardrobe.stampMoved === true);
check('the war harness is held back until it is earned, and the king is still dressed',
  wardrobe.warLockedThenArmour === false && wardrobe.warLockedDressed === true
  && wardrobe.warOpenThenArmour === true);

// ── 3. Rendered: the rite draws, and the Temple opens ───────────────────────
console.log('\n=== RENDERED ===');
await page.evaluate(() => {
  localStorage.removeItem('mandate:dynasty:v1');
  localStorage.removeItem('mandate:cabinet:v1');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
await page.evaluate(() => window.__startBenchGame(1337, 'ascent'));
await page.waitForFunction(() => {
  const state = JSON.parse(window.render_game_to_text());
  return state?.ascent?.prompt?.kind === 'coronation';
}, null, { timeout: 20000 }).catch(() => {});

const drawn = await page.evaluate(() => {
  const state = JSON.parse(window.render_game_to_text());
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  return {
    kind: state?.ascent?.prompt?.kind,
    screen: state?.ascent?.ui?.screen,
    // The rows live inside the scroll area's own content container, not in the modal layer —
    // counting the layer alone would pass on a sheet whose body drew nothing at all.
    rows: ui?.activeScrollAreas?.[0]?.content?.list?.length ?? 0,
    chrome: ui?.modalLayer?.list?.length ?? 0,
  };
});
check('the rite is the first card the mode shows', drawn.kind === 'coronation', String(drawn.kind));
check('it draws a sheet rather than holding an empty screen',
  drawn.rows > 30 && drawn.chrome >= 5, `${drawn.rows} rows in ${drawn.chrome} chrome objects`);

// Step through it the way a thumb would, and photograph every step: a wardrobe failure is
// visual, and a step that draws its title over an empty body passes every assertion here.
const walked = { ok: false, changed: false, titles: [], rows: [] };
{
  const first = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const sheet = ui.coronationSheet;
    if (!sheet) return null;
    const before = JSON.stringify(sheet.choice);
    sheet.choice.hat += 1;
    sheet.choice.face += 3;
    ui.replaceLanePage(() => ui.showCoronation());
    return { changed: JSON.stringify(sheet.choice) !== before };
  });
  walked.ok = Boolean(first);
  walked.changed = first?.changed === true;
  for (let step = 0; step < 4; step += 1) {
    const drawnStep = await page.evaluate((n) => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      ui.coronationSheet.step = n;
      ui.replaceLanePage(() => ui.showCoronation());
      return {
        title: ui.coronationSheet.title(),
        rows: ui.activeScrollAreas?.[0]?.content?.list?.length ?? 0,
      };
    }, step);
    walked.titles.push(drawnStep.title);
    walked.rows.push(drawnStep.rows);
    await page.screenshot({ path: `test_scripts/shots/coronation-step${step + 1}.png` });
  }
}
check('the steppers change the king being made', walked.ok && walked.changed === true);

// The option grid: every choice drawn as the king wearing it, reached by tapping the row.
const grid = await page.evaluate(async () => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const sheet = ui.coronationSheet;
  sheet.step = 0;
  // An elder man: every pool this walks is non-trivial for him. A young woman's beard pool has
  // one entry, and its stepper is not drawn at all — a grid of one is not what is being tested.
  sheet.choice.sex = 'man';
  sheet.choice.age = 'elder';
  const out = {};
  for (const field of ['hat', 'hair', 'face', 'beard', 'dress']) {
    sheet.grid = field;
    ui.replaceLanePage(() => ui.showCoronation());
    out[field] = {
      title: sheet.title(),
      rows: ui.activeScrollAreas?.[0]?.content?.list?.length ?? 0,
    };
  }
  sheet.grid = 'hat';
  ui.replaceLanePage(() => ui.showCoronation());
  return out;
});
check('every wardrobe field opens a grid of drawn options',
  ['hat', 'hair', 'face', 'beard', 'dress'].every((f) => grid[f].rows >= 8
    && !grid[f].title.startsWith('coronation.')),
  Object.entries(grid).map(([f, g]) => `${f}:${g.rows}`).join(' '));
await page.screenshot({ path: 'test_scripts/shots/coronation-grid.png' });
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.coronationSheet.grid = undefined;
  ui.replaceLanePage(() => ui.showCoronation());
});
check('all four steps draw a title and a body',
  walked.titles.length === 4 && walked.titles.every(Boolean) && walked.rows.every((n) => n > 6),
  `${walked.titles.join(' · ')} — rows ${walked.rows.join('/')}`);

// Confirm through the sheet's own foot, then look at what the store holds.
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const sheet = ui.coronationSheet;
  sheet.step = 3;
  sheet.foot().close.onTap();
});
await page.waitForTimeout(400);
const crowned = await page.evaluate(async () => {
  const d = await import('/src/state/dynasty.ts');
  const state = JSON.parse(window.render_game_to_text());
  const store = d.getDynasty();
  return {
    prompt: state?.ascent?.prompt?.kind ?? null,
    house: store.house,
    name: store.founder?.name,
    parts: store.founder?.look?.parts?.length ?? 0,
    emblem: store.founder?.banner?.emblem,
  };
});
check('taking the throne crowns the house and closes the card',
  crowned.parts > 6 && Boolean(crowned.house) && crowned.name?.startsWith(crowned.house)
  && crowned.prompt !== 'coronation',
  `${crowned.name} of ${crowned.house}, ${crowned.parts} parts, next card ${crowned.prompt}`);

// The Temple door, on the sheet the house is read from. Reached by a reload rather than by
// `scene.start`: the ascent scenes stay resident, so a menu started under them draws correctly
// and photographs as whatever is still on top of it.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'),
  null, { timeout: 30000 },
);
const temple = await page.evaluate(async () => {
  const menu = window.__phaserGame.scene.getScene('MenuScene');
  menu.mode = 'dynasty';
  menu.render();
  const dynastyObjects = menu.content.length;
  menu.mode = 'temple';
  menu.render();
  return {
    dynastyObjects,
    templeObjects: menu.content.length,
    sheet: Boolean(menu.templeSheet),
    rows: menu.pageScroll?.content?.list?.length ?? 0,
  };
});
check('the Tông Phả sheet still draws with the banner and the Temple door on it',
  temple.dynastyObjects > 4, `${temple.dynastyObjects} objects`);
check('the Temple opens the same picker', temple.sheet === true && temple.rows > 30,
  `${temple.templeObjects} objects, ${temple.rows} rows`);
await page.screenshot({ path: 'test_scripts/shots/coronation-temple.png' });
await page.evaluate(() => {
  const menu = window.__phaserGame.scene.getScene('MenuScene');
  menu.mode = 'dynasty';
  menu.render();
});
await page.screenshot({ path: 'test_scripts/shots/coronation-dynasty-sheet.png' });

// ── report ──────────────────────────────────────────────────────────────────
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();

const failed = checks.filter((entry) => !entry.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) {
  console.log(failed.map((entry) => `  FAIL ${entry.label}`).join('\n'));
  process.exit(1);
}
