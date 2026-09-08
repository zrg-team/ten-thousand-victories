// Full catalogue art coverage and actual story choice → outcome → Chronicle interactions.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const out = 'output/story-settings/verification';
mkdirSync(out, { recursive: true });
const checks = [], errors = [];
const check = (ok, name, detail) => {
  checks.push({ ok: !!ok, name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};
const assets = JSON.parse(readFileSync('src/ui/storySettingAssets.json', 'utf8'));
const hashes = Object.values(assets).map(file => createHash('sha256').update(readFileSync(`public/art/story-prints/${file}`)).digest('hex'));
check(hashes.length === 12 && new Set(hashes).size === 12, 'twelve distinct generated setting files');

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
  check(await page.evaluate(() => !window.__phaserGame.textures.exists('story-print:setting-court')), `${tag}: settings do not load on the menu`);
  await page.evaluate(() => window.__startBenchGame(20260908, 'ascent'));
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene'));
  await page.evaluate(() => {
    const st = window.__mandateState;
    st.isPaused = true; st.pendingAscentPrompt = undefined; st.ascent.promptQueue = [];
    window.__phaserGame.scene.getScene('ConquestScene').ascentAccumulator = -1e9;
    window.__phaserGame.scene.getScene('ConquestUIScene').closeOverlay();
  });
  await page.waitForTimeout(600);
  const catalogue = await page.evaluate(async () => {
    const { storyTemplates } = await import('/src/data/stories/index.ts');
    const { addStoryIllustration, storyIllustrationSetting } = await import('/src/ui/storyIllustration.ts');
    const { STORY_SETTINGS, STORY_FRAGMENT_SETTINGS } = await import('/src/ui/storySettings.ts');
    const { STORY_BEAT_PRINTS, STORY_SETTING_PRINTS } = await import('/src/ui/storyPrint.ts');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const missing = [], samples = {}, all = [];
    for (const template of storyTemplates) {
      if (!STORY_SETTINGS[template.id]) missing.push(`${template.id}:default`);
      // Render every known fragment, including whispers appearing on a record page.
      for (const fragment of template.fragments) {
        const holder = ui.add.container(-10000, -10000);
        const used = addStoryIllustration(ui, holder, template.id, fragment.id, 344);
        const art = holder.list.find(o => o.getData('storyIllustration'));
        if (!used || art?.type !== 'Image') missing.push(`${template.id}.${fragment.id}`);
        const setting = storyIllustrationSetting(template.id, fragment.id);
        const entry = { templateId: template.id, fragmentId: fragment.id, band: setting, volume: fragment.volume };
        all.push(entry);
        if (!samples[setting] && fragment.volume !== 'whisper' && !STORY_BEAT_PRINTS[`${template.id}.${fragment.id}`]) samples[setting] = entry;
        holder.destroy();
      }
    }
    const invalidOverrides = Object.keys(STORY_FRAGMENT_SETTINGS).filter(key => {
      const [t, f] = key.split('.');
      return !storyTemplates.find(s => s.id === t)?.fragments.some(b => b.id === f);
    });
    return { stories: storyTemplates.length, fragments: all.length, missing, invalidOverrides, samples: Object.values(samples),
      loaded: STORY_SETTING_PRINTS.every(id => {
        const im = ui.textures.get(`story-print:${id}`).getSourceImage();
        return im.width === 768 && im.height === 432;
      }) };
  });
  check(catalogue.loaded && !catalogue.missing.length && !catalogue.invalidOverrides.length,
    `${tag}: all ${catalogue.fragments} fragments in ${catalogue.stories} stories render generated art`, catalogue);

  await page.evaluate(async () => {
    const { storyTemplate } = await import('/src/data/stories/index.ts');
    const { storyParams } = await import('/src/systems/story/StorySystem.ts');
    const { showStoryOutcome } = await import('/src/scenes/conquest/screens/aftermath.ts');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), st = window.__mandateState;
    window.__storyReview = ({ templateId, fragmentId, mode = 'prompt', spoken, waiting }) => {
      st.pendingAscentPrompt = undefined; st.lastStoryOutcome = undefined; ui.closeOverlay();
      st.ascent.storyCardsMuted = !!waiting;
      const fragment = storyTemplate(templateId).fragments.find(f => f.id === fragmentId);
      const story = { id: 'story-art-review', templateId,
        cast: { heroId: st.heroes[0]?.id, landId: st.lands.find(l => l.ownerId === 'dai-viet').id,
          kingdomId: st.kingdoms.find(k => k.id !== 'dai-viet' && !k.isDefeated)?.id },
        memory: {}, temperature: 0, seededTurn: st.turn, lastSpokeTurn: st.turn,
        spoken: spoken ?? [fragmentId], waiting, names: {}, history: [] };
      st.stories = [story];
      const params = storyParams(st, story);
      if (mode === 'page') ui.showStoryPage(story.id);
      else if (mode === 'outcome') showStoryOutcome(ui, { templateId, fragmentId, params, outcome: [{ kind: 'gold', amount: -50 }], historicity: 'chinh-su' });
      else {
        const prompt = { kind: 'story-beat', storyId: story.id, templateId, fragmentId, params,
          volume: fragment.volume, band: fragment.band, speakerHeroId: st.heroes[0]?.id,
          options: (fragment.options ?? []).map(o => ({ id: o.id, affordable: true })) };
        st.pendingAscentPrompt = prompt;
        // Use the router so desktop sheet registration and camera layout match real play.
        ui.events.emit('state-changed');
      }
    };
    window.__storyLayout = () => {
      const body = ui.activeScrollAreas[0]?.content;
      const art = body?.list.filter(o => o.getData('storyIllustration')) ?? [];
      const image = art[0];
      const bottom = image ? image.y + image.displayHeight / 2 : 0;
      return { count: art.length, type: image?.type, art: image?.getData('storyIllustration'),
        fit: image?.type === 'Image' && Math.abs(image.scaleX - image.scaleY) < 0.0001
          && image.displayWidth <= 344.1 && image.displayHeight <= 180.1,
        clear: body?.list.filter(o => o !== image && o.type !== 'Graphics').every(o => o.y >= bottom + 13),
        maxScroll: ui.activeScrollAreas[0]?.maxScroll, textArt: JSON.parse(window.render_game_to_text()).ascent.ui.storyIllustration };
    };
    window.__storyPoint = (x, y) => {
      const camera = ui.cameras.main, canvas = ui.game.canvas.getBoundingClientRect();
      return { x: canvas.left + (camera.x + (x - camera.scrollX) * camera.zoom) * canvas.width / ui.game.scale.gameSize.width,
        y: canvas.top + (camera.y + (y - camera.scrollY) * camera.zoom) * canvas.height / ui.game.scale.gameSize.height };
    };
  });

  for (const sample of catalogue.samples) {
    await page.evaluate(sample => window.__storyReview(sample), sample);
    const layout = await page.evaluate(() => window.__storyLayout());
    check(layout.count === 1 && layout.fit && layout.clear && layout.art?.print === `setting-${sample.band}`
      && layout.textArt?.print === layout.art.print, `${tag}: ${sample.band} complete art, clear speaker/options and matching text state`, layout);
    await page.waitForTimeout(90);
    await page.screenshot({ path: `${out}/${tag}-${sample.band}.png` });
  }
  // Outcomes and records use the same current moment; an unspoken special ending is never selected.
  for (const mode of ['prompt', 'outcome', 'page']) {
    await page.evaluate(mode => window.__storyReview({ templateId: 'ho-guom', fragmentId: 'a-blade-in-the-net', mode }), mode);
    const layout = await page.evaluate(() => window.__storyLayout());
    check(layout.art?.print === 'setting-river' && layout.fit && layout.clear, `${tag}: ${mode} shows current lake setting without future sword art`, layout);
    await page.waitForTimeout(90);
    await page.screenshot({ path: `${out}/${tag}-${mode}.png` });
  }
  for (const [spoken, waiting, expected] of [[[], undefined, 'setting-river'], [['a-blade-in-the-net'], undefined, 'setting-river'], [['a-blade-in-the-net'], 'the-turtle-at-the-lake', 'thuan-thien']]) {
    await page.evaluate(args => window.__storyReview({ templateId: 'ho-guom', fragmentId: 'a-blade-in-the-net', mode: 'page', ...args }), { spoken, waiting });
    check((await page.evaluate(() => window.__storyLayout())).art?.print === expected, `${tag}: opening / known / held record chooses ${expected}`);
  }
  // Hide lookup keys without destroying a texture the outgoing frame may still own.
  for (const both of [false, true]) {
    await page.evaluate(both => {
      const tx = window.__phaserGame.textures;
      tx.renameTexture('story-print:thuan-thien', 'review:hidden-moment');
      if (both) tx.renameTexture('story-print:setting-river', 'review:hidden-setting');
      window.__storyReview({ templateId: 'ho-guom', fragmentId: 'the-turtle-at-the-lake' });
    }, both);
    const layout = await page.evaluate(() => window.__storyLayout());
    check(layout.count === 1 && layout.art?.source === (both ? 'procedural-fallback' : 'setting'), `${tag}: ${both ? 'all art missing keeps local fallback' : 'missing moment uses generated setting'}`, layout);
    await page.waitForTimeout(90);
    await page.screenshot({ path: `${out}/${tag}-fallback-${both}.png` });
    await page.evaluate(both => {
      const tx = window.__phaserGame.textures;
      tx.renameTexture('review:hidden-moment', 'story-print:thuan-thien');
      if (both) tx.renameTexture('review:hidden-setting', 'story-print:setting-river');
    }, both);
  }

  // Real pointer input through the illustrated card and resolver, with no choose stub.
  await page.evaluate(() => window.__storyReview({ templateId: 'goose-feathers', fragmentId: 'a-marriage-offered', spoken: [] }));
  await page.waitForTimeout(250);
  const centre = await page.evaluate(() => {
    const area = window.__phaserGame.scene.getScene('ConquestUIScene').activeScrollAreas[0];
    const world = area.container.getWorldTransformMatrix(), b = area.bounds;
    return window.__storyPoint(world.tx + b.width / 2, world.ty + b.height / 2);
  });
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, 2200);
  await page.waitForTimeout(300);
  const target = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), area = ui.activeScrollAreas[0];
    const rectangles = [];
    const walk = o => { if (o.type === 'Rectangle' && o.input?.enabled && o.parentContainer?.getData('cardHeight')) rectangles.push(o); o.list?.forEach(walk); };
    walk(area.content);
    const b = rectangles.at(-1).getBounds();
    return { ...window.__storyPoint(b.centerX, b.centerY), scrolled: area.offset, max: area.maxScroll };
  });
  check(target.max === 0 || target.scrolled > 0, `${tag}: real wheel reveals story choices`, target);
  await page.mouse.click(target.x, target.y, { delay: 130 });
  await page.waitForTimeout(500);
  const resolution = await page.evaluate(() => ({ memory: window.__mandateState.stories[0].memory,
    report: window.__mandateState.lastStoryOutcome, art: JSON.parse(window.render_game_to_text()).ascent.ui.storyIllustration }));
  check(resolution.memory.refused === 1 && resolution.report?.fragmentId === 'a-marriage-offered'
    && resolution.art?.print === 'setting-court', `${tag}: click resolves refusal and reports it with the same art`, resolution);
  await page.screenshot({ path: `${out}/${tag}-resolved.png` });
  // Acknowledge the real report, then enter the Chronicle and follow its actual row.
  const ack = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), area = ui.activeScrollAreas[0];
    area.setScroll(area.maxScroll);
    const cards = area.content.list.filter(o => o.getData('cardHeight'));
    const b = cards.at(-1).getBounds();
    return window.__storyPoint(b.centerX, b.centerY);
  });
  await page.mouse.click(ack.x, ack.y, { delay: 130 });
  await page.waitForTimeout(250);
  check(await page.evaluate(() => !window.__mandateState.lastStoryOutcome), `${tag}: report acknowledgement returns to play`);
  await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    ui.chronicleTab = 'ongoing'; ui.openLane('chronicle');
  });
  await page.waitForTimeout(250);
  const row = await page.evaluate(() => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), cards = [];
    const walk = o => { if (o.type === 'Container' && o.getData('cardHeight')) cards.push(o); o.list?.forEach(walk); };
    walk(ui.modalLayer);
    const card = cards.find(c => c.list.some(o => o.type === 'Text' && /Lông Ngỗng|Goose Feathers/i.test(o.text)));
    const b = card?.getBounds();
    return b ? window.__storyPoint(b.centerX, b.centerY) : null;
  });
  if (row) await page.mouse.click(row.x, row.y, { delay: 130 });
  await page.waitForTimeout(250);
  check(!!row && (await page.evaluate(() => window.__storyLayout())).art?.print === 'setting-court', `${tag}: Chronicle row opens the recorded moment with matching art`);
  await page.screenshot({ path: `${out}/${tag}-chronicle-record.png` });
  writeFileSync(`${out}/state-${tag}.json`, await page.evaluate(() => window.render_game_to_text()));
  await page.close();
}
await browser.close();
check(errors.length === 0, 'no browser errors', errors);
writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors }, null, 2));
process.exit(checks.some(c => !c.ok) ? 1 : 0);
