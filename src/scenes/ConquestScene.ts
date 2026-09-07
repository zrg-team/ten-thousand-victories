import Phaser from 'phaser';
import { ARENA_ROUT_HOLD_MS, ASCENT_TICK_MS } from '../game/ascentConfig';
import { INK_UI } from '../ui/InkUI';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, NEUTRAL_OWNER_ID, PLAYER_KINGDOM_ID, isDesktopSheet, uiColumnX } from '../game/constants';
import { MAP_SCALE, axialToPixel, hexCorners } from '../map/hex';
import { traceLandBoundaryLoops } from '../map/boundary';
import { advanceAscentTick } from '../systems/ascent/AscentTick';
import { rerollAscentDraft, resolveAscentPrompt } from '../systems/ascent/AscentResolver';
import { drainAscentPrompts } from '../systems/ascent/AscentState';
import { advanceCeremony } from '../systems/ascent/Ceremony';
import { offerConquestMethods } from '../systems/ascent/ConquestSystem';
import { offerEnvoyTo } from '../systems/ascent/EnvoySystem';
import { applyAppointment, offerAppointment, offerLawChoice } from '../systems/ascent/CourtLaneSystem';
import { raiseHostNow } from '../systems/ascent/AutopilotSystem';
import { recallHost, resupplyHost, setArmyOrders } from '../systems/ascent/StandingOrders';
import { raiseHostWithPlan, type MusterPlan } from '../systems/ascent/MusterSystem';
import { pushToast } from '../systems/empire/notifications';
import { disbandArmy } from '../systems/WarSystem';
import {
  advanceBattle, answerBattleMoment, delegateBattle, finishBattle, markPlayerSteered, commitBattleFormation, setBattleFormation,
  setBattleStance,
} from '../systems/ascent/BattleSystem';
import { createAscentGameState } from '../state/GameState';
import { ASCENT_HUD_HEIGHT } from '../ui/ascent/AscentHud';
import { clashDevice } from '../ui/ink/devices';
import { MapScene } from './MapScene';
import { ViewIndex } from './map/ViewIndex';
import type { BattleFormation } from '../data/ascent/formations';
import type { ArmyOrders, FieldStance } from '../state/types';

/**
 * Dragon Ascent's world scene.
 *
 * Everything visible — hex terrain, the baked static layers, fog, camera pan/zoom, land
 * hit-testing, WebGL context recovery — is inherited from `MapScene` unchanged. Only four
 * things differ in this mode, and they are the only things overridden here:
 *
 *  1. it runs `advanceAscentTick` on its own faster clock instead of the classic month tick
 *  2. it drives its own HUD scene
 *  3. tapping a province inspects it rather than issuing orders (there is no unit micro)
 *  4. it answers the ascent prompt bus
 */
export class ConquestScene extends MapScene {
  /**
   * Scene time at which the Skirmish may hand back to its setup screen.
   *
   * Stamped the first frame the fight is seen to be over, so the wait is measured from the end of
   * the fight rather than from whenever the next tick happens to land.
   */
  private arenaExitAt?: number;

  private ascentAccumulator = 0;

  /** The Ascent clock's phase — see `MapScene.tickPhase`. */
  protected override tickPhase(): number {
    return Phaser.Math.Clamp(this.ascentAccumulator / ASCENT_TICK_MS, 0, 1);
  }
  private frontMarker?: Phaser.GameObjects.Container;
  private ownershipTint?: Phaser.GameObjects.Container;
  private readonly ownershipRegions = new Map<string, { graphics: Phaser.GameObjects.Graphics; signature: string }>();
  private readonly ownershipIndex = new ViewIndex();
  private ownershipPose = '';
  /** Ownership map the tint was last painted for, so a tick with no flips repaints nothing. */
  private ownershipSignature = '';
  /** Province outlines for the foreign-ground veil; geometry is fixed within a world. */
  private readonly foreignLoopCache = new Map<string, Array<Array<{ x: number; y: number }>>>();

  constructor() {
    super('ConquestScene');
  }

  protected uiSceneKey(): string {
    return 'ConquestUIScene';
  }

