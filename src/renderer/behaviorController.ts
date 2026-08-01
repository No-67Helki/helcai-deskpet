import type { AppConfig, PetAnimationState, Point } from '../shared/types';

export interface BehaviorSnapshot {
  state: PetAnimationState;
  facing: 1 | -1;
  /** Velocity in CSS pixels per second. */
  move: Point;
}

export class BehaviorController {
  private state: PetAnimationState = 'idle';
  private facing: 1 | -1 = 1;
  private stateMs = 0;
  private stateDurationMs = 0;
  private nextIdleDecisionMs = 2500;
  private mouse: Point = { x: 0, y: 0 };
  private windowPosition: Point = { x: 0, y: 0 };
  private windowSize: Point = { x: 192, y: 192 };

  constructor(
    private config: AppConfig,
    private readonly random: () => number = Math.random,
  ) {
    this.scheduleIdleDecision();
  }

  setConfig(config: AppConfig): void {
    const behaviorChanged = this.config.pet.behavior !== config.pet.behavior;
    this.config = config;
    if (behaviorChanged) {
      this.setState('idle');
      this.scheduleIdleDecision();
    }
  }

  setWindow(x: number, y: number, width = this.windowSize.x, height = this.windowSize.y): void {
    this.windowPosition = { x, y };
    this.windowSize = { x: width, y: height };
  }

  setMouse(x: number, y: number): void {
    this.mouse = { x, y };
  }

  setState(state: PetAnimationState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateMs = 0;
    if (state === 'happy') this.stateDurationMs = 1200;
  }

  wake(): void {
    if (this.state === 'sleep' || this.state === 'sit') this.setState('idle');
    this.scheduleIdleDecision();
  }

  reverseDirection(): void {
    this.facing = this.facing === 1 ? -1 : 1;
  }

  update(deltaMs: number): BehaviorSnapshot {
    this.stateMs += Math.max(0, deltaMs);

    if (this.state === 'dragged') return this.snapshot(0);
    if (this.state === 'happy') {
      if (this.stateMs >= this.stateDurationMs) {
        this.setState('idle');
        this.scheduleIdleDecision();
      }
      return this.snapshot(0);
    }
    if (this.config.pet.behavior === 'still') {
      if (this.state !== 'idle') this.setState('idle');
      return this.snapshot(0);
    }
    if (this.config.pet.behavior === 'followMouse') return this.followMouse();
    return this.randomWalk();
  }

  private followMouse(): BehaviorSnapshot {
    if (this.state === 'sleep' || this.state === 'sit') this.setState('idle');
    const centerX = this.windowPosition.x + this.windowSize.x / 2;
    const dx = this.mouse.x - centerX;
    const startThreshold = Math.max(110, this.windowSize.x * 0.72);
    const stopThreshold = startThreshold * 0.48;
    if (Math.abs(dx) > (this.state === 'walk' ? stopThreshold : startThreshold)) {
      this.setState('walk');
      this.facing = dx >= 0 ? 1 : -1;
      return this.snapshot(this.facing * this.config.pet.speed * 1.15);
    }
    if (this.state === 'walk') {
      this.setState('idle');
      this.scheduleIdleDecision();
    }
    return this.snapshot(0);
  }

  private randomWalk(): BehaviorSnapshot {
    if (this.state === 'walk') {
      if (this.stateMs >= this.stateDurationMs) {
        this.setState('idle');
        this.scheduleIdleDecision();
        return this.snapshot(0);
      }
      return this.snapshot(this.facing * this.config.pet.speed);
    }

    if (this.state === 'sit' || this.state === 'sleep') {
      if (this.stateMs >= this.stateDurationMs) {
        this.setState('idle');
        this.scheduleIdleDecision();
      }
      return this.snapshot(0);
    }

    if (this.stateMs >= this.nextIdleDecisionMs) {
      const choice = this.random();
      const longIdle = this.nextIdleDecisionMs >= this.config.pet.idleTimeout * 0.75;
      if (longIdle && choice < 0.18) {
        this.setState('sleep');
        this.stateDurationMs = 9000 + this.random() * 7000;
      } else if (longIdle && choice < 0.42) {
        this.setState('sit');
        this.stateDurationMs = 3800 + this.random() * 3200;
      } else {
        this.startWalk();
      }
    }
    return this.snapshot(0);
  }

  private startWalk(): void {
    this.facing = this.random() < 0.5 ? -1 : 1;
    this.setState('walk');
    this.stateDurationMs = 1200 + this.random() * 2600;
  }

  private scheduleIdleDecision(): void {
    const minimum = 1800;
    const span = Math.max(2500, this.config.pet.idleTimeout * 1.15);
    this.nextIdleDecisionMs = minimum + this.random() * span;
  }

  private snapshot(vx: number): BehaviorSnapshot {
    return { state: this.state, facing: this.facing, move: { x: vx, y: 0 } };
  }
}
