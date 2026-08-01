import { DEFAULT_CLIP_FPS, DEFAULT_IMAGE_SIZE, PET_STATES } from './defaults';
import type { AnimationClip, CatProfile, PetAnimationState, PetGenerationMetadata, PetManifest } from './types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function safeFileName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.includes('..') || value.includes('/') || value.includes('\\')) return null;
  return value;
}

export function singleFrameClips(): Record<PetAnimationState, AnimationClip> {
  return Object.fromEntries(
    PET_STATES.map((state) => [state, { start: 0, end: 0, fps: DEFAULT_CLIP_FPS[state], loop: true }]),
  ) as Record<PetAnimationState, AnimationClip>;
}

function parseClips(value: unknown, totalFrames: number): Record<PetAnimationState, AnimationClip> | null {
  if (!isRecord(value)) return null;
  const clips = {} as Record<PetAnimationState, AnimationClip>;
  for (const state of PET_STATES) {
    const raw = value[state];
    if (!isRecord(raw)) return null;
    const start = typeof raw.start === 'number' && Number.isInteger(raw.start) ? raw.start : -1;
    const end = typeof raw.end === 'number' && Number.isInteger(raw.end) ? raw.end : -1;
    if (start < 0 || end < start || end >= totalFrames) return null;
    clips[state] = {
      start,
      end,
      fps: typeof raw.fps === 'number' && Number.isFinite(raw.fps)
        ? Math.min(60, Math.max(1, raw.fps))
        : DEFAULT_CLIP_FPS[state],
      loop: typeof raw.loop === 'boolean' ? raw.loop : true,
    };
  }
  return clips;
}

export function parsePetManifest(value: unknown): PetManifest {
  if (!isRecord(value)) throw new Error('宠物清单不是有效对象。');

  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : null;
  const name = typeof value.name === 'string' && value.name.length > 0 ? value.name.slice(0, 32) : null;
  const kind = value.kind === 'single-image' || value.kind === 'state-images' || value.kind === 'sprite-sheet' ? value.kind : null;
  const sourceImage = safeFileName(value.sourceImage);
  const previewImage = safeFileName(value.previewImage);
  if (!id || !name || !kind || !sourceImage || !previewImage) {
    throw new Error('宠物清单缺少 id、name、kind 或安全的资源文件名。');
  }

  const frameWidth = positiveInteger(value.frameWidth, DEFAULT_IMAGE_SIZE);
  const frameHeight = positiveInteger(value.frameHeight, DEFAULT_IMAGE_SIZE);
  const canvasWidth = positiveInteger(value.canvasWidth, frameWidth);
  const canvasHeight = positiveInteger(value.canvasHeight, frameHeight);
  const columns = positiveInteger(value.columns, 1);
  const totalFrames = positiveInteger(value.totalFrames, 1);
  const rawClips = value.schemaVersion === 2 ? value.clips : value.states;
  const clips = parseClips(rawClips, totalFrames) ?? (kind === 'sprite-sheet' ? null : singleFrameClips());
  if (!clips) throw new Error('精灵动画帧区间无效或未覆盖全部状态。');

  if (kind === 'sprite-sheet' && (!value.columns || !value.totalFrames)) {
    throw new Error('精灵表必须声明 columns 和 totalFrames。');
  }

  const anchorRecord = isRecord(value.anchor) ? value.anchor : {};
  const anchorX = typeof anchorRecord.x === 'number' && Number.isFinite(anchorRecord.x) ? anchorRecord.x : frameWidth / 2;
  const anchorY = typeof anchorRecord.y === 'number' && Number.isFinite(anchorRecord.y) ? anchorRecord.y : frameHeight;
  if (anchorX < 0 || anchorX > frameWidth || anchorY < 0 || anchorY > frameHeight) {
    throw new Error('宠物脚点必须位于单帧范围内。');
  }

  let stateImages: Partial<Record<PetAnimationState, string>> | undefined;
  if (isRecord(value.stateImages)) {
    stateImages = {};
    for (const state of PET_STATES) {
      const fileName = safeFileName(value.stateImages[state]);
      if (fileName) stateImages[state] = fileName;
    }
  }

  const manifest: PetManifest = {
    schemaVersion: 2,
    id,
    name,
    kind,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    processorVersion: positiveInteger(value.processorVersion, 1),
    sourceImage,
    previewImage,
    canvasWidth,
    canvasHeight,
    frameWidth,
    frameHeight,
    anchor: { x: anchorX, y: anchorY },
    clips,
  };
  if (isRecord(value.motion)) {
    const distance = value.motion.walkDistancePerCycle;
    if (typeof distance === 'number' && Number.isFinite(distance) && distance > 0) {
      manifest.motion = { walkDistancePerCycle: distance };
    }
  }
  if (kind === 'sprite-sheet') {
    manifest.columns = columns;
    manifest.totalFrames = totalFrames;
  }
  if (stateImages && Object.keys(stateImages).length > 0) manifest.stateImages = stateImages;
  if (isRecord(value.profile)) manifest.profile = value.profile as unknown as CatProfile;
  if (isRecord(value.generation)) manifest.generation = value.generation as unknown as PetGenerationMetadata;
  return manifest;
}

export function validateSpriteDimensions(
  manifest: PetManifest,
  imageWidth: number,
  imageHeight: number,
): void {
  if (manifest.kind !== 'sprite-sheet') return;
  const columns = manifest.columns ?? 1;
  const totalFrames = manifest.totalFrames ?? 1;
  const rows = Math.ceil(totalFrames / columns);
  if (imageWidth < columns * manifest.frameWidth || imageHeight < rows * manifest.frameHeight) {
    throw new Error(
      `精灵表尺寸 ${imageWidth}x${imageHeight} 小于清单要求的 ${columns * manifest.frameWidth}x${rows * manifest.frameHeight}。`,
    );
  }
}
