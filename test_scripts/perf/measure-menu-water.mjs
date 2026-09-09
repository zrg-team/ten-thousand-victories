/**
 * The menu river surface, by the numbers that transfer.
 *
 * The front page re-paints its river on a Canvas 2D and re-uploads it as a texture (menu/waterSurface.ts).
 * Milliseconds here are this machine's; the counts per draw are the same on every device, and they are
 * what the 2026-09-09 fix changed: 280 strip blits became 140, the blurred glaze is rendered once instead
 * of six filtered strokes a draw, the three plate blits that re-cut the mask happen only when a plate has
 * moved, and the texture is updated in place (texSubImage2D) rather than re-specified (texImage2D).
 *
 * Usage: node test_scripts/perf/measure-menu-water.mjs [--seconds 6] [--quality high] [--dpr 3]
 */
import { boot, arg, report } from './_boot.mjs';

const SECONDS = Number(arg('seconds', '6'));
const { browser, page, errors } = await boot({ dpr: Number(arg('dpr', '3')), quality: arg('quality', 'high'), query: '?capture=1' });
await page.waitForTimeout(2500);
const res = await page.evaluate(async (seconds) => {
  const game = window.__phaserGame; const scene = game.scene.getScene('MenuScene');
  let surface; const walk = (o) => { if (o.getData?.('menuWaterSurface')) surface = o; o.list?.forEach(walk); }; scene.children.list.forEach(walk);
  if (!surface) return { error: 'no river surface on the menu' };
  const n = {}; const count = (k) => { n[k] = (n[k] ?? 0) + 1; };
  const P = CanvasRenderingContext2D.prototype;
  const wrap = (name, key) => { const o = P[name]; P[name] = function (...a) { count(key(this, a)); return o.apply(this, a); }; };
  wrap('drawImage', (ctx, a) => 'drawImage:' + (a[0]?.constructor?.name ?? '?') + ':' + ctx.globalCompositeOperation);
  for (const m of ['fill', 'stroke']) wrap(m, (ctx) => m + (ctx.filter && ctx.filter !== 'none' ? ':filtered' : ''));
  for (const G of [WebGLRenderingContext, WebGL2RenderingContext]) for (const m of ['texImage2D', 'texSubImage2D']) {
    const o = G.prototype[m]; G.prototype[m] = function (...a) { const src = a[a.length - 1]; if (src instanceof HTMLCanvasElement) count(m + ':canvas'); return o.apply(this, a); };
  }
  let updMs = 0; const emit = scene.events.emit; scene.events.emit = function (ev, ...a) { if (ev === 'update') { const t = performance.now(); const r = emit.call(this, ev, ...a); updMs += performance.now() - t; return r; } return emit.call(this, ev, ...a); };
  // Let the first draws after the wrappers settle the caches before counting.
  const f0 = surface.getData('menuWaterFrame') ?? 0;
  await new Promise(r => setTimeout(r, 600));
  for (const k of Object.keys(n)) n[k] = 0; updMs = 0;
  const f1 = surface.getData('menuWaterFrame') ?? 0;
  await new Promise(r => setTimeout(r, seconds * 1000));
  const draws = (surface.getData('menuWaterFrame') ?? 0) - f1;
  const per = {}; for (const [k, v] of Object.entries(n)) per[k] = +(v / draws).toFixed(2);
  return { draws, warmDraws: f1 - f0, msPerDraw: +(updMs / draws).toFixed(2), cadenceHz: surface.getData('menuWaterCadence'), per };
}, SECONDS);
console.log(JSON.stringify(res));
await browser.close();
if (res.error) { console.log(res.error); process.exit(1); }
const p = res.per;
report([
  ['river surface drew at least once a second', res.draws >= SECONDS, `${res.draws} draws in ${SECONDS}s at ${res.cadenceHz} Hz`],
  ['strip blits ≤ 160 per draw (was 280)', (p['drawImage:HTMLImageElement:source-over'] ?? 0) <= 160, `${p['drawImage:HTMLImageElement:source-over']}`],
  ['glaze blur is not re-rendered per draw (was 6 filtered strokes)', (p['stroke:filtered'] ?? 0) < 0.5, `${p['stroke:filtered'] ?? 0}`],
  ['mask re-cut only when a plate moved (≤ 1.5 plate blits per draw on average; was 3 every draw)', (p['drawImage:HTMLImageElement:destination-out'] ?? 0) <= 1.5, `${p['drawImage:HTMLImageElement:destination-out'] ?? 0}`],
  ['texture updated in place: no texImage2D re-specification per draw', (p['texImage2D:canvas'] ?? 0) < 0.5 && (p['texSubImage2D:canvas'] ?? 0) >= 0.9, `texImage2D ${p['texImage2D:canvas'] ?? 0}, texSubImage2D ${p['texSubImage2D:canvas'] ?? 0}`],
  ['no console errors', errors.filter(e => !/MIME type/.test(e)).length === 0, errors.join(' | ')],
]);
