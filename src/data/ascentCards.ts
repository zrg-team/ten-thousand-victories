import { PLAYER_KINGDOM_ID } from '../game/constants';
import type { PowerCardDef } from '../state/types';

/**
 * The Dragon Ascent Power Draft pool.
 *
 * **Card ids are append-only save contracts from this commit** — exactly like story fragment
 * ids. The Cabinet of Seals (`state/cabinet.ts`, localStorage `mandate:cabinet:v1`) keys a
 * player's permanent collection by these ids, so renaming one silently deletes what they own.
 * Renames become migrations; retirements leave the id resolvable or get filtered by the
 * cabinet's defensive parse, which drops ids `findPowerCard` no longer knows.
 *
 * `levels[]` is the cabinet ladder: index 0 is Lv1 (the card as first found), 1 and 2 are the
 * combined Lv2/Lv3. The step is ≈ +30% of each card's *own* delta — deliberately shallow,
 * inside the master dossier's §03 power budget, because a level mostly buys draft weight
 * (`cabinetWeightMult`), not raw effect. A card is *always* applied at its cabinet level, not
 * its stack index: stacking pushes more copies of the same level, levelling deepens each copy.
 * Rule cards (empty effects) level in their rule's own number through `cabinetRuleMult`;
 * story-only and evolution-only cards are landmarks and do not level.
 *
 * Each card's payload is an ordinary `CourtEffect`, so `applyCourtEffect` does all the
 * work and stacking comes free: every take pushes another permanent `CourtModifier`, and
 * `getCourtBonuses` sums them. Taking Iron Levy three times really is +33% army power.
 *
 * Four pillars, so a draft almost always offers a meaningful choice rather than a strict
 * upgrade: MILITARY (army power), ECONOMY (income), LOGISTICS (build/recruit speed),
 * DEFENCE (holding what you took).
 *
 * Evolutions: max out both parents and they retire into a unique Jade card. These are the
 * run's landmarks — the moment a long game pays off.
 *   iron-levy      + royal-guard    → bach-dang-stakes
 *   village-muster + war-drums      → thunder-march
 *   rice-tribute   + granary-edict  → celestial-granary
 */
