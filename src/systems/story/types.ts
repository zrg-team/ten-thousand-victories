import type {
  ActiveStory,
  GameState,
  Hero,
  Historicity,
  StoryOutcome,
  Kingdom,
  Land,
  NotificationKind,
  ResourceBag,
  StoryBand,
  StoryCast,
  StoryVolume,
} from '../../state/types';

export type { Historicity, StoryOutcome };

/**
 * Authoring types for the Chronicle. None of this is serialised — a save holds only the
 * `ActiveStory` instance (cast, memory, temperature, spoken ids) and rejoins it to the
 * template by id at load. That is why fragment ids are an append-only contract: rename one
 * and every save halfway through that story loads into a dangling reference.
 */

/**
 * A situation the story is standing in. The trunk of the decision tree.
 *
 * A node is not a line — it is a state several fragments can be about, which is what lets a
 * salience pool and a decision tree coexist: the *trunk* is a graph the player's answers walk,
 * and the *pool inside each node* still draws on fit, so two runs down the same branch do not
 * read identically.
 *
 * **Node ids are an append-only contract exactly like fragment ids.** A live save holds the node
 * it is standing in; rename one and that save loads into a dangling reference.
 */
export interface StoryNode {
  id: string;
  /** Inherited by every fragment fired here, and by the Chronicle entry via `story.drift`. */
  historicity: Historicity;
  /** Seasons before the engine starts pushing this node's exit card. */
  patience?: number;
  /**
   * Where the story goes when the exit is never answered. Required unless `terminal`.
   *
   * **Never a punishment node.** Silence is a legitimate way to rule, and half this catalogue's
   * best writing is about what happens when the throne does nothing. Ignoring leads somewhere
   * *different*, not somewhere worse.
   */
  onIgnored?: string;
  /** No exits. The story ends when a terminal fragment fires here. */
  terminal?: boolean;
}

/** What changed in the world since last tick. Computed by diffing, so no other system has to push. */
export interface StoryWorldDelta {
  lostLand: boolean;
  gainedLand: boolean;
  lostHero: boolean;
  gainedHero: boolean;
  wonBattle: boolean;
  waveBroken: boolean;
  /** Granary is draining and within a few seasons of empty. */
  starving: boolean;
  /** Treasury sitting above the "somebody has started counting" line. */
  hoarding: boolean;
  seatEmptied: boolean;

  // ── The war ───────────────────────────────────────────────────────────────
  //
  // Before these, the only signal about the fighting was `waveBroken` — so a story could only
  // ever react *after* it was over. Nothing here is new state; all six read fields the engine
  // already keeps.

  /**
   * Ticks until the next Great Invasion, across however many ordinary waves stand in between.
   *
   * `bossTelegraphed` is a **two-tick** warning (`BOSS_TELEGRAPH_TICKS`), which is fine for a
   * document you issue and useless for anything you have to *build*. A story that wants to be
   * fed three times needs a planning horizon, and this is it.
   */
  ticksToBoss: number;
  /** The Great Invasion is two ticks out. The window the hịch already uses. */
  bossTelegraphed: boolean;
  /** A wave lands within the muster window — the last moment anything can still be raised. */
  waveIncoming: boolean;
  /** A watchable fight is open right now, so a story can act *inside* it. */
  battleOpen: boolean;
  /** The seat of the dynasty is in enemy hands. */
  capitalThreatened: boolean;
  /** One of ours was taken alive this tick. */
  heroCaptured: boolean;
}

/** Everything a fragment can read and do. Deliberately narrow — fragments are not systems. */
export interface StoryCtx {
  state: GameState;
  story: ActiveStory;
  world: StoryWorldDelta;
  /** Seasons since this story last said anything. */
  quietFor: number;
  /** Seasons since the story seeded. */
  age: number;

  hero(): Hero | undefined;
  otherHero(): Hero | undefined;
  land(): Land | undefined;
  rival(): Kingdom | undefined;

  /** Read a memory number. Absent reads as 0. */
  recall(key: string): number;
  /** Write a memory number. */
  remember(key: string, value: number): void;
  /** Add to a memory number and return the new value. */
  bump(key: string, by?: number): number;
  /** True when a fragment id has already fired for this story. */
  said(fragmentId: string): boolean;
  /** Push the story toward acting. Never shown; only its frequency of speech leaks it. */
  heat(by: number): void;

