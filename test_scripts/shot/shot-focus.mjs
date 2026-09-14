// The province-focus selector, in both modes. Run against `npm run dev`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = 'test_scripts/shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function shoot(mode, sceneKey, uiKey, label) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:5179', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame?.scene.isActive('MenuScene'), null, {timeout:30000});
  await page.evaluate((m) => window.__startBenchGame(1337, m, 'v1'), mode);
  await page.waitForFunction((k) => window.__phaserGame.scene.isActive(k), sceneKey, {timeout:30000});
  await page.waitForTimeout(900);

  const opened = await page.evaluate(({ uiKey }) => {
    const st = window.__mandateState;
    const ui = window.__phaserGame.scene.getScene(uiKey);
    // Clear any opening prompt so the land panel is reachable.
    st.pendingAscentPrompt = undefined;
    const mine = st.lands.filter(l => l.ownerId === 'dai-viet');
    const land = mine[0];
    if (!land) return 'no land';
    if (typeof ui.showBuildOptions === 'function') { ui.showBuildOptions(land.id); return 'ascent:' + land.name; }
    st.selectedLandId = land.id;
    // `openBuildModal` takes the land id; calling it bare renders the "select a district" empty state.
    if (typeof ui.openBuildModal === 'function') { ui.openBuildModal(land.id); return 'empire:' + land.name; }
    // Fall back to the generic modal opener used by the land sheet.
    ui.events.emit('state-changed');
    return 'fallback:' + land.name;
  }, { uiKey });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/focus-${label}.png` });
  console.log(`[${label}] ${opened}  errors=${errors.length}`);
  errors.slice(0,3).forEach(e => console.log('   ', e));
  await page.close();
}

await shoot('ascent', 'ConquestScene', 'ConquestUIScene', 'ascent');
await shoot('empire', 'MapScene', 'UIScene', 'empire');
await browser.close();
