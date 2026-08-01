import { BrowserWindow, dialog, nativeImage } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { PROMPT_TEMPLATE_VERSION, REQUIRED_PHOTO_ROLES, STATE_FRAME_SPEC, stateSheetPrompt } from '../shared/factoryPrompts';
import type { FactoryState, PetManifest, PetProject, PhotoRole, ProviderSettingsInput } from '../shared/types';
import { ProviderRegistry } from './providerRegistry';

const execFileAsync = promisify(execFile);

function projectId(): string {
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function freshProject(): PetProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: projectId(),
    name: '我的桌宠',
    species: 'cat',
    style: 'natural',
    customPrompt: '',
    analyzerId: 'openai',
    generatorId: 'openai',
    photos: {},
    identity: null,
    stage: 'draft',
    progress: 0,
    statusMessage: '请准备六个角度的清晰照片。',
    estimatedCost: null,
    outputDirectory: null,
    resultPreviewUrl: null,
    resultSpriteUrl: null,
    resultManifest: null,
    createdAt: now,
    updatedAt: now,
  };
}

export class FactoryService {
  private project = freshProject();
  private cloudConsent = false;
  private abortController: AbortController | null = null;
  private readonly statePath: string;
  private readonly settingsPath: string;
  private readonly jobsRoot: string;

  constructor(
    private readonly userDataPath: string,
    private readonly providers: ProviderRegistry,
    private readonly notify: (state: FactoryState) => void,
  ) {
    this.statePath = path.join(userDataPath, 'factory', 'current-project.json');
    this.settingsPath = path.join(userDataPath, 'factory', 'settings.json');
    this.jobsRoot = path.join(userDataPath, 'factory', 'jobs');
  }

