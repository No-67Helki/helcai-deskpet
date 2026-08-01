import type { WindowSnapshot } from '../shared/types';

export type MoveWindow = (dx: number, dy: number, grounded: boolean) => Promise<WindowSnapshot>;

export class MovementScheduler {
  private pendingX = 0;
  private pendingY = 0;
  private inFlight = false;
  private lastSentAt = -Infinity;
  private idleResolvers: Array<() => void> = [];

  constructor(
    private readonly moveWindow: MoveWindow,
    private readonly minIntervalMs = 1000 / 60,
    private readonly onPosition?: (snapshot: WindowSnapshot) => void,
  ) {}

  queue(dx: number, dy: number): void {
    if (Number.isFinite(dx)) this.pendingX += dx;
    if (Number.isFinite(dy)) this.pendingY += dy;
  }

  flush(now: number, grounded: boolean): void {
    if (this.inFlight || now - this.lastSentAt < this.minIntervalMs) return;
    if (Math.abs(this.pendingX) < 0.01 && Math.abs(this.pendingY) < 0.01) return;
    const dx = this.pendingX;
    const dy = this.pendingY;
    this.pendingX = 0;
    this.pendingY = 0;
    this.inFlight = true;
    this.lastSentAt = now;
    void this.moveWindow(dx, dy, grounded)
      .then((snapshot) => this.onPosition?.(snapshot))
      .catch((error: unknown) => console.error('Failed to move DeskCat window:', error))
      .finally(() => {
        this.inFlight = false;
        this.resolveIdleIfNeeded();
      });
  }

  async drain(grounded: boolean): Promise<void> {
    while (this.inFlight || Math.abs(this.pendingX) >= 0.01 || Math.abs(this.pendingY) >= 0.01) {
      this.flush(performance.now() + this.minIntervalMs, grounded);
      await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
    }
  }

  get pending(): { x: number; y: number; inFlight: boolean } {
    return { x: this.pendingX, y: this.pendingY, inFlight: this.inFlight };
  }

  private resolveIdleIfNeeded(): void {
    const resolvers = this.idleResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }
}
