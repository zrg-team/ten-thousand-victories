/**
 * Lays out everything the two store consoles ask for, in two folders you can open and upload from.
 *
 * Neither console has a usable API for the things people actually get stuck on — screenshots on
 * both, and the whole Play listing — so a release always ends with somebody dragging files into a
 * web form. This script makes that the *only* manual part: it cuts every image to the exact size
 * the console demands, writes the listing text out as a document you can copy from field by field,
 * and names the folders after the console screens they belong to.
 *
 *   yarn store:kit
 *   node scripts/build-store-kit.mjs --icons-only  # refresh just the two store icons
 *
 * ## One source, four outputs
 *
 * `apps/mobile/store.metadata.json` is the only file to edit. From it this script writes:
 *
 *   · `apps/mobile/store.config.json`   what `eas metadata:push` uploads to App Store Connect
 *   · `store/ios/metadata.md`           the same fields as a document, for filling by hand
 *   · `store/android/metadata.md`       Play's listing, which has no API at all
 *   · `store/<platform>/screenshots/`   cut to each console's exact required size
 *
 * All four are generated. Editing any of them is work that the next run deletes.
 *
 * Nothing here is a build input — `.easignore` keeps `store/` out of EAS uploads, because tens of
 * megabytes of screenshots have no business on a build machine.
 */
import { chromium } from 'playwright';
import { tagSrgb } from './icons/river-icon-pack.mjs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps', 'mobile', 'store');

const read = (...p) => JSON.parse(readFileSync(join(root, ...p), 'utf8'));
const pkg = read('package.json');
const meta = read('apps', 'mobile', 'store.metadata.json');
const S = meta.shared;

/** The commit count, exactly as `app.config.js` resolves it. One number, three surfaces. */
const build = (() => {
  const at = join(root, 'apps', 'mobile', 'assets', 'web-version.json');
  if (!existsSync(at)) return null;
  const n = Number(JSON.parse(readFileSync(at, 'utf8')).build);
  return Number.isInteger(n) && n > 0 ? n : null;
})();

const version = pkg.version;
const stamp = build ? `${version}-${build}` : version;

// ── pigments, from src/ui/ink/palette.ts by way of scripts/build-icon.mjs ─────────────────────
/**
 * The pigments, copied from `src/ui/ink/palette.ts`. Duplicated rather than imported because this
 * script runs under plain node against a TypeScript source tree — the same reason
 * `scripts/build-icon.mjs` duplicates them. If the palette moves, these move with it.
 *
 * The one hard rule the art direction states: **sỏi son is spent on the player alone.** A store
 * card has no player, so the red appears exactly once, as a seal — which is what that red is for.
 * Everything else on the sheet is paper and soot.
 */
const PIG = {
  diep: '#e9dfc2',
  diepHi: '#f3ecd8',
  diepLo: '#d8c9a4',
  diepDeep: '#c9b78c',
  muc: '#2a2118',
  mucSoft: '#5a4c39',
  mucFaint: '#8c7e67',
  son: '#b33a26',
  shell: '#fbf2df',
  // The screenshot ground. "Vàng cái" is what the palette calls điệp stirred with hòe water; the
  // cards use the full-strength sheet (`hoePale`), grained toward `hoe` and `diepWarm`, so the store
  // paper is the same yellow as the gold card borders it frames rather than a yellow of its own.
  hoe: '#c08a2e',
  hoePale: '#dcbe7e',
  diepWarm: '#e5d5ae',
  nauDark: '#5c3f26',
};

const dir = (...p) => {
  const at = join(out, ...p);
  mkdirSync(at, { recursive: true });
  return at;
};

const written = [];
const note = (path, what) => written.push([String(path).replace(out, 'store'), what]);

/** Refuses to ship an image at the wrong size, which the consoles reject only after an upload. */
const assertPng = (file, width, height, wantAlpha) => {
  const b = readFileSync(file);
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  const hasAlpha = b[25] === 6 || b[25] === 4;
  if (w !== width || h !== height) throw new Error(`${file} is ${w}x${h}, expected ${width}x${height}`);
  if (wantAlpha !== undefined && hasAlpha !== wantAlpha) {
    throw new Error(`${file} ${hasAlpha ? 'has' : 'lacks'} an alpha channel; expected the opposite`);
  }
};

// ── the page ──────────────────────────────────────────────────────────────────────────────────

/**
 * Be Vietnam Pro, inlined.
 *
 * Headless Chromium ships almost no fonts and none carrying Vietnamese diacritics, so a caption
 * reading "Vạn Thắng" renders as tofu unless the face travels with the page. The repository already
 * vendors the subsets for the game itself; the latin cut is declared first and the vietnamese cut
 * last, so the latter wins for the codepoints they both cover.
 */
const fontFace = (family, file, weight) => {
  const src = (subset) =>
    `url(data:font/woff2;base64,${readFileSync(
      join(root, 'public', 'fonts', `${file}-${weight}-${subset}.woff2`),
    ).toString('base64')}) format('woff2')`;
  return `
    @font-face { font-family: '${family}'; font-weight: ${weight}; src: ${src('latin')}; }
    @font-face { font-family: '${family}'; font-weight: ${weight}; src: ${src('latin-ext')};
      unicode-range: U+0100-02BA, U+1E00-1EFF, U+2020-20AB; }
    @font-face { font-family: '${family}'; font-weight: ${weight}; src: ${src('vietnamese')};
      unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0,
        U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB; }`;
};

