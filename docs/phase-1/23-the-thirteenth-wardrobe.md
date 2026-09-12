> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# The Thirteenth Wardrobe — Vạn Thắng

Vạn Thắng · docs/phase-1/23-the-thirteenth-wardrobe.md · art dossier
26 Aug 2026 · shipped

# The Thirteenth *Wardrobe*

The game named seventeen champions of the tenth century and could not dress one of their soldiers. `ArmyWardrobe` held twelve entries and the earliest was `ly` — a hundred and ten years after Đinh Bộ Lĩnh took the throne.

A film opened last week that spent eighty-three days in Ninh Bình and several hundred hand-made costumes reconstructing exactly that gap. Ten parts came out of it. **Every one is set beside the frame it came from, with the URL of that frame** — nothing below rests on a description.

The source

#### Hộ Linh Tráng Sĩ: Bí ẩn mộ Vua Đinh

Guardian Warriors: The Mystery of King Đinh's Tomb

Directed
:   Nguyễn Phan Quang Bình

Released
:   28 Aug 2026 (previews 25–27)

Set
:   979–980, after the assassination of Đinh Tiên Hoàng

Shot
:   83 days, 40+ locations, Ninh Bình

Costume
:   Bao Tranchi; regalia by Mai Lâm

Premise
:   Seven warriors carry ninety-nine coffins out of Hoa Lư in seven directions

Why this material and not an invention

## A film is not a source. A reconstruction under constraint is.

The tenth century is the hardest century in the roster to dress, and `wardrobe.ts` said so in a comment written long before this film existed: a Lê general is offered five war helms “because the sources describe that many; a Đinh one has two, because the tenth century did not have a court to regulate the rest.”

That is honest, and it is why the Đinh portraits were the thinnest in the game. What a production like this makes is not evidence — it is a *committed, internally consistent set of decisions* by people who read the same thin record and then had to build the objects anyway, under a costume designer's discipline and a historical consultant's veto. That is the artefact a renderer needs: not proof of what a Đinh officer wore, but a coherent proposal for drawing one who is not simply a Lý officer moved back a century.

So the rule for this pass was: **no part enters the library unless a frame of this film shows it.** The section below is that ledger — twelve frames, what each shows, what was taken from it, and what was deliberately refused.

968–980đinh

1009lý

1225trần

1428lê

1545trịnh

1558nguyễnLord

1778tây sơn

1802nguyễn

960tống

1271nguyên

1368minh

1636thanh

—chăm

The wardrobes in `src/state/types.ts`, in order. Note where `song` sat the whole time: the game could dress the army that invaded in 981, but not the army that met it.

The ledger · twelve frames

## Every part, beside the frame it came from

Stills are cropped to the detail cited and nothing else. The filename under each links to the exact frame on the publisher's CDN, and the line beneath links the gallery it sits in, so any claim here can be checked against the original in two clicks.

Frames are reproduced here rather than hot-linked because `i1-giaitri.vnecdn.net` refuses cross-origin requests — tested from a foreign origin, nine of these twelve fail to load as a remote `<img>` and render as a broken box. `bazaarvietnam.vn` serves them fine. Rather than have two thirds of the ledger break, every crop is embedded and every URL printed, so the source stays one click away.

