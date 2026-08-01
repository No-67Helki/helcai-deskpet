import { app, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ConfigService } from './configService';
import { CursorTracker } from './cursorTracker';
import { PetLibrary } from './petLibrary';
import { TrayActions, TrayMenu } from './trayMenu';
import { WindowManager } from './windowManager';
import { FactoryWindow } from './factoryWindow';
import { CredentialService } from './credentialService';
import { ProviderRegistry } from './providerRegistry';
import { FactoryService } from './factoryService';
import type { AppConfig, ImportPetResult, PetBehavior, PhotoRole, ProviderSettingsInput, RendererState } from '../shared/types';
import { sanitizeBehavior } from '../shared/validation';
import { DEFAULT_CONFIG } from '../shared/defaults';
import { REQUIRED_PHOTO_ROLES } from '../shared/factoryPrompts';

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

const configService = new ConfigService();
const windowManager = new WindowManager();
const cursorTracker = new CursorTracker();
const trayMenu = new TrayMenu();
const factoryWindow = new FactoryWindow();
let petLibrary: PetLibrary;
let factoryService: FactoryService;
let bundledPetId: string | null = null;
let importInProgress = false;
let positionSaveTimer: NodeJS.Timeout | null = null;
let startupWarning: string | null = null;

function schedulePositionSave(): void {
  if (positionSaveTimer) clearTimeout(positionSaveTimer);
  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null;
    const placement = windowManager.currentPlacement();
    if (!placement) return;
    void configService.update({
      window: {
        ...configService.value.window,
        lastDisplayId: placement.displayId,
        lastXRatio: placement.xRatio,
      },
    }).catch((error) => console.error('Failed to save pet position:', error));
  }, 1200);
}

async function rendererState(): Promise<RendererState> {
  const config = configService.value;
  const currentPet = await petLibrary.getAsset(config.pet.currentPetId);
  const warning = petLibrary.warningFor(config.pet.currentPetId);
  return {
    config,
    window: windowManager.snapshot(),
    currentPet,
    warnings: warning ? [warning] : [],
  };
}

async function broadcastState(): Promise<RendererState> {
  const state = await rendererState();
  const window = windowManager.current;
  if (window && !window.isDestroyed()) {
    window.webContents.send('state-changed', state);
    if (state.currentPet) window.showInactive();
    else window.hide();
  }
  trayMenu.update(state.config, trayActions);
  return state;
}

async function updateConfig(patch: Partial<AppConfig>): Promise<RendererState> {
  const config = await configService.update(patch);
  windowManager.applyConfig(config);
  cursorTracker.setEnabled(config.pet.behavior === 'followMouse', () => windowManager.current);
  return broadcastState();
}

async function setBehavior(behavior: PetBehavior): Promise<RendererState> {
  return updateConfig({ pet: { ...configService.value.pet, behavior } });
}

const trayActions: TrayActions = {
  reload: () => windowManager.reload(),
  setBehavior: (behavior) => {
    void setBehavior(behavior).catch((error) => console.error('Failed to set behavior:', error));
  },
  setAlwaysOnTop: (value) => {
    void updateConfig({ pet: { ...configService.value.pet, alwaysOnTop: value } }).catch((error) => console.error(error));
  },
  setIgnoreMouse: (value) => {
    void updateConfig({ pet: { ...configService.value.pet, ignoreMouse: value } }).catch((error) => console.error(error));
  },
  startRename: () => {
    windowManager.setPointerPassthrough(false);
    windowManager.current?.webContents.send('start-rename');
  },
  importPet: () => {
    void importPet().catch((error) => console.error('Failed to import pet:', error));
  },
  resetPet: () => {
    void resetPet().catch((error) => console.error('Failed to reset pet:', error));
  },
  openFactory: () => {
    factoryWindow.open();
  },
};

