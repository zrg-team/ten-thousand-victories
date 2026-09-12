> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Faces of Đại Việt

Throne of Đại Việt · hero portrait system

# Faces of Đại Việt

The game draws twenty-eight million possible faces and every one of them is
*the same man* — middle-aged, bearded, in a robe from nowhere and no century in
particular. The princess has a moustache.

A thousand years of Đại Việt is one wardrobe here, and half its people are missing. What
follows is an audit, six dynasties of dress, and the women the record already contains.
Everything is drawn live: the plates in §1 are your current `FaceRenderer`,
transcribed shape for shape; the plates from §5 on are the proposal, running beside it so the
two can be judged rather than described.

§1 · What the game draws today

## The whole roster, as it renders now

Twenty-seven heroes, each seeded from `hero.id`. This is a faithful transcription —
same FNV-1a hash, same LCG, same rectangles and ellipses, same order of draws.

Plate I — current system, actual roster
red = named as a woman

Look along the row. The silhouettes barely differ: every head is an ellipse or a rectangle of
almost the same size, every hat sits at the same height, every pair of eyes is two black bars
at the same coordinates. The variation the code advertises is real in the data and nearly
invisible on screen, because it is all *interior* variation inside an identical outline.

And the five heroes the game itself names as women — Bà Quản Kho,
Hoàng Yến, Nữ Tướng Rừng,
Bà Làng Nước, Công Chúa Hòa Thân — all five have
facial hair.

§2 · Diagnosis

## Five findings, each with its number

1

#### There is no such thing as a woman in this system

`FaceRecipe` has eight style axes and not one of them is gender. Beards are drawn
from the hash like everything else, so a hero's sex is decided by the third-from-last call
to a linear congruential generator. Every female-named hero in the roster lost that coin
toss — not most, *all five*.

The same blindness hits role. Thiền Sư Trúc Lâm is a Trúc Lâm Zen
master; the system gives him a full head of hair under a cap, and an 80% chance of a beard.
He escaped this run by luck.

5 of 5 women bearded · 27-hero roster · beardStyle 'none' has p = 0.20

2

#### The variety is arithmetic, not visual

The combinatorics are genuinely large — 28,800,000 nominal recipes, and a sweep of 200,000
ids produced 199,348 distinct ones, so there is no collision problem and the generator is
evenly distributed. The problem is that the axes are all small interior details on a shared
outline, and the two axes that would actually change a silhouette — headwear and hair —
have five and zero options respectively.

At the size portraits are actually drawn, most of those axes are invisible. A nose is
4×18 px at scale 1; the roster list draws at
0.32. That nose is one pixel wide.

28.8M recipes · 199,348 / 200,000 distinct · scales in use: 0.32 · 0.34 · 0.5 · 0.72 · 1.16

3

#### The portraits are painted in a different palette from the game

The game's art direction is a settled ink-wash: parchment `#f3e6c4`, ink
`#20261f`, cinnabar `#aa3a2c`, jade `#6f8f64`, gold
`#d9b35a`. The portraits ignore all of it and use their own six accents,
including a magenta-red `#c11246`, a cobalt `#3f6e91` and a violet
`#7d4f8a` that appear nowhere else in the product.

The frame is the giveaway: `#1b0703`, a near-black brown, sitting on parchment
panels. Portraits read as stickers dropped onto the UI rather than as part of it.

6 accent hues, 0 shared with INK\_UI · frame #1b0703 vs parchment #f3e6c4

4

#### Nothing in the face is Vietnamese

The hat list is `roundCap`, `flatCap`, `scholar`,
`official`, `none`. The scholar's cap is an isoceles triangle, which
reads as a wizard's hat. The official's is a box with two horizontal bars — a distant
gesture at the mũ cánh chuồn, drawn without knowing it.

