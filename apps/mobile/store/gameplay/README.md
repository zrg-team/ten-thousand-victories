# Store screenshot sources

Frames of the gameplay trailer (and one page shot on its own) — a real run of the game photographed at the high tier, 1170x2080,
one folder per language. `yarn store:kit` composes every store screenshot from these; nothing
here is drawn by hand.

They are copied rather than read from `scripts/trailer/out/`, which is gitignored and rewritten by
every trailer capture.

| Source | Trailer cut | Frame |
|---|---|---|
| `battle.jpg` | field | 1190 |
| `invasion.jpg` | invasion | 1000 |
| `draft.jpg` | draft | 560 |
| `summon.jpg` | summon | 705 |
| `deck.jpg` | — | not in the film: the Dynasty Deck page (`CabinetScene`) shot on its own |

Captured 2026-09-10 (`scripts/trailer/out/raw` and `raw-vi`). The captions for each frame live in
`apps/mobile/store.metadata.json` under `screenshots`, taken from the trailer's own reviewed
captions in `scripts/trailer/film.mjs`.

`deck.jpg` is photographed separately at the same surface (360x640 CSS at 3.25x, high tier): the
collection store seeded from every card in `POWER_CARDS` as `test_scripts/shot/shot-readme.mjs`
does for `prints`, the page scrolled to 1460, where the gold row starts right under the title — at 1400 the scroll
window left a clipped sliver of the row above. Cut at row 1710, the gap under the third full row.

**To refresh after the game's look changes:** run the trailer capture for both languages
(`yarn trailer --stage capture --lang en`, then `--lang vi`), look at the frames around the numbers
above — a re-cut film moves them — and copy the settled ones over these files. Pick frames where
no card is mid-flip and no caption plate is up; the capture itself carries no captions.
