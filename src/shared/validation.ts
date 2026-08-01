import { DEFAULT_CONFIG, PET_BEHAVIORS } from './defaults';
import type { AppConfig, PetBehavior, StartPosition } from './types';

const START_POSITIONS: StartPosition[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringOr(value: unknown, fallback: string, maxLength = 64): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : fallback;
}

export function sanitizeBehavior(value: unknown, fallback: PetBehavior = DEFAULT_CONFIG.pet.behavior): PetBehavior {
  return typeof value === 'string' && PET_BEHAVIORS.includes(value as PetBehavior)
    ? (value as PetBehavior)
    : fallback;
}

export function sanitizeConfig(value: unknown): AppConfig {
  const root = isRecord(value) ? value : {};
  const pet = isRecord(root.pet) ? root.pet : {};
  const windowConfig = isRecord(root.window) ? root.window : {};
  const startPosition = START_POSITIONS.includes(windowConfig.startPosition as StartPosition)
    ? (windowConfig.startPosition as StartPosition)
    : DEFAULT_CONFIG.window.startPosition;
  const size = numberOr(pet.size, DEFAULT_CONFIG.pet.size, 64, 512);
  const schemaVersion = root.schemaVersion === 2 ? 2 : 1;
  const rawSpeed = typeof pet.speed === 'number' && Number.isFinite(pet.speed) ? pet.speed : DEFAULT_CONFIG.pet.speed;
  const migratedSpeed = schemaVersion === 1 && rawSpeed <= 8 ? rawSpeed * 60 : rawSpeed;

  return {
    schemaVersion: 2,
    pet: {
      name: stringOr(pet.name, DEFAULT_CONFIG.pet.name, 32),
      size,
      width: schemaVersion === 1 ? size : numberOr(pet.width, size, 64, 512),
      height: schemaVersion === 1 ? size : numberOr(pet.height, size, 64, 512),
      speed: numberOr(migratedSpeed, DEFAULT_CONFIG.pet.speed, 12, 480),
      behavior: sanitizeBehavior(pet.behavior),
      idleTimeout: numberOr(pet.idleTimeout, DEFAULT_CONFIG.pet.idleTimeout, 1000, 60000),
      alwaysOnTop: booleanOr(pet.alwaysOnTop, DEFAULT_CONFIG.pet.alwaysOnTop),
      ignoreMouse: booleanOr(pet.ignoreMouse, DEFAULT_CONFIG.pet.ignoreMouse),
      currentPetId: typeof pet.currentPetId === 'string' && pet.currentPetId.length > 0 ? pet.currentPetId : null,
    },
    window: {
      startPosition,
      opacity: numberOr(windowConfig.opacity, DEFAULT_CONFIG.window.opacity, 0.2, 1),
      lastDisplayId: typeof windowConfig.lastDisplayId === 'string' && windowConfig.lastDisplayId.length > 0
        ? windowConfig.lastDisplayId
        : null,
      lastXRatio: typeof windowConfig.lastXRatio === 'number' && Number.isFinite(windowConfig.lastXRatio)
        ? Math.min(1, Math.max(0, windowConfig.lastXRatio))
        : null,
    },
  };
}

export function mergeConfig(current: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return sanitizeConfig({
    ...current,
    ...patch,
    pet: { ...current.pet, ...patch.pet },
    window: { ...current.window, ...patch.window },
  });
}