  /**
   * Other live stories that have bound one of the same subjects.
   *
   * Two stories about the same hero read each other: he can be a martyr in one and a traitor in
   * the other, and the game does not resolve the contradiction for you.
   */
  sharing(): number;

  /**
   * A moment from an *earlier run*, if one ever happened, with the name attached.
   *
   * This is what lets a commander who quietly left in run three be named as the man leading the
   * host that kills you in run five.
   */
  echoOf(templateId: string, fragmentId: string): string | undefined;

  /** Records a moment for later runs to mention. Only terminals should call this. */
  leaveEcho(name: string): void;

  /**
   * The fragment being resolved right now.
   *
   * `leaveEcho` used to key off `story.spoken[last]`, which is only correct inside a fragment's
   * own `effect` — an option's `apply` runs *before* `fire` pushes the id, so every echo left
   * from an answer was filed under the previous beat and `echoOf` could never match it again.
   */
  speaking?: string;

  /**
   * What the answer just cost, as actually charged.
   *
   * Story prices wear the realm's scaled purse, so the figure the treasury moved by is not the
   * figure written in the option's `cost`. Any story that pays a sum back — an amount lodged with
   * a temple, a loan settled, a deposit returned — must read it from here, or it returns the
   * authored literal against a scaled deposit and quietly makes the player poorer for having
   * trusted it. Set immediately before `apply` runs; undefined for an option that costs nothing.
   */
  paid?: Partial<ResourceBag>;

  /**
   * Books what this answer actually did, so the player can be told.
   *
   * The story card has only ever printed a *price* (`option.cost`), never a result — which is why
   * a player can answer six beats and not know what any of them were worth. Called by the verbs
   * in `effects.ts` with the figures they already compute and used to discard; an author who
   * reaches past the vocabulary and mutates state directly may call it themselves, and should.
   *
   * Deliberately silent for anything the player is not supposed to know yet: a defection, a
   * mutiny, a rival quietly coming apart. **The absence of a note is the policy** — there is no
   * exclusion list to keep in step, because the verb that does the thing is the verb that
   * reports it, and one that represents a betrayal simply does not call this.
   */
  note(kind: string, amount?: number, name?: string): void;
  /** What has been noted so far. Engine plumbing; fragments do not read this. */
  noted: StoryOutcome[];

  /** The node this story is standing in. */
  node(): string;
  /** Move the story to another node without a card — for effects that branch on the world. */
  goTo(nodeId: string): void;
  /**
   * The least historical class the path has touched so far.
   *
   * A high-water mark, never decreasing: a branch may rejoin the record (a confluence) and the
   * tag still remembers. You can return to what happened; you cannot make it true that you never
   * left.
   */
  drift(): Historicity;
}

export interface StoryOption {
  id: string;
  /** Resources spent when taken. Shown exactly; an unaffordable option is closed, not hidden. */
  cost?: Partial<ResourceBag>;
  /** Extra gate beyond affordability — e.g. "needs a hero of martial 55 in that province". */
  enabled?: (ctx: StoryCtx) => boolean;
  /** Text key suffix explaining why it is closed. Rendered under the option. */
  blockedKey?: string;
  /**
   * The node the story moves to when this option is taken.
   *
   * **Required on any option in a template that declares `nodes`** — INV-1, checked at load. This
   * single field is what makes "every answer leads somewhere" mechanical rather than aspirational:
   * an option with nowhere to go is a story that stops because the player answered it wrong.
   */
  to?: string;
  /**
   * How this answer sits against the record.
   *
   * Drives `story.drift` and, through it, the tag on the Chronicle entry. It also decides the
   * *kind* of reward the branch should pay: annal endings pay in permanence (a shrine, a loyalty
   * floor, an echo), divergent ones in power (a card, a host, a treasury). If following the
   * record simply paid more, the tag would stop being a choice and become a walkthrough.
   *
   * **Never shown on the option itself.** The class is a record, not a preview.
   */
  historicity?: 'annal' | 'divergent';
  apply: (ctx: StoryCtx) => void;
}

