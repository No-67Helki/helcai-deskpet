import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/shared/defaults';
import { mergeConfig, sanitizeConfig } from '../src/shared/validation';

describe('config validation', () => {
  it('drops invalid values and keeps safe defaults', () => {
    const config = sanitizeConfig({
      pet: {
        name: '',
        size: 12,
        speed: 999,
        behavior: 'teleport',
        ignoreMouse: 'yes',
      },
      window: {
        startPosition: 'middle',
        opacity: 9,
      },
    });

    expect(config.pet.name).toBe(DEFAULT_CONFIG.pet.name);
    expect(config.pet.size).toBe(64);
    expect(config.pet.speed).toBe(480);
    expect(config.pet.behavior).toBe(DEFAULT_CONFIG.pet.behavior);
    expect(config.pet.ignoreMouse).toBe(false);
    expect(config.window.startPosition).toBe(DEFAULT_CONFIG.window.startPosition);
    expect(config.window.opacity).toBe(1);
  });

  it('deep merges pet and window patches', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      pet: { ...DEFAULT_CONFIG.pet, behavior: 'still' },
      window: { ...DEFAULT_CONFIG.window, opacity: 0.5 },
    });

    expect(merged.pet.behavior).toBe('still');
    expect(merged.pet.size).toBe(DEFAULT_CONFIG.pet.size);
    expect(merged.window.opacity).toBe(0.5);
  });

  it('migrates legacy pixels-per-frame speed to pixels per second', () => {
    const config = sanitizeConfig({ pet: { speed: 1.5, width: 384, height: 384 } });
    expect(config.schemaVersion).toBe(2);
    expect(config.pet.speed).toBe(90);
    expect(config.pet.width).toBe(DEFAULT_CONFIG.pet.size);
    expect(config.pet.height).toBe(DEFAULT_CONFIG.pet.size);
  });
});
