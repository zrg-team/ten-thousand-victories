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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
    document.fonts.load('700 40px Serif'), document.fonts.load('600 40px Serif'),
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
 * The sources are the project's own README shots at 780x1688 — a 2x phone screen. That aspect
 * (2.16:1) is *taller* than Play's 2:1 ceiling and than every canvas below, so none of them can be
 * scaled to fill. They are fitted onto paper instead, which is why each frame carries a caption and
 * a contour: the letterboxing has to read as a decision rather than as an accident.
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

const shotSource = join(root, 'docs', 'readme');

/**
 * One frame, carrying one *or more* shots side by side.
 *
 * A single 780x1688 shot on a landscape tablet canvas is a narrow strip adrift in a field of
 * paper — technically a valid screenshot and a poor one. How many fit is arithmetic rather than
 * taste: the canvas aspect divided by the shot's, so a 6.9" phone takes one, a 13" iPad two, and
 * a 10" tablet three.
 */
/**
 * One card: a sheet of diep, a plate mark, a head, the prints, and a seal.
 *
 * The order is the order a Dong Ho print is actually pulled - ground, then colour blocks, then the
 * soot contour last and never quite in register. `washFill`'s registration offset is the
 * fingerprint of the medium, so each print gets a colour block laid down a hair off its own
 * outline rather than a drop shadow, which would be depth the medium does not have.
 */
const frame = async (shots, w, h, file, seed) => {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate(
    async ({ srcs, kicker, caption, w, h, P, seed }) => {
      const imgs = await Promise.all(
        srcs.map(async (src) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          return img;
        }),
      );

      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      const unit = Math.min(w, h);

      paper(x, w, h, P, seed);

      // ── the plate mark ────────────────────────────────────────────────────────────────────
      // The impression the block leaves in the sheet. Hand-pulled, so it wobbles; everything else
      // on the card lives inside it, which is the bug the first cut of this had - a sawtooth band
      // ran the full width and crossed straight over the border.
      const m = Math.round(unit * 0.055);
      inkPath(
        x,
        [{ x: m, y: m }, { x: w - m, y: m }, { x: w - m, y: h - m }, { x: m, y: h - m }],
        seed * 13 + 5,
        { width: Math.max(1.6, unit / 640), colour: P.muc, amp: unit * 0.0018, step: unit * 0.085, closed: true },
      );

      const pad = Math.round(unit * 0.082);
      const boxW = w - pad * 2;
      let y = m + Math.round(unit * 0.042);

      x.textAlign = 'center';
      x.textBaseline = 'alphabetic';

      // ── kicker ────────────────────────────────────────────────────────────────────────────
      // Soot, not red. The scarcity law reserves soi son for the player, and the seal below is
      // where this sheet spends it.
      const kickSize = Math.round(unit * 0.02);
      x.font = '700 ' + kickSize + 'px BVP, sans-serif';
      x.letterSpacing = Math.round(kickSize * 0.26) + 'px';
      x.fillStyle = P.mucSoft;
      x.globalAlpha = 0.9;
      x.fillText(kicker, w / 2, y);
      x.globalAlpha = 1;
      x.letterSpacing = '0px';
      y += Math.round(kickSize * 1.95);

      // ── headline ──────────────────────────────────────────────────────────────────────────
      // Source Serif, the game's own TITLE_FONT. It wraps rather than shrinking away: two lines at
      // a readable size beat one line nobody can read at thumbnail scale.
      let headSize = Math.round(unit * 0.05);
      const wrap = (size) => {
        x.font = '700 ' + size + 'px Serif, Georgia, serif';
        const lines = [];
        let line = '';
        for (const word of caption.split(' ')) {
          const next = line ? line + ' ' + word : word;
          if (x.measureText(next).width > boxW && line) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        if (line) lines.push(line);
        return lines;
      };
      let lines = wrap(headSize);
      while (lines.length > 2 && headSize > unit * 0.028) {
        headSize = Math.round(headSize * 0.93);
        lines = wrap(headSize);
      }
      x.fillStyle = P.muc;
      for (const line of lines) {
        x.fillText(line, w / 2, y + headSize);
        y += Math.round(headSize * 1.12);
      }

      // ── rang cua ──────────────────────────────────────────────────────────────────────────
      // The drum's own register, standing in for a rule. Centred and short, so it reads as a
      // device rather than as a border, and comfortably inside the plate mark.
      y += Math.round(unit * 0.02);
      const bandW = Math.round(Math.min(boxW * 0.34, unit * 0.3));
      const bandH = Math.round(unit * 0.016);
      sawtooth(x, Math.round((w - bandW) / 2), y, bandW, bandH, P.muc, 0.42);
      y += bandH + Math.round(unit * 0.034);

      // ── the seal ──────────────────────────────────────────────────────────────────────────
      // Bottom right, inside the plate mark, the way a print is signed. The only red on the sheet.
      const sealSize = Math.round(unit * 0.062);
      const sealX = w - m - Math.round(unit * 0.032) - sealSize / 2;
      const sealY = h - m - Math.round(unit * 0.032) - sealSize / 2;
      seal(x, sealX, sealY, sealSize, P);

      // ── the prints ────────────────────────────────────────────────────────────────────────
      const footTop = sealY - sealSize / 2 - Math.round(unit * 0.016);
      const boxH = footTop - y;
      const gap = imgs.length > 1 ? Math.round(unit * 0.038) : 0;
      const cell = (boxW - gap * (imgs.length - 1)) / imgs.length;

      x.imageSmoothingQuality = 'high';

      /**
       * How much of a shot's height may be cropped so it fills the cell's width.
       *
       * Every source is 780x1688 - 2.16:1, taller than any canvas here. Fitted by height on a
       * 16:9 Play phone it lands at about 58% of the width, adrift in paper. Filling the width
       * instead would cost 28% of the shot, which takes the action bar with it. 15% is where the
       * frame reads as full without losing either the header or the bar, and it is a ceiling
       * rather than a target: the 6.9" iPhone needs no crop at all and gets none.
       */
      const CROP_MAX = 0.15;

      imgs.forEach((img, i) => {
        let sy = 0;
        let sh = img.height;
        const fillH = img.height * (cell / img.width);
        if (fillH > boxH) {
          const keep = Math.max(1 - CROP_MAX, boxH / fillH);
          sh = Math.round(img.height * keep);
          // Anchored to the top, not centred. Every source is a phone screen whose first rows are
          // the status header - the one horizontal band that is always whole at y = 0. A centred
          // crop takes half of it and half of the action bar, and a headline sliced through the
          // middle of a text row reads as a broken image rather than as a chosen frame.
          sy = 0;
        }

        const scale = Math.min(cell / img.width, boxH / sh);
        const dw = Math.round(img.width * scale);
        const dh = Math.round(sh * scale);
        const dx = Math.round(pad + i * (cell + gap) + (cell - dw) / 2);
        const dy = Math.round(y + (boxH - dh) / 2);

        // The colour block, pulled first and off register - `washFill` in ink/stroke.ts. This is
        // the medium's fingerprint: at a registration of 0 the whole thing reads as clip-art.
        const reg = Math.max(2, unit * 0.0042);
        x.save();
        x.globalAlpha = 0.5;
        x.fillStyle = P.diepDeep;
        x.fillRect(dx + reg, dy + reg, dw, dh);
        x.restore();

        x.drawImage(img, 0, sy, img.width, sh, dx, dy, dw, dh);

        // The soot contour, pulled last.
        inkPath(
          x,
          [{ x: dx, y: dy }, { x: dx + dw, y: dy }, { x: dx + dw, y: dy + dh }, { x: dx, y: dy + dh }],
          seed * 31 + i * 7,
          { width: Math.max(1.4, unit / 900), colour: P.muc, amp: unit * 0.0011, step: unit * 0.07, closed: true },
        );
      });

      c.style.cssText = 'display:block;width:100%;height:100%';
      document.body.innerHTML = '';
      document.body.appendChild(c);
    },
    {
      srcs: shots.map((sh) => dataUri(join(shotSource, sh.source), 'image/webp')),
      kicker: shots[0].kicker || '',
      caption: shots[0].caption,
      w, h, P: PIG, seed,
    },
  );
  writeFileSync(file, await page.screenshot({ omitBackground: false }));
};

