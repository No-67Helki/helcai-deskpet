import { BrowserWindow, OpenDialogOptions, dialog, nativeImage } from 'electron';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parsePetManifest, validateSpriteDimensions } from '../shared/petManifest';
import type { ImportProgress, PetAnimationState, PetAsset, PetManifest } from '../shared/types';
import { DEFAULT_CLIP_FPS, PET_STATES } from '../shared/defaults';

export interface ImportedPetPackage {
  manifest: PetManifest;
  warnings: string[];
}

function createPetId(): string {
  return `pet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function imageHasTransparency(image: Electron.NativeImage): boolean {
  const size = image.getSize();
  const bitmap = image.toBitmap();
  for (let offset = 3; offset < size.width * size.height * 4; offset += 4) {
    if ((bitmap[offset] ?? 255) < 250) return true;
  }
  return false;
}

function imageHasTransparentCorners(image: Electron.NativeImage): boolean {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  if (width < 2 || height < 2) return false;
  const offsets = [3, (width - 1) * 4 + 3, (height - 1) * width * 4 + 3, (height * width - 1) * 4 + 3];
  return offsets.every((offset) => (bitmap[offset] ?? 255) <= 8);
}

export class PetLibrary {
  private readonly loadWarnings = new Map<string, string>();

  constructor(private readonly petsRoot: string) {}

  async installBundledPackage(sourceDir: string): Promise<PetManifest> {
    const manifest = parsePetManifest(
      JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8')) as unknown,
    );
    if (manifest.kind !== 'sprite-sheet') throw new Error('内置桌宠必须是多帧精灵表。');

    const sourceImagePath = path.join(sourceDir, manifest.sourceImage);
    const sourceImage = nativeImage.createFromPath(sourceImagePath);
    if (sourceImage.isEmpty()) throw new Error('内置桌宠精灵表损坏或无法读取。');
    const dimensions = sourceImage.getSize();
    validateSpriteDimensions(manifest, dimensions.width, dimensions.height);
    if (!imageHasTransparency(sourceImage)) throw new Error('内置桌宠精灵表缺少透明通道。');
    if (!imageHasTransparentCorners(sourceImage)) throw new Error('内置桌宠精灵表四角并非透明，可能存在残留背景。');
    if (manifest.clips.walk.end - manifest.clips.walk.start + 1 < 4) {
      throw new Error('内置桌宠行走动画至少需要 4 帧。');
    }

    const installed: PetManifest = { ...manifest, id: `bundled-${manifest.id}` };
    const targetDir = path.join(this.petsRoot, installed.id);
    await mkdir(targetDir, { recursive: true });
    await copyFile(sourceImagePath, path.join(targetDir, installed.sourceImage));
    await copyFile(path.join(sourceDir, installed.previewImage), path.join(targetDir, installed.previewImage));
    await writeFile(path.join(targetDir, 'manifest.json'), JSON.stringify(installed, null, 2), 'utf8');
    return installed;
  }

  async installGeneratedPackage(sourceDir: string): Promise<PetManifest> {
    const manifest = parsePetManifest(JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8')) as unknown);
    if (manifest.kind !== 'sprite-sheet') throw new Error('生成结果不是有效的多帧精灵包。');
    const sourceImagePath = path.join(sourceDir, manifest.sourceImage);
    const sourceImage = nativeImage.createFromPath(sourceImagePath);
    if (sourceImage.isEmpty()) throw new Error('生成的精灵表损坏或无法读取。');
    const dimensions = sourceImage.getSize();
    validateSpriteDimensions(manifest, dimensions.width, dimensions.height);
    if (!imageHasTransparency(sourceImage)) throw new Error('生成的精灵表缺少透明通道。');
    if (!imageHasTransparentCorners(sourceImage)) throw new Error('生成的精灵表仍有背景残留。');
    const id = createPetId();
    const targetDir = path.join(this.petsRoot, id);
    await mkdir(targetDir, { recursive: true });
    await copyFile(sourceImagePath, path.join(targetDir, manifest.sourceImage));
    await copyFile(path.join(sourceDir, manifest.previewImage), path.join(targetDir, manifest.previewImage));
    const installed = { ...manifest, id, createdAt: new Date().toISOString() };
    await writeFile(path.join(targetDir, 'manifest.json'), JSON.stringify(installed, null, 2), 'utf8');
    return installed;
  }

  async installLegacyDataUri(dataUri: string, name: string): Promise<PetManifest> {
    const match = dataUri.match(/^data:image\/(?:png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) throw new Error('旧版内嵌精灵表不是受支持的 PNG/WebP Data URI。');
    const buffer = Buffer.from(match[1]!.replace(/\s/g, ''), 'base64');
    if (buffer.length > 80 * 1024 * 1024) throw new Error('旧版内嵌精灵表超过 80MB 安全限制。');
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('旧版内嵌精灵表无法解码。');
    const { width, height } = image.getSize();
    const frameSize = width === 4096 && height === 3072 ? 128 : 0;
    if (!frameSize || width % frameSize !== 0 || height % frameSize !== 0) {
      throw new Error(`无法安全推断旧精灵表 ${width}x${height} 的帧布局，原配置备份已保留。`);
    }
    const columns = width / frameSize;
    const totalFrames = columns * (height / frameSize);
    if (totalFrames !== 768) throw new Error(`旧精灵表应为 768 帧，实际推断为 ${totalFrames} 帧。`);
    const framesPerState = totalFrames / PET_STATES.length;
    const clips = Object.fromEntries(PET_STATES.map((state, index) => [state, { start: index * framesPerState, end: (index + 1) * framesPerState - 1, fps: DEFAULT_CLIP_FPS[state], loop: true }])) as PetManifest['clips'];
    const id = createPetId();
    const targetDir = path.join(this.petsRoot, id);
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, 'sprite-sheet.png'), image.toPNG());
    await writeFile(path.join(targetDir, 'preview.png'), image.crop({ x: 0, y: 0, width: frameSize, height: frameSize }).toPNG());
    const manifest: PetManifest = {
      schemaVersion: 2, id, name: name.slice(0, 32) || '迁移的旧桌宠', kind: 'sprite-sheet', createdAt: new Date().toISOString(), processorVersion: 3,
      sourceImage: 'sprite-sheet.png', previewImage: 'preview.png', canvasWidth: frameSize, canvasHeight: frameSize, frameWidth: frameSize, frameHeight: frameSize,
      anchor: { x: frameSize / 2, y: frameSize }, motion: { walkDistancePerCycle: 90 }, columns, totalFrames, clips,
      generation: { mode: 'local', notes: ['Migrated from a legacy embedded 4096x3072, 768-frame sprite sheet.'] },
    };
    await writeFile(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return manifest;
  }

  async importPackageFromDialog(
    owner: BrowserWindow | null,
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<ImportedPetPackage | null> {
    onProgress?.({ stage: 'selecting', message: '请选择包含 manifest.json 的桌宠素材包文件夹。' });
    const options: OpenDialogOptions = {
      title: '选择桌宠素材包文件夹',
      properties: ['openDirectory'],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;

    const sourceDir = result.filePaths[0]!;
    onProgress?.({ stage: 'validating', message: '正在校验多帧素材、透明通道和脚点…' });
    const manifest = parsePetManifest(JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8')) as unknown);
    if (manifest.kind !== 'sprite-sheet') {
      throw new Error('DeskCat 已停用单图贴图模式；请选择包含六状态多帧透明精灵表的 PetManifest v2 素材包。');
    }

    const sourceImagePath = path.join(sourceDir, manifest.sourceImage);
    const sourceImage = nativeImage.createFromPath(sourceImagePath);
    if (sourceImage.isEmpty()) throw new Error('精灵表损坏或无法读取。');
    const dimensions = sourceImage.getSize();
    validateSpriteDimensions(manifest, dimensions.width, dimensions.height);
    if (!imageHasTransparency(sourceImage)) throw new Error('真实桌宠精灵表必须包含透明通道。');
    if (!imageHasTransparentCorners(sourceImage)) throw new Error('精灵表四角必须透明。');
    if (manifest.clips.walk.end - manifest.clips.walk.start + 1 < 4) {
      throw new Error('行走动画至少需要 4 帧；单帧平移不属于可接受的桌宠动画。');
    }

    onProgress?.({ stage: 'saving', message: '正在安装桌宠素材包…' });
    const id = createPetId();
    const targetDir = path.join(this.petsRoot, id);
    await mkdir(targetDir, { recursive: true });
    await copyFile(sourceImagePath, path.join(targetDir, manifest.sourceImage));
    await copyFile(path.join(sourceDir, manifest.previewImage), path.join(targetDir, manifest.previewImage));
    for (const fileName of Object.values(manifest.stateImages ?? {})) {
      await copyFile(path.join(sourceDir, fileName), path.join(targetDir, fileName));
    }

    const installed: PetManifest = { ...manifest, id, createdAt: new Date().toISOString() };
    await writeFile(path.join(targetDir, 'manifest.json'), JSON.stringify(installed, null, 2), 'utf8');
    onProgress?.({ stage: 'complete', message: '真实多帧桌宠素材包安装完成。' });
    return { manifest: installed, warnings: [] };
  }

  async getAsset(petId: string | null, throwOnError = false): Promise<PetAsset | null> {
    if (!petId) return null;
    try {
      const petDir = path.join(this.petsRoot, petId);
      const manifestPath = path.join(petDir, 'manifest.json');
      const manifest = parsePetManifest(JSON.parse(await readFile(manifestPath, 'utf8')) as unknown);
      if (manifest.kind !== 'sprite-sheet') {
        throw new Error('旧版单图贴图已停用。请导入真实的六状态多帧桌宠素材包。');
      }

      const sourcePath = path.join(petDir, manifest.sourceImage);
      const image = nativeImage.createFromPath(sourcePath);
      if (image.isEmpty()) throw new Error('宠物精灵表损坏或无法读取。');
      const dimensions = image.getSize();
      validateSpriteDimensions(manifest, dimensions.width, dimensions.height);

      const stateImageUrls: Partial<Record<PetAnimationState, string>> = {};
      for (const [state, fileName] of Object.entries(manifest.stateImages ?? {})) {
        const statePath = path.join(petDir, fileName);
        if (nativeImage.createFromPath(statePath).isEmpty()) throw new Error(`状态图片 ${fileName} 损坏或无法读取。`);
        stateImageUrls[state as PetAnimationState] = pathToFileURL(statePath).toString();
      }

      const asset: PetAsset = {
        manifest,
        imageUrl: pathToFileURL(sourcePath).toString(),
        previewUrl: pathToFileURL(path.join(petDir, manifest.previewImage)).toString(),
      };
      if (Object.keys(stateImageUrls).length > 0) asset.stateImageUrls = stateImageUrls;
      this.loadWarnings.delete(petId);
      return asset;
    } catch (error) {
      if (throwOnError) throw error;
      this.loadWarnings.set(petId, error instanceof Error ? error.message : String(error));
      console.warn(`Failed to load pet asset ${petId}:`, error);
      return null;
    }
  }

  warningFor(petId: string | null): string | null {
    return petId ? this.loadWarnings.get(petId) ?? null : null;
  }
}
