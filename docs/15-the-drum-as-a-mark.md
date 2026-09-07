# The Ngọc Lũ Drum as an App Mark

Vạn Thắng · app mark

# The Ngọc Lũ drum, cut down to an icon

The tympanum is now drawn from the real object rather than from a memory of one — the finest
Đông Sơn bronze that survives, cast about two thousand years ago and held at the National
Museum of History in Hanoi. Fourteen sun rays, not twelve. Birds in flight, counter-clockwise,
because that is the way they go. Then most of it taken back out again, because sixteen
concentric bands are a museum object and an icon is 32 pixels wide.

In the build

## Cut in sỏi son

`--mark drum`

The mark

Masked, as Android crops it

Sỏi son for the ground, hoa hòe for the second block, and the sun left as unprinted điệp. Nine birds rather than eighteen, because a bird longer than its share of the ring walks into the tail of the one ahead.

192px

96px

32px

## What is actually on the drum

Sixteen concentric bands do not survive a browser tab. The column on the right is what the
shipping face keeps; the full face below keeps more. Everything kept is the real thing, in the
real order, at the real count — with one stated exception.

| Band | On the object | In the mark |
| --- | --- | --- |
| Boss | A raised round face at the dead centre | kept |
| The sun | **14** rays in relief — not 12, which is the count most reproductions guess | kept |
| Between the rays | Lông công — hatched peacock-feather fields wedged into every notch | full face only |
| Geometric bands | Dots, răng cưa sawtooth, and tangent circles with a dot at the heart | sawtooth kept |
| Band 6 | Dancers in feather costume, curved-roof stilt houses, rice-pounders, drummers | dropped |
| Band 8 | **20** deer in two groups of ten, male and female alternating, walking among **14** birds | dropped |
| Band 10 | **36** birds — 18 in flight, 18 perched, all counter-clockwise | 9 of the 18 flyers |
| In total | 16 concentric bands around the sun; 79.3cm across, 63cm tall, grey-green patina | — |

Alternate

## Cut in gỉ đồng

`--mark drum-bronze`

The mark

Masked, as Android crops it

The colour the object itself is — copper verdigris, the pigment the palette reserves for bronze and the patina on it. It is the more faithful cut and it was the shipping one, until the mark went up over the game’s title and turned out to be the only green thing on the page.

192px

96px

32px

Alternate

## Cut in mực

`--mark drum-ink`

The mark

Masked, as Android crops it

The ground pulled in bamboo-soot black, with the contour lifted so it does not vanish into its own block. Highest contrast of the three at 32 pixels, at the cost of looking like a coin rather than a drum.

192px

96px

32px

## How much drum survives

The face has three settings, and each one exists because of a size. **Full** is the drum:
every register the object carries that a 512-pixel circle can hold. **Simple** — the one
that ships — drops the three fussiest bands and grows the sun into the room they leave.
**Plain** is the sun alone, for anywhere the mark goes very small.

**Simple**  
`--mark drum`  
Ships. Sun, nine birds, sawtooth.

**Plain**  
`--mark drum-plain`  
The sun and the rim, nothing else.

**Full**  
`--mark drum-full`  
Every band the research turned up.

simple · 32px

plain · 32px

full · 32px

## Why the drum is not bronze

The object is grey-green and the first cut was too. Then the mark went up over the game's
title, where the palette is four colours — điệp paper, mực soot, sỏi son and hoa hòe — and
gỉ đồng was the only green thing on the page. One cool hue at the top of a warm sheet pulls
the eye off the button column, which is what the page is for.

A Đông Hồ printer cut what was in the tray, not what the subject happened to be made of.
This tray has four colours in it, and the red is the one that already flies on the standards
on the field below and letters the primary button under that. So the drum is cut in sỏi son,
the header and the map agree with each other, and the page is down to one accent instead of
two. `--mark drum-bronze` still cuts the faithful one.

## Flat, because it is a print

The first cut of this mark had two radial gradients, sixteen soft patina blotches and a cast
shadow under the disc. All of that is a painter's vocabulary. A colour block pulled off a
woodblock is flat by construction, so none of it belongs here — the sheet underneath may
carry tone, the ink on it may not.

Three blocks and the paper, which is how a Đông Hồ print is actually built: a ground, a second
colour, the sheet itself showing through where no block was laid, and a soot contour pulled
last and slightly out of register. That register slip along the disc's edge is not a mistake
to be tightened up. It is the thing that says a person pulled this.

Three invented colours went with the gradients — a teal and two greenish blacks that exist in
no printer's inventory. Every colour is now a pigment out of
`src/ui/ink/palette.ts` or one of them through `shade()`, and every
contour is mực.

## Two cuts of the same drum

A tab strip is not paper. The paper-backed icon puts a cream square in a row of transparent
favicons, and on a dark browser theme that square is the brightest thing on screen — so the
tab mark is the disc on nothing, and it drops the cast shadow along with the sheet, because a
shadow with no ground under it is just a grey crescent stuck to the side of the disc.

The install icons keep their paper on purpose. iOS fills an icon's alpha with black, and an
Android launcher composites a transparent icon straight onto the wallpaper.

## What landed in the repo

|  |  |
| --- | --- |
| scripts/build-icon.mjs | the generator — three detail levels, three colourways, band-by-band notes in the source, `--check` gate |
| public/icon.svg | the master drawing, vector, on its sheet of paper |
| public/favicon.svg | the same drum on **nothing** — the tab mark, transparent |
| public/favicon-32.png · -96.png | browser tab, transparent, RGBA |
| public/apple-touch-icon.png | 180px, iOS home screen |
| public/icon-192.png · -512.png | Android and desktop install |
| public/icon-maskable-512.png | pulled in to 78% so an adaptive launcher cannot slice the rim off |
| public/manifest.webmanifest | names the app *Đại Việt* on a home screen |
| index.html | five link tags, all relative — an absolute path breaks under the GitHub Pages sub-path |
| apps/desktop/build/icon.ico · icon.png | the Steam cabinet's own cut — the mark with no sheet behind it, ten sizes for the Windows shell ([desktop-builds](development/desktop-builds.md#the-icon-is-source-not-build-output)) |

```
yarn icon                                 # rebuild the committed set
yarn icon:check                           # fails if it has drifted
yarn icon:desktop                         # the .ico/.png the Electron cabinet ships
yarn icon:desktop:check                   # fails if that has drifted
node scripts/build-icon.mjs --mark drum-full  # or drum-plain, drum-red, drum-ink
```

## Where the counts come from

- [National Museum of Vietnamese History — *National Treasures: the Ngọc Lũ drum*](https://baotanglichsu.vn/en/Articles/1004/73640/national-treasures-the-ngoc-lu-drum.html) — 14-ray sun, 16 bands, 79.3cm, grey-green
- [USSH Museum of History and Culture — *Trống đồng Ngọc Lũ*](https://ma.ussh.vnu.edu.vn/vi/nghien-cuu/trong-dong/trong-dong-ngoc-lu-27.html) — the band-by-band counts: 20 deer, 14 birds, 36 birds in band 10
- [Wikipedia — *Ngoc Lu drum*](https://en.wikipedia.org/wiki/Ngoc_Lu_drum) — the three figurative panels and the patina