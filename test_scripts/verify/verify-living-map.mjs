// The Đông Hồ UI/UX contracts, checked rather than eyeballed.
//
//   menu · a calm bamboo-and-lotus river replaces the miniature battlefield
//   menu · every broad paddy stays on the right bank
//   menu · a compact wordmark replaces the launcher emblem
//   menu · mountains, bamboo and lotus move as registered depth layers
//   menu · the water under the lotus swells on its own, without being touched
//   map  · every buffalo cart faces the way it is going, on BOTH legs of its round trip
//   map  · the herds graze a small patch instead of standing frozen
//   map  · a host has a cadence, and its shadow is under the men rather than below them
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = process.env.SHOT_OUT ?? 'output/dongho-life';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const openMenu = async (page, theme = 'dong-ho') => {
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('mandate:map-theme:v1', t), theme);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
};

// ── the menu, on a tall sheet and on a short phone one ───────────────────────
for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 664 }]) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
  await openMenu(page);
  const label = `menu ${viewport.height}px`;

  const menu = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    const heading = scene.children.list.find((c) => c.getData?.('menuHeading'));
    const emblem = scene.children.list.find((c) => c.name === 'app-emblem-river-v7'
      || c.texture?.key === 'app-emblem-river-v7');
    const art = scene.children.list.find((c) => c.type === 'Container'
      && c.getData?.('menuLandscapeRole') === 'illustration');
    const layers = art?.list?.filter((c) => c.type === 'Image'
      && c.getData?.('menuArtworkLayer')) ?? [];
    const mistLayer = art?.list?.find((c) => c.type === 'Container'
      && c.getData?.('menuArtworkLayer') === 'mountain-mist');
    const waterLayer = art?.list?.find((c) => c.type === 'Container'
      && c.getData?.('menuArtworkLayer') === 'river-fx');
    const bambooWind = art?.list?.filter((c) => c.getData?.('menuBambooWindPart')) ?? [];
    const ground = layers.find((c) => c.getData('menuArtworkLayer') === 'ground');
    const bamboo = layers.find((c) => c.getData('menuArtworkLayer') === 'bamboo');
    const lotus = layers.find((c) => c.getData('menuArtworkLayer') === 'lotus');
    const sourceSize = ground?.getData?.('sourceSize') ?? null;
    const artwork = art?.getData?.('menuArtwork') ?? null;
    let bambooPixels = null;
    if (bamboo?.texture?.getSourceImage) {
      const source = bamboo.texture.getSourceImage();
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context?.drawImage(source, 0, 0);
      const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (pixels) {
        let minY = canvas.height;
        let maxY = -1;
        let minX = canvas.width;
        let maxX = -1;
        let opaque = 0;
        const corners = [
          pixels[3],
          pixels[(canvas.width - 1) * 4 + 3],
          pixels[((canvas.height - 1) * canvas.width) * 4 + 3],
          pixels[(canvas.width * canvas.height - 1) * 4 + 3],
        ];
        for (let y = 0; y < canvas.height; y += 2) {
          for (let x = 0; x < canvas.width; x += 2) {
            if (pixels[(y * canvas.width + x) * 4 + 3] <= 16) continue;
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            opaque += 1;
          }
        }
        bambooPixels = { minX, maxX, minY, maxY, opaque, corners, width: canvas.width, height: canvas.height };
      }
    }
    const interaction = scene.children.list.find((c) => c.getData?.('menuLandscapeInteraction') === 'river-ripple');
    const lotusInteraction = scene.children.list.find((c) => c.getData?.('menuLandscapeInteraction') === 'lotus-sway');
    interaction?.emit('pointerdown', null, interaction.displayWidth * 0.28, interaction.displayHeight * 0.66);
    interaction?.emit('pointermove', { isDown: true }, interaction.displayWidth * 0.31, interaction.displayHeight * 0.72);
    lotusInteraction?.emit('pointerover', { isDown: false }, lotusInteraction.displayWidth * 0.35, lotusInteraction.displayHeight * 0.45);
    lotusInteraction?.emit('pointermove', { isDown: false }, lotusInteraction.displayWidth * 0.46, lotusInteraction.displayHeight * 0.42);
    lotusInteraction?.emit('pointermove', { isDown: true }, lotusInteraction.displayWidth * 0.58, lotusInteraction.displayHeight * 0.5);
    return {
      vScale: scene.vScale,
      heading: heading ? { text: heading.text ?? heading.getData('headingText'), bottom: heading.y + heading.displayHeight / 2 } : null,
      emblemPresent: Boolean(emblem),
      art: art ? {
        x: ground?.x,
        top: ground ? ground.y - ground.displayHeight / 2 : null,
        width: ground?.displayWidth,
        height: ground?.displayHeight,
        aspectError: sourceSize
          ? Math.abs((ground.displayWidth / ground.displayHeight) - (sourceSize.width / sourceSize.height))
          : null,
        sourceSize,
        artwork,
        layers: layers.map((layer) => ({
          name: layer.getData('menuArtworkLayer'),
          texture: layer.texture?.key,
          motion: layer.getData('menuLayerMotion'),
          placement: layer.getData('menuSettlementPlacement') ?? null,
          settlementBand: layer.getData('menuSettlementBand') ?? null,
          settlementTransform: layer.getData('menuSettlementTransform') ?? null,
          artStyle: layer.getData('menuArtStyle') ?? null,
          bambooPlacement: layer.getData('menuBambooPlacement') ?? null,
          bambooBand: layer.getData('menuBambooBand') ?? null,
          bambooTransform: layer.getData('menuBambooTransform') ?? null,
          bambooStyle: layer.getData('menuBambooStyle') ?? null,
          bambooCulmCount: layer.getData('menuBambooCulmCount') ?? null,
          bambooWindMode: layer.getData('menuBambooWindMode') ?? null,
          bambooWindLayers: layer.getData('menuBambooWindLayers') ?? null,
          fieldContinuity: layer.getData('menuFieldContinuity') ?? null,
          lotusResponse: layer.getData('menuLotusResponse') ?? null,
          lotusMotionProfile: layer.getData('menuLotusMotionProfile') ?? null,
          lotusAmbientRange: layer.getData('menuLotusAmbientRange') ?? null,
          lotusAmbientPosition: layer.getData('menuMotionProxy')
            ? { ...layer.getData('menuMotionProxy') }
            : null,
          lotusMaxResponse: layer.getData('menuLotusMaxResponse') ?? null,
          lotusWaterResponse: layer.getData('menuLotusWaterResponse') ?? null,
          lotusReaction: layer.getData('menuLotusReaction') ?? null,
          houseCount: layer.getData('menuHouseCount') ?? null,
          tinted: layer.isTinted ?? false,
          animated: scene.tweens.getTweensOf(layer).some((t) => t.isPlaying())
            || scene.tweens.getTweensOf(layer.getData('menuMotionProxy')).some((t) => t.isPlaying()),
        })),
        mountainMist: {
          count: mistLayer?.list?.filter((c) => c.getData?.('menuMistLayer') === 'mountains').length ?? 0,
          maxAlpha: Math.max(0, ...(mistLayer?.list?.filter((c) => c.getData?.('menuMistLayer') === 'mountains')
            .map((c) => c.alpha) ?? [])),
          animated: mistLayer?.list?.filter((c) => c.getData?.('menuMistLayer') === 'mountains')
            .every((c) => scene.tweens.getTweensOf(c).some((t) => t.isPlaying())) ?? false,
          positions: mistLayer?.list?.filter((c) => c.getData?.('menuMistLayer') === 'mountains')
            .map((c) => ({ x: c.x, y: c.y })) ?? [],
          travels: mistLayer?.list?.filter((c) => c.getData?.('menuMistLayer') === 'mountains')
            .map((c) => c.getData?.('menuMistTravel')) ?? [],
          durations: mistLayer?.list?.filter((c) => c.getData?.('menuMistLayer') === 'mountains')
            .map((c) => c.getData?.('menuMistDuration')) ?? [],
        },
        waterCompositing: {
          marker: waterLayer?.getData?.('menuCompositing') ?? null,
          waterIndex: art?.list?.indexOf(waterLayer) ?? -1,
          bambooIndex: art?.list?.indexOf(bamboo) ?? -1,
          lotusIndex: art?.list?.indexOf(lotus) ?? -1,
        },
        bambooPixels,
        bambooWind: {
          count: bambooWind.length,
          parts: bambooWind.map((part) => part.getData?.('menuBambooWindPart')),
          positions: bambooWind.map((part) => ({ x: part.x, y: part.y, angle: part.angle })),
          animated: bambooWind.every((part) => scene.tweens.getTweensOf(part).some((t) => t.isPlaying())),
        },
      } : null,
      tweens: scene.tweens.getTweens().filter((t) => t.isPlaying()).length,
      interaction: interaction?.getData?.('menuLandscapeInteraction') ?? null,
      gestures: interaction?.getData?.('menuRiverGestures') ?? [],
      lotusGestures: lotusInteraction?.getData?.('menuLotusGestures') ?? [],
      ripple: waterLayer?.list?.filter((c) => c.getData?.('menuRipple')).length ?? 0,
      wakes: waterLayer?.list?.filter((c) => c.getData?.('menuWaterWake')).length ?? 0,
      currents: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current').length ?? 0,
      riverPulses: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-pulse').length ?? 0,
      riverPulsesAnimated: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-pulse')
        .every((c) => scene.tweens.getTweensOf(c).some((t) => t.isPlaying())) ?? false,
      riverPulseLanes: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-pulse')
        .map((c) => c.getData?.('menuRiverPulseLane')) ?? [],
      riverMotes: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-flow-mote').length ?? 0,
      riverMotesAnimated: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-flow-mote')
        .every((c) => scene.tweens.getTweensOf(c.getData?.('menuRiverMoteProxy')).some((t) => t.isPlaying())) ?? false,
      riverMoteDurations: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-flow-mote')
        .map((c) => c.getData?.('menuRiverMoteDuration')) ?? [],
      riverMoteLanes: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-flow-mote')
        .map((c) => c.getData?.('menuRiverMoteLane')) ?? [],
      riverMotePositions: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-flow-mote')
        .map((c) => ({ x: c.x, y: c.y, alpha: c.alpha })) ?? [],
      currentDurations: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => c.getData?.('menuCurrentDuration')) ?? [],
      currentInterpolations: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => c.getData?.('menuCurrentInterpolation')) ?? [],
      currentMotions: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => c.getData?.('menuCurrentMotion')) ?? [],
      currentAnchors: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => c.getData?.('menuCurrentAnchor')) ?? [],
      currentLanes: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => c.getData?.('menuCurrentLane')) ?? [],
      currentVisibilities: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => c.getData?.('menuCurrentVisibility')) ?? [],
      currentGraphics: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => c.getData?.('menuCurrentGraphic')) ?? [],
      currentTravelLimits: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => c.getData?.('menuCurrentTravel')) ?? [],
      currentMaxAlpha: Math.max(0, ...(waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => c.alpha) ?? [])),
      currentPositions: waterLayer?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => ({ x: c.x, y: c.y })) ?? [],
      lotusWakes: waterLayer?.list?.filter((c) => c.getData?.('menuWakeSource') === 'lotus').length ?? 0,
      lotusWakeDetails: waterLayer?.list?.filter((c) => c.getData?.('menuWakeSource') === 'lotus')
        .map((c) => ({
          origin: c.getData?.('menuWakeOrigin') ?? null,
          stem: c.getData?.('menuWakeStem') ?? null,
          base: c.getData?.('menuWakeBase') ?? null,
          animated: scene.tweens.getTweensOf(c).some((t) => t.isPlaying()),
        })) ?? [],
      waterVeilBands: waterLayer?.list?.find((c) => c.getData?.('menuWaterTreatment') === 'soft-paper-glaze')
        ?.getData?.('menuRiverVeilBands') ?? 0,
      waterGraphic: waterLayer?.list?.find((c) => c.getData?.('menuWaterTreatment') === 'soft-paper-glaze')
        ?.getData?.('menuWaterGraphic') ?? null,
      grazing: scene.children.list.filter((c) => c.getData?.('grazing')).length,
      military: scene.children.list.filter((c) => c.type === 'Container' && c.depth === -7).length,
    };
  });

  check(`${label}: compact heading leaves the artwork clear and no launcher emblem is shown`,
    !menu.emblemPresent && menu.heading?.text === 'VẠN THẮNG' && menu.heading.bottom < menu.art?.top,
    JSON.stringify(menu.heading));
  check(`${label}: four registered artwork plates are loaded`, menu.art?.layers?.length === 4
    && ['ground', 'mountains', 'bamboo', 'lotus'].every((name) => menu.art.layers.some((layer) => layer.name === name))
    && new Set(menu.art.layers.map((layer) => layer.texture)).size === 4
    && menu.art.layers.find((layer) => layer.name === 'ground')?.texture === 'menu-layer-ground-v5'
    && menu.art.layers.find((layer) => layer.name === 'ground')?.fieldContinuity === 'fully-planted-rice'
    && menu.art.layers.find((layer) => layer.name === 'bamboo')?.texture === 'menu-layer-bamboo-v2'
    && menu.art.sourceSize?.width >= 1500 && menu.art.sourceSize?.height >= 1000,
  JSON.stringify(menu.art));
  check(`${label}: the illustration keeps its authored aspect`, menu.art?.aspectError !== null
    && menu.art.aspectError < 1e-6,
  `aspect error ${menu.art?.aspectError}, layout factor ${menu.vScale.toFixed(3)}`);
  check(`${label}: the approved bamboo-river composition is declared`, [
    'karst-mountains', 's-curve-river', 'foreground-lotus', 'right-bank-paddies', 'right-bank-bamboo-grove',
  ].every((part) => menu.art?.artwork?.composition?.includes(part)),
  JSON.stringify(menu.art?.artwork));
  check(`${label}: the art is centred and fills its responsive lane`, menu.art?.x === 195
    && menu.art.width >= (viewport.height <= 664 ? 310 : 360)
    && menu.art.width <= 422 && menu.art.top < 200 && menu.art.top + menu.art.height < 480,
  JSON.stringify(menu.art));
  check(`${label}: armies, banners and herd are gone`, menu.military === 0 && menu.grazing === 0,
    `${menu.military} military containers, ${menu.grazing} grazing animals`);
  check(`${label}: distance controls the layer motion`, menu.art?.layers
    ?.filter((layer) => layer.name !== 'ground').every((layer) => layer.animated)
    && menu.art.layers.find((layer) => layer.name === 'ground')?.animated === false,
  JSON.stringify(menu.art?.layers));
  check(`${label}: distinct mist wisps are visibly present in the mountain depth layer`, menu.art?.mountainMist?.count === 5
    && menu.art.mountainMist.maxAlpha >= 0.58
    && menu.art.mountainMist.animated,
  JSON.stringify(menu.art?.mountainMist));
  check(`${label}: bamboo is a small rear-dike windbreak rather than a foreground field object`, menu.art?.layers
    ?.some((layer) => layer.name === 'bamboo'
      && layer.bambooPlacement === 'rear-field-edge-windbreak'
      && layer.bambooBand === 'rear-right-dike'
      && layer.bambooStyle === 'dong-ho-natural-pigment'
      && Math.abs(layer.bambooTransform?.scale - 0.2) < 1e-6
      && layer.bambooTransform?.targetCentre?.x >= 1360
      && layer.bambooTransform?.targetCentre?.y >= 450
      && layer.bambooTransform?.targetCentre?.y <= 510
      && layer.bambooCulmCount >= 12
      && layer.tinted === false),
  JSON.stringify(menu.art?.layers?.find((layer) => layer.name === 'bamboo')));
  const bambooLayer = menu.art?.layers?.find((layer) => layer.name === 'bamboo');
  check(`${label}: bamboo plate is truly transparent and its measured bounds drive placement`, menu.art?.bambooPixels
    && menu.art.bambooPixels.corners.every((alpha) => alpha === 0)
    && menu.art.bambooPixels.opaque > 100
    // The v2 grove is drawn taller in its frame than v1 was; the guard is that the plate's upper
    // third is clear, i.e. it is an isolated grove and not a full-frame picture.
    && menu.art.bambooPixels.minY >= menu.art.bambooPixels.height * 0.3
    && Math.abs(bambooLayer?.bambooTransform?.sourceBounds?.left - menu.art.bambooPixels.minX) <= 2
    && Math.abs(bambooLayer?.bambooTransform?.sourceBounds?.right - menu.art.bambooPixels.maxX) <= 2
    && Math.abs(bambooLayer?.bambooTransform?.sourceBounds?.top - menu.art.bambooPixels.minY) <= 2
    && Math.abs(bambooLayer?.bambooTransform?.sourceBounds?.bottom - menu.art.bambooPixels.maxY) <= 2,
  JSON.stringify(menu.art?.bambooPixels));
  check(`${label}: all water motion is composited below bamboo and lotus`, menu.art?.waterCompositing?.marker === 'below-bamboo-and-lotus'
    && menu.art.waterCompositing.waterIndex >= 0
    && menu.art.waterCompositing.waterIndex < menu.art.waterCompositing.bambooIndex
    && menu.art.waterCompositing.waterIndex < menu.art.waterCompositing.lotusIndex,
  JSON.stringify(menu.art?.waterCompositing));
  await page.waitForTimeout(900);
  const motionLater = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    const art = scene.children.list.find((c) => c.type === 'Container'
      && c.getData?.('menuLandscapeRole') === 'illustration');
    const water = art?.list?.find((c) => c.type === 'Container'
      && c.getData?.('menuArtworkLayer') === 'river-fx');
    const mist = art?.list?.find((c) => c.type === 'Container'
      && c.getData?.('menuArtworkLayer') === 'mountain-mist');
    const lotus = art?.list?.find((c) => c.getData?.('menuArtworkLayer') === 'lotus');
    const lotusAmbient = lotus?.getData?.('menuMotionProxy');
    return {
      currents: water?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-current')
        .map((c) => ({ x: c.x, y: c.y })) ?? [],
      riverMotes: water?.list?.filter((c) => c.getData?.('menuAmbient') === 'river-flow-mote')
        .map((c) => ({ x: c.x, y: c.y, alpha: c.alpha })) ?? [],
      mist: mist?.list?.filter((c) => c.getData?.('menuMistLayer') === 'mountains')
        .map((c) => ({ x: c.x, y: c.y })) ?? [],
      bambooWind: art?.list?.filter((c) => c.getData?.('menuBambooWindPart'))
        .map((c) => ({ x: c.x, y: c.y, angle: c.angle })) ?? [],
      lotusAmbient: lotusAmbient ? { ...lotusAmbient } : null,
    };
  });
  const movingCurrents = menu.currentPositions.filter((before, index) => {
    const after = motionLater.currents[index];
    return after && Math.hypot(after.x - before.x, after.y - before.y) > 0.03;
  }).length;
  const currentTravel = menu.currentPositions.map((before, index) => {
    const after = motionLater.currents[index];
    return after ? Math.hypot(after.x - before.x, after.y - before.y) : 0;
  });
  const riverMoteTravel = menu.riverMotePositions.map((before, index) => {
    const after = motionLater.riverMotes[index];
    // The loop reset happens while the fleck is fully faded at the source/mouth. Do not report
    // that invisible teleport as surface speed; measure only flecks visible at both sample times.
    return after && before.alpha >= 0.12 && after.alpha >= 0.12
      ? Math.hypot(after.x - before.x, after.y - before.y)
      : 0;
  });
  const movingRiverMotes = riverMoteTravel.filter((distance) => distance >= 1.2).length;
  const movingMist = menu.art.mountainMist.positions.filter((before, index) => {
    const after = motionLater.mist[index];
    return after && Math.hypot(after.x - before.x, after.y - before.y) > 0.35;
  }).length;
  const movingBambooWind = menu.art.bambooWind.positions.filter((before, index) => {
    const after = motionLater.bambooWind[index];
    return after && (Math.hypot(after.x - before.x, after.y - before.y) > 0.08
      || Math.abs(after.angle - before.angle) > 0.04);
  }).length;
  const lotusLayer = menu.art?.layers?.find((layer) => layer.name === 'lotus');
  const lotusAmbientTravel = lotusLayer?.lotusAmbientPosition && motionLater.lotusAmbient
    ? Math.hypot(
      motionLater.lotusAmbient.x - lotusLayer.lotusAmbientPosition.x,
      motionLater.lotusAmbient.y - lotusLayer.lotusAmbientPosition.y,
    )
    : 0;
  check(`${label}: mountain mist visibly drifts instead of only pulsing`, movingMist >= 4
    && menu.art.mountainMist.travels.every((travel) => travel >= menu.art.width * 0.04)
    && menu.art.mountainMist.durations.every((duration) => duration <= 10_000),
  `${movingMist}/${menu.art.mountainMist.count} wisps moved over 900ms`);
  check(`${label}: bamboo bends in layered wind while its roots stay on the dike`, bambooLayer?.bambooWindMode === 'segmented-canopy-lag'
    && bambooLayer?.bambooWindLayers === 2
    && menu.art.bambooWind.count === 2
    && menu.art.bambooWind.animated
    && ['upper-culms', 'leaf-canopy'].every((part) => menu.art.bambooWind.parts.includes(part))
    && movingBambooWind === 2,
  `${movingBambooWind}/2 wind layers moved over 900ms: ${JSON.stringify(menu.art.bambooWind)}`);
  check(`${label}: water has readable, one-way watercolour surface flow`, menu.interaction === 'river-ripple'
    && menu.ripple > 0 && menu.wakes > 0 && menu.currents >= 6
    && menu.riverPulses >= 5 && menu.riverPulsesAnimated
    && menu.riverMotes >= 6 && menu.riverMotesAnimated
    && Math.min(...menu.currentLanes) <= -0.58 && Math.max(...menu.currentLanes) >= 0.65
    && Math.min(...menu.riverPulseLanes) <= -0.6 && Math.max(...menu.riverPulseLanes) >= 0.55
    && Math.min(...menu.riverMoteLanes) <= -0.7 && Math.max(...menu.riverMoteLanes) >= 0.68
    && menu.riverMoteDurations.every((duration) => duration >= 108_000 && duration <= 172_000)
    && movingRiverMotes >= 5 && riverMoteTravel.every((distance) => distance < 8)
    && menu.waterVeilBands === 3 && menu.waterGraphic === 'two-tone-reflection-wash'
    && menu.currentMaxAlpha >= 0.26 && movingCurrents >= 5
    && Math.min(...menu.currentAnchors) <= 0.2 && Math.max(...menu.currentAnchors) >= 0.94
    && menu.currentDurations.every((duration) => duration >= 8_500 && duration <= 11_500)
    && menu.currentInterpolations.every((mode) => mode === 'forward-fade-loop')
    && menu.currentMotions.every((mode) => mode === 'forward-surface-flow')
    && menu.currentVisibilities.every((mode) => mode === 'phone-readable')
    && menu.currentGraphics.every((mode) => mode === 'layered-watercolour-ripples')
    && menu.currentTravelLimits.every((distance) => distance >= 12 && distance <= 16)
    && Math.max(...currentTravel) >= 0.8
    && currentTravel.every((distance) => distance < 3)
    && ['tap', 'drag', 'hover-wake'].every((gesture) => menu.gestures.includes(gesture)),
  `${menu.currents} drifting pools (${movingCurrents} moving, max ${Math.max(...currentTravel).toFixed(2)}px/900ms), ${menu.riverPulses} pulse rings, ${movingRiverMotes}/${menu.riverMotes} downstream flecks moving (max ${Math.max(...riverMoteTravel).toFixed(2)}px/900ms), alpha ${menu.currentMaxAlpha.toFixed(2)}, ${menu.ripple} touch ripple(s), ${menu.wakes} wake(s), ${menu.tweens} tweens playing`);
  const lotusWake = menu.lotusWakeDetails?.[0];
  const lotusWakeNormalized = lotusWake?.base ? {
    x: (lotusWake.base.x - (menu.art.x - menu.art.width / 2)) / menu.art.width,
    y: (lotusWake.base.y - menu.art.top) / menu.art.height,
  } : null;
  check(`${label}: lotus bends softly and makes water wakes under hover/drag`, lotusLayer?.lotusResponse === 'soft-damped-pointer-spring'
    && lotusLayer?.lotusMotionProfile === 'visible-gentle-breeze'
    && lotusLayer?.lotusAmbientRange?.x === 2
    && lotusLayer?.lotusAmbientRange?.y === 1.6
    && lotusLayer?.lotusAmbientRange?.angle === 0.18
    && lotusLayer?.lotusAmbientRange?.duration === 5_800
    && lotusAmbientTravel >= 0.12
    && lotusLayer?.lotusMaxResponse?.x === 2.2
    && lotusLayer?.lotusMaxResponse?.y === 1.1
    && lotusLayer?.lotusMaxResponse?.angle === 0.7
    && lotusLayer?.lotusWaterResponse === 'stem-waterline-ripples'
    && ['hover', 'drag', 'water-wake'].every((gesture) => menu.lotusGestures.includes(gesture))
    && menu.lotusWakes > 0
    && lotusWake?.origin === 'stem-waterline'
    && lotusWake?.animated === true
    && lotusWakeNormalized?.x >= 0.15 && lotusWakeNormalized.x <= 0.38
    // The band ends lower than it used to: the lotus plate is sunk by `LOTUS_SINK` so its stems
    // stand in the river rather than on the pale bar beside it, and the waterline went with them.
    && lotusWakeNormalized?.y >= 0.88 && lotusWakeNormalized.y <= 0.98
    && Math.abs(lotusLayer.lotusReaction?.x ?? 0) <= 2.2
    && Math.abs(lotusLayer.lotusReaction?.y ?? 0) <= 1.1
    && Math.abs(lotusLayer.lotusReaction?.angle ?? 0) <= 0.7
    && Math.abs(lotusLayer.lotusReaction?.x ?? 0) + Math.abs(lotusLayer.lotusReaction?.angle ?? 0) > 0.2,
  JSON.stringify({
    gestures: menu.lotusGestures,
    reaction: lotusLayer?.lotusReaction,
    ambientTravelOver900ms: lotusAmbientTravel,
    lotusWakes: menu.lotusWakes,
    wake: lotusWake,
    normalized: lotusWakeNormalized,
  }));

  // The pond has to move when nobody is touching it. One swell is scheduled within the first
  // couple of seconds, so this resolves at once in practice; the timeout is only there so a
  // regression fails with a readable count instead of hanging the run.
  const readIdleWaves = () => page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    const art = scene.children.list.find((c) => c.type === 'Container'
      && c.getData?.('menuLandscapeRole') === 'illustration');
    const water = art?.list?.find((c) => c.getData?.('menuArtworkLayer') === 'river-fx');
    const lotus = art?.list?.find((c) => c.getData?.('menuArtworkLayer') === 'lotus');
    const log = lotus?.getData?.('menuLotusIdleWaveLog') ?? [];
    // A Container has no measurable size of its own; the ground plate is the illustration's frame.
    const ground = art?.list?.find((c) => c.getData?.('menuArtworkLayer') === 'ground');
    const frame = {
      left: ground.x - ground.displayWidth / 2,
      top: ground.y - ground.displayHeight / 2,
      width: ground.displayWidth,
      height: ground.displayHeight,
    };
    return {
      declared: lotus?.getData?.('menuLotusIdleWater') ?? null,
      gap: lotus?.getData?.('menuLotusIdleWaveGap') ?? null,
      log: log.map((wave) => ({
        ...wave,
        normX: (wave.x - frame.left) / frame.width,
        normY: (wave.y - frame.top) / frame.height,
      })),
      shapes: water?.list?.filter((c) => c.getData?.('menuAmbient') === 'lotus-idle-wave')
        .map((c) => ({
          origin: c.getData('menuIdleWaveOrigin'),
          shape: c.getData('menuIdleWaveShape'),
          alpha: c.alpha,
        })) ?? [],
    };
  });
  await page.waitForFunction(
    () => {
      const scene = window.__phaserGame.scene.getScene('MenuScene');
      const art = scene.children.list.find((c) => c.getData?.('menuLandscapeRole') === 'illustration');
      const lotus = art?.list?.find((c) => c.getData?.('menuArtworkLayer') === 'lotus');
      return (lotus?.getData?.('menuLotusIdleWaveLog') ?? []).length > 0;
    },
    null,
    { timeout: 8_000 },
  ).catch(() => {});
  const idle = await readIdleWaves();
  const idleWave = idle.log[0];
  check(`${label}: the water under the lotus swells on its own`, idle.declared === 'random-waterline-swell'
    && idle.gap?.min >= 3_000 && idle.gap?.max > idle.gap?.min
    && idle.log.length > 0
    && idle.log.every((wave) => wave.duration >= 2_600 && wave.duration <= 4_200)
    // Quieter than the 0.88 a finger gets, or the pond would be answering a touch nobody made.
    && idle.log.every((wave) => wave.peak > 0.3 && wave.peak <= 0.75)
    && idle.log.every((wave) => wave.normX >= 0.1 && wave.normX <= 0.45)
    && idle.log.every((wave) => wave.normY >= 0.86 && wave.normY <= 0.99)
    && idle.shapes.every((shape) => shape.origin === 'stem-waterline')
    // The pond has one water vocabulary: the idle swell opens the same rounded rings the touch
    // answer does, rather than inventing a second kind of wave on the same plate.
    && idle.shapes.every((shape) => shape.shape === 'stem-waterline-rings'),
  JSON.stringify({ declared: idle.declared, gap: idle.gap, waves: idle.log.length, first: idleWave }));

  await page.screenshot({ path: `${OUT}/menu-${viewport.height}.png` });
  await page.close();
}