/**
 * Two faces, two jobs. The headline is Source Serif — the same serif the game sets its own titles
 * in, and the reason a store card reads as a printed thing rather than as an app listing. The
 * kicker above it is Be Vietnam Pro, small and letterspaced, where a sans is doing signage work.
 */
const FONTS = [
  fontFace('BVP', 'BeVietnamPro', 600),
  fontFace('BVP', 'BeVietnamPro', 700),
  fontFace('Serif', 'SourceSerif4', 600),
  fontFace('Serif', 'SourceSerif4', 700),
].join('');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
await page.setContent(
  `<html><head><style>${FONTS}</style></head><body style="margin:0;padding:0"></body></html>`,
);
await page.evaluate(async () => {
  await Promise.all([
    document.fonts.load('700 40px "Serif"'), document.fonts.load('600 40px "Serif"'),
    document.fonts.load('700 40px BVP'), document.fonts.load('600 40px BVP'),
  ]);
  await document.fonts.ready;
});

const dataUri = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`;

/**
 * The paper: flat ground, speckle, and the plate mark a woodblock leaves in the sheet.
 *
 * Injected once as a page script rather than repeated in three closures. Tone lives in the paper
 * and never in the ink — the house rule from the art direction, and why there is no gradient here.
 */
await page.addScriptTag({
  content: `
    /** Deterministic - a card must wobble the same way twice. From ink/stroke.ts. */
    function rng(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /**
     * Diep, by the recipe in ink/paper.ts: shell-coated ground, broad tea-staining so no two areas
     * of the sheet share a tone, laid fibre lying mostly along the sheet, and shell grit - "the
     * thing you only notice on a good screen, and should never be told about".
     *
     * Densities scale off that file's 512px tile, so a 2064px card carries the same incident per
     * unit area rather than the same absolute count.
     */
    function paper(x, w, h, P, seed) {
      const rand = rng(seed);
      const area = (w * h) / (512 * 512);
      const k = Math.min(w, h) / 512;

      x.fillStyle = P.diep;
      x.fillRect(0, 0, w, h);

      for (let i = 0; i < Math.round(16 * area); i += 1) {
        const cx = rand() * w;
        const cy = rand() * h;
        x.globalAlpha = 0.045 + rand() * 0.045;
        x.fillStyle = rand() > 0.45 ? P.diepLo : P.diepHi;
        x.beginPath();
        x.ellipse(cx, cy, (60 + rand() * 160) * k, (50 + rand() * 130) * k, rand() * 3, 0, Math.PI * 2);
        x.fill();
      }

      x.globalAlpha = 0.055;
      x.lineWidth = 0.7 * k;
      for (let i = 0; i < Math.round(900 * area); i += 1) {
        const fx = rand() * w;
        const fy = rand() * h;
        const len = (2 + rand() * 9) * k;
        const ang = (rand() - 0.5) * 0.5;
        x.strokeStyle = rand() > 0.5 ? P.diepDeep : P.diepHi;
        x.beginPath();
        x.moveTo(fx, fy);
        x.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
        x.stroke();
      }

      x.globalAlpha = 0.14;
      x.fillStyle = '#fffbf0';
      const grit = Math.max(1, Math.round(k));
      for (let i = 0; i < Math.round(300 * area); i += 1) x.fillRect(rand() * w, rand() * h, grit, grit);

      x.globalAlpha = 1;
    }

    /** Pushes each node off the true line by a seeded amount. wobblePath, from ink/stroke.ts. */
    function wobble(pts, seed, amp, step) {
      if (amp <= 0) return pts;
      const rand = rng(seed);
      const out = [];
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nodes = Math.max(1, Math.round(len / step));
        const nx = -dy / len, ny = dx / len;
        for (let n = 0; n < nodes; n += 1) {
          const t = n / nodes;
          const push = (rand() - 0.5) * 2 * amp;
          out.push({ x: a.x + dx * t + nx * push, y: a.y + dy * t + ny * push });
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    }

    /**
     * A hand-pulled contour: a soaked, wider underlay pass and then the crisp block on top. Two
     * passes is what stops a vector line from reading as a vector line.
     */
    function inkPath(x, pts, seed, opts) {
      const o = opts || {};
      const width = o.width || 2;
      const colour = o.colour || '#2a2118';
      const p = wobble(o.closed ? pts.concat([pts[0]]) : pts, seed, o.amp || 0, o.step || 40);
      const pass = (w, alpha) => {
        x.save();
        x.strokeStyle = colour;
        x.globalAlpha = alpha;
        x.lineWidth = w;
        x.lineJoin = 'round';
        x.lineCap = 'round';
        x.beginPath();
        x.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i += 1) x.lineTo(p[i].x, p[i].y);
        x.stroke();
        x.restore();
      };
      pass(width * 2.6, 0.14);
      pass(width, 0.88);
    }

    /**
     * Rang cua - the sawtooth register of the Ngoc Lu drum, ported from ink/devices.ts. Two rules
     * with a zigzag between them, drawn in soot rather than filled: it is the commonest geometric
     * register on a drum and the one that still reads at seven pixels tall.
     */
    function sawtooth(x, ox, oy, width, height, colour, alpha) {
      x.save();
      x.lineWidth = Math.max(1, height * 0.09);
      x.strokeStyle = colour;
      x.globalAlpha = alpha;
      x.beginPath();
      x.moveTo(ox, oy); x.lineTo(ox + width, oy);
      x.moveTo(ox, oy + height); x.lineTo(ox + width, oy + height);
      x.stroke();
      const step = height * 1.05;
      x.globalAlpha = alpha * 1.2;
      x.beginPath();
      for (let i = 0; ox + i * step < ox + width - step; i += 1) {
        const px = ox + 1 + i * step;
        x.moveTo(px, oy + height - 0.5);
        x.lineTo(px + step * 0.5, oy + 0.5);
        x.lineTo(px + step, oy + height - 0.5);
      }
      x.stroke();
      x.restore();
    }

    /** The approved river emblem signs every generated store sheet. */
    function seal(x, cx, cy, size, P) {
      x.drawImage(window.appEmblem, cx - size / 2, cy - size / 2, size, size);
    }
  `,
});

// Decode the source once for all feature graphics and screenshot footers.
await page.evaluate(async (src) => {
  window.appEmblem = new Image();
  window.appEmblem.src = src;
  await window.appEmblem.decode();
}, dataUri(join(root, 'apps/mobile/branding/dongho-river-foreground-v7.png'), 'image/png'));

// ── icons ─────────────────────────────────────────────────────────────────────────────────────

/** Redraws a square mark at another size, always emitting 32-bit RGBA (Play asks for it). */
const square = async (source, size, file) => {
  await page.setViewportSize({ width: size, height: size });
  const url = await page.evaluate(async ({ src, size }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png');
  }, { src: dataUri(source, 'image/png'), size });
  writeFileSync(file, tagSrgb(Buffer.from(url.split(',')[1], 'base64')));
};

const iosIconSource = join(root, 'apps', 'mobile', 'assets', 'icon.png');

if (!existsSync(iosIconSource)) {
  console.error('No apps/mobile/assets/icon.png — run `yarn mobile:sync` first.');
  process.exit(1);
}

// Apple: 1024x1024 and **no alpha channel**, the one thing App Store Connect hard-rejects. Copied
// rather than redrawn precisely to keep it that way.
assertPng(iosIconSource, 1024, 1024, false);
const iosIcon = join(dir('ios', 'icon'), 'app-store-icon-1024.png');
copyFileSync(iosIconSource, iosIcon);
note(iosIcon, '1024x1024, no alpha');

const playIcon = join(dir('android', 'icon'), 'play-store-icon-512.png');
// Both stores use the same approved river illustration as the app and web.
await square(iosIconSource, 512, playIcon);
assertPng(playIcon, 512, 512, true);
note(playIcon, '512x512, 32-bit');

if (process.argv.includes('--icons-only')) {
  await browser.close();
  for (const [file, description] of written) console.log(`${file}: ${description}`);
  process.exit(0);
}

/**
 * Play's feature graphic — the banner above the icon on the listing — is cut by `yarn share`, not
 * here.
 *
 * This script used to draw its own: the mark held left, the name beside it in the game's serif, and
 * one line of type. It was a handsome sheet that said what the game is called and nothing about
 * what it looks like, which is a poor way to spend the one banner the store gives you. Play's slot
 * is 8px of aspect away from the og:image card, so `build-share.mjs` now cuts both from one render
 * and this checks the result rather than competing with it.
 *
 * Checked and not regenerated on purpose: a second script writing the same file is how the two
 * would drift, and whichever ran last would win silently.
 */
const feature = join(dir('android', 'graphics'), 'feature-graphic-1024x500.png');
if (!existsSync(feature)) {
  console.error(`No ${feature} — run \`yarn share\`, which cuts it beside the og:image card.`);
  process.exit(1);
}
assertPng(feature, 1024, 500, false);
note(feature, '1024x500, opaque — from `yarn share`');

