// Verifies the mobile lane UX requested for Dragon Ascent:
// - Build's claim policy is a fixed footer checkbox.
// - Army's muster policy is a fixed footer checkbox and no longer lives in the system menu.
// - The Chronicle is split into four fixed tabs which can be reached without scrolling.
//
// Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-lane-settings-tabs.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/web-game/lane-settings-tabs';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// The game defaults to Vietnamese now; the first half of this file asserts the English labels,
// so pin the language — the Vietnamese passes below switch with setLanguage('vi') as before.
await page.addInitScript(() => localStorage.setItem('mandate:language:v1', 'en'));
const errors = [];
const checks = [];
const check = (pass, label, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
};
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`CONSOLE: ${message.text()}`);
});

await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260824, 'ascent', 'v1'));
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await page.waitForTimeout(800);

// Finish only the opening chain. The screen tests below use the real lane methods and real state.
await page.evaluate(async () => {
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const state = window.__mandateState;
  let guard = 0;
  while (state.pendingAscentPrompt && guard++ < 12) {
    const prompt = state.pendingAscentPrompt;
    const choice = prompt.kind === 'founder'
      ? prompt.options[0]
      : prompt.kind === 'court-appointment'
        ? prompt.options[0].id
        : prompt.kind === 'power-draft'
          ? (prompt.cards[0] ?? 'skip')
          : 'ok';
    if (!resolveAscentPrompt(state, choice)) break;
  }
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.events.emit('state-changed');
});

const textSnapshot = () => page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const text = [];
  const walk = (object) => {
    if (object?.type === 'Text') text.push(object.text);
    if (object?.list) object.list.forEach(walk);
  };
  walk(ui.modalLayer);
  return text;
});

const clickText = async (startsWith) => {
  const point = await page.evaluate((prefix) => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const found = [];
    const walk = (object) => {
      if (object?.type === 'Text' && object.text.startsWith(prefix)) found.push(object);
      if (object?.list) object.list.forEach(walk);
    };
    walk(ui.modalLayer);
    const object = found[0];
    return object ? { x: object.x + 2, y: object.y + 2 } : null;
  }, startsWith);
  if (!point) throw new Error(`Could not find visible text starting with ${startsWith}`);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(160);
};

// A standing setting lives in the page's bottom sheet now, which is shut until it is asked for.
// Every check below therefore raises the sheet first, exactly as a player does.
const openLaneSheet = async (lane) => {
  await page.evaluate((l) => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.closeLane();
    ui.dockExpanded = true;
    ui.openLane(l);
  }, lane);
  await page.waitForTimeout(220);
};

// Build: asking is the default and the entire checkbox strip is tappable.
await openLaneSheet('build');
await page.waitForTimeout(180);
let texts = await textSnapshot();
check(texts.filter((line) => line === 'Claims: the court asks first').length === 1,
  'Build shows the claim policy once, in its sheet');
await page.screenshot({ path: `${OUT}/build-checked.png` });
await clickText('Claims: the court asks first');
check(await page.evaluate(() => window.__mandateState.ascent.autoClaimSilently === true),
  'tapping Build footer hands routine claims to the court');

// Army: the same control shape, governing the muster it sits beside.
await openLaneSheet('army');
texts = await textSnapshot();
check(texts.filter((line) => line === 'Musters: your general asks first').length === 1,
  'Army shows the muster policy once, in its sheet');
await page.screenshot({ path: `${OUT}/army-checked.png` });
await clickText('Musters: your general asks first');
check(await page.evaluate(() => window.__mandateState.ascent.autoMusterSilently === true),
  'tapping Army footer hands routine musters to the general');

// The gameplay-specific muster policy no longer clutters the save/exit menu.
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane();
  ui.showSystemMenu();
});
await page.waitForTimeout(180);
texts = await textSnapshot();
check(!texts.some((line) => line.startsWith('Musters:')),
  'system menu no longer duplicates the muster policy');

// Chronicle: four fixed shelves; switching shelves is a real canvas tap and leaves the footer
// preference intact. Empty shelves are intentional here — they make clipping easiest to see.
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane();
  ui.chronicleTab = 'actions';
  ui.dockExpanded = false;
  ui.openLane('chronicle');
});
await page.waitForTimeout(180);
texts = await textSnapshot();
check(['Actions', 'Ongoing', 'Heard', 'Recorded'].every((label) => texts.some((line) => line.startsWith(label))),
  'Chronicle exposes all four tabs together');