// ── the map: carts, herds, hosts ─────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await openMenu(page);
await page.waitForFunction(() => typeof window.__startBenchGame === 'function', null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(1337, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
await page.evaluate(() => {
  const state = window.__mandateState;
  for (const land of state.lands) { land.isVisible = true; land.isExplored = true; }
  window.__phaserGame.scene.getScene('MapScene').refresh();
});
await page.waitForTimeout(1200);

// The menu's fields were rebuilt on the lattice the map already draws with, which meant lifting
// that loop out of `DongHoMapRenderer`. Proven output-identical here rather than by eye, because
// "the delta looks slightly different now" is not something a screenshot review reliably catches.
const latticeMatches = await page.evaluate(async () => {
  const { paddyLattice } = await import('/src/ui/ink/settlements.ts');
  const { mulberry32 } = await import('/src/ui/ink/stroke.ts');

  // The loop exactly as it stood in `paintFields` before the extraction.
  const original = (minX, maxX, minY, maxY, cell, seed, keep) => {
    const rand = mulberry32(seed);
    const rowCount = Math.min(400, Math.ceil((maxY - minY) / cell) + 1);
    const lines = [];
    for (let index = 0; index <= rowCount; index += 1) {
      const yy = minY + index * cell;
      const line = [];
      for (let node = 0; node <= 26; node += 1) {
        line.push({
          x: minX + ((maxX - minX) * node) / 26,
          y: yy + Math.sin(node * 0.62 + index * 1.21) * cell * 0.2 + (rand() - 0.5) * cell * 0.12,
        });
      }
      lines.push(line);
    }
    const heightAt = (line, x) => {
      const t = Math.max(0, Math.min(1, (x - line[0].x) / (line[26].x - line[0].x || 1)));
      const index = Math.min(25, Math.floor(t * 26));
      const fraction = t * 26 - index;
      return line[index].y + (line[index + 1].y - line[index].y) * fraction;
    };
    const plots = [];
    for (let row = 0; row < rowCount; row += 1) {
      let x = minX + (rand() - 0.5) * cell;
      while (x < maxX) {
        const width = cell * (0.8 + rand() * 1.0);
        const mx = x + width / 2;
        const my = (heightAt(lines[row], mx) + heightAt(lines[row + 1], mx)) / 2;
        if (keep(mx, my)) {
          plots.push({
            points: [
              { x: x + 1, y: heightAt(lines[row], x) + 1 },
              { x: x + width - 1, y: heightAt(lines[row], x + width) + 1 },
              { x: x + width - 1, y: heightAt(lines[row + 1], x + width) - 1 },
              { x: x + 1, y: heightAt(lines[row + 1], x) - 1 },
            ],
            stage: rand(),
            seed: Math.round(mx * 7 + my * 13),
          });
        }
        x += width;
      }
    }
    return plots;
  };

  const keep = (x, y) => ((x - 300) ** 2 + (y - 400) ** 2) < 180 ** 2;
  const before = original(-40, 620, -20, 900, 23, 7777, keep);
  const after = paddyLattice({ x0: -40, x1: 620, y0: -20, y1: 900, cell: 23, seed: 7777, keep });
  return { count: before.length, identical: JSON.stringify(before) === JSON.stringify(after) };
});
check('map: the shared paddy lattice draws exactly what the map drew before',
  latticeMatches.identical && latticeMatches.count > 50, `${latticeMatches.count} plots compared`);

const sample = async () => page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  const carts = [...scene.traffic.cartMarkers.entries()].map(([key, mover]) => ({
    key,
    x: mover.object.x,
    scaleX: Math.sign(mover.object.scaleX),
    native: mover.object.getData('nativeFacing') ?? 1,
  }));
  const herd = [];
  const walk = (node) => {
    for (const child of node.list ?? []) {
      const home = child.getData?.('grazing');
      if (home) herd.push({ x: child.x, y: child.y, ...home });
      if (child.list) walk(child);
    }
  };
  walk({ list: scene.children.list });
  return { carts, herd };
});

