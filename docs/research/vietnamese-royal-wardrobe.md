# Royal wardrobe extension · 7 September 2026

54 new purchasable portrait parts: 18 hats, 18 garments and 18 ornaments. Each of the six existing era pools receives nine items. IDs, Vietnamese names, prices, slots and identity restrictions are recorded in `src/data/royalWardrobe.json`; `scripts/faces/royal-wardrobe.mjs` is the editable drawing source. These are independent authored vectors in the existing portrait coordinate system and pigment palette, delivered in a supplemental SVG atlas. They do not replace or recolour the accepted original files.

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

The follow-up replaces six of the 54 IDs with built-in ImageGen artwork: `royal-{ly,tran,tayson}-{hat,robe}-2`. Lý uses lotus ornament, cinnabar cloth and laced lamellae; Trần uses cloud trim, indigo cloth and red lacing; Tây Sơn uses wrapped headwear and a restrained laced-leather interpretation. The other 48 parts keep their authored vectors. Prices and ownership do not change, so already purchased war items receive their new appearance without another charge.

These decorative variants remain historically informed game interpretations. In particular, the lotus finial and exact lamella/shoulder patterns are artistic choices, not proof of surviving Lý–Trần battlefield objects. Trần Quang Đức explicitly discusses the scarcity of armour evidence in [his 2013 interview about *Ngàn năm áo mũ*](https://www.rfa.org/vietnamese/news/programs/LiteratureAndArts/thousand-years-vn-ancient-dresses-ml-11082013150518.html). The Tây Sơn leather assembly is not presented as a standardized period uniform. The [existing Đông Hồ petition print](../../public/art/story-prints/petition-v1.webp) supplies drawing style only, never armour evidence.

The exact generation prompts and targeted background/style edits are in `docs/hero-war-dongho-v1-prompts.json`; source masters are in `docs/art/hero-war-v1/`. `npm run faces:war` extracts the production matte and packs six transparent PNGs into the 1024×428 atlas at `public/faces-royal/war-v1/`. No source masters are included in the shipped game. The renderer selects these frames by the existing IDs and uses the measured center-front band to fit the caps. `npm run verify:war-art` checks cutouts, generated-frame selection and 672 head/hat/eye combinations. Review the complete sets in `output/hero-war-v1/complete-sets.png`.

`npm run faces:royal` regenerates all assets and manifests. `npm run verify:royal-wardrobe` checks all 54 purchases, storage failure, duplicate/exact-balance purchases, compatibility, ID round trips, atlas frames, chin fitting, both UI languages and reload persistence. Screenshots and report are written to `output/royal-wardrobe/`. Existing creator-fit and Legacy regression suites are also required when changing fitting or currency behavior.
