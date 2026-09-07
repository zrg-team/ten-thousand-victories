// Verifies the front-page utility controls and language picker through real canvas taps.
// Usage: DEV_URL=http://127.0.0.1:5179 node test_scripts/verify/verify-menu-icons-flags.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.DEV_URL ?? 'http://127.0.0.1:5179';
const OUT = 'output/web-game/menu-icons-flags';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (pass, label, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
};

const openMenu = async (language = 'en', height = 844) => {
  const page = await browser.newPage({ viewport: { width: 390, height }, deviceScaleFactor: 2 });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`CONSOLE: ${message.text()}`);
  });
  await page.addInitScript((code) => {
    if (code === null) localStorage.removeItem('mandate:language:v1');
    else localStorage.setItem('mandate:language:v1', code);
  }, language);
  await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  return page;
};

const utilityPoint = (page, id) => page.evaluate((utilityId) => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const button = scene.children.list.find((child) => child.getData?.('menuUtility') === utilityId);
  const hit = button?.list.find((part) => part.type === 'Rectangle');
  return button && hit ? { x: button.x + hit.x, y: button.y + hit.y } : null;
}, id);

const supportLayout = (page) => page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const row = scene.children.list.find((child) => child.getData?.('menuSupportRow') === true);
  if (!row) return null;
  const links = row.list
    .filter((child) => child.getData?.('menuSupportLink'))
    .map((link) => {
      const hit = link.list.find((part) => part.type === 'Rectangle');
      return {
        id: link.getData('menuSupportLink'),
        x: link.x,
        y: link.y,
        hitLeft: link.x + hit.x - hit.width / 2,
        hitRight: link.x + hit.x + hit.width / 2,
      };
    });
  const text = [];
  const walk = (items) => items.forEach((item) => {
    if (typeof item?.text === 'string') text.push(item.text);
    if (item?.list) walk(item.list);
  });
  walk(row.list);
  return { scale: row.scaleX, links, text };
});

const checkSupportLayout = (layout, language) => {
  const coffee = layout?.links.find((link) => link.id === 'coffee');
  const improve = layout?.links.find((link) => link.id === 'improve');
  check(Boolean(layout)
      && layout.links.length === 2
      && coffee.y === improve.y
      && coffee.x < improve.x
      && improve.hitLeft - coffee.hitRight >= 3
      && !layout.text.some((line) => /or even better|hay hơn nữa/i.test(line)),
    `${language} support actions share one line without the connective phrase`, JSON.stringify(layout));
};

// A fresh install has no stored preference: Vietnamese is the product default, not a test setup.
const defaultPage = await openMenu(null, 620);
const freshLanguage = await defaultPage.evaluate(() => ({
  state: JSON.parse(window.render_game_to_text()).language,
  stored: localStorage.getItem('mandate:language:v1'),
  documentLanguage: document.documentElement.lang,
}));
check(freshLanguage.state === 'vi' && freshLanguage.stored === null && freshLanguage.documentLanguage === 'vi',
  'fresh installs default to Vietnamese without manufacturing a saved preference', JSON.stringify(freshLanguage));
await defaultPage.screenshot({ path: `${OUT}/menu-default-vi-620.png` });
await defaultPage.close();

// Main visual/state pass. A saved English choice must still win over the Vietnamese fallback.
const page = await openMenu('en', 844);
const structure = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const utilities = scene.children.list
    .filter((child) => child.getData?.('menuUtility'))
    .map((button) => ({
      id: button.getData('menuUtility'),
      ghost: button.getData('ghostWithIcon'),
      icon: button.getData('utilityIcon'),
      x: button.x,
      icons: button.list.filter((part) => part.type === 'Container').length,
      labels: button.list.filter((part) => part.type === 'Text').map((part) => part.text),
    }));
  const secondary = scene.children.list
    .filter((child) => child.getData?.('menuSecondary'))
    .map((button) => ({
      id: button.getData('menuSecondary'),
      bounds: button.getData('visualBounds'),
      hitHeight: button.list.find((part) => part.type === 'Rectangle')?.height,
      fontSizes: button.list
        .filter((part) => part.type === 'Text')
        .map((part) => Number.parseFloat(part.style.fontSize)),
    }));
  const flags = scene.children.list
    .filter((child) => child.getData?.('languageFlag'))
    .map((flag) => ({ id: flag.getData('languageFlag'), x: flag.x, drawn: flag.list.some((part) => part.type === 'Graphics') }));
  return { utilities, secondary, flags, textState: JSON.parse(window.render_game_to_text()) };
});
check(structure.utilities.length === 3
    && structure.utilities.every((button) => button.ghost && button.icons === 1 && button.labels.length === 1),
  'all three utility actions are icon-led ghost controls', JSON.stringify(structure.utilities));
