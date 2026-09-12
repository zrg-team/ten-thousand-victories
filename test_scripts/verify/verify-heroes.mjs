// The champion roster, end to end: the deck's shape, the opening's variety, the portrait
// wardrobe, and the bio layer. Every failure this guards against compiles perfectly — a king
// whose face never changes, a founder card that opens on the same three names, a champion with
// no bio — so none of it shows up in `tsc`.
//
// Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-heroes.mjs
import { chromium } from 'playwright';
const URL = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
const faceRequests = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
page.on('request', (request) => {
  const path = new globalThis.URL(request.url()).pathname;
  if (/^\/faces(?:-dongho-v\d+)?\//.test(path)) faceRequests.push(path.slice(1));
});
await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });

const r = await page.evaluate(async () => {
  // The throne's identity is read off the dynasty store now, so a house crowned by an earlier
  // script would make this run's king somebody else's. Cleared first, deliberately.
  localStorage.removeItem('mandate:dynasty:v1');
  const { heroTemplates, generateKingHero, KINGS, FOUNDER_IDS } = await import('/src/data/heroes.ts');
  const { heroEffect } = await import('/src/i18n/index.ts');
  const { generateHero } = await import('/src/data/heroFactory.ts');
  const { REAL_FIGURES } = await import('/src/data/heroNames.ts');
  const { createAscentGameState } = await import('/src/state/GameState.ts');

  /**
   * Step a fresh run past the ceremonies to its first *card*.
   *
   * Lễ Đăng Quang stands ahead of the mandate once in a house's life, and Gia sản dòng họ stands
   * behind it on every run after the first. Neither carries options — the rite writes the founder
   * into the dynasty store, the inheritance only reports what the house already brought — so both
   * are acknowledged here. This file is about the two opening cards, which are what follow them,
   * and it had been reading the coronation's successor as the mandate ever since the inheritance
   * screen was added between them.
   */
  const pastCeremonies = (st) => {
    for (let guard = 0; guard < 4; guard += 1) {
      const kind = st.pendingAscentPrompt?.kind;
      if (kind !== 'coronation' && kind !== 'inheritance') return;
      resolveAscentPrompt(st, kind === 'coronation' ? 'crowned' : 'seen');
    }
  };
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { neckForHead, resolveHeroLook } = await import('/src/ui/faces/heroLook.ts');
  const { garmentsFor, hairOrnamentFor, headwearFor, womanHairStylesFor } = await import('/src/ui/faces/wardrobe.ts');
  const { renderHeroFace } = await import('/src/ui/FaceRenderer.ts');
  const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
  const { heroBio, heroName, heroDescription } = await import('/src/i18n/index.ts');

  const known = new Set(FACE_PART_DEFS.map((p) => p.key));
  const out = { deck: heroTemplates.length, parts: known.size, kings: KINGS.length };

  // ── every part a wardrobe can ask for must exist, or it silently draws nothing ──
  const missing = new Set(), stacks = new Set();
  const sample = [...heroTemplates, ...Array.from({ length: 400 }, (_, i) => generateHero(i * 2654435761))];
  for (const hero of sample) {
    const look = resolveHeroLook(hero);
    for (const part of look.parts) if (!known.has(part.key)) missing.add(part.key);
    stacks.add(look.parts.map((p) => p.key).join(','));
  }
  const eras = ['dinh', 'ly', 'tran', 'le', 'tayson', 'nguyen'];
  const ages = ['young', 'prime', 'elder'];
  const womanStylePools = eras.flatMap((era) => ages.flatMap((age) => [
    ...womanHairStylesFor(era, age, false),
    ...womanHairStylesFor(era, age, true),
  ]));
  for (const style of womanStylePools) {
    for (const part of style.parts) if (!known.has(part)) missing.add(part);
  }
  for (const rank of [0, 1, 2, 3]) {
    for (const placement of ['none', 'crown', 'brush', 'band', 'nape-left', 'nape-right']) {
      for (const part of hairOrnamentFor(rank, placement)) if (part && !known.has(part)) missing.add(part);
    }
  }
  out.missingParts = [...missing];
  out.distinctLooks = stacks.size;
  out.sampleSize = sample.length;

  // ── anatomy is a contract: every jaw must overlap its coupled neck ──
  // The generated crop includes two transparent design units of padding on each edge. Remove
  // that padding to compare the actual opaque bounds rather than the atlas frames.
  const byKey = new Map(FACE_PART_DEFS.map((part) => [part.key, part]));
  const headKeys = FACE_PART_DEFS.map((part) => part.key).filter((key) => key.startsWith('head-'));
  const attachment = headKeys.map((head) => {
    const neck = neckForHead(head);
    const headDef = byKey.get(head);
    const neckDef = byKey.get(neck);
    const headBottom = headDef.cy + headDef.h / 2 - 2;
    const neckTop = neckDef.cy - neckDef.h / 2 + 2;
    return { head, neck, overlap: Number((headBottom - neckTop).toFixed(2)) };
  });
  out.headNeck = {
    pairs: attachment,
    minOverlap: Math.min(...attachment.map((pair) => pair.overlap)),
    detached: attachment.filter((pair) => pair.overlap <= 0).map((pair) => pair.head),
    slimHeadsUseSlimNecks: ['head-narrow', 'head-soft', 'head-heart', 'head-tapered', 'head-fine', 'head-slim', 'head-long']
      .every((head) => neckForHead(head) === 'neck-slim'),
    broadHeadsUseBroadNecks: ['head-broad', 'head-square', 'head-angular', 'head-wide', 'head-full', 'head-blunt', 'head-stern']
      .every((head) => neckForHead(head) === 'neck-broad'),
  };

  // ── the runtime library is one atlas and each visible hero is one baked image ──
  const menu = window.__phaserGame.scene.getScene('MenuScene');
  const portrait = renderHeroFace(menu, heroTemplates[0], 0, 0, 0.5);
  out.runtimePortraitChildren = portrait.list.length;
  const { getHeroFaceArtPackId, HERO_FACE_ART_PACKS } = await import('/src/ui/faces/artPack.ts');
  out.artPack = HERO_FACE_ART_PACKS[getHeroFaceArtPackId()];
  out.atlasFrames = menu.textures.get(out.artPack.texture).frameTotal - 1; // omit __BASE
  portrait.destroy(true);

  // ── era signals must not leak later hats and insignia backward in time ──
  const first = (items) => items[0];
  const keys = (parts) => parts.map((part) => part.key);
  const lyCommonHats = headwearFor('ly', 'agent', false, 0);
  const tranMinisterHats = headwearFor('tran', 'minister', false, 3);
  const lyCourt = keys(garmentsFor('ly', false, false, 'minister', 3, first));
  const tranCourt = keys(garmentsFor('tran', false, false, 'minister', 3, first));
  const leCourt = keys(garmentsFor('le', false, false, 'minister', 3, first));
  const lyWomanStyles = womanHairStylesFor('ly', 'young', false);
  const tranWomanStyles = womanHairStylesFor('tran', 'prime', false);
  const leWomanStyles = womanHairStylesFor('le', 'prime', false);
  const nguyenWomanStyles = womanHairStylesFor('nguyen', 'prime', false);
  const styleHas = (styles, key) => styles.some((style) => style.parts.includes(key));
  const styleParts = womanStylePools.flatMap((style) => style.parts);
  out.historicalWardrobe = {
    lyAvoidsOpenCrownNguyenWrap: lyCommonHats.every((hat) => !hat.startsWith('hat-khanvan')),
    tranUsesDinhTu: tranMinisterHats.some((hat) => hat.startsWith('hat-dinhtu')),
    tranAvoidsLyPhocDau: tranMinisterHats.every((hat) => !hat.startsWith('hat-phocdau')),
    preLeAvoidsRankBadges: [...lyCourt, ...tranCourt].every((key) => !key.startsWith('badge-')),
    leCarriesRankBadge: leCourt.some((key) => key.startsWith('badge-')),
    lyWomenOfferArtifactFanAndSideLoops: styleHas(lyWomanStyles, 'bun-fan-high')
      && styleHas(lyWomanStyles, 'bun-side-loops'),
    tranWomenWeightCrownBrushAndAvoidLongFall: tranWomanStyles.filter((style) => style.parts.includes('bun-tran-brush')).length >= 2
      && tranWomanStyles.every((style) => !style.parts.includes('hair-woman-loose')),
    leWomenOfferShortAndLooseHair: styleHas(leWomanStyles, 'hair-woman-short')
      && styleHas(leWomanStyles, 'hair-woman-loose'),
    nguyenWomenOfferWrappedAndNapeHair: styleHas(nguyenWomanStyles, 'hair-woman-wrapped')
      && nguyenWomanStyles.some((style) => style.parts.some((part) => part.startsWith('bun-nape-'))),
    womenAvoidLegacyCurtainAndRandomBunParts: styleParts.every((part) => !/^hair-(long|braid|tail)|^bun-(high|low|double|coil|wide|wrapped|tall-fore)$/.test(part)),
    napePinsStayOnTheirBunSide: womanStylePools.every((style) =>
      (!style.parts.includes('bun-nape-left') || style.ornament === 'nape-left')
      && (!style.parts.includes('bun-nape-right') || style.ornament === 'nape-right')),
    coveredHairNeverProtrudes: eras.every((era) => ages.every((age) =>
      womanHairStylesFor(era, age, true).every((style) => style.parts.length === 1 && style.ornament === 'none'))),
  };

  // ── the throne is the player: never a person out of the record ──
  const king = generateKingHero();
  const historical = new Set([...REAL_FIGURES.map((f) => f.name), ...KINGS.map((k) => k.name)]);
  out.kingName = king.name;
  out.kingIsAnonymous = !historical.has(king.name) && king.id === 'king';
  out.kingEffectTranslates = !heroEffect(king).startsWith('heroes.');

  // ── every champion has a name, an effect, a description and a bio in the active language ──
  const blank = heroTemplates.filter((h) =>
    !heroName(h) || !heroEffect(h) || !heroDescription(h) || !heroBio(h)
    || heroBio(h).startsWith('heroes.') || heroName(h).startsWith('heroes.'));
  out.blankText = blank.map((h) => h.id);

  // ── names must read as names, not as offices ──
  // Only whole title words count. `Thái` alone is a real family name (Thái Tuyết Vy is a
  // person); `Thái Sư` and `Thái Úy` are offices. Matching the bare syllable flagged the one
  // and missed nothing the other did not already catch.
  const OFFICE = /^(Người |Nữ |Bà |Ông |Quan |Thầy |Lính |Dân |Cô |Chú |Thợ |Lái |Xã |Kẻ |Tướng Quân|Đô Đốc|Thái Sư|Thái Úy|Thái Y|Trấn Thủ|Huyện |An Phủ|Hành Nhân|Chánh Sứ|Mật Thám|Tuần |Kỵ |Đinh Trưởng|Thủy Thủ|Đại Tướng|Sử Gia|Sứ Giả|Hàn Lâm|Tế Tửu|Thị Lang|Thiền Sư|Đốc |Quản |Trấn )/;
  const HISTORICAL = new Set(REAL_FIGURES.map((f) => f.name));
  out.officeNamed = heroTemplates.filter((h) => OFFICE.test(h.name) && !HISTORICAL.has(h.name)).map((h) => h.name);

  // ── the opening is two cards: a ruler, then a founder ──
  const trios = new Set(); let dupRole = 0, dupRank = 0;
  const rulerSets = new Set(); let opensOnRuler = 0, chainsToFounder = 0, seated = 0;
  for (let i = 0; i < 60; i += 1) {
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    pastCeremonies(st);
    const first = st.pendingAscentPrompt;
    if (first?.kind === 'mandate') opensOnRuler += 1;
    rulerSets.add((first?.options ?? []).join('|'));
    // Answering the mandate must bring the founding up behind it, and the boon must land.
    const before = { ...st.resourceRates };
    resolveAscentPrompt(st, first.options[0]);
    const moved = Object.keys(before).some((k) => st.resourceRates[k] !== before[k])
      || Object.keys(st.ascent.cardStacks).length > 0;
    if (st.pendingAscentPrompt?.kind === 'founder' && moved) chainsToFounder += 1;
    const ids = st.pendingAscentPrompt?.options ?? [];
    // Rulers carry an arrival and must never be offered as founders.
    if (ids.every((id) => !st.heroDeck.find((h) => h.id === id)?.arrival)) seated += 1;
    trios.add(ids.join('|'));
    const roles = new Set(), ranks = new Set();
    for (const id of ids) {
      const h = st.heroDeck.find((c) => c.id === id); if (!h) continue;
      roles.add(h.type); ranks.add(h.rarity);
    }
    if (roles.size < ids.length) dupRole += 1;
    if (ranks.size < ids.length) dupRank += 1;
  }
  out.distinctTrios = trios.size; out.dupRole = dupRole; out.dupRank = dupRank;
  out.opensOnRuler = opensOnRuler; out.distinctRulerSets = rulerSets.size;
  out.chainsToFounder = chainsToFounder; out.rulerSeated = seated;

  // ── the generator must never mint someone the authored roster already names ──
  const authored = new Set(heroTemplates.map((h) => h.name));
  const clashes = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const h = generateHero(i * 7919 + 13);
    if (authored.has(h.name)) clashes.add(h.name);
  }
  out.duplicatePeople = [...clashes];
  // The founding gift: each office must change the board, and differently.
  const gifts = {};
  for (let i = 0; i < 60; i += 1) {
    const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
    const before = { lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
      gold: st.resources.gold, humans: st.resources.humans, influence: st.court.influence,
      host: Object.values(st.armies.find((a) => a.id === 'ascent-royal-host')?.units ?? {}).reduce((a, b) => a + b, 0) };
    out.startingLands = before.lands;
    // The mandate comes first now; answer it to reach the founding.
    pastCeremonies(st);
    resolveAscentPrompt(st, st.pendingAscentPrompt.options[0]);
    const opts = st.pendingAscentPrompt.options;
    const opt = opts[i % opts.length];
    const champion = st.heroDeck.find((h) => h.id === opt);
    resolveAscentPrompt(st, opt);
    const after = { lands: st.lands.filter((l) => l.ownerId === 'dai-viet').length,
      gold: st.resources.gold, humans: st.resources.humans, influence: st.court.influence,
      host: Object.values(st.armies.find((a) => a.id === 'ascent-royal-host')?.units ?? {}).reduce((a, b) => a + b, 0) };
    const moved = after.lands > before.lands || after.gold > before.gold
      || after.humans > before.humans || after.influence > before.influence || after.host > before.host;
    (gifts[champion.type] ??= { n: 0, moved: 0 }).n += 1;
    if (moved) gifts[champion.type].moved += 1;
  }
  out.gifts = gifts;
  out.realFigures = REAL_FIGURES.length;
  out.founderIds = [...FOUNDER_IDS];
  out.foundersExist = FOUNDER_IDS.every((id) => heroTemplates.some((h) => h.id === id));
  return out;
});
r.faceRequests = [...new Set(faceRequests)];

