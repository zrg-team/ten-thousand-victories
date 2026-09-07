import Phaser from 'phaser';
import { renderScaleNow } from '../game/graphicsQuality';
interface Entry { source: Phaser.GameObjects.Text; refs: number; used: number; bytes: number }
const caches = new WeakMap<Phaser.Scene, Map<string, Entry>>();
/** Share identical immutable labels. Canvas sources recover naturally after context restoration. */
export function cachedText(scene: Phaser.Scene, x: number, y: number, value: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Image {
  const resolved = { resolution: renderScaleNow(), ...style }, key = JSON.stringify([value, resolved]);
  let cache = caches.get(scene);
  if (!cache) { cache = new Map(); caches.set(scene, cache); const owned = cache;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { for (const entry of owned.values()) entry.source.destroy(); owned.clear(); caches.delete(scene); });
  }
  let entry = cache.get(key);
  if (!entry) {
    const source = scene.make.text({ text: value, style: resolved }, false);
    entry = { source, refs: 0, used: 0, bytes: source.canvas.width * source.canvas.height * 4 }; cache.set(key, entry);
  }
  entry.refs++; entry.used = performance.now();
  // Phaser's image renderer already divides CanvasTexture frames by their source resolution.
  // Set logical bounds without scaling again, or high-DPI labels become half/third sized.
  const image = scene.add.image(x, y, entry.source.texture.key).setSize(entry.source.width, entry.source.height)
    .setOrigin(0).setData('cachedText', value);
  const retained = entry;
  image.once(Phaser.GameObjects.Events.DESTROY, () => { retained.refs--; retained.used = performance.now(); });
  let bytes = [...cache.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  if (bytes > 8 * 1048576) for (const [key, entry] of [...cache].filter(([, entry]) => entry.refs === 0).sort((a,b) => a[1].used - b[1].used)) {
    if (bytes <= 8 * 1048576) break; bytes -= entry.bytes; entry.source.destroy(); cache.delete(key);
  }
  return image;
}
