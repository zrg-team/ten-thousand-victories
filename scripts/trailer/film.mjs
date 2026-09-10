/**
 * The trailer, as a list of cuts.
 *
 * A cut is a staged game state plus a per-frame instruction. `stage()` runs once with the clock
 * stopped — it puts the world where the cut wants it and costs no film time. `step()` then runs
 * once per frame of film, and its job is only ever camera work: the world itself moves because the
 * driver cranks Phaser's clock a thirtieth of a second between every frame.
 *
 * Captions live here too rather than in the compositor, because a caption belongs to the shot it
 * is over. The compositor is handed a plain spec per frame and draws it.
 *
 * Four pages, so the run each cut needs is booted once and not once per cut:
 *
 *   run     a realm 65 ticks in — the country, the cards, the court, the build sheet
 *   battle  the same seed carried to the first fight that opens after the capital is worth
 *           defending — the invasion on the map, then the field itself
 *   story   a headless run handed to the real scene at the first illustrated Chronicle beat
 *   menu    the front page, for the end card
 */

const FPS = 30;
const D = 390;                       // design units across; the whole game is laid out against it
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);

/** Per-frame camera drift, in design units, eased so it starts and stops like a held hand. */
function drift({ dx = 0, dy = 0, ease = easeInOut } = {}) {
  return async (page, i, n, ctx) => {
    const u = n <= 1 ? 1 : ease(i / (n - 1));
    await page.evaluate(({ x, y }) => window.__panTo(x, y), {
      x: ctx.scroll.x + dx * u,
      y: ctx.scroll.y + dy * u,
    });
  };
}

/** The scroll the camera is sitting at, so a drift can be expressed as an offset from the frame. */
export const readScroll = (page) => page.evaluate(() => window.__scroll());

// ────────────────────────────────────────────────────────────────────────────────────────────────

