/** Generated icon coverage, real input, compact layouts and loading failure behavior. */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolveOpening } from '../perf/_boot.mjs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5185';
const out = 'output/conquest-ui-v5/verification';
mkdirSync(out, { recursive: true });
const checks = [], errors = [];
const check = (ok, name, detail) => { checks.push({ ok: !!ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const atlas = JSON.parse(readFileSync('public/art/conquest-ui-icons/icons-v5.json', 'utf8'));
check(Object.keys(atlas.frames).length === 57, 'all 57 functional meanings packed');
check(atlas.meta.size.w === 1024 && atlas.meta.size.h === 1024, 'functional atlas uses 4 MiB decoded');
const oldAtlas = JSON.parse(readFileSync('public/art/conquest-ui-icons/icons-v1.json', 'utf8'));
const signAtlas = JSON.parse(readFileSync('public/art/conquest-ui-icons/signs-v1.json', 'utf8'));
const browser = await chromium.launch();

async function snapshot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  writeFileSync(`${out}/${name}.json`, await page.evaluate(() => window.render_game_to_text()));
}

async function clickIcon(page, id, rootName, formation) {
  const point = await page.evaluate(([id, rootName, formation]) => {
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const hits = [];
    const walk = o => {
      if (o.visible === false) return;
      if (o.type === 'Image' && o.getData('conquestUiIcon')?.id === id && (!rootName || o.parentContainer?.name === rootName)) hits.push(o);
      o.list?.forEach(walk);
    };
    ui.children.list.forEach(walk);
    const o = formation ? ui.battleUi.dock.chips[formation].glyph.list[0] : hits.at(-1);
    if (!o || o.getData('conquestUiIcon')?.id !== id) throw new Error(`Missing visible icon ${id}`);
    const b = o.getBounds(), c = ui.cameras.main, rect = ui.game.canvas.getBoundingClientRect();
    return { x: rect.left + (c.x + (b.centerX - c.scrollX) * c.zoom) * rect.width / ui.game.scale.gameSize.width,
      y: rect.top + (c.y + (b.centerY - c.scrollY) * c.zoom) * rect.height / ui.game.scale.gameSize.height };
  }, [id, rootName, formation]);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.waitForTimeout(110); await page.mouse.up();
  await page.waitForTimeout(180);
}

try {
  for (const [width, height, language] of [[390, 844, 'vi'], [390, 620, 'en'], [1440, 900, 'vi']]) {
    const tag = `${language}-${width}-${height}`;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    await page.addInitScript(language => {
      localStorage.setItem('mandate:language:v1', language);
      localStorage.setItem('mandate:graphics:v1', 'medium');
      localStorage.setItem('mandate:life:v1', JSON.stringify({ motion: 'reduced' }));
    }, language);
    await page.goto(`${URL}/?capture=1&noladder=1&layout=${width > 700 ? 'desktop' : 'phone'}`);
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 60000 });
    check(await page.evaluate(() => window.__phaserGame.textures.exists('conquest-ui-icons:v5')
      && window.__phaserGame.textures.exists('dynasty-sign-icons:v1')), `${tag}: UI and sign atlases ready before menu and gameplay`);
    check(!requests.some(r => /conquest-ui-icons\/icons-v[1234]\./.test(r)), `${tag}: obsolete atlas is not loaded by the game`);
    check(!requests.some(r => /\/icons\/(food|supplies|gold|manpower)\.svg/.test(r)), `${tag}: no old resource SVG downloads`);
    await page.evaluate(() => window.__startBenchGame(20260909, 'ascent'));
    await page.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene') && window.__phaserGame.scene.getScene('ConquestUIScene').ui);
    await resolveOpening(page);
    await page.evaluate(() => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), st = ui.state;
      st.isStrategyPause = true; st.isPaused = false; st.pendingAscentPrompt = undefined; st.ascent.promptQueue = [];
      ui.closeOverlay(); ui.refresh();
    });
    await page.waitForTimeout(700);

    const coverage = await page.evaluate(async () => {
      const { CONQUEST_UI_ICON_IDS, addConquestUiIcon, CONQUEST_UI_TEXTURE } = await import('/src/ui/conquestUiIcons.ts');
      const { drawCardIcon, iconForOption } = await import('/src/ui/CardIcons.ts');
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      const tx = ui.textures.get(CONQUEST_UI_TEXTURE), results = [];
      const cv = document.createElement('canvas'); cv.width = cv.height = 120;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      for (const id of CONQUEST_UI_ICON_IDS) {
        const frame = tx.get(id); ctx.clearRect(0, 0, 120, 120);
        ctx.drawImage(tx.getSourceImage(), frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, 120, 120);
        const rgba = ctx.getImageData(0, 0, 120, 120).data;
        let ink = 0, empty = 0, edge = 0;
        for (let i = 0; i < 14400; i++) {
          const a = rgba[i * 4 + 3]; ink += a > 240; empty += a === 0;
          if ((i % 120 === 0 || i % 120 === 119 || i < 120 || i >= 14280) && a) edge++;
        }
        const image = addConquestUiIcon(ui, id, 36);
        results.push({ id, exists: tx.has(id), source: image.getData('conquestUiIcon').source, ink, empty, edge,
          noninteractive: !image.input, width: image.displayWidth, tint: image.tintTopLeft });
        image.destroy();
      }
      const sample = drawCardIcon(ui, 'hammer', 0xff0000);
      const preservesPigment = sample.list.length === 1 && sample.list[0].type === 'Image' && sample.list[0].tintTopLeft === 0xffffff;
      sample.destroy();
      return { results, preservesPigment, meanings: ['diplomacy', 'ambassador', 'river', 'take-him-in', 'make-him-repay'].map(id => iconForOption(id)) };
    });
    check(coverage.results.every(i => i.exists && i.source === 'generated' && i.ink > 100 && i.empty > 600 && i.edge === 0), `${tag}: every frame has real artwork, alpha and unclipped margins`, coverage.results);
    check(coverage.results.every(i => i.noninteractive && i.width === 36 && i.tint === 0xffffff) && coverage.preservesPigment,
      `${tag}: imagery preserves pigments and does not intercept presses`);
    check(coverage.meanings.join(',') === 'diplomacy,diplomacy,territory,person,herd', `${tag}: diplomacy, geography and story subjects use matching meanings`, coverage.meanings);
    const mapIds = await page.evaluate(() => JSON.parse(window.render_game_to_text()).ascent.ui.generatedUiIcons);
    check(['food', 'supplies', 'gold', 'humans', 'hammer', 'hero', 'crown', 'crossed-weapons', 'diplomacy', 'book'].every(id => mapIds.includes(id)), `${tag}: resource and corrected navigation icons visible`, mapIds);
    await snapshot(page, `${tag}-map`);

    const signs = await page.evaluate(async () => {
      const { DYNASTY_SIGNS } = await import('/src/data/dynastySigns.ts');
      const { drawBannerEmblem } = await import('/src/ui/ascent/bannerEmblems.ts');
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      return DYNASTY_SIGNS.map(id => {
        const mark = drawBannerEmblem(ui, id);
        const result = { id, savedId: mark.getData('bannerEmblem'),
          art: mark.list[0].getData('conquestUiIcon'), texture: mark.list[0].texture.key, type: mark.list[0].type, count: mark.list.length };
        mark.destroy(); return result;
      });
    });
    check(signs.length === 16 && signs.every(s => s.savedId === s.id && s.art.source === 'generated'
      && s.texture === 'dynasty-sign-icons:v1' && s.type === 'Image' && s.count === 1), `${tag}: all sixteen saved dynasty signs use their preserved art`, signs);
    const signPixels = await page.evaluate(async ({ oldFrames, sourceFormat }) => {
      const old = new Image(); old.src = '/art/conquest-ui-icons/icons-v1.png'; await old.decode();
      const tx = window.__phaserGame.textures.get('dynasty-sign-icons:v1');
      const cv = document.createElement('canvas'); cv.width = cv.height = 120;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      let alphaDelta = 0, maxOpaqueDelta = 0, squaredError = 0, weight = 0;
      const ids = tx.getFrameNames();
      for (const id of ids) {
        const f = oldFrames[id].frame, frame = tx.get(id);
        ctx.clearRect(0, 0, 120, 120); ctx.drawImage(old, f.x, f.y, 120, 120, 0, 0, 120, 120);
        const before = ctx.getImageData(0, 0, 120, 120).data;
        ctx.clearRect(0, 0, 120, 120); ctx.drawImage(tx.getSourceImage(), frame.cutX, frame.cutY, 120, 120, 0, 0, 120, 120);
        const after = ctx.getImageData(0, 0, 120, 120).data;
        for (let i = 0; i < before.length; i += 4) {
          const alpha = before[i + 3];
          alphaDelta = Math.max(alphaDelta, Math.abs(alpha - after[i + 3]));
          if (!alpha) continue;
          for (let c = 0; c < 3; c++) {
            const delta = Math.abs(before[i + c] - after[i + c]);
            if (alpha >= 200) maxOpaqueDelta = Math.max(maxOpaqueDelta, delta);
            squaredError += (alpha / 255) * delta * delta;
            weight += alpha / 255;
          }
        }
      }
      return { frames: ids.length, alphaDelta, maxOpaqueDelta, rmse: Math.sqrt(squaredError / weight),
        webp: sourceFormat === 'webp' };
    }, { oldFrames: oldAtlas.frames, sourceFormat: signAtlas.meta.image.split('.').at(-1) });
    // A separate asset conversion uses optimize.mjs's flat-art bound: exact alpha,
    // at most two opaque pigment levels and alpha-weighted RMSE <= 1. PNG stays exact.
    check(signPixels.frames === 16 && signPixels.alphaDelta === 0
      && signPixels.maxOpaqueDelta <= (signPixels.webp ? 2 : 0) && signPixels.rmse <= (signPixels.webp ? 1 : 0),
      `${tag}: dynasty signs preserve alpha and pigments within the asset format bound`, signPixels);
    const markers = await page.evaluate(async () => {
      const { InkMapItemRenderer } = await import('/src/ui/InkMapItemRenderer.ts');
      const { AtlasMapItemRenderer } = await import('/src/ui/AtlasMapItemRenderer.ts');
      const { DongHoMapItemRenderer } = await import('/src/ui/DongHoMapItemRenderer.ts');
      const { ILLUSTRATED_ATLAS_THEME } = await import('/src/ui/mapTheme.ts');
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), results = [];
      for (const renderer of [new InkMapItemRenderer(ui), new AtlasMapItemRenderer(ui, ILLUSTRATED_ATLAS_THEME), new DongHoMapItemRenderer(ui)]) {
        for (const variant of ['build', 'acquisition', 'recruit', 'siege', 'battle']) {
          const badge = renderer.createProgressBadge(-1000, -1000, 3, 10, variant);
          results.push({ theme: renderer.constructor.name, variant,
            image: badge.list.some(o => o.type === 'Image' && o.visible && !o.input) });
          badge.destroy(true);
        }
      }
      return results;
    });
    check(markers.length === 15 && markers.every(m => m.image), `${tag}: five map order icons use imagery in all three themes`, markers);
    for (const kind of ['march', 'triumph', 'held', 'overrun']) {
      await page.evaluate(async kind => {
        const { playWaveBanner } = await import('/src/ui/ascent/waveBanner.ts');
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        window.__iconReviewWave = playWaveBanner(ui, { id: 99, phase: kind === 'march' ? 'start' : 'end',
          wave: 7, boss: false, kingdomName: 'Nam Hán', hosts: 3, power: 8420,
          outcome: kind === 'march' ? undefined : kind, hostsBroken: 3, landsLost: kind === 'held' ? 1 : 0,
          landsHeld: 11, momentum: 340, survived: 7, seasons: 5 });
      }, kind);
      await page.waitForTimeout(900);
      check(await page.evaluate(kind => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), emblems = [];
        const walk = o => { if (o.getData('waveEmblem') === kind) emblems.push(o); o.list?.forEach(walk); };
        ui.children.list.forEach(walk);
        return emblems.length === 1 && emblems[0].list.some(o => o.type === 'Image'
          && o.getData('conquestUiIcon')?.source === 'generated'
          && o.getData('conquestUiIcon')?.id === { march: 'crossed-weapons', triumph: 'victory', held: 'shield', overrun: 'broken-shield' }[kind]);
      }, kind), `${tag}: ${kind} announcement uses the correct military symbol`);
      await snapshot(page, `${tag}-wave-${kind}`);
      await page.evaluate(() => { window.__iconReviewWave.destroy(); delete window.__iconReviewWave; });
    }

    // Real header presses exercise generated icon hit targets and swapped clock artwork.
    await clickIcon(page, 'play', 'gameplay-control:play');
    check(await page.evaluate(() => !window.__mandateState.isStrategyPause), `${tag}: generated play resumes the world`);
    await clickIcon(page, 'pause', 'gameplay-control:pause');
    check(await page.evaluate(() => window.__mandateState.isStrategyPause), `${tag}: generated pause stops the world`);
    const zoom = await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestScene').mapZoom);
    await clickIcon(page, 'zoom-in', 'gameplay-control:zoom-in');
    check(await page.evaluate(z => window.__phaserGame.scene.getScene('ConquestScene').mapZoom > z, zoom), `${tag}: generated zoom control changes map scale`);

    for (const lane of ['build', 'heroes', 'court', 'army', 'affairs', 'chronicle']) {
      await clickIcon(page, { build: 'hammer', heroes: 'hero', court: 'crown', army: 'crossed-weapons', affairs: 'diplomacy', chronicle: 'book' }[lane]);
      await page.waitForTimeout(180);
      check(await page.evaluate(lane => window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey === `lane:${lane}`, lane), `${tag}: ${lane} opens`);
      await snapshot(page, `${tag}-${lane}`);
      await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').closeLane());
    }

    // The exact hammer / house / hourglass decision shown in the user's reference.
    await page.evaluate(async () => {
      const { chargeProvinceForDefence } = await import('/src/systems/ascent/RestoreSystem.ts');
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), st = ui.state;
      const land = st.lands.find(l => l.ownerId === 'dai-viet' && l.buildings.length > 1);
      st.ascent.promptQueue = []; st.pendingAscentPrompt = undefined;
      chargeProvinceForDefence(st, land, 0.6, 40);
      const prompt = st.ascent.promptQueue.find(p => p.kind === 'restore-land');
      if (!prompt) throw new Error('Restore fixture did not produce a real prompt');
      st.pendingAscentPrompt = prompt; st.ascent.promptQueue = []; ui.closeOverlay(); ui.refresh();
    });
    await page.waitForTimeout(200);
    const decision = await page.evaluate(() => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), result = [];
      const walk = o => { if (o.getData('cardIcon')) { const texts = o.parentContainer.list.filter(t => t.type === 'Text');
        result.push({ id: o.getData('cardIcon'), art: o.list[0].getData('conquestUiIcon').source,
          clear: texts.every(t => t.x >= o.x + 18 + 10), size: o.list[0].displayWidth * o.scaleX }); } o.list?.forEach(walk); };
      walk(ui.modalLayer); return result;
    });
    check(['hammer', 'hut', 'hourglass'].every(id => decision.some(i => i.id === id)) && decision.every(i => i.art === 'generated' && i.clear && i.size === 36), `${tag}: rebuild choices have 36px art and clear text gutters`, decision);
    await snapshot(page, `${tag}-restore`);
    await clickIcon(page, 'hourglass');
    check(await page.evaluate(() => window.__mandateState.pendingAscentPrompt?.kind !== 'restore-land'), `${tag}: clicking the generated hourglass resolves the decision`);

    await page.evaluate(async () => {
      const { beginBattle } = await import('/src/systems/ascent/BattleSystem.ts');
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), st = ui.state;
      st.pendingAscentPrompt = undefined; st.ascent.promptQueue = []; ui.closeOverlay();
      const ours = st.armies.find(a => a.kingdomId === 'dai-viet' && !a.isLevy);
      const land = st.lands.find(l => l.id === st.ascent.capitalLandId), rival = st.kingdoms.find(k => k.id !== 'dai-viet');
      ours.landId = land.id;
      const invader = structuredClone(ours); invader.id = 'icon-review-invader'; invader.kingdomId = rival.id;
      st.armies.push(invader); st.ascent.activeBattle = undefined;
      st.pendingBattle = { invaderArmyId: invader.id, landId: land.id, landName: land.name, kingdomId: rival.id,
        kingdomName: rival.name, isGreat: false, attackerPower: 0, defenderPower: 0 };
      if (!beginBattle(st)) throw new Error('Battle fixture did not open');
      st.isStrategyPause = true; st.isPaused = true;
      const b = st.ascent.activeBattle; b.ourFormation = 'chong'; b.theirFormation = 'quy'; b.stamina = 2;
      b.ourAdvance = 0.5; b.theirAdvance = 0.5; b.round = 1;
      ui.openLane('battle');
    });
    await page.waitForTimeout(500);
    const battle = await page.evaluate(() => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
      return { ids: JSON.parse(window.render_game_to_text()).ascent.ui.generatedUiIcons,
        graphics: Object.values(ui.battleUi.dock.chips).map(c => c.glyph.list.map(o => o.type)),
        formationLayout: Object.values(ui.battleUi.dock.chips).map(c => ({
          scale: c.glyph.scaleX, y: c.glyph.y, restScale: c.glyphScale, restY: c.glyphY,
        })),
        clash: ui.battleUi.clashMark?.list.find(o => o.getData?.('role') === 'blades')?.list.map(o => ({
          type: o.type, frame: o.frame.name, texture: o.texture.key, size: o.displayWidth,
        })) };
    });
    check(['spears', 'horse', 'skirmish', 'tortoise', 'bows', 'heart', 'shield', 'balance', 'blade', 'check', 'crossed-weapons', 'territory'].every(id => battle.ids.includes(id)), `${tag}: battle vocabulary and return-to-map icon are generated`, battle);
    check(battle.graphics.every(types => types.length === 1 && types[0] === 'Image'), `${tag}: formation icons contain no procedural Graphics`);
    check(battle.formationLayout.length === 5 && battle.formationLayout.every(c =>
      c.scale === battle.formationLayout[0].scale && c.y === battle.formationLayout[0].y
      && c.restScale === c.scale && c.restY === c.y), `${tag}: all five formations share display scale and baseline`, battle.formationLayout);
    check(battle.clash?.length === 1 && battle.clash[0].type === 'Image'
      && battle.clash[0].frame === 'crossed-weapons' && battle.clash[0].texture === 'conquest-ui-icons:v5'
      && battle.clash[0].size === 40, `${tag}: contact marker uses the revised 40px Dong Ho fight print`, battle.clash);
    await snapshot(page, `${tag}-battle`);
    const formationFixture = await page.evaluate(() => structuredClone(window.__mandateState.ascent.activeBattle));
    // Freeze the simulation clock while isolating input. Its existing UI event handlers
    // still apply real orders; a commander/economy tick cannot race the assertion.
    await page.evaluate(() => window.__phaserGame.scene.pause('ConquestScene'));
    for (const [icon, formation] of [['spears', 'chong'], ['horse', 'xung'], ['skirmish', 'tan'], ['tortoise', 'quy'], ['bows', 'no']]) {
      // Independent fixture per order: every target starts unselected with stamina available.
      await page.evaluate(([fixture, formation]) => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), st = ui.state;
        // Closing a lane restores its previous pause state. Do that before installing
        // the next paused fixture, so the commander cannot spend its stamina first.
        ui.closeOverlay();
        st.isPaused = true; st.isStrategyPause = true;
        st.ascent.activeBattle = structuredClone(fixture);
        st.ascent.activeBattle.ourFormation = formation === 'chong' ? 'no' : 'chong';
        st.ascent.activeBattle.freeReform = false;
        ui.openLane('battle');
      }, [formationFixture, formation]);
      await page.waitForTimeout(150);
      await clickIcon(page, icon, undefined, formation);
      const order = await page.evaluate(() => {
        const b = window.__mandateState.ascent.activeBattle;
        return { target: b.formationTarget ?? b.ourFormation, stamina: b.stamina };
      });
      check(order.target === formation && order.stamina < formationFixture.stamina,
        `${tag}: ${icon} selects ${formation} and spends stamina`, order);
    }
    const restoredLayout = await page.evaluate(() => Object.values(window.__phaserGame.scene.getScene('ConquestUIScene').battleUi.dock.chips)
      .map(c => ({ scale: c.glyph.scaleX, y: c.glyph.y, restScale: c.glyphScale, restY: c.glyphY })));
    check(restoredLayout.length === 5 && restoredLayout.every(c => c.scale === restoredLayout[0].scale
      && c.y === restoredLayout[0].y && c.restScale === c.scale && c.restY === c.y),
      `${tag}: formation presses retain the shared size and baseline`, restoredLayout);
    await snapshot(page, `${tag}-battle-reforming`);
    await clickIcon(page, 'territory');
    check(await page.evaluate(() => window.__phaserGame.scene.getScene('ConquestUIScene').openPromptKey !== 'lane:battle'
      && !!window.__mandateState.ascent.activeBattle), `${tag}: map symbol closes the battle view without resolving the battle`);
    await page.evaluate(() => window.__phaserGame.scene.resume('ConquestScene'));
    await page.close();
  }
  check(errors.length === 0, 'no browser errors during live coverage', errors);
  const recovery = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const recoveryErrors = [];
  recovery.on('pageerror', e => recoveryErrors.push(e.message));
  let blockArt = true;
  await recovery.route('**/art/conquest-ui-icons/**', route => blockArt ? route.abort('failed') : route.continue());
  await recovery.addInitScript(() => localStorage.setItem('mandate:graphics:v1', 'medium'));
  await recovery.goto(`${URL}/?capture=1&noladder=1&layout=phone`);
  await recovery.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 60000 });
  check(await recovery.evaluate(() => !window.__phaserGame.textures.exists('conquest-ui-icons:v5')), 'intentional missing-art fixture reaches the menu');
  const fallback = await recovery.evaluate(async () => {
    const { addConquestUiIcon } = await import('/src/ui/conquestUiIcons.ts');
    const { gameplayControl } = await import('/src/ui/GameplayControl.ts');
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    const icon = addConquestUiIcon(scene, 'grain');
    const button = gameplayControl(scene, { x: 0, y: 0, icon: 'pause', label: 'Pause', onClick: () => {} });
    const result = { hiddenMissingBox: !icon.visible, fallbackLabel: button.list.some(o => o.type === 'Text' || o.getData('cachedText')), source: icon.getData('conquestUiIcon').source };
    icon.destroy(); button.destroy(); return result;
  });
  check(fallback.hiddenMissingBox && fallback.fallbackLabel && fallback.source === 'unavailable',
    'failed atlas leaves no broken-texture box and keeps utility controls readable', fallback);
  blockArt = false;
  await recovery.evaluate(() => window.__startBenchGame(20260909, 'ascent'));
  await recovery.waitForFunction(() => window.__phaserGame.scene.isActive('ConquestUIScene') && window.__phaserGame.scene.getScene('ConquestUIScene').ui);
  await resolveOpening(recovery);
  check(await recovery.evaluate(() => window.__phaserGame.textures.get('conquest-ui-icons:v5').has('grain')
    && window.__phaserGame.textures.get('dynasty-sign-icons:v1').has('bronze-drum')), 'scene boundary retries both atlases and restores generated art');
  check(recoveryErrors.length === 0, 'missing-art and retry do not throw JavaScript errors', recoveryErrors);
  await snapshot(recovery, 'recovered-art');
  await recovery.close();
} finally {
  await browser.close();
  writeFileSync(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2));
}
if (checks.some(c => !c.ok)) process.exitCode = 1;