const samples = [await sample()];
check('map: carts are on the roads', samples[0].carts.length > 0, `${samples[0].carts.length} carts`);
check('map: buffalo are in the fields', samples[0].herd.length > 0, `${samples[0].herd.length} animals`);

for (let round = 0; round < 26; round += 1) {
  await page.waitForTimeout(320);
  samples.push(await sample());
}

let steps = 0;
let wrongWay = 0;
let sawLeft = 0;
let sawRight = 0;
for (let index = 1; index < samples.length; index += 1) {
  const before = new Map(samples[index - 1].carts.map((c) => [c.key, c]));
  for (const cart of samples[index].carts) {
    const prior = before.get(cart.key);
    if (!prior) continue;
    const dx = cart.x - prior.x;
    if (Math.abs(dx) < 0.6) continue;
    steps += 1;
    // The rig points where it goes when travel direction × the direction it was drawn matches
    // the flip that was applied.
    if (Math.sign(dx) * cart.native !== cart.scaleX) wrongWay += 1;
    if (Math.sign(dx) < 0) sawLeft += 1; else sawRight += 1;
  }
}
check('map: every cart faces its direction of travel', steps > 20 && wrongWay === 0, `${steps - wrongWay}/${steps} steps correct`);
check('map: both legs of the round trip were exercised', sawLeft > 0 && sawRight > 0, `left ${sawLeft}, right ${sawRight}`);