const checks = {
  'the deck is a hundred champions deep': r.deck >= 100,
  'the wardrobe ships every part it asks for': r.missingParts.length === 0,
  'portraits are not one face in many hats': r.distinctLooks > r.sampleSize * 0.9,
  'the runtime loads one face atlas, not hundreds of SVGs': r.faceRequests.length === 2
    && r.faceRequests.includes(r.artPack.image) && r.faceRequests.includes(r.artPack.atlas),
  'every authored part has one atlas frame': r.atlasFrames === r.parts,
  'a rendered portrait is one baked image': r.runtimePortraitChildren === 1,
  'every head overlaps a neck matched to its jaw': r.headNeck.detached.length === 0
    && r.headNeck.minOverlap >= 3
    && r.headNeck.slimHeadsUseSlimNecks
    && r.headNeck.broadHeadsUseBroadNecks,
  'wardrobe chronology holds': Object.values(r.historicalWardrobe).every(Boolean),
  'the king is the player, never a historical person': r.kingIsAnonymous,
  "the king's line is a real string, not a key": r.kingEffectTranslates,
  'every champion has name, effect, description and bio': r.blankText.length === 0,
  'names read as names, not as job titles': r.officeNamed.length === 0,
  'the run opens on the mandate card': r.opensOnRuler === 60,
  'the mandate lands, then the founding follows': r.chainsToFounder === 60,
  'the advantages offered are not a fixed script': r.distinctRulerSets >= 20,
  'no ruler is ever offered as a founder': r.rulerSeated === 60,
  'the founder card is not a fixed script': r.distinctTrios >= 50,
  'the founder card offers three distinct roles': r.dupRole === 0,
  'the founder card offers three distinct ranks': r.dupRank === 0,
  'no run can meet the same historical person twice': r.duplicatePeople.length === 0,
  'the realm opens on one province': r.startingLands === 1,
  'every office brings something to the founding': Object.keys(r.gifts).length === 4
    && Object.values(r.gifts).every((g) => g.moved === g.n),
  'the record is deep enough to matter': r.realFigures >= 100,
  'empire-mode founders all exist': r.foundersExist,
  'no console errors': errors.length === 0,
};
console.log(JSON.stringify(r, null, 2));
console.log('=== CHECKS ===');
let pass = true;
for (const [label, ok] of Object.entries(checks)) { if (!ok) pass = false; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`); }
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
console.log(pass ? 'PASS: the champion roster holds' : 'CHECK: some expectations unmet');
await browser.close();
process.exit(pass ? 0 : 1);
