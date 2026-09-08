/**
 * Everything the game is heard through: the press effects, and the bed under a fight.
 *
 * **The effects are paper, and nothing is loaded to make them.** A sheet moved under the thumb
 * when a control is pressed, the stiffer snap of a card leaving a stack, and six documents for
 * the six lanes of the action bar — all synthesized, because the interface is a court of paper
 * and paper is a thing a filter can be honest about.
 *
 * **The music is licensed, and that is the second lesson.** A first pass synthesized đàn tranh,
 * đàn bầu, sáo and trống and scheduled generative beds across the whole game. It was reviewed by
 * ear and rejected — *"sound really bad except sound when click button"* — and the difference is
 * the craft, not the code: a woodblock print is made of marks a program can place honestly, and a
 * melody is not. So the effects stayed procedural and the music is now five real orchestral
 * tracks by a composer, playing only where the game asked for them: under a battle, very quietly,
 * and never anywhere else.
 *
 * Not Phaser's SoundManager. The effects are built, not loaded, and the music is decoded into
 * the same context and played from buffers; what the manager would have given us is four lines —
 * the context is built inside the first press (a user gesture by construction, so the autoplay
 * policy is satisfied rather than negotiated) and everything suspends when the tab goes away.
 *
 * **Why the music is not an `<audio>` element any more.** It was, and the phone treated the game
 * as a music player for it: a Now Playing card on the lock screen and in the Dynamic Island, a
 * media notification on Android, transport controls for a bed that plays at eight percent under
 * a map. That is what the OS does for any playing media element, and no `mediaSession` setting
 * takes it back. Sound that comes out of an `AudioBufferSourceNode` is a game making a noise, not
 * a track being played, and gets no card. The price is memory — a decoded minute of mono is
 * eleven megabytes at the phone's rate — which is why every bed is capped at `BED_MAX_SECONDS`
 * and the cache holds a couple of pieces, never the set. Reported as *"sound play feel like a
 * music player (in lock screen, or island), not game music"*.
 *
 * Two switches, one above the other: SOUND is everything, MUSIC is the beds alone. A player who
 * wants the paper under the thumb but nothing on the lock screen turns the second off.
 */

const STORAGE_KEY = 'mandate:sound:v1';

interface SoundSettings {
  /** Everything the game is heard through. Off means silence, and the context is suspended. */
  enabled: boolean;
  /** The beds — menu, map, battle. Effects keep playing with this off. */
  music: boolean;
}

function readSettings(): SoundSettings {
  const fallback: SoundSettings = { enabled: true, music: true };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { enabled?: boolean; music?: boolean };
    return { enabled: parsed.enabled !== false, music: parsed.music !== false };
  } catch {
    return fallback;
  }
}

/**
 * The longest a bed is kept decoded. Every ambient piece is already trimmed to about a hundred
 * seconds; the battle tracks are three to four minutes, and the first hundred seconds of a war
 * march looped is a bed nobody notices repeating at twelve percent under a fight — while the
 * whole track decoded would be forty megabytes of PCM on a phone that is also holding the map.
 */
const BED_MAX_SECONDS = 100;
/** The fade baked on either side of a cut, so the loop seam is not a click. */
const BED_SEAM_SECONDS = 1.2;
/** Decoded pieces kept: the one playing on the map, the one under a fight, and one more. */
const BED_CACHE = 3;

/** Sources this module stopped on purpose, so their `ended` is not read as the piece finishing. */
const stoppedByUs = new WeakSet<AudioBufferSourceNode>();

/**
 * One bed: a decoded piece, played from a buffer through its own gain, pausable.
 *
 * A buffer source cannot be paused, only stopped and started again from an offset, so the
 * position is kept here. A context that is suspended (the tab hidden) freezes the source where it
 * is and thaws it on resume, which is the pause a backgrounded fight needs for free.
 */
class Bed {
  readonly gain: GainNode;
  private source?: AudioBufferSourceNode;
  private buffer?: AudioBuffer;
  private startedAt = 0;
  private offset = 0;
  private loop = false;
  /** The piece ran to its end (never true for a looping bed). */
  ended = false;
  onEnded?: () => void;

  constructor(private readonly ctx: AudioContext) {
    this.gain = ctx.createGain();
    // Assigned, never scheduled — see the note in `battleMusic`.
    this.gain.gain.value = 0.0001;
    this.gain.connect(ctx.destination);
  }

  play(buffer: AudioBuffer, loop: boolean): void {
    this.stopSource();
    this.buffer = buffer;
    this.loop = loop;
    this.offset = 0;
    this.ended = false;
    this.startSource();
  }

  get playing(): boolean {
    return this.source !== undefined;
  }

  /** Seconds into the piece, whether playing or paused. */
  position(): number {
    const buffer = this.buffer;
    if (!buffer) return 0;
    if (!this.source) return this.offset;
    const at = this.offset + (this.ctx.currentTime - this.startedAt);
    return this.loop ? at % buffer.duration : Math.min(at, buffer.duration);
  }

  pause(): void {
    if (!this.source) return;
    this.offset = this.position();
    this.stopSource();
  }

  resume(): void {
    if (this.source || !this.buffer || this.ended) return;
    this.startSource();
  }

  dispose(): void {
    this.stopSource();
    this.buffer = undefined;
    try { this.gain.disconnect(); } catch { /* context gone */ }
  }

