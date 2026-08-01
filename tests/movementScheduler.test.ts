import { describe, expect, it } from 'vitest';
import { MovementScheduler } from '../src/renderer/movementScheduler';
import type { WindowSnapshot } from '../src/shared/types';

describe('movement scheduler', () => {
  it('coalesces fractional movement and allows only one request in flight', async () => {
    const calls: Array<{ dx: number; dy: number; grounded: boolean }> = [];
    const resolvers: Array<(value: WindowSnapshot) => void> = [];
    const scheduler = new MovementScheduler((dx, dy, grounded) => {
      calls.push({ dx, dy, grounded });
      return new Promise((resolve) => resolvers.push(resolve));
    }, 30);

    scheduler.queue(0.35, 0.4);
    scheduler.flush(0, true);
    scheduler.queue(0.65, 0.6);
    scheduler.flush(100, true);
    expect(calls).toEqual([{ dx: 0.35, dy: 0.4, grounded: true }]);
    expect(scheduler.pending).toMatchObject({ x: 0.65, y: 0.6, inFlight: true });

    resolvers[0]!({ x: 1, y: 2, width: 192, height: 192 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduler.flush(100, false);
    expect(calls[1]).toEqual({ dx: 0.65, dy: 0.6, grounded: false });
  });
});