// ── screenshots ───────────────────────────────────────────────────────────────────────────────

/**
 * Only the largest device in each family is required; both consoles scale those down themselves.
 * The iPad set is not optional here because `app.json` declares `supportsTablet: true`.
 *
 * The sources are frames of the gameplay trailer — a real run photographed at the high tier, 1170
 * wide — kept in `store/gameplay/<lang>/`. The previous kit cut the README shots, fitted them small
 * onto the game's own paper and framed them in paper again: in a store grid that was seven cream
 * rectangles of the same cream, with the game at three quarters of the width. Now the game runs
 * nearly edge to edge on hoè-yellow giấy điệp — the shell-coated paper Đông Hồ prints are pulled
 * on, tinted, so the cream screens stand off it — with a headline large enough to read at
 * thumbnail size.
 */
const SHOTS = [
  ['ios', 'iphone-6.9', 1320, 2868, 'Required. 3-10 images.'],
  ['ios', 'ipad-13', 2064, 2752, 'Required, because app.json sets supportsTablet: true.'],
  ['android', 'phone', 1080, 1920, 'Required. At least 2, up to 8.'],
  // Play states 16:9 or 9:16 for both tablet slots and rejects 16:10, which is what a laptop
  // aspect looks like and why 1920x1200 is the wrong guess to make here.
  ['android', 'tablet-7', 1280, 720, 'Required. 16:9, each side 320-3840 px.'],
  ['android', 'tablet-10', 1920, 1080, 'Required. 16:9, each side 1080-7680 px.'],
];

const shotSource = join(root, 'apps', 'mobile', 'store', 'gameplay');

/**
 * English fills the console's default listing; Vietnamese is its own locale, added by hand in both
 * consoles, so its screenshots sit in a `-vi` twin of every folder rather than mixed into it.
 */
const LANGS = [
  ['en', ''],
  ['vi', '-vi'],
];

