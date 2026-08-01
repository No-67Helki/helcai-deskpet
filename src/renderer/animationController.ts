import type { PetAnimationState } from '../shared/types';

export class AnimationController {
  private frame = 0;
  private elapsed = 0;
  private state: PetAnimationState = 'idle';

  setState(state: PetAnimationState): void {
    if (this.state === state) return;
    this.state = state;
    this.frame = 0;
    this.elapsed = 0;
  }

  update(deltaMs: number, fps: number): void {
    this.elapsed += deltaMs;
    const frameMs = 1000 / Math.max(1, fps);
    while (this.elapsed >= frameMs) {
      this.elapsed -= frameMs;
      this.frame++;
    }
  }

  getFrame(): number {
    return this.frame;
  }
}
