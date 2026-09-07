/**
 * The Temple page: dressing the king through the coronation sheet.
 *
 * Every function here takes the scene as `self`; the scene owns the fields and the display list,
 * this file owns one area of the page. Cross-module calls go through the scene's forwarders.
 */
import { GAME_WIDTH } from '../../game/constants';
import { getDynasty, setDynastyFounder } from '../../state/dynasty';
import { CoronationSheet } from '../../ui/coronation/CoronationSheet';
import { INK_UI } from '../../ui/InkUI';
import { pageFloor, renderPageHead } from './helpers';
import type { MenuScene } from '../MenuScene';

/**
 * Thái Miếu — the Temple, where a crowned king is re-dressed.
 *
 * The same `CoronationSheet` the rite is drawn with, hosted on a menu page instead of inside a
 * prompt: one wardrobe picker, two doors. It walks the dress and the banner and never the name,
 * because the name is the record and the record does not change. Nothing is written until "Keep
 * this dress" — the way out leaves the king exactly as he was.
 */
export function renderTemple(self: MenuScene): void {
  const sheet = self.templeSheet ?? new CoronationSheet({
    scene: self,
    ui: self.ui,
    mode: 'temple',
    redraw: (preserveScroll) => {
      const offset = preserveScroll ? -(self.pageScroll?.content.y ?? 0) : 0;
      self.render();
      self.pageScroll?.setScroll(offset);
    },
    finish: (founder) => {
      // The *look* and the mark, never the name or the house: a Temple that renamed the line
      // would rewrite every reign the Chronicle has already recorded under the old one.
      const store = getDynasty();
      setDynastyFounder({
        ...store.founder,
        ...founder,
        ...(store.founder?.name ? { name: store.founder.name } : {}),
        ...(store.founder?.givenName ? { givenName: store.founder.givenName } : {}),
        ...(store.founder?.armyEra ? { armyEra: store.founder.armyEra } : {}),
      }, store.house);
      self.templeSheet = undefined;
      self.mode = 'dynasty';
      self.render();
    },
    cancel: () => {
      self.templeSheet = undefined;
      self.mode = 'dynasty';
      self.render();
    },
  });
  self.templeSheet = sheet;

  const PAD = 20;
  const W = GAME_WIDTH - PAD * 2;
  // The same head as every other page off the front page; the step's own name and line.
  let y = renderPageHead(self, sheet.title(), sheet.subtitle());

  // The foot is measured before the body so the scroll viewport stops short of it — the rule
  // `promptScrollBody` follows, and the reason a stepper never lands under a button. 58 rather
  // than 46: the row under the fold was touching the buttons at the 620 clamp.
  const foot = sheet.foot();
  // 72, and the number is the sheet's edge plus a hand-drawn margin. The plate behind the
  // picker ends six units below the scroll viewport, and both it and the buttons are inked with
  // wobbling outlines that overshoot their nominal bounds by two or three units each — so a
  // nominal gap of two is a visible collision, which is what was photographed: the Discard
  // button's corner sitting inside the sheet's own border. `FOOT_GAP` is that clearance,
  // measured against the panel rather than against the viewport.
  const FOOT_GAP = 18;
  const footHeight = FOOT_GAP + 38 + 16;
  const viewport = Math.max(120, pageFloor() - y - footHeight);

  const area = self.ui.scrollArea({ x: PAD, y, width: W, height: viewport });
  self.pageScroll = area;
  const layer = self.add.container(0, 0);
  // `addTo` before the content is filled: the area parents its swallow-zone first, and
  // reversed the zone lands on top and eats every tap the steppers were supposed to get.
  area.addTo(layer);
  self.content.push(layer);
  // A little further than the content needs, so the last row can be scrolled clear of the
  // plate's bottom border instead of ending flush against it.
  const used = sheet.draw(area.content, W - 6) + 10;
  area.setContentHeight(Math.max(viewport, used));

  // One sheet of paper behind the whole picker. Every portrait, chip and swatch on it is drawn
  // for a parchment ground; over the landscape the swatch rows in particular vanish.
  // Opaque, not near-opaque: at 0.94 the front page's own wordmark showed through the sheet
  // behind the swatch rows, which is the one place on this page colour has to be judged.
  //
  // **Cut to the content, not to the viewport.** The banner step is a third of the King step's
  // height, and a full-viewport plate under it left two thirds of a blank page with the buttons
  // stranded at the bottom of it. Which means the plate can only be sized *after* the content is
  // drawn — and Phaser's display list is creation-ordered, so a panel built later paints over
  // the rows it is meant to back. `moveBelow` is the one honest way to have both.
  const plate = self.ui.panel(
    { x: PAD - 6, y: y - 6, width: W + 12, height: Math.min(viewport, used) + 12 },
    { border: INK_UI.softBrush, fillAlpha: 1 },
  );
  self.children.moveBelow(plate, layer);
  self.content.push(plate);

  const footY = y + (sheet.bannerState() ? Math.min(viewport, used) : viewport) + FOOT_GAP;
  if (foot.back) {
    self.content.push(self.ui.button({ x: PAD, y: footY, width: Math.round(W * 0.44), height: 38 },
      foot.back.label, foot.back.onTap, { variant: 'ghost', fontSize: '11.5px' }));
  }
  const rightX = PAD + Math.round(W * 0.46);
  self.content.push(self.ui.button(
    { x: rightX, y: footY, width: PAD + W - rightX, height: 38 },
    foot.close.label, foot.close.onTap, { variant: 'primary', fontSize: '11.5px' },
  ));
  self.footBackBar();
}
