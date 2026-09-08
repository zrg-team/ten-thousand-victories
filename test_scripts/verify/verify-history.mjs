// The History page: reachable from the menu, five sections that actually fill, a list you can drag
// without picking a row, and every line of it written in both languages.
//
// The last check is the one that cannot be seen in a screenshot. History prose lives outside the
// validated catalogues on purpose (a missing line falls back to English rather than crashing the
// game at import), so nothing else in the project would ever notice a Vietnamese paragraph that
// was never written.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5179';
const TABS = ['dynasties', 'figures', 'stories', 'army', 'terms'];
// How many headings a tab must draw, and how many entries opening every one of them must reach.
//
// The second number is the one that matters. The lists are grouped by hand against catalogues that
// grow — `STORY_GROUPS` names forty-eight stories and `storyCatalogIds` will one day name more —
// and the failure mode of a stale grouping is silent: the entry is filed nowhere, drawn nowhere,
// and missing from the one page in this game that promises to be complete about the record. The
// sweep below opens every drawer and counts what actually comes out.
const MIN_SECTIONS = { dynasties: 6, figures: 6, stories: 7, terms: 4 };
const MIN_ENTRIES = { dynasties: 14, figures: 51, stories: 48, terms: 24 };
// Army is a plate you change rather than a list you open, so the accordion assertion does not
// apply to it — it gets its own, below.
const ACCORDION = TABS.filter((tab) => tab !== 'army');

const browser = await chromium.launch();
let bad = 0;
const fail = (message) => { bad += 1; console.log(`FAIL  ${message}`); };

