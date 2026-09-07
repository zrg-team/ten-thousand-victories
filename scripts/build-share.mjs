/**
 * Cuts the card a link to the game unfurls into — the 1200x630 picture Facebook, X, Discord, Slack,
 * iMessage, Zalo and Google all pull out of `index.html`'s `og:image`.
 *
 * A share card is the only part of this game most people will ever see. A link with no card is a
 * grey rectangle with a domain under it; a link with the wrong card is a phone screenshot
 * letterboxed into a landscape slot with the interesting half cropped off. So this draws one on
 * purpose, out of what the front page is already made of: the điệp sheet, the same karst-and-lotus
 * plates `MenuScene.drawDongHoIllustration` composes, the drum, the wordmark set the way
 * MenuScene.renderTitle sets it — doubled pull and all — and two real screens of the game.
 *
 * Rendered in Chromium rather than composed in a library because that is how every other picture in
 * this repo is cut (`build-icon.mjs`, `build-brand.mjs`, `build-store-kit.mjs`): the layout is CSS,
 * the type is the game's own vendored Vietnamese fonts, and what lands in the file is what a
 * browser drew.
 *
 * Written to `public/share/`, and that prefix is load-bearing: `build-sw.mjs` skips it, so the card
 * ships to crawlers without being precached onto the phone of every player who installs the game.
 * Nothing inside the game ever loads it.
 *
 * Output is committed; re-run after changing the wordmark, the screenshots or the copy.
 *
 * Usage: node scripts/build-share.mjs [--out dir] [--check]
 *   --out    where to write (default: public/share)
 *   --check  verify the committed card matches what this script would emit, and fail if not
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

const OUT = resolve(ROOT, argOf('--out', join('public', 'share')));
const CHECK = process.argv.includes('--check');

/** 1.91:1 — the ratio every one of those unfurlers crops to, and the size all of them ask for. */
const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Google Play's feature graphic: the banner that hangs above the icon on the store listing.
 *
 * Cut from this same card rather than drawn separately. `build-store-kit.mjs` used to compose its
 * own — the mark on the left, the name beside it, and a line of type — which said what the game was
 * called and nothing about what it looked like, on the one banner the store gives you. The card
 * already solves that problem for every link anyone pastes; Play's slot is 8px of aspect away from
 * it, so it gets the same picture.
 *
 * Exactly 1024x500 and opaque, which is what the console rejects an upload for.
 */
const PLAY = { w: 1024, h: 500, at: join('apps', 'mobile', 'store', 'android', 'graphics', 'feature-graphic-1024x500.png') };

// ── pigments ────────────────────────────────────────────────────────────────
// The same values as src/ui/ink/palette.ts, by way of scripts/build-icon.mjs. Derive, do not invent.
const DIEP = '#e9dfc2';
const DIEP_HI = '#f3ecd8';
const DIEP_DEEP = '#c9b78c';
const MUC = '#2a2118';
const SON = '#b33a26';
const HOE = '#c08a2e';
/** The under-impression of the wordmark, from MenuScene.renderTitle — ink, not a grey shadow. */
const PULL = '#301509';

const url = (relative) => pathToFileURL(join(ROOT, relative)).href;

/**
 * The two screens on the card, and why these two.
 *
 * A card has room for two phones before the second stops being readable at the ~500px-wide
 * thumbnail X and Discord actually render. So: the map, because it is the thing nobody expects a
 * phone game to look like, and a battle, because it answers "but what do you *do*". Both are the
 * committed README shots, so the card cannot drift from what the README claims — one screenshot
 * pass updates both.
 */
const SHOTS = [
  { file: 'docs/readme/ascent-map.webp', alt: 'the realm mid-run' },
  { file: 'docs/readme/battle.webp', alt: 'a battle' },
];

