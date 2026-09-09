/** Deterministic platform exports of the approved V7 river icon. No illustration is drawn here. */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const RIVER_ICON = {
  paper: '#f6edd7',
  foregroundScale: 0.53,
  monochromeScale: 0.55,
  maskableScale: 0.69,
};
const source = (name) => new URL(`../../apps/mobile/branding/${name}`, import.meta.url);
const dataUrl = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
const image = (data, scale = 1) => {
  const side = 1024 * scale;
  const inset = (1024 - side) / 2;
  return `<image href="${data}" x="${inset}" y="${inset}" width="${side}" height="${side}"/>`;
};
const svg = (body, size = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Chromium renders in sRGB; label the PNG explicitly for downstream asset tools. */
export function tagSrgb(png) {
  const chunks = [png.subarray(0, 8)];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const end = offset + length + 12;
    if (!['sRGB', 'iCCP', 'gAMA', 'cHRM'].includes(type)) chunks.push(png.subarray(offset, end));
    if (type === 'IHDR') {
      const chunk = Buffer.alloc(13);
      chunk.writeUInt32BE(1, 0);
      chunk.write('sRGB', 4, 'ascii');
      chunk[8] = 0;
      chunk.writeUInt32BE(crc32(chunk.subarray(4, 9)), 9);
      chunks.push(chunk);
    }
    offset = end;
  }
  return Buffer.concat(chunks);
}

/** ICO container over PNG-encoded entries — what electron-builder and every shell since Vista read. */
export function ico(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, index) => {
    const at = 6 + index * 16;
    header[at] = size;
    header[at + 1] = size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((entry) => entry.png)]);
}

export async function buildRiverIcons({ out, mobile = false, check = false }) {
  const master = dataUrl(readFileSync(source('dongho-river-v7.png')));
  const foreground = dataUrl(readFileSync(source('dongho-river-foreground-v7.png')));
  const monochrome = dataUrl(readFileSync(source('dongho-river-monochrome-v7.png')));
  const paper = `<rect width="1024" height="1024" fill="${RIVER_ICON.paper}"/>`;
  const bodies = {
    regular: image(master),
    favicon: image(foreground),
    emblem: image(foreground),
    adaptive: image(foreground, RIVER_ICON.foregroundScale),
    monochrome: image(monochrome, RIVER_ICON.monochromeScale),
    maskable: paper + image(foreground, RIVER_ICON.maskableScale),
    // iOS applies the chosen tint to this opaque white-on-black alpha-mask rendering.
    tinted: '<rect width="1024" height="1024" fill="#000"/>' +
      `<defs><filter id="white" color-interpolation-filters="sRGB"><feFlood flood-color="white"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs>` +
      `<g filter="url(#white)">${image(monochrome, 0.92)}</g>`,
  };
  const jobs = mobile ? [
    ['icon.png', 'regular', 1024],
    ['adaptive-icon.png', 'adaptive', 1024],
    ['monochrome-icon.png', 'monochrome', 1024],
    ['icon-tinted.png', 'tinted', 1024],
    ['splash.png', 'emblem', 512],
  ] : [
    ['favicon-16.png', 'favicon', 16],
    ['favicon-32.png', 'favicon', 32],
    ['favicon-48.png', 'favicon', 48],
    ['favicon-96.png', 'favicon', 96],
    ['apple-touch-icon.png', 'regular', 180],
    ['icon-192.png', 'regular', 192],
    ['icon-512.png', 'regular', 512],
    ['icon-maskable-192.png', 'maskable', 192],
    ['icon-maskable-512.png', 'maskable', 512],
    ['app-emblem.webp', 'emblem', 256],
  ];
  const outputs = new Map();
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  try {
    for (const [name, kind, size] of jobs) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(`<html><body style="margin:0">${svg(bodies[kind], size)}</body></html>`);
      await page.evaluate(async () => {
        await Promise.all([...document.querySelectorAll('svg image')].map(async (element) => {
          const img = new Image();
          img.src = element.getAttribute('href');
          await img.decode();
        }));
        await new Promise(requestAnimationFrame);
      });
      const transparent = ['adaptive', 'monochrome', 'emblem', 'favicon'].includes(kind);
      outputs.set(name, tagSrgb(await page.screenshot({ omitBackground: transparent })));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (!mobile) {
    outputs.set('favicon.ico', ico([16, 32, 48].map((size) => ({ size, png: outputs.get(`favicon-${size}.png`) }))));
    // New URLs refresh sticky browser caches; real files also work in the offline precache.
    for (const size of [16, 32, 48, 96]) outputs.set(`favicon-river-v9-${size}.png`, outputs.get(`favicon-${size}.png`));
    outputs.set('favicon-river-v9.ico', outputs.get('favicon.ico'));
    // Keep established SVG URLs usable without pretending the illustration is vector artwork.
    for (const [name, raster] of [
      ['icon.svg', 'icon-512.png'], ['icon-maskable.svg', 'icon-maskable-512.png'], ['favicon.svg', 'favicon-96.png'],
    ]) outputs.set(name, svg(image(dataUrl(outputs.get(raster)))) + '\n');
    outputs.set('manifest.webmanifest', JSON.stringify({
      id: './',
      name: 'Vạn Thắng — Ten Thousand Victories',
      short_name: 'Vạn Thắng',
      description: 'Vạn Thắng — a grand-strategy game of Vietnamese history, printed like a Đông Hồ woodblock.',
      lang: 'en', start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
      background_color: '#201a12', theme_color: '#2a2118',
      icons: [
        { src: './icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
        { src: './icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
        { src: './icon-maskable-192.png', type: 'image/png', sizes: '192x192', purpose: 'maskable' },
        { src: './icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
      ],
    }, null, 2) + '\n');
  }
  const drift = [];
  for (const [name, content] of outputs) {
    const target = join(out, name);
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    if (check) {
      if (!existsSync(target) || !readFileSync(target).equals(buffer)) drift.push(target);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, buffer);
    }
  }
  if (drift.length) throw new Error(`Icon export drift: ${drift.join(', ')}`);
  console.log(`${mobile ? 'Mobile' : 'Web'} river icon set ${check ? 'verified' : 'exported'} (${outputs.size} files)`);
  return outputs;
}