let moved = 0;
let strayed = 0;
for (const shot of samples) {
  for (const animal of shot.herd) {
    const drift = Math.hypot(animal.x - animal.homeX, animal.y - animal.homeY);
    if (drift > 1) moved += 1;
    if (drift > animal.radius + 2) strayed += 1;
  }
}
check('map: the herds are not standing still', moved > 0, `${moved} sampled positions off their home spot`);
check('map: the herds keep to their own patch', strayed === 0, `${strayed} strayed past their radius`);

// The host's shadow has drifted off its men twice now — once from measuring the block with one
// spacing and drawing it with another, once from an anchor convention slipping between the two
// calls. So it is measured here: the ground has to sit under the feet, not beside them.
const shadow = await page.evaluate(async () => {
  const { drawHost, hostFootprint, hostShape } = await import('/src/ui/ink/devices.ts');

  // A recorder standing in for a Graphics, so the production geometry can be compared directly:
  // where the ellipse landed against where the feet landed.
  //
  // `figure` used to rule its body with `lineBetween`; since the cast went through `inkPath` it
  // is a `strokePoints` like everything else, so the recorder listens for that. The lowest point
  // of each stroke is kept: for the body that is the foot; for the shoulders, nón and spear it is
  // a point a fraction of a figure above and beside it, which moves the measured centre by well
  // under a per cent of a host's width and leaves the front rank exactly where the feet are.
  const record = () => {
    const feet = [];
    let ellipse = null;
    return {
      feet,
      get ellipse() { return ellipse; },
      lineStyle() {}, fillStyle() {}, fillCircle() {}, fillTriangle() {}, fillPoints() {},
      // Phaser Graphics uses a temporary canvas translation to create the hand-registered wash.
      // It does not affect the outline points this recorder measures, but the production drawing
      // path still expects the method to exist.
      translateCanvas() {},
      beginPath() {}, strokePath() {}, fillPath() {}, moveTo() {}, lineTo() {}, arc() {}, closePath() {},
      strokePoints(points) {
        if (!points?.length) return;
        let low = points[0];
        for (const p of points) if (p.y > low.y) low = p;
        feet.push({ x: low.x, y: low.y });
      },
      lineBetween(x1, y1, x2, y2) { if (y1 > y2) feet.push({ x: x1, y: y1 }); },
      fillEllipse(x, y, w, h) { ellipse = { x, y, w, h }; },
    };
  };

  const out = [];
  for (const [men, scale] of [[900, 0.82], [3200, 0.82], [9000, 0.82], [1900, 0.74]]) {
    const shape = hostShape(men, 4.6 * scale, 4 * scale);
    const x = -shape.width / 2;
    const y = -shape.height;

    const ground = record();
    hostFootprint(ground, x, y, shape, scale);
    const men2 = record();
    drawHost(men2, x, y, men, men + 17, 0, scale, true);

    const xs = men2.feet.map((f) => f.x);
    const ys = men2.feet.map((f) => f.y);
    const left = Math.min(...xs); const right = Math.max(...xs);
    const front = Math.max(...ys); const back = Math.min(...ys);
    out.push({
      men, scale,
      centreOff: Math.abs(ground.ellipse.x - (left + right) / 2),
      // Distance from the ellipse's lower edge to the front rank's feet.
      baseOff: Math.abs((ground.ellipse.y + ground.ellipse.h / 2) - front),
      span: right - left,
      depth: Math.max(1, front - back),
    });
  }
  return out;
});
for (const row of shadow) {
  check(`map: ${row.men}-man host stands on its own shadow`,
    row.centreOff <= row.span * 0.08 && row.baseOff <= row.depth * 0.5,
    `centre off by ${row.centreOff.toFixed(1)} of ${row.span.toFixed(0)} wide, base off by ${row.baseOff.toFixed(1)} of ${row.depth.toFixed(0)} deep`);
}