/**
 * The sheet every card is drawn on, and the headline under which it states its one idea — defined
 * once on the page so the gameplay cards and the closing card share them exactly.
 *
 * Giấy điệp nhuộm hoè: dó paper brushed with crushed-shell and rice paste, the paste tinted with
 * hoè-flower yellow the way Đông Hồ printers tint it. What makes it điệp and not a flat yellow is
 * drawn in the order the sheet is made: dye mottling, the long parallel "ganh" a pine-needle broom
 * leaves along its stroke, bark fibres, then the shell catching the light. Seeded, so the same card
 * comes out byte-identical on every run; scaled to the canvas so a 1280x720 tablet card carries the
 * same grain as a 2868-tall phone card.
 */
await page.evaluate(() => {
  window.paintSheet = (x, w, h, P) => {
    let seed = 20260914;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const k = Math.min(w, h) / 1080;
    x.fillStyle = P.hoePale;
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const cx = rand() * w, cy = rand() * h, r = (120 + rand() * 420) * k * 1.4;
      const tone = rand() < 0.5 ? P.hoe : P.diepWarm;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, tone + '33');
      g.addColorStop(1, tone + '00');
      x.fillStyle = g;
      x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    for (let band = 0; band < 26; band++) {
      const y0 = rand() * h, strokes = 6 + ((rand() * 10) | 0);
      for (let s = 0; s < strokes; s++) {
        const yy = y0 + s * (2 + rand() * 3) * k;
        x.beginPath();
        x.moveTo(-20, yy);
        for (let xx = 0; xx <= w + 40; xx += 60 * k) {
          x.lineTo(xx, yy + Math.sin(xx / (170 * k) + band) * 6 * k - xx * 0.05);
        }
        x.strokeStyle = (rand() < 0.5 ? P.hoe : P.diepWarm) + (rand() < 0.5 ? '30' : '22');
        x.lineWidth = (0.8 + rand() * 1.4) * k;
        x.stroke();
      }
    }
    const fibres = Math.round((2600 * (w * h)) / (1080 * 1920));
    for (let i = 0; i < fibres; i++) {
      const fx = rand() * w, fy = rand() * h, len = (14 + rand() * 90) * k, a = rand() * Math.PI * 2;
      x.beginPath();
      x.moveTo(fx, fy);
      x.quadraticCurveTo(
        fx + Math.cos(a + 0.6) * len * 0.5, fy + Math.sin(a + 0.6) * len * 0.5,
        fx + Math.cos(a) * len, fy + Math.sin(a) * len,
      );
      x.strokeStyle = (rand() < 0.55 ? P.hoe : P.diepWarm) + (rand() < 0.7 ? '40' : '70');
      x.lineWidth = (0.5 + rand() * 1.2) * k;
      x.stroke();
    }
    const flecks = Math.round((3200 * (w * h)) / (1080 * 1920));
    for (let i = 0; i < flecks; i++) {
      const size = (rand() < 0.9 ? 1 + rand() : 2 + rand() * 2) * k;
      x.fillStyle = `rgba(255,252,240,${0.25 + rand() * 0.6})`;
      x.fillRect(rand() * w, rand() * h, size, size);
    }
  };

  /**
   * Two lines centred on `cy`: mực, then nâu, then a son rule with a lozenge on it — the card's one
   * spend of sỏi son. Returns the largest size that fits `maxWidth` and `room`, capped at `cap`;
   * draws only when `draw` is set, so the same call measures.
   */
  window.headline = (x, lines, cx, cy, maxWidth, room, cap, P, draw) => {
    let size = Math.round(Math.min(maxWidth * 0.0727, room / 4.2));
    for (const line of lines) {
      x.font = `700 ${size}px "Serif"`;
      const width = x.measureText(line).width;
      if (width > maxWidth) size = Math.floor((size * maxWidth) / width);
    }
    const fit = size;
    size = Math.min(size, cap);
    if (!draw) return fit;
    const lead = size * 1.22;
    const rule = size * 0.9;
    const y = cy - (lead * 2 + rule) / 2 + size;
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.font = `700 ${size}px "Serif"`;
    x.fillStyle = P.muc;
    x.fillText(lines[0], cx, y);
    x.fillStyle = P.nauDark;
    x.fillText(lines[1], cx, y + lead);
    const ry = y + lead + rule * 0.55;
    const thick = Math.max(4, size * 0.07);
    x.fillStyle = P.son;
    x.fillRect(cx - size * 1.6, ry, size * 3.2, thick);
    x.save();
    x.translate(cx, ry + thick / 2);
    x.rotate(Math.PI / 4);
    const d = size * 0.16;
    x.fillRect(-d, -d, 2 * d, 2 * d);
    x.restore();
    return fit;
  };

  /**
   * One game screen as a framed print: the top of the screen down to `rows`, then — when the set's
   * frames are taller than this screen's cut — the cut's own blank row stretched to the set's
   * height, so the page simply continues rather than the frame coming out shorter than its
   * neighbours.
   */
  window.screenPrint = (x, img, rows, setRows, fx, fy, fw, P, edge, shadow) => {
    const s = fw / img.width;
    const fh = setRows * s;
    x.save();
    x.shadowColor = 'rgba(40,20,10,0.45)';
    x.shadowBlur = shadow;
    x.shadowOffsetY = shadow * 0.27;
    x.fillStyle = P.muc;
    x.fillRect(fx - edge, fy - edge, fw + 2 * edge, fh + 2 * edge);
    x.restore();
    x.drawImage(img, 0, 0, img.width, rows, fx, fy, fw, rows * s);
    if (setRows > rows) {
      x.drawImage(img, 0, rows - 2, img.width, 1, fx, fy + rows * s - 1, fw, (setRows - rows) * s + 1);
    }
    return fh;
  };

  window.loadImages = (srcs) =>
    Promise.all(
      srcs.map(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
      }),
    );
});