  create(): void {
    this.ownershipTint = undefined;
    this.ownershipSignature = ''; this.ownershipPose = '';
    this.ownershipRegions.clear(); this.ownershipIndex.clear(); this.foreignLoopCache.clear();
    super.create();
    // `MapScene.create` does not call `refresh`, and `update` returns early while the run is
    // paused — which it is for the whole opening prompt chain. Without this first paint the
    // ownership wash would not appear until the player had already answered several cards.
    this.repaintOwnershipTint();

  }

  /** This mode ends in defeat rather than victory; otherwise the clock stops for the same reasons. */
  protected isWorldHalted(): boolean {
    return this.state.isDefeated || this.state.isPaused || this.state.isStrategyPause
      || Boolean(this.state.isAwayPause) || (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).contextLost;
  }

  update(time: number, delta: number): void {
    // The classic map re-culls in its own update; this override never called it, so a pan on the
    // Ascent map kept drawing everything that had ever been on screen.
    this.syncViewCulling();
    this.syncOwnershipCulling();
    // Deliberately not `super.update`: that drives the classic month tick, which this mode
    // replaces outright. Only the ambient-motion sync is shared.
    this.syncWorldMotion();
    if (this.isWorldHalted()) {
      return;
    }
    // Shared for the same reason: the seasonal weather drifts on the frame clock, not the tick,
    // and this mode turns the year fastest of all.
    this.seasons.update(time, delta);

    this.state.realtimeSeconds += delta / 1000;
    this.ascentAccumulator += delta;
    this.state.tickPhase = this.tickPhase();
    if (this.ascentAccumulator < ASCENT_TICK_MS) {
      return;
    }
    // Carry the remainder (capped at one tick) instead of zeroing: dropping it made every tick
    // late by the accumulated slack, and the season clock drifted behind wall time on slow frames.
    this.ascentAccumulator = Math.min(this.ascentAccumulator - ASCENT_TICK_MS, ASCENT_TICK_MS);

    // The phase the tick's own orders are given at: just past the boundary, not just before it.
    this.state.tickPhase = this.tickPhase();
    advanceAscentTick(this.state);

    // No arrival flourish here either — see `MapScene`'s note where the green-dot column used to
    // live. A host arriving is drawn by the marker that walked the road, not by a second army of
    // dots laid over it a beat later.

    // An arena fight is the whole session: once it resolves, hand the result back to the setup
    // screen rather than leaving the player on a map with one province and nothing to do. The
    // record `finishBattle` wrote is the honest account of what happened, so it is what travels.
    //
    // **But not on the same frame the fight ends.** A host that breaks is carried off the field
    // over two beats, and when the last host on a side breaks the fight resolves inside that same
    // tick — so this used to replace the whole scene while the runners were still three strides
    // into a second of animation. The player saw a line of men, then a report, and never the thing
    // in between that explains it. `ConquestUIScene.holdArenaRout` keeps the field up for the same
    // window; this waits it out rather than trusting the two to agree by accident.
    if (this.state.ascent?.arena && !this.state.ascent.activeBattle && !this.state.pendingBattle) {
      const history = this.state.ascent.battleHistory ?? [];
      const result = history[history.length - 1];
      if (result) {
        const exitAt = this.arenaExitAt ?? (this.arenaExitAt = this.time.now + ARENA_ROUT_HOLD_MS);
        if (this.time.now >= exitAt) {
          this.scene.stop(this.uiSceneKey());
          this.scene.start('BattleArenaScene', { result });
          return;
        }
      }
    }

    this.refresh();
  }

  protected refresh(): void {
    super.refresh();
    this.repaintOwnershipTint();
    this.drawFrontMarker();
  }

