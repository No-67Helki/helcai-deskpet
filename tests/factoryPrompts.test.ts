import { describe, expect, it } from 'vitest';
import { PROMPT_TEMPLATE_VERSION, STATE_FRAME_SPEC, stateSheetPrompt } from '../src/shared/factoryPrompts';
import type { IdentityProfile, PetProject } from '../src/shared/types';

const identity: IdentityProfile = {
  species: 'cat',
  coatColors: ['silver', 'white'],
  pattern: 'dark forehead and tail stripes',
  eyeColor: 'yellow-green',
  bodyType: 'compact',
  distinctiveFeatures: ['round eyes', 'thick tail'],
  summary: 'one silver shaded tabby',
};

const project: PetProject = {
  schemaVersion: 1,
  id: 'test',
  name: '赫尔财',
  species: 'cat',
  style: 'natural',
  customPrompt: '',
  analyzerId: 'openai',
  generatorId: 'openai',
  photos: {},
  identity,
  stage: 'identity-review',
  progress: 20,
  statusMessage: '',
  estimatedCost: null,
  outputDirectory: null,
    resultPreviewUrl: null,
    resultSpriteUrl: null,
    resultManifest: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('DeskPet prompt contract', () => {
  it('defines exactly 72 frames and a versioned contract', () => {
    expect(Object.values(STATE_FRAME_SPEC).reduce((sum, item) => sum + item.frames, 0)).toBe(72);
    expect(PROMPT_TEMPLATE_VERSION).toMatch(/^deskpet-/);
  });

  it('locks walk identity, grid count, gait phases and chroma background', () => {
    const prompt = stateSheetPrompt(project, identity, 'walk');
    expect(prompt).toContain('Exactly 16 chronological frames');
    expect(prompt).toContain('contact, down, passing and up');
    expect(prompt).toContain('#00ff00');
    expect(prompt).toContain(identity.summary);
  });
});
