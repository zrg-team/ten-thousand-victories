import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { RIVER_ICON } from '../../scripts/icons/river-icon-pack.mjs';
import { FILL, ICO_SIZES } from '../../scripts/icons/desktop-icon.mjs';

const root = process.cwd();
const require = createRequire(join(root, 'apps/mobile/package.json'));
const Jimp = require('jimp-compact');
const { getConfig } = require('@expo/config');
const report = { checked: [], safeAreas: {}, native: {}, limitations: ['No physical-device install or store upload was performed.'] };
async function png(path, size, colorType, srgb = true) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', path);
  assert.equal(bytes.readUInt32BE(16), size, path);
  assert.equal(bytes.readUInt32BE(20), size, path);
  assert.equal(bytes[24], 8, path);
  assert.equal(bytes[25], colorType, path);
  const chunks = [];
  for (let at = 8; at < bytes.length;) {
    chunks.push(bytes.toString('ascii', at + 4, at + 8));
    at += bytes.readUInt32BE(at) + 12;
  }
  if (srgb) assert(chunks.includes('sRGB'), `${path}: missing sRGB declaration`);
  const img = await Jimp.read(bytes);
  let transparent = 0, radius = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const alpha = img.bitmap.data[(y * size + x) * 4 + 3];
    if (alpha === 0) transparent++;
    if (alpha > 16) radius = Math.max(radius, Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5));
  }
  report.checked.push({ path, size, colorType, bytes: bytes.length });
  return { bytes, img, transparent, radius };
}

for (const name of ['icon.png', 'icon-tinted.png']) await png(`apps/mobile/assets/${name}`, 1024, 2);
for (const name of ['adaptive-icon.png', 'monochrome-icon.png']) {
  const result = await png(`apps/mobile/assets/${name}`, 1024, 6);
  assert(result.transparent > 1024 * 1024 * 0.7, `${name}: needs genuine transparent padding`);
  assert(result.radius <= 33 / 108, `${name}: visible content exceeds Android safe circle`);
  report.safeAreas[name] = { visibleAlphaThreshold: 16, radius: result.radius, limit: 33 / 108 };
}
await png('apps/mobile/assets/splash.png', 512, 6);
await png('public/app-emblem.png', 256, 6);
for (const size of [16, 32, 48, 96]) {
  const result = await png(`public/favicon-${size}.png`, size, 6);
  assert(result.bytes.equals(readFileSync(`public/favicon-river-v9-${size}.png`)), 'Versioned favicon drifted');
  // Downsampling the detailed silhouette spreads antialiased edges across much of a 16 px canvas.
  assert(result.transparent > size * size * 0.1, 'Favicon needs a real transparent background');
  for (const pixel of [0, size - 1, size * (size - 1), size * size - 1]) {
    assert.equal(result.img.bitmap.data[pixel * 4 + 3], 0, 'Favicon corner must be transparent');
  }
}
await png('public/apple-touch-icon.png', 180, 2);
for (const size of [192, 512]) {
  await png(`public/icon-${size}.png`, size, 2);
  await png(`public/icon-maskable-${size}.png`, size, 2);
}
const fgBytes = readFileSync('apps/mobile/branding/dongho-river-foreground-v7.png');
const fg = await png('apps/mobile/branding/dongho-river-foreground-v7.png', fgBytes.readUInt32BE(16), 6, false);
const maskRadius = fg.radius * RIVER_ICON.maskableScale + 1 / 192;
assert(maskRadius <= 0.4, 'PWA source plus one output pixel must fit its safe circle');
report.safeAreas.pwa = { radiusWithOnePixelMargin: maskRadius, limit: 0.4 };
const play = await png('apps/mobile/store/android/icon/play-store-icon-512.png', 512, 6);
assert(play.bytes.length <= 1024 * 1024, 'Play icon exceeds 1024 KB');
const ios = await png('apps/mobile/store/ios/icon/app-store-icon-1024.png', 1024, 2);
assert(ios.bytes.equals(readFileSync('apps/mobile/assets/icon.png')), 'iOS store icon drifted from app');

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
for (const icon of manifest.icons) {
  const url = new URL(icon.src, 'https://example.test/ten-thousand-victories/manifest.webmanifest');
  assert(url.pathname.startsWith('/ten-thousand-victories/'), 'icon escaped hosted subdirectory');
  assert(existsSync(join('public', icon.src)), icon.src);
}
assert(manifest.icons.some(icon => icon.sizes === '192x192' && icon.purpose === 'any'));
assert(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
const html = readFileSync('index.html', 'utf8');
for (const link of html.matchAll(/<link\b[^>]+>/g)) {
  if (!/rel="(?:icon|apple-touch-icon|manifest)"/.test(link[0])) continue;
  const href = link[0].match(/href="([^"]+)"/)[1];
  const url = new URL(href, 'https://example.test/ten-thousand-victories/');
  assert(url.pathname.startsWith('/ten-thousand-victories/'), 'link escaped hosted subdirectory');
  assert(existsSync(join('public', url.pathname.slice('/ten-thousand-victories/'.length))), href);
  if (/rel="icon"/.test(link[0])) assert(url.pathname.includes('/favicon-river-v9'), 'Tab favicon needs a fresh URL');
}
assert(html.includes('class="sp-mark" src="./app-emblem.png"'));
const ico = readFileSync('public/favicon.ico');
assert(ico.equals(readFileSync('public/favicon-river-v9.ico')));
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 3);
for (let n = 0; n < 3; n++) {
  const at = 6 + n * 16, size = ico[at], offset = ico.readUInt32LE(at + 12), length = ico.readUInt32LE(at + 8);
  assert(ico.subarray(offset, offset + length).equals(readFileSync(`public/favicon-${size}.png`)));
}

