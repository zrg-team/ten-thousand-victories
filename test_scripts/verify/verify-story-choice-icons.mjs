import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const out = 'output/story-choice-icons/verification';
mkdirSync(out, { recursive: true });
const checks = [], errors = [];
const check = (ok, name, detail) => { checks.push({ ok: !!ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const atlas = JSON.parse(readFileSync('public/art/story-choice-icons/icons-v1.json', 'utf8'));
check(Object.keys(atlas.frames).length === 14, 'fourteen generated motifs packed in one atlas');
const browser = await chromium.launch();
for (const [width, height, language] of [[390, 844, 'vi'], [390, 620, 'en'], [1440, 900, 'vi']]) {
  const tag = `${language}-${width}-${height}`;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.stack ?? e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(language => {
    localStorage.setItem('mandate:language:v1', language);
    localStorage.setItem('mandate:graphics:v1', 'medium');
    localStorage.setItem('mandate:life:v1', JSON.stringify({ motion: 'reduced' }));
  }, language);
  await page.goto(`${process.env.DEV_URL ?? 'http://127.0.0.1:5183'}/?capture=1&noladder=1&layout=${width > 700 ? 'desktop' : 'phone'}`);
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 60000 });
  check(await page.evaluate(() => !window.__phaserGame.textures.exists('story-choice-icons:v1')), `${tag}: menu does not download the choice atlas`);
  await page.evaluate(() => window.__startBenchGame(20260908, 'ascent'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'));
  await page.evaluate(() => {
    const st = window.__mandateState;
    st.isPaused = true; st.pendingAscentPrompt = undefined; st.ascent.promptQueue = [];
    window.__phaserGame.scene.getScene('ConquestScene').ascentAccumulator = -1e9;
    window.__phaserGame.scene.getScene('ConquestUIScene').closeOverlay();
  });
  await page.waitForTimeout(500);

  const coverage = await page.evaluate(async () => {
    const { STORY_CHOICE_ICON_IDS, isStoryChoiceIcon } = await import('/src/ui/storyChoiceIcons.ts');
    const { storyTemplates } = await import('/src/data/stories/index.ts');
    const { iconForOption, drawCardIcon } = await import('/src/ui/CardIcons.ts');
    const { storyText } = await import('/src/i18n/story/index.ts');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const invalid = [], samples = {}, pixels = [];
    const tx = ui.textures.get('story-choice-icons:v1');
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 160;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    for (const id of STORY_CHOICE_ICON_IDS) {
      const f = tx.get(id);
      ctx.clearRect(0, 0, 160, 160);
      ctx.drawImage(tx.getSourceImage(), f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, 160, 160);
      const data = ctx.getImageData(0, 0, 160, 160).data;
      let opaque = 0, transparent = 0, edge = 0;
      for (let i = 0; i < 160 * 160; i++) {
        const a = data[i * 4 + 3]; if (a > 240) opaque++; if (!a) transparent++;
        if ((i % 160 === 0 || i % 160 === 159 || i < 160 || i >= 160 * 159) && a) edge++;
      }
      pixels.push({ id, opaque, transparent, edge });
    }
    let choices = 0;
    for (const template of storyTemplates) for (const fragment of template.fragments) for (const option of fragment.options ?? []) {
      const id = iconForOption(option.id);
      if (!id || !isStoryChoiceIcon(id)) continue;
      choices++;
      // Some legacy fragments have no copy. Prefer a fully localized real beat for
      // visual review, while still exercising every option through the renderer.
      const keys = ['title', 'body', ...(fragment.options ?? []).flatMap(o => [o.id, `${o.id}.d`])]
        .map(suffix => `${template.id}.${fragment.id}.${suffix}`);
      const localized = keys.every(key => storyText(key) !== key);
      if (!samples[id] || (!samples[id].localized && localized)) {
        samples[id] = { templateId: template.id, fragmentId: fragment.id, iconId: id, localized };
      }
      const card = ui.optionCard({ x: -10000, y: 0, width: 344, height: 68 }, {
        title: option.id, body: '', icon: id, iconArt: 'story', accent: 0x9c6b3f, onTap: () => {},
      });
      const glyph = card.list.find(o => o.getData('storyChoiceIcon'));
      if (glyph?.type !== 'Image' || glyph.getData('storyChoiceIcon').source !== 'generated'
        || glyph.input?.enabled || glyph.displayWidth !== 36 || glyph.displayHeight !== 36) invalid.push(option.id);
      card.destroy();
    }
    const utility = drawCardIcon(ui, 'retreat', 0x9c6b3f);
    const simpleUtility = utility.type === 'Container'; utility.destroy();
    return { choices, invalid, samples: Object.values(samples), pixels, simpleUtility };
  });
  check(coverage.choices > 100 && !coverage.invalid.length, `${tag}: all ${coverage.choices} complex story choices use generated images`, coverage.invalid);
  check(coverage.pixels.every(p => p.opaque > 500 && p.transparent > 1500 && p.edge === 0), `${tag}: every frame has real alpha and complete margins`, coverage.pixels);
  check(coverage.simpleUtility, `${tag}: simple navigation symbols retain their existing renderer`);

  await page.evaluate(async () => {
    const { storyTemplate } = await import('/src/data/stories/index.ts');
    const { storyParams } = await import('/src/systems/story/StorySystem.ts');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), st = window.__mandateState;
    window.__choiceFixture = ({ templateId = 'goose-feathers', fragmentId = 'a-marriage-offered', held = false, disabled = false } = {}) => {
      st.pendingAscentPrompt = undefined; st.lastStoryOutcome = undefined; ui.closeOverlay();
      const fragment = storyTemplate(templateId).fragments.find(f => f.id === fragmentId);
      st.ascent.storyCardsMuted = held;
      const story = { id: 'icon-review', templateId, cast: { heroId: st.heroes[0]?.id,
        landId: st.lands.find(l => l.ownerId === 'dai-viet').id,
        kingdomId: st.kingdoms.find(k => k.id !== 'dai-viet' && !k.isDefeated)?.id },
        memory: {}, spoken: [], names: {}, history: [], temperature: 0, seededTurn: st.turn,
        lastSpokeTurn: st.turn, waiting: held ? fragmentId : undefined };
      st.stories = [story];
      if (held) ui.showStoryPage(story.id);
      else {
        st.pendingAscentPrompt = { kind: 'story-beat', storyId: story.id, templateId, fragmentId,
          params: storyParams(st, story), volume: fragment.volume, band: fragment.band,
          speakerHeroId: st.heroes[0]?.id,
          options: (fragment.options ?? []).map((o, i) => ({ id: o.id, affordable: !disabled || i > 0 })) };
        ui.events.emit('state-changed');
      }
    };
    window.__choiceRead = () => {
      const icons = [], walk = o => { if (o.getData('storyChoiceIcon')) icons.push(o); o.list?.forEach(walk); };
      walk(ui.modalLayer);
      return icons.map(o => {
        const c = o.parentContainer;
        const text = c.list.filter(t => t.type === 'Text');
        return { ...o.getData('storyChoiceIcon'), type: o.type, alpha: o.alpha,
          clear: text.every(t => t.x >= o.x + 18 + 11),
          contained: o.y - 18 >= 9 && o.y + 18 <= c.getData('cardHeight') - 9,
          enabled: c.list.some(t => t.type === 'Rectangle' && t.input?.enabled) };
      });
    };
    window.__choicePoint = (x, y) => {
      const camera = ui.cameras.main, canvas = ui.game.canvas.getBoundingClientRect();
      return { x: canvas.left + (camera.x + (x - camera.scrollX) * camera.zoom) * canvas.width / ui.game.scale.gameSize.width,
        y: canvas.top + (camera.y + (y - camera.scrollY) * camera.zoom) * canvas.height / ui.game.scale.gameSize.height };
    };
  });
  for (const sample of coverage.samples) {
    await page.evaluate(sample => window.__choiceFixture(sample), sample);
    const icons = await page.evaluate(() => window.__choiceRead());
    check(icons.some(i => i.id === sample.iconId) && icons.every(i => i.type === 'Image' && i.clear && i.contained), `${tag}: actual ${sample.iconId} prompt layout is clear`, icons);
    await page.evaluate(iconId => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      const area = ui.activeScrollAreas[0];
      let icon;
      const walk = o => { if (o.getData('storyChoiceIcon')?.id === iconId) icon = o; o.list?.forEach(walk); };
      walk(ui.modalLayer);
      if (icon && area) {
        const y = icon.getBounds().centerY - area.container.getWorldTransformMatrix().ty;
        area.setScroll(area.offset + y - area.bounds.height / 2);
      }
    }, sample.iconId);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${out}/${tag}-${sample.iconId}.png` });
  }
  await page.evaluate(() => window.__choiceFixture({ disabled: true }));
  const disabled = await page.evaluate(() => window.__choiceRead());
  check(disabled[0]?.alpha === 0.45 && !disabled[0].enabled && disabled.slice(1).every(i => i.enabled), `${tag}: unavailable choice fades art and remains disabled`, disabled);
  await page.screenshot({ path: `${out}/${tag}-disabled.png` });
  const promptIds = disabled.map(i => i.id);
  const textState = await page.evaluate(() => JSON.parse(window.render_game_to_text()).ascent.ui.storyChoiceIcons);
  check(JSON.stringify(textState?.map(i => i.id)) === JSON.stringify(promptIds)
    && textState.every(i => i.source === 'generated'), `${tag}: text state reports the displayed generated icons`, textState);
  await page.evaluate(() => window.__choiceFixture({ held: true }));
  const held = await page.evaluate(() => window.__choiceRead());
  check(JSON.stringify(held.map(i => i.id)) === JSON.stringify(promptIds) && held.every(i => i.type === 'Image' && i.clear), `${tag}: held Chronicle decisions use the same generated motifs`, held);
  await page.evaluate(() => { const a = window.__phaserGame.scene.getScene('ConquestUIScene').activeScrollAreas[0]; a.setScroll(a.maxScroll); });
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}/${tag}-held.png` });
  await page.evaluate(() => {
    window.__phaserGame.textures.renameTexture('story-choice-icons:v1', 'icon-review:hidden');
    window.__choiceFixture();
  });
  const fallback = await page.evaluate(() => window.__choiceRead());
  check(fallback.length === 3 && fallback.every(i => i.type === 'Container' && i.source === 'procedural-fallback' && i.clear), `${tag}: missing atlas keeps readable controls in the same gutter`, fallback);
  await page.evaluate(() => window.__phaserGame.textures.renameTexture('icon-review:hidden', 'story-choice-icons:v1'));
  await page.evaluate(() => window.__choiceFixture());
  await page.waitForTimeout(250);
  const centre = await page.evaluate(() => {
    const a = window.__phaserGame.scene.getScene('ConquestUIScene').activeScrollAreas[0], w = a.container.getWorldTransformMatrix();
    return window.__choicePoint(w.tx + a.bounds.width / 2, w.ty + a.bounds.height / 2);
  });
  await page.mouse.move(centre.x, centre.y); await page.mouse.wheel(0, 2200); await page.waitForTimeout(250);
  const target = await page.evaluate(() => {
    const a = window.__phaserGame.scene.getScene('ConquestUIScene').activeScrollAreas[0];
    const card = a.content.list.filter(o => o.getData('cardHeight')).at(-1);
    const icon = card.list.find(o => o.getData('storyChoiceIcon')), b = icon.getBounds();
    return { ...window.__choicePoint(b.centerX, b.centerY), scroll: a.offset, max: a.maxScroll };
  });
  check(target.max === 0 || target.scroll > 0, `${tag}: enlarged icons preserve wheel scrolling`, target);
  // Click directly on the generated sword pixels: the image must not block the choice beneath.
  await page.mouse.click(target.x, target.y, { delay: 130 }); await page.waitForTimeout(350);
  check(await page.evaluate(() => window.__mandateState.stories[0].memory.refused === 1
    && window.__mandateState.lastStoryOutcome?.fragmentId === 'a-marriage-offered'), `${tag}: clicking generated icon resolves the real story choice`);
  await page.screenshot({ path: `${out}/${tag}-resolved.png` });
  writeFileSync(`${out}/state-${tag}.json`, await page.evaluate(() => window.render_game_to_text()));
  await page.close();
}
await browser.close();
check(errors.length === 0, 'no browser errors', errors);
writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors }, null, 2));
process.exit(checks.some(c => !c.ok) ? 1 : 0);