async function importPet(): Promise<ImportPetResult> {
  if (importInProgress) return { canceled: false, error: '已有图片正在导入，请稍候。' };
  importInProgress = true;
  try {
    const owner = windowManager.current?.isVisible() ? windowManager.current : null;
    const generated = await petLibrary.importPackageFromDialog(owner, (progress) => {
      windowManager.current?.webContents.send('import-progress', progress);
    });
    if (!generated) return { canceled: true };

    const state = await updateConfig({
      pet: {
        ...configService.value.pet,
        name: generated.manifest.name,
        width: configService.value.pet.size,
        height: configService.value.pet.size,
        currentPetId: generated.manifest.id,
      },
    });
    const warningText = generated.warnings.length > 0 ? ` ${generated.warnings.join(' ')}` : '';
    windowManager.current?.webContents.send('import-progress', {
      stage: 'complete',
      message: `多帧桌宠已启用。${warningText}`.trim(),
    });
    return { canceled: false, state, warnings: generated.warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入宠物失败。';
    windowManager.current?.webContents.send('import-progress', { stage: 'complete', message: `导入失败：${message}` });
    return { canceled: false, error: message };
  } finally {
    importInProgress = false;
  }
}

async function resetPet(): Promise<RendererState> {
  const bundled = await petLibrary.getAsset(bundledPetId, true);
  return updateConfig({
    pet: {
      ...configService.value.pet,
      name: bundled?.manifest.name ?? DEFAULT_CONFIG.pet.name,
      currentPetId: bundled?.manifest.id ?? null,
      width: configService.value.pet.size,
      height: configService.value.pet.size,
    },
  });
}

function registerIpc(): void {
  ipcMain.handle('get-state', () => rendererState());
  ipcMain.handle('set-behavior', (_event, behavior: unknown) => setBehavior(sanitizeBehavior(behavior)));
  ipcMain.handle('set-always-on-top', (_event, value: unknown) => updateConfig({ pet: { ...configService.value.pet, alwaysOnTop: value === true } }));
  ipcMain.handle('set-ignore-mouse', (_event, value: unknown) => updateConfig({ pet: { ...configService.value.pet, ignoreMouse: value === true } }));
  ipcMain.handle('set-pointer-passthrough', (_event, value: unknown) => {
    windowManager.setPointerPassthrough(value === true);
  });
  ipcMain.handle('set-cursor-polling', (_event, enabled: unknown) => {
    cursorTracker.setEnabled(enabled === true, () => windowManager.current);
  });
  ipcMain.handle('move-window', (_event, dx: unknown, dy: unknown, grounded: unknown) => {
    const safeDx = typeof dx === 'number' && Number.isFinite(dx) ? Math.max(-80, Math.min(80, dx)) : 0;
    const safeDy = typeof dy === 'number' && Number.isFinite(dy) ? Math.max(-80, Math.min(80, dy)) : 0;
    const snapshot = windowManager.moveBy(safeDx, safeDy, grounded === true);
    if (grounded === true) schedulePositionSave();
    return snapshot;
  });
  ipcMain.handle('snap-to-ground', async () => {
    const grounded = windowManager.snapToGround();
    await configService.update({
      window: {
        ...configService.value.window,
        lastDisplayId: grounded.displayId || null,
        lastXRatio: grounded.xRatio,
      },
    });
    return broadcastState();
  });
  ipcMain.handle('show-pet-menu', () => trayMenu.popup(windowManager.current));
  ipcMain.handle('save-name', (_event, name: unknown) => {
    const safeName = typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, 32) : configService.value.pet.name;
    return updateConfig({ pet: { ...configService.value.pet, name: safeName } });
  });
  ipcMain.handle('import-pet', () => importPet());
  ipcMain.handle('reset-pet', () => resetPet());
  ipcMain.handle('open-factory', () => { factoryWindow.open(); });
  ipcMain.handle('factory-get-state', () => factoryService.state());
  ipcMain.handle('factory-select-photo', (_event, role: PhotoRole) => {
    if (!REQUIRED_PHOTO_ROLES.includes(role)) throw new Error('未知照片角度。');
    return factoryService.selectPhoto(role, factoryWindow.current);
  });
  ipcMain.handle('factory-update-project', (_event, patch: unknown) => factoryService.update((patch ?? {}) as Parameters<FactoryService['update']>[0]));
  ipcMain.handle('factory-save-provider', (_event, settings: ProviderSettingsInput) => factoryService.configureProvider(settings));
  ipcMain.handle('factory-cloud-consent', (_event, consent: unknown) => factoryService.setCloudConsent(consent === true));
  ipcMain.handle('factory-analyze', () => factoryService.analyze());
  ipcMain.handle('factory-generate', () => factoryService.startGeneration());
  ipcMain.handle('factory-cancel', () => factoryService.cancel());
  ipcMain.handle('factory-export', () => factoryService.exportResult(factoryWindow.current));
  ipcMain.handle('factory-install', async () => {
    const installed = await petLibrary.installGeneratedPackage(factoryService.outputDirectory());
    const state = await updateConfig({ pet: { ...configService.value.pet, name: installed.name, currentPetId: installed.id } });
    await factoryService.markInstalled();
    return state;
  });
}

