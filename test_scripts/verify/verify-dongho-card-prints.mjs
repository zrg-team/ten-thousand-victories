// Verify real card bakes, selected Chronicle moments, phone scrolling, and missing-art fallbacks.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out = 'output/dongho-card-prints/verification';
mkdirSync(out, { recursive: true });
const assets = JSON.parse(readFileSync('src/ui/storyPrintAssets.json', 'utf8'));
const ids = Object.keys(assets);
const checks = [], errors = [];
function check(ok, name, detail) {
  checks.push({ ok: !!ok, name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
check(ids.length >= 50, 'at least 50 new prints');
const hashes = ids.map(id => createHash('sha256').update(readFileSync(`public/art/story-prints/${assets[id]}`)).digest('hex'));
check(new Set(hashes).size === ids.length, 'every new print is a distinct file');
const browser = await chromium.launch();
for (const [language, height] of [['vi', 844], ['en', 620]]) {
  const page = await browser.newPage({ viewport: { width: 390, height }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { errors.push(e.stack ?? e.message); console.log(`BROWSER ERROR ${e.stack ?? e.message}`); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(language => {
    localStorage.setItem('mandate:language:v1', language);
    localStorage.setItem('mandate:graphics:v1', 'medium');
    localStorage.setItem('mandate:life:v1', JSON.stringify({ motion: 'reduced' }));
  }, language);
  await page.goto(`${process.env.DEV_URL ?? 'http://127.0.0.1:5181'}/?capture=1&noladder=1`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 60000 });
  const catalog = await page.evaluate(async () => {
    const { POWER_CARDS } = await import('/src/data/ascentCards.ts');
    const { STORY_PRINTS, powerStoryPrint, STORY_BEAT_PRINTS } = await import('/src/ui/storyPrint.ts');
    const { storyTemplate } = await import('/src/data/stories/index.ts');
    return {
      powers: POWER_CARDS.length,
      matched: POWER_CARDS.filter(c => powerStoryPrint(c.id) === c.id).length,
      fallbacksValid: POWER_CARDS.every(c => STORY_PRINTS.includes(powerStoryPrint(c.id))),
      loaded: STORY_PRINTS.filter(k => window.__phaserGame.textures.exists(`story-print:${k}`)).length,
      beats: Object.entries(STORY_BEAT_PRINTS).map(([key, print]) => {
        const [templateId, fragmentId] = key.split('.');
        const fragment = storyTemplate(templateId)?.fragments.find(f => f.id === fragmentId);
        return { key, print, exists: !!fragment, volume: fragment?.volume };
      }),
    };
  });
  check(catalog.beats.every(b => b.exists && ['card', 'blow'].includes(b.volume)), 'all selected story moments exist and can display cards', catalog.beats);
  await page.evaluate(() => window.__startBenchGame(20260901, 'ascent'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestScene'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'));
  // Art now loads at scene boundaries, not on the front menu.
  catalog.loaded = await page.evaluate(async () => {
    const { STORY_PRINTS } = await import('/src/ui/storyPrint.ts');
    return STORY_PRINTS.filter(k => window.__phaserGame.textures.exists(`story-print:${k}`)).length;
  });
  check(catalog.powers >= ids.length && catalog.matched === ids.length && catalog.fallbacksValid && catalog.loaded === 53,
    `${language}: ${ids.length} authored powers uniquely mapped, catalogue fallbacks valid, all 53 prints loaded`, catalog);
  await page.evaluate(() => {
    const st = window.__mandateState;
    st.isPaused = true; st.pendingAscentPrompt = undefined; st.ascent.promptQueue = [];
    window.__phaserGame.scene.getScene('ConquestScene').ascentAccumulator = -1e9;
    window.__phaserGame.scene.getScene('ConquestUIScene').closeOverlay();
  });
  for (const kind of ['power-draft', 'mandate']) {
    await page.evaluate(kind => {
      const st = window.__mandateState, ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      ui.closeOverlay();
      st.pendingAscentPrompt = kind === 'power-draft'
        ? { kind, level: 3, cards: ['iron-levy', 'rice-tribute', 'mandarin-academy'], rerollCost: 40 }
        : { kind, options: ['cam-quan', 'kho-lam', 'duc-tien'] };
      ui.events.emit('state-changed');
    }, kind);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${kind}-${language}-${height}.png` });
    if (kind === 'mandate') {
      const founding = await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        const pictures = []; const walk = o => { if (o.getData?.('storyPrint')) pictures.push(o); o.list?.forEach(walk); }; walk(ui.modalLayer);
        const first = pictures[0]?.parentContainer;
        const zone = first?.list.find(o => o.type === 'Zone');
        const b = zone?.getBounds();
        window.__artOriginalChoose = ui.choose;
        window.__artClicked = undefined;
        ui.choose = id => { window.__artClicked = id; };
        return { prints: pictures.map(p => p.getData('storyPrint')),
          contained: pictures.every(p => { const b = p.parentContainer.getBounds(); return b.y >= 90 && b.bottom < window.innerHeight; }),
          target: b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null };
      });
      check(founding.prints.length === 3 && founding.contained, `${language}: all founding cards show their art and fit the phone`, founding);
      if (founding.target) {
        await page.mouse.click(founding.target.x, founding.target.y, { delay: 120 });
        check(await page.evaluate(() => window.__artClicked === 'cam-quan'), `${language}: illustrated founding choice receives pointer input`);
      }
      await page.evaluate(() => { window.__phaserGame.scene.getScene('ConquestUIScene').choose = window.__artOriginalChoose; });
    }
  }
  // A contact sheet of actual baked faces, using the same stamp the collection and draft use.
  if (height === 844) for (let start = 0; start < ids.length; start += 12) {
    await page.evaluate(async cardIds => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      window.__mandateState.pendingAscentPrompt = undefined; ui.closeOverlay();
      const { stampCardFace } = await import('/src/ui/cardFace.ts');
      cardIds.forEach((id, i) => {
        const image = stampCardFace(ui, id, { x: 15 + i % 3 * 123, y: 85 + Math.floor(i / 3) * 180, width: 112, height: 157 }, 1);
        if (!image) throw new Error(`Missing face ${id}`);
        ui.modalLayer.add(image);
      });
    }, ids.slice(start, start + 12));
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/card-faces-${start}.png` });
  }
  for (const beat of catalog.beats) {
    const layout = await page.evaluate(async ({ key, print }) => {
      const [templateId, fragmentId] = key.split('.');
      const { storyTemplate } = await import('/src/data/stories/index.ts');
      const { storyParams } = await import('/src/systems/story/StorySystem.ts');
      const st = window.__mandateState, ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      ui.closeOverlay();
      const story = { id: 'art-review', templateId, cast: { heroId: st.heroes[0]?.id, landId: st.lands.find(l => l.ownerId === 'dai-viet').id },
        memory: {}, temperature: 0, seededTurn: st.turn, lastSpokeTurn: st.turn, spoken: [], names: {} };
      st.stories = [story];
      const fragment = storyTemplate(templateId).fragments.find(f => f.id === fragmentId);
      st.pendingAscentPrompt = { kind: 'story-beat', storyId: story.id, templateId, fragmentId, volume: fragment.volume,
        band: fragment.band, speakerHeroId: st.heroes[0]?.id, params: storyParams(st, story),
        options: (fragment.options ?? []).map(o => ({ id: o.id, affordable: true })) };
      ui.events.emit('state-changed');
      const pictures = [];
      const walk = o => { if (o.getData?.('storyPrint')) pictures.push(o); o.list?.forEach(walk); };
      walk(ui.modalLayer);
      return { count: pictures.length, selected: pictures[0]?.getData('storyPrint'),
        fit: pictures.every(p => Math.abs(p.displayWidth / p.displayHeight - 1.5) < .01 && p.displayHeight <= 180.01),
        maxScroll: ui.activeScrollAreas[0]?.maxScroll ?? 0 };
    }, beat);
    check(layout.count === 1 && layout.selected === beat.print && layout.fit, `${language}/${height}: ${beat.key} complete print fits`, layout);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}/${beat.key}-${language}.png` });
    if (beat.key === 'chi-lang.the-pass-is-narrow-here') {
      await page.mouse.move(195, height - 160); await page.mouse.wheel(0, 2000); await page.waitForTimeout(250);
      const action = await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        window.__artOriginalChoose = ui.choose;
        window.__artClicked = undefined;
        ui.choose = id => { window.__artClicked = id; };
        const zones = []; const walk = o => { if (o.type === 'Rectangle' && o.input?.enabled && o.parentContainer?.getData('cardHeight')) zones.push(o); o.list?.forEach(walk); }; walk(ui.modalLayer);
        const zone = zones.find(o => { const b = o.getBounds(); return b.y > 90 && b.bottom < window.innerHeight - 60; });
        const b = zone?.getBounds();
        return { y: b ? b.y + b.height / 2 : null, x: b ? b.x + b.width / 2 : null,
          scroll: ui.activeScrollAreas[0]?.scrollY ?? 0 };
      });
      check(layout.maxScroll === 0 || action.scroll > 0, `${language}: story choices remain scrollable`);
      if (action.x !== null) {
        await page.mouse.click(action.x, action.y, { delay: 800 });
        check(await page.evaluate(() => !!window.__artClicked), `${language}: story choice receives pointer input`);
      } else check(false, `${language}: visible story choice found`);
      await page.evaluate(() => { window.__phaserGame.scene.getScene('ConquestUIScene').choose = window.__artOriginalChoose; });
      await page.screenshot({ path: `${out}/story-choice-bottom-${language}.png` });
    }
  }
  const fallback = await page.evaluate(async () => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const { addStoryPrint } = await import('/src/ui/storyPrint.ts');
    const { cardFaceTextureKey } = await import('/src/ui/cardFace.ts');
    const fallbackPrompt = { ...window.__mandateState.pendingAscentPrompt, storyId: 'fallback', band: 'mountain' };
    window.__mandateState.pendingAscentPrompt = undefined;
    ui.closeOverlay();
    // Hide lookup keys without destroying textures still referenced by an outgoing frame.
    window.__phaserGame.textures.renameTexture('story-print:iron-levy', 'art-review:hidden-iron-levy');
    const absent = addStoryPrint(ui, ui.modalLayer, 'iron-levy', { x: 0, y: 0, width: 100, height: 60 }) === undefined;
    const icon = !!cardFaceTextureKey(ui, 'iron-levy', 3);
    window.__phaserGame.textures.renameTexture('story-print:chi-lang', 'art-review:hidden-chi-lang');
    window.__phaserGame.textures.renameTexture('story-print:setting-mountain', 'art-review:hidden-setting-mountain');
    window.__mandateState.pendingAscentPrompt = fallbackPrompt;
    ui.events.emit('state-changed');
    let prints = 0;
    const walk = o => { if (o.getData?.('storyPrint')) prints++; o.list?.forEach(walk); }; walk(ui.modalLayer);
    return { absent, icon, prints, children: ui.modalLayer.length };
  });
  check(fallback.absent && fallback.icon && fallback.prints === 0 && fallback.children > 0, `${language}: missing prints retain safe icon and story layout`, fallback);
  await page.screenshot({ path: `${out}/missing-print-${language}.png` });
  writeFileSync(`${out}/state-${language}.json`, await page.evaluate(() => window.render_game_to_text()));
  await page.close();
}
await browser.close();
check(errors.length === 0, 'no browser errors', errors);
writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors }, null, 2));
process.exit(checks.some(c => !c.ok) ? 1 : 0);
