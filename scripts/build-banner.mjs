/**
 * Cuts the wide banner at the top of the README: the wordmark over five screens of the game, fanned
 * out the way a hand of cards is held.
 *
 * The banner used to be four screenshots laid side by side on transparent gutters by
 * `test_scripts/shot/shot-readme.mjs` — a filmstrip, with nothing saying what the game was called
 * and no reason for the four to be next to each other. This composes a sheet instead, out of the
 * same parts the share card is composed from: the điệp ground, the karst-and-lotus plates
 * `MenuScene.drawDongHoIllustration` stacks, and the wordmark set the way `MenuScene.renderTitle`
 * sets it, doubled pull and all.
 *
 * Composed here rather than in the shooter because the two jobs are different: `shot-readme.mjs`
 * drives the live game and photographs screens, and this arranges committed pictures on paper. It
 * takes no dev server and no game — only the webp files already in `docs/readme/`. Same split as
 * `build-share.mjs`, which cuts the og:image out of two of those same shots.
 *
 * Output is committed; re-run after a screenshot pass or a change to the wordmark or the fan.
 *
 * Usage: node scripts/build-banner.mjs [--out file] [--check]
 *   --out    where to write (default: docs/readme/banner.webp)
 *   --check  verify the committed banner matches what this script would emit, and fail if not
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const argOf = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : fallback;
};

const OUT = resolve(ROOT, argOf('--out', join('docs', 'readme', 'banner.webp')));
const CHECK = process.argv.includes('--check');

/**
 * 2:1. Wide enough for five cards to fan without the outer two leaving the sheet, and short enough
 * that GitHub renders it at full width without pushing the first heading off a laptop screen.
 */
const WIDTH = 1600;
const HEIGHT = 800;

// ── pigments ────────────────────────────────────────────────────────────────
// The same values as src/ui/ink/palette.ts, by way of scripts/build-share.mjs. Derive, do not invent.
const DIEP = '#e9dfc2';
const DIEP_HI = '#f3ecd8';
const DIEP_DEEP = '#c9b78c';
const MUC = '#2a2118';
const HOE = '#c08a2e';
/** The under-impression of the wordmark, from MenuScene.renderTitle — ink, not a grey shadow. */
const PULL = '#301509';

const url = (relative) => pathToFileURL(join(ROOT, relative)).href;

/**
 * The five screens, in the order they are held.
 *
 * One per thing the game is, rather than five of the prettiest: the country you rule, the court you
 * pay, the fight you watch, the cards a level-up deals, and the Chronicle that remembers it. The
 * map is the centre card because it is the one nobody expects a phone game to look like, and the
 * centre card is the only one a reader sees whole.
 */
const CARDS = [
  { file: 'docs/readme/power-draft.webp', alt: 'a power draft' },
  { file: 'docs/readme/founder.webp', alt: "a founder's court" },
  { file: 'docs/readme/ascent-map.webp', alt: 'the realm mid-run' },
  { file: 'docs/readme/battle.webp', alt: 'a battle' },
  { file: 'docs/readme/chronicle.webp', alt: 'the Chronicle' },
];

const missing = CARDS.filter((c) => !existsSync(join(ROOT, c.file)));
if (missing.length) {
  console.error(`build-banner: missing ${missing.map((m) => m.file).join(', ')} — run the README shot pass first.`);
  process.exit(1);
}

/**
 * The fan, as one number per card rather than five hand-placed rectangles.
 *
 * `spread` is how far from the middle the card sits, in card-steps; everything else is derived from
 * it, so the arrangement stays an arc when the card size changes. Rotation grows with the distance
 * from the middle and the drop grows with its square — a hand of cards pivots about a point below
 * the sheet, which is what makes the outer cards fall away faster than they lean.
 */
const CARD_W = 244;
/**
 * Shorter than the shots' own 2.16:1, and cropped rather than squashed — the img is `object-fit:
 * cover` anchored to the top, so what a card loses is the action bar at the foot of the screen and
 * never the header.
 *
 * The height is what has to give. Five cards at the sources' full ratio stand 528px tall, and with
 * the arc under them the outer two ran off the bottom of the sheet: cards clipped by the edge read
 * as a picture that did not fit, not as a hand of cards. Everything below is sized so the lowest
 * card lands inside the sheet with a margin — check that again if the fan's numbers move.
 */
