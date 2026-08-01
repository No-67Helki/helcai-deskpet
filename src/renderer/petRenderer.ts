import { DEFAULT_CLIP_FPS } from '../shared/defaults';
import type { PetAsset, PetAnimationState, PetManifest } from '../shared/types';

export class PetRenderer {
  private image: HTMLImageElement | null = null;
  private imageReady = false;
  private asset: PetAsset | null = null;
  private readonly stateImages = new Map<PetAnimationState, HTMLImageElement>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
  ) {}

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';
  }

  setPetAsset(asset: PetAsset | null): void {
    if (this.asset?.manifest.id === asset?.manifest.id && this.asset?.imageUrl === asset?.imageUrl) return;
    this.asset = asset;
    this.image = null;
    this.imageReady = false;
    this.stateImages.clear();
    if (!asset) return;

    const image = new Image();
    image.onload = () => { this.imageReady = true; };
    image.onerror = () => {
      this.imageReady = false;
      console.error(`Failed to load pet image: ${asset.imageUrl}`);
    };
    image.src = asset.imageUrl;
    this.image = image;

    for (const [state, url] of Object.entries(asset.stateImageUrls ?? {})) {
      const stateImage = new Image();
      stateImage.onerror = () => console.error(`Failed to load state image: ${url}`);
      stateImage.src = url;
      this.stateImages.set(state as PetAnimationState, stateImage);
    }
  }

  fpsForState(state: PetAnimationState, velocity = 0): number {
    const manifest = this.asset?.manifest;
    const fallback = manifest?.clips[state]?.fps ?? DEFAULT_CLIP_FPS[state];
    if (state !== 'walk' || !manifest?.motion?.walkDistancePerCycle || velocity <= 0) return fallback;
    const clip = manifest.clips.walk;
    const frameCount = Math.max(1, clip.end - clip.start + 1);
    const renderScale = Math.min((window.innerWidth * 0.92) / manifest.frameWidth, (window.innerHeight * 0.9) / manifest.frameHeight);
    const cssDistance = manifest.motion.walkDistancePerCycle * renderScale;
    return Math.min(24, Math.max(10, velocity / Math.max(1, cssDistance) * frameCount));
  }

  render(state: PetAnimationState, frame: number, facing: 1 | -1): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.context.clearRect(0, 0, width, height);
    if (!this.asset) return;

    if (this.asset?.manifest.kind === 'state-images') {
      const image = this.stateImages.get(state) ?? this.stateImages.get('idle') ?? this.image;
      if (image?.complete && image.naturalWidth > 0) {
        this.drawImagePet(image, this.asset.manifest, facing, width, height);
      }
    } else if (this.asset?.manifest.kind === 'sprite-sheet' && this.image && this.imageReady) {
      this.drawSpriteSheetPet(state, frame, facing, width, height);
    } else if (this.image && this.imageReady && this.asset) {
      this.drawImagePet(this.image, this.asset.manifest, facing, width, height);
    }
  }

  isOpaqueAt(cssX: number, cssY: number, threshold = 20): boolean {
    const dpr = window.devicePixelRatio || 1;
    const x = Math.floor(cssX * dpr);
    const y = Math.floor(cssY * dpr);
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return false;
    try {
      return this.context.getImageData(x, y, 1, 1).data[3]! >= threshold;
    } catch {
      return true;
    }
  }

  private drawSpriteSheetPet(state: PetAnimationState, frame: number, facing: 1 | -1, width: number, height: number): void {
    if (!this.image || !this.asset) return;
    const manifest = this.asset.manifest;
    const clip = manifest.clips[state] ?? manifest.clips.idle;
    const count = Math.max(1, clip.end - clip.start + 1);
    const localFrame = clip.loop ? frame % count : Math.min(frame, count - 1);
    const index = clip.start + localFrame;
    const columns = Math.max(1, manifest.columns ?? 1);
    this.drawImagePet(this.image, manifest, facing, width, height, {
      sx: (index % columns) * manifest.frameWidth,
      sy: Math.floor(index / columns) * manifest.frameHeight,
      sw: manifest.frameWidth,
      sh: manifest.frameHeight,
    });
  }

  private drawImagePet(
    image: HTMLImageElement,
    manifest: PetManifest,
    facing: 1 | -1,
    width: number,
    height: number,
    source?: { sx: number; sy: number; sw: number; sh: number },
  ): void {
    const frameWidth = source?.sw ?? image.naturalWidth;
    const frameHeight = source?.sh ?? image.naturalHeight;
    const scale = Math.min((width * 0.92) / frameWidth, (height * 0.9) / frameHeight);
    const anchorX = (manifest.anchor.x / manifest.frameWidth) * frameWidth;
    const anchorY = (manifest.anchor.y / manifest.frameHeight) * frameHeight;
    const ctx = this.context;
    ctx.save();
    ctx.translate(width / 2, height * 0.95);
    ctx.scale(facing * scale, scale);
    if (source) {
      ctx.drawImage(image, source.sx, source.sy, source.sw, source.sh, -anchorX, -anchorY, frameWidth, frameHeight);
    } else {
      ctx.drawImage(image, -anchorX, -anchorY, frameWidth, frameHeight);
    }
    ctx.restore();

  }

}