export const CUTS = [
  // ── the country ───────────────────────────────────────────────────────────────────────────────
  {
    id: 'country',
    page: 'run',
    seconds: 5.5,
    open: true,
    drain: true,
    async stage(page, ctx) {
      await ctx.frameOn({ zoom: 1.15, season: 'Summer', yNudge: 30 });
      await ctx.drain(page);
    },
    step: drift({ dx: 70, dy: 26 }),
    captions: [
      { from: 2.1, to: 4.9, line: 'I was given one citadel,', line2: 'and the country would not wait.',
        vi: { line: 'Ngày ta đăng cơ, chỉ một tòa thành.', line2: 'Giang sơn hối hả, chẳng đợi ai.' } },
    ],
  },
  // ── the realm, wide ───────────────────────────────────────────────────────────────────────────
  {
    id: 'realm',
    page: 'run',
    seconds: 5,
    drain: true,
    async stage(page, ctx) {
      await ctx.frameOn({ zoom: 0.55, season: 'Summer', yNudge: 0, revealAll: true });
      await ctx.drain(page);
    },
    step: drift({ dx: -60, dy: 40 }),
    captions: [
      { from: 0.7, to: 4.1, line: 'Forty-two provinces around it.', line2: 'I meant to hold them all.',
        vi: { line: 'Ta phải mở rộng giang sơn,', line2: 'cho xứng tầm tiên đế.' } },
    ],
  },
  // ── the cards: where do we press ───────────────────────────────────────────────────────────────
  {
    id: 'conquer',
    band: 'hud',
    page: 'run',
    seconds: 5,
    async stage(page, ctx) {
      await ctx.frameOn({ zoom: 1.15, season: 'Summer', yNudge: 30 });
      await page.evaluate(async () => {
        const st = window.__mandateState;
        st.pendingAscentPrompt = undefined;
        st.ascent.promptQueue = [];
        const C = await import('/src/systems/ascent/ConquestSystem.ts');
        const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
        C.offerConquestPrompt(st);
        drainAscentPrompts(st);
        window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
      });
    },
    // The card is answered on screen, so the cut carries a decision rather than a picture of one.
    // Held, not tapped: the card says so itself — *hold a card to choose it*.
    taps: [{ at: 2.6, find: 'option', hold: 0.9 }],
    captions: [
      { from: 0.7, to: 4.1, line: 'My ministers asked me', line2: 'where we should press.',
        vi: { line: 'Triều đình hỏi ta', line2: 'nên mở rộng về đâu.' } },
    ],
  },
  // ── the power draft ───────────────────────────────────────────────────────────────────────────
  {
    id: 'draft',
    band: 'hud',
    page: 'run',
    seconds: 5.5,
    async stage(page, ctx) {
      await page.evaluate(async () => {
        const st = window.__mandateState;
        st.pendingAscentPrompt = undefined;
        st.ascent.promptQueue = [];
        const { offerPowerDraft } = await import('/src/systems/ascent/PowerDraftSystem.ts');
        const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
        st.ascent.pendingLevelUps = Math.max(1, st.ascent.pendingLevelUps ?? 0);
        offerPowerDraft(st);
        drainAscentPrompts(st);
        window.__phaserGame.scene.getScene('ConquestUIScene').events.emit('state-changed');
      });
    },
    // Browsed, then taken. A still of a card fan says the game has cards; a hand crossing all four
    // and lifting the middle one says the game is *played* — and the panel above changes with every
    // card the browse passes, which is the draft's whole readout.
    gestures: [{ at: 0.9, kind: 'browse-fan' }, { at: 3.4, kind: 'take-fan' }],
    captions: [
      { from: 0.7, to: 4.6, line: 'The realm learned as it grew,', line2: 'and I chose what it learned.',
        vi: { line: 'Giang sơn lớn đến đâu, học đến đó;', line2: 'học gì là do ta chọn.' } },
    ],
  },
  // ── the court ─────────────────────────────────────────────────────────────────────────────────
  {
    id: 'summon',
    band: 'hud',
    page: 'run',
    seconds: 5,
    async stage(page, ctx) {
      await page.evaluate(async () => {
        const st = window.__mandateState;
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        try { ui.closeLane?.(); } catch { /* nothing open */ }
        st.pendingAscentPrompt = undefined;
        st.ascent.promptQueue = [];
        const { offerHeroSummon } = await import('/src/systems/ascent/SummonSystem.ts');
        const { drainAscentPrompts } = await import('/src/systems/ascent/AscentState.ts');
        offerHeroSummon(st);
        drainAscentPrompts(st);
        ui.events.emit('state-changed');
      });
    },
    // Two sideways flicks through the three who came, then a lift on the one taken. The dots under
    // the deck count them off, which is what makes the browse legible at a glance.
    gestures: [
      { at: 0.9, kind: 'swipe-next' },
      { at: 2.1, kind: 'swipe-next' },
      { at: 3.4, kind: 'swipe-take' },
    ],
    captions: [
      { from: 0.7, to: 4.1, line: 'Three answered the call.', line2: 'The treasury could pay one.',
        vi: { line: 'Ba người đến ứng mộ,', line2: 'ngân khố chỉ nuôi nổi một.' } },
    ],
  },
  // ── the build sheet ───────────────────────────────────────────────────────────────────────────
  {
    id: 'build',
    band: 'top',
    page: 'run',
    seconds: 4.5,
    async stage(page, ctx) {
      await page.evaluate(() => {
        const st = window.__mandateState;
        st.pendingAscentPrompt = undefined;
        st.ascent.promptQueue = [];
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        ui.events.emit('state-changed');
        ui.openLane('build');
      });
    },
    captions: [
      { from: 0.7, to: 3.6, line: 'I raised walls where I could,', line2: 'and rice where I could not.',
        vi: { line: 'Chỗ nào xây được thành, ta xây;', line2: 'chỗ nào không, thì trồng lúa.' } },
    ],
  },

  // ── the invasion, on the map ──────────────────────────────────────────────────────────────────
  {
    id: 'invasion',
    page: 'battle',
    seconds: 5,
    open: true,
    drain: true,
    async stage(page, ctx) {
      // The fight is live; close the lane the driver opened so the cut can enter it by tapping the
      // bar's lit Battle button, the way a player does.
      await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        try { ui.closeLane?.(); } catch { /* nothing open */ }
        window.__mandateState.isStrategyPause = false;
      });
      await ctx.frameOn({ zoom: 1.0, landId: ctx.battleLandId, yNudge: 20 });
    },
    step: drift({ dx: 40, dy: -18 }),
    taps: [{ at: 4.4, find: 'battle-button' }],
    captions: [
      { from: 0.7, to: 4.1, line: 'Then the north came down,', line2: 'the way it always does.',
        vi: { line: 'Rồi phương Bắc kéo xuống,', line2: 'như xưa nay vẫn thế.' } },
    ],
  },
  // ── the field ─────────────────────────────────────────────────────────────────────────────────
  {
    id: 'field',
    band: 'top',
    drain: true,
    keepBattle: true,
    page: 'battle',
    seconds: 6,
    async stage(page) {
      await page.evaluate(() => {
        const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
        ui.openLane('battle');
        window.__mandateState.isStrategyPause = false;
        // Take the field. A fight nobody has touched for ten beats is handed to its officers, and
        // the header then says so across the top of every frame — true, and the opposite of what
        // these three cuts are about. `take-field` is the chip a player taps to take it back.
        ui.events.emit('ui:battle-order', 'take-field');
        // And on the middle posture, so the tap on Press two cuts later is a change rather than a
        // re-order of the dial it is already on.
        ui.events.emit('ui:battle-order', 'stance:balanced');
        // And release the opening hold. A fight opens *held* — the drum falls, the formation strip
        // is ringed in red, and the beat clock does not start until the first order is given. The
        // real chips call `resumeBattleForOrder` on the way to emitting; emitting the event alone
        // gives the order and leaves the fight standing at round 0 forever, which is exactly how
        // this chapter first came back as nineteen seconds of a battle that never happened.
        ui.resumeBattleForOrder();
      });
    },
    captions: [
      { from: 0.7, to: 5.1, line: 'We formed up. The drum fell in five.', line2: 'Every man on it, my own land raised.',
        vi: { line: 'Hai bên dàn trận, trống điểm năm hồi.', line2: 'Từng người lính ấy, đất ta nuôi cả.' } },
    ],
  },
  // ── the five shapes ───────────────────────────────────────────────────────────────────────────
  {
    id: 'shapes',
    band: 'top',
    drain: true,
    keepBattle: true,
    page: 'battle',
    seconds: 7,
    // The shape that answers what they are re-forming into, read off the telegraph the same way a
    // player reads it off the words over their line.
    taps: [{ at: 2.6, find: 'shape-any' }],
    captions: [
      { from: 0.7, to: 6.1, line: 'They showed me what they held.', line2: 'I answered with what breaks it.',
        vi: { line: 'Chúng để lộ thế đang giữ;', line2: 'ta đáp bằng thế khắc nó.' } },
    ],
  },
  // ── the tempo dial ────────────────────────────────────────────────────────────────────────────
  {
    id: 'press',
    band: 'top',
    drain: true,
    keepBattle: true,
    page: 'battle',
    seconds: 6,
    taps: [{ at: 1.2, find: 'tempo-press' }],
    captions: [
      { from: 0.7, to: 5.1, line: 'Then I leaned on it.', line2: 'We were outnumbered. We usually are.',
        vi: { line: 'Rồi ta thúc quân.', line2: 'Quân ta ít hơn — xưa nay vẫn ít hơn.' } },
    ],
  },

  // ── the Chronicle ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'chronicle',
    band: 'hud',
    page: 'story',
    seconds: 7,
    open: true,
    captions: [
      { from: 0.7, to: 3.3, line: 'The chroniclers wrote it all down.', line2: 'Most of it is even true.',
        vi: { line: 'Sử quan chép lại tất cả.', line2: 'Phần nhiều là thật.' } },
      { from: 4.3, to: 6.3, line: 'There is no winning this —', line2: 'only how far I got.',
        vi: { line: 'Không có chiến thắng cuối cùng —', line2: 'chỉ có đi được bao xa.' } },
    ],
  },

  // ── the end card ──────────────────────────────────────────────────────────────────────────────
  {
    id: 'end',
    page: 'menu',
    seconds: 6.5,
    open: true,
    end: true,
  },
];