  private startSource(): void {
    const buffer = this.buffer;
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = this.loop;
    source.connect(this.gain);
    source.onended = () => {
      if (this.source === source) this.source = undefined;
      if (stoppedByUs.has(source)) return;
      this.ended = true;
      this.offset = 0;
      this.onEnded?.();
    };
    source.start(0, this.offset % buffer.duration);
    this.startedAt = this.ctx.currentTime;
    this.source = source;
  }

  private stopSource(): void {
    const source = this.source;
    if (!source) return;
    this.source = undefined;
    stoppedByUs.add(source);
    try { source.stop(); } catch { /* never started */ }
    try { source.disconnect(); } catch { /* already gone */ }
  }
}

/**
 * Cuts a decoded piece down to `BED_MAX_SECONDS` with a fade at either end of the cut, and hands
 * the rest back to the garbage collector. A piece already inside the cap is returned untouched:
 * the ambient set has its own fades baked in, and a second one would dent them.
 */
function capForLoop(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  if (buffer.duration <= BED_MAX_SECONDS + 1) return buffer;
  const rate = buffer.sampleRate;
  const frames = Math.floor(BED_MAX_SECONDS * rate);
  const seam = Math.floor(BED_SEAM_SECONDS * rate);
  const cut = ctx.createBuffer(buffer.numberOfChannels, frames, rate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const from = buffer.getChannelData(channel);
    const to = cut.getChannelData(channel);
    to.set(from.subarray(0, frames));
    for (let i = 0; i < seam; i += 1) {
      const k = i / seam;
      to[i] *= k;
      to[frames - 1 - i] *= k;
    }
  }
  return cut;
}

/**
 * A sheet of paper, described: where its noise sits, how many times it moves, how hard.
 * `up`/`down` are functions so a voice can re-roll its timing per press.
 */
export interface PaperShape {
  centre: number;
  q: number;
  ripples: number;
  peak: number;
  /** How much quieter each ripple is than the one before it. */
  fade: number;
  up: () => number;
  down: () => number;
}

export interface LaneVoice {
  paper: PaperShape;
  /** A low thump under the paper — stock, a drum skin, a plank. */
  knock?: { from: number; to: number; level: number };
  /** A second sheet, later: the pages after the cover. */
  second?: { after: number; paper: PaperShape };
}

/**
 * The six lanes of the action bar, as six documents. See `SoundDirector.lane`.
 *
 * Exported so the harness can assert the set and the offline demo can render the real numbers
 * rather than a copy of them — a mirrored table is one that drifts the first time a voice is
 * retuned.
 */
export const LANE_VOICES: Record<string, LaneVoice> = {
  // Thick plans unrolled on a bench, and the plank they land on.
  build: {
    paper: { centre: 1000, q: 0.6, ripples: 3, peak: 0.5, fade: 0.22,
      up: () => 0.014 + Math.random() * 0.01, down: () => 0.032 + Math.random() * 0.02 },
    knock: { from: 150, to: 96, level: 0.1 },
  },
  // A portrait card flicked out of a stack: the brightest and the shortest of the six.
  heroes: {
    paper: { centre: 2800, q: 1.4, ripples: 1, peak: 0.42, fade: 0,
      up: () => 0.005, down: () => 0.05 + Math.random() * 0.02 },
  },
  // A memorial scroll unrolling — the longest, and the only one with four movements.
  court: {
    paper: { centre: 1700, q: 0.9, ripples: 4, peak: 0.42, fade: 0.18,
      up: () => 0.016 + Math.random() * 0.012, down: () => 0.036 + Math.random() * 0.022 },
  },
  // A muster roll: stiff paper over the knock of a drum skin.
  army: {
    paper: { centre: 2200, q: 1.2, ripples: 2, peak: 0.46, fade: 0.3,
      up: () => 0.006, down: () => 0.042 + Math.random() * 0.018 },
    knock: { from: 190, to: 118, level: 0.13 },
  },
  // A letter from another court — the softest and slowest; diplomacy is not loud.
  affairs: {
    paper: { centre: 1300, q: 0.5, ripples: 2, peak: 0.34, fade: 0.2,
      up: () => 0.026 + Math.random() * 0.014, down: () => 0.048 + Math.random() * 0.02 },
  },
  // A book: the cover, then the pages a beat behind it.
  chronicle: {
    paper: { centre: 1100, q: 0.7, ripples: 1, peak: 0.5, fade: 0,
      up: () => 0.01, down: () => 0.05 },
    knock: { from: 120, to: 82, level: 0.07 },
    second: { after: 0.13,
      paper: { centre: 1900, q: 0.8, ripples: 3, peak: 0.3, fade: 0.25,
        up: () => 0.012 + Math.random() * 0.01, down: () => 0.028 + Math.random() * 0.016 } },
  },
};

/**
 * How quiet the bed under a fight is, at its quietest and its loudest.
 *
 * "Very very small … and sound increase when numbers of army are large but still small."
 *
 * The band was raised twice while the files were, unknown to anyone, silent — see the note in
 * `verify-sound` about the 40 kbps encode. Once they made a noise the levels could finally be
 * judged by ear, and were: *"battle sound a bit higher"*. 18–30% against the map's 8.5% makes
 * walking into a fight an audible change of room, which is the whole job of a battle bed.
 */