await page.screenshot({ path: `${OUT}/chronicle-actions.png` });

for (const [label, expected] of [['Ongoing', 'ongoing'], ['Heard', 'heard'], ['Recorded', 'recorded'], ['Actions', 'actions']]) {
  await clickText(label);
  const active = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').chronicleTab);
  check(active === expected, `${label} tab opens`, active);
  await page.screenshot({ path: `${OUT}/chronicle-${expected}.png` });
}

// Vietnamese is the shipping source language and its labels are longer, so it gets its own
// visual pass rather than relying on the shorter English tabs to prove they fit.
await page.evaluate(async () => {
  const { setLanguage } = await import('/src/i18n/index.ts');
  setLanguage('vi');
  const state = window.__mandateState;
  state.ascent.autoClaimSilently = false;
  state.ascent.autoMusterSilently = false;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane();
});
await openLaneSheet('build');
texts = await textSnapshot();
check(texts.includes('Thu phục: triều đình hỏi trước'), 'Vietnamese claim checkbox label fits');
await page.screenshot({ path: `${OUT}/build-vi.png` });

await openLaneSheet('army');
texts = await textSnapshot();
check(texts.includes('Lập quân: tướng hỏi trước'), 'Vietnamese muster checkbox label fits');
await page.screenshot({ path: `${OUT}/army-vi.png` });

await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane();
  ui.chronicleTab = 'actions';
  ui.openLane('chronicle');
});
await page.waitForTimeout(180);
texts = await textSnapshot();
check(['Cần xử lý', 'Đang diễn ra', 'Đã nghe', 'Đã chép'].every((label) => texts.some((line) => line.startsWith(label))),
  'all four Vietnamese Chronicle tabs fit together');
const textState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
check(textState.ascent?.ui?.screen === 'lane:chronicle'
    && textState.ascent.ui.chronicleTab === 'actions'
    && textState.ascent.ui.claimsAskFirst === true
    && textState.ascent.ui.mustersAskFirst === true,
  'text-state output matches the visible lane and footer settings',
  JSON.stringify(textState.ascent?.ui));
await page.screenshot({ path: `${OUT}/chronicle-vi.png` });

// Let a real reign fill the shelves, then capture the views the tab split exists to tame. This
// catches a different class of fault from the empty-state pass: counts, headings and long rows
// must be inside the scroll viewport while the fixed tabs stay put.
const filled = await page.evaluate(async () => {
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const state = window.__mandateState;
  const answer = (prompt) => {
    switch (prompt.kind) {
      case 'power-draft': return prompt.cards[0] ?? 'skip';
      case 'conquer-target': return prompt.targets[0]?.landId ?? 'hold';
      case 'conquer-method': return prompt.target.methods.find((method) => !method.blockedReason)?.method ?? 'back';
      case 'hero-choice': return prompt.heroIds[0] ?? 'pass';
      case 'court-appointment': return prompt.options[0]?.id ?? 'ok';
      case 'law-choice': return prompt.projectIds[0] ? `edict:${prompt.projectIds[0]}` : 'hold';
      case 'story-beat': return prompt.options.find((option) => option.affordable)?.id ?? prompt.options[0]?.id ?? 'ok';
      case 'run-over': return null;
      default: return prompt.options?.find((option) => option.affordable)?.id
        ?? prompt.options?.[0]?.id ?? prompt.options?.[0] ?? 'ok';
    }
  };
  for (let tick = 0; tick < 260 && !state.isDefeated; tick += 1) {
    let guard = 0;
    while (state.pendingAscentPrompt && guard++ < 12) {
      const choice = answer(state.pendingAscentPrompt);
      if (choice === null || !resolveAscentPrompt(state, choice)) break;
    }
    if (state.pendingAscentPrompt?.kind === 'run-over') break;
    state.isPaused = false;
    advanceAscentTick(state);
  }
  // UI inspection is read-only; take down any pacing card left at the final sample.
  state.pendingAscentPrompt = undefined;
  state.ascent.promptQueue = [];
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane();
  ui.chronicleTab = 'ongoing';
  ui.openLane('chronicle');
  return {
    ongoing: (state.stories ?? []).filter((story) => story.spoken.length > 0).length,
    heard: (state.eventLog ?? []).filter((entry) => entry.ref).length,
    recorded: (state.chronicle ?? []).length,
  };
});
check(filled.ongoing > 0 && filled.heard > 0,
  'a real reign fills the separated live Chronicle shelves', JSON.stringify(filled));
