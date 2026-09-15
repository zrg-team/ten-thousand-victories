# Đông Hồ butterflies and optional grass tiles

The live game uses the preferred v1 grass by default. Settings → The picture →
Tile assets (Thiết lập → Hình ảnh → Ảnh nền ô đất) switches grass images off in
favor of the connected painted ground. The preference persists under
`mandate:tile-assets:v1`; it applies when entering the map from the menu.
The selected grass atlas stays preloaded so off → on works without an app reload.
Trees, rice fields, mountains, buildings, roads and butterflies are independent
of this grass-background preference. Existing URL art overrides still apply.

## Butterfly art

- Built-in ImageGen generated gold and brown woodblock butterflies with three
  wing poses. Exact prompt/source: `dongho-butterflies-v1.json`.
- Runtime: `public/art/life/dongho-butterflies-v1.png`, 192×128, six 64×64 frames,
  22,180 bytes. Original master retained in `output/butterflies/master-v1.png`.
- `scripts/conquest-art/pack-butterflies.mjs` crops and aligns the source,
  preserves its transparency, normalizes open wings to 52 pixels, and checks
  transparent frame gutters. No runtime mask, tint or per-insect texture.
- Open wings span approximately 2.07–2.88 world units; a farmer is about 8.2
  units tall. A 2.4× visibility boost preserves the size variation while making
  the wings easier to see at normal map zoom, as requested after the first
  in-game review. Camera zoom and graphics resolution do not change their world size.
- Two to four insects per group; at most nine groups on Full and four on Calm,
  fewer in autumn, none in winter. Each has an independent wingbeat and follows
  its travel direction. Reduced motion halves their animation clock. Pause
  freezes their wingbeat, movement, spawn delay and lifetime.
- Missing image / explicit procedural art keeps the previous fleck fallback.
  Existing desktop-only Map Life policy remains in effect.

## Verification

Checked the actual `http://localhost:5180/` with native Settings clicks in English
and Vietnamese, desktop and phone, off → reload → on, retained standing art and
road layering, butterfly scale, frames, drift, pause, winter, density, reduced
motion, life Off and missing-image fallback. Evidence:
`output/butterflies/report.json`, screenshots in the same directory, and installed
web-game client screenshots/state in `output/butterflies/skill-desktop/`.
One tracked insect used all three wing frames and changed position.

TypeScript and production/offline build pass. Existing font-path and bundle-size
warnings remain. V1 grass SHA-256 is unchanged:
`9D48E4F0A7A728351888D0518073F865D2E0D810C8986BB5F2CD11E92B6F0078`.
Pre-change butterfly, Settings and grass renderer snapshots are retained under
`output/butterflies/backup/`. V2 grass remains available as a backup.