const MUSIC_MIN = 0.12;
const MUSIC_MAX = 0.16;

/**
 * The five battle tracks, split by what the field deserves.
 *
 * All by Scott Buckley, CC-BY 4.0 — free for commercial use *provided the credit ships*, which
 * is why the licence page carries it. Re-encoded to mono 32 kHz 48 kbps (see
 * `test_scripts/scratch/encode-battle-music.mjs`): the studio masters are 320 kbps stereo and
 * 43 MB for the five, which is an absurd payload for a bed at five percent volume.
 *
 * The epic pair — a war march with choir and anvils, and a heroic full-orchestra cue — are held
 * for fields over ten thousand a side, so the tier the mode already draws is one the ear can
 * hear as well as read.
 */
const BATTLE_MUSIC = {
  ordinary: ['legionnaire.mp3', 'juggernaut.mp3', 'vanguard.mp3'],
  epic: ['song-of-the-forge.mp3', 'terminus.mp3'],
};


/**
 * How quiet the bed on the menu and the map is.
 *
 * Judged by ear once the files were fixed: *"menu and conquest gameplay should a bit smaller"*.
 * 8.5% is present on a phone speaker without asking to be listened to, and sits well under the
 * battle floor (0.18), so entering a fight is heard as the room getting louder rather than as a
 * track changing. Small has to mean "not the thing you are listening to", not "not there" —
 * which is what 3% and 5% turned out to mean.
 */
const AMBIENT_LEVEL = 0.065;

/**
 * The peaceful beds, and what they are.
 *
 * Three composed East-Asian pieces by hitctrl and marcelofg55 (CC-BY 3.0), trimmed to about a
 * hundred seconds with the fades baked in, so a loop is silence meeting silence rather than a seam.
 *
 * **The Hanoi field recordings are gone.** Three real Vietnamese recordings by kevp888 shipped
 * first; two were cut after listening (a solo instrument and an unaccompanied voice are foreground
 * music, not a bed) and the last, the theatre ensemble, was cut on request — *"remove Ha noi
 * sounds"*. Nothing by kevp888 ships now, so nothing credits them. `encode-ambient-music.mjs` still
 * records the sources if they are ever wanted back.
 */
export const AMBIENT_MUSIC = {
  // The front page is brief; three is more than it needs.
  menu: ['jade-kings-throne.mp3', 'misty-mountains.mp3'],
  // The map is where an hour is spent, so it plays these as a shuffled set rather than one
  // piece on repeat. A hundred seconds looped for an hour is a hundred seconds heard thirty-six
  // times.
  map: ['bamboo-forest.mp3', 'jade-kings-throne.mp3', 'misty-mountains.mp3'],
};

/** The rest between two pieces — a player putting an instrument down, not a playlist. */
const AMBIENT_GAP_MS = [4000, 9000];

/** Shuffled, and never opening on the piece that just played. */
function shuffled(pool: readonly string[], avoid?: string): string[] {
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (avoid && out.length > 1 && out[0] === avoid) [out[0], out[1]] = [out[1], out[0]];
  return out;
}

export type AmbientScene = 'menu' | 'map' | 'none';