const CARD_H = 462;
const STEP = 222;   // horizontal distance between neighbours; less than CARD_W, so they overlap
const LEAN = 5.0;   // degrees per step
const DROP = 12;    // px per step², the arc

const fan = CARDS.map((card, i) => {
  const spread = i - (CARDS.length - 1) / 2;
  return {
    ...card,
    x: Math.round(spread * STEP),
    y: Math.round(spread * spread * DROP),
    rotate: (spread * LEAN).toFixed(2),
    // The middle card sits on top and the stack falls away to both edges, the way a held hand
    // overlaps. Painted in DOM order the fifth card would cover the fourth and the fan would read
    // as a stack shuffled the wrong way.
    z: CARDS.length - Math.abs(spread) * 2,
  };
});

const face = (family, weight, file) => `
  @font-face {
    font-family: ${JSON.stringify(family)};
    font-style: normal;
    font-weight: ${weight};
    src: url(${JSON.stringify(url(`public/fonts/${file}`))}) format('woff2');
  }`;

const html = `
<style>
  ${face('Source Serif 4', 700, 'SourceSerif4-700-vietnamese.woff2')}
  ${face('Be Vietnam Pro', 400, 'BeVietnamPro-400-vietnamese.woff2')}
  ${face('Be Vietnam Pro', 600, 'BeVietnamPro-600-vietnamese.woff2')}

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    position: relative;
    background: ${DIEP};
    font-family: 'Be Vietnam Pro', system-ui, sans-serif;
    color: ${MUC};
    /* Vietnamese stacks two marks above the letter; anything tighter clips them. */
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }

  /* The sheet, not a flat fill — two very quiet washes, warm at the top where the wordmark sits
     and deepening into the lower corners behind the fan. */
  .sheet {
    position: absolute; inset: 0;
    background:
      radial-gradient(90% 70% at 50% 0%, ${DIEP_HI} 0%, rgba(243,236,216,0) 66%),
      radial-gradient(70% 90% at 0% 100%, ${DIEP_DEEP}44 0%, rgba(201,183,140,0) 60%),
      radial-gradient(70% 90% at 100% 100%, ${DIEP_DEEP}44 0%, rgba(201,183,140,0) 60%),
      ${DIEP};
  }

  /* The landscape: the same three plates MenuScene stacks, at the same alphas. A ground rather
     than the subject — held low and faded out upward before it reaches the wordmark, so the karst
     sits behind the fan instead of competing with it. */
  .land {
    position: absolute;
    left: 0; right: 0; bottom: -90px;
    height: 620px;
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 42%, #000 100%);
    mask-image: linear-gradient(180deg, transparent 0%, #000 42%, #000 100%);
    opacity: 0.4;
  }
  .land img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .land .ground    { opacity: 0.95; }
  .land .mountains { opacity: 0.86; }
  .land .lotus     { opacity: 0.9; }

  /* ── the head ─────────────────────────────────────────────────────────────
     MenuScene.renderTitle, in CSS: seal, name, rule, gloss, spaced as one mark rather than four
     things that happen to be stacked. Centred here rather than held left, because the fan below
     is symmetrical and a left-aligned title over a centred fan reads as a mistake. */
  .head { position: absolute; top: 44px; left: 0; right: 0; text-align: center; }

  .seal { width: 74px; height: 74px; margin-bottom: 10px; }

  .name {
    font-family: 'Source Serif 4', Georgia, serif;
    font-weight: 700;
    font-size: 68px;
    letter-spacing: 4px;
    line-height: 1.06;
    /* One line, always. The name is the mark; broken across two it is a paragraph. */
    white-space: nowrap;
    /* The woodblock's doubled pull, offset down-right in the ink's own colour family. */
    text-shadow: 3px 4px 0 ${PULL};
  }

  .rule {
    width: 300px; height: 2px; background: ${HOE}; opacity: 0.88;
    margin: 16px auto 12px;
  }

  .gloss {
    font-family: 'Source Serif 4', Georgia, serif;
    font-weight: 700;
    font-size: 18px;
    letter-spacing: 5.2px;
    opacity: 0.8;
  }

  /* ── the fan ──────────────────────────────────────────────────────────────
     Each card is placed from the middle of the sheet and then moved by its own offsets, so the
     arrangement is the arithmetic above rather than five magic numbers. transform-origin sits
     below the card: cards in a hand pivot about the fingers holding them, not about their own
     middles, and rotating about the centre gives five cards leaning at a point in mid-air. */
  .fan { position: absolute; left: 50%; top: 278px; }
  .card {
    position: absolute;
    width: ${CARD_W}px;
    height: ${CARD_H}px;
    margin-left: ${-CARD_W / 2}px;
    border-radius: 18px;
    overflow: hidden;
    background: ${DIEP};
    transform-origin: 50% 150%;
    box-shadow: 0 16px 34px ${MUC}3a, 0 2px 0 ${MUC}18;
    outline: 2px solid ${MUC}2e;
    outline-offset: -2px;
  }
  .card img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
</style>

<div class="sheet"></div>

<div class="land">
  <img class="ground"    src="${url('public/art/menu-layer-ground-v5.png')}">
  <img class="mountains" src="${url('public/art/menu-layer-mountains-v3.png')}">
  <img class="lotus"     src="${url('public/art/menu-layer-lotus-v2.png')}">
</div>

<div class="head">
  <img class="seal" src="${url('public/app-emblem.png')}">
  <div class="name">VẠN THẮNG</div>
  <div class="rule"></div>
  <div class="gloss">TEN THOUSAND VICTORIES</div>
</div>

<div class="fan">
  ${fan.map((c) => `<div class="card" style="
      transform: translate(${c.x}px, ${c.y}px) rotate(${c.rotate}deg);
      z-index: ${c.z};
    "><img src="${url(c.file)}" alt="${c.alt}"></div>`).join('\n  ')}