app.on('second-instance', () => {
  const window = windowManager.current;
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.whenReady().then(async () => {
  let config = await configService.load();
  petLibrary = new PetLibrary(configService.petsPath);
  const credentials = new CredentialService(app.getPath('userData'));
  await credentials.load();
  const providers = new ProviderRegistry(credentials);
  factoryService = new FactoryService(app.getPath('userData'), providers, (state) => factoryWindow.send('factory-state-changed', state));
  await factoryService.load();
  const legacySprite = configService.takeLegacySprite();
  if (legacySprite) {
    try {
      const migrated = await petLibrary.installLegacyDataUri(legacySprite.dataUri, legacySprite.name);
      config = await configService.update({ pet: { ...config.pet, name: migrated.name, currentPetId: migrated.id } });
      startupWarning = '旧版 768 帧精灵表已迁移；原配置保存在 config.legacy-v1.json。';
    } catch (error) {
      startupWarning = `旧素材迁移失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const bundledPet = await petLibrary.installBundledPackage(
    path.join(app.getAppPath(), 'assets', 'pets', 'helcai'),
  );
  bundledPetId = bundledPet.id;
  const legacyBundledPet = config.pet.currentPetId === 'bundled-reference-silver-tabby';
  if ((config.pet.currentPetId === bundledPet.id || legacyBundledPet) && (config.pet.name === 'DeskCat' || config.pet.name === '银灰猫猫')) {
    config = await configService.update({ pet: { ...config.pet, name: bundledPet.name, currentPetId: bundledPet.id } });
  }
  if (config.pet.currentPetId && !(await petLibrary.getAsset(config.pet.currentPetId))) {
    config = await configService.update({
      pet: {
        ...config.pet,
        name: bundledPet.name,
        width: config.pet.size,
        height: config.pet.size,
        currentPetId: bundledPet.id,
      },
    });
  } else if (!config.pet.currentPetId) {
    config = await configService.update({
      pet: {
        ...config.pet,
        name: bundledPet.name,
        width: config.pet.size,
        height: config.pet.size,
        currentPetId: bundledPet.id,
      },
    });
  }
  registerIpc();
  windowManager.create(config);
  const factoryCapturePath = process.env.DESKCAT_CAPTURE_FACTORY_PATH;
  if (factoryCapturePath) {
    const captureWindow = factoryWindow.open();
    captureWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void captureWindow.capturePage()
          .then((image) => writeFile(factoryCapturePath, image.toPNG()))
          .then(() => app.quit())
          .catch((error) => console.error('Failed to capture factory screenshot:', error));
      }, 1200);
    });
  }
  const capturePath = process.env.DESKCAT_CAPTURE_PATH;
  if (capturePath) {
    windowManager.current?.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const window = windowManager.current;
        if (!window || window.isDestroyed()) return;
        void window.capturePage()
          .then((image) => writeFile(capturePath, image.toPNG()))
          .then(() => app.quit())
          .catch((error) => console.error('Failed to capture runtime screenshot:', error));
      }, 4500);
    });
  }
  trayMenu.create(config, trayActions);
  if (startupWarning) trayMenu.notify('旧数据迁移', startupWarning);
  const initialState = await rendererState();
  if (!initialState.currentPet) {
    windowManager.current?.hide();
    trayMenu.notify('桌宠素材加载失败', '内置猫咪素材未能加载，请从托盘安装其他 PetManifest v2 素材包。');
  }
  cursorTracker.setEnabled(config.pet.behavior === 'followMouse', () => windowManager.current);
});

app.on('before-quit', () => {
  if (positionSaveTimer) clearTimeout(positionSaveTimer);
  cursorTracker.stop();
});

app.on('window-all-closed', () => {
  // Keep the app alive in the tray until the user chooses Quit.
});

app.on('activate', () => {
  if (!windowManager.current) {
    windowManager.create(configService.value);
  }
});