const utilityGaps = structure.utilities.slice(1).map((button, index) => button.x - structure.utilities[index].x);
check(structure.utilities.find((button) => button.id === 'history')?.icon === 'book'
    && utilityGaps.every((gap) => gap <= 90),
  'History uses a book icon and the utility row is compact', JSON.stringify({ utilityGaps, utilities: structure.utilities }));
// A row that carries a second line needs the units for it — the dynasty plate prints its level
// under its name — so the ceiling is 32 for a one-line plate and 40 for a two-line one. Everything
// else about the tier holds either way: 240 wide, 44 of touch, and type no larger than the label
// size the primary is deliberately bigger than.
// One plate on the front page now — Classic Modes. Continue is a link and the house is a tablet,
// and both carry their own data keys precisely so they are not measured against this tier's rules.
check(structure.secondary.length >= 1
    && structure.secondary.every((button) => button.bounds.width === 240
      && button.bounds.height <= (button.fontSizes.length > 1 ? 40 : 32)
      && button.hitHeight >= 44
      && Math.max(...button.fontSizes) <= 12),
  'the secondary tier keeps short plates, small type and full touch heights', JSON.stringify(structure.secondary));
check(structure.flags.length === 2
    && structure.flags.every((flag) => flag.drawn)
    && structure.flags.find((flag) => flag.id === 'vi').x < structure.flags.find((flag) => flag.id === 'en').x,
  'both flags are drawn and Vietnamese is first', JSON.stringify(structure.flags));
check(JSON.stringify(structure.textState.languageOptions) === JSON.stringify(['vi', 'en'])
    && JSON.stringify(structure.textState.actions) === JSON.stringify(['guide', 'history', 'settings']),
  'menu text-state matches the visible action and language order', JSON.stringify(structure.textState));
checkSupportLayout(await supportLayout(page), 'English');
await page.screenshot({ path: `${OUT}/menu-en-844.png` });

// Chromium only exposes install after `beforeinstallprompt`; raise the same event the browser does
// so the optional footer state is measured rather than depending on this machine's PWA heuristics.
await page.evaluate(() => {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.defineProperties(event, {
    platforms: { value: ['web'] },
    prompt: { value: async () => {} },
    userChoice: { value: Promise.resolve({ outcome: 'dismissed', platform: 'web' }) },
  });
  window.dispatchEvent(event);
});
await page.waitForTimeout(120);
const install = await page.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  const icon = scene.children.list.find((child) => child.getData?.('menuInstallMark') === true);
  const hit = scene.children.list.find((child) => child.getData?.('menuInstallHit') === true);
  const version = scene.children.list.find((child) => child.getData?.('menuVersionLine') === true);
  if (!icon || !hit || !version) return null;
  const iconSize = icon.getData('visualSize');
  const versionLeft = version.x - version.displayWidth / 2;
  const versionRight = version.x + version.displayWidth / 2;
  return {
    inline: icon.getData('footerInline'),
    iconSize,
    iconScale: icon.scaleX,
    iconX: icon.x,
    iconY: icon.y,
    versionLeft,
    versionCenterY: version.y - version.displayHeight / 2,
    groupCenter: (icon.x - iconSize / 2 + versionRight) / 2,
    hitWidth: hit.width,
    hitHeight: hit.height,
  };
});
check(Boolean(install)
    && install.inline === true
    && install.iconSize >= 15 && install.iconSize <= 17
    && Math.abs(install.iconScale - 0.62) < 0.001
    && Math.abs(install.iconY - install.versionCenterY) <= 1
    && install.iconX + install.iconSize / 2 < install.versionLeft
    && Math.abs(install.groupCenter - 195) <= 1
    && install.hitWidth === 44 && install.hitHeight === 44,
  'install uses the shared footer-icon size and sits inline with the centred build stamp', JSON.stringify(install));

