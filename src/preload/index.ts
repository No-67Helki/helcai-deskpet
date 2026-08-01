import { contextBridge, ipcRenderer } from 'electron';
import type { DeskcatApi, FactoryState, ImportPetResult, ImportProgress, PetBehavior, PetProject, PhotoRole, ProviderSettingsInput, RendererState, WindowSnapshot } from '../shared/types';

function on<T extends unknown[]>(channel: string, callback: (...args: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: T) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: DeskcatApi = {
  getState: () => ipcRenderer.invoke('get-state') as Promise<RendererState>,
  setBehavior: (behavior: PetBehavior) => ipcRenderer.invoke('set-behavior', behavior) as Promise<RendererState>,
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('set-always-on-top', value) as Promise<RendererState>,
  setIgnoreMouse: (value: boolean) => ipcRenderer.invoke('set-ignore-mouse', value) as Promise<RendererState>,
  setPointerPassthrough: (value: boolean) => ipcRenderer.invoke('set-pointer-passthrough', value) as Promise<void>,
  setCursorPolling: (enabled: boolean) => ipcRenderer.invoke('set-cursor-polling', enabled) as Promise<void>,
  moveWindow: (dx: number, dy: number, grounded = false) => ipcRenderer.invoke('move-window', dx, dy, grounded) as Promise<WindowSnapshot>,
  snapToGround: () => ipcRenderer.invoke('snap-to-ground') as Promise<RendererState>,
  showPetMenu: () => ipcRenderer.invoke('show-pet-menu') as Promise<void>,
  saveName: (name: string) => ipcRenderer.invoke('save-name', name) as Promise<RendererState>,
  importPet: () => ipcRenderer.invoke('import-pet') as Promise<ImportPetResult>,
  resetPet: () => ipcRenderer.invoke('reset-pet') as Promise<RendererState>,
  openFactory: () => ipcRenderer.invoke('open-factory') as Promise<void>,
  getFactoryState: () => ipcRenderer.invoke('factory-get-state') as Promise<FactoryState>,
  selectFactoryPhoto: (role: PhotoRole) => ipcRenderer.invoke('factory-select-photo', role) as Promise<FactoryState>,
  updateFactoryProject: (patch: Partial<Pick<PetProject, 'name' | 'species' | 'style' | 'customPrompt' | 'analyzerId' | 'generatorId'>>) => ipcRenderer.invoke('factory-update-project', patch) as Promise<FactoryState>,
  saveProviderSettings: (settings: ProviderSettingsInput) => ipcRenderer.invoke('factory-save-provider', settings) as Promise<FactoryState>,
  setCloudConsent: (consent: boolean) => ipcRenderer.invoke('factory-cloud-consent', consent) as Promise<FactoryState>,
  analyzeFactoryIdentity: () => ipcRenderer.invoke('factory-analyze') as Promise<FactoryState>,
  startFactoryGeneration: () => ipcRenderer.invoke('factory-generate') as Promise<FactoryState>,
  cancelFactoryGeneration: () => ipcRenderer.invoke('factory-cancel') as Promise<FactoryState>,
  installFactoryResult: () => ipcRenderer.invoke('factory-install') as Promise<RendererState>,
  exportFactoryResult: () => ipcRenderer.invoke('factory-export') as Promise<{ canceled: boolean; path?: string }>,
  onStateChanged: (callback) => on<RendererState[]>('state-changed', callback),
  onCursorPos: (callback) => on<[number, number, number, number]>('cursor-pos', callback),
  onStartRename: (callback) => on<[]>('start-rename', callback),
  onImportProgress: (callback) => on<[ImportProgress]>('import-progress', callback),
  onFactoryStateChanged: (callback) => on<[FactoryState]>('factory-state-changed', callback),
};

contextBridge.exposeInMainWorld('deskcat', api);