/**
 * The vendored faces, declared against `file://` so the render never touches the network — the
 * Vietnamese subset, because every word on this card that matters carries a mark.
 */
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

  /* The sheet, not a flat fill. Điệp is shell ground on paper and it is never one value across a
     span this wide — two very quiet washes, warm where the wordmark sits and deepening into the
     far corner, are the difference between paper and a swatch. */
  .sheet {
    position: absolute; inset: 0;
    background:
      radial-gradient(120% 90% at 12% 0%, ${DIEP_HI} 0%, rgba(243,236,216,0) 62%),
      radial-gradient(90% 120% at 100% 100%, ${DIEP_DEEP}55 0%, rgba(201,183,140,0) 58%),
      ${DIEP};
  }

  /* The landscape: the same three plates MenuScene stacks, at the same alphas. It is a ground here
     rather than the subject — held to the right, faded out westward before it reaches the wordmark,
     and cropped to its horizon so the card gets the karst and the paddies without the empty sky. */
  .land {
    position: absolute;
    right: -60px; bottom: -74px;
    width: 900px; height: 600px;
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 34%, #000 100%);
    mask-image: linear-gradient(90deg, transparent 0%, #000 34%, #000 100%);
    opacity: 0.62;
  }
  .land img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .land .ground    { opacity: 0.95; }
  .land .mountains { opacity: 0.86; }
  .land .lotus     { opacity: 0.98; }

  .plate { position: absolute; inset: 0; padding: 62px 64px; display: flex; }

  .word { width: 520px; display: flex; flex-direction: column; justify-content: center; }

  .seal { width: 88px; height: 88px; margin-bottom: 22px; }

  /* MenuScene.renderTitle, in CSS: the block is device, name, gloss, rule — spaced as one mark
     rather than four things that happen to be stacked. 'text-shadow' is the woodblock's doubled
     pull, offset down-right in the ink's own colour family, not a grey drop shadow. */
  .name {
    font-family: 'Source Serif 4', Georgia, serif;
    font-weight: 700;
    font-size: 74px;
    letter-spacing: 3px;
    line-height: 1.06;
    /* One line, always. The name is the mark; broken across two it is a paragraph. */
    white-space: nowrap;
    text-shadow: 3px 4px 0 ${PULL};
  }

  .rule {
    width: 330px; height: 2px; background: ${HOE}; opacity: 0.88; margin: 20px 0 14px;
    /* A 2px child of a column flexbox is shrunk to nothing the moment the column is tight. */
    flex: none;
  }

  .gloss {
    font-family: 'Source Serif 4', Georgia, serif;
    font-weight: 700;
    font-size: 21px;
    letter-spacing: 5.6px;
    opacity: 0.82;
  }

  .tagline { margin-top: 24px; font-size: 24px; font-weight: 400; max-width: 430px; opacity: 0.9; }

  /* Four things no other game on the shelf can say, not four things this one costs.
     "Free · no ads · offline" is a price list, and every stranger who reads it has already assumed
     all three of a link someone sent them. But "42 provinces" and "endless waves" were barely
     better: a province count is a number any strategy game can print, and a wave counter is the
     shape of every survival game written. Neither says why *this* one.

     What is actually unique is the pair nothing else has together — a country's real history, and
     a woodblock tradition drawn from the village that still prints it — and then the fact that the
     realm runs whether you are watching or not. Set as a seal row rather than a sentence, because
     at thumbnail size a reader gets the shapes even when the words are below the size at which
     they resolve.

     Two rows of two, and a grid rather than a wrapping flex row. A feature is a longer word than
     a price and four of them do not fit across the column, so they have to break somewhere — but
     *where* a flex row breaks is decided by the measured width of whatever the labels happen to
     say. At a max-width of 430px these four broke 3 + 1, leaving an orphan; tightened to 285px they
     broke 1 + 2 + 1, because the first two together measure 287px and missed by two. A number
     tuned that finely is not a layout, it is a coincidence that survives until someone edits a
     word. Two explicit columns cannot break anywhere else.

     The max-content columns, and justify-items: start, keep each stamp the width of its own
     text: a stamp stretched to fill its column is a button, and these are seals. */
  .stamps {
    display: grid;
    grid-template-columns: repeat(2, max-content);
    justify-items: start;
    gap: 9px;
    margin-top: 26px;
  }
  .stamps span {
    font-size: 13.5px; font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase;
    padding: 6px 11px; border: 1.5px solid ${MUC}44; border-radius: 3px; color: ${MUC}; opacity: 0.86;
    background: ${DIEP_HI}88;
  }
  .stamps span.son { border-color: ${SON}77; color: ${SON}; }

  /* The phones. Rotated a few degrees apart because two upright rectangles side by side read as a
     comparison table, and tilted ones read as two things lying on the same sheet. */
  .shots { position: absolute; right: 40px; top: 0; height: 100%; width: 540px; }
  .shot {
    position: absolute;
    border-radius: 20px;
    overflow: hidden;
    background: ${DIEP};
    box-shadow: 0 18px 40px ${MUC}3d, 0 2px 0 ${MUC}1a;
    outline: 2px solid ${MUC}2e;
    outline-offset: -2px;
  }
  .shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .shot.a { width: 240px; height: 520px; left: 30px; top: 56px; transform: rotate(-5.5deg); }
  .shot.b { width: 255px; height: 552px; left: 262px; top: 36px; transform: rotate(4.5deg); }
</style>

<div class="sheet"></div>

<div class="land">
  <img class="ground"    src="${url('public/art/menu-layer-ground-v6.png')}">
  <img class="mountains" src="${url('public/art/menu-layer-mountains-v3.png')}">
  <img class="lotus"     src="${url('public/art/menu-layer-lotus-v2.png')}">
</div>

<div class="plate">
  <div class="word">
    <img class="seal" src="${url('public/app-emblem.png')}">
    <div class="name">VẠN THẮNG</div>
    <div class="rule"></div>
    <div class="gloss">TEN THOUSAND VICTORIES</div>
    <div class="tagline">Vietnamese history, played one-handed on a phone.</div>
    <div class="stamps">
      <span class="son">Đông Hồ ink</span>
      <span>Vietnamese history</span>
      <span>Real-time realm</span>
      <span>Roguelite waves</span>
    </div>
  </div>
</div>

<div class="shots">
  <div class="shot a"><img src="${url(SHOTS[0].file)}" alt="${SHOTS[0].alt}"></div>
  <div class="shot b"><img src="${url(SHOTS[1].file)}" alt="${SHOTS[1].alt}"></div>
</div>
`;

/**
 * JPEG, not PNG.
 *
 * The card is linework over photographic-weight woodblock plates: as a PNG it is close to a
 * megabyte, and WhatsApp declines to unfurl a card much past 300 kB while every other crawler
 * re-fetches it on a cold cache. At q92 this lands near a sixth of that with nothing visible on the
 * type, which is the only part that would show an artefact.
 */
const cut = async () => {
  const browser = await chromium.launch();
  /**
   * Written to disk and navigated to, rather than handed to `setContent`.
   *
   * A page set that way has the origin `about:blank`, and Chromium will not let `about:blank` load
   * a `file://` subresource. The faces still arrive — a font is fetched by the style system rather
   * than by the document — so the first cut of this card came out correctly typeset with a
   * broken-image box where every plate, screen and seal should have been. Written inside the repo
   * and navigated to, the document and its art share one origin.
   */
  const scratch = join(ROOT, '.share-card.html');
  writeFileSync(scratch, html, 'utf8');
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 2,
    });
    await page.goto(pathToFileURL(scratch).href, { waitUntil: 'load' });
    // `load` fires on the document, not on a webfont — and a Vietnamese line set in the fallback
    // and never re-set is a card that ships in Georgia about one run in three.
    await page.evaluate(() => document.fonts.ready);

    /**
     * Both cuts come off one render, at 2x, and are resampled down in the page.
     *
     * The card and Play's feature graphic are the same picture at two sizes, so drawing it twice
     * would be two chances for them to disagree. Rendering once at double scale and resampling
     * also beats rendering each at its own size: the wordmark is a serif with a hand-cut doubled
     * pull behind it, and Chromium's own downsample of a 2x raster keeps that edge where a 1x
     * layout pass thins it.
     */
    /**
     * Both cuts come off one render, at 2x, and are resampled by loading that raster back into a
     * page at the target size.
     *
     * One render, because the card and Play's feature graphic are the same picture at two sizes and
     * drawing it twice is two chances for them to disagree. At 2x, because the wordmark is a serif
     * with a hand-cut doubled pull behind it and a downsampled 2x raster holds that edge where a 1x
     * layout pass thins it.
     *
     * Resampled through an `<img>` and screenshotted rather than through a canvas, and that is the
     * non-obvious half: `canvas.toDataURL('image/png')` always writes RGBA, and Play rejects a
     * feature graphic that carries an alpha channel. A page screenshot of an opaque page is a
     * 24-bit PNG, which is what the console wants and what `assertPlay` below insists on.
     */
    const master = await page.screenshot({ type: 'png' });

    const resample = async (w, h, options) => {
      const sheet = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      try {
        await sheet.setContent(
          `<style>html,body{margin:0;padding:0;background:${DIEP}}`
          + `img{display:block;width:${w}px;height:${h}px;object-fit:cover;object-position:center}</style>`
          + `<img src="data:image/png;base64,${master.toString('base64')}">`,
        );
        await sheet.evaluate(() => new Promise((done) => {
          const image = document.querySelector('img');
          if (image.complete) done(undefined);
          else image.onload = () => done(undefined);
        }));
        return await sheet.screenshot(options);
      } finally {
        await sheet.close();
      }
    };

    return {
      card: await resample(WIDTH, HEIGHT, { type: 'jpeg', quality: 92 }),
      /**
       * Play's slot is 1024x500 — 2.048:1, where the card is 1.91:1. `object-fit: cover` takes the
       * difference off the top and the bottom evenly: the sheet has margin there and nothing that
       * carries meaning, the wordmark starts a third of the way down, and the seal row ends well
       * above the lower crop, so both survive whole. Cropping the sides instead would cost either
       * the wordmark or a phone.
       */
      play: await resample(PLAY.w, PLAY.h, { type: 'png' }),
    };
  } finally {
    rmSync(scratch, { force: true });
    await browser.close();
  }
};