  /**
   * A translucent wash of the owner's colour over every claimed district.
   *
   * Terrain view draws ownership only as a thin coloured outline around each land, which is
   * legible on the classic modes' small starting map but not here: an Ascent run opens
   * surrounded by neutral districts that look exactly like the realm's own, so "which of this
   * is mine" is unanswerable at a glance. Control view answers it but throws away the terrain.
   * This fills the gap — terrain stays readable, ownership reads instantly.
   *
   * Each province keeps its own wash above the ground, in the original paint order.
   * Only changed provinces are repainted and only onscreen provinces submit geometry.
   * This avoids replaying the whole country's paths on every frame of a camera drag.
   */
  private repaintOwnershipTint(): void {
    // Control view already paints every tile in its owner's colour at full strength.
    if (this.state.mapRenderMode !== 'terrain') {
      this.ownershipTint?.setVisible(false);
      return;
    }

    const signature = this.state.lands
      .filter((land) => land.isVisible)
      .map((land) => `${land.id}:${land.ownerId}:${this.ownershipWash(land.ownerId)?.color}`)
      .join(',');
    this.ownershipTint ??= this.add.container(0, 0).setDepth(1.95);
    this.ownershipTint.setVisible(true);
    if (signature === this.ownershipSignature) return;
    this.ownershipSignature = signature;

    const live = new Set<string>();
    const hexSize = this.state.mapConfig.hexSize;
    for (const land of this.state.lands) {
      const wash = this.ownershipWash(land.ownerId);
      if (!land.isVisible || !wash) continue;
      live.add(land.id);
      const regionSignature = `${land.ownerId}:${wash.color}:${wash.alpha}`;
      const previous = this.ownershipRegions.get(land.id);
      if (previous?.signature === regionSignature) continue;
      const graphics = previous?.graphics ?? this.make.graphics({}, false);
      if (!previous) this.ownershipTint.add(graphics);
      graphics.clear();
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      const include = (points: Array<{ x: number; y: number }>) => {
        for (const p of points) { left = Math.min(left, p.x); top = Math.min(top, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y); }
      };
      if (this.mapRenderer.drawForeignWash) {
        const loops = traceLandBoundaryLoops(this.state, this.hexTileMap, (v: number) => this.wx(v), (v: number) => this.wy(v), this.foreignLoopCache, land.id);
        this.mapRenderer.drawForeignWash(graphics, loops, land.ownerId === NEUTRAL_OWNER_ID, wash.color);
        for (const loop of loops) include(loop);
      } else {
        for (const tile of this.state.hexTiles) {
          if (tile.landId !== land.id) continue;
          const pixel = axialToPixel(tile.coord, hexSize);
          const corners = hexCorners({ x: this.wx(pixel.x), y: this.wy(pixel.y) }, hexSize * MAP_SCALE * 1.02).map(([x, y]) => ({ x, y }));
          graphics.fillStyle(wash.color, wash.alpha).fillPoints(corners, true);
          include(corners);
        }
      }
      this.ownershipRegions.set(land.id, { graphics, signature: regionSignature });
      if (Number.isFinite(left)) this.ownershipIndex.set(land.id, {
        kind: 'node', object: graphics, x: (left + right) / 2, y: (top + bottom) / 2, radius: 0,
        // The printed outline wanders a few units beyond the province boundary.
        bounds: { left: left - 8, right: right + 8, top: top - 8, bottom: bottom + 8 },
        setCulled: culled => graphics.setVisible(!culled),
      });
    }
    for (const [id, region] of this.ownershipRegions) if (!live.has(id)) {
      this.ownershipIndex.remove(id); region.graphics.destroy(); this.ownershipRegions.delete(id);
    }
    // A province returning after conquest/reveal keeps the original paint order.
    let order = 0;
    for (const land of this.state.lands) {
      const region = this.ownershipRegions.get(land.id);
      if (region) this.ownershipTint.moveTo(region.graphics, order++);
    }
    this.syncOwnershipCulling(true);
  }

  private syncOwnershipCulling(force = false): void {
    if (!this.ownershipTint?.visible) return;
    const c = this.cameras.main;
    const pose = `${c.scrollX}:${c.scrollY}:${c.width}:${c.height}:${c.zoom}`;
    if (!force && pose === this.ownershipPose) return;
    this.ownershipPose = pose;
    this.ownershipIndex.apply(new Phaser.Geom.Rectangle(c.scrollX, c.scrollY, c.width / c.zoom, c.height / c.zoom), 8);
  }