**Đinh Tiên Hoàng · Lê Vũ Long**
[hlts-10-1785917225.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-10-1785917225.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Mũ trụ · War helm

A rounded bowl with a cast scrollwork brow band, a lotus-bud finial carrying a tall plume, hinged cheek flaps and a fringe of lames at the neck.

Taken: the bowl, the gilt band, the finial, the plume, the lames. **Refused: the wings.** The frame shows them swept up either side of the bowl; drawn as a rising pair at 42 px they are the cat-ear silhouette this library already had to take out of `hat-helm-horned` once.

What it became

hat-helm-dinh

**Hữu tướng quân · Johnny Trí Nguyễn**
[hlts-1-1785914384.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-1-1785914384.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Thôn kiên thú · Beast-mask pauldron

A cast beast head swallowing the whole shoulder — brow ridge, deep-set eyes, a snarling jaw with fangs — mounted over a skirt of scale, on darkened leather.

Taken: the mask as a *mask*. The first pass drew two dots and an upcurved jaw and produced a smiley face; the frame is what says the jaw bulges upward and hangs fangs, and that a brow sits over the eyes.

What it became

guard-beastmask

**Đinh Tiên Hoàng · costume exhibition**
[bzvn-tao-hinh-phuc-trang-viet-phuc-ho-linh-trang-si-bi-an-mo-vua-dinh-dien-vien-nhan-vat-14.jpg](https://bazaarvietnam.vn/wp-content/uploads/2026/04/bzvn-tao-hinh-phuc-trang-viet-phuc-ho-linh-trang-si-bi-an-mo-vua-dinh-dien-vien-nhan-vat-14.jpg)
via [Harper's Bazaar VN](https://bazaarvietnam.vn/tao-hinh-phuc-trang-trong-ho-linh-trang-si-bi-an-mo-vua-dinh-gay-sot-vi-qua-hoanh-trang/)

### Giáp phiến · Shell lames

Courses of gilt lames, each one a scallop wider than it is deep, overlapping downward, above a beast-mask belly plate and a plaque belt.

Taken: the scallop, and the fact that it is *filled* rather than outlined. This is the mark that separates a Đinh harness from the fish-scale of a Trần one and the banded lamellar of a northern one.

What it became

robe-armour-fanscale

**Đinh Tiên Hoàng · Lê Vũ Long**
[hlts-10-1785917225.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-10-1785917225.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Hộ tâm kính · Mirror plate

Twin rosette bosses on a leather plate, crossed by a knotted cord harness, with shell lames below and rust hemp sleeves showing under the armour.

**Nothing new taken.** The renderer already draws a mirror plate at `tier 1`. Recorded here because it is the piece that confirms the rust under-tunic — the only saturated colour anyone in the film wears under armour.

What it became

No new part — recorded for the reading, not the geometry.

**Quan văn · Hứa Vĩ Văn**
[hlts-7-1785914388.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-7-1785914388.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Ô vuông · Square placket

A vertical band of square gold-and-lilac medallions running the length of the robe front, between the two parallel bands of an áo đối khâm, with a white cord hanging at the breast.

Taken: the placket, at three squares. Also taken: **the bare head** — he wears no cap at all, which vindicates the empty string already sitting in the Đinh hat pool. The round-collar áo viên lĩnh and its bổ tử badge are Lê inventions and stay out of this era.

What it became

collar-placket-square

**Định Quốc Công Nguyễn Bặc · Danis Nguyễn**
[hlts-6-1785914387.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-6-1785914387.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Viền gấm · Brocade band

A broad copper-gold brocade band running the full length of the lapel on black damask, repeated at the cuff.

Taken: the band, full length and broad. It is the one garment mark that still reads when the head is too small to see, which is why it carries rank in an era with no regulated cap.

What it became

collar-band-brocade

**A consort's robe · costume exhibition**
[bzvn-tao-hinh-phuc-trang-viet-phuc-ho-linh-trang-si-bi-an-mo-vua-dinh-dien-vien-nhan-vat-9.jpg](https://bazaarvietnam.vn/wp-content/uploads/2026/04/bzvn-tao-hinh-phuc-trang-viet-phuc-ho-linh-trang-si-bi-an-mo-vua-dinh-dien-vien-nhan-vat-9.jpg)
via [Harper's Bazaar VN](https://bazaarvietnam.vn/tao-hinh-phuc-trang-trong-ho-linh-trang-si-bi-an-mo-vua-dinh-gay-sot-vi-qua-hoanh-trang/)

### Viền tô mộc · Oxblood band

The same band in plum on teal damask, with black couched-cord scrollwork and pink lotus appliqué over the shoulder, layered over an inner robe.

Taken: the band in its second colour, which is why `collar-band-oxblood` exists as well as the gold. Not taken: the lotus appliqué — at portrait scale it is three pixels of pink.

What it became

collar-band-oxblood

**An Nhiên · Trần Thiên Tú**
[hlts-11-1785914396.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-11-1785914396.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Thắt lưng thừng · Coiled rope belt

Thick hemp rope wound three or four turns over a wide leather band, knotted with a loose tail, on a rust tunic with a tone-on-tone chest roundel.

Taken: the coils, and the gap between them. Drawn with a leather band behind it at first — the band covered the middle turn and three coils became one flat strap.

What it became

belt-rope-coil

**Hoàng hậu Dương Vân Nga · Đỗ Thị Hải Yến**
[hlts-5-1-1785914386.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-5-1-1785914386.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Búi cao · Tall forward knot

A tall lacquered knot set high on the crown and carried forward of it, taller than it is wide, over sleek drawn-back hair.

Taken: the proportion. Every other bun in the family is wider than it is tall and sits *on* the head; this frame is what says it stands off. The first pass was 12.5 × 7.5 and came out a loaf of bread.

What it became

bun-tall-fore

**Tả tướng quân · Quách Ngọc Ngoan**
[hlts-8-1785914389.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-8-1785914389.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Búi gáy · Nape knot

Hair drawn back and tied in a small knot low at the nape — not a crown topknot, and no cap over it.

Taken: the position. It is drawn at the jaw’s edge because that is where it shows on a frontal bust; put on the crown it is just `topknot` again. A soldier’s knot, not a scholar’s.

What it became

knot-nape

**Hoàng hậu Dương Vân Nga · Đỗ Thị Hải Yến**
[hlts-5-1-1785914386.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-5-1-1785914386.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Trâm · Straight pin

A plain straight pin driven right through the knot and out the far side, with one small gold floret at the visible end.

Taken: the through-and-out geometry. The library’s existing pins all sit *in* the hair as a stub; this one crosses it.

What it became

hairpin-plain

**Nguyên Phong · Tuấn Trần**
[hlts-2-1785914385.jpg](https://i1-giaitri.vnecdn.net/2026/08/05/hlts-2-1785914385.jpg)
via [VnExpress](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)

### Vải thô · Working cloth

Indigo coarse weave, crossed lapel, a cloth sash, a braided cord baldric with wooden toggles, hair long and half-tied, bark-wrapped hilt. A hunter, not a soldier.

**The reason the gilt is rationed.** This is what the film puts on someone with no rank, and it is what `tier 0` has to keep reading as. The rope belt goes here; the beast-mask never does.

What it became

No new part — recorded for the reading, not the geometry.

The library

## 267 parts to 277

Every one is authored in `scripts/build-faces.mjs` as geometry, measured by headless Chromium and emitted to `public/faces/` and `parts.generated.ts`. `FaceRenderer.ts` was not touched — it stacks whatever it is handed and knows nothing about who wears it.

The ten new parts, rendered from the committed SVGs

**Two of these were wrong on the first pass, and this sheet is how it was caught.** `guard-beastmask` came out a **smiley face** — two dots and an upcurved jaw is an emoticon long before it is a beast, and the eye finds that arrangement whether or not it was meant. Going back to the frame fixed it: a brow ridge over the eyes, a jaw that bulges upward, two fangs. `bun-tall-fore` was 12.5 × 7.5 and came out a loaf of bread; the frame says taller than wide, so it is 9.5 × 13 now. Neither was a type error, and neither would have been caught by reading the diff.

What changed on screen

## The tenth century now reads as the tenth century

Both plates below are screenshots of the running game.

**The ten champions the roster dates to the Đinh era**, at the size the Codex draws them. Fan-shell scale, beast-mask pauldrons, gilt and oxblood lapel bands, the helm with its brow band and plume, the square placket, the rope belt. Before this pass a Đinh general drew from a pool of three helms and a two-flap wrap, and the century had one silhouette.

**The drawn soldier, three tiers, before and after.** `figureEraFor` mapped the Mandate's `founding` era to `'ly'`, so the founding of the realm was fought in eleventh-century green. It maps to `'dinh'` now: undyed brown, a dark leather helm carrying a plume, shell courses on the chest at trained, the gorget at guard. The helm is `nauDark` rather than the `hide` the first pass used — at plate scale the darker leather closed up with the hair under it and the head came out one black mass.

Palette

## Eight of the film's ten colours were already pigments

Photograph the costumes together and the range is narrow on purpose: charcoal and verdigris-black for authority, indigo and teal for the court, rust and oxblood for cloth worn under armour, undyed hemp for everyone else, gold once per figure and never twice. That is the same discipline the ink palette was built on, which is why the mapping is this clean.

mựcPIGMENT.mucLacquered scale; the empress's damask

chàmPIGMENT.chamThe official's robe; Nguyên Phong's tunic

gỉ đồngPIGMENT.giDongThe consort's teal; verdigris on bronze

sỏi sonPIGMENT.sonThe cord crossing the breastplate

hòePIGMENT.hoeGilt pauldron, brow band, belt plaques

nâuPIGMENT.nauThe Đinh robe; leather body

nâu đậmPIGMENT.nauDarkThe Đinh helm

daPIGMENT.hideAged cowhide; the gorget; bracers

điệpPIGMENT.diepUndyed hemp, mourning white, the plume

tô mộc#7d4a52 · newThe plum lapel band. A fixed part colour, not a pigment — one part wears it

The diff

## What moved, and what proved it

| File | Change |
| --- | --- |
| scripts/build-faces.mjs | Ten new parts. Regenerated to 277 SVGs plus the manifest. |
| src/ui/faces/wardrobe.ts | Đinh hat pools widened from 4 to 6; `manKnotFor` gains the nape knot for Đinh and Lý; `womanKnotFor` now takes an era; a Đinh minister branch (đối khâm + placket); a Đinh general branch (shell armour, beast mask, band); women of rank in early eras get the wrap and band instead of the yếm. |
| src/ui/faces/heroLook.ts | One line — `womanKnotFor`'s new era argument. |
| src/state/types.ts | `'dinh'` added to `ArmyWardrobe` and `VIET_WARDROBES`. Eight Việt wardrobes, thirteen total. |
| src/ui/ink/devices.ts | `FIGURE_THEMES.dinh`; `FigureEra` widened; `figureEraFor`'s `founding` case returns `'dinh'`; a shell-lame chest and a gorget in `figure()`; a Đinh case in `drawCrown`. |
| src/ui/ink/settlements.ts | Fell out of widening the era: `Era` gains `'dinh'`, a narrower rampart (62 against Lý's 74) and a plain timber beam over the gate where every other era has a roof. |

**npx tsc --noEmit**clean

**yarn faces:check**277 parts, byte-identical

**verify-heroes.mjs**20/20 — incl. “the wardrobe ships every part it asks for”

**gate/smoke.mjs**15/15, every mode, no console errors

**yarn build**✓ 7.95s

### What was deliberately not taken

**The gilt belongs to three men, not to an army.** Every frame above except the last is a hero costume shot for a press gallery. The last one is the film's answer for someone with no rank, and it is undyed cloth and rope. Putting the beast-mask pauldron on `tier 0` would undo the one thing the six slots exist to protect: that a levy reads as a farmer pulled off a field.

**The Mường material is a separate people, not an early Việt.** The shaman's two-horned ritual hat with its ribbon streamers, and the tan stepped-lozenge appliqué on his robe, come from a living highland tradition the film borrowed for a tenth-century rite. It is the most distinctive costume in the production and it is the one thing here that was refused outright — using it as generic “archaic Việt” would repeat the exact error the era table was written to prevent. If it ever enters, it enters as its own thing: a Mường auxiliary, a highland patron, with the label on it.

**Drum in the chrome, dynasty in the world.** The house rule still governs. A cinematic silhouette can inform how a Đinh general is drawn *in the world*; it does not restyle the shell, and nothing whose only basis is the film's invention enters the roster's historical claims. The bio layer says what the record says; the portrait may be handsome.

Still on the table

## Two things the research turned up that this pass did not spend

**Thái Bình Hưng Bảo.** Đinh Tiên Hoàng minted it in 970 — the first coin struck by a Vietnamese state, a round disc with a square hole. The film's premiere built its entire stage set out of it. It would be a better `SealMotif` than anything in the current list of four (`star`, `lotus`, `bird`, `stakes`), because it is a drawn device carrying real information and no Hán glyph — which is exactly what the seal rule in `devices.ts` demands.

**Thập đạo quân.** In 974 the court organised the army as ten đạo of ten quân of ten lữ of ten tốt of ten ngũ of ten men. Nominal, not a census — the standing force at Hoa Lư was thirty to forty thousand — but it gives Dragon Ascent a period-true vocabulary for host size, and the arithmetic lands inside the renderer's own limits: at `MEN_PER_MARK = 55` a lữ of a thousand is eighteen drawn marks and a quân of ten thousand a hundred and eighty-two, both under `HOST_MARK_CAP = 420`.

Sources

## Where this came from

[VnExpressTạo hình dàn nhân vật phim “Hộ linh tráng sĩ” — the character-look gallery. Nine of the twelve frames above are from here](https://vnexpress.net/tao-hinh-dan-nhan-vat-phim-ho-linh-trang-si-5105537.html)
[Harper's Bazaar VNThe costume exhibition — close photography of the harness, the consorts' robes and the helm. Two frames above](https://bazaarvietnam.vn/tao-hinh-phuc-trang-trong-ho-linh-trang-si-bi-an-mo-vua-dinh-gay-sot-vi-qua-hoanh-trang/)
[Nhân DânKhám phá phục trang các nhân vật — the piece-by-piece costume breakdown: the 5 mm cowhide, the two-month build, the phoenix-wing crown, the tiger amulet modelled on a Đinh-period ceramic dragon head](https://nhandan.vn/kham-pha-phuc-trang-cac-nhan-vat-trong-ho-linh-trang-si-bi-an-mo-vua-dinh-post956879.html)
[Công LuậnHệ thống giáp trụ và binh khí — the armour and weapon programme, and the materials tested](https://congluan.vn/phim-ho-linh-trang-si-gay-chu-y-voi-he-thong-giap-tru-va-binh-khi-cong-phu-post342915.html)
[ELLE VNProduction design — Bao Tranchi and Mai Lâm, the ninety-nine coffins premise](https://www.elle.vn/the-gioi-van-hoa/ho-linh-trang-si-bi-an-mo-vua-dinh-phim-2026/)
[Thanh Niên83 ngày đêm tại Ninh Bình — the shoot](https://thanhnien.vn/ho-linh-trang-si-bi-an-mo-vua-dinh-quay-83-ngay-dem-tai-ninh-binh-185260203224158613.htm)
[Tuổi TrẻThe Ninh Bình premiere, 22 Aug 2026](https://tuoitre.vn/ho-linh-trang-si-ra-mat-hoanh-trang-o-ninh-binh-va-nhung-nguoi-lai-do-nong-dan-lan-dau-di-tham-do-100260823065456359.htm)
[Sở VHTT Ninh BìnhQuân đội thời nhà Đinh — the thập đạo structure of 974 and the standing force at Hoa Lư](https://vannghe.ninhbinh.gov.vn/nghien-cuu-lich-su/quan-doi-thoi-nha-dinh-246.html)
[Báo Ninh BìnhNhà nước Đại Cồ Việt thời Đinh (968–980)](https://baoninhbinh.org.vn/nha-nuoc-dai-co-viet-thoi-dinh-968-980-/d20180308083559954.htm)

Film stills are reproduced here as cropped details for identification and comparison against the drawn parts, each credited and linked to its source. Copyright remains with BHD / TV360 and the publishers listed above. The three parchment plates are screenshots of this game.

Counts after this pass: 277 face parts, 49 hats of which 11 are helms, 13 army wardrobes, 6 hero eras, 17 heroes dated `dinh` out of 113.