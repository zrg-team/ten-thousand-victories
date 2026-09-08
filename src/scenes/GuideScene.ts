import Phaser from 'phaser';
import { loadPageAssets, showPageLoading } from '../ui/pageLoading';
import { GAME_HEIGHT, GAME_WIDTH, surfaceWidth } from '../game/constants';
import { applyRenderScale } from '../game/graphicsQuality';
import { LAYOUT_RESIZED } from '../game/desktopResize';
import { getLanguage, t, type TranslationKey } from '../i18n';
import { GUIDE_ENTRIES, GUIDE_TABS, type GuideEntry, type GuideTab } from '../data/guide';
import { BACK_BAR_BAND, BACK_BAR_HEIGHT, InkUI, INK_UI, type InkScrollArea } from '../ui/InkUI';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import { attachDesktopBackdrop } from '../ui/desktopBackdrop';
import { isDesktopLayout } from '../platform/layout';
import { launchGuideCopilot, type GuideCopilot } from './guide/launchCopilot';
import { FORMATION_RING, formationTier } from '../data/ascent/formations';

const GAP = 14;
const COPILOTS: readonly GuideCopilot[] = ['conquest', 'battle', 'menu', 'classic'];
const imageKey = (entry: GuideEntry): string => `guide:${getLanguage()}:${entry.image}`;

/** A visual field guide. Launchers stay in view while either chapter scrolls. */
export class GuideScene extends Phaser.Scene {
  private ui!: InkUI;
  private tab: GuideTab = 'conquest';
  private chrome?: Phaser.GameObjects.Container;
  private page?: Phaser.GameObjects.Container;
  private scroll?: InkScrollArea;
  private viewer?: Phaser.GameObjects.Container;
  private viewing?: string;
  private offsets: Record<GuideTab, number> = { conquest: 0, battle: 0 };
  private returnTo = 'MenuScene';
  private width = 366;
  private left = 12;
  private listTop = 0;
  private entryTops: Record<string, number> = {};
  private readonly resize = (): void => { this.rememberScroll(); this.render(); };
  private readonly escape = (): void => { if (this.viewer) this.closeImage(); else this.scene.start(this.returnTo); };

  constructor() { super('GuideScene'); }

  init(data?: { returnTo?: string; tab?: GuideTab }): void {
    this.returnTo = data?.returnTo ?? 'MenuScene';
    this.tab = data?.tab === 'battle' ? 'battle' : 'conquest';
    this.offsets = { conquest: 0, battle: 0 };
  }

  preload(): void {
    showPageLoading(this);
    this.queueChapter(this.tab);
  }

  private queueChapter(tab: GuideTab): void {
    for (const entry of GUIDE_ENTRIES.filter(entry => entry.tab === tab)) {
      if (!this.textures.exists(imageKey(entry))) {
        this.load.image(imageKey(entry), `${import.meta.env.BASE_URL}art/guide/${getLanguage()}/${entry.image}.webp`);
      }
    }
  }