/**
 * One gameplay card: the sheet, a two-line headline, and one *or more* game screens standing on it.
 *
 * A screen is cut at one of the two rows in its `crop`: the lower when the canvas is too squat for
 * the whole screen, the upper when it has room. Both rows sit in a band of blank paper measured on
 * the frames themselves — the first version let the cut land anywhere between them and put it
 * through the title menu's "How to Play" row.
 *
 * Every frame in the set is the same size (`layout.rows`, the tallest cut in the set) and every
 * headline sits in the same band — the first version sized each frame by its own cut, so the deck
 * came out a tenth shorter than the battle beside it and its headline floated lower.
 */
const frame = async (shots, lang, w, h, file, layout = {}) => {
  await page.setViewportSize({ width: w, height: h });
  const result = await page.evaluate(
    async ({ srcs, crops, lines, w, h, P, layout }) => {
      await document.fonts.load('700 80px "Serif"', lines.join(' '));
      const imgs = await window.loadImages(srcs);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      window.paintSheet(x, w, h, P);

      const m = Math.round(Math.min(w, h) * 0.045);
      const gap = Math.round(m * 0.8);
      const minBand = Math.round(Math.min(w * 0.3, h * 0.23));
      const n = imgs.length;
      const boxW = (w - 2 * m - (n - 1) * gap) / n;
      const boxH = h - minBand - m;

      const rows = imgs.map((img, i) => {
        const [lo, hi] = crops[i];
        return (img.width * boxH) / boxW >= hi ? hi : lo;
      });
      const setRows = layout.rows ?? Math.max(...rows);
      const fw = Math.round(Math.min(boxW, (imgs[0].width * boxH) / setRows));
      const fh = Math.round((setRows * fw) / imgs[0].width);
      const band = layout.band ?? h - m - fh;
      const fy = Math.round(band + (h - m - band - fh) / 2);
      const total = n * fw + (n - 1) * gap;
      const edge = Math.max(3, Math.round(Math.min(w, h) * 0.0045));
      let fx = Math.round((w - total) / 2);
      imgs.forEach((img, i) => {
        window.screenPrint(x, img, rows[i], setRows, fx, fy, fw, P, edge, Math.min(w, h) * 0.03);
        fx += fw + gap;
      });

      const fitSize = window.headline(x, lines, w / 2, band / 2, w * 0.88, band, layout.size ?? Infinity, P, true);
      c.style.cssText = 'display:block;width:100%;height:100%';
      document.body.innerHTML = '';
      document.body.appendChild(c);
      return { fitSize, band, rows: Math.max(...rows) };
    },
    {
      srcs: shots.map((sh) => dataUri(join(shotSource, lang, `${sh.source}.jpg`), 'image/jpeg')),
      crops: shots.map((sh) => sh.crop),
      lines: shots[0].caption[lang],
      w,
      h,
      P: PIG,
      layout,
    },
  );
  if (file) writeFileSync(file, await page.screenshot({ omitBackground: false }));
  return result;
};

/**
 * The closing card: not a screen of the game but an advertisement for it — the wordmark the front
 * page wears, and the game's screens fanned out beneath it like a hand of cards, with the series'
 * last line under the fan.
 *
 * The screens are the set's own sources, each cut at its upper row. The centre card stands upright
 * and in front; the others step outwards, lower, turned a few degrees and a little smaller, so the
 * fan reads as a hand held up rather than a row of thumbnails. The wordmark is black brush on
 * white, laid on with `multiply` so the white disappears into the sheet.
 */
