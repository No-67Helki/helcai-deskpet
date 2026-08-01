import { safeStorage } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProviderId } from '../shared/types';

type StoredCredentials = Partial<Record<ProviderId, string>>;

export class CredentialService {
  private values: StoredCredentials = {};
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'provider-credentials.json');
  }

  async load(): Promise<void> {
    try {
      const encrypted = JSON.parse(await readFile(this.filePath, 'utf8')) as Record<string, string>;
      if (!safeStorage.isEncryptionAvailable()) return;
      for (const [id, value] of Object.entries(encrypted)) {
        try {
          this.values[id as ProviderId] = safeStorage.decryptString(Buffer.from(value, 'base64'));
        } catch {
          // Ignore a credential encrypted for a different OS account.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('无法读取 AI 凭据。');
    }
  }

  get(id: ProviderId): string | undefined {
    return this.values[id];
  }

  has(id: ProviderId): boolean {
    return Boolean(this.values[id]);
  }

  async set(id: ProviderId, value: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全加密 API 密钥，已拒绝保存明文凭据。');
    const trimmed = value.trim();
    if (trimmed) this.values[id] = trimmed;
    else delete this.values[id];
    const serialized: Record<string, string> = {};
    for (const [provider, secret] of Object.entries(this.values)) {
      serialized[provider] = safeStorage.encryptString(secret).toString('base64');
    }
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, JSON.stringify(serialized, null, 2), 'utf8');
    await rename(temporary, this.filePath);
  }
}