// Settlements have to paint back-to-front, and the herd has to be textures rather than live paths.
// Revealed again first: the empire tick recomputes fog, so a reveal from twenty seconds ago has
// already been undone and the map is back to its six opening districts.
await page.evaluate(() => {
  const state = window.__mandateState;
  for (const land of state.lands) { land.isVisible = true; land.isExplored = true; }
  window.__phaserGame.scene.getScene('MapScene').refresh();
});
await page.waitForTimeout(900);
const order = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MapScene');

  // Every animal is a baked Image, not a Graphics rebuilding hundreds of path segments per frame.
  let herdImages = 0;
  let herdGraphics = 0;
  const textures = new Set();
  const walk = (list) => {
    for (const child of list ?? []) {
      if (child.getData?.('grazing')) {
        if (child.type === 'Image') { herdImages += 1; textures.add(child.texture.key); } else herdGraphics += 1;
      }
      if (child.list) walk(child.list);
    }
  };
  walk(scene.children.list);

  // A settlement's children must be in ground order: each layer's lowest ink no higher than the
  // next one's. Read off the land nodes, which hold the clusters.
  const inversions = [];
  for (const node of scene.children.list) {
    if (node.type !== 'Container') continue;
    const parts = (node.list ?? []).filter((c) => c.type === 'Image' && c.getData?.('grazing'));
    if (parts.length === 0) continue;
    // An animal must be painted after (above) any settlement buffer that stands behind it.
    const index = node.list.indexOf(parts[0]);
    const before = node.list.slice(0, index).filter((c) => c.type === 'Graphics').length;
    const after = node.list.slice(index).filter((c) => c.type === 'Graphics').length;
    if (before === 0 && after > 0) inversions.push('animal painted before every roof');
  }
  return { herdImages, herdGraphics, textures: textures.size, inversions, nodes: scene.landNodes?.size ?? -1 };
});
check('map: the herd is drawn from baked textures', order.herdImages > 0 && order.herdGraphics === 0,
  `${order.herdImages} images, ${order.herdGraphics} live graphics, ${order.nodes} districts`);
check('map: the herd shares few textures (so the copies batch)', order.textures > 0 && order.textures <= 12,
  `${order.textures} textures for ${order.herdImages} animals`);
check('map: settlements paint back to front around their animals', order.inversions.length === 0,
  order.inversions.slice(0, 3).join('; '));

const host = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MapScene');
  const marker = [...(scene.armies?.markers?.values?.() ?? [])][0];
  if (!marker) return null;
  return {
    ranks: marker.list.filter((c) => c.type === 'Graphics').length,
    tweened: marker.list.filter((c) => scene.tweens.getTweensOf(c).length > 0).length,
  };
});
if (host) {
  check('map: a host has a cadence', host.tweened > 0, `${host.tweened} of ${host.ranks} rank layers animated`);
}

await page.screenshot({ path: `${OUT}/map.png` });
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no console errors');
if (errors.length) failures += 1;
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
