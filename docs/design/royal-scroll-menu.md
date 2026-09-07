# Royal scroll menu

The desktop main menu uses a vertical scroll inspired by Vietnamese **sắc phong**. The right-side menu composition stays intact; its paper background now carries the material and ceremonial cues.

## Research

Reviewed 7 September 2026:

- [Vietnam National Museum of History — Sưu tập sắc phong thời Lê–Nguyễn](https://baotanglichsu.vn/vi/Articles/3096/18447/suu-tap-sac-phong-thoi-le-nguyen-o-bao-tang-lich-su-quoc-gia.html): royal grants authenticated by an imperial seal, made on specially prepared paper or fabric. Describes Nghè paper and gold/silver decoration. The collection photographs show wide decorated sheets. The fourth photograph was visually inspected for its warm yellow ground, subdued cloud/dragon decoration, border, and red seal.
- [Museum research bulletin — Sưu tập sắc phong lưu giữ ở di tích đền–đình Kim Liên, p. 84](https://baotanglichsu.vn/DataFiles/asset/upload/data_hung_/thong_bao_khoa_hoc/so_1_nam_2015/Nguyen_Ngoc_Chat_-_bo_suu_tap_sac_phong....pdf): describes thick yellow dó paper, cloud, dragon and floral decoration, and a square vermilion seal. The studied sheets are 126–142 cm long and 45–52 cm wide.
- [Vietnam archival association — Về các loại dấu triện kim bảo trên sắc phong thần 1428–1945](https://www.archives.org.vn/gioi-thieu-tai-lieu-nghiep-vu/ve-cac-loai-dau-trien-kim-bao-tren-sac-phong-than-1428-1945.htm): discusses the decorated paper, imperial seal impressions and their meaning.

## Interpretation for the game

This is an interface adaptation, not a reconstruction or a document attributed to one particular king. The vertical proportions and small wooden roll ends make the requested scroll metaphor legible within the menu's existing footprint. They are design choices, not mounting details established by the references.

- Warm opaque paper, restrained fibres, curved edges and shaded rolls convey material.
- Narrow ochre borders and small cloud flourishes sit outside the controls. The simple diamond register is a game ornament rather than a copied historical brocade.
- A small square vermilion impression uses the game's existing lotus device. It does not reproduce a historical seal inscription or invent decorative Hán text.
- The palette, softened ink outlines and wordmark retain the game's Đông Hồ treatment. The centre stays clear for English and Vietnamese text.

## Implementation and checks

`src/ui/ink/royalScroll.ts` draws one cached stamp for each menu size. Grain and ornament are baked once. `src/scenes/menu/front.ts` uses it for the desktop main menu; controls keep their existing positions and hit areas.

On the first desktop menu appearance per page load, `scrollOpening.ts` unrolls the paper downward over 720 ms after a 140 ms opening beat. A temporary lower-roll stamp travels with the cropped paper edge; rows fade in after the paper reaches them. The full-size text and controls never stretch. Clicking the scroll finishes it immediately and consumes that press. Game or system reduced-motion preferences show the open menu immediately. Navigation, language changes and redraws do not replay it; teardown restores the controls and releases the temporary roll and input blocker. The first-run tour waits for actual completion.

Checked fresh and saved menus, compact/standard/wide desktop sizes, phone regression, large/small interface settings, language changes, Settings, Classic, Continue, and the installed game client's screenshot/text output. Screenshots and scratch verification output are under `output/royal-scroll-menu`.

Opening checks cover rolled/intermediate/settled screenshots, click-to-finish, controls after skipping, no replay on redraw/navigation, redraw and scene restart during the animation, both reduced-motion preferences, and tour ordering. Intermediate screenshot capture slows the tween clock for inspection; the shipping duration is unchanged.
