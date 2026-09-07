/** Fixed render cadence with a separate, exact elapsed-time clock. No time is counted twice. */
export class FramePacer {
  private previous?: number;
  private phase = 0;
  private elapsed = 0;
  reset(): void { this.previous = undefined; this.phase = 0; this.elapsed = 0; }
  next(time: number, fps: number): number | undefined {
    if (this.previous === undefined || time < this.previous) { this.previous = time; return 0; }
    const delta = Math.max(0, time - this.previous); this.previous = time;
    this.elapsed += delta; this.phase += delta;
    const interval = fps > 0 ? 1000 / fps : 0;
    if (interval && this.phase + 0.25 < interval) return undefined;
    if (interval) this.phase = Math.max(0, this.phase - Math.floor((this.phase + 0.25) / interval) * interval); else this.phase = 0;
    const result = this.elapsed; this.elapsed = 0;
    return result;
  }
}
