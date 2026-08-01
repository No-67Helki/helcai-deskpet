import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../shared/defaults';
import type { AppConfig } from '../shared/types';
import { mergeConfig, sanitizeConfig } from '../shared/validation';

export class ConfigService {
  private config = structuredClone(DEFAULT_CONFIG);
  private readonly configPath: string;
  private pendingLegacySprite: { dataUri: string; name: string } | null = null;

  constructor(private readonly userDataPath = app.getPath('userData')) {
    this.configPath = path.join(this.userDataPath, 'config.json');
  }

  get value(): AppConfig {
    return structuredClone(this.config);
  }

  get petsPath(): string {
    return path.join(this.userDataPath, 'pets');
  }

  takeLegacySprite(): { dataUri: string; name: string } | null {
    const value = this.pendingLegacySprite;
    this.pendingLegacySprite = null;
    return value;
  }

  async load(): Promise<AppConfig> {
    await mkdir(this.userDataPath, { recursive: true });
    await mkdir(this.petsPath, { recursive: true });

    try {
      const raw = await readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as { schemaVersion?: unknown; spriteSheet?: unknown; pet?: unknown };
      const legacyPet = typeof parsed.pet === 'object' && parsed.pet !== null ? parsed.pet as Record<string, unknown> : {};
      const embedded = typeof parsed.spriteSheet === 'string' ? parsed.spriteSheet : typeof legacyPet.spriteSheet === 'string' ? legacyPet.spriteSheet : null;
      if (embedded?.startsWith('data:image/')) {
        this.pendingLegacySprite = { dataUri: embedded, name: typeof legacyPet.name === 'string' ? legacyPet.name : '迁移的旧桌宠' };
        try {
          await writeFile(path.join(this.userDataPath, 'config.legacy-v1.json'), raw, { encoding: 'utf8', flag: 'wx' });
        } catch (backupError) {
          if ((backupError as NodeJS.ErrnoException).code !== 'EEXIST') throw backupError;
        }
      }
      this.config = sanitizeConfig(parsed);
      if (parsed.schemaVersion !== 2 || this.pendingLegacySprite) await this.save(this.config);
    } catch (error) {
      this.config = structuredClone(DEFAULT_CONFIG);
      await this.save(this.config);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Failed to load config, restored defaults:', error);
      }
    }

    return this.value;
  }

  async update(patch: Partial<AppConfig>): Promise<AppConfig> {
    this.config = mergeConfig(this.config, patch);
    await this.save(this.config);
    return this.value;
  }

  async replace(config: AppConfig): Promise<AppConfig> {
    this.config = sanitizeConfig(config);
    await this.save(this.config);
    return this.value;
  }

  private async save(config: AppConfig): Promise<void> {
    await mkdir(path.dirname(this.configPath), { recursive: true });
    const tempPath = `${this.configPath}.tmp`;
    await writeFile(tempPath, JSON.stringify(config, null, 2), 'utf8');
    await rename(tempPath, this.configPath);
  }
}