Absent entirely: the khăn vấn, the coiled black turban that is the
single most recognisable thing a Đại Việt man wore; the áo giao lĩnh,
whose crossed collar is the defining line of the robe; the búi tó
topknot; the khăn mỏ quạ for women. The collar options are
`v`, `wideV`, `fold`, `band` — every one of them
a Western shirt.

0 of 5 hats and 0 of 4 collars correspond to a Vietnamese garment

5

#### A small bug worth fixing on the way past

The two halves of the V-collar are built with different offsets — the left line is placed at
`x = 0` and the right at `x = 16`, with an inherited stray space in
`spread ,` where the mirror was meant to go. The collar is not symmetric about the
neck, and never has been.

FaceRenderer.ts:245–246

§3 · Research

## What Đại Việt actually wore

Five garments carry almost all the recognition. None of them is expensive to draw — they are
strong, simple silhouettes, which is exactly what a 42-pixel portrait needs.

Drawn from the sources below. The khăn vấn leaves the crown open — that
gap, with the topknot showing through it, is the read. The phốc đầu's
wings are the useful find: by the 1499 regulations, officials of the third rank and above wore
wings *longer and larger* than everyone else's, so wing length already encoded rank
before we asked it to.

- **Khăn vấn (khăn đóng)** — a long dark cloth wound or folded around
  the head. The later open-crown form belongs chiefly to Nguyễn-era pools; Lý portraits instead
  use the documented topknot or a closed hair cloth, while Trần portraits favor cropped/shaven
  hair and the mũ Đinh Tự. See the later evidence correction in
  `docs/research/vietnamese-hero-wardrobe.md`.
- **Áo giao lĩnh** — *giao* = crossed, *lĩnh* =
  collar. The robe of Lý–Trần court and folk life alike, worn with the khăn đóng. Its crossed
  lapel is the single most legible line in the whole costume.
- **Phốc đầu → mũ cánh chuồn** — the
  mandarin's formal cap, a squared crown with two "dragonfly wing" projections in black silk.
- **Khăn mỏ quạ** — the crow's-beak kerchief: a black square folded
  to a point at the brow, worn over áo tứ thân and
  áo yếm by women of the northern provinces.
- **Nhuộm răng đen** — lacquered black teeth, a beauty standard for
  centuries and a genuine period marker. One dark shape in a smile, and an elder reads as
  *of this place* rather than generically old.

§4 · The proposal

## Identity first, dice second

One structural change carries most of the value: the hash stops choosing *what a person is*
and only chooses *how they look within it*.

TODAY

hero.id

hash → LCG

8 style axes
head · eyes · nose · mouth · beard …
sex, age and role
are dice rolls

PROPOSED

hero data
sex · type · rarity

identity
who this person is

wardrobe
what they may wear

hash → LCG
picks within it

the dice never decide who someone is

The wardrobe stage is where authenticity lives: a Zen master's wardrobe contains a shaven head
and a kesa and nothing else, so no seed can ever put a war-helm on him.

### The layers, back to front

01

##### Ground & plate

Rank-tinted wash and the seal in the corner. Cheapest possible way to make a Legendary feel different across the whole roster list.

02

##### Robe

Áo giao lĩnh for men, áo tứ thân over yếm for women, lamellar for a general in the field.

03

##### Crossed collar

Left over right, always. Two quadrilaterals; the strongest single line in the portrait.

04

##### Head & jaw

A path, not an ellipse — jaw width and cheek hollow carry age and sex without any other change.

05

##### Hair & topknot

Búi tó beneath an appropriate cloth or bare head; complete period-gated women's styles rather
than one generic coil; bare for a monk. The implemented women's evidence and chronology are
recorded in `docs/research/vietnamese-hero-wardrobe.md`.

06

##### Headwear

The silhouette that survives at 42 px. Nine, where there were five, and every one of them a real garment.

07

##### Features

Almond eye with a weighted upper lid, brow, curved nose, mouth. Drawn as paths so they can be small and still read.

08

##### Age & story