for (const [lang, height] of [['en', 844], ['vi', 844], ['vi', 620]]) {
  const tag = `${lang} h=${height}`;
  const page = await browser.newPage({ viewport: { width: 390, height }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Language is read from localStorage at boot, so it has to be set before navigation.
  await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Reached by pressing the real button, not by starting the scene: a History page nothing can
  // navigate to is the failure this check exists for. Design units are CSS pixels here — the
  // render scale inflates the game size and the camera zoom takes it straight back out.
  // Polled, not sampled once: the front page builds over about a second and the button is not in
  // `children.list` until it does.
  const button = await page.waitForFunction(() => {
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    for (const child of scene.children.list) {
      const label = child.list?.find?.((k) => k.type === 'Text');
      // `history.menu.button` — "History" / "Lịch sử". It used to read "Real History" / "Sử thật"
      // and this harness was still looking for that, so it reported "no History button on the front
      // page" on every run regardless of the page. Not a Phaser 4 change; found while migrating.
      if (label && /Lịch sử|History/.test(label.text)) {
        // The label's own centre, not the container's corner plus half a width that was measured
        // once. The front page has been relaid since — the button is 122 wide now, not 282 — and
        // the old arithmetic was pressing bare paper 20 units to the right of it.
        const m = label.getWorldTransformMatrix();
        return { x: m.tx, y: m.ty };
      }
    }
    return null;
  }, null, { timeout: 15000 }).then((handle) => handle.jsonValue()).catch(() => null);
  if (!button) {
    fail(`${tag}  no History button on the front page`);
    await page.close();
    continue;
  }
  await page.mouse.click(button.x, button.y);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('HistoryScene'), null, { timeout: 8000 })
    .catch(() => {});
  if (!(await page.evaluate(() => window.__phaserGame.scene.isActive('HistoryScene')))) {
    fail(`${tag}  the History button did not open the page`);
    await page.close();
    continue;
  }
  await page.waitForTimeout(700);

  // Computed, not typed. These were four hardcoded numbers, and adding a fifth tab left every one
  // of them pointing at a neighbour: the harness clicked Army, counted its objects, and reported
  // them as a shortfall in Stories. A test that lies about which screen it is on is worse than no
  // test. SIDE and the tab width come straight from HistoryScene's own arithmetic.
  const pressTab = async tab => {
    const point = await page.evaluate(tab => {
      const s = window.__phaserGame.scene.getScene('HistoryScene');
      const button = s.children.list.find(o => o.getData('historyTab') === tab);
      const label = button.list.find(o => o.type === 'Text');
      const m = label.getWorldTransformMatrix();
      return { x: m.tx, y: m.ty };
    }, tab);
    await page.mouse.click(point.x, point.y);
  };
  for (const [index, tab] of TABS.entries()) {
    await pressTab(tab);
    await page.waitForTimeout(450);
    if (!ACCORDION.includes(tab)) {
      // The wardrobe: pressing a dynasty chip has to redraw the plate. The chip is **found**, not
      // measured off the list top: it used to be the hardcoded point (146, 319), and the day the
      // wardrobe plate grew to give its soldier room the click landed on empty paper and the page
      // was reported as broken when only the test was. Same rule as the tab arithmetic above.
      const before = await page.evaluate(() => {
        const scene = window.__phaserGame.scene.getScene('HistoryScene');
        return `${scene.armyTheme}/${scene.armyTier}/${scene.armyArm}`;
      });
      await page.evaluate(() => window.__phaserGame.scene.getScene('HistoryScene').showContents());
      const chip = await page.evaluate(() => {
        const scene = window.__phaserGame.scene.getScene('HistoryScene');
        let found = null;
        const walk = (obj) => {
          if (obj.type === 'Text' && obj.text === 'Trần') {
            const b = obj.getBounds();
            found = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          }
          if (obj.list) obj.list.forEach(walk);
        };
        scene.children.list.forEach(walk);
        return found;
      });
      if (chip) await page.mouse.click(chip.x, chip.y);
      await page.waitForTimeout(350);
      const after = await page.evaluate(() => {
        const scene = window.__phaserGame.scene.getScene('HistoryScene');
        return `${scene.armyTheme}/${scene.armyTier}/${scene.armyArm}`;
      });
      if (before === after) fail(`${tag}  ${tab}: pressing a dynasty chip changed nothing (${before})`);
      else console.log(`PASS  ${tag}  ${tab}: chip redraws the plate — ${before} -> ${after}`);
      continue;
    }

    // ── the drawers ──
    // Positions are read off the objects rather than typed. Headings wrap to two lines in
    // Vietnamese and to one in English, so every row on the page now sits at a y that depends on
    // what the heading above it says — and a hard-coded click is a check that passes on the day it
    // is written and silently presses the wrong thing ever after.
    const sections = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      return (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o]))
        .filter((o) => o.getData?.('sectionKey') != null)
        .map((o) => {
          const m = o.getWorldTransformMatrix();
          return { key: o.getData('sectionKey'), x: m.tx, y: m.ty };
        });
    });
    if (sections.length < MIN_SECTIONS[tab]) {
      fail(`${tag}  ${tab}: ${sections.length} headings, expected at least ${MIN_SECTIONS[tab]}`);
      continue;
    }

    const listState = () => page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      return {
        rows: (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o])).filter((o) => o.getData?.('rowKey') != null).length,
        open: scene.openSection[scene.tab],
        // Set by the stagger's setup rather than read off a live tween, so this asserts the
        // animation ran without racing a 170ms tween on a fast machine.
        staggered: (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o])).some((o) => o.getData?.('sectionRevealed') === true),
      };
    });
    // The first heading is the one each tab opens on and the list starts at the top, so it is the
    // one heading guaranteed to be on screen. Press it and the section shuts; press it again and
    // it comes back.
    // Contents now opens with every section collapsed. Open the first before testing its fold.
    const first = await page.evaluate(key => {
      const s = window.__phaserGame.scene.getScene('HistoryScene');
      s.applyToggle(key, true);
      const h = s.scroll.content.list.find(o => o.getData('sectionKey') === key);
      const m = h.getWorldTransformMatrix();
      return { key, x: m.tx, y: m.ty };
    }, sections[0].key);
    await page.waitForTimeout(450);
    const before = await listState();
    await page.mouse.click(first.x + 60, first.y + 12);
    // Caught mid-fold. Shutting a section animates the rows that are already drawn and only
    // rebuilds when they have gone, so for about two hundred milliseconds the page is still
    // showing them — which is the whole point, and is invisible once it has finished.
    await page.waitForTimeout(70);
    const folding = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      return { closing: scene.closing, rows: (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o])).filter((o) => o.getData?.('rowKey') != null).length };
    });
    if (!folding.closing || folding.rows === 0) {
      fail(`${tag}  ${tab}: shutting a section did not animate (closing=${folding.closing}, rows=${folding.rows})`);
    }
    await page.waitForTimeout(500);
    const shut = await listState();
    if (shut.open !== '') fail(`${tag}  ${tab}: pressing the open heading did not shut it (${shut.open})`);
    if (shut.rows >= before.rows) fail(`${tag}  ${tab}: shutting a section still drew ${shut.rows} rows`);
    const reopening = await page.evaluate(key => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      const header = scene.scroll.content.list.find(o => o.getData('sectionKey') === key);
      const m = header.getWorldTransformMatrix();
      return {x:m.tx, y:m.ty};
    }, first.key);
    await page.mouse.click(reopening.x + 60, reopening.y + 12);
    await page.waitForTimeout(420);
    const reopened = await listState();
    if (reopened.open !== first.key) fail(`${tag}  ${tab}: the heading did not reopen (${reopened.open})`);
    else if (!reopened.staggered) fail(`${tag}  ${tab}: the reopened section's rows did not animate in`);
    else console.log(`PASS  ${tag}  ${tab}: ${sections.length} headings, "${first.key}" shuts and reopens`);

    // Open every drawer in turn and count the distinct entries that come out. Driven through the
    // scene rather than the mouse on purpose: a heading seven sections down is off screen until
    // the ones above it are shut, and what is being proved here is coverage, not hit testing —
    // the tap is proved directly above.
    const sweep = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      const keys = (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o]))
        .filter((o) => o.getData?.('sectionKey') != null)
        .map((o) => o.getData('sectionKey'));
      const seen = new Set();
      for (const key of keys) {
        scene.openSection[scene.tab] = key;
        scene.render();
        for (const o of (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o]))) {
          const row = o.getData?.('rowKey');
          if (row != null) seen.add(row);
        }
        // Only the rows near the window are built now; the rest of the section exists as lazy
        // rows the scroll area has measured but not drawn. Those count as reachable too.
        for (const lazy of scene.scroll?.lazyRows ?? []) seen.add(lazy.key);
      }
      scene.openSection[scene.tab] = keys[0];
      scene.render();
      return { entries: seen.size, sections: keys.length, filed: keys.includes('other') };
    });
    if (sweep.filed) fail(`${tag}  ${tab}: entries have fallen through into the "not filed yet" heading`);
    if (sweep.entries < MIN_ENTRIES[tab]) {
      fail(`${tag}  ${tab}: ${sweep.entries} entries across ${sweep.sections} sections, expected at least ${MIN_ENTRIES[tab]}`);
    } else {
      console.log(`PASS  ${tag}  ${tab}: ${sweep.entries} entries reachable across ${sweep.sections} sections`);
    }

    // Every list tab expands a row, and every one animates the row it expanded. Both were wired
    // per-tab, so both can be forgotten per-tab.
    const row = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      const card = (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o])).find((o) => o.getData?.('rowKey') != null);
      if (!card) return null;
      const before = card.getWorldTransformMatrix();
      scene.scroll.setScroll(scene.scroll.offset + before.ty - scene.listTop - 20);
      const m = card.getWorldTransformMatrix();
      return { key: card.getData('rowKey'), x: m.tx, y: m.ty };
    });
    if (!row) {
      fail(`${tag}  ${tab}: no tappable row under the open heading`);
      continue;
    }
    await page.mouse.click(row.x + 60, row.y + 16);
    await page.waitForTimeout(350);
    const opened = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      return {
        expanded: scene.expanded ?? null,
        revealed: (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o])).some((o) => o.getData?.('revealed') === true),
      };
    });
    if (opened.expanded !== row.key) fail(`${tag}  ${tab}: tapping "${row.key}" opened ${opened.expanded}`);
    else if (!opened.revealed) fail(`${tag}  ${tab}: the opened row did not animate in`);
    // Close it again, so the next tab starts from the same place this one did.
    await page.mouse.click(row.x + 60, row.y + 16);
    await page.waitForTimeout(250);
  }

  // Back to the first tab, then the gesture pair: a drag must scroll and must NOT open a row; a
  // tap must open one. Getting this backwards is the classic scrolling-list defect.
  await pressTab('dynasties');
  await page.evaluate(() => {
    const scene=window.__phaserGame.scene.getScene('HistoryScene');
    scene.expanded=undefined;
    scene.render();
    const card=scene.scroll.content.list.find(o=>o.getData('rowKey'));
    if(card)scene.scroll.setScroll(card.y-12);
  });
  await page.waitForTimeout(400);
  await page.mouse.move(195, Math.min(500, height - 120));
  await page.mouse.down();
  await page.mouse.move(195, Math.min(500, height - 120) - 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const afterDrag = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('HistoryScene');
    return { offset: -(scene.scroll?.content.y ?? 0), expanded: scene.expanded ?? null };
  });
  if (afterDrag.offset <= 0) fail(`${tag}  dragging the list did not scroll it`);
  if (afterDrag.expanded) fail(`${tag}  dragging the list opened "${afterDrag.expanded}"`);

  // Aimed at a row rather than at a pixel, for the same reason as above: after a 120-unit drag,
  // whatever is at y=300 depends on how tall the heading above it wrapped to.
  const target = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('HistoryScene');
    const top = scene.listTop;
    const bottom = top + scene.listHeight();
    for (const o of (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o]))) {
      if (o.getData?.('rowKey') == null) continue;
      const m = o.getWorldTransformMatrix();
      const y = Math.max(top + 16, m.ty + 16);
      const rowBottom = m.ty + (o.getData('cardHeight') ?? 0);
      if (y < bottom - 12 && y < rowBottom - 8) return { x: m.tx, y };
    }
    return null;
  });
  if (!target) fail(`${tag}  no row left in the window after the drag`);
  await page.mouse.click(target ? target.x + 60 : 195, target ? target.y : 300);
  await page.waitForTimeout(400);
  const afterTap = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('HistoryScene');
    // The opened card carries a tag set by the reveal tween's setup, so this asserts the animation
    // ran without racing a 170ms tween.
    const revealed = (scene.scroll?.content.list ?? []).flatMap((o) => (o.getData?.('virtualKey') != null ? o.list : [o])).some((o) => o.getData?.('revealed') === true);
    return { offset: -(scene.scroll?.content.y ?? 0), expanded: scene.expanded ?? null, revealed };
  });
  if (!afterTap.expanded) fail(`${tag}  tapping a row did not open it`);
  if (!afterTap.revealed) fail(`${tag}  the opened row did not animate in`);
  // Opening a row rebuilds the list; a rebuild that forgets where the reader was is a bug you only
  // notice forty rows down.
  if (afterTap.offset === 0 && afterDrag.offset > 0) fail(`${tag}  opening a row threw the list back to the top`);
  if (!afterDrag.expanded && afterTap.expanded) console.log(`PASS  ${tag}  drag scrolls, tap opens, position kept`);

  // And back out again. Found by its label rather than by a coordinate: this used to be a chevron
  // at (44, 24) and the harness still clicked there long after the exit moved to a button at the
  // foot of the page, so "Back did not return to the menu" failed on every run. Not a Phaser 4
  // change; found while migrating.
  const back = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('HistoryScene');
    const hit = (node) => {
      const label = node.list?.find?.((k) => k.type === 'Text');
      if (label && node.getData('historyBack')) {
        const m = label.getWorldTransformMatrix();
        return { x: m.tx, y: m.ty };
      }
      return null;
    };
    for (const child of scene.children.list) {
      const found = hit(child);
      if (found) return found;
    }
    return null;
  });
  if (!back) fail(`${tag}  no Back control on the page`);
  await page.mouse.click(back?.x ?? 44, back?.y ?? 24);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 8000 })
    .catch(() => {});
  if (!(await page.evaluate(() => window.__phaserGame.scene.isActive('MenuScene')))) {
    fail(`${tag}  Back did not return to the menu`);
  }

  if (errors.length) fail(`${tag}  console: ${errors.slice(0, 2).join(' | ')}`);
  await page.close();
}

