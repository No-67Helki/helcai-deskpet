import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/shared/defaults';
import { BehaviorController } from '../src/renderer/behaviorController';

function followDistance(fps: number): number {
  const config = structuredClone(DEFAULT_CONFIG);
  config.pet.behavior = 'followMouse';
  config.pet.speed = 120;
  const behavior = new BehaviorController(config, () => 0.5);
  behavior.setWindow(0, 0, 192, 192);
  behavior.setMouse(2000, 100);
  let distance = 0;
  const delta = 1000 / fps;
  for (let frame = 0; frame < fps * 5; frame++) {
    distance += behavior.update(delta).move.x * delta / 1000;
  }
  return distance;
}

describe('grounded behavior controller', () => {
  it('keeps movement speed consistent across refresh rates', () => {
    expect(followDistance(60)).toBeCloseTo(followDistance(120), 0);
    expect(followDistance(120)).toBeCloseTo(followDistance(144), 0);
  });

  it('never emits vertical movement in random mode', () => {
    const behavior = new BehaviorController(structuredClone(DEFAULT_CONFIG), () => 0.9);
    for (let index = 0; index < 2000; index++) {
      expect(behavior.update(16).move.y).toBe(0);
    }
  });

  it('stops immediately in still mode', () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.pet.behavior = 'still';
    const snapshot = new BehaviorController(config).update(1000);
    expect(snapshot.state).toBe('idle');
    expect(snapshot.move).toEqual({ x: 0, y: 0 });
  });
});
