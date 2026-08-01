import { describe, expect, it } from 'vitest';
import { PET_STATES } from '../src/shared/defaults';
import { parsePetManifest, validateSpriteDimensions } from '../src/shared/petManifest';

function oldStates(): Record<string, { start: number; end: number }> {
  return Object.fromEntries(PET_STATES.map((state, index) => [state, { start: index, end: index }]));
}

describe('pet manifest v2', () => {
  it('upgrades a complete v1 manifest and supplies clip timing and anchor', () => {
    const manifest = parsePetManifest({
      id: 'legacy',
      name: 'Legacy',
      kind: 'sprite-sheet',
      sourceImage: 'sprite.png',
      previewImage: 'preview.png',
      frameWidth: 128,
      frameHeight: 128,
      columns: 6,
      totalFrames: 6,
      states: oldStates(),
    });
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.clips.walk.fps).toBeGreaterThan(1);
    expect(manifest.anchor).toEqual({ x: 64, y: 128 });
  });

  it('rejects incomplete animation states and invalid image dimensions', () => {
    const states = oldStates();
    delete states.dragged;
    expect(() => parsePetManifest({
      id: 'bad', name: 'Bad', kind: 'sprite-sheet', sourceImage: 'sprite.png', previewImage: 'preview.png',
      frameWidth: 128, frameHeight: 128, columns: 6, totalFrames: 6, states,
    })).toThrow(/帧区间/);

    const manifest = parsePetManifest({
      id: 'ok', name: 'OK', kind: 'sprite-sheet', sourceImage: 'sprite.png', previewImage: 'preview.png',
      frameWidth: 128, frameHeight: 128, columns: 6, totalFrames: 6, states: oldStates(),
    });
    expect(() => validateSpriteDimensions(manifest, 512, 128)).toThrow(/尺寸/);
  });

  it('rejects resource paths that escape the pet directory', () => {
    expect(() => parsePetManifest({
      id: 'bad', name: 'Bad', kind: 'single-image', sourceImage: '../secret.png', previewImage: 'preview.png',
    })).toThrow(/安全/);
  });

  it('preserves positive walk-cycle distance metadata', () => {
    const manifest = parsePetManifest({
      schemaVersion: 2,
      id: 'motion', name: 'Motion', kind: 'sprite-sheet', sourceImage: 'sprite.png', previewImage: 'preview.png',
      frameWidth: 128, frameHeight: 128, columns: 6, totalFrames: 6, clips: oldStates(),
      motion: { walkDistancePerCycle: 200 },
    });
    expect(manifest.motion?.walkDistancePerCycle).toBe(200);
  });
});
