/**
 * Lifts the opening throne hall off its printed paper.
 *
 * The generated print is a hall, two clouds and a paved courtyard standing on a flat sheet of
 * shell paper, and that sheet is opaque — measured rgb(240,220,182) against the rgb(233,223,194)
 * of the page it is laid on, which is why the "Tân vương đăng cơ" card showed a warm rectangle
 * with a picture inside it instead of a picture. Every other piece of authored art in play — the
 * map's buildings, settlements and travellers — is cut out; this one was not.
 *
 * The cut is a flood from the frame's border across pixels within `TOLERANCE` of the paper's own
 * median colour, so it stops at the drawing rather than at a rectangle: the hall's shaded
 * interior, the beige wall behind the throne and the courtyard's paving all sit inside closed
 * contours the flood cannot reach. Six is deliberate and tight — the paving's own tone is eight
 * off the paper's and shares no edge with it, so a looser key eats the courtyard. The mask is
 * softened by one 3x3 pass, because a print's edge is not a ruled line.
 *
 *   node scripts/build-throne-hall.mjs
 *
 * Reads `public/art/ascent/throne-hall-dongho-v1.webp`, writes `throne-hall-dongho-v2.webp`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SOURCE = 'public/art/ascent/throne-hall-dongho-v1.webp';
const TARGET = 'public/art/ascent/throne-hall-dongho-v2.webp';
const TOLERANCE = 6;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const source = `data:image/webp;base64,${readFileSync(SOURCE).toString('base64')}`;
  const result = await page.evaluate(async ([src, tolerance]) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const frame = context.getImageData(0, 0, width, height);
    const pixels = frame.data;

    // The paper's colour, as the median of the frame's own border — the one band of the print
    // that is paper all the way round.
    const border = [];
    for (let x = 0; x < width; x += 1) {
      border.push(x * 4);
      border.push(((height - 1) * width + x) * 4);
    }
    for (let y = 0; y < height; y += 1) {
      border.push(y * width * 4);
      border.push((y * width + width - 1) * 4);
    }
    const median = (channel) => {
      const values = border.map((at) => pixels[at + channel]).sort((a, b) => a - b);
      return values[values.length >> 1];
    };
    const paper = [median(0), median(1), median(2)];

    const isPaper = (index) => Math.abs(pixels[index * 4] - paper[0]) <= tolerance
      && Math.abs(pixels[index * 4 + 1] - paper[1]) <= tolerance
      && Math.abs(pixels[index * 4 + 2] - paper[2]) <= tolerance;

    const background = new Uint8Array(width * height);
    const stack = [];
    const reach = (index) => {
      if (!background[index] && isPaper(index)) {
        background[index] = 1;
        stack.push(index);
      }
    };
    for (let x = 0; x < width; x += 1) {
      reach(x);
      reach((height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 1) {
      reach(y * width);
      reach(y * width + width - 1);
    }
    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0) reach(index - 1);
      if (x < width - 1) reach(index + 1);
      if (y > 0) reach(index - width);
      if (y < height - 1) reach(index + width);
    }

    const alpha = new Float32Array(width * height);
    for (let index = 0; index < width * height; index += 1) alpha[index] = background[index] ? 0 : 1;
    const soft = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            sum += alpha[ny * width + nx];
            count += 1;
          }
        }
        soft[y * width + x] = sum / count;
      }
    }
    let cleared = 0;
    for (let index = 0; index < width * height; index += 1) {
      pixels[index * 4 + 3] = Math.round(255 * soft[index]);
      if (background[index]) cleared += 1;
    }
    context.putImageData(frame, 0, 0);
    return {
      webp: canvas.toDataURL('image/webp', 0.92),
      paper,
      cleared: Math.round((cleared / (width * height)) * 100),
      size: `${width}x${height}`,
    };
  }, [source, TOLERANCE]);

  writeFileSync(TARGET, Buffer.from(result.webp.split(',')[1], 'base64'));
  console.log(`${TARGET}: ${result.size}, paper rgb(${result.paper.join(',')}), ${result.cleared}% cleared, ${readFileSync(TARGET).length} bytes`);
} finally {
  await browser.close();
}