const closer = async (shot, lang, w, h, file, layout = {}) => {
  await page.setViewportSize({ width: w, height: h });
  const fit = await page.evaluate(
    async ({ srcs, crops, mark, lines, w, h, P, layout }) => {
      await document.fonts.load('700 80px "Serif"', lines.join(' '));
      await document.fonts.load('600 40px BVP', 'TEN THOUSAND VICTORIES');
      const [wordmark, ...imgs] = await window.loadImages([mark, ...srcs]);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      window.paintSheet(x, w, h, P);

      const m = Math.round(Math.min(w, h) * 0.045);
      const portrait = h > w;

      // Portrait stacks brand, fan, line. Landscape cannot — a fan squeezed under a wordmark on a
      // 16:9 sheet came out a strip of thumbnails in a field of paper — so it sets brand and line
      // in a left column and gives the fan the full height of the right.
      const colW = portrait ? w : w * 0.38;
      const colX = portrait ? w / 2 : m + (colW - m) / 2;

      // The brand block: wordmark, then its English name set small and spaced, as the menu has it.
      const markW = portrait
        ? Math.min(w * 0.78, (h * 0.17 * wordmark.width) / wordmark.height)
        : (colW - m) * 0.86;
      const markH = (markW * wordmark.height) / wordmark.width;
      const sub = Math.round(markW * 0.042);
      const footRoom = portrait ? Math.round(Math.min(w * 0.3, h * 0.2)) : Math.round(h * 0.34);
      const brandH = markH + sub * 1.9;
      const markY = portrait ? m * 1.3 : (h - (brandH + footRoom)) / 2;
      x.save();
      x.globalCompositeOperation = 'multiply';
      x.drawImage(wordmark, colX - markW / 2, markY, markW, markH);
      x.restore();
      x.font = `600 ${sub}px BVP`;
      x.letterSpacing = `${Math.round(sub * 0.32)}px`;
      x.textAlign = 'center';
      x.fillStyle = P.mucSoft;
      const subY = markY + markH + sub * 1.9;
      x.fillText('TEN THOUSAND VICTORIES', colX, subY);
      x.letterSpacing = '0px';

      const n = imgs.length;
      const centre = (n - 1) / 2;
      const cardRows = crops.map(([, hi]) => hi);
      const setRows = Math.max(...cardRows);
      const fanTop = portrait ? subY + sub * 2.4 : m;
      const fanBottom = portrait ? h - footRoom : h - m;
      const fanLeft = portrait ? m : colW + m * 0.6;
      const fanRight = w - m * 0.5;
      const cardH = (fanBottom - fanTop) * (portrait ? 0.9 : 0.86);
      // A fan is its centre card plus two steps each side, turned — about 3.6 card widths wide in
      // landscape. Sized by that, not by one card, or it spills into the brand column.
      const cardW = Math.min((cardH * imgs[0].width) / setRows, (fanRight - fanLeft) / (portrait ? 2.1 : 3.6));
      const realH = (setRows * cardW) / imgs[0].width;
      const stepX = portrait ? cardW * 0.44 : cardW * 0.52;
      const fanCx = portrait ? w / 2 : (fanLeft + fanRight) / 2;
      const edge = Math.max(3, Math.round(Math.min(w, h) * 0.0045));
      const order = imgs.map((_, i) => i).sort((a, b) => Math.abs(b - centre) - Math.abs(a - centre));
      for (const i of order) {
        const off = i - centre;
        const scale = 1 - Math.abs(off) * 0.08;
        const cx = fanCx + off * stepX;
        const cy = fanTop + (fanBottom - fanTop) / 2 + Math.abs(off) * realH * 0.05;
        x.save();
        x.translate(cx, cy);
        x.rotate((off * (portrait ? 7 : 6) * Math.PI) / 180);
        x.scale(scale, scale);
        window.screenPrint(x, imgs[i], cardRows[i], setRows, -cardW / 2, -realH / 2, cardW, P, edge, Math.min(w, h) * 0.035);
        x.restore();
      }

      const lineCy = portrait ? h - footRoom / 2 - m * 0.2 : subY + footRoom / 2 + sub;
      const fitSize = window.headline(
        x, lines, colX, lineCy, portrait ? w * 0.88 : colW - m, footRoom, layout.size ?? Infinity, P, true,
      );
      c.style.cssText = 'display:block;width:100%;height:100%';
      document.body.innerHTML = '';
      document.body.appendChild(c);
      return fitSize;
    },
    {
      srcs: shot.screens.map((id) => dataUri(join(shotSource, lang, `${id}.jpg`), 'image/jpeg')),
      crops: shot.screens.map((id) => meta.screenshots.find((s) => s.source === id).crop),
      mark: dataUri(join(root, 'public', 'art', 'menu-wordmark-dongho-v2.webp'), 'image/webp'),
      lines: shot.caption[lang],
      w,
      h,
      P: PIG,
      layout,
    },
  );
  if (file) writeFileSync(file, await page.screenshot({ omitBackground: false }));
  return fit;
};

/** 1170 wide, and a phone frame usually ends near row 1830; the ratio decides how many share a card. */
const SHOT_ASPECT = 1170 / 1830;

for (const [lang, suffix] of LANGS) {
  const has = (id) => existsSync(join(shotSource, lang, `${id}.jpg`));
  const chosen = meta.screenshots.filter((s) => {
    if ((s.screens ? s.screens.every(has) : has(s.source)) && s.caption?.[lang]) return true;
    console.warn(`  ! store/gameplay/${lang}/${s.source} (or its ${lang} caption) is missing — skipped`);
    return false;
  });

  for (const [platform, name, w, h, why] of SHOTS) {
    const at = dir(platform, 'screenshots', name + suffix);
    // Cleared first, because a frame's filename carries both its position and the shot that leads
    // it: adding a seventh screenshot renumbered everything after the third, and the run that did
    // it left `04-founder.png` standing beside the new `04-cabinet.png`. The console orders by the
    // order you upload, and the README beside these files says to upload them sorted — so an
    // orphan from a previous shot list is a duplicate screenshot in the store. This directory is
    // generated in full on every run; nothing in it is worth keeping.
    for (const stale of readdirSync(at)) {
      if (stale.endsWith('.png')) rmSync(join(at, stale));
    }
    // Gameplay screens share a card where the canvas is wide enough; the closing card is always a
    // card of its own, in the position the list puts it.
    const per = Math.max(1, Math.min(3, Math.round(w / h / SHOT_ASPECT)));
    const groups = [];
    let run = [];
    for (const s of chosen) {
      if (s.screens) {
        if (run.length) groups.push(run);
        groups.push([s]);
        run = [];
      } else {
        run.push(s);
        if (run.length === per) {
          groups.push(run);
          run = [];
        }
      }
    }
    if (run.length) groups.push(run);
    const plain = groups.filter((g) => !g[0].screens);

    // Measure, then draw. Every frame takes the tallest cut in the set; the headline band is what a
    // frame of that height leaves; the size is the median of what each card could carry in that
    // band, so one long line shrinks on its own card instead of setting the size for all six.
    let rows = 0;
    for (const g of plain) rows = Math.max(rows, (await frame(g, lang, w, h, null)).rows);
    const fits = [];
    let band = 0;
    for (const g of plain) {
      const r = await frame(g, lang, w, h, null, { rows });
      band = r.band;
      fits.push(r.fitSize);
    }
    const sorted = [...fits].sort((a, b) => a - b);
    const shared = { rows, band, size: sorted[Math.floor((sorted.length - 1) / 2)] };

    let n = 0;
    for (const group of groups) {
      n += 1;
      const file = join(at, `${String(n).padStart(2, '0')}-${group[0].source}.png`);
      if (group[0].screens) await closer(group[0], lang, w, h, file, shared);
      else await frame(group, lang, w, h, file, shared);
      assertPng(file, w, h);
    }
    writeFileSync(
      join(at, 'README.md'),
      `# ${name}${suffix} — ${w} x ${h}${lang === 'vi' ? ' — Tiếng Việt' : ''}\n\n${why}\n\n` +
        (lang === 'vi'
          ? `For the Vietnamese store listing, which is its own locale in both consoles.\n\n`
          : '') +
        `${n} generated by \`yarn store:kit\` from \`store/gameplay/${lang}/\`, in the order set by\n` +
        `\`screenshots\` in \`apps/mobile/store.metadata.json\`. Both consoles order by upload rather\n` +
        `than by filename, so upload them in the sorted order shown here.\n\n` +
        `To change which shots or captions are used, edit that file — not these PNGs.\n`,
      'utf8',
    );
    note(at, `${n} x ${w}x${h}`);
  }
}