export const POWER_CARDS: PowerCardDef[] = [
  {
    id: 'hidden-paths', rarity: 'bronze', maxStacks: 2,
    levels: [15, 19, 23].map(pct => ({ effect: { permanent: true }, display: { pct } })),
  },
  {
    id: 'march-escort', rarity: 'silver', maxStacks: 2,
    levels: [25, 31, 38].map(pct => ({ effect: { permanent: true }, display: { pct } })),
  },
  // ── Bronze ────────────────────────────────────────────────────────────────
  {
    id: 'iron-levy',
    rarity: 'bronze',
    maxStacks: 3,
    evolvesWith: 'royal-guard',
    evolvesInto: 'bach-dang-stakes',
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.11 }, display: { pct: 11 } },
      { effect: { permanent: true, armyPowerModifier: 0.14 }, display: { pct: 14 } },
      { effect: { permanent: true, armyPowerModifier: 0.18 }, display: { pct: 18 } },
    ],
  },
  {
    id: 'rice-tribute',
    rarity: 'bronze',
    maxStacks: 3,
    evolvesWith: 'granary-edict',
    evolvesInto: 'celestial-granary',
    levels: [
      { effect: { permanent: true, resourceRateModifier: { food: 9, gold: 5 } }, display: { food: 9, gold: 5 } },
      { effect: { permanent: true, resourceRateModifier: { food: 11, gold: 6 } }, display: { food: 11, gold: 6 } },
      { effect: { permanent: true, resourceRateModifier: { food: 14, gold: 8 } }, display: { food: 14, gold: 8 } },
    ],
  },
  /**
   * Rewritten from `marketGoldOutputModifier: 0.14`.
   *
   * "+14% market gold" was the clearest example of the pool's problem: a number attached to a
   * system the player never touches, in a currency the mode oversupplies. It only became a real
   * card once coin had something finite to buy — now that walls and companies escalate in price
   * with every purchase, a discount on them is a decision about how long the treasury lasts.
   */
  {
    id: 'salt-roads',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'bronze',
    maxStacks: 2,
    // Rule cards level in the rule's own number: the per-stack constant in `DoctrineSystem` is
    // scaled by `cabinetRuleMult`, and these displays must quote the same arithmetic.
    levels: [
      { effect: { permanent: true }, display: { pct: 22 } },
      { effect: { permanent: true }, display: { pct: 27 } },
      { effect: { permanent: true }, display: { pct: 33 } },
    ],
  },
  {
    id: 'feigned-retreat',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'bronze',
    maxStacks: 3,
    levels: [
      { effect: { permanent: true }, display: { pct: 7 } },
      { effect: { permanent: true }, display: { pct: 9 } },
      { effect: { permanent: true }, display: { pct: 11 } },
    ],
  },
  {
    id: 'village-muster',
    rarity: 'bronze',
    maxStacks: 3,
    evolvesWith: 'war-drums',
    evolvesInto: 'thunder-march',
    levels: [
      {
        effect: { permanent: true, recruitSpeedModifier: 0.4, recruitmentSupplyCostModifier: -0.08 },
        display: { pct: 8 },
      },
      {
        effect: { permanent: true, recruitSpeedModifier: 0.5, recruitmentSupplyCostModifier: -0.1 },
        display: { pct: 10 },
      },
      {
        effect: { permanent: true, recruitSpeedModifier: 0.62, recruitmentSupplyCostModifier: -0.13 },
        display: { pct: 13 },
      },
    ],
  },

  // ── Silver ────────────────────────────────────────────────────────────────
  {
    id: 'bronze-drums',
    rarity: 'silver',
    maxStacks: 3,
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.12, armyXpModifier: 0.15 }, display: { pct: 12, xp: 15 } },
      { effect: { permanent: true, armyPowerModifier: 0.14, armyXpModifier: 0.18 }, display: { pct: 14, xp: 18 } },
      { effect: { permanent: true, armyPowerModifier: 0.17, armyXpModifier: 0.23 }, display: { pct: 17, xp: 23 } },
    ],
  },
  {
    id: 'corvee-labour',
    rarity: 'silver',
    maxStacks: 3,
    levels: [
      { effect: { permanent: true, buildSpeedBonus: 1, buildingCostModifier: -0.1 }, display: { pct: 10 } },
      { effect: { permanent: true, buildSpeedBonus: 1, buildingCostModifier: -0.13 }, display: { pct: 13 } },
      { effect: { permanent: true, buildSpeedBonus: 1, buildingCostModifier: -0.16 }, display: { pct: 16 } },
    ],
  },
  {
    id: 'granary-edict',
    rarity: 'silver',
    maxStacks: 3,
    evolvesWith: 'rice-tribute',
    evolvesInto: 'celestial-granary',
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { food: 12, supplies: 6 },
          buildingSuppliesUpkeepModifier: -0.1,
        },
        display: { food: 12, supplies: 6 },
      },
      {
        effect: {
          permanent: true,
          resourceRateModifier: { food: 15, supplies: 8 },
          buildingSuppliesUpkeepModifier: -0.12,
        },
        display: { food: 15, supplies: 8 },
      },
      {
        effect: {
          permanent: true,
          resourceRateModifier: { food: 19, supplies: 10 },
          buildingSuppliesUpkeepModifier: -0.15,
        },
        display: { food: 19, supplies: 10 },
      },
    ],
  },
  {
    id: 'earthen-ramparts',
    rarity: 'silver',
    maxStacks: 3,
    levels: [
      { effect: { defenseBoost: 8 }, display: { defense: 8 } },
      { effect: { defenseBoost: 10 }, display: { defense: 10 } },
      { effect: { defenseBoost: 13 }, display: { defense: 13 } },
    ],
  },
  {
    id: 'bamboo-palisade',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'silver',
    maxStacks: 1,
    // Verb and slot rules have no number to deepen — their levels buy draft weight only, which
    // is the ladder's steep step anyway. The duplicate entries keep the cabinet arithmetic
    // (`levels[cabinetLevel - 1]`) uniform across the table.
    levels: [
      { effect: { permanent: true }, display: {} },
      { effect: { permanent: true }, display: {} },
      { effect: { permanent: true }, display: {} },
    ],
  },
  {
    id: 'mountain-pass',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'silver',
    maxStacks: 2,
    levels: [
      { effect: { permanent: true }, display: { ticks: 1 } },
      { effect: { permanent: true }, display: { ticks: 1 } },
      { effect: { permanent: true }, display: { ticks: 1 } },
    ],
  },
  {
    id: 'surveyors-corps',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'silver',
    // Two stacks takes the realm from one claim at a time to three, which is as far as the pacing
    // this cap exists to create will stretch before expansion stops being a choice again.
    maxStacks: 2,
    levels: [
      { effect: { permanent: true }, display: { slots: 1 } },
      { effect: { permanent: true }, display: { slots: 1 } },
      { effect: { permanent: true }, display: { slots: 1 } },
    ],
  },
  {
    id: 'bronze-drum',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'silver',
    maxStacks: 2,
    // Pointless with nothing else in the field to steady.
    requires: (state) => state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID).length > 1,
    levels: [
      { effect: { permanent: true }, display: { morale: 7 } },
      { effect: { permanent: true }, display: { morale: 9 } },
      { effect: { permanent: true }, display: { morale: 11 } },
    ],
  },

  // ── Gold ──────────────────────────────────────────────────────────────────
  {
    id: 'royal-guard',
    rarity: 'gold',
    maxStacks: 2,
    // Only useful once there is a host to elevate.
    requires: (state) => state.armies.some((army) => army.kingdomId === PLAYER_KINGDOM_ID),
    evolvesWith: 'iron-levy',
    evolvesInto: 'bach-dang-stakes',
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.09, armyLevelCapBonus: 1 }, display: { pct: 9, cap: 1 } },
      { effect: { permanent: true, armyPowerModifier: 0.11, armyLevelCapBonus: 1 }, display: { pct: 11, cap: 1 } },
      { effect: { permanent: true, armyPowerModifier: 0.14, armyLevelCapBonus: 1 }, display: { pct: 14, cap: 1 } },
    ],
  },
  {
    id: 'fire-arrows',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'gold',
    maxStacks: 3,
    levels: [
      { effect: { permanent: true }, display: { pct: 9 } },
      { effect: { permanent: true }, display: { pct: 11 } },
      { effect: { permanent: true }, display: { pct: 14 } },
    ],
  },
  {
    id: 'twice-born',
    // Rule cards are weighted up: the pool's percentage cards outnumber them three to one, and
    // a draft that offers three adjustments and one verb is still mostly adjustments.
    weight: 2.4,
    rarity: 'gold',
    maxStacks: 1,
    requires: (state) => state.armies.some((army) => army.kingdomId === PLAYER_KINGDOM_ID),
    levels: [
      { effect: { permanent: true }, display: {} },
      { effect: { permanent: true }, display: {} },
      { effect: { permanent: true }, display: {} },
    ],
  },
  {
    id: 'mandarin-academy',
    rarity: 'gold',
    maxStacks: 2,
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { gold: 14 },
          marketGoldOutputModifier: 0.15,
          buildingGoldUpkeepModifier: -0.12,
        },
        display: { gold: 14, pct: 15 },
      },
      {
        effect: {
          permanent: true,
          resourceRateModifier: { gold: 18 },
          marketGoldOutputModifier: 0.19,
          buildingGoldUpkeepModifier: -0.15,
        },
        display: { gold: 18, pct: 19 },
      },
      {
        effect: {
          permanent: true,
          resourceRateModifier: { gold: 22 },
          marketGoldOutputModifier: 0.24,
          buildingGoldUpkeepModifier: -0.19,
        },
        display: { gold: 22, pct: 24 },
      },
    ],
  },
  {
    id: 'war-drums',
    rarity: 'gold',
    maxStacks: 2,
    evolvesWith: 'village-muster',
    evolvesInto: 'thunder-march',
    levels: [
      {
        effect: { permanent: true, recruitSpeedModifier: 1, battleSupplyCostModifier: -0.15 },
        display: { pct: 15 },
      },
      {
        effect: { permanent: true, recruitSpeedModifier: 1.25, battleSupplyCostModifier: -0.19 },
        display: { pct: 19 },
      },
      {
        effect: { permanent: true, recruitSpeedModifier: 1.55, battleSupplyCostModifier: -0.24 },
        display: { pct: 24 },
      },
    ],
  },
  {
    id: 'dragon-standard',
    rarity: 'gold',
    maxStacks: 2,
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.15, armyXpModifier: 0.3 }, display: { pct: 15, xp: 30 } },
      { effect: { permanent: true, armyPowerModifier: 0.19, armyXpModifier: 0.38 }, display: { pct: 19, xp: 38 } },
      { effect: { permanent: true, armyPowerModifier: 0.24, armyXpModifier: 0.48 }, display: { pct: 24, xp: 48 } },
    ],
  },

  // ── Jade ──────────────────────────────────────────────────────────────────
  {
    id: 'heavenly-mandate',
    rarity: 'jade',
    maxStacks: 1,
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { food: 10, supplies: 10, gold: 10 },
          armyPowerModifier: 0.1,
          buildSpeedBonus: 1,
        },
        display: { all: 10, pct: 10 },
      },
      {
        effect: {
          permanent: true,
          resourceRateModifier: { food: 12, supplies: 12, gold: 12 },
          armyPowerModifier: 0.12,
          buildSpeedBonus: 1,
        },
        display: { all: 12, pct: 12 },
      },
      {
        effect: {
          permanent: true,
          resourceRateModifier: { food: 16, supplies: 16, gold: 16 },
          armyPowerModifier: 0.16,
          buildSpeedBonus: 1,
        },
        display: { all: 16, pct: 16 },
      },
    ],
  },

  // ── Story-only (granted by the Chronicle, never rolled) ───────────────────
  //
  // Each is the payout of a charge kept — see `data/stories/charges.ts`. They are deliberately at
  // or above the power of the jade evolutions, because they cost something the draft never asks
  // for: thirty seasons of the run bent toward somebody else's oath.
  {
    // 1428. Nguyễn Trãi writes for Lê Lợi after ten years of uprising: the Ming are expelled and
    // Đại Việt declares itself. "Việc nhân nghĩa cốt ở yên dân" — benevolence lies in bringing
    // peace to the people. So it pays in the people: loyalty, stability, and a world that stops
    // treating the realm as prey.
    id: 'dai-cao',
    rarity: 'jade',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { gold: 12, food: 12 },
          stabilityDelta: 25,
          relationsAllDelta: 18,
          armyPowerModifier: 0.12,
        },
        display: { pct: 12, all: 12 },
      },
    ],
  },
  {
    // 1285. Phá cường địch, báo hoàng ân — destroy the strong foe, repay the imperial favour. Six
    // characters a boy of fifteen had embroidered on a banner after he was turned away from the
    // war council at Bình Than, and the thousand of his own household who fought under it.
    //
    // Granted only by the recorded ending, where he dies and his survivors go into the realm's
    // hosts. So it pays the way the record pays: nothing immediate, and every army raised
    // afterwards is a little harder than it would have been.
    id: 'pha-cuong-dich',
    rarity: 'jade',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      {
        effect: { permanent: true, armyPowerModifier: 0.15, nextArmyLevelBonus: 1, stabilityDelta: 10 },
        display: { pct: 15 },
      },
    ],
  },
  {
    // 1077. On the Như Nguyệt river a poem is read aloud at night from a shrine, and the Song
    // army hears its own defeat foretold. Held to be the first declaration of independence — so
    // it works on the enemy's heart rather than on our walls.
    id: 'tho-than',
    rarity: 'gold',
    maxStacks: 1,
    storyOnly: true,
    levels: [{ effect: { permanent: true, armyPowerModifier: 0.14 }, display: { pct: 14 } }],
  },
  {
    // ~1284. Trần Hưng Đạo writes to his commanders before the second Mongol invasion, shaming
    // and steeling them by turns. The realm's hosts fight above themselves and recover faster.
    id: 'hich-van',
    rarity: 'gold',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.1, armyXpModifier: 0.5 }, display: { pct: 10, xp: 50 } },
    ],
  },
  {
    // Tết, 1789. Quang Trung marches an army north at impossible speed and breaks the Qing at
    // Ngọc Hồi–Đống Đa during the new-year festival.
    id: 'than-toc',
    rarity: 'jade',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      {
        effect: { permanent: true, recruitSpeedModifier: 1.6, recruitmentSupplyCostModifier: -0.3, armyPowerModifier: 0.08 },
        display: { pct: 8 },
      },
    ],
  },
  {
    // 1010. Lý Công Uẩn moves the seat from the cramped valley of Hoa Lư to Đại La and renames it
    // Thăng Long — the ascending dragon. The mode is named after this edict.
    id: 'chieu-doi-do',
    rarity: 'jade',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      {
        effect: {
          permanent: true,
          resourceRateModifier: { gold: 18, supplies: 10 },
          claimSlotBonus: 1,
          buildSpeedBonus: 1,
          buildingCostModifier: -0.15,
        },
        display: { gold: 18, supplies: 10, slots: 1 },
      },
    ],
  },
  {
    // 1427. A Ming relief column is drawn into the narrow pass at Chi Lăng; its commander Liễu
    // Thăng is killed and the siege he was marching to relieve collapses behind him.
    id: 'chi-lang',
    rarity: 'gold',
    maxStacks: 1,
    storyOnly: true,
    levels: [{ effect: { permanent: true, defenseBoost: 26, armyPowerModifier: 0.06 }, display: { defense: 26, pct: 6 } }],
  },
  {
    // 1075. Lý Thường Kiệt does not wait to be invaded: he crosses the border first and burns the
    // staging depots at Ung Châu. The doctrine is in the name — strike first, master the enemy.
    id: 'tien-phat',
    rarity: 'gold',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.16, battleSupplyCostModifier: -0.2 }, display: { pct: 16 } },
    ],
  },
  {
    // 40 AD. Trưng Trắc and Trưng Nhị raise the districts against Han rule and hold the country
    // for three years. Sixty-five citadels answer them — so the card pays in what answered.
    id: 'hai-ba',
    rarity: 'jade',
    maxStacks: 1,
    storyOnly: true,
    levels: [
      {
        effect: { permanent: true, resourceRateModifier: { humans: 6 }, defenseBoost: 18, stabilityDelta: 15, armyPowerModifier: 0.1 },
        display: { pct: 10, defense: 18 },
      },
    ],
  },

  // ── The annals' cards (story-only) ────────────────────────────────────────
  // Paid by the middle-length histories in `data/stories/annals.ts`. Pitched below the eight
  // charge-epic cards on purpose: these are five-beat stories, not thirty-season undertakings.
  {
    // 1428. The sword Thuận Thiên, given for a war and asked back once the war was over.
    id: 'thuan-thien',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, armyPowerModifier: 0.11, stabilityDelta: 12 }, display: { pct: 11 } }],
  },
  {
    // ~208 BC. The crossbow of Cổ Loa, kept because the marriage was refused.
    id: 'no-than',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, defenseBoost: 22, nextArmyArchersBonus: 60 }, display: { defense: 22 } }],
  },
  {
    // 1288. The grain fleet taken at Vân Đồn while the war fleet sailed past.
    id: 'van-don',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, resourceRateModifier: { food: 14, supplies: 8 }, battleSupplyCostModifier: -0.2 }, display: { food: 14, supplies: 8 } }],
  },
  {
    // 17th c. Đào Duy Từ's wall, which held a border for a century and a half.
    id: 'luy-thay',
    rarity: 'jade', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, defenseBoost: 30, buildingCostModifier: -0.15 }, display: { defense: 30 } }],
  },
  {
    // 1070. The Temple of Literature, and the examinations that staffed a dynasty.
    id: 'van-mieu',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, courtCardSpeedModifier: 0.5, resourceRateModifier: { gold: 10 }, stabilityDelta: 10 }, display: { gold: 10 } }],
  },
  {
    // 13th c. Trần Thủ Độ. Order, at a price somebody else paid.
    id: 'thu-do',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, stabilityDelta: 20, armyPowerModifier: 0.08, armyGoldUpkeepModifier: -0.15 }, display: { pct: 8 } }],
  },
  {
    // 1285. "Rather a ghost in the South than a king in the North."
    id: 'binh-trong',
    rarity: 'jade', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, armyPowerModifier: 0.18, armyXpModifier: 0.35 }, display: { pct: 18, xp: 35 } }],
  },
  {
    // 905. Autonomy taken by simply governing, and nobody arriving to stop it.
    id: 'khuc-thua-du',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, resourceRateModifier: { gold: 12, supplies: 6 }, claimSlotBonus: 1 }, display: { gold: 12, slots: 1 } }],
  },
  {
    // The dykes. A thousand years of carrying earth in baskets, every single year.
    id: 'de-dieu',
    rarity: 'gold', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, resourceRateModifier: { food: 16 }, buildSpeedBonus: 1 }, display: { food: 16 } }],
  },
  {
    // 14th c. Chế Bồng Nga, who sacked the capital three times and was killed for a bribe.
    id: 'che-bong-nga',
    rarity: 'jade', maxStacks: 1, storyOnly: true,
    levels: [{ effect: { permanent: true, armyPowerModifier: 0.14, relationsAllDelta: 10, defenseBoost: 14 }, display: { pct: 14 } }],
  },

  // ── Evolutions (granted, never rolled) ────────────────────────────────────
  {
    id: 'bach-dang-stakes',
    rarity: 'jade',
    maxStacks: 1,
    evolutionOnly: true,
    levels: [
      {
        effect: { permanent: true, armyPowerModifier: 0.25, battleSupplyCostModifier: -0.3 },
        display: { pct: 25, supply: 30 },
      },
    ],
  },
  {
    id: 'thunder-march',
    rarity: 'jade',
    maxStacks: 1,
    evolutionOnly: true,
    levels: [
      {
        effect: {
          permanent: true,
          recruitSpeedModifier: 2,
          recruitmentSupplyCostModifier: -0.35,
          armyPowerModifier: 0.08,
        },
        display: { pct: 8 },
      },
    ],
  },
  {
    id: 'celestial-granary',
    rarity: 'jade',
    maxStacks: 1,
    evolutionOnly: true,
    levels: [
      {
        effect: { permanent: true, resourceRateModifier: { food: 30, supplies: 18, gold: 10 } },
        display: { food: 30, supplies: 18, gold: 10 },
      },
    ],
  },

  // ── Founding advantages (openingOnly) ─────────────────────────────────────
  // Offered on the founding screen only. Each is a different *first move*, not a different
  // size of the same one: an army, a granary, a treasury, a claim, a wall, a people.
  {
    id: 'cam-quan',
    rarity: 'silver',
    maxStacks: 1,
    openingOnly: true,
    levels: [
      { effect: { permanent: true, armyPowerModifier: 0.14 }, display: { pct: 14 } },
      { effect: { permanent: true, armyPowerModifier: 0.18 }, display: { pct: 18 } },
      { effect: { permanent: true, armyPowerModifier: 0.22 }, display: { pct: 22 } },
    ],
  },
  {
    id: 'kho-lam',
    rarity: 'silver',
    maxStacks: 1,
    openingOnly: true,
    levels: [
      {
        effect: { permanent: true, resourceRateModifier: { food: 11, supplies: 5 }, freeBuilding: 'farm' },
        display: { food: 11, supplies: 5 },
      },
      {
        effect: { permanent: true, resourceRateModifier: { food: 14, supplies: 6 }, freeBuilding: 'farm' },
        display: { food: 14, supplies: 6 },
      },
      {
        effect: { permanent: true, resourceRateModifier: { food: 18, supplies: 8 }, freeBuilding: 'farm' },
        display: { food: 18, supplies: 8 },
      },
    ],
  },
  {
    id: 'duc-tien',
    rarity: 'silver',
    maxStacks: 1,
    openingOnly: true,
    levels: [
      {
        effect: { permanent: true, marketGoldOutputModifier: 0.35, resourceDelta: { gold: 260 } },
        display: { pct: 35, gold: 260 },
      },
      {
        effect: { permanent: true, marketGoldOutputModifier: 0.44, resourceDelta: { gold: 325 } },
        display: { pct: 44, gold: 325 },
      },
      {
        effect: { permanent: true, marketGoldOutputModifier: 0.55, resourceDelta: { gold: 410 } },
        display: { pct: 55, gold: 410 },
      },
    ],
  },
  {
    id: 'long-dan',
    rarity: 'silver',
    maxStacks: 1,
    openingOnly: true,
    levels: [
      {
        effect: { permanent: true, resourceRateModifier: { humans: 4 }, influenceDelta: 30, stabilityDelta: 12 },
        display: { humans: 4, influence: 30 },
      },
      {
        effect: { permanent: true, resourceRateModifier: { humans: 5 }, influenceDelta: 38, stabilityDelta: 15 },
        display: { humans: 5, influence: 38 },
      },
      {
        effect: { permanent: true, resourceRateModifier: { humans: 6 }, influenceDelta: 48, stabilityDelta: 19 },
        display: { humans: 6, influence: 48 },
      },
    ],
  },
  {
    id: 'tho-ca',
    rarity: 'silver',
    maxStacks: 1,
    openingOnly: true,
    levels: [
      {
        effect: { permanent: true, buildSpeedBonus: 1, upgradeSpeedBonus: 1, buildingCostModifier: -0.18 },
        display: { pct: 18 },
      },
      {
        effect: { permanent: true, buildSpeedBonus: 1, upgradeSpeedBonus: 1, buildingCostModifier: -0.23 },
        display: { pct: 23 },
      },
      {
        effect: { permanent: true, buildSpeedBonus: 1, upgradeSpeedBonus: 1, buildingCostModifier: -0.28 },
        display: { pct: 28 },
      },
    ],
  },
  {
    id: 'cua-ai',
    rarity: 'silver',
    maxStacks: 1,
    openingOnly: true,
    levels: [
      { effect: { permanent: true, defenseBoost: 22, claimSlotBonus: 1 }, display: { defense: 22 } },
      { effect: { permanent: true, defenseBoost: 28, claimSlotBonus: 1 }, display: { defense: 28 } },
      { effect: { permanent: true, defenseBoost: 35, claimSlotBonus: 1 }, display: { defense: 35 } },
    ],
  },
  {
    id: 'quan-so',
    rarity: 'silver',
    maxStacks: 1,
    openingOnly: true,
    levels: [
      {
        effect: { permanent: true, recruitSpeedModifier: 0.3, recruitmentSupplyCostModifier: -0.2 },
        display: { pct: 30 },
      },
      {
        effect: { permanent: true, recruitSpeedModifier: 0.38, recruitmentSupplyCostModifier: -0.25 },
        display: { pct: 38 },
      },
      {
        effect: { permanent: true, recruitSpeedModifier: 0.47, recruitmentSupplyCostModifier: -0.31 },
        display: { pct: 47 },
      },
    ],
  },
  {
    id: 'chieu-hien',
    rarity: 'silver',
    maxStacks: 1,
    openingOnly: true,
    levels: [
      {
        effect: { permanent: true, courtCardSpeedModifier: 0.25, favorDelta: 40, freeHeroDraft: true },
        display: { pct: 25 },
      },
      {
        effect: { permanent: true, courtCardSpeedModifier: 0.31, favorDelta: 50, freeHeroDraft: true },
        display: { pct: 31 },
      },
      {
        effect: { permanent: true, courtCardSpeedModifier: 0.39, favorDelta: 63, freeHeroDraft: true },
        display: { pct: 39 },
      },
    ],
  },
];

const BY_ID = new Map(POWER_CARDS.map((card) => [card.id, card]));

export function findPowerCard(id: string): PowerCardDef | undefined {
  return BY_ID.get(id);
}

/** Cards eligible to be rolled in a draft (evolution results are granted, not offered). */
export const ROLLABLE_POWER_CARDS = POWER_CARDS.filter(
  (card) => !card.evolutionOnly && !card.storyOnly && !card.openingOnly,
);

/**
 * The founding advantages — the card the run opens on, before a single season has run.
 *
 * These replace the throne's six "temperaments", which were display-only: `generateKingHero`
 * wrote the trait's text onto the hero and *nothing ever read it*, so the +10% recruitment the
 * opening promised did nothing at all. A real card costs no new machinery — this is an ordinary
 * `CourtEffect`, applied by the ordinary pipeline — and it actually happens.
 *
 * Sized deliberately above a bronze draft card and below a silver one: this is the only one the
 * player gets for free, and it has the whole run to compound.
 */
export const OPENING_BOONS = POWER_CARDS.filter((card) => card.openingOnly);