  async load(): Promise<FactoryState> {
    await mkdir(path.dirname(this.statePath), { recursive: true });
    await mkdir(this.jobsRoot, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.statePath, 'utf8')) as PetProject;
      if (parsed.schemaVersion === 1) this.project = { ...freshProject(), ...parsed, stage: parsed.stage === 'generating' || parsed.stage === 'analyzing' ? 'failed' : parsed.stage, statusMessage: parsed.stage === 'generating' || parsed.stage === 'analyzing' ? '上次任务被应用退出中断，可以重新开始。' : parsed.statusMessage };
    } catch { /* start a new draft */ }
    try {
      const settings = JSON.parse(await readFile(this.settingsPath, 'utf8')) as { cloudConsent?: unknown; providers?: unknown };
      this.cloudConsent = settings.cloudConsent === true;
      this.providers.restore(settings.providers);
    } catch { /* default is private */ }
    return this.state();
  }

  state(): FactoryState {
    return { project: structuredClone(this.project), providers: this.providers.summaries(), cloudConsent: this.cloudConsent };
  }

  async selectPhoto(role: PhotoRole, owner: BrowserWindow | null): Promise<FactoryState> {
    const options: OpenDialogOptions = { title: '选择宠物照片', properties: ['openFile'], filters: [{ name: '宠物照片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return this.state();
    const filePath = result.filePaths[0];
    const image = nativeImage.createFromPath(filePath);
    if (image.isEmpty()) throw new Error('无法读取这张照片，请选择 JPG、PNG 或 WebP。');
    const size = image.getSize();
    const valid = Math.max(size.width, size.height) >= 1200;
    this.project.photos[role] = { role, path: filePath, previewUrl: pathToFileURL(filePath).toString(), width: size.width, height: size.height, valid, message: valid ? '清晰度符合要求' : '最长边低于 1200px，生成结果可能模糊' };
    this.resetDerived('照片已更新，请重新确认身份。');
    return this.commit();
  }

  async update(patch: Partial<Pick<PetProject, 'name' | 'species' | 'style' | 'customPrompt' | 'analyzerId' | 'generatorId'>>): Promise<FactoryState> {
    if (this.abortController) throw new Error('任务运行期间不能修改项目设置，请先取消任务。');
    const speciesChanged = patch.species !== undefined && patch.species !== this.project.species;
    const generationChanged = speciesChanged
      || (patch.name !== undefined && patch.name.trim() !== this.project.name)
      || (patch.style !== undefined && patch.style !== this.project.style)
      || (patch.customPrompt !== undefined && patch.customPrompt !== this.project.customPrompt)
      || (patch.generatorId !== undefined && patch.generatorId !== this.project.generatorId);
    this.project = {
      ...this.project,
      ...(typeof patch.name === 'string' ? { name: patch.name.trim().slice(0, 32) || this.project.name } : {}),
      ...(patch.species === 'cat' || patch.species === 'dog' ? { species: patch.species } : {}),
      ...(patch.style === 'natural' || patch.style === 'soft-illustration' || patch.style === 'custom' ? { style: patch.style } : {}),
      ...(typeof patch.customPrompt === 'string' ? { customPrompt: patch.customPrompt.slice(0, 1200) } : {}),
      ...(patch.analyzerId ? { analyzerId: patch.analyzerId } : {}),
      ...(patch.generatorId ? { generatorId: patch.generatorId } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (speciesChanged) this.project.identity = null;
    if (generationChanged) {
      this.project.outputDirectory = null;
      this.project.resultPreviewUrl = null;
      this.project.resultSpriteUrl = null;
      this.project.resultManifest = null;
      this.project.stage = this.project.identity ? 'identity-review' : 'draft';
      this.project.progress = this.project.identity ? 20 : 0;
      this.project.statusMessage = '项目设置已变化，需要重新生成素材。';
    }
    this.project.estimatedCost = this.providers.estimate(this.project);
    return this.commit();
  }

  async configureProvider(input: ProviderSettingsInput): Promise<FactoryState> {
    await this.providers.configure(input);
    await this.saveSettings();
    return this.commit();
  }

  async setCloudConsent(consent: boolean): Promise<FactoryState> {
    this.cloudConsent = consent;
    await this.saveSettings();
    return this.commit();
  }

  async analyze(): Promise<FactoryState> {
    this.assertPhotos();
    this.assertConsent(this.project.analyzerId);
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.project.stage = 'analyzing';
    this.project.progress = 8;
    this.project.statusMessage = '正在分析毛色、脸型、花纹和体态…';
    await this.commit();
    try {
      this.project.identity = await this.providers.analyze(this.project, this.abortController.signal);
      this.project.stage = 'identity-review';
      this.project.progress = 20;
      this.project.statusMessage = '身份特征已提取，请确认后生成动画。';
    } catch (error) {
      this.project.stage = this.abortController.signal.aborted ? 'canceled' : 'failed';
      this.project.statusMessage = this.abortController.signal.aborted ? '身份分析已取消。' : `身份分析失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.abortController = null;
    }
    return this.commit();
  }

  startGeneration(): FactoryState {
    if (!this.project.identity) throw new Error('请先完成并确认身份分析。');
    this.assertPhotos();
    this.assertConsent(this.project.generatorId);
    if (this.abortController) throw new Error('已有生成任务正在运行。');
    this.abortController = new AbortController();
    this.project.stage = 'generating';
    this.project.progress = 24;
    this.project.statusMessage = '正在准备动作生成任务…';
    void this.commit().then(() => this.runGeneration(this.abortController!.signal));
    return this.state();
  }

  async cancel(): Promise<FactoryState> {
    this.abortController?.abort();
    this.project.stage = 'canceled';
    this.project.statusMessage = '生成已取消，已完成的状态草稿仍保留在本机。';
    return this.commit();
  }

  outputDirectory(): string {
    if (!this.project.outputDirectory || this.project.stage !== 'review' && this.project.stage !== 'complete') {
      throw new Error('当前项目还没有可安装的生成结果。');
    }
    return this.project.outputDirectory;
  }

  async markInstalled(): Promise<FactoryState> {
    this.project.stage = 'complete';
    this.project.statusMessage = `${this.project.name} 已安装并启用。`;
    return this.commit();
  }

  async exportResult(owner: BrowserWindow | null): Promise<{ canceled: boolean; path?: string }> {
    const source = this.outputDirectory();
    const result = owner
      ? await dialog.showOpenDialog(owner, { title: '选择桌宠素材包导出位置', properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ title: '选择桌宠素材包导出位置', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const printableName = [...this.project.name].filter((character) => character.charCodeAt(0) >= 32).join('');
    const safeName = printableName.replace(/[<>:"/\\|?*]/g, '-').slice(0, 40) || 'deskpet';
    const target = path.join(result.filePaths[0], `${safeName}-deskpet`);
    await cp(source, target, { recursive: true, force: false, errorOnExist: true });
    return { canceled: false, path: target };
  }

  private async runGeneration(signal: AbortSignal): Promise<void> {
    const jobRoot = path.join(this.jobsRoot, this.project.id);
    const sourceRoot = path.join(jobRoot, 'source-grids');
    const outputRoot = path.join(jobRoot, 'pet-package');
    const startedAt = new Date().toISOString();
    const stateRecords: Partial<Record<keyof typeof STATE_FRAME_SPEC, { attempts: number; failures: string[] }>> = {};
    let terminalError: string | null = null;
    await mkdir(sourceRoot, { recursive: true });
    try {
      const states = Object.keys(STATE_FRAME_SPEC) as Array<keyof typeof STATE_FRAME_SPEC>;
      for (let index = 0; index < states.length; index++) {
        const state = states[index]!;
        if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
        this.project.statusMessage = `正在生成${{ idle: '待机', walk: '行走', sit: '坐下', sleep: '睡眠', happy: '开心', dragged: '拖拽' }[state]}动画…`;
        this.project.progress = 28 + Math.round(index / states.length * 55);
        await this.commit();
        let generated: Buffer | null = null;
        stateRecords[state] = { attempts: 0, failures: [] };
        for (let attempt = 0; attempt < 2; attempt++) {
          stateRecords[state]!.attempts += 1;
          try {
            generated = await this.providers.generate(this.project, stateSheetPrompt(this.project, this.project.identity!, state), signal);
            break;
          } catch (error) {
            stateRecords[state]!.failures.push(error instanceof Error ? error.message : String(error));
            if (signal.aborted || attempt === 1) throw error;
            this.project.statusMessage = `${state} 首次生成失败，正在进行唯一一次自动修复重试…`;
            await this.commit();
          }
        }
        if (!generated) throw new Error(`${state} 没有返回图像。`);
        await writeFile(path.join(sourceRoot, `${state}-grid.png`), generated);
      }
      this.project.statusMessage = '正在抠除背景、对齐脚点并打包素材…';
      this.project.progress = 88;
      await this.commit();
      await rm(outputRoot, { recursive: true, force: true });
      const python = existsSync('D:\\Miniconda\\envs\\env310\\python.exe') ? 'D:\\Miniconda\\envs\\env310\\python.exe' : 'python';
      await execFileAsync(python, [path.join(process.cwd(), 'tools', 'pet_factory', 'build_sprite_package.py'), sourceRoot, outputRoot, '--name', this.project.name, '--id', this.project.id], { cwd: process.cwd(), windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      this.project.outputDirectory = outputRoot;
      this.project.resultPreviewUrl = pathToFileURL(path.join(outputRoot, 'preview.png')).toString();
      this.project.resultSpriteUrl = pathToFileURL(path.join(outputRoot, 'sprite-sheet.png')).toString();
      this.project.resultManifest = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8')) as PetManifest;
      this.project.stage = 'review';
      this.project.progress = 100;
      this.project.statusMessage = '六状态素材已生成并通过本地结构校验，可以预览和安装。';
    } catch (error) {
      terminalError = error instanceof Error ? error.message : String(error);
      this.project.stage = signal.aborted ? 'canceled' : 'failed';
      this.project.statusMessage = signal.aborted ? '生成已取消。' : `生成失败：${terminalError}`;
    } finally {
      this.abortController = null;
      const provider = this.providers.summaries().find((item) => item.id === this.project.generatorId);
      const sourcePhotoHashes = Object.fromEntries(await Promise.all(Object.entries(this.project.photos).map(async ([role, photo]) => {
        if (!photo) return [role, null];
        try { return [role, createHash('sha256').update(await readFile(photo.path)).digest('hex')]; }
        catch { return [role, 'source-unavailable']; }
      })));
      const metadata = {
        schemaVersion: 1,
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
        provider: provider ? { id: provider.id, model: provider.model, baseUrl: provider.baseUrl, local: provider.capabilities.local } : null,
        randomSeed: null,
        startedAt,
        completedAt: new Date().toISOString(),
        status: this.project.stage,
        failureReason: terminalError,
        sourcePhotoHashes,
        states: stateRecords,
        project: { ...this.project, photos: Object.fromEntries(Object.entries(this.project.photos).map(([role, photo]) => [role, photo ? { role: photo.role, width: photo.width, height: photo.height, valid: photo.valid, message: photo.message } : photo])) },
      };
      await writeFile(path.join(jobRoot, 'generation.json'), JSON.stringify(metadata, null, 2), 'utf8');
      await this.commit();
    }
  }

  private assertPhotos(): void {
    const missing = REQUIRED_PHOTO_ROLES.filter((role) => !this.project.photos[role]);
    if (missing.length) throw new Error(`完整动画还缺少 ${missing.length} 类照片。`);
  }

  private assertConsent(id: string): void {
    const provider = this.providers.summaries().find((item) => item.id === id);
    if (provider && !provider.capabilities.local && !this.cloudConsent) throw new Error('使用云端模型前，请先确认照片上传授权。');
  }

  private resetDerived(message: string): void {
    this.project.identity = null;
    this.project.outputDirectory = null;
    this.project.resultPreviewUrl = null;
    this.project.resultSpriteUrl = null;
    this.project.resultManifest = null;
    this.project.stage = 'draft';
    this.project.progress = 0;
    this.project.statusMessage = message;
  }

  private async commit(): Promise<FactoryState> {
    this.project.updatedAt = new Date().toISOString();
    await this.atomicWrite(this.statePath, JSON.stringify(this.project, null, 2));
    const state = this.state();
    this.notify(state);
    return state;
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.tmp`;
    await writeFile(temp, content, 'utf8');
    await rename(temp, filePath);
  }

  private async saveSettings(): Promise<void> {
    await this.atomicWrite(this.settingsPath, JSON.stringify({ cloudConsent: this.cloudConsent, providers: this.providers.configuration() }, null, 2));
  }
}