await browser.close();

// ── builds ────────────────────────────────────────────────────────────────────────────────────

for (const [platform, lines] of [
  ['ios', [[`van-thang-${stamp}.ipa`, 'App Store Connect, via `yarn mobile:eas:ios:submit` or Transporter']]],
  ['android', [
    [`van-thang-${stamp}.aab`, 'Play Console → Production → Create release'],
    [`van-thang-${stamp}.apk`, 'sideload for testing; never upload an APK to Play'],
  ]],
]) {
  const at = dir(platform, 'builds');
  writeFileSync(
    join(at, 'README.md'),
    `# ${platform} builds\n\nDownloaded by \`yarn store:builds\`, named by version and build.\n` +
      `Gitignored — they are tens of megabytes and reproducible from a commit.\n\n` +
      lines.map(([f, w]) => `- \`${f}\` — ${w}`).join('\n') +
      '\n',
    'utf8',
  );
  note(at, `expects van-thang-${stamp}.*`);
}

// ── store.config.json, for eas metadata:push ──────────────────────────────────────────────────

const storeConfig = {
  configVersion: 0,
  apple: {
    copyright: S.copyright,
    info: {
      'en-US': {
        title: S.name,
        subtitle: S.subtitle,
        promoText: S.promotionalText,
        description: S.description,
        keywords: S.keywords,
        releaseNotes: S.releaseNotes,
        marketingUrl: S.marketingUrl,
        supportUrl: S.supportUrl,
        privacyPolicyUrl: S.privacyPolicyUrl,
      },
    },
    categories: meta.ios.categories,
    review: { ...S.contact, demoRequired: false, notes: S.reviewNotes },
    release: { automaticRelease: meta.ios.automaticRelease },
    advisory: meta.ios.advisory,
  },
};
writeFileSync(
  join(root, 'apps', 'mobile', 'store.config.json'),
  `${JSON.stringify(storeConfig, null, 2)}\n`,
  'utf8',
);
note('apps/mobile/store.config.json', 'for eas metadata:push');

// ── metadata documents ────────────────────────────────────────────────────────────────────────

const field = (label, value, limit) => {
  const n = value == null ? 0 : [...String(value)].length;
  const over = limit && n > limit;
  const cap = limit ? `  _(${n}/${limit}${over ? ' — OVER' : ''})_` : '';
  return `### ${label}${cap}\n\n${value ? `\`\`\`\n${value}\n\`\`\`` : '_not set_'}\n`;
};

const generatedFrom = `Generated by \`yarn store:kit\` from \`apps/mobile/store.metadata.json\`.
**Edit that file, not this one** — this document is overwritten on every run.`;

writeFileSync(
  join(dir('ios'), 'metadata.md'),
  `# App Store Connect — ${version} (${build ?? '?'})

${generatedFrom}
\`cd apps/mobile && eas metadata:push\` uploads the same values automatically.

${field('Name', S.name, 30)}
${field('Subtitle', S.subtitle, 30)}
${field('Promotional Text', S.promotionalText, 170)}
${field('Description', S.description, 4000)}
${field("What's New in This Version", S.releaseNotes, 4000)}
${field('Keywords', S.keywords.join(','), 100)}
${field('Support URL', S.supportUrl)}
${field('Marketing URL', S.marketingUrl)}
${field('Privacy Policy URL', S.privacyPolicyUrl)}
${field('Copyright', S.copyright)}

### Category

Primary **${meta.ios.categories[0].join(' → ')}**, secondary **${meta.ios.categories[1].join(' → ')}**.

### Age rating

${Object.entries(meta.ios.advisory)
  .filter(([, v]) => v && v !== 'NONE' && v !== false)
  .map(([k, v]) => `- \`${k}\`: **${v}**`)
  .join('\n') || '- everything NONE'}

### App review contact

${Object.entries(S.contact).map(([k, v]) => `- ${k}: \`${v}\``).join('\n')}

> ${S.reviewNotes}

