> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Rewriting the Chronicle

Vạn Thắng · Sử Ký · implementation spec · rev 2 · 22 Aug 2026

# Rewriting the Chronicle

Every answer the player gives must lead somewhere. Answer the way it happened
and the story follows the record. **Answer differently and it does not stop, does not
punish you and does not funnel you back — it opens a whole alternative tree, as deep and as
branching as the recorded one, and tells you that is where you are.**
That takes a trunk of named branch states under the existing salience pool, about sixty lines
of engine, ten structural invariants a harness can enforce, and a catalogue several times its
present size.

What changed from rev 1
**Rev 4 adds the part that makes it a game.** A story can be a **strategic instrument**
rather than a dialogue: gated on actually being in trouble, paid for in the resource that
competes with your own army, and raced against the wave clock so it can arrive too late. §5
sets that contract, Thánh Gióng becomes the worked wager, and Lý Thường Kiệt's
*tiên phát chế nhân* becomes the worked lever — commit your host offensively before
you are attacked, and it is not home when the wave lands.
  
  
**Rev 3 fixed what rev 2 got wrong.** Rev 2 drew a divergence as a stub — one different
answer, one different ending, and the fiction was over. That is a detour, not a tree. A
divergence now opens a **subtree that keeps asking**, held to the record's own depth by an
invariant (§1.2, INV-9). Thánh Gióng grows from 8 nodes to **15 nodes and 16 endings**,
and Trần Quốc Toản's “let him into the council” is now a branch with two further decisions of
its own rather than a shrug.
  
  
Carried from rev 2: the decision tree as architecture rather than side-feature; prose
guidance as a rubric for **what makes a beat worth reading** rather than a word count; all
48 templates in scope via trunk archetypes; and actual type diffs, function bodies and data
shapes instead of descriptions of them.

