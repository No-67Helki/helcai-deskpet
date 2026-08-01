import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../src/main/configService';

const temporaryPaths: string[] = [];
afterEach(async () => Promise.all(temporaryPaths.splice(0).map((item) => rm(item, { recursive: true, force: true }))));

describe('legacy config migration', () => {
  it('backs up an embedded sprite before replacing the old config schema', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'deskcat-config-'));
    temporaryPaths.push(directory);
    const original = { pet: { name: '旧猫', speed: 1.5, spriteSheet: 'data:image/png;base64,aGVsbG8=' } };
    await writeFile(path.join(directory, 'config.json'), JSON.stringify(original), 'utf8');
    const service = new ConfigService(directory);
    const config = await service.load();
    expect(config.schemaVersion).toBe(2);
    expect(service.takeLegacySprite()).toEqual({ dataUri: original.pet.spriteSheet, name: '旧猫' });
    expect(JSON.parse(await readFile(path.join(directory, 'config.legacy-v1.json'), 'utf8'))).toEqual(original);
  });
});