/** FNV-1a, so a battle's key always draws the same track. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class SoundDirector {
  private ctx?: AudioContext;
  private out?: GainNode;
  private noise?: AudioBuffer;
  private enabled = readSettings().enabled;
  private musicEnabled = readSettings().music;
  /** Context time of the last voice played — see `claimVoice`. */
  private lastVoiceAt = -1;
  /** Decoded pieces by URL, a few at a time — see `BED_CACHE`. */
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  /** The peaceful bed, and which screen asked for it. */
  private ambient?: {
    bed: Bed;
    scene: AmbientScene;
    /** The shuffled running order, and where in it we are. */
    queue: string[];
    at: number;
  };
  /** Pending hand-over to the next piece, so leaving a screen can cancel it. */
  private ambientNext?: number;
  /** Asked for before the first gesture; started when one arrives. See `tap`. */
  private pendingAmbient: AmbientScene = 'none';
  /** The bed under the current fight, if one is playing. */
  private music?: {
    bed: Bed;
    file: string;
  };
  /**
   * The fight's bed, paused where the field was left. Reported: *sound always starts from the
   * beginning*. A fight left and re-entered — or the next fight on the same track — resumes from
   * where it stopped instead of decoding and starting the piece over. One paused bed, not a
   * cache of them: two fights on different tracks alternate, and the second replaces the first.
   */
  private pausedMusic?: { bed: Bed; file: string };
  /**
   * The peaceful bed, paused. The menu and the map are one piece of music as far as the player
   * is concerned — one process, in their words — so leaving the map for the menu, or stopping
   * the sound and starting it again, picks the set up where it was rather than reshuffling it.
   */
  private pausedAmbient?: { bed: Bed; scene: AmbientScene; queue: string[]; at: number };

  /**
   * **Any touch on the page counts as the gesture, not only a control.**
   *
   * The audio used to wait for an `InkUI` press, which is a narrower thing than it sounds: a
   * player who opens the game and taps the art, drags the map, or presses the one control on the
   * front page that leads straight into a run gets no music and no explanation. The browser only
   * requires *a* gesture, so this takes the first one the document sees.
   *
   * Capture phase, and never cancelled: the handler is idempotent after the first call and costs
   * a comparison per press.
   */
  listenForGestures(): void {
    if (typeof document === 'undefined') return;
    const unlock = (): void => {
      if (!this.enabled) return;
      this.ensure();
      this.startPendingAmbient();
    };
    for (const kind of ['pointerdown', 'touchend', 'keydown']) {
      document.addEventListener(kind, unlock, { capture: true, passive: true });
    }
  }

  /**
   * Built on the first press and never before it. An AudioContext created at load is a context
   * the browser refuses to start, plus a console warning for every attempt to use it.
   */
  private ensure(): boolean {
    if (!this.enabled) return false;
    if (!this.ctx) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.4;
      this.out.connect(this.ctx.destination);
      // One second of noise, generated once: every press excites from a random offset into it.
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        // Suspending the context freezes every buffer source where it is, so a fight picked up
        // after a minute away resumes where it was left — the beds need no pause of their own.
        if (document.hidden) void this.ctx.suspend();
        else if (this.enabled) void this.ctx.resume();
      });
    }
    /**
     * **`resume()` is a promise, and the bed was being started before it kept it.**
     *
     * A context built inside a user gesture is `running` in desktop Chrome but `suspended` on
     * iOS and in any browser that has not decided yet — and `resume()` resolves a tick or two
     * later. `ambientMusic` refuses to start against a context that is not running, so the press
     * that unlocked the audio was exactly the press that could not start the music: the menu
     * stayed silent, and so did the map, until the player happened to press something else.
     *
     * Reported as *"I can not hear any sound in main menu and map gameplay"* — and invisible to
     * the harness, which launches Chromium with `--autoplay-policy=no-user-gesture-required`,
     * where a fresh context is `running` on the first line. The check below now runs again on the
     * other side of the promise.
     */
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().then(() => this.startPendingAmbient());
    }
    return true;
  }

  /** Starts whatever screen asked for a bed while there was no context to play it into. */
  private startPendingAmbient(): void {
    if (!this.enabled || !this.musicEnabled || this.ambient || this.pendingAmbient === 'none') return;
    this.ambientMusic(this.pendingAmbient);
  }

  /**
   * A piece, decoded into the context and capped for looping — once per URL while it is cached.
   *
   * The callback form of `decodeAudioData`, because the promise form is missing on the Safari
   * this game still meets in the wild; the wrapper is the same promise either way.
   */
  private decode(url: string): Promise<AudioBuffer> {
    const ctx = this.ctx;
    if (!ctx) return Promise.reject(new Error('no audio context'));
    let pending = this.buffers.get(url);
    if (!pending) {
      pending = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`${response.status} for ${url}`);
          return response.arrayBuffer();
        })
        .then((bytes) => new Promise<AudioBuffer>((resolve, reject) => {
          void ctx.decodeAudioData(bytes, resolve, reject);
        }))
        .then((buffer) => capForLoop(ctx, buffer));
      pending.catch(() => this.buffers.delete(url));
      this.buffers.set(url, pending);
      this.trimBuffers();
    }
    return pending;
  }

  /** Drops the oldest decoded pieces past the cap, never one that is playing. */
  private trimBuffers(): void {
    const inUse = new Set<string>();
    if (this.ambient) inUse.add(this.ambientUrl(this.ambient.queue[this.ambient.at]));
    if (this.music) inUse.add(this.battleUrl(this.music.file));
    for (const key of this.buffers.keys()) {
      if (this.buffers.size <= BED_CACHE) return;
      if (!inUse.has(key)) this.buffers.delete(key);
    }
  }

  private ambientUrl(file: string): string {
    return `${import.meta.env.BASE_URL}audio/ambient/${file}`;
  }

  private battleUrl(file: string): string {
    return `${import.meta.env.BASE_URL}audio/battle/${file}`;
  }

  /**
   * A control was pressed. Two or three quick ripples of banded noise — a sheet moved, not a click.
   *
   * Called from every InkUI press path, so it is also the gesture that unlocks the audio context.
   */
  tap(): void {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    const dest = this.out;
    if (!ctx || !dest) return;
    // The gesture the autoplay policy was waiting for. A screen that asked for a bed before the
    // player had touched anything — the menu, every time — gets it now.
    this.startPendingAmbient();

    const when = ctx.currentTime;
    if (!this.claimVoice(when)) return;
    const ripples = 2 + (Math.random() < 0.5 ? 1 : 0);
    // A different sheet every time: the band moves about a third of an octave either way.
    this.rustle(when, {
      centre: 1500 + Math.random() * 900,
      q: 0.7,
      ripples,
      peak: 0.5,
      // Each ripple is quieter than the last — a sheet settling, not three equal taps.
      fade: 0.25,
      up: () => 0.012 + Math.random() * 0.02,
      down: () => 0.02 + Math.random() * 0.03,
    });
  }

  /**
   * A card was taken. The same paper, cut stiffer.
   *
   * Reported as *"some cards click do not have sound — not find a sound feel like you select
   * card"*, which was two faults in one sentence: the card components (`optionCard`, `CardFan`,
   * `CardStack`) never went through `InkUI`, so they were silent; and a card is not a page, so
   * lending them the desk rustle would have answered only half of it.
   *
   * What separates the two voices is what separates the objects. A sheet of paper is limp and
   * settles over three soft ripples; a card is stiff, leaves the stack in **one** motion, and
   * snaps — so this is a single ripple, a faster attack, a tighter band an octave up, and a short
   * body thump underneath for the weight of the stock. It is deliberately a shade quieter than
   * the button: a card press is usually the second half of a gesture the player already heard the
   * start of (raise, then take).
   */
  card(): void {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (!ctx) return;

    const when = ctx.currentTime;
    if (!this.claimVoice(when)) return;
    this.rustle(when, {
      centre: 2600 + Math.random() * 900,
      q: 1.6,
      ripples: 1,
      peak: 0.42,
      fade: 0,
      up: () => 0.004,
      down: () => 0.05 + Math.random() * 0.02,
    });

    // The stock's own weight: a short low knock under the snap, well below the band above so the
    // two read as one object rather than two sounds.
    this.knock(when, 190, 120, 0.12);
  }

  /**
   * A lane on the action bar — each one a different thing being opened.
   *
   * The bar builds its own buttons rather than going through `InkUI` (it needs the glyph above
   * the label, which `InkUI.button` sets beside it), so all six lanes were **silent**, which is
   * what the report pointed at.
   *
   * They could all have taken the ordinary press rustle. They do not, because these six are the
   * only controls in the game the player presses hundreds of times a run, and they are already
   * distinguishable by glyph, label and position — so the ear can carry the same information the
   * eye does, and a lane opened by muscle memory confirms itself without being looked at. Every
   * voice stays inside the one material this interface is made of: paper, in the room where the
   * paper lives.
   *
   *   build      thick plans unrolled — the lowest, heaviest sheet, with a wooden knock
   *   heroes     a portrait card flicked out of a stack — the brightest and shortest
   *   court      a memorial scroll unrolling — the longest, four ripples
   *   army       a muster roll — stiff paper over the knock of a drum skin
   *   affairs    a letter from another court — the softest, slowest, quietest
   *   chronicle  a book — the cover, then the pages, a beat apart
   *
   * Anything not on this table (pause, the run menu, `battle`) takes the ordinary press.
   */
  lane(action: string): void {
    const shape = LANE_VOICES[action];
    if (!shape) { this.tap(); return; }
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const when = ctx.currentTime;
    if (!this.claimVoice(when)) return;

    this.rustle(when, shape.paper);
    if (shape.knock) this.knock(when, shape.knock.from, shape.knock.to, shape.knock.level);
    // The book's second half: the cover, then the pages. Past the de-dupe by design — this is
    // one sound in two parts, not two sounds.
    if (shape.second) this.rustle(when + shape.second.after, shape.second.paper);
  }

  /**
   * Relief reaching the field: a drum, struck.
   *
   * Three low strokes rising for ours — the trống trận calling the column in — and two heavier,
   * slower ones for theirs. The same skin the army lane knocks on, held longer; nothing tonal,
   * because the fight already has its bed.
   */
  relief(enemy: boolean): void {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const when = ctx.currentTime;
    if (!this.claimVoice(when)) return;
    const strokes: Array<[number, number]> = enemy
      ? [[0, 0.22], [0.34, 0.26]]
      : [[0, 0.16], [0.15, 0.2], [0.3, 0.26]];
    for (const [after, level] of strokes) this.thud(when + after, enemy ? 96 : 120, enemy ? 48 : 62, level);
  }

  /** A drum skin struck: the knock's low cousin, with a body that rings for a fifth of a second. */
  private thud(when: number, from: number, to: number, level: number): void {
    const ctx = this.ctx;
    const dest = this.out;
    if (!ctx || !dest) return;
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(from, when);
    body.frequency.exponentialRampToValueAtTime(to, when + 0.09);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(level, when + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0005, when + 0.22);
    body.connect(env); env.connect(dest);
    body.start(when); body.stop(when + 0.25);
  }

  /** A short low thump: the weight of stock, a drum skin, a plank. */
  private knock(when: number, from: number, to: number, level: number): void {
    const ctx = this.ctx;
    const dest = this.out;
    if (!ctx || !dest) return;
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(from, when);
    body.frequency.exponentialRampToValueAtTime(to, when + 0.05);
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, when);
    env.gain.exponentialRampToValueAtTime(0.0005, when + 0.07);
    body.connect(env); env.connect(dest);
    body.start(when); body.stop(when + 0.1);
  }

  /**
   * The peaceful bed: the front page, and the map a run is played on.
   *
   * Quieter than the fight (`AMBIENT_LEVEL` sits under the battle floor), because this is the
   * music a player hears for most of an hour and the map is where they read. It is asked for by
   * the scene, so a scene change is the only thing that can change it.
   *
   * **A fight silences it rather than stopping it.** The battle bed and this one must never play
   * together — two pieces of music at once is noise, not layering — so `battleMusic` ducks this
   * to nothing and pauses it, and `stopBattleMusic` gives it back when the field is left. That is
   * cheaper and kinder than tearing the element down and reloading it at every fight.
   *
   * Before the first gesture there is no audio context to play into, so the request waits in
   * `pendingAmbient` and the first press starts it — the menu asks on `create`, long before the
   * player has touched anything.
   */
  ambientMusic(scene: AmbientScene): void {
    this.pendingAmbient = scene;
    if (scene === 'none') { this.stopAmbient(); return; }
    if (!this.enabled || !this.musicEnabled) return;
    // Do not build a context for the menu's request; wait for the press that is coming anyway.
    if (!this.ctx || this.ctx.state !== 'running') return;
    // One peaceful bed for the menu and the map alike: a set already playing carries on across
    // the scene change, and a set that was paused resumes where it stopped.
    if (this.ambient) {
      this.adoptAmbientScene(this.ambient, scene);
      return;
    }
    const paused = this.pausedAmbient;
    if (paused) {
      this.pausedAmbient = undefined;
      const ambient = { bed: paused.bed, scene: paused.scene, queue: paused.queue, at: paused.at };
      this.adoptAmbientScene(ambient, scene);
      this.ambient = ambient;
      if (paused.bed.ended) {
        this.advanceAmbient();
      } else {
        paused.bed.resume();
      }
      const ctx = this.ctx;
      paused.bed.gain.gain.cancelScheduledValues(ctx.currentTime);
      paused.bed.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      paused.bed.gain.gain.linearRampToValueAtTime(AMBIENT_LEVEL, ctx.currentTime + 1.5);
      return;
    }

    // **Not looped — sequenced.** Each piece plays once and hands over to the next after a short
    // rest, and when the set is exhausted it is reshuffled. One bed for the whole set: every
    // later piece is a new buffer on the same gain.
    const bed = new Bed(this.ctx);
    const ambient = { bed, scene, queue: shuffled(AMBIENT_MUSIC[scene]), at: 0 };
    bed.onEnded = () => this.advanceAmbient();
    this.ambient = ambient;
    this.playAmbientPiece(ambient);
  }

  /**
   * The bed crosses from one screen to the other without a break: the piece playing carries on,
   * and the pieces after it are the new screen's set, shuffled. The menu's two and the map's three
   * are one process to the player; only the running order behind the current piece changes.
   */
  private adoptAmbientScene(ambient: NonNullable<typeof this.ambient>, scene: AmbientScene): void {
    if (ambient.scene === scene || scene === 'none') return;
    const current = ambient.queue[ambient.at];
    const rest = shuffled(AMBIENT_MUSIC[scene].filter((file) => file !== current));
    ambient.scene = scene;
    ambient.queue = [current, ...rest];
    ambient.at = 0;
  }

  /** Decodes the piece at the running order's cursor and starts it, unless the room was taken. */
  private playAmbientPiece(ambient: NonNullable<typeof this.ambient>): void {
    const file = ambient.queue[ambient.at];
    void this.decode(this.ambientUrl(file)).then((buffer) => {
      const ctx = this.ctx;
      // The screen was left, or the set moved on, while this piece was decoding.
      if (this.ambient !== ambient || !ctx || ambient.queue[ambient.at] !== file) return;
      ambient.bed.play(buffer, false);
      // A fight already playing keeps the room: the peaceful bed stays silent until it ends.
      if (this.music) {
        ambient.bed.pause();
        return;
      }
      ambient.bed.gain.gain.cancelScheduledValues(ctx.currentTime);
      ambient.bed.gain.gain.setValueAtTime(Math.max(0.0001, ambient.bed.gain.gain.value), ctx.currentTime);
      ambient.bed.gain.gain.linearRampToValueAtTime(AMBIENT_LEVEL, ctx.currentTime + 2.5);
    }).catch(() => { /* a piece that will not decode is a piece the room does without */ });
  }

  /**
   * One piece has finished: rest a moment, then play the next.
   *
   * The rest is the point — pieces butted together read as a playlist, and a few seconds of the
   * map's own quiet between them reads as a room where somebody is playing. A fight that starts
   * during the rest simply finds nothing to duck, and the hand-over is cancelled when the screen
   * is left.
   */
  private advanceAmbient(): void {
    const ambient = this.ambient;
    if (!ambient || this.ambientNext !== undefined) return;
    const [low, high] = AMBIENT_GAP_MS;
    this.ambientNext = window.setTimeout(() => {
      this.ambientNext = undefined;
      const live = this.ambient;
      // Left the screen, or a fight took the room while we were resting.
      if (!live || live !== ambient || this.music) return;
      live.at += 1;
      if (live.at >= live.queue.length) {
        live.queue = shuffled(AMBIENT_MUSIC[live.scene as 'menu' | 'map'], live.queue[live.at - 1]);
        live.at = 0;
      }
      this.playAmbientPiece(live);
    }, low + Math.random() * (high - low));
  }

  /** Fades the peaceful bed down and lets it go. */
  /**
   * Stopping the peaceful bed pauses it: faded out over half a second, then held where it is, so
   * the next `ambientMusic` resumes the same piece from the same bar. Only a second stop while
   * one is already held disposes the older one.
   */
  private stopAmbient(): void {
    if (this.ambientNext !== undefined) {
      window.clearTimeout(this.ambientNext);
      this.ambientNext = undefined;
    }
    const ambient = this.ambient;
    this.ambient = undefined;
    if (!ambient) return;
    const ctx = this.ctx;
    if (!ctx) { ambient.bed.dispose(); return; }
    this.pausedAmbient?.bed.dispose();
    this.pausedAmbient = { bed: ambient.bed, scene: ambient.scene, queue: ambient.queue, at: ambient.at };
    ambient.bed.gain.gain.cancelScheduledValues(ctx.currentTime);
    ambient.bed.gain.gain.setValueAtTime(Math.max(0.0001, ambient.bed.gain.gain.value), ctx.currentTime);
    ambient.bed.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    window.setTimeout(() => { if (this.pausedAmbient?.bed === ambient.bed) ambient.bed.pause(); }, 700);
  }

  /** Silences the peaceful bed for the duration of a fight, or gives it back. */
  private duckAmbient(quiet: boolean): void {
    const ambient = this.ambient;
    const ctx = this.ctx;
    if (!ambient || !ctx) return;
    ambient.bed.gain.gain.cancelScheduledValues(ctx.currentTime);
    ambient.bed.gain.gain.setValueAtTime(Math.max(0.0001, ambient.bed.gain.gain.value), ctx.currentTime);
    if (quiet) {
      ambient.bed.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      window.setTimeout(() => { if (this.ambient === ambient && this.music) ambient.bed.pause(); }, 900);
    } else {
      // A piece that ran out under the fight is over; take the next one rather than replaying
      // its last moment.
      if (ambient.bed.ended) this.advanceAmbient();
      else ambient.bed.resume();
      ambient.bed.gain.gain.linearRampToValueAtTime(AMBIENT_LEVEL, ctx.currentTime + 2);
    }
  }

  /**
   * The bed under a fight, and the loudest music the game plays.
   *
   * **Very quiet by instruction, and quiet by design.** It plays at three to nine percent — under
   * the drums of the fight rather than over them, the way a film scores a battle it still wants
   * you to hear. `intensity` (0–1, the size of the field) walks it across that band: a skirmish
   * is almost subliminal, twenty thousand men is merely present. Even the top of the range is
   * well below the press effects, which peak at 0.5.
   *
   * Five tracks by Scott Buckley, CC-BY 4.0 — the credit is on the licence page, and it must
   * stay there for as long as these files ship. The epic pair is held back for the fields that
   * earn it (see `BATTLE_MUSIC`), which is the same >10,000-a-side line the mode already draws.
   *
   * Decoded into a buffer and capped at `BED_MAX_SECONDS`, not streamed through an `<audio>`
   * element: the element put a Now Playing card on the lock screen (see the file comment). The
   * cap is what keeps the decode from holding a whole four-minute track as PCM on a phone.
   *
   * The gain is assigned, not scheduled — and the difference was a bug the harness caught.
   * `setValueAtTime(0.0001, now)` schedules an event *at* now, and `setBattleIntensity` opens
   * with `cancelScheduledValues(now)`, which threw that event away and left the parameter at
   * its default of **1**. Every fight therefore opened at full volume and slid down to five
   * percent over the next second — the one thing "very very small" forbids. Measured at 0.72
   * a quarter-second into a skirmish. A plain assignment (in `Bed`) is the intrinsic value:
   * there is no event to cancel, and the ramp starts from silence.
   */
  battleMusic(trackKey: string, epic: boolean, intensity: number): void {
    if (!this.enabled || !this.musicEnabled || !this.ensure()) return;
    const ctx = this.ctx;
    if (!ctx) return;

    const pool = epic ? BATTLE_MUSIC.epic : BATTLE_MUSIC.ordinary;
    // The same fight always draws the same track: a field re-entered is the field you left, and
    // a bed that reshuffles every time the screen opens is a bed the player notices.
    const file = pool[hash(trackKey) % pool.length];

    if (this.music?.file === file) {
      this.setBattleIntensity(intensity);
      return;
    }
    this.stopBattleMusic();

    // The same track, left a moment ago: resume it where it stopped rather than start over.
    const paused = this.pausedMusic;
    if (paused && paused.file === file) {
      this.pausedMusic = undefined;
      this.music = paused;
      this.duckAmbient(true);
      paused.bed.resume();
      this.setBattleIntensity(intensity);
      return;
    }
    if (paused) {
      this.pausedMusic = undefined;
      paused.bed.dispose();
    }

    const bed = new Bed(ctx);
    this.music = { bed, file };
    // One bed at a time: the peaceful one goes quiet for as long as the fight lasts.
    this.duckAmbient(true);
    void this.decode(this.battleUrl(file)).then((buffer) => {
      // The fight was left, or another took the field, while the track was decoding.
      if (this.music?.bed !== bed) return;
      bed.play(buffer, true);
    }).catch(() => { /* a track that will not decode leaves the fight to its drums */ });
    this.setBattleIntensity(intensity);
  }

  /** Walks the bed's volume to match the size of the field. Cheap; called every beat. */
  setBattleIntensity(intensity: number): void {
    const music = this.music;
    const ctx = this.ctx;
    if (!music || !ctx) return;
    const level = MUSIC_MIN + (MUSIC_MAX - MUSIC_MIN) * Math.min(1, Math.max(0, intensity));
    // Ramped, not set: a beat that doubles the headcount must not step the volume.
    music.bed.gain.gain.cancelScheduledValues(ctx.currentTime);
    music.bed.gain.gain.setValueAtTime(Math.max(0.0001, music.bed.gain.gain.value), ctx.currentTime);
    music.bed.gain.gain.linearRampToValueAtTime(Math.max(0.0001, level), ctx.currentTime + 1.2);
  }

  /**
   * The fight is left, so the music leaves with it — the instruction was *stop if users leave*.
   *
   * Faded rather than cut, then dropped. The decoded piece stays in the small cache, so a field
   * re-entered a moment later does not decode its track again.
   */
  stopBattleMusic(): void {
    const music = this.music;
    this.music = undefined;
    // The map is still underneath the fight that just ended.
    this.duckAmbient(false);
    if (!music) return;
    const ctx = this.ctx;
    if (!ctx) { music.bed.dispose(); return; }
    // Faded, then paused — not dropped. The field re-entered picks the track up where it left.
    this.pausedMusic?.bed.dispose();
    this.pausedMusic = music;
    const end = ctx.currentTime + 0.45;
    music.bed.gain.gain.cancelScheduledValues(ctx.currentTime);
    music.bed.gain.gain.setValueAtTime(Math.max(0.0001, music.bed.gain.gain.value), ctx.currentTime);
    music.bed.gain.gain.exponentialRampToValueAtTime(0.0001, end);
    window.setTimeout(() => { if (this.pausedMusic?.bed === music.bed) music.bed.pause(); }, 550);
  }

  /**
   * One gesture, one sound.
   *
   * The silent-card report was answered by wiring a dozen bespoke surfaces, and the failure
   * mode on the other side of that is two of them firing for the same finger — a lane row
   * inside a card, a button that commits a choice — which does not read as two sounds but as
   * one muddy one. Anything within 70 ms of the last voice is that, so it is dropped. The
   * window is under the fastest deliberate double-tap (`DOUBLE_TAP_MS` is 300 in `CardFan`),
   * so a player drumming on the interface still hears every press they meant to make.
   */
  private claimVoice(when: number): boolean {
    if (when - this.lastVoiceAt < 0.07) return false;
    this.lastVoiceAt = when;
    return true;
  }

  /**
   * The shared paper graph: banded noise under a ripple envelope.
   *
   * Both voices are the same three nodes with different numbers, so they live in one place — a
   * second hand-built noise chain is how two sounds drift into two unrelated sounds.
   */
  private rustle(when: number, shape: PaperShape): void {
    const ctx = this.ctx;
    const dest = this.out;
    const buffer = this.noise;
    if (!ctx || !dest || !buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = shape.centre;
    band.Q.value = shape.q;
    // Nothing below the paper: the low end of white noise is a rumble, not a rustle.
    const floor = ctx.createBiquadFilter();
    floor.type = 'highpass';
    floor.frequency.value = 600;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    let t = when;
    for (let i = 0; i < shape.ripples; i += 1) {
      const up = shape.up();
      const down = shape.down();
      env.gain.linearRampToValueAtTime(shape.peak * (1 - i * shape.fade), t + up);
      env.gain.exponentialRampToValueAtTime(shape.peak * 0.15, t + up + down);
      t += up + down;
    }
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);

    src.connect(band); band.connect(floor); floor.connect(env); env.connect(dest);
    src.start(when, Math.random() * 0.5);
    src.stop(t + 0.1);
  }

  private store(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: this.enabled, music: this.musicEnabled }));
    } catch { /* full quota */ }
  }

  /** SOUND: everything. Off is silence, and the context is suspended with it. */
  setEnabled(value: boolean): void {
    this.enabled = value;
    this.store();
    if (!value) { this.stopBattleMusic(); this.stopAmbient(); }
    else if (this.pendingAmbient !== 'none') this.ambientMusic(this.pendingAmbient);
    if (!this.ctx) return;
    if (value) void this.ctx.resume();
    else void this.ctx.suspend();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * MUSIC: the beds alone. Off stops whatever is playing and refuses the next screen's request;
   * the paper under the thumb goes on. On picks up whatever screen last asked for a bed.
   */
  setMusicEnabled(value: boolean): void {
    this.musicEnabled = value;
    this.store();
    if (!value) { this.stopBattleMusic(); this.stopAmbient(); }
    else if (this.enabled && this.pendingAmbient !== 'none') this.ambientMusic(this.pendingAmbient);
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  /** For harnesses: no sound is provable from a screenshot. */
  debug(): {
    enabled: boolean; musicEnabled: boolean; context: string; music: string; musicGain: number;
    musicPlaying: boolean; ambient: string; ambientGain: number; ambientFile: string;
    ambientQueue: number; ambientAt: number; ambientPlaying: boolean; decoded: number;
  } {
    return {
      enabled: this.enabled,
      musicEnabled: this.musicEnabled,
      context: this.ctx?.state ?? 'none',
      music: this.music?.file ?? 'none',
      musicPlaying: this.music?.bed.playing ?? false,
      ambient: this.ambient?.scene ?? 'none',
      ambientFile: this.ambient?.queue[this.ambient.at] ?? 'none',
      // Where the piece has got to, which is the only way a harness can tell a bed that is
      // playing from one that is merely loaded.
      ambientAt: Number((this.ambient?.bed.position() ?? 0).toFixed(1)),
      ambientPlaying: this.ambient?.bed.playing ?? false,
      ambientQueue: this.ambient?.queue.length ?? 0,
      ambientGain: Number((this.ambient?.bed.gain.gain.value ?? 0).toFixed(4)),
      musicGain: Number((this.music?.bed.gain.gain.value ?? 0).toFixed(4)),
      decoded: this.buffers.size,
    };
  }
}

export const soundDirector = new SoundDirector();
// The page itself is the unlock, from the moment the module loads.
soundDirector.listenForGestures();