[§0The correction: attractive, not long](#correction)
[§1Architecture: trunk + pool](#arch)
[§2The engine, line by line](#engine)
[§3Eight invariants the harness enforces](#invariants)
[§4The tag, and when it is revealed](#tag)
[§5A story as a strategic instrument](#rubric)
[§6Worked in full: Thánh Gióng](#giong)
[§7Three more, in full](#more)
[§8Scaling to all 48](#all48)
[§9"It must support all"](#support)
[§10Screens](#ui)
[§11Sequencing and guardrails](#seq)

§0 · The correction

## §0The problem was never that the beats are short

**Replaces**rev 1 §B
5
tests per beat

Rev 1 framed this as word counts — median 45, target 70–110 — and that was the wrong
instrument. A 110-word status report is worse than a 12-word one. What a beat needs is a
reason to be read, and length is what happens *afterwards*, once the reason is there.

So the standard is a five-part test, applied per fragment. A beat that passes all five lands
somewhere between 45 and 90 words on its own; a beat that fails them is not fixed by
padding.

- **1 · A person, placed.** Not "the villages" — "a woman up from the boat-market."
  Not "the court objects" — "the Minister of Rites, who has been waiting for this."
  Somebody is in the room and they are doing something.
- **2 · One concrete object.** Four jars of salt. An orange. Seven trays of rice and
  three of aubergine. A banner with six characters on it. The object is what the player
  will still be able to describe an hour later; the abstraction is not.
- **3 · Something withheld.** The beat says less than it knows. *"She did not say it
  as a complaint. She said it the way people say a thing they have already decided to live
  with."* The gap is what makes the next beat worth waiting for.
- **4 · A stake the player can already feel** before the card names it. If the beat
  has to explain why this matters, the beat has not done its job.
- **5 · A hook the pool can answer.** The beat plants a question some *other*
  fragment in the same node is written to pick up. This is the one the current catalogue
  most consistently misses: today's beats are self-contained status lines, so nothing ever
  feels like it is going anywhere.

Test 5 is what makes attractiveness a *structural* property rather than a writing
one, and it is why the trunk in §1 is a prerequisite for the prose rather than a separate
workstream. A node is a situation several fragments can be about; that is where hooks and
answers can live in the same place.

Now · salt-road / no-salt-since-spring.line

No salt has come up the road through {land} since spring.

Fails 1, 2, 3, 5 — it is a commodity report. Making it 60 words would not help.

Proposed · same beat, same node

Walking the capital out of uniform, I found a knot of people outside a small shop.
Inside, the keeper had four jars left and was selling one to each buyer, and doing it in
the order people had arrived rather than the order they could pay. A woman up from the
boat-market said the road through {land} had given nothing since spring.

She did not say it as a complaint. She said it the way people say a thing they have
already decided to live with.

Vi hành trong kinh thành, ta thấy một đám người túm tụm trước một cửa hàng
nhỏ. Vào xem thì quán chỉ còn bốn hũ muối, bán mỗi người một hũ, và bán theo thứ tự ai
tới trước chứ không theo ai trả được nhiều. Một bà ở bến chợ nói đường muối qua {land}
từ mùa xuân tới giờ không lên được hạt nào. Bà không nói như đang than. Bà nói như nói
một chuyện đã quyết sống chung với nó rồi.

Person · object · withheld · stake · and a hook the node answers: who is
holding the road

§1 · Architecture

## §1A trunk of branch states, with the pool inside each one

A pure decision tree would throw away what already works — the salience draw is why two runs
down the same path do not read identically. A pure pool cannot express "you answered
differently, so the story goes elsewhere now." The answer is both, layered, and the layering
costs almost nothing because the pool already filters candidates.

**Concept**node = situation
1
new filter line

A **node** is a situation the story is in, not a line it says. Each story has 5–9 of
them. Fragments declare which nodes they may speak in; options declare which node they move
to. Inside a node the existing salience machinery is untouched — same weights, same
volume bias, same draw from the top band — so *which* beat you hear and *when*
is still dynamic, while *where the story is* is now a thing the player's answers
decide.

src/systems/story/types.ts — additions

```
export type Historicity = 'chinh-su' | 'da-su' | 'ngoai-truyen';

/**
 * A situation the story is in. The trunk of the decision tree.
 *
 * Ids are append-only exactly like fragment ids — a live save holds the node it is standing in.
 */
export interface StoryNode {
  id: string;
  /** Inherited by every fragment fired here, and by the Chronicle entry. */
  historicity: Historicity;
  /** Seasons before the engine starts pushing this node's exit card. */
  patience?: number;
  /** Where the story goes if the exit is never answered. REQUIRED unless terminal. */
  onIgnored?: string;
  /** No exits. The story ends when a terminal fragment fires here. */
  terminal?: boolean;
}

export interface StoryFragment {
  // …existing fields unchanged…
  /** Nodes this fragment may speak in. Absent = any node (ambient/global). */
  in?: string[];
}

export interface StoryOption {
  // …existing fields unchanged…
  /** Node the story moves to when this option is taken. Required — see INV-1. */
  to: string;
  /** How this answer sits against the record. Drives the tag and the reward *kind*. */
  historicity?: 'annal' | 'divergent';
}

export interface StoryTemplate {
  // …existing fields unchanged…
  nodes?: StoryNode[];
  entry?: string;  // defaults to nodes[0].id
}

export interface StoryCtx {
  // …existing 14 members unchanged…
  node(): string;
  goTo(nodeId: string): void;       // for effects that branch without a card
  drift(): Historicity;             // high-water mark along the path so far
}
```

src/state/types.ts — the saved half

```
export interface ActiveStory {
  // …existing fields unchanged…
  /** Node the story is standing in. Absent on old saves — migrated to `entry` on load. */
  node?: string;
  /** Every node passed through, in order. This is what the story page draws as a spine. */
  path?: string[];
  /** Least-historical class the path has touched. Never decreases. */
  drift?: Historicity;
  /** Turn the story entered its current node, for the patience clock. */
  nodeSince?: number;
}

export interface ChronicleEntry {
  // …existing fields unchanged…
  historicity?: Historicity;   // stamped from story.drift at the terminal
}
```

Why this is cheap
Every new field is optional except `StoryOption.to`, and that one is enforced by a
harness rather than by the compiler on legacy data, so nothing breaks at load. A template
with no `nodes` behaves **exactly** as it does today: `fragment.in`
is absent, so the filter passes everything. The 48 templates can therefore be converted
one at a time, shipping each as it lands, with the rest running unchanged beside them.

**§1.2 · the rule**branch parity
✗→✓
detour  
vs subtree

### A divergence opens a subtree, not a detour

This is the part that decides whether the feature is worth building. It is easy — and
wrong — to give each card one historical answer and one divergent answer that drops straight
to a different ending. The player answers once against the record, gets a consolation line,
and the fiction is over before it started. They learn very quickly that leaving the record
costs them the story, and then they stop leaving it.

the record — four decisions
one answer · one ending
✗ a detour
Leaving the record costs the player the story,
so they learn not to leave it.

three more decisions,
four more endings
✓ an alternative tree
The story is as long after you leave the record
as it would have been on it.

The same first fork, two different features. On the right the divergent branch is
a story in its own right — it keeps asking, keeps splitting, and ends in several different
places, none of which is “you were wrong”.

### The invariant that makes it structural rather than aspirational

INV-9 · branch parity
From any node **N** on the record, a divergent exit to **D** must open a subtree with
**at least one fewer decision than the record has left**, and at least two endings of its
own:
  
  
`decisions(subtree(D)) >= decisions(spineFrom(N)) − 1`  and  `terminals(subtree(D)) >= 2`
  
  
A graph walk over `nodes[]`, evaluated at module load. Diverge at the first card
of a five-decision story and you owe the player four more decisions, not a paragraph.

- **Subtrees may be thinner without being shorter.** Parity counts
  *decisions and endings*, never words. A divergent node can carry two ambient beats
  where a spine node carries five — the branch stays as deep while costing substantially
  less to write.
- **Depth is not symmetry.** The branches do not mirror the record; they answer
  different questions. Refuse to send the herald and the rest of Thánh Gióng is about
  *how you fight a war without a miracle* — the passes or the open field, scorched
  earth or a cut road, an old general or the king in person. None of that exists on the
  record's side, and that is the point.
- **A confluence is allowed.** A divergent branch may rejoin a recorded
  node — `story.drift` is a high-water mark, so the tag remembers even when the
  path does not. You can return to what happened; you cannot make it true that you never
  left.

### The data structure already carries this — here is a divergence branching twice

Nothing in §1.1 caps depth: a node's exit names another node, and that node's card names
more. The tree is as deep as the author writes it, with no engine change per level.

```
// Trần Quốc Toản — the divergent answer, and the two decisions it opens *after* it.
nodes: [
  { id: 'qua-cam',  historicity: 'chinh-su',    patience: 4, onIgnored: 'la-co' },
  { id: 'vao-hoi',   historicity: 'ngoai-truyen', patience: 8, onIgnored: 'bi-lang-quen' },
  { id: 'giao-quan', historicity: 'ngoai-truyen', patience: 6, onIgnored: 'mac-ao-tia'   },
  { id: 'tuong-tre', historicity: 'ngoai-truyen', terminal: true },
  /* … 12 more … */
],
fragments: [
  { id: 'ong-xin-di-danh', volume: 'card', in: ['qua-cam'], options: [
      { id: 'con-nho-qua', to: 'la-co',   historicity: 'annal'     },  // NO  → the record
      { id: 'cho-vao-hoi', to: 'vao-hoi', historicity: 'divergent' },  // YES → ngoại truyện
  ]},
  // … and the divergent branch immediately asks again, in its own node:
  { id: 'lam-gi-voi-cau-ta', volume: 'card', in: ['vao-hoi'], options: [
      { id: 'giao-mot-quan', to: 'giao-quan' },
      { id: 'giu-ben-canh',  to: 'giu-ben-canh' },
  ]},
  // … and again:
  { id: 'cau-xin-tien-phong', volume: 'card', in: ['giao-quan'], options: [
      { id: 'cho-di',  to: 'tuong-tre' },
      { id: 'giu-lai', to: 'mat-o-tien-phong' },
  ]},
]
```

Three nested decisions on the divergent side, expressed with the same two fields the
recorded side uses. `candidates()` does not know or care which side of the tree
it is filtering.

§2 · The engine

## §2Sixty lines, in four places

All four sit in src/systems/story/StorySystem.ts. Nothing else in
the file moves — not the salience formula, not the volume bias, not the collision rule, not
the director bridge.

**Moves**Gameplay · Story
M
1 file, ~60 lines

### 2.1 · The filter — one line in candidates()

StorySystem.ts — inside the existing filter, after the `offer` check

```
function candidates(template, ctx, whispersOnly) {
  return template.fragments.filter((fragment) => {
    // …five existing guards unchanged…
    if (ctx.story.offer === fragment.id) return false;
    // The trunk. A fragment with no `in` is ambient and speaks anywhere in the story.
    if (fragment.in && !fragment.in.includes(nodeOf(ctx.story, template))) return false;
    if (fragment.quiet !== undefined && ctx.quietFor < fragment.quiet) return false;
    if (fragment.when && !fragment.when(ctx)) return false;
    return true;
  });
}

function nodeOf(story, template) {
  return story.node ?? template.entry ?? template.nodes?.[0]?.id ?? '';
}   // ← this is also the save migration; no separate upgrade step
```

### 2.2 · The transition

The only new state machine in the plan, and it is nine lines. Called from
resolveStoryBeat, from takeOpening, and
from the patience clock.

```
const RANK = { 'chinh-su': 0, 'da-su': 1, 'ngoai-truyen': 2 };

function enterNode(state, story, template, nodeId) {
  const node = template.nodes?.find((n) => n.id === nodeId);
  if (!node) return;                       // unknown id: stay put rather than wedge
  story.node = nodeId;
  story.path = [...(story.path ?? []), nodeId];
  story.nodeSince = state.turn;
  // Drift is a high-water mark. You cannot un-diverge from history — but a later node
  // may still be 'chinh-su' (a confluence), so the *node* and the *drift* differ on purpose.
  if (RANK[node.historicity] > RANK[story.drift ?? 'chinh-su']) story.drift = node.historicity;
  // A story that has just moved has something to say about it.
  story.temperature += 2;
}
```

### 2.3 · Answering a card now moves the story

```
export function resolveStoryBeat(state, storyId, fragmentId, choiceId) {
  // …unchanged through the affordability and `enabled` guards…
  ctx.remember('echoTurn', state.turn);
  ctx.remember(`chose_${option.id}`, 1);
  if (option.historicity) ctx.bump(option.historicity === 'annal' ? 'su' : 'lech');
  option.apply(ctx);
  if (option.to) enterNode(state, story, template, option.to);
  fire(state, story, fragment, ctx);
  return true;
}
```

su and lech are ordinary memory
numbers, so a fragment can gate on *how* historical the run has been —
when: (ctx) => ctx.recall('lech') >= 2 — using machinery that
already exists. No second engine.

### 2.4 · The patience clock — the guarantee that a story always moves

This is the fix for "5 of 13 stories conclude". A card is rationed to 15% of prompts, so a
story can sit at a decision forever. Ignoring is already the design's third answer to an
opening; here it becomes the third answer to a node.

StorySystem.ts — in tickStories(), before pickFragment

```
const node = template.nodes?.find((n) => n.id === nodeOf(story, template));
const waited = state.turn - (story.nodeSince ?? story.seededTurn);
if (node && !node.terminal && node.patience) {
  // Past patience: push. The story gets louder, which is the only tell the player ever gets.
  if (waited >= node.patience) story.temperature += 0.4;
  // Past twice patience: the moment has gone. Take the door nobody chose.
  if (waited >= node.patience * 2 && node.onIgnored) {
    story.waiting = undefined;              // drop any card it was holding
    enterNode(state, story, template, node.onIgnored);
    continue;                               // it will speak from the new node next tick
  }
}
```

Design note worth keeping
`onIgnored` must never lead to a punishment node. Silence is a legitimate way to
rule, and half the current catalogue's best writing is about what happens when the throne
does nothing. It leads to a *different* node, usually `ngoai-truyen`, with
its own real endings.

### 2.5 · The stamp

```
function record(state, story, fragment) {
  const entry = {
    id: `chron-${state.turn}-${storySeq}`,
    templateId: story.templateId, fragmentId: fragment.id,
    turn: state.turn, params: storyParams(state, story),
    tone: fragment.tone ?? 'info',
    historicity: story.drift ?? 'chinh-su',
  };
  // …unchanged…
}
```

§3 · Invariants

## §3Ten graph checks that make "every answer opens a tree" mechanical

All eight are pure structure over storyTemplates — no run needed,
milliseconds to evaluate, and they turn the design promise into something that cannot silently
regress. Add them to verify-chronicle.mjs as a new section above the
run block.

**Gate**verify-chronicle
10
structural · 5 behavioural

| # | Invariant | Why it exists |
| --- | --- | --- |
| INV-1 | **Every option on every card declares a `to`.** | This *is* "the story still goes on". A card with a dead-end option is the bug the whole feature is about. |
| INV-2 | Every node is reachable from `entry`. | Orphan nodes are written prose that no player can ever reach. |
| INV-3 | Every non-terminal node has ≥1 exit option somewhere in the pool, and declares `onIgnored`. | Without it a story can strand itself at a node with no card the director will raise. |
| INV-4 | Every terminal node contains ≥1 `terminal: true` fragment. | Otherwise the story sits in its ending forever. |
| INV-5 | **Every template has ≥1 `ngoai-truyen` ending and ≥1 `chinh-su` or `da-su` ending.** | A story with only recorded endings has no counterfactual; one with only divergent endings has no record to diverge from. |
| INV-6 | Every template has ≥2 nodes with a card in them. | The floor on "dynamic enough". One decision is an event, not a story. |
| INV-7 | `drift` never decreases along any path. | Reachability check over the node graph; catches an author marking a downstream node more historical than its parent by accident. |
| INV-8 | Every fragment's `in` names a node that exists; every `to` and `onIgnored` names a node that exists. | Typos in string ids are the failure mode this whole design is most exposed to. |
| INV-9 | **Branch parity.** For every divergent exit N→D: `decisions(subtree(D)) >= decisions(spineFrom(N)) − 1`. | The one that stops a divergence being a detour. Leave the record at the first of five decisions and you owe four more, not a paragraph. See §1.2. |
| INV-10 | Every divergent subtree contains **≥2 terminals** and no first-divergence node is itself terminal. | Stops the fiction being a funnel — one different answer must not mean one predetermined ending. |
| behavioural — measured over 8 seeded runs, unchanged from rev 1 | | |
| T1 | Median silence ≤ 45 s across the *whole* run. | today: 47 s overall, front-loaded |
| T2 | ≥ 70% of what a story says pauses nothing. | today: 46–56% |
| T3 | ≥ 10 of 13 seeded stories reach a terminal node. | today: 5 of 13 |
| T4 | Every Great Invasion carries ≥1 story beat bound to it. | today: 0 |
| T5 | Endings, their classes and the path are readable at the Reckoning. | today: not mentioned |
| T6 | **A wager must move the muster.** Pay a wager story's offering, then call `defaultMusterPlan(state).soldiers`: it must drop by ≥15%. A sacrifice the muster form cannot feel is decoration. | §5 — the priced-to-bind rule |

INV-1 through INV-10 should run at **module load in dev builds** as well as in the
harness — a bad id in a story file is otherwise a silent hole a player falls into forty
minutes into a run.

§4 · The tag

## §4Chính sử, dã sử, ngoại truyện — and why it is shown afterwards

**Moves**Story
S
3 classes

"Fiction" is the wrong word for this game, and Vietnamese historiography already draws the
line the feature needs. Using the real distinction turns a UI label into the thing the
player is here to learn:

Chính sử in the annals — Đại Việt sử ký toàn thư, Việt sử lược
Dã sử · Truyền thuyết told, not recorded — legend and unofficial history
Ngoại truyện your realm's variation — did not happen

Three classes rather than two, because two would force a lie. Thánh Gióng is
*truyền thuyết* and always was; stamping it *chính sử* would contradict the
History page's own note, which already says so. And Trần Quốc Toản's death is
*dã sử* while his orange is *chính sử* — inside one story.

The rule that keeps the choice alive
**Options are never labelled before they are taken.** Marking the historical option on
the card turns the story into a walkthrough with a correct answer printed on it. The class
is a *record*, not a preview: it appears on the toast that follows the answer, on the
story page's spine, and on the Chronicle entry. The player learns what happened by finding
out, which is the only version of this worth building.

### Reward asymmetry, so history is not simply the right button

- **Chính sử endings pay in permanence** — a shrine, a loyalty floor that never wears
  off, a hero tempered, an echo a later run can name aloud. Small, compounding, and they
  survive the run.
- **Ngoại truyện endings pay in power** — a power card, a host that arrives already
  raised, a treasury seized, a rival's civil war. Larger, immediate, and gone when the run
  ends.
- A player chasing score diverges; a player chasing a dynasty follows the
  record. Neither is wrong, and that is the whole design of the tag.

§5 · The shape that makes it a game

## §5A story as a strategic instrument, not a dialogue

Everything above makes the Chronicle better to *read*. This section is what stops it
being a reading task with buttons. A story can be a wager you manage across a dozen seasons,
priced in the same resources your army is priced in, on the same clock the invasion is on —
and it can arrive too late.

**§5.1**three shapes
3
ornament  
wager · lever

### Three shapes, and most of the catalogue should stay the first

- **Ornament.** The story observes and comments; its effects are small and one-off.
  This is right for most of the 48 — a realm where every story demanded strategic attention
  would be exhausting, and the ambient ones are what make it feel inhabited.
- **Wager.** The story asks you to *spend the war chest on a
  possibility*. It only appears when you are losing, it costs what your army costs, it
  takes time you may not have, and it can fail. **Thánh Gióng.**
- **Lever.** The story asks you to *commit force you already have*,
  somewhere other than where the danger is. No new resource is spent; the risk is
  displacement and timing. **Lý Thường Kiệt.**

Six to eight instruments in a 48-template catalogue is the right ratio — the same ratio the
charge stories were deliberately held to, and for the same reason.

### The wager contract — five clauses, all checkable

| Clause | What it means | Supported today? |
| --- | --- | --- |
| 1 · the gate | Seeds **only when you are actually losing** — the incoming wave outweighs what you can field. A miracle offered to a winning realm is a reward, not a wager. | **yes** — `seed()` reads `ascent.threat` vs `ascent.defensePower`; today's `thanhGiong` already gates on `threat > defensePower × 1.1` |
| 2 · the stake | Paid in the resource that **currently binds your muster**, so the offering and the levy are the same pot. | **yes, but must be priced right** — see §5.2 |
| 3 · the clock | Completion takes several seasons, measured against the invasion's own schedule, and can be missed. | **needs one signal** — `bossTelegraphed` is a **2-tick** warning, useless for anything you have to build. See §5.3 |
| 4 · the payoff | Proportional to what was invested, not a flat grant — `grantHost(ctx, base × recall('nuoi'))`. | **yes** — memory numbers and `grantHost` both exist |
| 5 · the loss | Failing must cost the resources *and* leave you weaker than not playing. Otherwise it is a free lottery ticket. | **yes** — `khong-du-an` keeps the spend and returns nothing |

### §5.2 · Priced to bind — the detail that decides whether the sacrifice is real

The muster form computes what you can raise like this:

```
// src/systems/ascent/MusterSystem.ts:87 — defaultMusterPlan
const rationsPerSoldier      = (SUPPLY_TICKS_HELD / 100) * MIN_MUSTER_SUPPLY_SHARE;  // 0.18 × 0.35 = 0.063
const soldiersTheFarmsCanFeed = Math.floor(limits.foodSpare / rationsPerSoldier);
const soldiers = Math.max(limits.minSoldiers, Math.min(
  recruitSoldiers(state.resources.humans - RECRUIT_HUMAN_RESERVE),   // (humans − 80) × 0.8
  soldiersTheFarmsCanFeed,
  limits.maxSoldiers,                                                // MAX_ARMY_SOLDIERS = 2200
));
```

The trap · measured from the constants
`soldiersTheFarmsCanFeed ≈ foodSpare × 15.9`. With 500 food in the granary that is
~7,300 soldiers — nearly **three times** the 2,200 hard cap. **Food almost never binds
the muster.** The constraint that actually bites is `humans`:
`(humans − 80) × 0.8`.
  
  
So an offering priced in food alone is **cosmetic** — the player pays and raises exactly
the same army. Price the wager in **humans and supplies**: humans cut the headcount
directly, supplies cut `provisions` and therefore
`baggageSeasons().goods`, so the host you do raise runs dry sooner.
  
  
This is also the point of **T6**: pay the offering, then read
`defaultMusterPlan(state).soldiers`. If it has not moved, the sacrifice is a
story about a sacrifice.

Which is exactly right for the fiction, incidentally. The legend is not that a village sent
grain — it is that **the village sent its sons with the grain**, and the district after
it did the same. Those are the men who are then not in your levy.

### §5.3 · The clock — one more signal, because a 2-tick telegraph is not a horizon

`BOSS_TELEGRAPH_TICKS = 2`. That is a fine trigger for a *hịch*, which is
a document you issue, and useless for anything that has to be *built*: two ticks is
not enough to feed a giant three times. The wave cycle is
`WAVE_INTERVAL_TICKS = 12` and a Great Invasion is every
`BOSS_EVERY_N_WAVES = 4`, so the real planning horizon is up to 48 ticks and the
story needs to see it.

```
// StoryWorldDelta — a sixth signal alongside the five in D1. Pure arithmetic on the clock.
ticksToBoss: number;

const cyclesLeft = (BOSS_EVERY_N_WAVES - 1 - (ascent.wave % BOSS_EVERY_N_WAVES)
                    + BOSS_EVERY_N_WAVES) % BOSS_EVERY_N_WAVES;
delta.ticksToBoss = ascent.ticksToWave + cyclesLeft * WAVE_INTERVAL_TICKS;
```

Thánh Gióng then seeds at `ticksToBoss` between 24 and 36 — two to three waves
of runway — instead of two ticks before the thing lands. The player has time to decide, time
to regret it, and time to run out of.

### §5.4 · Legibility — the one place the "no progress bars" rule has to bend

The design refuses pips and counters on purpose: a story is not a quest with a completion
percentage. But a *wager* is different — if you are betting your levy on something,
you must be able to reason about the odds, or it is not a decision, it is a slot machine.

- **Still no fraction, still no bar.** The story page's existing
  Đang treo line carries it, in the game's own register:
  *“He is taller than the doorway. The smith says the armour will not be finished before
  the water comes.”* That is a legible fact, not a percentage.
- **The offering card states its own arithmetic**, the way every other cost in this
  game does: *“Two hundred of the district's men, and their rice. He will be ready in
  three seasons if you keep sending.”*
- **Ornament stories keep the old rule unchanged.** This bends only for
  the six to eight instruments, which is why they stay a minority.

§6 · Worked in full

## §6Thánh Gióng — 15 nodes, 16 endings, ~64 fragments

Today the whole legend is **7 fragments and about 130 words**, seeded on a threat ratio.
It is a summary of the story, not the story, and it cannot know an invasion is coming because
StoryWorldDelta has no incoming-war signal. Rebuilt, the recorded
path runs across one boss cycle — 48 ticks, roughly three minutes — and asks for three
different kinds of thing. **Leave it at any of the first two decisions and you get a
different three-decision story instead, not an apology.**

**Archetype**The Muster
L
tier A  
15 nodes · 16 ends

### Before the tree: this story is a wager, and here is its contract

Read the tree below as a decision graph and you will build the wrong thing. Thánh Gióng is
not a conversation with branches — it is **a bet you place with the army's own budget while
the invasion clock runs**. The five clauses from §5, filled in:

| Clause | Thánh Gióng | Code |
| --- | --- | --- |
| gate | Seeds only when the incoming wave outweighs what the realm can field, and only in a province with a village. | seed(): ascent.threat > defensePower × 1.1 — already in today's template |
| stake | **Men and stores, not gold.** Each offering takes ~200 humans and ~90 supplies — the district's sons going with the rice. Three offerings is ~600 men you cannot levy. | option.cost { humans, supplies } → recruitSoldiers() falls by ~480 |
| clock | Seeds at ticksToBoss 24–36. Each offering needs a season of quiet. **Three offerings barely fit.** Hesitate twice and he is not ready. | §5.3 ticksToBoss MIN\_QUIET = 3 |
| payoff | The host he brings scales with what was sent, and it arrives *outside* the muster — it is not a levy, it does not eat, and it does not count against the army cap. | grantHost(ctx, 700 × recall('nuoi')) |
| loss | Underfed, he never rides. **You keep nothing.** The men are gone, the wave lands, and you have a smaller levy than a realm that ignored him. | node khong-du-an → ao-giap-gi |

The decision the player is actually making
**Six hundred men in the levy now, or two thousand in three seasons — if you can hold three
seasons, and if you keep paying.** That is a real strategic question with no correct
answer, and it is available only to a realm that is already losing. It is also, exactly, the
legend: a country that has run out of options betting everything on a child.
  
  
Note what this does to the **ngoại truyện** branches. khong-goi
— never sending the herald — is now the *conservative* line: keep your men, raise a
normal levy, fight a normal war. It has a real win in it (tu-lo-lay)
because it is a legitimate strategy, not a refusal to play.

### The whole tree

Four decisions on the record, and three alternative trees hanging off the first two — each
with its own further decisions and its own endings. **Green is the record, straw is legend
rather than annal, red is your realm's variation.**

- tin-giac — the Ân have crossed at Vũ Ninh; how do you call for helpdecision 1
  - sai sứ giả ▸ su-gia — the herald on every road; a child who has never spoken sits updecision 2
    - rèn sắt ▸ ren-sat — the forge, and the feeding: a granary offering, repeatabledecision 3 · the offering
      - fed ▸ ra-tran — he rides; the rod breaks; the bamboodecision 4 · in battle
        - soc-son — he leaves the armour on the rock and goes up. Shrine, loyalty floor, echo.
        - nga-ngua — he falls; the horse comes back down the road alone.
      - underfed ▸ khong-du-an — the armour is finished and fits nobody
        - ao-giap-gi — it rusts in a shed in a village that has stopped mentioning it.
    - cho gạo ▸ cho-gao — you fed him and gave no iron. He is enormous and unarmeddecision 3′
      - tay không ▸ tay-khong — he goes out with what is at handdecision 4′
        - nhung-cay-tre — he wins with bamboo alone. The legend's most famous image, arrived at the wrong way.
        - nga-o-ruong — he falls in the paddy and the water closes over it.
      - giữ ở làng ▸ giu-lang — a giant kept at home, eating everything the district hasdecision 4′
        - nguoi-khong-lo — a permanent oddity: +population, −stability, and a story the realm tells for generations.
        - bo-di — he walks away one night. leaveEcho: a later run may name him.
      - nấu chuông chùa ▸ chuong-chua — melt the temple bells; arm him late, in bronzedecision 4′
        - giap-dong — he rides. But the province that gave up its bells gets no shrine and no loyalty floor.
        - su-phan-doi — the monks win the argument; he never rides.
    - về triều ▸ dua-ve-trieu — the child at court, where he stops eating and stops growingdecision 3′
      - phong vương ▸ phong-vuong — a child ennobled, and a court that wants to use himdecision 4′
        - hau-tre — a hero: very high loyalty, low martial, permanent.
        - chet-yeu — he dies at court, of nothing anyone can name.
      - hỏi thầy thuốc ▸ thay-thuoc — the physicians find nothing wrong with him at alldecision 4′
        - khong-co-gi — he was only a child. Omen-class stories seed less for the rest of the run.
      - trả về làng ▸ ⤴ ren-sat — confluence: the forge finishes late and the record resumes, but drift stays **ngoại truyện** for good
  - không gọi ▸ khong-goi — nobody was called. You fight this with the army you havedecision 2′
    - giữ ải ▸ giu-ai — hold the passes; burn the granaries ahead of them, or cut the road behinddecision 3′
      - tu-lo-lay — you break them alone. Permanence: the realm learns it does not need miracles.
      - mat-phu-dong — the province falls, and the villages remember that no one came.
    - dàn trận ▸ dan-tran — meet them in the open. Who leads itdecision 3′
      - tuong-gia — the old general holds the line and does not survive it. You keep the ground.
      - vua-than-chinh — the king goes himself: the largest single swing in the story, in either direction.

### The record, against the wave clock

| Wave clock | Node | What it asks for | Hook it needs |
| --- | --- | --- | --- |
| boss T−2 | tin-giac | Gold, and a season, to send a herald into villages nobody has counted | bossTelegraphed |
| T−1 | su-gia | Supplies and gold for an iron horse, an iron rod and iron armour | said(herald) |
| muster · court ×3 | ren-sat | **Food, repeatedly.** Each gift grows him and sets the host he brings | granary opening — needs A4 |
| battleOpen | ra-tran | Nothing. One free one-shot verb when the line is breaking | battleOpen · 5th battle dial |

### The three alternative trees, and the question each one asks

| Branch | Class | Decisions | Endings | The question it is actually about |
| --- | --- | --- | --- | --- |
| khong-goi | ngoại truyện | 3 | 4 | How do you fight a war without a miracle? Passes or open field; scorched earth or a cut road; an old general or the king in person. |
| cho-gao | ngoại truyện | 4 | 6 | What do you do with a giant you fed and never armed? The deepest branch in the story, and the only one that can reach the bamboo without the iron. |
| dua-ve-trieu | ngoại truyện | 3 | 3 + confluence | What happens to a miracle taken indoors? The only branch with a way back to the record — and the tag still remembers. |
| khong-du-an | dã sử | 0 | 1 | Not a branch — the record's own failure state, reached by not feeding him. Exempt from INV-9 because it is not a divergent exit. |

**Parity check.** From tin-giac the record has 3 decisions left
and khong-goi offers 3 — comfortably over the INV-9 floor of 2.
From su-gia the record has 2 left; cho-gao
offers 4 and dua-ve-trieu 3. **Every divergence here is longer
than what it replaced**, which is the shape to aim for: the record is the spine, not the
main content.

### The prose, at three of the beats

tin-giac · card · loi-keu-goi

The Ân have crossed at Vũ Ninh. The reports agree on nothing except the number, and
nobody believes the number. The Minister of Rites proposes what the court did in your
grandfather's time: send a herald down every road and into every village, and let him
call for anyone who can save the country. It costs the treasury and it costs a season.
The Marshal points out, not unkindly, that in your grandfather's time it produced
nothing at all.

Giặc Ân đã qua Vũ Ninh. Tin báo về không khớp nhau chỗ nào, trừ con số — mà
con số thì không ai tin. Quan Lễ bộ xin làm như triều đình đời tiên đế: sai sứ giả đi
khắp các ngả đường, vào từng làng, rao tìm người cứu nước. Việc ấy tốn của kho và tốn
một mùa. Quan Thái úy nhắc, không phải để mỉa, rằng đời tiên đế làm thế mà chẳng được gì.

**Send the herald** · gold 120 — "Down every road, and into villages nobody has counted." → su-gia · annal

**We have an army** — "It is what we have. It will have to do." → khong-goi · divergent

Advice, from the least loyal minister in the room: "A herald costs a season, my lord. The enemy is not waiting a season."

ren-sat · opening on the granary · repeatable ×3 · bảy-nong-cơm

**Strip line:** Phù Đổng has cooked everything it had and he is still hungry.

**Scene:** The village pooled what it could — seven trays of rice and three of
aubergine — and he ate it, and stood up, and was taller than the doorway he had been
sitting in. The headman has sent to the next village along, and that one has sent to the
one after. Nobody has asked the court for anything yet. The granary clerk would like it
noted that he can see where this ends.

Cả làng góp lại được bảy nong cơm, ba nong cà. Ăn xong, đứa bé đứng dậy, cao
hơn cả cái cửa nó vừa ngồi. Ông trưởng làng đã cho người sang làng bên, làng bên lại cho
người sang làng nữa. Chưa ai xin triều đình cái gì. Viên thư lại coi kho xin được ghi
rằng ông ta nhìn thấy chuyện này sẽ đi tới đâu.

**Send what the granary can spare** · food 180 bump nuoi · stays in ren-sat

**(do nothing)** — the offer stands 26 seasons and then quietly stops being available also an answer

This is the beat that makes the story an activity rather than a card. Each gift sets the size of the host he brings at muster.

ra-tran → soc-son · terminal · chính sử

It ends in the afternoon. He does not come back down the road he went up: he rides to
the top of Sóc Sơn, takes the armour off and leaves it on the rock, and goes up from
there. The horse's hoofprints along the paddy road have filled with water and the
villages are already calling them ponds. The bamboo on that stretch came back yellow,
and has stayed yellow.

Xong việc vào buổi chiều. Ngài không xuống bằng con đường đã đi lên: ngài
phóng lên đỉnh Sóc Sơn, cởi áo giáp đặt lại trên phiến đá, rồi từ đó bay lên. Vết chân
ngựa dọc đường ruộng đọng nước, các làng đã gọi đó là ao. Bụi tre khúc ấy mọc lại vàng,
và vàng cho tới bây giờ.

**Build the shrine at the foot of it** permanence: loyaltyFloor 70 on that province, +defence, leaveEcho

Chronicle line, ≤12 words and deliberately flat: "He finished it and went up the mountain."

What this story needs that does not exist yet
**D1 · six new signals on `StoryWorldDelta`** — `ticksToBoss` (§5.3), `bossTelegraphed`,
`waveIncoming`, `battleOpen`, `capitalThreatened`,
`heroCaptured`. All five read fields the engine already keeps
(`ascent.bossTelegraphed`, `ticksToWave ≤ MUSTER_TICKS`,
`ascent.battle`, `ascent.capitalLostTicks`, a diff of the
`Captive` trait). About twelve lines in `worldDelta()`.
  
  
**A4 · the granary opening surface** — `openingFor` is called from
exactly one place today, the land panel, so a `treasury` opening never appears in
the world. The feeding beat is dead without it.
  
  
**A one-shot battle verb** — a fifth dial on `AscentBattle`, offered
once, gated on a story flag. The bamboo is the first user; there will be others.

§7 · Four more, in full

## §7Lý Thường Kiệt · Trần Quốc Toản · Trần Bình Trọng · Hồ Quý Ly

Chosen because each demonstrates a different thing the design makes possible: a story that
is a **lever on the war** rather than a conversation; an honest split between what the
annals record and what tradition adds; a story that reacts to a real event instead of
inventing one; and a divergence that is *better* than history.

**Archetype**The Lever
L
tier A  
12 nodes · 12 ends

### Lý Thường Kiệt — tiên phát chế nhân, 1075–77

Song was massing grain and men at Ung Châu, Khâm Châu and Liêm Châu for an invasion of Đại
Việt. Lý Thường Kiệt did not wait for it. He took an army across the border in late 1075,
reduced Khâm and Liêm quickly, besieged Ung Châu for about six weeks, burned the depots —
and then **withdrew**, which is the part everyone forgets and the part that mattered. He
built the Như Nguyệt river line, held the Song counter-invasion there through 1077, had
*Nam quốc sơn hà* read at night from the shrine on the bank, and then **offered
terms instead of pursuing**.

Why this is a lever and not a wager
A wager spends resources you could have spent on the army. **A lever spends the army
itself.** Striking first commits your host across the border for six to eight seasons — and
the wave clock does not stop while it is away. The question is not “can I afford this”, it is
**“can my provinces survive without a field army for two waves, to make the third wave
smaller?”**
  
  
**One new verb.** `commitHostAbroad(ctx, seasons)` — moves the realm's largest
host off-map, unable to defend or be recalled, returning automatically. Everything else the
story needs already exists: `sabotageIncoming` for the burned depots,
`shiftWaveClock(+n)` for the delayed invasion, `plunderSupply`,
`truce`, `monument` for the river works.

- tin-bien — they are stacking grain at Ung Châu. Seeds at ticksToBoss 24–48, with a host in hand and a rival gone colddecision 1 · the lever
  - đánh trước ▸ xuat-quan — two columns over the border. **Your army is not home.** The proclamation: we come for the officials, not the peopledecision 2 · at the fall of Ung Châu
    - đốt kho rồi rút ▸ nhu-nguyet — burn the depots and come home; build the river linedecision 3 · how to hold
      - đóng cọc và giữ ▸ giu-song — stakes, and wait. The poem read at night from the shrine on the bankdecision 4 · when they break
        - giang-hoa-thanh — you offer terms with the advantage. They go. A lasting truce, standing up, and the river works stay. **Chính sử.**
        - song-rut-khong-hoa — they withdraw without terms; you get the ground and none of the peace.
      - ra đánh trước khi chúng qua sông ▸ qua-song — meet them at the crossing instead of behind the stakesdecision 4′
        - thang-lon — it works, and it is the largest single battle result in the story.
        - mat-phong-tuyen — the line is gone and so is the river.
    - đánh tiếp ▸ sa-lay — press on past Ung Châu. Supply lines lengthen; the season turns; home is fardecision 3′
      - quay-ve-khong-kip — you turn for home when the wave is telegraphed, and arrive after it.
      - đánh tới cùng ▸ danh-tiep — take a second city while the realm behind you is nakeddecision 4′
        - chiem-dat-tong — you hold Song ground. Enormous power, permanent hostility, and a capital that has been alone for two waves.
        - mat-quan — the host is destroyed abroad. You have no field army and a Great Invasion inbound.
  - đợi chúng tới ▸ cho-giac-toi — keep the army home and let them come at full strength. The conservative line, and a real onedecision 2′
    - cố thủ ▸ co-thu — everything behind wallsdecision 3′
      - giu-duoc-kinh — you hold, barely, and the provinces outside the walls do not.
      - mat-kinh — the capital falls and the run is in its last seasons.
    - chặn ở biên ▸ chan-bien — meet them at the border with everythingdecision 3′
      - chan-duoc — you stop them cold at the frontier. No poem, no legend, no shrine — just a competent war.
      - vo-tran-bien — broken in the open, and nothing between them and the capital.
- at decision 4, instead of terms ▸ tan-sat — pursue and destroy them. The Song court demands its prisoners backdecision 5′
  - chien-tranh-dai — you keep them. A long war: the wave clock permanently accelerates.
  - hoa-muon — you return them and get peace, late and expensive.

**Parity check.** From tin-bien the record has 3 decisions left;
cho-giac-toi offers 2, meeting the INV-9 floor exactly. From
xuat-quan the record has 2 left and sa-lay
offers 2. Both divergent branches are full campaigns, not consolations.

### Two thin templates it should absorb

- **tien-phat** exists today as a fourth-wave charge story
  about burning a rival's border depots — the right event, no campaign around it. Keep the
  template id (it is an append-only save contract) and rebuild it as this arc.
- **nam-quoc** exists separately, and it is the *same
  campaign*: the poem was read on the Như Nguyệt line in 1077. Move its fragments in as
  giu-song beats.
- **Retire it safely, though.** Dropping a template from
  storyTemplates makes storyTemplate(id)
  return undefined, and a live save holding that story sits in the list forever —
  tickStories skips it, harmlessly but permanently. Leave
  nam-quoc registered as a one-fragment stub whose only beat is
  terminal, so old saves resolve and close.

**Archetype**The Petition
M
tier A  
9 nodes · 6 ends

### Trần Quốc Toản — one question, and two stories that both keep going

The whole design fits in one card. He is about fifteen, he is outside the war council at
Bình Than because he is too young to be let in, and he asks to fight.

- **Answer NO** — “he is a child, send him home.” That is what happened. He goes home,
  raises a thousand of his own household, embroiders six characters on a banner —
  **Phá cường địch, báo hoàng ân** — and fights beside you in a host **you do not
  command and cannot recall**. Two more decisions follow, and two endings.
- **Answer YES** — “let him in.” That is not what happened, and the story
  does not care: it opens its own branch with **two more decisions and four endings**,
  none of them a consolation. You get a general history never gave you. Every beat from
  here is stamped **Ngoại truyện**.
- Neither answer is the correct one, and the card does not say which is
  which. You find out by choosing, and the tag appears afterwards.

- binh-than — the council meets; fires when a parliament or doctrine prompt resolves under bossTelegraphed
  - qua-cam — the orange is in pieces in his hand and he has not noticeddecision 1 · the ask
    - NO — con nhỏ quá ▸ la-co — six characters on the banner; a thousand of his household in the fielddecision 2
      - phong chức ▸ chinh-quy — you commission the banner; it becomes a real unit, and his
        - ⤵ ham-tu
      - để tự lo ▸ co-rieng — it stays irregular, unsupplied, and does not stop
        - ⤵ ham-tu
      - ham-tu — he fights where you did not send him, and it worksdecision 3
        - nga-xuong — the banner goes in first and does not come out. He was sixteen. **Dã sử**: tradition, not annal.
        - song-sot — he lives. The annals do not record his death, so this is a variation, not a contradiction.
    - YES — cho vào hội ▸ vao-hoi — admitted at fifteen; the youngest voice in the room, and not wrong, which is worse for everyonedecision 2′
      - giao một quân ▸ giao-quan — give him a command. He immediately asks for the vanguarddecision 3′
        - tuong-tre — you let him have it and he grows into a commander. A real hero, permanent.
        - mat-o-tien-phong — you let him have it. He was fifteen and it was the vanguard.
      - giữ bên cạnh ▸ giu-ben-canh — keep him at your side as an aide, where the court can mock him safelydecision 3′
        - mac-ao-tia — he becomes a minister instead of a soldier. Court stability up; no host, ever.
        - bi-lang-quen — the council swallows him and he stops asking. Also the onIgnored exit.

**Parity check.** From qua-cam the record has 2 decisions left,
so INV-9 requires the divergent branch to carry at least 1. It carries 2, and 4 endings
against the record's 2. Answering YES gets you *more* story, not less — which is the
only way a player ever risks leaving the record twice.

### What the ending screen says, and why this story is the argument for the tag

The annals record two things: that he was kept out of the council for being too young and
crushed the orange without noticing, and that he raised a banner with six characters on it.
**They do not clearly record how he died.** So the death is not chính sử — it is
tradition — and the game can say so instead of presenting it as fact.

ham-tu → nga-xuong · terminal · dã sử

**Chép trong sử:** The annals give him the council he was turned away from, and the
six characters on the banner. They do not say where he fell, or whether he did.

**Chép ở đây:** At Hàm Tử the banner went in first and did not come out. He was
sixteen.

Both columns come from src/i18n/history/storyNotes.ts, which already carries a `.happened` and an `.inGame` note for all 48 templates and is today only readable from the front menu, out of context.

**Archetype**The Captive
S
tier B · 5 nodes

### Trần Bình Trọng — react to a capture instead of inventing one

Today ghost-south calls captureHero
inside its own first whisper: the story manufactures the event it is supposedly about, which
is why it can fire when nothing has happened. With heroCaptured in
the delta it seeds only when one of your generals is actually taken, and the famous line is
answering an offer the enemy really made.

| Node | Class | Content | Exit |
| --- | --- | --- | --- |
| bi-bat | chính sử | Seeds on `heroCaptured`. Ambient: what the camp is saying, what his household is doing, what the price is rumoured to be. | chuộc → chuoc-ve [div] đánh cướp → danh-cuop [div] để đó → de-do [annal] onIgnored → de-do |
| de-do | chính sử | They offer him a princedom in the north. **You are not asked.** He answers for himself and you read it afterwards. | terminal **quy-nuoc-nam** — "I would rather be a ghost in the South than a prince in the North." Permanence: every hero +loyalty, an echo. |
| chuoc-ve | ngoại truyện | Bought back, alive, and it cost more than the treasury wanted to admit. He is quieter now. | terminal **ve-nha** — you keep the general; the realm's standing falls. |
| danh-cuop | ngoại truyện | A night raid on the camp. Ambient across 3 beats while it is prepared. | **cuop-duoc** / **hong-viec** — resolved against the real invader power model |

**Why `de-do` is the interesting node:** the annal path is the one where the
player does *nothing*, and the reward is the largest permanence payout in the story.
That is the clearest possible statement that inaction is a real answer — and it is only
expressible because `onIgnored` exists.

**Archetype**The Reform
S
tier B · 6 nodes

### Hồ Quý Ly — the divergence that is better than what happened

He capped how much land a household could hold and how many bondservants it could keep,
took the surplus into state granaries, and issued the first paper currency in the country's
history. The reforms were right on paper and cost him the country in seven years. That is a
story whose *historical* ending is the failure — so the ngoại truyện branch is the
one where they work, and it should be genuinely, mechanically better.

- **chính sử ending — bay-nam.** The reform lands, the great
  houses go quiet rather than compliant, and when the invasion comes nobody musters for you.
  Permanence: a standing economy modifier that survives, and an echo naming the minister.
- **ngoại truyện ending — to-giay-chay.** You take the
  reform back before it breaks the country, or you enforce it hard enough that it holds.
  Power: the largest single economic swing in the catalogue, and the run is measurably
  richer for it.
- **This is the story that proves the asymmetry is not a punishment
  system.** Following the record here is the harder, slower, more interesting play.

**Blocked companion:** the paper-money annal (paper-money)
already exists and already uses debaseCurrency — merge it in as a
node of this story rather than leaving two templates telling one reign's story from
different ends.

§8 · Scaling

## §8All 48, without 48 blank pages

Requiring every template to have a trunk, two decision points and a counterfactual ending is
roughly a fourfold expansion of the catalogue. The way that becomes tractable is that most
stories are not structurally unique — they are six shapes with different people in them.

**Method**6 trunk archetypes
L
237 → ~880 frag

### The six trunks

Each is a canonical node graph an author instantiates rather than invents. The archetype
fixes the shape — how many nodes, where the divergence is, what the endings are for — and
the author supplies the people, the objects and the prose.

| Trunk | Shape | Divergence is | Templates | n |
| --- | --- | --- | --- | --- |
| The Petition | asked → granted / refused / deferred → repaid / overgrown / acts-anyway | refusing, or granting more than was asked | reed-banner, orange, thanh-giong, chieu-doi-do, khuc-thua-du, van-mieu, tien-phat… | 11 |
| The Muster | war-comes → who-answers → armed / unarmed → the-field | who you call, and whether you pay for them | thanh-giong, hich-tuong-si, dien-hong, hai-ba, than-toc, chi-lang… | 9 |
| The Betrayal | doubt → tested / believed → proved / broken → kept / lost | whether you believed the accusation | slandered, trusted, goose-feathers, borrowed-sword, substitution… | 8 |
| The Reform | proposed → enacted / shelved → holds / breaks → after | enforcing it, or taking it back | granaries, paper-money, thu-do, luy-thay, counting-house, unpaid… | 8 |
| The Omen | sign → read / ignored → prepared / caught → what-came | whether you acted on a thing you could not verify | mountain-water, the-sickness, five-days, salt-road, rice-riot… | 7 |
| The Captive | taken → ransom / raid / leave → returned / refused / lost | paying, or storming, instead of waiting | ghost-south, binh-trong, no-heir, cham-engineer, ho-guom… | 5 |

### Three tiers — the parity floor scales, the rule does not

INV-9 is relative, not absolute: a two-decision story owes a one-decision branch. So a
short template still branches properly; it just branches shorter. Nothing is exempt.

| Tier | Stories | Record | Each divergent subtree owes | Endings | Fragments |
| --- | --- | --- | --- | --- | --- |
| A · set piece | 8 | 4–5 dec. | ≥3 decisions, ≥3 endings | 12–16 | 55–70 |
| B · full | 16 | 3 dec. | ≥2 decisions, ≥2 endings | 6–9 | 26–34 |
| C · vignette | 24 | 2 dec. | ≥1 decision, ≥2 endings | 4–6 | 16–20 |

Tier A stories run across a whole boss cycle, bind to the war and carry a bespoke hook — a
battle verb, a granary offering. Tier C is still a real tree: two decisions, a divergent
branch that asks once more, and at least two endings on each side. It is roughly
**3× today's median template**, not 6×.

### The honest number

Scope, stated plainly
Roughly **1,400 fragments** against today's 237. At the §5 standard — a whisper carries a
strip line, a scene and a chronicle line (~90 words); a card carries a body, options, advice
and a chronicle line (~150) — that is on the order of **160,000 words in English and the
same again in Vietnamese, which is the source language.** Two novels. That is not a phase;
it is a content programme measured in months, and pretending otherwise would make every
estimate in §11 worthless.
  
  
**Two things make it tractable.** First, parity counts decisions and endings, never
words — a divergent node can carry two ambient beats where a spine node carries five, so
branches cost far less than their depth suggests. Second, the tiers land independently:
nothing in B or C gates anything in A.
  
  
**The proof cut is three stories.** Thánh Gióng, Trần Quốc Toản and Diên Hồng — about
160 fragments, ~18,000 words per language. That is enough to ship the engine, the tag, the
invariants and the screens with real content behind them, and to find out whether players
actually leave the record. **Do that before committing to the other 45.**

§9 · "It must support all"

## §9Three things that were being excluded, and the fix for each

**Unblocks**3 famous stories
M
2 files

### 9.1 · All 48 templates, not 4 set pieces

Handled by §8. The invariants in §3 are what make it enforceable rather than aspirational:
INV-5 and INV-6 fail the build for any template without a counterfactual ending and two
decision points, so a converted catalogue cannot quietly contain unconverted stories.

### 9.2 · The water stories — Bạch Đằng, Yết Kiêu, Vân Đồn

Three of the most famous episodes in the catalogue want a river or a harbour, and
land.terrainSummary.water is **0 for every province in the
game**. Water tiles exist and are drawn, but the flood fill in
src/map/hexMapGenerator.ts explicitly refuses to assign a
landId to one, so no land ever counts one.

The safe fix is *adjacency*, not ownership. Assigning water tiles to lands would
change buildingCapacity, population and output across all four
modes and every existing save:

```
// src/map/terrainTypes.ts — TerrainSummary
  /** Hexes of this land that touch a water tile. Adjacency, not ownership — assigning
   *  water to a land would move buildingCapacity and population in every mode. */
  waterAdjacent: number;

// src/state/GameState.ts — both factories, after the existing summary loop
  summary.waterAdjacent = hexes.filter((hex) =>
    neighborsOf(hex).some((n) => tileAt(n)?.terrain === 'water')).length;
```

- Story seeds and the harbour gate (ResourceSystem.ts:1727) move
  to waterAdjacent > 0.
- **Leave the economy line alone.**
  ResourceSystem.ts:1026 pays a water/rice output bonus off
  water > 0 and has therefore never fired. Switching it on is a
  balance change across all four modes and belongs in its own measured pass, not in this
  one — run verify-modes-regression.mjs before and after when you
  do it.

### 9.3 · The other three game modes

The Chronicle returns immediately outside ascent, which is what keeps the
mode-regression fingerprint byte-identical. Throne of Empires is the mode whose long arcs
suit this best, and the block is not conceptual — it is the tick order and the prompt
queue, which empire does not share.

- **Empire: yes, and it is mostly free.** Call tickStories
  from advanceRealtimeMonth behind
  isCampaignMode, and route cards through the existing empire
  event modal rather than the ascent prompt queue. The delta signals in D1 need empire
  equivalents (state.pendingInvasion instead of
  bossTelegraphed), which is a mapping function, not new state.
- **Do it after Tier A, and re-baseline the fingerprint deliberately.**
  verify-modes-regression.mjs prints a 60-tick fingerprint per
  mode; this will change empire's on purpose, and that change must be reviewed rather than
  accepted silently.
- **Rival and campaign: no.** Those two are the hand-played classic modes
  with no card queue and no pause contract to hang a beat on. Whispers alone would work
  there, and are worth considering later, but nothing in this plan depends on it.

§10 · Screens

## §10Four surfaces, one of them new

**Moves**Fun · Connected
M
ConquestUIScene

- **The story page grows a spine.** story.path rendered as a
  vertical run of the nodes passed through, each with its class colour, the divergence
  marked where it happened, and the current node lit. This is the decision tree made
  visible, and it is the screen that teaches the player the feature exists. It sits above
  the existing "Đã xảy ra" list, which stays exactly as it is.
- **A class chip** at the head of the story page and on every Chronicle entry — jade
  Chính sử, straw Dã sử, cinnabar
  Ngoại truyện — read from story.drift.
- **The bell becomes a doorway.** logEvent gains an optional
  { storyId, fragmentId } and a story row in the notification log
  opens the scene instead of being a dead string. **This is the single
  highest-leverage change in the plan for the prose work** — it is where the scene from §5
  actually lives, because state.message is one line in a header
  strip on a 390-pixel phone and cannot hold one.
- **The Reckoning gets an annal.** The run's Chronicle entries as a short dated list
  with the classes counted — *"Chính sử 3 · Dã sử 1 · Ngoại truyện 1"* — plus
  endings × 60 in the score, weighted so a recorded ending is
  worth more than a divergent one. That is the permanence side of §4's asymmetry expressed
  in the one number the player is actually chasing.
- **A story shelf in the Codex.** Template ids met, n / 48
  beside the champion count, and the History page's story tab gated on it. 17 of 48
  templates never spoke once across eight measured runs and nothing tells the player the
  catalogue is four times larger than a run.

§11 · Sequencing

## §11Eight phases, each shippable on its own

**Ship**one at a time
8
phases

1. #### Wiring

   The six review defects — the whisper refill, the charge tracker, frozen cast names, the three unwired opening surfaces, the silent-squatter retirement. A4 is a hard dependency for Thánh Gióng's feeding beat. Ends when T1–T3 pass. **6.5 → 7.2**
2. #### Signals

   D1's five delta signals, the hịch merge, and the Bình Trọng rebind onto `heroCaptured`. Nothing new to write; it makes what exists mean more. Ends when T4 passes. **7.2 → 7.6**
3. #### Trunk

   §1 types, §2's sixty lines, §3's eight invariants running at load. Convert *one* template — Thánh Gióng — as the proof. Everything else keeps running unconverted beside it. **7.6 → 7.9**
4. #### Memory

   §10's Reckoning annal, score term, Codex shelf, class chip. Do it before the writing so every scene written afterwards lands somewhere that keeps it. Ends when T5 passes. **7.9 → 8.2**
5. #### Voice

   The `scene` key, the openable bell row, the story-page spine, the two-column ending drawn from `storyNotes.ts`. Then Tier A's prose to the §5 standard. **8.2 → 8.7**
6. #### The proof cut — three trees, then decide

   Thánh Gióng, Trần Quốc Toản and Diên Hồng as complete trees, ~160 fragments. Ship it and measure one thing above all: **how often players leave the record, and whether they leave it twice.** If they diverge once and never again, INV-9 is not being honoured in the writing and no amount of Tier B will fix it. **8.7 → 9.0**
7. #### The rest of Tier A, then B and C

   The remaining five set pieces; the water fix (§9.2) lands here because Bạch Đằng is one of them. Then a wave at a time, forever. Nothing after the proof cut gates anything else. **holds 9.0, deepens it**
8. #### Empire mode

   §9.3 — route cards through the empire event modal and re-baseline the mode fingerprint deliberately. **widens the audience for all of it**

### Five ways this makes the game worse

- **Buying the tree with more interruptions.** Nodes must not each raise a
  card. A story with 8 nodes and 8 cards is 8 pauses; the Chronicle's budget is 15% of
  prompts and it does not have room. Two or three decision cards per story, and everything
  else — the ambient beats, the openings, the confluences, the patience exits — costs
  nothing. **T2 catches a regression here.**
- **Labelling options before they are taken.** The tag is a record, not a
  preview. Print "historical" on a button and the story becomes a walkthrough.
- **Making `onIgnored` a punishment.** Silence is a legitimate
  way to rule and half the catalogue's best writing is about it. Ignoring leads somewhere
  different, not somewhere worse.
- **Letting chính sử pay more in every dimension.** Permanence against
  power, and mean it — Hồ Quý Ly is the test case, because there the recorded ending is the
  failure.
- **Shipping a half-translated wave.** Story text sits outside the eagerly
  validated bundle and a missing key returns the key rather than throwing, so a missing
  Vietnamese line fails silently *in the source language*. Every new
  `scene` key must be gated in both languages before it merges — the existing
  coverage check in `verify-chronicle.mjs` already does this for the other keys
  and just needs `scene` added to its `need[]` list.

Planned against feat/launch-splash-and-native-shell
at 950a9de, 22 Aug 2026. Every "today" figure is measured, not
estimated — see [Reading
the Chronicle](https://claude.ai/code/artifact/2f9cc19b-8348-49ec-a12f-408febe05fac) for the run data and method
([bản tiếng Việt](https://claude.ai/code/artifact/a2da9f38-31c3-4540-9880-b323fffbb04e)).
Line references are to the working tree at that commit. Historical detail from Đại Việt sử ký
toàn thư and the Phù Đổng / Sóc Sơn legend cycle; where the annals and tradition disagree — as
they do about Trần Quốc Toản's death — the plan says so rather than choosing, because that
disagreement is the feature.