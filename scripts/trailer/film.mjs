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
      { from: 0.6, to: 2.9, line: 'I was given one citadel.' },
      { from: 3.2, to: 5.1, line: 'The country would not wait.' },
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
      { from: 0.3, to: 2.4, line: 'Forty-two provinces around it.' },
      { from: 2.7, to: 4.5, line: 'I meant to hold them all.' },
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
      { from: 0.4, to: 4.4, line: 'My ministers asked me', line2: 'where we should press.' },
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
    captions: [
      { from: 0.4, to: 2.7, line: 'The realm learned as it grew.' },
      { from: 3.0, to: 5.0, line: 'I chose what it learned.' },
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
    captions: [
      { from: 0.4, to: 2.6, line: 'Three answered the call.' },
      { from: 2.9, to: 4.5, line: 'The treasury could pay one.' },
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
      { from: 0.4, to: 2.3, line: 'I raised walls where I could.' },
      { from: 2.6, to: 4.0, line: 'And rice where I could not.' },
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
      { from: 0.3, to: 3.6, line: 'Then the north came down,', line2: 'the way it always does.' },
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
      { from: 0.4, to: 3.0, line: 'We formed up. The drum fell in five.' },
      { from: 3.3, to: 5.5, line: 'Every man on it, my own land raised.' },
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
      { from: 0.3, to: 2.4, line: 'They showed me what they held.' },
      { from: 3.4, to: 6.5, line: 'I answered with what breaks it.' },
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
      { from: 0.2, to: 2.6, line: 'Then I leaned on it.' },
      { from: 3.0, to: 5.5, line: 'We were outnumbered. We usually are.' },
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
      { from: 0.4, to: 3.2, line: 'The chroniclers wrote it all down.', line2: 'Most of it is even true.' },
      { from: 3.5, to: 6.5, line: 'There is no winning this —', line2: 'only how far I got.' },
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

export { D, easeInOut, easeOut };
