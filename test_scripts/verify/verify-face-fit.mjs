/**
 * **The portrait's parts have to fit the face they are drawn on.**
 *
 * 296 parts are stacked into one portrait and every one of them is positioned by a number in a
 * generated manifest. Nothing type-checks a number, nothing throws when a beard lands on a
 * throat, and a contact sheet of forty faces at a fifth of a phone's width is where these
 * failures go to hide. Two invariants catch the whole class:
 *
 * **1 · Fitting is a no-op on the canonical head.** `build-faces.mjs` authors every feature
 * against one head — 58×78 centred on −12, chin at 27, mouth at 15 — and `head-oval` *is* that
 * head. So fitting a feature to `head-oval` must return it exactly where it was drawn. When it
 * does not, the fit and the art disagree, and the art is right by construction. This is what
 * caught the beards: every chin beard was being re-derived from the chin rather than carried to
 * it, and landed 9 to 12 units low — on the throat, on every head in the game.
 *
 * **2 · What is worn at the nape is drawn behind the head.** A chignon, its pin and a soldier's
 * knot all sit at x ≈ ±25, level with the jaw. Painted over the head they are a spiral on the
 * cheek and a gold needle through it; painted under it, the head crops them to the crescent a
 * frontal portrait should show. `bun-nape-*` was right and `knot-nape`/`hairpin-nape-*` were not.
 *
 * Run: DEV_URL=http://127.0.0.1:5199 node test_scripts/verify/verify-face-fit.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

const report = await page.evaluate(async () => {
  const { fitDonghoPart } = await import('/src/ui/faces/donghoFit.ts');
  const { FACE_PART_DEFS } = await import('/src/ui/faces/parts.generated.ts');
  const v2 = (await import('/src/ui/faces/dongho-v2.defs.json')).default;

  const out = {};
  for (const [pack, defs] of [['generated', FACE_PART_DEFS], ['dongho-v2', v2]]) {
    const head = defs.find((d) => d.key === 'head-oval');
    // Everything drawn *on* the face rather than around it. Headwear is deliberately excluded:
    // a hat is fitted from its own measured contact band, which is not the authored geometry.
    const FEATURE = /^(beard-|eyes-|brow-|nose-|mouth-|ears(?:-|$)|earring-|mark-)/;
    const drifted = [];
    for (const def of defs) {
      if (!FEATURE.test(def.key)) continue;
      for (const fit of fitDonghoPart(def, head)) {
        const dx = fit.cx - def.cx, dy = fit.cy - def.cy;
        const sw = fit.w / def.w, sh = fit.h / def.h;
        if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05 || Math.abs(sw - 1) > 0.005 || Math.abs(sh - 1) > 0.005) {
          drifted.push(`${def.key} dx${dx.toFixed(2)} dy${dy.toFixed(2)} sw${sw.toFixed(3)} sh${sh.toFixed(3)}`);
        }
      }
    }

    // A beard's mass must follow a taller or shorter jaw, or it is not fitted at all.
    const beard = defs.find((d) => d.key === 'beard-full');
    const follows = ['head-long', 'head-round'].map((key) => {
      const other = defs.find((d) => d.key === key);
      const want = other.cy + other.h / 2 - (head.cy + head.h / 2);
      const got = fitDonghoPart(beard, other)[0].cy - beard.cy;
      return { key, want: +want.toFixed(2), got: +got.toFixed(2) };
    });

    // The nape set: worn behind the head, so under its layer.
    const headLayer = head.layer;
    const nape = defs.filter((d) => /nape/.test(d.key))
      .map((d) => ({ key: d.key, layer: d.layer, behind: d.layer < headLayer }));

    out[pack] = { drifted, follows, headLayer, nape, parts: defs.length };
  }
  return out;
});

for (const [pack, r] of Object.entries(report)) {
  check(`${pack}: fitting a face feature to the canonical head changes nothing`,
    r.drifted.length === 0, r.drifted.slice(0, 6).join('; '));
  for (const f of r.follows) {
    check(`${pack}: a full beard follows ${f.key}'s jaw`,
      Math.abs(f.want - f.got) < 0.05, `jaw moves ${f.want}, beard moves ${f.got}`);
  }
  check(`${pack}: everything worn at the nape is drawn behind the head (layer < ${r.headLayer})`,
    r.nape.every((n) => n.behind),
    r.nape.filter((n) => !n.behind).map((n) => `${n.key} at ${n.layer}`).join(', '));
}
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures === 0 ? 'PASS: the portrait stack fits the face' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