  create(): void {
    applyRenderScale(this);
    attachDesktopBackdrop(this);
    this.ui = new InkUI(this);
    this.game.events.on(LAYOUT_RESIZED, this.resize);
    this.input.keyboard?.on('keydown-ESC', this.escape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(LAYOUT_RESIZED, this.resize);
      this.input.keyboard?.off('keydown-ESC', this.escape);
      this.clear();
    });
    this.render();
  }

  /** Exposed through the game's existing text-state hook for navigation and QA. */
  guideState(): object {
    return {
      mode: 'guide', language: getLanguage(), tab: this.tab, tabs: GUIDE_TABS,
      copilotLaunchers: COPILOTS, expandedImage: this.viewing,
      scrollOffset: Math.round(this.scroll?.offset ?? 0),
      entries: GUIDE_ENTRIES.filter(entry => entry.tab === this.tab).map(entry => ({
        id: entry.id, heading: t(entry.heading), image: `art/guide/${getLanguage()}/${entry.image}.webp`,
        imageLoaded: this.textures.exists(imageKey(entry)),
        sections: entry.sections.map(section => t(section.heading)),
      })),
    };
  }

  private rememberScroll(): void { this.offsets[this.tab] = this.scroll?.offset ?? 0; }

  private clear(): void {
    this.closeImage();
    this.scroll?.destroy();
    this.scroll = undefined;
    this.page?.destroy(true);
    this.page = undefined;
    this.chrome?.destroy(true);
    this.chrome = undefined;
  }

  private render(): void {
    this.clear();
    this.width = isDesktopLayout() ? Math.min(860, surfaceWidth() - 64) : GAME_WIDTH - 24;
    this.left = (GAME_WIDTH - this.width) / 2;
    this.chrome = this.add.container().setDepth(5);
    this.page = this.add.container();
    this.page.add(this.add.rectangle(this.left - 12, 0, this.width + 24, GAME_HEIGHT,
      INK_UI.parchmentShade).setOrigin(0));
    this.renderHeader();
    this.renderPage();
  }

  private text(x: number, y: number, key: TranslationKey, width: number, size = 12, heading = false): Phaser.GameObjects.Text {
    return this.add.text(x, y, t(key), {
      color: heading ? INK_UI.inkText : INK_UI.mutedText,
      fontFamily: heading ? TITLE_FONT : UI_FONT,
      fontSize: `${size}px`, fontStyle: heading ? '700' : '400',
      lineSpacing: heading ? 2 : 4, wordWrap: { width },
    });
  }

  private renderHeader(): void {
    const chrome = this.chrome!;
    const wide = this.width > 600;
    const header = this.add.graphics();
    chrome.add(header);
    chrome.add(this.text(GAME_WIDTH / 2, 12, 'guide.title', this.width, 21, true).setOrigin(0.5, 0));
    const subtitle = this.text(GAME_WIDTH / 2, 43, 'guide.subtitle', this.width - 14, 11).setOrigin(0.5, 0).setAlign('center');
    chrome.add(subtitle);

    let y = Math.max(72, subtitle.y + subtitle.height + 12);
    chrome.add(this.text(this.left + 10, y, 'guide.copilot.title', this.width - 20, 14, true));
    const note = this.text(this.left + 10, y + 23, 'guide.copilot.note', this.width - 20, 10.5);
    chrome.add(note);
    y = note.y + note.height + 9;
    const columns = wide ? 4 : 2;
    const buttonWidth = (this.width - 20 - (columns - 1) * 8) / columns;
    COPILOTS.forEach((kind, index) => {
      const button = this.ui.button({
        x: this.left + 10 + (index % columns) * (buttonWidth + 8),
        y: y + Math.floor(index / columns) * 50, width: buttonWidth, height: 42,
      }, t(`guide.copilot.${kind}`), () => launchGuideCopilot(this, kind), {
        variant: index < 2 ? 'primary' : 'secondary', fontSize: '12px',
      }).setData('guideCopilot', kind);
      chrome.add(button);
    });
    y += (wide ? 1 : 2) * 50 + 12;
    const tabWidth = (this.width - 8) / 2;
    GUIDE_TABS.forEach((tab, index) => {
      chrome.add(this.ui.button({ x: this.left + index * (tabWidth + 8), y, width: tabWidth, height: 38 },
        `${index + 1}. ${t(`guide.tab.${tab}`)}`, () => {
          if (this.tab === tab) return;
          loadPageAssets(this, () => this.queueChapter(tab), () => {
            this.rememberScroll();
            this.tab = tab;
            this.render();
          });
        }, { variant: this.tab === tab ? 'primary' : 'ghost', fontSize: '14px' },
      ).setData('guideTab', tab));
    });
    this.listTop = y + 48;
    header.fillStyle(INK_UI.parchmentShade, 1);
    header.fillRect(this.left - 12, 0, this.width + 24, this.listTop);
    // Stencil clipping hides scrolled images, but does not remove their input regions.
    // Opaque chrome must also catch presses before they reach a capture underneath it.
    header.setInteractive(new Phaser.Geom.Rectangle(this.left - 12, 0, this.width + 24, this.listTop),
      Phaser.Geom.Rectangle.Contains);
    header.fillStyle(INK_UI.parchment, 0.85);
    header.fillRoundedRect(this.left, Math.max(67, subtitle.y + subtitle.height + 7), this.width,
      y - Math.max(67, subtitle.y + subtitle.height + 7) - 9, 4);
    chrome.add(this.ui.backBar(GAME_HEIGHT - BACK_BAR_HEIGHT - 10, () => this.scene.start(this.returnTo)));
    const foot = this.add.rectangle(this.left - 12, GAME_HEIGHT - BACK_BAR_BAND - 10,
      this.width + 24, BACK_BAR_BAND + 10, INK_UI.parchmentShade).setOrigin(0).setInteractive();
    chrome.addAt(foot, chrome.length - 1);
  }

  private renderPage(): void {
    const height = GAME_HEIGHT - this.listTop - BACK_BAR_BAND - 20;
    const scroll = this.ui.scrollArea({ x: this.left, y: this.listTop, width: this.width, height });
    this.scroll = scroll;
    scroll.addTo(this.page!);
    const intro = this.text(4, 2, `guide.part.${this.tab}`, this.width - 14, 12);
    scroll.content.add(intro);
    let y = intro.height + 18;
    const entries = GUIDE_ENTRIES.filter(entry => entry.tab === this.tab);
    scroll.content.add(this.text(4, y, 'guide.contents', this.width - 14, 14, true));
    y += 28;
    entries.forEach((entry, index) => {
      scroll.content.add(this.ui.button({ x: 4, y, width: this.width - 14, height: 38 },
        `${index + 1}. ${t(entry.heading)}`, () => scroll.setScroll(this.entryTops[entry.id] ?? 0),
        { variant: 'secondary', fontSize: '12px' }).setData('guideJump', entry.id));
      y += 46;
    });
    y += 6;
    this.entryTops = {};
    // Text is measured after wrapping, so longer translations cannot overlap the next section.
    for (const entry of entries) {
      this.entryTops[entry.id] = y;
      y += this.entryCard(scroll, y, entry) + GAP;
    }
    scroll.setContentHeight(y + 16);
    scroll.setScroll(this.offsets[this.tab]);
  }

  private entryCard(scroll: InkScrollArea, y: number, entry: GuideEntry): number {
    const width = this.width - 6;
    const wide = width > 600;
    const holder = this.add.container(0, y).setData('guideEntry', entry.id);
    const background = this.add.graphics();
    holder.add(background);
    const title = this.text(14, 12, entry.heading, width - 28, 17, true);
    holder.add(title);
    const imageTop = title.y + title.height + 12;
    const imageWidth = wide ? Math.floor((width - 42) * 0.47) : width - 28;
    const texture = this.textures.get(imageKey(entry));
    const frame = texture.get();
    const imageHeight = imageWidth * frame.height / Math.max(1, frame.width);
    const capture = this.add.image(14, imageTop, imageKey(entry)).setOrigin(0).setDisplaySize(imageWidth, imageHeight)
      .setData('guideCapture', entry.image);
    holder.add(capture);
    holder.add(this.ui.button({ x: 14, y: imageTop, width: imageWidth, height: imageHeight }, '',
      () => this.openImage(entry), { frameless: true }).setData('guideExpandImage', entry.id));
    const caption = this.text(14, imageTop + imageHeight + 12, 'guide.capture.label', imageWidth - 110, 9.5);
    holder.add(caption);
    holder.add(this.ui.button({ x: 14 + imageWidth - 104, y: imageTop + imageHeight + 3, width: 104, height: 36 },
      t('guide.capture.expand'), () => this.openImage(entry), { variant: 'ghost', fontSize: '10px' },
    ).setData('guideExpand', entry.id));
    const pictureBottom = imageTop + imageHeight + 46;
    const textX = wide ? imageWidth + 30 : 14;
    const textWidth = wide ? width - textX - 14 : width - 28;
    let bottom = wide ? imageTop : pictureBottom;
    if (entry.body) {
      const body = this.text(textX, bottom, entry.body, textWidth, 12);
      holder.add(body);
      bottom += body.height + 14;
    }
    (entry.points ?? []).forEach((key, index) => {
      const point = this.text(textX + 26, bottom, key, textWidth - 26, 12);
      const badge = this.add.circle(textX + 9, bottom + 8, 8.5, INK_UI.cinnabar, 0.12);
      const number = this.add.text(textX + 9, bottom + 8, String(index + 1), {
        fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700', color: '#ab3924',
      }).setOrigin(0.5);
      holder.add([badge, number, point]);
      bottom += point.height + 12;
    });
    bottom = Math.max(bottom, pictureBottom) + 10;
    const rule = this.add.graphics().lineStyle(1, INK_UI.parchmentDark, 1);
    rule.lineBetween(14, bottom, width - 14, bottom);
    holder.add(rule);
    bottom += 16;
    const detailLabel = this.text(14, bottom, 'guide.detail.label', width - 28, 11);
    holder.add(detailLabel);
    bottom += detailLabel.height + 14;
    for (const section of entry.sections) {
      const heading = this.text(14, bottom, section.heading, width - 28, 14, true)
        .setData('guideSection', section.heading);
      holder.add(heading);
      bottom += heading.height + 7;
      const body = this.text(14, bottom, section.body, width - 28, 12);
      holder.add(body);
      bottom += body.height + 22;
      if (section.counterTable) bottom = this.counterTable(holder, bottom, width - 28) + 22;
    }
    holder.add(this.ui.button({ x: 14, y: bottom, width: width - 28, height: 38 },
      t('guide.contents.back'), () => scroll.setScroll(0), { variant: 'ghost', fontSize: '12px' },
    ).setData('guideContents', entry.id));
    const height = bottom + 52;
    background.fillStyle(INK_UI.parchment, 1).fillRoundedRect(0, 0, width, height, 5);
    background.lineStyle(1, INK_UI.parchmentDark, 1).strokeRoundedRect(0, 0, width, height, 5);
    background.lineStyle(1, INK_UI.softBrush, 0.28).strokeRect(13, imageTop - 1, imageWidth + 2, imageHeight + 2);
    holder.setData('guideCardHeight', height);
    scroll.content.add(holder);
    return height;
  }

  /** Counter answers come from combat's actual ring, not a second handwritten table. */
  private counterTable(holder: Phaser.GameObjects.Container, y: number, width: number): number {
    const columns = width / 3;
    let bottom = y;
    const headers: TranslationKey[] = ['guide.counter.enemy', 'guide.counter.strong', 'guide.counter.soft'];
    const head = headers.map((key, i) => this.text(18 + i * columns, y, key, columns - 10, 10.5, true));
    holder.add(head);
    bottom += Math.max(...head.map(text => text.height)) + 12;
    for (const enemy of FORMATION_RING) {
      const strong = FORMATION_RING.find(ours => formationTier(ours, enemy) === 2)!;
      const soft = FORMATION_RING.find(ours => formationTier(ours, enemy) === 1)!;
      const texts = [enemy, strong, soft].map((shape, i) =>
        this.text(18 + i * columns, bottom + 8, `ascent.formation.${shape}.full`, columns - 10, 10.5)
          .setText(`${t(`ascent.formation.${shape}.full`)}\n${t(`ascent.formation.${shape}.verb`)}`));
      const height = Math.max(...texts.map(text => text.height)) + 16;
      const row = this.add.rectangle(14, bottom, width, height, INK_UI.parchmentDark, 0.3).setOrigin(0)
        .setData('guideCounter', { enemy, strong, soft });
      holder.add([row, ...texts]);
      bottom += height + 3;
    }
    return bottom;
  }

  private openImage(entry: GuideEntry): void {
    if (this.viewer) return;
    this.scroll?.setLocked(true);
    this.viewing = entry.id;
    const viewer = this.add.container().setDepth(100);
    this.viewer = viewer;
    viewer.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, surfaceWidth(), GAME_HEIGHT,
      INK_UI.parchmentShade, 0.99).setInteractive());
    const width = isDesktopLayout() ? Math.min(960, surfaceWidth() - 40) : GAME_WIDTH - 24;
    const heading = this.text(GAME_WIDTH / 2, 14, entry.heading, width, 17, true).setOrigin(0.5, 0).setAlign('center');
    viewer.add(heading);
    const top = heading.y + heading.height + 14;
    const image = this.add.image(GAME_WIDTH / 2, top, imageKey(entry)).setOrigin(0.5, 0);
    const scale = Math.min(width / image.width, (GAME_HEIGHT - top - 76) / image.height);
    image.setScale(scale);
    viewer.add(image);
    viewer.add(this.ui.button({ x: GAME_WIDTH / 2 - 120, y: GAME_HEIGHT - 58, width: 240, height: 42 },
      t('guide.capture.close'), () => this.closeImage(), { variant: 'secondary', fontSize: '13px' },
    ).setData('guideCloseImage', true));
  }

  private closeImage(): void {
    this.viewer?.destroy(true);
    this.viewer = undefined;
    this.viewing = undefined;
    this.scroll?.setLocked(false);
  }
}