const { card, play } = await cut();

mkdirSync(OUT, { recursive: true });
const at = join(OUT, 'og-card.jpg');
const playAt = join(ROOT, PLAY.at);

/** Refuses to ship the feature graphic at the wrong size — Play rejects that only after upload. */
const assertPlay = (buffer) => {
  const w = buffer.readUInt32BE(16);
  const h = buffer.readUInt32BE(20);
  const hasAlpha = buffer[25] === 6 || buffer[25] === 4;
  if (w !== PLAY.w || h !== PLAY.h) throw new Error(`feature graphic is ${w}x${h}, expected ${PLAY.w}x${PLAY.h}`);
  if (hasAlpha) throw new Error('feature graphic has an alpha channel; Play wants it opaque');
};
assertPlay(play);

const outputs = [
  [at, card, `${WIDTH}x${HEIGHT}`],
  [playAt, play, `${PLAY.w}x${PLAY.h}`],
];

if (CHECK) {
  const stale = outputs.filter(([file, want]) => !existsSync(file) || Buffer.compare(readFileSync(file), want) !== 0);
  if (stale.length) {
    for (const [file] of stale) console.error(`build-share: ${file.replace(ROOT, '.')} is stale.`);
    console.error('build-share: run `yarn share`.');
    process.exit(1);
  }
  console.log('build-share: card and feature graphic match.');
} else {
  for (const [file, buffer, size] of outputs) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, buffer);
    console.log(`build-share: ${file} — ${size}, ${(buffer.length / 1024).toFixed(0)} kB`);
  }
}