await page.waitForTimeout(160);
await page.screenshot({ path: `${OUT}/chronicle-vi-ongoing-filled.png` });
await page.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.chronicleTab = 'heard';
  ui.showChronicleScreen();
});
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/chronicle-vi-heard-filled.png` });

// The desktop shell can be only 620px tall. Load at that height (rather than resize after module
// initialization) and ensure the new fixed furniture still leaves every control on the sheet.
const shortPage = await browser.newPage({ viewport: { width: 390, height: 620 } });
shortPage.on('pageerror', (error) => errors.push(`SHORT PAGEERROR: ${error.message}`));
shortPage.on('console', (message) => {
  if (message.type() === 'error') errors.push(`SHORT CONSOLE: ${message.text()}`);
});
await shortPage.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await shortPage.waitForFunction(() => typeof window.__startBenchGame === 'function'
  && window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
await shortPage.evaluate(() => window.__startBenchGame(20260824, 'ascent', 'v1'));
await shortPage.waitForFunction(() => window.__phaserGame?.scene.isActive('ConquestScene'), null, { timeout: 30000 });
await shortPage.waitForTimeout(700);
await shortPage.evaluate(async () => {
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { setLanguage } = await import('/src/i18n/index.ts');
  const state = window.__mandateState;
  let guard = 0;
  while (state.pendingAscentPrompt && guard++ < 12) {
    const prompt = state.pendingAscentPrompt;
    const choice = prompt.kind === 'founder' ? prompt.options[0]
      : prompt.kind === 'court-appointment' ? prompt.options[0].id
        : prompt.kind === 'power-draft' ? (prompt.cards[0] ?? 'skip') : 'ok';
    if (!resolveAscentPrompt(state, choice)) break;
  }
  setLanguage('vi');
  state.ascent.autoClaimSilently = false;
  state.ascent.autoMusterSilently = false;
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.events.emit('state-changed');
  ui.openLane('build');
});
await shortPage.waitForTimeout(160);
await shortPage.screenshot({ path: `${OUT}/build-vi-short.png` });
await shortPage.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane();
  ui.openLane('army');
});
await shortPage.waitForTimeout(160);
await shortPage.screenshot({ path: `${OUT}/army-vi-short.png` });
await shortPage.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  ui.closeLane();
  ui.chronicleTab = 'actions';
  // The shelf preference is sheet content, so the sheet is up for the crowding pass — this is
  // the tallest the foot of the page ever gets, which is the case worth measuring.
  ui.dockExpanded = true;
  ui.openLane('chronicle');
});
await shortPage.waitForTimeout(220);
await shortPage.screenshot({ path: `${OUT}/chronicle-vi-short.png` });
const shortBounds = await shortPage.evaluate(() => {
  const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
  const rows = [];
  const walk = (object) => {
    if (object?.type === 'Text') {
      const bounds = object.getBounds();
      rows.push({ text: object.text, top: bounds.top, bottom: bounds.bottom });
    }
    if (object?.list) object.list.forEach(walk);
  };
  walk(ui.modalLayer);
  return rows;
});
const shortClose = shortBounds.find((row) => row.text === 'Đóng');
const shortToggle = shortBounds.find((row) => row.text === 'Tấu chương: quan lại hỏi trước');
check(Boolean(shortClose && shortToggle && shortToggle.bottom < shortClose.top && shortClose.bottom <= 620),
  'tabs, checkbox, and Close remain separated at 390×620',
  JSON.stringify({ toggle: shortToggle, close: shortClose }));
await shortPage.close();

check(errors.length === 0, 'no browser console errors', errors.slice(0, 2).join(' | '));

await browser.close();
const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
