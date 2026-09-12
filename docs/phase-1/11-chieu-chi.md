> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Chiếu Chỉ

Chiếu Chỉ

Vạn Thắng · design proposal · Dragon Ascent + Throne of Empires

# Chiếu Chỉ詔

Turning the decree from a shop of permanent percentages into the realm's constitution — a standing law that heroes author, provinces resist, rivals answer, and history remembers.

**Today** 31 rows, 1 currency, 1 verb
**Proposed** ~65 decrees, 5 instruments, 7 sources
**Touches** economy · army · gacha · waves · heroes · rivals · Chronicle · Legacy

[Where it stands](#audit)
[The reframe](#thesis)
[Five instruments](#instruments)
[Weight & compliance](#pressure)
[The four estates](#estates)
[Seven sources](#sources)
[The catalogue](#catalogue)
[Schools & codes](#schools)
[Build order](#build)
[Proof](#proof)

01 · Audit

## What the decree actually is right now

Read honestly before redesigning. The bones are good — the era gate, the play-unlocks, the exclusive groups all work. The problem is that every decree in the game does the same one thing.

31rows in edicts.ts

19modifier keys

1verb: *+X%*

3exclusive forks

0ongoing cost

A decree today is a `RealmProject` in `src/data/edicts.ts`: an id, a branch, an era, a point cost, and a `CourtModifier` payload. Enacting it pushes the id onto `mandate.edicts`, adds a permanent modifier, and refreshes land outputs. `buildLawOptions` sorts every unblocked project by a fixed score and hands the top four to a law-choice prompt.

### Five ways it is small

1. **One verb.** All 19 `CourtModifier` fields are multipliers on your own economy or army. Not one decree changes a *rule* — how the gacha draws, where the capital sits, what an invader takes when it wins.
2. **Nothing pushes back.** A decree is a purchase, not a policy. It has no upkeep, no constituency, no way to be repealed, and no way to fail. Real reform is a *fight*; this is a vending machine.
3. **It connects to nothing.** Heroes never author a decree. Provinces never want one. Rivals never notice. Waves, summons and the Chronicle all run past it untouched. The only inbound wire is `ProjectUnlock`, and it just gates visibility.
4. **The choice is shallow.** Three `exclusiveGroup`s across the whole list. Everything else is bought in whatever order points arrive — a checklist, not a decision.
5. **No identity.** `buildLawOptions` is a deterministic sort, so run 20 shows the same four rows as run 1, and nothing at the end of a run can say *what kind of reign that was*.

Keep all of this

The era gate, `ProjectUnlock`, `exclusiveGroup`, `projectEffectSummary`'s hard-numbers copy, `tickEdictDiscovery`'s "a new decree is within reach" toast, and the `allProjects(state)` guard that hides ascent-only rows from empire mode. Everything below is additive to that skeleton.

02 · Thesis

## A decree is not something you buy. It is something the realm must obey.

Hồ Quý Ly is the whole design in one reign. Between 1396 and 1397 he issued the most intelligent legislation in Vietnamese history — the first paper currency, hạn điền capping noble estates at ten mẫu, hạn nô capping bondsmen, standardised weights. Every one was correct. Every one was refused. The country would not follow, and when the Ming crossed the border in 1406 there was no realm left underneath the laws.

Against that, Lê Thánh Tông spent twenty-seven years passing fewer laws more slowly — the Hồng Đức code, thirteen đạo, the examinations — and each one *stuck*, because the estates that had to carry it were brought along first.

That contrast is the mechanic. Three consequences follow, and they generate the rest of this document:

1. A standing decree carries **weight** against a finite authority. Legislate past it and the realm stops listening.
2. Every decree pleases some **estate** and angers another. There is no free law.
3. A decree's effect is multiplied by **compliance**, province by province. A law nobody obeys is worth nothing, and *phép vua thua lệ làng* — the king's rule loses to the village's custom — becomes something the player can feel.

SOURCES

Era track
Seated hero
Province
Chronicle
Rival empire
Crisis / wave
Legacy

The Throne
issues a decree

Weight
spent against authority

Four Estates
sĩ · nông · thương · võ

Compliance
per province, 0–100

Realised
effect
×0.3 – ×1.15

a weak realm can afford fewer laws — and needs them more

The loop closes on itself. Expansion buys authority, authority buys decrees, decrees anger estates, angry estates cut compliance, and low compliance shrinks the very decrees that were meant to fix the problem. It is the same shape as Ambition in Dragon Ascent, applied to law instead of war.

敕

03 · Vastness

## Five instruments, not one list

The imperial chancery did not issue one kind of document. It issued five, and each had a different reach, lifetime and audience — which is exactly the mechanical variety the feature is missing.

| Instrument | What it was | Shape in game | Where it comes from | Cost |
| --- | --- | --- | --- | --- |
| Chiếu 詔Edict | The great proclamation, addressed to the whole realm and read aloud in every province. | A **standing law**. Permanent, carries weight, has a constituency, can be repealed. The 31 existing rows all become these. | Era track, Chronicle, Legacy | Edict points + permanent weight |
| Sắc 敕Investiture | Appointed, ennobled or deified a named person or place — including village tutelary gods, certified by the Ministry of Rites. | **Targets one hero or one province**, not the realm. Bonuses are local and enormous. | Seated heroes, high-loyalty provinces, the fallen | 1 point, 0–1 weight, one estate |
| Dụ 諭Admonition | An urgent instruction for a specific situation — relief, evacuation, amnesty. | **Temporary.** 10–25 ticks, then expires and refunds its weight. Offered only while the crisis is live. | Famine, revolt, capital under siege | Free or resources; no permanent weight |
| Hịch 檄Proclamation | The rallying call before battle — Trần Hưng Đạo's *Hịch tướng sĩ*, 1284. | **One shot, one wave.** Massive military effect, then gone. Offered only when a Great Invasion is telegraphed. | Wave director, at boss telegraph | Estate standing, not points |
| Lệ 例Custom | The village convention — hương ước. Not the throne's law at all. *Phép vua thua lệ làng.* | **Proposed to you** by a province. Ratify it realm-wide (weaker, costs weight), grant it locally (strong, free), or crush it (compliance falls). | Provinces with loyalty > 75 | Refusing costs more than accepting |

Why this is the load-bearing idea

It multiplies the feature without multiplying the content burden. The same `RealmProject` row, tagged `kind: 'du'` instead of `'edict'`, becomes a different *kind of moment* — one that arrives unbidden, expires, and cannot be planned for. Five delivery shapes over one catalogue is where "vast" comes from cheaply.

重

04 · The pressure

## Weight and compliance

Two numbers that make the existing 31 decrees interesting before a single new one is written.

### Weight — trọng

Every standing chiếu carries a weight of 1–3. The throne can carry only so much law at once, and the cap grows with the reign rather than with your treasury.

authorityCap = 4 + eraIndex × 2 + (censor seated ? 2 : 0) + floor(stability / 25)
// 4 at founding · ~13 at the Mandate era with a censor and a calm realm
overreach = max(0, sum(standing decree weights) − authorityCap)

Overreach is not a wall — you may always pass one more law. It is a *tax on the whole system*: every point of overreach drains 1.2 compliance per tick from every province, everywhere. That is Hồ Quý Ly's reign expressed as a number.

### Compliance — tuân

A per-province 0–100 field, starting at 65. It drifts each tick and it scales what your laws are actually worth.

drift = +0.6 // the realm settles into habit
− overreach × 1.2 // too much law at once
− (taxRate − 0.5) × 2.0 // the existing tax dial finally has a second consequence
+ (estateAverage − 50) / 40 // a realm at peace with itself obeys
+ (governor seated here ? 0.4 : 0)
+ terrainAffinity(decrees, land) // a rice law in the mountains is resented
realised = clamp(avgCompliance / 70, 0.30, 1.15) // multiplies every decree's numeric effect

| Compliance | State | What happens |
| --- | --- | --- |
| 85–100 | Devoted | Decrees realised at ×1.15. The province volunteers a *lệ* proposal. Militia grows free. |
| 45–84 | Obedient | Normal. Effects scale linearly. |
| 25–44 | Grudging | Effects at ×0.5. Court crisis cards weight toward this province. Acquisition of its neighbours costs more. |
| 10–24 | Defiant | **Decrees do not apply here at all.** Output ignores every realm modifier. Local militia will not answer a muster. |
| < 10 | Seceded | The province leaves — reusing the `secede` verb already in `systems/story/effects.ts`. It becomes hostile terrain between you and the front. |

Design guard

Compliance must be *recoverable by play*, never only by waiting. Three live levers: lower the tax dial, repeal a decree, or spend a Dụ. A pressure system with no lever is just a timer, and Dragon Ascent already has enough of those.

### Repeal — phế chiếu

Costs **2× the original edict points**, drops stability by 8, and angers whichever estate the decree pleased. In exchange it returns the weight immediately and lifts 20 compliance realm-wide. This is what makes weight a resource you can trade in both directions rather than a one-way ratchet, and it gives a bad early pick a way out — the single biggest quality-of-life gap in the current system.

四

05 · Connection

## The four estates

The traditional order — sĩ, nông, công, thương, scholar, farmer, artisan, merchant — with the military restored to it, because in Đại Việt it always was. This is the wire that connects decrees to everything else in the game.

##### 士Sĩ

Scholars & mandarins

**Governs:** edict point income, court card frequency, and the *rarity floor of every hero draft* — a court that honours learning attracts talent.

**Below 30:** no new edict points accrue at all. The reform engine stalls until you fix it.

##### 農Nông

Peasantry & villages

**Governs:** food and humans rates, compliance drift everywhere, militia capacity, and how fast an abandoned province resettles.

**Below 30:** revolts spawn hostile local hosts in your own provinces — an invasion you caused.

##### 商Thương

Merchants & landed gentry

**Governs:** gold rate, market output, acquisition cost, and the price of a vassal's oath.

**Below 30:** the gold soft cap tightens and provinces you bought rather than conquered begin to defect back.

##### 武Võ

Generals & the standing host

**Governs:** army power, the morale floor a host routs at, recruit speed, and whether generals accept a posting.

**Below 30:** unhappy generals unassign themselves from your hosts mid-wave. Leaderless hosts fight far worse.

estateMult(e) = 0.75 + standing(e) / 200 // ×0.75 at 0 · ×1.00 at 50 · ×1.25 at 100

Each estate starts at 50 and drifts toward 50 by 0.15/tick, so anger fades and favour is not permanent — you must keep governing. Every decree lists its estate deltas on the card, so *the trade is visible before you commit*, which is the difference between a hard choice and a trap.

#### What this unlocks that nothing else can

Estates make the decree screen the place where the rest of the game's systems meet. Passing Khoa cử raises Sĩ, which improves the summon pool, which changes which heroes you draw, which changes which Sắc decrees become available. Passing Nam tiến raises Võ and Nông but drops Sĩ, which slows your edict points, which means the southern-expansion run legislates less and fights more. Nobody has to hand-author those interactions — they fall out of one shared number.

源

06 · Connection

## Seven places a decree can come from

Right now there is exactly one: the era track. Every source below is a wire into a system that currently ignores decrees entirely.

| Source | How it fires | Example |
| --- | --- | --- |
| Era trackexisting | Mandate points cross an era threshold and grant edict points. | The 31 rows already in `edicts.ts`, now carrying weight and estates. |
| HeroesSắc | A hero gains `decreeId`. Seating them in the right court position unlocks the decree they alone can author — and dismissing them *does not* repeal it. | A Lý Thường Kiệt-type seated as Marshal unlocks Tiên phát chế nhân — strike first: you may assault a wave's staging ground one tick before it lands. |
| ProvincesLệ | Loyalty > 75 and compliance > 80, matched to terrain or a standing building, raises an offer. | A rice province proposes Lệ thủy lợi, the water share. Grant locally, ratify realm-wide, or refuse and watch its compliance fall 15. |
| Chronicleterminal fragment | A story that reaches a `terminal` fragment writes a decree into the pool via a new `grantDecree` effect verb. | The counting-house story ends in embezzlement → Sổ đinh, the registry tallies, appears. History teaches the throne something. |
| Rivalscounter-decree | An off-map empire in `GreatPowersSystem` enacts a decree *against you*, visible in the intel panel with a countdown. | Đại Lý proclaims a trade embargo: −25% market gold until you vassalise them, buy them off, or pass a counter-decree that costs 2 weight. |
| CrisisDụ / Hịch | Offered only while famine, revolt or a telegraphed Great Invasion is live. Vanishes when the moment passes. | Dụ thanh dã — empty the fields. Abandon a province before the wave reaches it and the invader takes nothing. |
| LegacyQuốc bảo | A code completed in a past run is offered at founding of the next, for Legacy points. | You finished the Hồng Đức code once; every future dynasty may open with one of its articles already in force. |

Replayability, concretely

Replace `buildLawOptions`' deterministic sort with a weighted draw — source, era, estate standing, seated heroes and recent play all bias the four cards shown. A 25-wave run enacts 10–14 decrees out of a pool near 65, and which 14 depends on who you drew, what you conquered and which stories ended. That is the difference between a checklist and a deck.

詔

07 · Content

## Decrees that change rules, not numbers

Thirty-four new decrees, each grounded in a real reign and each hooked to a system that currently has no idea decrees exist. These are the ones worth building first — the flat percentage decrees already exist.

### 詔  Chiếu — standing law

| Decree | Historical source | The rule it changes | Wt | Estates |
| --- | --- | --- | --- | --- |
| Chiếu dời đôMove the Capital | Lý Thái Tổ, 1010 | Reassigns `capitalLandId` to any owned province. Clears `capitalLostTicks`, re-anchors the opening camera, and makes the wave director re-pick its approach. The whole defensive geometry of the run changes. | 2 | SĩThươngNông |
| Ngụ binh ư nôngSoldiers to the Fields | Lý–Trần–Lê standing policy | A host with no order for 3+ ticks pays no supply upkeep and adds +2 food. Recalled hosts fight at ×0.75 power for one wave. Idling an army becomes a real economic choice instead of waste. | 2 | NôngThươngVõ |
| Hạn điềnThe Land Limit | Hồ Quý Ly, 1397 | Caps building level at 3 in your three richest provinces and redistributes the surplus output to your three poorest. Flattens the snowball; rescues a bad map. | 3 | NôngThươngSĩ |
| Thông bảo hội saoPaper Money | Hồ Quý Ly, 1396 | Removes the gold soft cap entirely. In exchange gold decays 5%/tick while stability is under 55, and a crash event wipes 40% of the treasury if it falls under 35. The greed decree. | 3 | ThươngNôngSĩ |
| Khoa cửThe Examinations | Lý Nhân Tông 1075; Lê Thánh Tông | Every 15 ticks the exam hall mints a hero for free, rarity chosen by Sĩ standing. A second, deterministic talent pipeline that bypasses the gacha entirely. | 2 | SĩVõ |
| Chiếu cầu hiềnSeeking the Worthy | Quang Trung, after Hán Cao Tổ | Summon soft pity −2 and gold/jade draft weight +50%; hero upkeep +40%. Directly retunes `SummonSystem` — the first decree that touches the gacha. | 2 | SĩThương |
| Chiếu lập họcFound the Schools | Quang Trung, 1789 | Army XP ×2 and court cards ×1.5 — but −15% on every resource rate for 20 ticks first, then +10% forever. A decree you must survive before it pays. | 2 | SĩNông |
| Hình thưThe First Code | Lý Thái Tông, 1042 | Every court crisis card resolves at half severity, and stability gains a hard floor of 30. The anti-death-spiral decree. | 1 | SĩNôngVõ |
| Chia mười ba đạoThe Thirteen Circuits | Lê Thánh Tông, 1489 | +2 claim slots, +15 compliance in every province, and seated governors' effects double. The administrative-empire decree. | 2 | SĩVõ |
| Sổ đinh · tín bàiThe Registry Tallies | Nguyễn dynasty | Reveals every province's stats map-wide regardless of fog, +1 claim slot, recruitment cost −20%. Information as a decree. | 2 | SĩVõNông |
| Hà đê sứThe Dike Office | Trần Thái Tông, 1248 | Water and rice provinces become immune to famine and the winter food penalty; flood crisis cards leave the deck for the run. | 1 | Nông |
| Đồn điềnMilitary Colonies | Lê Thánh Tông; Nguyễn | Conquered provinces settle instantly at half output but full `localSoldiers` and +50% defence. Turns a wide conquest run from a liability into a wall. | 2 | VõNông |
| Thái ấpThe Princely Fiefs | Trần dynasty | Each seated hero governs a province directly: their court effect doubles, but that province pays you only half its output. Concentrates power in your champions. | 2 | VõSĩNông |
| Lệ làngRecognise the Village Custom | *Phép vua thua lệ làng* | +30 compliance realm-wide and revolts stop entirely — but every future decree costs +1 weight. You buy obedience by giving up the right to legislate. | 1 | NôngSĩ |
| Sùng PhậtPatronage of the Sangha | Lý–Trần Buddhism | Monastic heroes cost no upkeep, temples give +2 stability each, gold −10%. Makes the monastic wardrobe flag on `Hero` mechanically real for the first time. | 1 | NôngThương |
| Nam tiếnThe March South | Lê–Nguyễn southward expansion | Claiming a province on an unowned frontier costs half, and conquest charges only half the usual Ambition. The expansionist run's keystone — it directly bends the mode's central dial. | 3 | NôngVõSĩ |

### 敕  Sắc — investiture, aimed at one person or place

| Decree | Historical source | The rule it changes | Wt | Estates |
| --- | --- | --- | --- | --- |
| Sắc phong thành hoàngDeify the Fallen | Tutelary spirit cult, certified from the 15th c. | Name a dead or departed hero the guardian spirit of a province: permanently +25% output, +20 defence, +30 compliance there — and a Chronicle echo that names them again in a future run. The game's first decree that reaches across runs. | 1 | NôngSĩ |
| Sắc phong công thầnEnnoble a Champion | Merit-official ranks | A seated hero gains a rank: stats rise to the next rarity tier and their signature card enters the power draft. They can never be dismissed, and their death costs 15 Võ. | 1 | VõSĩ |
| Cải thổ quy lưuReplace the Local Lord | Nguyễn policy in the uplands | Convert one high-loyalty province to direct rule: +40% output, −40 compliance *there*, and a real chance of revolt. The greedy, dangerous local play. | 1 | SĩNông |
| Sắc phong vươngCrown a Vassal | Tributary investiture | Turn a beaten rival into a vassal without paying the oath gold — `VassalSystem` already has the shape. Costs 2 weight and 15 Võ, because your generals wanted them destroyed. | 2 | SĩThươngVõ |

### 諭  Dụ — temporary, crisis only

| Decree | Historical source | The rule it changes | Life | Estates |
| --- | --- | --- | --- | --- |
| Dụ chẩn tếOpen the Granaries | Famine relief edicts | Converts 40% of the food stock into stability and compliance, and suppresses the famine card for 20 ticks. Offered only while `FamineSystem` is live. | 20t | NôngThương |
| Dụ thanh dãEmpty the Fields | Trần scorched earth, 1285 | Abandon a province before the wave reaches it: the invader takes it with zero spoils and −30% power for three waves. You lose its buildings. Losing ground becomes a *tactic*. | 1 wave | VõNông |
| Dụ đại xáThe Great Amnesty | Accession amnesties | Pulls all four estates back toward 50 and clears every decree's accumulated resentment. The reset button, priced at an edict point. | instant | NôngSĩ |
| Dụ tị nạnMove the Court | Trần court withdrawals, 1285 | Relocate the court for the duration of a wave: the capital cannot fall and `capitalLostTicks` freezes, at −50% gold for 6 ticks. A run-saver you pay dearly for. | 6t | SĩVõ |

### 檄  Hịch — one shot, when a Great Invasion is telegraphed

| Decree | Historical source | The rule it changes | Cost | Estates |
| --- | --- | --- | --- | --- |
| Hịch tướng sĩProclamation to the Officers | Trần Hưng Đạo, 1284 | Every host gains +50% power and cannot rout for one wave. Survivors gain a level. The single most dramatic button in the game, available once every four waves. | 20 Nông | VõNông |
| Hội nghị Diên HồngThe Council of Elders | Diên Hồng hall, winter 1284 | Summon the elders and put the war to a vote. Every estate ≥ 55 → unanimous *ĐÁNH*: +40% defence for the wave and +2 edict points. Any estate under 35 → the hall divides: −20 stability and the wave arrives 15% stronger. **The one moment where four seasons of governing are judged in a single card.** | free | verdict |
| Sát ThátTattoo the Arms | Trần soldiers' arm tattoos, 1285 | Permanent for the run: hosts never rout above 20% strength, at −15% recruit speed. Veterans who will not break are also veterans you cannot replace. | 1 pt | VõNông |
| Bình Ngô đại cáoProclamation of Victory | Nguyễn Trãi, 1428 | Offered *only* in the aftermath of breaking a Great Invasion. Converts the wave's spoils into +10% on every rate, permanently, and writes a named Chronicle entry. The victory lap, earned. | free | SĩVõ |

### 例  Lệ — proposed by a province; grant locally, ratify widely, or refuse

| Custom | Raised by | Granted locally | Ratified realm-wide |
| --- | --- | --- | --- |
| Lệ hương ẩmThe Village Feast | Any province, loyalty > 80 | +10 compliance and +2 stability here. Free. | All provinces, at −10% food and 1 weight. |
| Lệ giáp binhThe Village Watch | A province with a fort or barracks | `localSoldiers` +50% here. | Militia capacity +40% everywhere, −1 claim slot. Defensive realms only. |
| Lệ chợ phiênThe Market Days | A province with a market | Gold ×1.4 here. | Market gold +25% realm-wide, Nông −10. |
| Lệ thủy lợiThe Water Share | Rice or river terrain | +3 food here, immune to the winter penalty. | Every rice province ignores the season multiplier. 2 weight. |

Refusal is the interesting option

Turning down a lệ costs that province 15 compliance — but keeps your weight free and your Sĩ happy. A realm that says yes to every village ends up unable to pass a single law of its own. That is *phép vua thua lệ làng* played forward, and it is a genuinely new kind of decision for this game.

家

08 · Identity

## Schools of thought, and the code you leave behind

Three exclusive forks is not enough branching to make two runs feel different. Four opposed schools, each with a capstone that locks out its opposite, is.

Every decree is tagged with a school. Enact three of one school and its **capstone** unlocks — and the opposing school locks for the run. The pairs are opposed because they were: Pháp gia against Phật gia is Hồ Quý Ly against the Lý–Trần settlement; Nho gia against Binh gia is Lê Thánh Tông's civil bureaucracy against the Tây Sơn's armed pragmatism.

##### 法Pháp gia

Legalist · Hồ Quý Ly · opposed to Phật gia

Hạn điền · Thông bảo hội sao · Cải thổ quy lưu · Sổ đinh · Hạn nô

**Nghiêm pháp** — weight is ignored entirely; pass as many laws as you like. Compliance decays 1/tick everywhere, and any province that reaches 20 secedes. The fastest, most fragile realm in the game.

##### 儒Nho gia

Confucian · Lê Thánh Tông · opposed to Binh gia

Khoa cử · Chiếu lập học · Hình thư · Mười ba đạo · Chiếu cầu hiền

**Quốc triều hình luật** — the Hồng Đức code. All weights −1, +1 edict point per era, a free hero every 12 ticks, and women inherit: female heroes' upkeep −30%, as the real code allowed.

##### 兵Binh gia

Militarist · Trần Hưng Đạo, Quang Trung · opposed to Nho gia

Đồn điền · Sát Thát · Thái ấp · Nam tiến · Hịch tướng sĩ

**Sát Thát vĩnh cửu** — hosts never rout and gain +25% power permanently. Sĩ and Nông are both capped at 40 for the rest of the run: you will never legislate again, and you will never need to.

##### 佛Phật gia

Buddhist–agrarian · Lý–Trần · opposed to Pháp gia

Chiếu khuyến nông · Hà đê sứ · Sùng Phật · Lệ làng · Dụ chẩn tế

**Trúc Lâm** — stability never falls below 60 and Ambition charges 40% less, so waves grow slowly. Every military decree locks out. The long, patient, defensive run.

### The reign's name

At run end, the summary stops reporting only a score and names the reign from its school, its capstone and its heaviest decree — *"The Hồng Đức Reign · 14 decrees · Confucian · 31 waves"*. Completing a capstone banks it as a Legacy quốc bảo, purchasable at the founding of a later run.

That is the missing loop: the current run-end screen has nothing to say about how you governed, only how long you lasted.

09 · Delivery

## Build order

Each phase ships something playable on its own. Phase 1 alone makes the 31 decrees already in the game meaningfully better without writing a single new one.

1. #### The pressure — weight, compliance, estates

   No new content. Tag the existing 31 rows with `weight`, `estates` and `school`; add `Land.compliance` and a four-field estate record on `mandate`; scale `getCourtBonuses` output by the realised-compliance factor. Add repeal. Rebuild the court screen's Decrees section around an estate bar and a weight gauge.

   src/state/types.ts · src/data/edicts.ts · src/systems/DecreeSystem.ts *(new)* · src/systems/CourtSystem.ts · src/systems/ascent/AscentTick.ts · src/systems/RealtimeSystem.ts · src/scenes/ConquestUIScene.ts · src/i18n/catalogs/empire.ts
2. #### The vocabulary — decrees that change rules

   A `hasDecree(state, id)` reader module, following the precedent `ascent/DoctrineSystem.ts` already sets for rule-cards, and the sixteen Chiếu above wired into the systems they actually change. Add the `kind` field so Dụ and Hịch can exist, plus their expiry.

   src/systems/decree/rules.ts *(new)* · ResourceSystem · SummonSystem · WaveDirector · ConquestSystem · BattleSystem · InvasionSystem · FamineSystem
3. #### The wires — seven sources

   `Hero.decreeId` and the roster additions; the province lệ proposer; rival counter-decrees in `GreatPowersSystem`; a `grantDecree` verb added to the story effect vocabulary. Replace `buildLawOptions`' sort with the weighted draw.

   src/data/heroes.ts · src/systems/decree/ProposalSystem.ts *(new)* · src/systems/empire/GreatPowersSystem.ts · src/systems/story/effects.ts · src/systems/ascent/CourtLaneSystem.ts
4. #### The identity — schools, capstones, quốc bảo

   School tallies and opposition locks, the four capstones, the reign name on the run summary, and Legacy persistence of a completed code.

   src/systems/decree/SchoolSystem.ts *(new)* · src/state/legacy.ts · the run-summary screen

### Traps this codebase will spring

- **Never add a `CourtModifier` key for a rule.** A new key must be added in four places — the interface in `types.ts`, the hardcoded `modifierKeys` allow-list at `PoliticsSystem.ts:195`, the `CourtBonuses` interface, and the accumulator in `getCourtBonuses`. Miss any one and the field is stored and silently never read. Rule-decrees should be read at the call site instead, exactly as `DoctrineSystem` reads power-card stacks.
- **Decree ids are a save contract.** Same rule as story fragment ids: append-only, never renamed. `mandate.edicts` is a list of raw ids in every save.
- **Both languages or the game will not boot.** Every new key needs an `en` and a `vi` entry; a missing one throws at import time, not at render.
- **`allProjects(state)` already guards empire mode** from ascent-only rows. Sắc, Dụ, Hịch and Lệ need the same guard, or empire mode shows a column of decrees whose trigger can never fire there.
- **Wave-facing decrees are ascent-only.** Gate them on `isEndlessMode` the way the rest of the shared layer does.
- **Modifier ids use `Date.now()`,** so they are not reproducible across a seeded run. Decree identity must key off the decree id, never the modifier id.

10 · Proof

## How we will know it worked

Balance in this project is measured, not argued. Every claim above has a number attached to it.

| Check | How | Bar |
| --- | --- | --- |
| Overreach bites | `test_scripts/verify/verify-decrees.mjs` *(new)* | A run forced past its authority cap shows realised rates strictly below a matched run inside it. If it does not, weight is decorative. |
| Defiance is reachable and escapable | same harness | A province driven under 25 stops receiving decree effects; lowering tax and repealing one decree returns it above 45 within 30 ticks. |
| Repeal accounts correctly | same harness | Weight returns exactly, the modifier is removed by id, and the estate that liked the decree loses standing. |
| Runs actually diverge | 10 seeded runs, log enacted ids | No two runs share more than 60% of their decree list, and at least three sources appear in each. |
| Nothing else moved | `verify-modes-regression.mjs` | The 60-tick fingerprint for rival and campaign is unchanged — Phase 1 touches `CourtSystem` and `ResourceSystem`, which all four modes share. |
| It is more fun, not just busier | `/funscore` and `/playtest`, before and after | Decision density rises without prompt fatigue: the decision director's per-kind cooldowns must absorb the new prompt kinds, or the mode turns into a modal queue. |

The one real risk

Prompt saturation. Dragon Ascent already paces cards through the decision director at two ticks apart with per-kind cooldowns and a 15% story cap. Adding Sắc, Dụ, Hịch and Lệ as new prompt kinds without giving them cooldowns and a shared budget will drown the run. **Budget them as one family:** at most one decree-family prompt per court phase, with Hịch always outranking the rest, because a Great Invasion is the moment that most deserves the interruption.

### Sources

- [Edict on the Transfer of the Capital](https://en.wikipedia.org/wiki/Edict_on_the_Transfer_of_the_Capital) — Lý Thái Tổ, 1010; and [Chiếu dời đô](https://vi.wikipedia.org/wiki/Chi%E1%BA%BFu_d%E1%BB%9Di_%C4%91%C3%B4), with the *chiếu cầu hiền* and *chiếu khuyến nông* forms it belongs to.
- [Lê Thánh Tông](https://en.wikipedia.org/wiki/L%C3%AA_Th%C3%A1nh_T%C3%B4ng) and the [defence of national territory](https://vietnamlawmagazine.vn/king-le-thanh-tong-with-the-defense-of-national-territory-6263.html) — the Hồng Đức code of 1483, the thirteen đạo of 1489, and *ngụ binh ư nông*.
- [Hồ Quý Ly](https://grokipedia.com/page/H%E1%BB%93_Qu%C3%BD_Ly) and the [Ming conquest of Đại Ngu](https://en.wikipedia.org/wiki/Ming_conquest_of_%C4%90%E1%BA%A1i_Ngu) — paper money 1396, hạn điền and hạn nô 1397, and reforms that failed for being imposed faster than they were accepted.
- [Quang Trung](https://en.wikipedia.org/wiki/Quang_Trung) — the Tây Sơn land and education policies, and the promotion of chữ Nôm.
- [Hội nghị Diên Hồng](https://vi.wikipedia.org/wiki/H%E1%BB%99i_ngh%E1%BB%8B_Di%C3%AAn_H%E1%BB%93ng) and the [Trần dynasty](https://grokipedia.com/page/Tr%E1%BA%A7n_dynasty) — the council of elders of winter 1284, and the scorched-earth defence of the second Yuan invasion.
- [Rural management by state laws and village conventions](https://vietnamlawmagazine.vn/rural-management-by-state-laws-and-village-conventions-under-the-nguyen-dynasty-17026.html) and [phép vua thua lệ làng](https://en.wiktionary.org/wiki/ph%C3%A9p_vua_thua_l%E1%BB%87_l%C3%A0ng) — hương ước, and the limits of the throne's reach.
- [Thành hoàng](https://en.wikipedia.org/wiki/Th%C3%A0nh_ho%C3%A0ng) — village tutelary spirits and the imperial *sắc phong* that certified them.