export interface StoryFragment {
  /** Append-only. Never rename, never reuse — a live save holds this string. */
  id: string;
  volume: StoryVolume;
  band?: StoryBand;
  /**
   * Nodes this fragment may speak in. Absent means ambient — it speaks anywhere in the story.
   *
   * This is the whole cost of the trunk inside the draw: one line in `candidates()`. Everything
   * else about salience is untouched.
   */
  in?: string[];
  /**
   * Nodes this fragment own effect may move the story to, via ctx.goTo.
   *
   * Declared rather than inferred because a static graph walk cannot see inside a closure, and
   * a transition the checker cannot see is a node it reports as unreachable. Anything that
   * branches on an *outcome* rather than an answer - the muster horn, the ride - belongs here.
   */
  leadsTo?: string[];
  /** Hard gate. A fragment whose `when` is false is not in the running at all. */
  when?: (ctx: StoryCtx) => boolean;
  /** Base weight in the salience draw. */
  weight?: number;
  /** Added to the weight when the moment particularly suits this fragment. */
  salience?: (ctx: StoryCtx) => number;
  /** Seasons of silence required before this may speak. */
  quiet?: number;
  /** May fire more than once. Default is once per story. */
  repeatable?: boolean;
  /**
   * Hard ceiling on a repeatable fragment, and it is deliberately low.
   *
   * "Repeatable" must not mean "unlimited": measured, one ambient line fired six times in a
   * single run, which is precisely the visible repetition a salience pool is most exposed to and
   * worse than a chain, since a chain at least does not repeat itself.
   */
  maxTimes?: number;
  /** Ends the story. The Chronicle records it. */
  terminal?: boolean;
  /** Accent for the Chronicle entry. */
  tone?: NotificationKind;
  /** Cards only. A blow has none, which is what makes it a blow. */
  options?: StoryOption[];
  /** Whispers and blows act here; cards act through the option taken. */
  effect?: (ctx: StoryCtx) => void;
  /** Temperature change when this fires. */
  heat?: number;
  /**
   * Hangs an offer on a subject the player already visits, instead of speaking.
   * Openings are how a story creates something to do without ever issuing an order.
   */
  opening?: {
    /** Where the row appears. */
    on: 'land' | 'hero' | 'army' | 'rival' | 'treasury';
    actionKey: string;
  };
}

export interface StoryTemplate {
  id: string;
  /** Bind subjects from the world, or return undefined to decline seeding now. */
  seed: (state: GameState) => StoryCast | undefined;
  /**
   * What the bound character currently thinks of the player, as a text-key suffix
   * (`<templateId>.regard.<suffix>`), derived from the story's own memory.
   *
   * Words, never a number: "grateful", "waiting", "cold". This is the relationship the page
   * shows, and it moves only when the player actually does something — which is what makes a
   * salience pool legible as *reacting to you* rather than as weather.
   */
  regard?: (ctx: StoryCtx) => string | undefined;
  /**
   * Where this template's endings sit against the record, for a template with no trunk.
   *
   * One authored word, and a judgement rather than a default: `chinh-su` for what the annals
   * record, `da-su` for what tradition holds and the annals do not, `ngoai-truyen` for the ones
   * invented for this game. A trunked template derives it from `story.drift` instead and ignores
   * this. Absent means the ending goes unclassified, which is honest but invisible.
   */
  record?: Historicity;
  /**
   * How the situation stands, as a text-key suffix (`<templateId>.pressure.<suffix>`).
   *
   * `regard` is what the bound person thinks of you; this is what has *changed* — and the two are
   * different questions. A wager especially needs it: four offerings into Thánh Gióng's forge is
   * a fact about a giant, and there is no honest way to show it as a number without turning the
   * story into a quest with a completion state.
   *
   * So: a sentence, never a fraction, never a bar. Absent omits the line entirely, which is what
   * the forty templates that are not instruments do.
   */
  pressure?: (ctx: StoryCtx) => string | undefined;
  /** Relative chance of being the one considered on a seeding tick. */
  seedWeight: number;
  /** Earliest turn this may seed. */
  minTurn?: number;
  /** Only one instance of a template at a time unless this is set. */
  allowMultiple?: boolean;
  /**
   * The trunk. Absent means the template is a flat pool and behaves exactly as it did before
   * nodes existed — which is what lets the catalogue convert one story at a time.
   */
  nodes?: StoryNode[];
  /** Node the story starts in. Defaults to `nodes[0].id`. */
  entry?: string;
  fragments: StoryFragment[];
}

/** Text parameters a fragment exposes for interpolation. */
export type StoryParams = Record<string, string | number>;
