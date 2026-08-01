import type { AppConfig, PetAnimationState, PetBehavior } from './types';

export const PET_STATES: PetAnimationState[] = ['idle', 'walk', 'sit', 'sleep', 'happy', 'dragged'];
export const PET_BEHAVIORS: PetBehavior[] = ['random', 'followMouse', 'still'];

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 2,
  pet: {
    name: '赫尔财',
    size: 192,
    width: 192,
    height: 192,
    speed: 90,
    behavior: 'random',
    idleTimeout: 8000,
    alwaysOnTop: true,
    ignoreMouse: false,
    currentPetId: null,
  },
  window: {
    startPosition: 'bottom-right',
    opacity: 1,
    lastDisplayId: null,
    lastXRatio: null,
  },
};

export const DEFAULT_IMAGE_SIZE = 384;
export const PET_PROCESSOR_VERSION = 2;

export const DEFAULT_CLIP_FPS: Record<PetAnimationState, number> = {
  idle: 8,
  walk: 16,
  sit: 10,
  sleep: 6,
  happy: 16,
  dragged: 12,
};