/** 780x1688 is what every README shot is; the ratio decides how many share a frame. */
const SHOT_ASPECT = 780 / 1688;

const available = new Set(readdirSync(shotSource));
const chosen = meta.screenshots.filter((s) => {
  if (available.has(s.source)) return true;
  console.warn(`  ! docs/readme/${s.source} is missing — skipped`);
  return false;
});

for (const [platform, name, w, h, why] of SHOTS) {
  const at = dir(platform, 'screenshots', name);
  const per = Math.max(1, Math.min(3, Math.round(w / h / SHOT_ASPECT)));
  const groups = [];
  for (let i = 0; i < chosen.length; i += per) groups.push(chosen.slice(i, i + per));

  let n = 0;
  for (const group of groups) {
    n += 1;
    const file = join(at, `${String(n).padStart(2, '0')}-${group[0].source.replace(/\.\w+$/, '')}.png`);
    await frame(group, w, h, file, 7 + n);
    assertPng(file, w, h);
  }
  writeFileSync(
    join(at, 'README.md'),
    `# ${name} — ${w} x ${h}\n\n${why}\n\n` +
      `${n} generated by \`yarn store:kit\` from \`docs/readme/\`, in the order set by\n` +
      `\`screenshots\` in \`apps/mobile/store.metadata.json\`. Both consoles order by upload rather\n` +
      `than by filename, so upload them in the sorted order shown here.\n\n` +
      `To change which shots or captions are used, edit that file — not these PNGs.\n`,
    'utf8',
  );
  note(at, `${n} x ${w}x${h}`);
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