Cheek lines, blackened teeth, a campaign scar, a Trần soldier's brow tattoo. Fades in only above a size threshold.

§5 · The same roster, redrawn

## Plate II

Identical hero ids, identical hash. The only difference is that identity now constrains the
wardrobe, and the wardrobe is Vietnamese.

Plate II — proposed system, actual roster

The women read as women. The monk is shaven and wearing an ochre kesa. The generals are in
lamellar and the ministers in mũ cánh chuồn, so a glance at the roster
list tells you what each person *does* — which the current portraits cannot do at any
size, because role only ever affected whether an agent might go hatless.

Plate III — thirty-two strangers, to show the spread
Draw another thirty-two

Press the button a few times. What should be visible is that no two rows look like the same
person in different hats: age changes the jaw and the cheek, sex changes the whole upper
silhouette, and role changes the costume. That is diversity you can see at a glance, rather
than diversity that exists only in the recipe object.

§6 · Six dynasties

## Đại Việt did not dress the same way for a thousand years

The roster already spans the eras — Trần Cung Thủ, Lê Thiết Giáp, Tướng Voi Tây Sơn, Lý Trưởng
Lam Sơn — and the King is drawn from a name list running from Lý Thánh Tông to Quang Trung.
Era is *already in your data*. It has simply never reached the portrait.

Plate VI — one general, one seed, six centuries
Another person

| Dynasty | Years | What the portrait shows |
| --- | --- | --- |
| **Đinh · Tiền Lê** | 968–1009 | Topknot pinned with a bone rod, two-flap wrap of the kind the Đông Sơn drums show, ochre sash. The least Sinicised look in the sequence. |
| **Lý** | 1009–1225 | Áo giao lĩnh and khăn vấn. Court tattoos appear — under the Lý they were the price of admission to the palace. |
| **Trần** | 1225–1400 | Hair cropped short, tattoos heavier, teeth blackened. Chinese envoys remarked on all three. The most distinctive silhouette of the six. |
| **Lê** | 1428–1789 | Confucian formality: the phốc đầu with its dragonfly wings, and rank legible in their length. |
| **Tây Sơn** | 1778–1802 | A field army, not a court. Red head-band, baldric, war-elephant corps. Brief and unmistakable. |
| **Nguyễn** | 1802–1945 | Áo ngũ thân from the 1744 reform — a standing collar closing right, five buttons for the Five Constants — under a firm khăn đóng. |

The Nguyễn row is worth dwelling on, because it is where the silhouette breaks. Lord Nguyễn
Phúc Khoát's 1744 reform replaced the crossed lapel with a standing collar and five panels —
four for the parents-in-law, one for the wearer — and that garment is the direct ancestor of
the áo dài. Draw a Nguyễn official in áo giao lĩnh
and you have drawn the wrong century.

§7 · Women of Đại Việt

## Not a diversity slider. The actual history.

Vietnam's founding rebellion was led by two women whose army was mostly women, and who trained
thirty-six of them as generals. A roster that cannot draw a woman cannot draw that.

Plate VII — women the game could be casting

- **Hai Bà Trưng** 40–43 — Trưng Trắc and Trưng Nhị raised some
  eighty thousand against the Han, most of them women, and personally trained
  **thirty-six women as generals**. They ruled as queens. They are shown riding
  to war on elephants.
- **Bà Triệu** 248 — Triệu Thị Trinh, remembered for her height
  and her voice, who raised a rebellion against Eastern Wu at nineteen.
- **Dương Vân Nga** c. 980 — dowager empress of the Đinh who,
  with a Song army on the border and a child on the throne, handed the mandate to Lê Hoàn.
  A woman deciding a dynasty's succession.
- **Nguyên phi Ỷ Lan** c. 1070 — regent of the Lý for her
  six-year-old son, remembered for agrarian policy and for founding the capital's first silk
  weaving workshop.
