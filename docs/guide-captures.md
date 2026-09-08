# Gameplay captures for Help

The guide uses ten English and ten Vietnamese screenshots from the running game, captured on 2026-09-08. They are direct crops of the actual Phaser canvas; no controls, labels, results, or artwork were redrawn or composited.

Run the development server, then `node scripts/capture-help.mjs`. `DEV_URL` overrides `http://127.0.0.1:5179`; `GUIDE_LOCALES=en` or `GUIDE_LOCALES=vi` limits the locale pass. `GUIDE_SYSTEMS_ONLY=1` refreshes only Build, Relations, Heroes and Court. The script requires the existing Playwright dependency and its Chromium browser.

The capture viewport is 390 × 620 CSS pixels at DPR 2. Screenshots are encoded as WebP at quality 0.90. Full screenshots, text state for each scene, crop rectangles, and the console error report are written to `output/help-captures/` for review. The shipped twenty images include a separate capture for every topic group in the two chapters.

| Asset in `public/art/guide/{en,vi}/` | Pixels | Visible gameplay |
| --- | --- | --- |
| `conquest-map.webp` | 780 × 800 | Resource trends, power and threat, the wave countdown, capital and surrounding map |
| `conquest-decision.webp` | 780 × 896 | Selected power's benefit, illustrated card hand, Take this, Reroll, and Skip |
| `conquest-army.webp` | 732 × 850 | Realm defence and threat, recruitment, standing host, general, morale, supply, and field power |
| `conquest-build.webp` | 732 × 550 | Claim capacity, claim action, owned provinces, building slots and defence |
| `conquest-relations.webp` | 732 × 600 | Foreign courts, relations, strength, war appetite and feuds |
| `conquest-heroes.webp` | 732 × 420 | Ruler posting, payroll, hero portrait, attributes and appointment |
| `conquest-court.webp` | 732 × 870 | Stability, drift, offices, Favor, authority, obedience, estates and decree action |
| `battle-overview.webp` | 780 × 688 | Commander, enemy tell, real battlefield after contact, troop and morale gauges |
| `battle-orders.webp` | 740 × 438 | Three stances, five formations, Pause, Pull back, Hand over, and Leave the field |
| `battle-result.webp` | 708 × 760 | Actual Skirmish aftermath: outcome, losses, survivors, exchanges, Fight again, and Back |

Conquest starts through `__startBenchGame` with seed `20260908`; the existing prompt resolver answers the founding choices. Time is held while photographing. The power-draft fixture opens the game's actual level-3 prompt with Iron Levy, Rice Tribute, and Mandarin Academy, making the same instructional choices available in each locale. Army, Build, Affairs, Heroes and Court open their real lanes. These system captures use the same founding state and crop away unused space below the relevant controls.

The battle uses the actual Skirmish defaults, with battlefield generation seeded to `20260908`. The real battle system advances to the third exchange for the battlefield and order captures, then resolves the fight and supplies its own record to the game's result screen. The example intentionally shows the defeat produced by holding an unsuitable formation; the casualty figures are calculated by the battle system. Ambient animation and combat randomness can change the precise frame and numbers between runs. Accelerated capture time shown in the report is not a claim about typical battle duration.

All twenty cropped assets and the full screenshots were inspected visually. The completed capture run reported no browser console or page errors. Guide instructions are numbered separately; there are no annotation markers baked into these screenshots.

The help page's navigation, scrolling, image viewer, clipping and responsive layout are checked by `node test_scripts/verify/verify-illustrated-guide.mjs`. `DEV_URL` may also point this check at the production preview including its base path. Run `node test_scripts/verify/verify-guide-copilots.mjs` and `node test_scripts/verify/verify-guided-run.mjs` against the development server for the guided launch and gameplay checks.

The Conquest chapter has seven contents destinations: Resources, Build, Army, Relations, Heroes, Court and Progression. Its 39 detailed sections explain screen navigation, costs, limits, tradeoffs and recovery; Battle retains 13 detailed sections. Both languages use the same structure. System prose lives in `src/i18n/catalogs/guideSystems.ts` and links to the live controls by name rather than freezing state-dependent prices.
