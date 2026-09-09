# Royal wardrobe extension · 7 September 2026

54 purchasable portrait parts: 18 hats, 18 garments and 18 ornaments. Each of the six existing era pools receives nine items. IDs, Vietnamese names, prices, slots and identity restrictions are recorded in `src/data/royalWardrobe.json`. All 54 now use generated Đông Hồ artwork in the supplemental PNG atlas at `public/faces-royal/atlas.png`. The original free wardrobe remains available.

## Evidence and interpretation

- [Vietnam National Museum of History: Nguyễn garments in the collection](https://baotanglichsu.vn/vi/Articles/3096/18741/y-phuc-thoi-nguyen-tai-bao-tang-lich-su-quoc-gia.html). Garment and embroidered-facing construction; Nguyễn objects are not evidence for tenth-century clothing. Some collected robes are worship garments.
- [Vietnam National Museum of History: Nguyễn rank badges](https://baotanglichsuquocgia.vn/vi/Articles/3096/18573/bo-tu-tren-pham-phuc-quan-trieu-nguyen.html). Civil birds and military beasts remain distinct; badges appear only in Lê and Nguyễn designs. Regulations changed within the Nguyễn period, so these items do not claim one universal court uniform or assign a historical grade to game rarity.
- [Vietnam National Museum of History: Đông Cứu robe embroidery](https://baotanglichsu.vn/VI/Articles/3091/48956/nghe-theu-long-bao-lang-djong-cuu.html). Dragon, cloud and wave embroidery informs the royal garments. The game's simplified motifs and limited colours are not literal stitch diagrams.
- Trần Quang Đức, *Ngàn năm áo mũ* (2013), with the prior project review in [Vietnamese wardrobe v2](vietnamese-wardrobe-v2.md). Vietnamese xung thiên and Nguyễn cửu long thông thiên inform the upright-wing royal caps. The latter has nine simplified dragon ornaments; this small game illustration is not a museum replica. Prior review supports the restrained flat-topped Đinh cap and Trần đinh tự silhouette.

Early Đinh, Lý and Trần military garments are interpretations: surviving evidence does not establish exact panel cuts, lacing or belt ornament for every variant. Đinh has a leather interpretation, not a purported archaeological reconstruction. Tây Sơn cloth-covered cap and armour are also interpretations, not a claim that all troops wore one documented uniform. Nguyễn military court dress uses robes and a rank square, without medieval armour. Nhật Bình and vành dây are offered to women only. Floral/cloud ornament on early fabrics is decorative illustration, not evidence of a surviving matching object. Player-selected combinations are period-inspired dress, not authenticated individual portraits.

## Purchases and use

Open **Dynasty → Temple → Royal wardrobe**, or use the same button during Coronation. Select the era on the preceding editor screen. All 54 additions require a permanent purchase with the existing Legacy points (the dynasty's spendable currency); lifetime dynasty XP is never deducted. Prices range from 80 to 220 points. Owned items can be equipped and removed freely and remain owned across reigns. They add no stats and do not occupy perk loadout slots. A purchase is retained if the player later discards an outfit edit.

Only thumbnails may preview locked items. The normal look builder checks ownership and era/identity compatibility. ID-based choices survive saving/reopening; old saved part IDs and original free pools remain valid. The new robes use their authored embroidery colours, so their editor hides the ineffective base-robe swatches until an original garment is chosen again.

Ownership and point deduction are written together in the existing Legacy record. Repeat purchase is idempotent. Missing points, unknown IDs, unavailable storage or a failed storage write cannot grant a purchase. The new ownership field defaults to empty for existing saves and survives subsequent perk purchases and point awards.

## Verification

### Generated war-set refinement

The first refinement replaced six of the 54 IDs with built-in ImageGen artwork: `royal-{ly,tran,tayson}-{hat,robe}-2`. Lý uses lotus ornament, cinnabar cloth and laced lamellae; Trần uses cloud trim, indigo cloth and red lacing; Tây Sơn uses wrapped headwear and a restrained laced-leather interpretation. Those six designs are retained in the complete PNG wardrobe. Prices and ownership do not change, so already purchased items receive their new appearance without another charge.

These decorative variants remain historically informed game interpretations. In particular, the lotus finial and exact lamella/shoulder patterns are artistic choices, not proof of surviving Lý–Trần battlefield objects. Trần Quang Đức explicitly discusses the scarcity of armour evidence in [his 2013 interview about *Ngàn năm áo mũ*](https://www.rfa.org/vietnamese/news/programs/LiteratureAndArts/thousand-years-vn-ancient-dresses-ml-11082013150518.html). The Tây Sơn leather assembly is not presented as a standardized period uniform. The [existing Đông Hồ petition print](../../public/art/story-prints/petition-v1.webp) supplies drawing style only, never armour evidence.

The original six generation prompts and targeted background/style edits are in `docs/hero-war-dongho-v1-prompts.json`; source masters are in `docs/art/hero-war-v1/`. `npm run faces:war` rebuilds their intermediate cutouts at `public/faces-royal/war-v1/`. The combined pack retains those three hats and uses the revised sleeve masters for all robes. No source masters are included in the shipped game. `npm run verify:war-art` checks the current shipped cutouts, generated-frame selection and 672 head/hat/eye combinations. Review the complete sets in `output/hero-war-v1/complete-sets.png`.

### Complete generated wardrobe · 10 September 2026

The remaining 48 SVG designs were replaced with individually generated Đông Hồ pieces using the built-in ImageGen tool and the existing petition print as the style reference. Each exact generation prompt, original output path and any background correction is preserved in `docs/art/royal-dongho-v1-prompts.json`; production masters are in `docs/art/royal-dongho-v1/`. Background edits use a pure magenta production matte where native alpha was unavailable. `scripts/faces/royal-dongho-pack.mjs` removes that matte, crops transparent margins, sizes the cutouts and packs all 54 PNG frames. It does not draw or rasterize SVG substitutes.

The renderer loads only the combined royal PNG atlas and JSON for all supported face packs. Old royal SVG files are removed. Individual cutouts and the retained war intermediate atlas are excluded from service-worker precaching; the combined atlas remains part of the offline game. Inventory IDs, prices, unlocks and saved selections are unchanged.

`npm run verify:royal-art` validates all 54 cutouts, alpha and matte removal, the live texture used by every complete outfit, 4,032 head/hat/eye combinations and loading across the three face packs. Review `output/royal-dongho/contact-sheet.png` and `output/royal-dongho/all-outfits.png` for the complete artwork.

### Sleeves extending below the portrait · 10 September 2026

All 18 royal robes were edited with built-in ImageGen after review: both arms now hang down, with sleeves continuing to the straight bottom portrait crop instead of ending in hollow sideways cuffs. The designs retain their neckline, colours, embroidery and armour identity. `docs/art/royal-dongho-sleeves-v2-prompts.json` records the exact edit prompt, input master and generated output for each robe; accepted masters are in `docs/art/royal-dongho-sleeves-v2/`. These overrides take priority in the royal packer, including the three earlier war robes. The existing frame dimensions and saved IDs remain compatible.

Royal hats now use individual band contacts in `ROYAL_HAT_CONTACTS` (`src/ui/faces/donghoFit.ts`). The Đinh wrap is centered on its head opening, excluding the side knot. Lê and Nguyễn winged caps expand their actual crown to the forehead width while the wings fit independently inside the frame. Crown height follows the head and stays inside the portrait bounds. The generated artwork is unchanged by this fitting correction. The royal-art gate checks actual PNG scalp coverage for all 288 head/hat pairs, eye clearance for 4,032 combinations and clipping; four additional galleries cover narrow, broad and tall heads in `output/royal-dongho/hats-head-*.png`.

`npm run faces:royal` repacks the committed artwork and regenerates atlas metadata and part definitions without making new image-generation calls. `npm run verify:royal-wardrobe` checks all 54 purchases, storage failure, duplicate/exact-balance purchases, compatibility, ID round trips, atlas frames, chin fitting, both UI languages and reload persistence. Screenshots and report are written to `output/royal-wardrobe/`. Existing creator-fit and Legacy regression suites are also required when changing fitting or currency behavior.
