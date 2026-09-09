/** Launch selector and passive monitor. The compatibility name is retained for scene callers. */
import Phaser from 'phaser';
import { getGraphicsMode, getGraphicsQuality, renderScaleNow, requestRenderScale, setActiveRung, setSessionQuality } from './graphicsQuality';
import { RUNGS, RUNG_STORAGE_KEY, rungForTier, type Rung, type RungId } from './qualityRungs';
import { activePaperSheets } from '../ui/ink/paperSheet';
import { cachedLaunchProfile, percentile, recommendNextLaunch, type AutoProfile } from './launchGraphics';
import { FramePacer } from './framePacer';
import { softwareRenderer } from './renderProfile';

let fullRefresh: boolean | undefined;
export function fullRefreshEnabled(): boolean { if (fullRefresh !== undefined) return fullRefresh; try { return fullRefresh = localStorage.getItem('mandate:graphics:refresh:v1') === 'display'; } catch { return fullRefresh = false; } }
export function setFullRefresh(enabled: boolean): void { fullRefresh = enabled; try { localStorage.setItem('mandate:graphics:refresh:v1', enabled ? 'display' : '60'); } catch { /* private mode */ } }
export class QualityLadder {
  private rung: Rung;
  private pinned: boolean;
  private sceneCap?: number;
  private pacer = new FramePacer();
  private holdLeft = 5000;
  private stepT0 = 0;
  private samples: number[] = [];
  private work: number[] = [];
  private elapsed = 0;
  private hot = 0;
  private calibrating = false;
  private enabled: boolean;
  constructor(private game: Phaser.Game) {
    const query = new URLSearchParams(window.location.search);
    this.enabled = query.get('capture') !== '1' && query.get('noladder') !== '1';
    this.pinned = getGraphicsMode() !== 'auto';
    try { localStorage.removeItem(RUNG_STORAGE_KEY); } catch { /* obsolete automatic rungs */ }
    const chosen = this.pinned ? rungForTier(getGraphicsQuality()).id : cachedLaunchProfile() ?? 'medium';
    this.rung = RUNGS.find(r => r.id === chosen)!;
    // A software rasteriser is not a signal about the device, it is a failure to get a GPU at all:
    // the whole game is drawn on the CPU and no tier saves it. Pin the cheapest rung and say so.
    // Checked here rather than in `calibrateGraphics`, which only runs on Auto and only when no
    // profile is cached — a player who pinned a tier, or who has played before, is never probed.
    const software = this.enabled ? softwareRenderer(game) : undefined;
    if (software) {
      this.rung = RUNGS.find(r => r.id === 'low-30') ?? this.rung;
      this.pinned = true;
      window.__softwareRenderer = software;
      console.warn(`[graphics] software renderer (${software}) — pinned to ${this.rung.id}`);
    }
    this.apply(this.rung);
    const installPacing = () => queueMicrotask(() => {
      const callback = game.loop.callback;
      game.loop.callback = (time: number, _delta: number) => {
        const delivered = this.pacer.next(time, this.calibrating ? 0 : this.targetFps());
        if (delivered !== undefined) callback(time, delivered);
      };
    });
    if (game.isRunning) installPacing(); else game.events.once(Phaser.Core.Events.READY, installPacing);
    game.events.on(Phaser.Core.Events.PRE_STEP, this.pre, this);
    game.events.on(Phaser.Core.Events.POST_RENDER, this.post, this);
    game.events.on(Phaser.Core.Events.RESUME, this.resume, this);
    game.events.on(Phaser.Core.Events.VISIBLE, this.resume, this);
    game.events.once(Phaser.Core.Events.DESTROY, () => {
      game.events.off(Phaser.Core.Events.PRE_STEP, this.pre, this); game.events.off(Phaser.Core.Events.POST_RENDER, this.post, this);
      game.events.off(Phaser.Core.Events.RESUME, this.resume, this); game.events.off(Phaser.Core.Events.VISIBLE, this.resume, this);
    });
  }
  private resume(): void { this.pacer.reset(); this.forgetWindow(5000); }
  state() { return { rung: this.rung.id, ceiling: this.pinned ? this.rung.id : 'high', scale: renderScaleNow(), hot: this.hot, calm: 0,
    stepsDown: 0, stepsUp: 0, enabled: this.enabled, pinned: this.pinned, fps: this.targetFps(), calibrating: this.calibrating }; }
  force(id: RungId): void { const rung = RUNGS.find(r => r.id === id); if (rung) { this.pinned = true; this.apply(rung); } }
  useAuto(profile: AutoProfile = cachedLaunchProfile() ?? 'medium'): void { this.pinned = false; this.apply(RUNGS.find(r => r.id === profile)!); }
  calibration(active: boolean): void { this.calibrating = active; this.pacer.reset(); this.forgetWindow(5000); }
  targetFps(): number { return Math.min(this.sceneCap ?? Infinity, this.rung.fps < 60 ? this.rung.fps : fullRefreshEnabled() ? Infinity : 60); }
  hold(ms: number): void { this.holdLeft = Math.max(this.holdLeft, ms); }
  forgetWindow(ms: number): void { this.hold(ms); this.samples = []; this.work = []; this.elapsed = 0; }
  markSceneStart(): void { this.forgetWindow(1500); }
  setSceneCap(fps?: number): void { if (fps !== this.sceneCap) { this.sceneCap = fps; this.pacer.reset(); this.forgetWindow(1500); } }
  private apply(rung: Rung): void {
    this.rung = rung; setSessionQuality(rung.id === 'high' ? 'high' : rung.id.startsWith('low') ? 'low' : 'medium');
    setActiveRung(rung); requestRenderScale(rung.scale);
    for (const sheet of activePaperSheets()) sheet.setVisible(rung.paper);
    this.pacer.reset(); this.forgetWindow(3000);
  }
  private pre(_time: number, delta: number): void {
    this.stepT0 = performance.now();
    if (!this.enabled || this.pinned || this.calibrating || document.hidden) return;
    if (this.holdLeft > 0) { this.holdLeft -= delta; return; }
    this.samples.push(delta); this.elapsed += delta;
  }
  private post(): void {
    if (!this.enabled || this.pinned || this.calibrating || this.holdLeft > 0 || document.hidden) return;
    this.work.push(performance.now() - this.stepT0);
    if (this.elapsed < 10000) return;
    const budget = 1000 / Math.min(60, this.targetFps());
    const slow = percentile(this.samples, .95) > budget * 1.3 || percentile(this.work, .95) > budget * .9;
    this.hot = slow ? this.hot + 1 : 0;
    if (this.hot >= 3 && this.rung.id !== 'clarity') recommendNextLaunch(this.rung.id === 'high' ? 'medium' : 'clarity');
    this.samples = []; this.work = []; this.elapsed = 0;
  }
}
let installed: QualityLadder | undefined;
export function installQualityLadder(game: Phaser.Game): QualityLadder { installed ??= new QualityLadder(game); return installed; }
export function qualityLadder(): QualityLadder | undefined { return installed; }
export { rungForTier };