### App privacy

**Data Not Collected.** No analytics, no crash reporting, no outbound requests — the game runs
from a loopback server on the device.

### Export compliance

Nothing to answer. \`ITSAppUsesNonExemptEncryption: false\` in \`app.json\` settles it.

### Screenshots

\`screenshots/iphone-6.9/\` and \`screenshots/ipad-13/\`, generated. Both are required.
The Vietnamese listing takes the \`-vi\` twins: \`screenshots/iphone-6.9-vi/\` and \`screenshots/ipad-13-vi/\`.

### Still to do by hand

- **EU trader status** (Business & Compliance). Without it the app is pulled from sale in the EU.
- **The Paid Apps Agreement must be Active before any price can be set.** Business → Agreements
  needs all five contact roles filled, a bank account in the account holder's legal name, and the
  US tax forms (W-8BEN for an individual). Until all three exist the agreement sits at *Pending
  User Info* and the app cannot go on sale at any price.
- Pricing: one-time paid download, no in-app purchases. Pick the tier once the agreement is Active.
`,
  'utf8',
);
note(join(out, 'ios', 'metadata.md'), 'generated');

writeFileSync(
  join(dir('android'), 'metadata.md'),
  `# Play Console — ${version} (${build ?? '?'})

${generatedFrom}
Play has no metadata API in EAS, so every field below is copied into the console by hand.

${field('App name', S.name, 30)}
${field('Short description', S.shortDescription, 80)}
${field('Full description', S.description, 4000)}
${field("What's new", S.releaseNotes, 500)}
${field('Privacy policy URL', S.privacyPolicyUrl)}

### Graphics

| Asset | File |
|---|---|
| App icon, 512x512 | \`icon/play-store-icon-512.png\` |
| Feature graphic, 1024x500 | \`graphics/feature-graphic-1024x500.png\` — cut by \`yarn share\` |
| Phone screenshots | \`screenshots/phone/\` |
| Tablet screenshots | \`screenshots/tablet-10/\` |
| Vietnamese listing | the same folders with \`-vi\`: \`screenshots/phone-vi/\`, \`screenshots/tablet-10-vi/\` |

### Category

${meta.android.category}. Tags: ${meta.android.tags.join(', ')}.

### Content rating

${meta.android.contentRating}

### Data safety

${meta.android.dataSafety}

### Still to do by hand

- **The first release must be uploaded manually.** Play's API cannot create the initial release,
  so \`eas submit\` only works from the second release onward.
- Target audience and content settings; ads declaration (none).
- Countries and pricing: one-time paid download, no in-app purchases. Needs a Google payments
  merchant account, and it must be set up **before the app is first published** — Play cannot turn
  an already-published free app into a paid one.
- Personal Play accounts created after 13 Nov 2023 need **12 testers opted in for 14 continuous
  days** before production. Start that early.
`,
  'utf8',
);
note(join(out, 'android', 'metadata.md'), 'generated');

// ── the index ─────────────────────────────────────────────────────────────────────────────────

writeFileSync(
  join(out, 'README.md'),
  `# Store submission kit — ${version} (${build ?? '?'})

Everything here is generated by \`yarn store:kit\` from **\`apps/mobile/store.metadata.json\`**.
Edit that one file; both stores follow.

The approved boat-and-river-stakes identity is shared with the menu, loading screen, native
launchers and web icons. Its retained sources are in \`apps/mobile/branding/\`; regenerate the
platform icons with \`node scripts/build-icon.mjs\` and
\`node scripts/build-icon.mjs --mobile apps/mobile/assets\` before generating this kit.

\`\`\`
ios/                              android/
  metadata.md   every field         metadata.md   every field
  icon/         1024, no alpha      icon/         512, 32-bit
  screenshots/  6.9" + 13"          graphics/     feature graphic 1024x500
  builds/       .ipa                screenshots/  phone + tablet
                                    builds/       .aab and .apk
\`\`\`

## The whole release

\`\`\`bash
yarn mobile:eas:release            # both platforms
yarn mobile:eas:release:android    # one platform, same four steps
yarn mobile:eas:release:ios        # iOS also submits to App Store Connect
\`\`\`

Sync the game, regenerate this kit, build **both** platforms on EAS, wait, then download each
artefact into the matching \`builds/\` folder as \`van-thang-${stamp}.ipa\` / \`.aab\`. What is left
is the uploading, which neither console fully automates.

Step by step instead:

1. \`yarn mobile:eas:ios\` / \`yarn mobile:eas:android\`, then \`yarn store:builds\`.
2. Open \`metadata.md\` beside the console and copy field by field.
3. Upload the screenshots from \`screenshots/<size>/\` in sorted order.

For iOS the text half needs no copying at all: \`cd apps/mobile && eas metadata:push\` writes it
straight to App Store Connect. Play has no equivalent — its listing is hand-typed.

## What is generated vs. yours

| | |
|---|---|
| Generated — never edit | \`metadata.md\`, \`icon/\`, \`graphics/\`, \`screenshots/\`, and \`apps/mobile/store.config.json\` |
| **Edit this** | \`apps/mobile/store.metadata.json\` — text, captions, and which shots are used |
| Yours, kept here | \`builds/\` |
`,
  'utf8',
);

console.log(`store kit — ${version} (build ${build ?? '?'})\n`);
for (const [path, what] of written) console.log(`  ${String(path).padEnd(50)} ${what}`);
console.log(`\n  ${written.length} entries · one source: apps/mobile/store.metadata.json`);
