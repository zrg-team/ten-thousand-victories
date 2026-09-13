/** Inspect game-native labels and click their actual screen coordinates. */
export const heroCanvasText = page => page.evaluate(() => {
  const texts = [];
  const walk = object => { if (typeof object.text === 'string') texts.push(object.text); for (const child of object.list ?? []) walk(child); };
  walk(window.__phaserGame.scene.getScene('ConquestUIScene').modalLayer);
  return texts.join('\n');
});

export async function clickHeroCanvas(page, label) {
  for (let step = 0; step < 24; step++) {
    const target = await page.evaluate(label => {
      const ui = window.__phaserGame.scene.getScene('ConquestUIScene'), game = ui.game;
      const canvas = game.canvas.getBoundingClientRect(), camera = ui.cameras.main;
      const screen = (x, y) => ({ x: canvas.left + ((x - camera.scrollX) * camera.zoom + camera.x) * canvas.width / game.scale.width,
        y: canvas.top + ((y - camera.scrollY) * camera.zoom + camera.y) * canvas.height / game.scale.height });
      let hit;
      const walk = (object, visible = true) => {
        visible = visible && object.visible !== false;
        if (visible && object.text === label) {
          const bounds = object.getBounds();
          const point = { x: bounds.centerX, y: bounds.centerY };
          const area = ui.activeScrollAreas.find(area => {
            for (let parent = object.parentContainer; parent; parent = parent.parentContainer) if (parent === area.content) return true;
            return false;
          });
          if (!area || (point.y >= area.bounds.y + 8 && point.y <= area.bounds.y + area.bounds.height - 8)) hit = screen(point.x, point.y);
        }
        for (const child of object.list ?? []) walk(child, visible);
      };
      walk(ui.modalLayer);
      const area = ui.activeScrollAreas[0];
      return { hit, scroll: area && screen(area.bounds.x + area.bounds.width / 2, area.bounds.y + area.bounds.height / 2) };
    }, label);
    if (target.hit) {
      await page.mouse.click(target.hit.x, target.hit.y);
      await page.waitForTimeout(120);
      return;
    }
    if (!target.scroll) break;
    await page.mouse.move(target.scroll.x, target.scroll.y);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(90);
  }
  throw new Error(`Game control not found: ${label}`);
}

export const heroDomOverlays = page => page.locator('[data-hero-access], [data-hero-comparison], [data-hero-archive-exit]').count();