- **Lý Chiêu Hoàng** 1224 — the only woman to reign in her own
  name, and the last of the Lý.
- **Huyền Trân** 1306 — Trần princess married to Jaya
  Simhavarman III to buy two provinces, then brought home by sea over the course of a year.
  Your Công Chúa Hòa Thân is already this card. She has a moustache.
- **Bùi Thị Xuân** d. 1802 — Tây Sơn general: swordswoman,
  archer, rider, and commander of a **war-elephant division** of dozens of
  beasts. Your Tướng Voi Tây Sơn is her card, cast as a man.

Two of those are heroes you have already written and drawn as men. That is the cheapest win
available: the cards exist, the names are right, and only the portrait disagrees.

The yếm is the useful one: a diamond of cloth tied at the neck and
back, worn by peasant women and imperial consorts alike. It is the only garment in the whole
wardrobe that crossed every class line, which makes it the right base layer for every woman in
the roster regardless of rank — and rank can then be carried by what goes over it.

Worth saying plainly: **armour is the weakest-evidenced part of this**. Physical
finds from the Đại Việt period are rare, and most reconstructions are inferred from texts and
temple carvings. The helms drawn here are a reasonable silhouette, not a citation — and if the
game wants to be careful, generals can wear the robe and the head-band, which are documented,
rather than plate that is not.

§8 · Rank you can read

## The wings say the rank

The 1499 court regulations distinguished officials of the third rank and above by giving their
caps longer, larger dragonfly wings. That is a rarity ladder, already designed, five hundred
years ago.

Plate IV — one minister at four rarities

Nothing else changes between those four portraits — same face, same robe, same seed. The wings
lengthen, the plate's wash warms, and the corner seal fills in. A player learns the ladder
without being told it, and it costs one number in the recipe.

§9 · Colour

## A court palette, not a crayon box

Replace the six invented accents with a set the game already uses, extended by the colours the
court actually assigned.

| Slot | Now | Proposed | Why |
| --- | --- | --- | --- |
| Highest rank | #c11246 | #aa3a2c | Vermilion — the emperor's colour, and the game's existing `sealRed` |
| High official | #3f6e91 | #2f5170 | Azure, prescribed for high office in the Lê edicts |
| Civil / land | #6a8c45 | #6f8f64 | The map's own `landForest` jade |
| Clergy | #7d4f8a | #b07a24 | Ochre kesa. The violet corresponded to nothing |
| Commoner | #9d6a35 | #6b4a2f | Nâu — the undyed brown of village dress |
| Field / dark | — | #26313c | Chàm indigo, and the black of the khăn vấn |
| Legendary only | #d8a941 | #d9b35a | Gold, reserved — it means nothing if everyone has it |

Skin needs the same treatment. The current six run from `#f1c18d` to
`#b97750` — a pink-forward ramp borrowed from nowhere. The proposal warms and
slightly desaturates them so they sit inside the ink-wash world, and widens the range at the
dark end, which is where the current set is thinnest.

§10 · The constraint everyone forgets

## It has to work at forty-two pixels

Portraits are drawn at five scales between 0.32 and
1.16. Most of them are small.

Plate V — one hero at every scale the game actually uses

This is why the proposal spends its budget on **silhouette** — headwear, hair mass,
shoulder line, jaw — and treats eyes, teeth, scars and tattoos as detail that simply is not
drawn below a threshold. A level-of-detail switch is three `if`s, and it also buys
back the draw calls the richer art costs: at 0.32 a portrait can be
eleven shapes instead of forty.

§11 · Cost

## What this actually takes

**The identity layer is small and worth doing alone.** A `sex` field on
`Hero`, an age band derived from `renown`, and a wardrobe table keyed on
`type` and `rarity`. That alone fixes the princess's moustache and the
monk's hair, and it is perhaps eighty lines. It needs no new art.