</div>
`;

/**
 * Written to disk and navigated to, rather than handed to `setContent`.
 *
 * A page set that way has the origin `about:blank`, and Chromium will not let `about:blank` load a
 * `file://` subresource. The faces still arrive — a font is fetched by the style system rather than
 * by the document — so the page comes out correctly typeset with a broken-image box where every
 * plate and screen should have been. Written inside the repo and navigated to, the document and its
 * art share one origin. Same trap `build-share.mjs` records.
 */
const cut = async () => {
  const browser = await chromium.launch();
  const scratch = join(ROOT, '.banner.html');
  writeFileSync(scratch, html, 'utf8');
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(scratch).href, { waitUntil: 'load' });
    // `load` fires on the document, not on a webfont — and a Vietnamese line set in the fallback
    // and never re-set is a banner that ships in Georgia about one run in three.
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });

    /**
     * WebP, because that is what every other picture in `docs/readme/` is, and re-encoded through a
     * canvas because this machine has no image tools — the same trick `shot-readme.mjs` uses to get
     * WebP out of Playwright, which only writes PNG and JPEG.
     */
    const blank = await browser.newPage();
    await blank.goto('about:blank');
    const dataUrl = await blank.evaluate(async (base64) => {
      const image = await new Promise((ok, fail) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = fail;
        im.src = `data:image/png;base64,${base64}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', 0.86);
    }, png.toString('base64'));
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  } finally {
    rmSync(scratch, { force: true });
    await browser.close();
  }
};

const banner = await cut();

mkdirSync(dirname(OUT), { recursive: true });

if (CHECK) {
  const same = existsSync(OUT) && Buffer.compare(readFileSync(OUT), banner) === 0;
  if (!same) {
    console.error('build-banner: docs/readme/banner.webp is stale — run `yarn banner`.');
    process.exit(1);
  }
  console.log('build-banner: banner matches.');
} else {
  writeFileSync(OUT, banner);
  console.log(`build-banner: ${OUT} — ${WIDTH}x${HEIGHT}, ${(banner.length / 1024).toFixed(0)} kB`);
}