// Coverage: every key the page asks for has to resolve in Vietnamese as well as English.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => fail(`coverage page error: ${e.message}`));
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
const missing = await page.evaluate(async () => {
  const history = await import('/src/i18n/history/index.ts');
  const data = await import('/src/data/history/index.ts');
  const story = await import('/src/i18n/story/index.ts');
  const wanted = [];
  for (const era of data.HISTORY_ERAS) {
    wanted.push(`eras.${era.id}.title`, `eras.${era.id}.body`, `eras.${era.id}.inGame`);
  }
  for (const term of data.GLOSSARY_TERMS) {
    wanted.push(`terms.${term}.title`, `terms.${term}.body`);
  }
  // The headings, and the one line under each that says what is behind it. These are always on
  // screen, so a miss here is the most visible kind there is.
  for (const [kind, groups] of [['eras', data.ERA_PERIODS], ['stories', data.STORY_GROUPS], ['terms', data.TERM_GROUPS]]) {
    for (const group of groups) {
      wanted.push(`groups.${kind}.${group.id}.title`, `groups.${kind}.${group.id}.note`);
    }
  }
  wanted.push('groups.other.title', 'groups.other.note');
  // Story notes are allowed to be unwritten — the page says so in words. What is NOT allowed is a
  // note written in one language only.
  for (const id of story.storyCatalogIds) {
    if (history.hasHistoryText(`stories.${id}.happened`, 'en')) {
      wanted.push(`stories.${id}.happened`, `stories.${id}.inGame`);
    }
  }
  return {
    en: wanted.filter((key) => !history.hasHistoryText(key, 'en')),
    vi: wanted.filter((key) => !history.hasHistoryText(key, 'vi')),
    total: wanted.length,
    // Nothing may be left over. The page draws the remainder under a "not filed yet" heading so a
    // new entry is never silently dropped, but shipping that heading is a failure, not a feature.
    unfiled: [
      ...data.ungroupedIds(data.ERA_PERIODS, data.HISTORY_ERAS.map((era) => era.id)),
      ...data.ungroupedIds(data.STORY_GROUPS, story.storyCatalogIds),
      ...data.ungroupedIds(data.TERM_GROUPS, data.GLOSSARY_TERMS),
    ],
  };
});
if (missing.unfiled.length) {
  fail(`${missing.unfiled.length} entries are in no section: ${missing.unfiled.slice(0, 6).join(', ')}`);
} else {
  console.log('PASS  every age, story and term is filed under a heading');
}
if (missing.en.length) fail(`English prose missing ${missing.en.length}: ${missing.en.slice(0, 4).join(', ')}`);
if (missing.vi.length) fail(`Vietnamese prose missing ${missing.vi.length}: ${missing.vi.slice(0, 4).join(', ')}`);
if (!missing.en.length && !missing.vi.length) console.log(`PASS  all ${missing.total} history keys resolve in both languages`);
await page.close();

await browser.close();
console.log(bad === 0 ? 'HISTORY PAGE OK' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