// The mark only ever rides the front page's colophon. The settings page — its own scene now, the
// same kind of page as How to Play and History — used to get a lone download arrow dropped in the
// bottom-left corner of the sheet, attached to nothing and captioned by nothing.
const orphan = await page.evaluate(async () => {
  const game = window.__phaserGame;
  game.scene.getScene('MenuScene').scene.start('SettingsScene');
  await new Promise((resolve) => setTimeout(resolve, 800));
  const scene = game.scene.getScene('SettingsScene');
  const drawn = {
    opened: game.scene.isActive('SettingsScene'),
    mark: Boolean(scene.children.list.find((c) => c.getData?.('menuInstallMark') === true)),
    hit: Boolean(scene.children.list.find((c) => c.getData?.('menuInstallHit') === true)),
  };
  scene.scene.start('MenuScene');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return drawn;
});
check(orphan.opened && !orphan.mark && !orphan.hit,
  'the settings page draws no orphan install mark', JSON.stringify(orphan));
// Let the one-visit install hint retract before judging the footer itself.
await page.waitForTimeout(2300);
await page.screenshot({ path: `${OUT}/menu-install-inline-en-844.png` });

// Both language choices are reached by tapping the combined flag-and-label hit target.
const clickLanguage = async (id) => {
  const point = await page.evaluate((languageId) => {
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    const hit = scene.children.list.find((child) => child.getData?.('languageOption') === languageId);
    return hit ? { x: hit.x, y: hit.y } : null;
  }, id);
  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(220);
  return page.evaluate((languageId) => JSON.parse(window.render_game_to_text()).language === languageId
    && localStorage.getItem('mandate:language:v1') === languageId, id);
};
check(await clickLanguage('vi'), 'Vietnamese flag switches the menu to Vietnamese');
checkSupportLayout(await supportLayout(page), 'Vietnamese');
await page.screenshot({ path: `${OUT}/menu-vi-844.png` });
check(await clickLanguage('en'), 'English flag switches the menu back to English');
await page.close();

// Every modified utility action keeps its original route.
for (const [id, sceneKey] of [['guide', 'GuideScene'], ['history', 'HistoryScene'], ['settings', 'SettingsScene']]) {
  const routePage = await openMenu('en', 844);
  const point = await utilityPoint(routePage, id);
  if (point) await routePage.mouse.click(point.x, point.y);
  const opened = await routePage.waitForFunction((key) => window.__phaserGame.scene.isActive(key), sceneKey, { timeout: 8000 })
    .then(() => true).catch(() => false);
  check(Boolean(point) && opened, `${id} ghost control keeps its route`);
  await routePage.close();
}

// Short Vietnamese sheet: the longest labels and tightest vertical budget.
const shortPage = await openMenu('vi', 620);
const shortFlags = await shortPage.evaluate(() => {
  const scene = window.__phaserGame.scene.getScene('MenuScene');
  return scene.children.list
    .filter((child) => child.getData?.('languageFlag'))
    .map((flag) => ({ id: flag.getData('languageFlag'), x: flag.x, y: flag.y }));
});
check(shortFlags.length === 2 && shortFlags.every((flag) => flag.y > 0 && flag.y < 620),
  'flag picker remains visible at 390×620', JSON.stringify(shortFlags));
await shortPage.screenshot({ path: `${OUT}/menu-vi-620.png` });
await shortPage.close();

check(errors.length === 0, 'no browser console errors', errors.slice(0, 2).join(' | '));
await browser.close();
const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
