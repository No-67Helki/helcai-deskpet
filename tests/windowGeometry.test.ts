import { describe, expect, it } from 'vitest';
import { clampWindowPosition, horizontalPositionRatio } from '../src/shared/windowGeometry';

describe('window geometry', () => {
  it('clamps and grounds a pet on a negative-coordinate display', () => {
    const area = { x: -1920, y: -120, width: 1920, height: 1080 };
    expect(clampWindowPosition(area, 192, 192, -2500, 800, true)).toEqual({ x: -1920, y: 768 });
    expect(clampWindowPosition(area, 192, 192, 500, -500, false)).toEqual({ x: -192, y: -120 });
  });

  it('round-trips horizontal placement as a display-relative ratio', () => {
    const area = { x: 1920, y: 0, width: 2560, height: 1440 };
    const x = 1920 + (2560 - 200) * 0.75;
    expect(horizontalPositionRatio(area, 200, x)).toBeCloseTo(0.75, 6);
  });
});