/**
 * The README's GIF: the moments worth 8 MB.
 *
 * A GIF of the whole film is 24 MB and no README should carry that, so this is a highlight reel —
 * seconds of the finished cut, in order, concatenated. They are chosen to catch the *motion*: the
 * draft window covers the browse across all four cards and the lift of the one taken, and the
 * summon window covers both sideways flicks and the lift, because a still of either screen says
 * nothing a screenshot has not already said.
 *
 * Times are seconds into `van-thang-trailer-1080x1920.mp4`. If a cut's length changes, these move.
 */
export const HIGHLIGHT = [
  [1.2, 3.9],     // the country, drifting
  [7.5, 9.8],     // the realm, wide
  [16.5, 19.6],   // the draft: browse all four, take the middle
  [21.8, 25.0],   // the summon: flick through all three, lift the one
  [31.2, 34.2],   // the invasion column reaching the capital
  [36.5, 39.2],   // the field
  [43.8, 47.3],   // the shape that answers theirs
  [56.0, 58.3],   // the Chronicle
  [63.8, 66.3],   // the end card
];

// The two hand-played windows above are the long ones on purpose. Everything else in this film
// reads from a single frame; the draft and the summon do not, because what they are showing is a
// hand crossing four cards and a deck being flicked through — which is the whole difference between
// "the game has cards" and "the game is played".