**The drawing is a rewrite, but a contained one.** `FaceRenderer.ts` is
376 lines with a single public surface — `renderHeroFace` and
`renderHeroFaceInBox`, used from four files. Moving from
`scene.add.rectangle` to a single `Graphics` with paths is mostly
mechanical, and it is a performance win: one `Graphics` object per portrait rather
than twenty-odd Game Objects, which matters on the roster screens that draw a dozen at once.

**The wardrobe is content, and it ships one garment at a time.** The khăn vấn alone
would do more for recognition than every other change on this page, and it is about fifteen
lines of arcs.

**What to be careful about.** `HERO_FACE_EXTENT` is load-bearing — four
call sites size boxes against it, and the comment above it records exactly which hat and which
shoulder set its bounds. New headwear changes those numbers, so the extent has to be
recomputed from the new wardrobe rather than guessed, or tall caps will clip in the draft panel
and the shoulders will spill in the roster row.

**Smallest first cut:** the identity layer, the khăn vấn, the crossed collar, and
the palette swap. Four changes, no new systems, and it is the difference between a generic
fantasy roster and a Đại Việt one.

Plates I–V are rendered live in this page from transcriptions of
`src/ui/FaceRenderer.ts` at `ee0fa78`. Recipe audit run over the 27-hero
roster in `src/data/heroes.ts`.

**Dress:**
[Khăn vấn](https://en.wikipedia.org/wiki/Kh%C4%83n_v%E1%BA%A5n) ·
[Phốc Đầu](https://en.wikipedia.org/wiki/Ph%E1%BB%91c_%C4%90%E1%BA%A7u) ·
[Áo giao lĩnh](https://en.wikipedia.org/wiki/%C3%81o_giao_l%C4%A9nh) ·
[Áo tứ thân](https://en.wikipedia.org/wiki/%C3%81o_t%E1%BB%A9_th%C3%A2n) ·
[Yếm](https://en.wikipedia.org/wiki/Y%E1%BA%BFm) ·
[Áo nhật bình](https://en.wikipedia.org/wiki/%C3%81o_nh%E1%BA%ADt_b%C3%ACnh) ·
[Nguyễn Phúc Khoát](https://en.wikipedia.org/wiki/Nguy%E1%BB%85n_Ph%C3%BAc_Kho%C3%A1t) (the 1744 reform) ·
[Vietnamese clothing](https://en.wikipedia.org/wiki/Vietnamese_clothing) ·
[Kelley, *A History of Court and Commoner Clothing in Vietnam*](https://cross-currents.berkeley.edu/e-journal/issue-20/liamkelley)

**Women:**
[Trưng Sisters](https://www.newworldencyclopedia.org/entry/Tr%C6%B0ng_Sisters) ·
[Bà Triệu](https://www.ebsco.com/research-starters/literature-and-writing/vietnamese-rebels-trung-sisters-and-trieu-thi-trinh) ·
[Ỷ Lan](https://en.wikipedia.org/wiki/%E1%BB%B6_Lan) ·
[Dương Vân Nga](https://en.wikipedia.org/wiki/Empress_D%C6%B0%C6%A1ng) ·
[Lý Chiêu Hoàng](https://en.wikipedia.org/wiki/L%C3%BD_Chi%C3%AAu_Ho%C3%A0ng) ·
[Huyền Trân](https://en.wikipedia.org/wiki/Huy%E1%BB%81n_Tr%C3%A2n) ·
[Bùi Thị Xuân](https://en.wikipedia.org/wiki/B%C3%B9i_Th%E1%BB%8B_Xu%C3%A2n)

**Body & marks:**
[tooth blackening in ancient Vietnam](https://link.springer.com/article/10.1007/s12520-025-02366-5) ·
[Lý–Trần court tattooing](https://vietnaminsiders.com/fighting-stigma-the-unique-history-of-vietnamese-tattoo-culture/) ·
[Vietnamese armour](https://en.wikipedia.org/wiki/Vietnamese_armour) (thin evidence — see the caveat in §7)