// The desktop cabinet's own icon: cut from the transparent master by scripts/icons/desktop-icon.mjs
// into apps/desktop/build/, which — unlike apps/desktop/web/ — is committed. A Windows icon is a
// free-form shape on the shell's background, so every size has to be transparent at the corners and
// has to fill its tile; a re-point at the PWA icon would put the cream sheet back and fail here.
const desktopIco = readFileSync('apps/desktop/build/icon.ico');
assert.equal(desktopIco.readUInt16LE(2), 1, 'desktop icon.ico is not an ICO');
assert.equal(desktopIco.readUInt16LE(4), ICO_SIZES.length, 'desktop icon.ico size count changed');
report.desktop = { ico: [] };
for (let n = 0; n < ICO_SIZES.length; n++) {
  const at = 6 + n * 16;
  const size = desktopIco[at] || 256;
  assert.equal(size, ICO_SIZES[n], `desktop icon.ico entry ${n}`);
  assert.equal(desktopIco[at + 1], desktopIco[at], `desktop icon ${size} is not square`);
  const bytes = desktopIco.subarray(desktopIco.readUInt32LE(at + 12), desktopIco.readUInt32LE(at + 12) + desktopIco.readUInt32LE(at + 8));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `desktop icon ${size}`);
  assert.equal(bytes.readUInt32BE(16), size, `desktop icon ${size} header`);
  assert.equal(bytes[25], 6, `desktop icon ${size} needs an alpha channel`);
  const img = await Jimp.read(bytes);
  for (const pixel of [0, size - 1, size * (size - 1), size * size - 1]) {
    assert.equal(img.bitmap.data[pixel * 4 + 3], 0, `desktop icon ${size} corner must be transparent`);
  }
  let left = size, top = size, right = -1, bottom = -1, clear = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (img.bitmap.data[(y * size + x) * 4 + 3] > 16) {
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    } else if (img.bitmap.data[(y * size + x) * 4 + 3] === 0) clear++;
  }
  const fill = Math.max(right - left + 1, bottom - top + 1) / size;
  assert(clear > size * size * 0.1, `desktop icon ${size}: an opaque tile is not a Windows icon`);
  // One pixel of slack each way: rounding at 16 px moves the box more than the ratio suggests.
  assert(fill >= FILL - 2 / size && fill <= 1, `desktop icon ${size}: mark fills ${fill.toFixed(3)} of the tile`);
  report.desktop.ico.push({ size, fill, bytes: bytes.length });
}
await png('apps/desktop/build/icon.png', 512, 6);
const cabinet = JSON.parse(readFileSync('apps/desktop/package.json', 'utf8')).build;
assert.equal(cabinet.win.icon, 'build/icon.ico', 'desktop win icon must be the committed .ico');
for (const platform of ['mac', 'linux']) {
  // apps/desktop/web/ is gitignored and rewritten by `npm run sync`; an icon cannot live there.
  assert.equal(cabinet[platform].icon, 'build/icon.png', `desktop ${platform} icon must be the committed .png`);
}

const { exp } = getConfig(resolve('apps/mobile'));
for (const path of [exp.icon, exp.ios.icon.light, exp.ios.icon.tinted, exp.android.adaptiveIcon.foregroundImage, exp.android.adaptiveIcon.monochromeImage]) assert(existsSync(join('apps/mobile', path)), path);
const pack = 'docs/design/game-icon-v7/icon-pack';
const res = `${pack}/android/res`;
for (const [dpi, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
  const files = readdirSync(`${res}/mipmap-${dpi}`);
  for (const name of ['ic_launcher.webp', 'ic_launcher_round.webp', 'ic_launcher_foreground.webp', 'ic_launcher_monochrome.webp']) {
    assert(files.includes(name), `${dpi}/${name}`);
    const bytes = readFileSync(`${res}/mipmap-${dpi}/${name}`);
    const expected = (name.includes('foreground') || name.includes('monochrome') ? 108 : 48) * scale;
    // This installed Expo version emits PNG bytes under its Android resource filenames.
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), expected, `${dpi}/${name}`);
    assert.equal(bytes.readUInt32BE(20), expected, `${dpi}/${name}`);
  }
}
const xml = readFileSync(`${res}/mipmap-anydpi-v26/ic_launcher.xml`, 'utf8');
for (const element of ['foreground', 'background', 'monochrome']) assert(xml.includes(`<${element}`));
assert(readFileSync(`${res}/values/colors.xml`, 'utf8').includes(RIVER_ICON.paper));
const contents = JSON.parse(readFileSync(`${pack}/ios/AppIcon.appiconset/Contents.json`, 'utf8'));
assert.equal(contents.images.length, 2);
for (const item of contents.images) await png(`${pack}/ios/AppIcon.appiconset/${item.filename}`, 1024, 2, false);
report.native = { expoConfigPaths: 'pass', androidDensityFamilies: 5, androidLayers: ['foreground', 'background', 'monochrome'], iosUniversalAppearances: ['default', 'tinted'] };
report.approvedSourceSha256 = createHash('sha256').update(readFileSync('apps/mobile/branding/dongho-river-v7.png')).digest('hex');
// The approved source is stored once, in apps/mobile/branding/. Pinning its digest catches a silent
// replacement without keeping a second copy of the same 3 MB image under docs/.
assert.equal(report.approvedSourceSha256, '015c10b59b37bc1a29aac8c759a392e5fd0719079b001c2473ee3df7f1d96dc2', 'approved river master changed');
writeFileSync('docs/design/game-icon-v7/verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: ${report.checked.length} PNGs, native resources, alpha safe areas, sRGB, ICO (web + desktop ${ICO_SIZES.length} sizes) and web/config links`);