/**
 * Where every caption sits on the *film*, not on its own cut.
 *
 * This is the difference between a caption track and a strobe. Worked out per cut, the plate rises
 * with a cut's first caption and falls with its last — so at every boundary it went down and came
 * straight back up, nineteen times in sixty-eight seconds, with gaps of a tenth to three tenths of
 * a second. On screen that is not a caption arriving, it is the top of the picture flickering.
 *
 * So the runs are computed across the whole film: consecutive captions on the *same plate height*
 * and less than `JOIN` apart are one plate, which comes down once at the end of them all. The three
 * card screens become one continuous sheet, and so do the three cuts of the fight. Where the plate
 * height changes — a lane page, a battle — it comes down and back up, and that reads as the chapter
 * change it is.
 *
 * Built from the sidecar rather than from `CUTS` alone, so a partial capture (`--only`) still lines
 * its captions up against the frames that actually exist.
 */
export const RAMP = 0.5 * FPS;
const JOIN = 2.0 * FPS;

export function captionTimeline(specs) {
  const byId = new Map(CUTS.map((cut) => [cut.id, cut]));
  const startOf = new Map();
  const order = [];
  for (const one of specs) {
    if (startOf.has(one.cut)) continue;
    startOf.set(one.cut, one.frame - one.i);
    order.push(one.cut);
  }
  const entries = [];
  for (const id of order) {
    const cut = byId.get(id);
    if (!cut) continue;
    const start = startOf.get(id);
    for (const caption of cut.captions ?? []) {
      entries.push({
        caption, band: cut.band, y: caption.y,
        from: start + caption.from * FPS,
        to: start + caption.to * FPS,
      });
    }
  }
  // The run each one belongs to: walk out both ways while the plate is the same height and the
  // gap is short enough that taking the paper away would read as a blink rather than as a pause.
  entries.forEach((entry, at) => {
    let first = at;
    let last = at;
    while (first > 0 && entries[first - 1].band === entry.band
      && entries[first].from - entries[first - 1].to <= JOIN) first -= 1;
    while (last < entries.length - 1 && entries[last + 1].band === entry.band
      && entries[last + 1].from - entries[last].to <= JOIN) last += 1;
    entry.runFrom = entries[first].from;
    entry.runTo = entries[last].to;
  });
  return entries;
}

export { D, easeInOut, easeOut };