  /**
   * Colour and strength of a district's wash.
   *
   * Tinting only *our* land does not work: the realm's colour is jade and the map is mostly
   * green grass, so the wash disappears into the terrain it sits on. The readable version is
   * the reverse — leave our ground untouched and bright, and mute everything we do not hold.
   * Contrast, not colour, is what makes the border obvious at a glance.
   */
  private ownershipWash(ownerId: string): { color: number; alpha: number } | undefined {
    if (ownerId === PLAYER_KINGDOM_ID) return undefined;
    // Deep and cool rather than the palette's near-black olive, which sits so close to the
    // grass and forest beneath it that even a heavy wash reads as "slightly dim", not "not
    // yours". Pushing it blue separates foreign ground by hue as well as by value.
    if (ownerId === NEUTRAL_OWNER_ID) return { color: 0x1b2436, alpha: 0.46 };

    // A rival's ground is muted like any other foreign land, then washed in their own colour
    // so "someone else's" and "*this* someone's" are two separate readings.
    const color = this.state.kingdoms.find((kingdom) => kingdom.id === ownerId)?.color;
    return { color: color ?? 0x1b2436, alpha: 0.5 };
  }

  /**
   * Rings the province the realm is marching on.
   *
   * Without it the map is decoration: the autopilot picks fights off-screen and the player
   * has no way to connect the March Order they just chose to anything happening on the
   * board. Amber means the host is holding because the odds are still too poor.
   */
  private drawFrontMarker(): void {
    this.frontMarker?.destroy();
    this.frontMarker = undefined;

    const frontId = this.state.ascent?.frontLandId;
    if (!frontId) return;
    const land = this.state.lands.find((candidate) => candidate.id === frontId);
    if (!land) return;

    const blocked = this.state.ascent?.frontBlocked ?? false;
    const color = blocked ? INK_UI.gold : INK_UI.cinnabar;

    // On the seat, not the centroid.
    //
    // A province's centroid is wherever the middle of its hexes happens to fall, which for a long
    // or bent province is bare ground some way from anything — so the mark for "we are taking this
    // place" floated in an empty field while the place itself sat elsewhere under its own name
    // label. The flag, the settlement and the march arrow all anchor on the seat; this now does too.
    const seat = this.getSettlementAnchor(land);
    const marker = this.add.container(this.wx(seat.x), this.wy(seat.y)).setDepth(60);

    // The game's full clash device, not two diagonal strokes.
    //
    // This was two concentric rings with four ticks outside them, pulsing — which is a *gunsight*,
    // and it put an FPS crosshair on a fourteenth-century woodblock map. It also said nothing about
    // what the ring meant: the same mark would have served for "inspect this", "select this" or
    // "shoot this".
    //
    // The first crossed-sabre pass still reduced to a thick red X at map scale: its blades were
    // single-colour lines with no points, grips or contrast. That is the universal cancel/error
    // mark, so it communicated the opposite of an order being carried out. The shared clash device
    // keeps the same military meaning but gives each weapon a pale blade, dark outline, guard and
    // pommel, backed by a small impact burst. It is also the mark the battle screen already uses.
    const wash = this.add.graphics();
    wash.fillStyle(color, 0.13);
    wash.fillCircle(0, 0, 27);
    wash.lineStyle(1.5, color, 0.45);
    wash.strokeCircle(0, 0, 27);
    marker.add(wash);

    const blades = this.add.graphics();
    clashDevice(blades, 0, 0, 0.88, false, color);
    marker.add(blades);
    marker.setData('mapMarkerRole', 'attack-front');
    marker.setData('attackIcon', 'clash-device');
    marker.setData('blocked', blocked);

    // The province breathes rather than the sight pulsing. Alpha only: a mark that changes *size*
    // is a mark that is aiming at something.
    this.tweens.add({
      targets: wash,
      alpha: { from: 1, to: 0.45 },
      duration: blocked ? 1400 : 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.frontMarker = marker;
  }

  protected registerUiEvents(): void {
    // Inherit the shared world controls (zoom, minimap pan, clear selection, exit to menu).
    super.registerUiEvents();

    const ui = this.scene.get(this.uiSceneKey());

    // Straight from the summary back into a fresh run, without a round trip through the menu.
    // A roguelite is judged on the run *after* the one you lost, and making the player walk
    // back out to the title screen to take it is the cheapest possible way to lose them.
    //
    // Registered through `onUi` like everything else here: this handler starts the scene that
    // registers it, so a leaked copy multiplies restarts geometrically (run N fired N of them).
    this.onUi('ui:restart-ascent', () => {
      const next = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
      // The hands-on rule carries over from the reign just ended rather than falling back to the
      // layout's default: a player who flipped it should not be flipped back by "go again".
      if (next.ascent && this.state.ascent?.hardcore !== undefined) next.ascent.hardcore = this.state.ascent.hardcore;
      this.scene.stop(this.uiSceneKey());
      this.scene.start('ConquestScene', { state: next });
    });

    /**
     * The run-over ceremony, one step per press of "go again".
     *
     * The Reckoning's primary button lands here rather than on `ui:restart-ascent`, and only the
     * *last* step of the chain restarts. A run that earned no level still gets the closing screen:
     * "go again" has to visibly mean "go again *with*", and a page that appears only on the runs
     * that levelled would teach the player nothing on the runs that did not. `advanceCeremony`
     * returns false only once every step has been walked, and then the run restarts.
     *
     * Deliberately not driven from a tick: the run is over, the state is terminal and paused, and
     * routing these cards through the decision director would let its cooldowns delay a step the
     * player is standing in front of.
     */
    this.onUi('ui:ascent-ceremony', () => {
      if (advanceCeremony(this.state)) {
        this.refresh();
        ui.events.emit('state-changed');
        return;
      }
      ui.events.emit('ui:restart-ascent');
    });

    this.onUi('ui:ascent-choice', (choiceId: string) => {
      if (resolveAscentPrompt(this.state, choiceId)) {
        this.refresh();
        ui.events.emit('state-changed');
      }
    });

    this.onUi('ui:ascent-reroll', () => {
      if (rerollAscentDraft(this.state)) {
        ui.events.emit('state-changed');
      }
    });

    // "Select a province, then choose how to take it" — reached directly from the map or the
    // Conquer lane, rather than waiting for the scheduler to raise the prompt on its own.
    this.onUi('ui:ascent-conquer', (landId: string) => {
      if (this.state.pendingAscentPrompt) return;
      if (offerConquestMethods(this.state, landId)) {
        drainAscentPrompts(this.state);
        this.refresh();
        ui.events.emit('state-changed');
      }
    });

    // The player asked for these three from a lane, so they come up on a hands-on run too — the
    // silence in `enqueueAscentPrompt` is for the director's own proposals of the same cards.
    this.onUi('ui:ascent-envoy', (kingdomId: string) => {
      if (this.state.pendingAscentPrompt) return;
      if (offerEnvoyTo(this.state, kingdomId, true)) {
        drainAscentPrompts(this.state);
        this.refresh();
        ui.events.emit('state-changed');
      }
    });

    // Raised from the Court lane: post a champion, or spend the throne's authority — the same
    // cards the decision director raises on its own clock, reached on demand instead.
    this.onUi('ui:ascent-appoint', (heroId: string) => {
      if (this.state.pendingAscentPrompt) return;
      if (offerAppointment(this.state, heroId, true)) {
        drainAscentPrompts(this.state);
        this.refresh();
        ui.events.emit('state-changed');
      }
    });

    // Raised from the Army screen: muster a host now rather than waiting for the autopilot's
    // own recruit pass, which only fires when the realm is *below* its target host count.
    // Battle orders act on the live siege rather than resolving a prompt: the fight is part of
    // the world now, so an order is a standing instruction to it, not a turn taken in it.
    // A Moment is answered on its own channel: it is not a standing order, it is one decision
    // taken once, and it must not be confused with the stance the host is holding.
    // Leaving an arena fight goes back to the setup rather than to the map behind it.
    this.onUi('ui:arena-leave', () => {
      const history = this.state.ascent?.battleHistory ?? [];
      this.scene.stop(this.uiSceneKey());
      this.scene.start('BattleArenaScene', { result: history[history.length - 1] });
    });
    this.onUi('ui:battle-moment', (answer: 'commit' | 'steady') => {
      answerBattleMoment(this.state, answer);
      // Resume at once. The Moment holds `advanceBattle`, so after the answer the fight used to
      // stand still until the NEXT economy tick came round — up to 3.5 seconds of a frozen field
      // right after a decision, several times a fight (user report: "small delays, frequently").
      // The beats this produces are the very ones the hold was owing; the view still drains them
      // one per interval, so nothing jumps.
      advanceBattle(this.state);
      ui.events.emit('state-changed');
    });
    // Two dials on two clocks, plus the two exits. Reserve and rally left this channel entirely:
    // with their buttons gone from the dock they are questions the fight asks, not orders it takes.
    this.onUi('ui:battle-order', (order: string) => {
      if (order.startsWith('stance:')) {
        // The commander hands over the tempo — and only the tempo. See `markPlayerSteered`: one
        // flag for both dials meant a single tap cost the player their shape play, their reserve
        // and their rally as well, none of which they had asked to take.
        markPlayerSteered(this.state, 'stance');
        setBattleStance(this.state, order.slice(7) as FieldStance);
      } else if (order.startsWith('formation:')) {
        markPlayerSteered(this.state, 'formation');
        setBattleFormation(this.state, order.slice(10) as BattleFormation);
      } else if (order === 'commit') {
        // Dồn sức: a second pip wagered on the held shape. Steering, by any name.
        markPlayerSteered(this.state, 'formation');
        commitBattleFormation(this.state);
      } else if (order === 'leave') {
        // Hand the rest of it over and step away. `delegateBattle` hands over the *remainder* —
        // the battlefield keeps running and the player can take the field back at any point — so
        // leaving is a way of playing rather than a way of skipping.
        delegateBattle(this.state, true);
        ui.events.emit('ui:battle-leave');
      }
      // "Leave it to my generals" hands back *this* fight. It used to flip the run-wide
      // `autoResolveBattles` as well, so one tap on the way out of a lost cause silently
      // disabled the mode's best screen for the rest of the run; Settings still offers that.
      // Handing over is not conceding. `finishBattle` ended the engagement on the spot and threw
      // away everything after it — the aftermath, the spoils, the chance to take the field back.
      else if (order === 'auto') delegateBattle(this.state, true);
      else if (order === 'take-field') delegateBattle(this.state, false);
      ui.events.emit('state-changed');
    });
    // Standing orders, recall and resupply act on one host and refresh at once — an order given
    // is a march started, not a wish recorded for the next tick.
    this.onUi('ui:ascent-army-orders', (payload: { armyId: string; orders: ArmyOrders }) => {
      if (this.state.pendingAscentPrompt) return;
      if (setArmyOrders(this.state, payload.armyId, payload.orders)) {
        this.refresh();
        ui.events.emit('state-changed');
      }
    });
    this.onUi('ui:ascent-army-recall', (armyId: string) => {
      if (this.state.pendingAscentPrompt) return;
      const result = recallHost(this.state, armyId);
      if (!result.ok && result.reason) pushToast(this.state, result.reason, 'threat');
      this.refresh();
      ui.events.emit('state-changed');
    });
    this.onUi('ui:ascent-army-resupply', (armyId: string) => {
      if (this.state.pendingAscentPrompt) return;
      const result = resupplyHost(this.state, armyId);
      if (!result.ok && result.reason) pushToast(this.state, result.reason, 'threat');
      this.refresh();
      ui.events.emit('state-changed');
    });
    this.onUi('ui:ascent-disband-army', (armyId: string) => {
      if (this.state.pendingAscentPrompt) return;
      if (disbandArmy(this.state, armyId)) {
        this.refresh();
        ui.events.emit('state-changed');
      }
    });
    this.onUi('ui:ascent-raise-host', (plan?: MusterPlan) => {
      if (this.state.pendingAscentPrompt) return;
      // With a plan the form's figures are mustered as given; without one (the old one-tap
      // path) the autopilot's own sizing applies.
      const result = plan ? raiseHostWithPlan(this.state, plan) : { ok: raiseHostNow(this.state) };
      if (!result.ok && result.reason) pushToast(this.state, result.reason, 'threat');
      this.refresh();
      ui.events.emit('state-changed');
    });

    // A posting chosen on the hero picker: a seat, a province, the command of a host, or the
    // bench. The same `applyAppointment` the appointment card resolves through.
    this.onUi('ui:ascent-assign', (payload: { heroId: string; optionId: string }) => {
      if (this.state.pendingAscentPrompt) return;
      applyAppointment(this.state, payload.heroId, payload.optionId);
      this.refresh();
      ui.events.emit('state-changed');
    });

    this.onUi('ui:ascent-law', () => {
      if (this.state.pendingAscentPrompt) return;
      if (offerLawChoice(this.state, true)) {
        drainAscentPrompts(this.state);
        this.refresh();
        ui.events.emit('state-changed');
      }
    });
  }

  /**
   * Read-only inspection. Deliberately does NOT call `super.selectLand`: the base
   * implementation doubles as the "tap army, then tap land" move command, and this mode has
   * no manual marching. Tapping focuses a province so the HUD can describe it — and, for
   * ground the realm does not hold, offers the way into its acquisition methods.
   */
  /**
   * The name plate is the target here, because nothing in this mode marches by tap.
   *
   * Reported: *click to land UI/UX very bad and hard to click.* Selecting by hex sounds generous
   * and is not — the target is an irregular patch with no edge the eye can see, it fights the pan
   * gesture over every pixel of the map, and on a phone it is guesswork which of two neighbours a
   * thumb landed in. The plate is the one mark on the map that is unambiguously *about* one
   * province, and it has a border drawn round it.
   *
   * The classic modes keep the ground, and that is not timidity: there, tapping a province is half
   * of *tap the army, then tap where it marches*, so the ground has to stay the target or the
   * order cannot be given. This mode's `selectLand` is a read-only inspect and owes it nothing.
   *
   * The ground still answers for a province whose plate is **not on the screen** — fog hides one,
   * and so does the low tier's zoom LOD, which drops labels wholesale (`lodDropsLabels`). A rule
   * that left some provinces with no way in at all would be a worse fault than the one it fixes.
   */
  protected resolveTapLand(worldX: number, worldY: number): string | undefined {
    // The name first, and the name means the province it names — a plate sits below its settlement
    // and is very often standing on a neighbour's hexes, so the ground under it is the wrong answer.
    const named = this.landAtLabel(worldX, worldY);
    if (named) return named;
    // Ground only where the plate the player is meant to aim at is not on the screen at all.
    const beneath = this.findLandIdAt(worldX, worldY);
    return beneath && !this.hasVisibleLabel(beneath) ? beneath : undefined;
  }

  /**
   * Whether the HUD scene currently has a sheet over the map.
   *
   * `openPromptKey` is the one field every overlay passes through — `beginOverlay` sets it and
   * `releaseOverlay` clears it — so prompts, lanes and the battle screen are all covered by asking
   * it once, and a new kind of sheet is covered the day it is written.
   */
  private overlayIsOpen(): boolean {
    const ui = this.scene.get(this.uiSceneKey()) as Phaser.Scene & {
      openPromptKey?: string;
      modalLayer?: Phaser.GameObjects.Container;
    };
    if (!ui?.scene?.isActive()) return false;
    // Both, and the second one is the safety net. `openPromptKey` is reconciled by `refresh` — a
    // card leaving the screen sets it back to `''` on the next pass — but a deaf map is a far
    // worse failure than a stray selection, so the key is only believed while there is actually
    // furniture on the modal layer to justify it. A key left set with nothing drawn cannot lock
    // the player out of their own map.
    return Boolean(ui.openPromptKey) && (ui.modalLayer?.length ?? 0) > 0;
  }

  protected selectLand(landId: string): void {
    this.state.selectedLandId = this.state.selectedLandId === landId ? undefined : landId;
    this.state.selectedArmyId = undefined;
    this.refresh();
    this.scene.get(this.uiSceneKey()).events.emit('state-changed');
  }

  /**
   * This mode's chrome geometry: the HUD strip at the top and the inspect card at the
   * bottom. MapScene's version guards bands that belong to the classic HUD (bottom sheet,
   * action bar, minimap) which ConquestUIScene lays out differently.
   */
  protected isScreenPointOverFixedUi(x: number, y: number): boolean {
    // **An open sheet takes the whole screen, and the map hears nothing.**
    //
    // Reported: *click/tap on popup also tap/click on the buttons behind — easy to wrong click.*
    // Every band below is a *rectangle*, and the modal layer is not one: a prompt, a lane or the
    // battle screen covers the map completely, and none of these bands knew that. So a tap meant
    // for a card also reached the map underneath, selected whatever province was there, and the
    // player closed the sheet to find a different district selected — or worse, tapped twice
    // because the first press appeared to do nothing.
    //
    // It cannot be fixed on the modal's own side. `MapScene` listens on the **canvas element**
    // (`this.game.canvas.addEventListener('pointerdown', …)`), not through Phaser's display list,
    // so no amount of interactive furniture drawn over it in another scene can consume the event.
    // The sheet has to be asked about here instead.
    if (this.overlayIsOpen()) return true;

    // `performance.now`, matching what writes it. Compared against `Date.now` this was a
    // thirteen-digit number against a five-digit one, so the suppression window never once
    // applied and a tap that dismissed a marker also selected the land beneath it.
    if (performance.now() < (window.__suppressMapInputUntil ?? 0)) return true;
    // Everything below is in the sheet's own units: the HUD scene's camera covers the sheet on
    // every layout, and its published rectangles are sheet numbers.
    const published = (window.__hudTapBounds ?? []).some((rect) => (
      x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
    ));
    // The top bar. On the phone the strip and the readout stack in the column; on the desktop
    // they stand side by side in one 52-high band across the whole sheet, with the advice and the
    // pause/menu cluster at its right end (`conquest/shell.ts`) — a bar, the width of the window.
    const desktop = isDesktopSheet();
    if (y <= (desktop ? HEADER_HEIGHT : ASCENT_HUD_BOTTOM) && (desktop || x <= GAME_WIDTH)) return true;
    // The action bar is always present, so its band is fixed UI whether or not a province
    // is selected — otherwise a tap on "Court" also drags the map underneath it.
    if (y >= ASCENT_ACTION_BAR_TOP) return true;
    // The province card, docked at `uiColumnX()` on the desktop and at the column's foot on the phone.
    if (y >= ASCENT_INSPECT_TOP && this.state.selectedLandId && x >= uiColumnX()) return true;
    // The zoom/mode stack floats over open map, and it moves: it sits above the inspect card
    // when a province is selected and lower when none is. A fixed band would guard the wrong
    // pixels half the time, so the HUD publishes where it actually drew them. Without this the
    // tap-to-select handler here claimed the press, selected the province underneath, and the
    // re-render destroyed the button before its release could fire — the buttons were visible,
    // pressable, and inert.
    return published;
  }
}

/**
 * Bottom edge of the HUD strip; taps above this belong to the HUD, not the map.
 *
 * Derived rather than typed: as a hand-kept 104 against a band that actually closed at 110, the
 * bottom six pixels of the readout passed taps through to the map underneath it — and the number
 * had to be remembered every time either band's height moved.
 */
export const ASCENT_HUD_BOTTOM = HEADER_HEIGHT + ASCENT_HUD_HEIGHT;
/** Top edge of the province inspect card, shown only while a province is selected. */
export const ASCENT_INSPECT_TOP = 654;
/** Top edge of the standing action bar. Always fixed UI, selection or not. */
export const ASCENT_ACTION_BAR_TOP = GAME_HEIGHT - ACTION_BAR_HEIGHT;
