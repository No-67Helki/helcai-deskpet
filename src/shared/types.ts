export type PetBehavior = 'random' | 'followMouse' | 'still';
export type PetAnimationState = 'idle' | 'walk' | 'sit' | 'sleep' | 'happy' | 'dragged';
export type StartPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface AnimationClip {
  start: number;
  end: number;
  fps: number;
  loop: boolean;
}

export interface SpriteAnchor {
  x: number;
  y: number;
}

export interface PetConfig {
  name: string;
  size: number;
  width: number;
  height: number;
  speed: number;
  behavior: PetBehavior;
  idleTimeout: number;
  alwaysOnTop: boolean;
  ignoreMouse: boolean;
  currentPetId: string | null;
}

export interface WindowConfig {
  startPosition: StartPosition;
  opacity: number;
  lastDisplayId: string | null;
  lastXRatio: number | null;
}

export interface AppConfig {
  schemaVersion: 2;
  pet: PetConfig;
  window: WindowConfig;
}

export interface WindowSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CatProfile {
  breedHint: string;
  coatColors: string[];
  pattern: string;
  bodyType: string;
  eyeColor: string;
  distinctiveFeatures: string[];
  prompt: string;
  negativePrompt: string;
}

export interface PetGenerationMetadata {
  mode: 'local' | 'imagegen-assisted' | 'vision-assisted' | 'comfyui-assisted';
  visionModel?: string;
  backgroundRemoval?: 'external-command' | 'local-fallback';
  spriteBackend?: 'local-comfyui' | 'local-fallback';
  notes: string[];
}

export interface PetManifest {
  schemaVersion: 2;
  id: string;
  name: string;
  kind: 'single-image' | 'state-images' | 'sprite-sheet';
  createdAt: string;
  processorVersion: number;
  sourceImage: string;
  previewImage: string;
  canvasWidth: number;
  canvasHeight: number;
  frameWidth: number;
  frameHeight: number;
  anchor: SpriteAnchor;
  motion?: {
    walkDistancePerCycle?: number;
  };
  columns?: number;
  totalFrames?: number;
  stateImages?: Partial<Record<PetAnimationState, string>>;
  clips: Record<PetAnimationState, AnimationClip>;
  profile?: CatProfile;
  generation?: PetGenerationMetadata;
}

export type PetSpecies = 'cat' | 'dog';
export type PetStyle = 'natural' | 'soft-illustration' | 'custom';
export type PhotoRole = 'front-face' | 'left-profile' | 'right-profile' | 'standing-body' | 'sitting-body' | 'marking-detail';
export type ProviderId = 'openai' | 'gemini' | 'tongyi' | 'ollama' | 'claude' | 'comfyui';

export interface ProviderCapabilities {
  analyze: boolean;
  generate: boolean;
  multiImage: boolean;
  imageEdit: boolean;
  transparentOutput: boolean;
  costEstimate: boolean;
  cancellable: boolean;
  local: boolean;
}

export interface ProviderSummary {
  id: ProviderId;
  name: string;
  configured: boolean;
  model: string;
  baseUrl: string;
  capabilities: ProviderCapabilities;
}

export interface ProviderSettingsInput {
  id: ProviderId;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface FactoryPhoto {
  role: PhotoRole;
  path: string;
  previewUrl: string;
  width: number;
  height: number;
  valid: boolean;
  message: string;
}

export interface IdentityProfile {
  species: PetSpecies;
  coatColors: string[];
  pattern: string;
  eyeColor: string;
  bodyType: string;
  distinctiveFeatures: string[];
  summary: string;
}

export type FactoryStage = 'draft' | 'analyzing' | 'identity-review' | 'generating' | 'review' | 'complete' | 'failed' | 'canceled';

export interface PetProject {
  schemaVersion: 1;
  id: string;
  name: string;
  species: PetSpecies;
  style: PetStyle;
  customPrompt: string;
  analyzerId: ProviderId;
  generatorId: ProviderId;
  photos: Partial<Record<PhotoRole, FactoryPhoto>>;
  identity: IdentityProfile | null;
  stage: FactoryStage;
  progress: number;
  statusMessage: string;
  estimatedCost: string | null;
  outputDirectory: string | null;
  resultPreviewUrl: string | null;
  resultSpriteUrl: string | null;
  resultManifest: PetManifest | null;
  createdAt: string;
  updatedAt: string;
}

export interface FactoryState {
  project: PetProject;
  providers: ProviderSummary[];
  cloudConsent: boolean;
}

export interface PetAsset {
  manifest: PetManifest;
  imageUrl: string;
  previewUrl: string;
  stateImageUrls?: Partial<Record<PetAnimationState, string>>;
}

export interface RendererState {
  config: AppConfig;
  window: WindowSnapshot;
  currentPet: PetAsset | null;
  warnings: string[];
}

export interface ImportPetResult {
  canceled: boolean;
  state?: RendererState;
  error?: string;
  warnings?: string[];
}

export interface ImportProgress {
  stage: 'selecting' | 'processing' | 'validating' | 'saving' | 'complete';
  message: string;
}

export interface DeskcatApi {
  getState(): Promise<RendererState>;
  setBehavior(behavior: PetBehavior): Promise<RendererState>;
  setAlwaysOnTop(value: boolean): Promise<RendererState>;
  setIgnoreMouse(value: boolean): Promise<RendererState>;
  setPointerPassthrough(value: boolean): Promise<void>;
  setCursorPolling(enabled: boolean): Promise<void>;
  moveWindow(dx: number, dy: number, grounded?: boolean): Promise<WindowSnapshot>;
  snapToGround(): Promise<RendererState>;
  showPetMenu(): Promise<void>;
  saveName(name: string): Promise<RendererState>;
  importPet(): Promise<ImportPetResult>;
  resetPet(): Promise<RendererState>;
  openFactory(): Promise<void>;
  getFactoryState(): Promise<FactoryState>;
  selectFactoryPhoto(role: PhotoRole): Promise<FactoryState>;
  updateFactoryProject(patch: Partial<Pick<PetProject, 'name' | 'species' | 'style' | 'customPrompt' | 'analyzerId' | 'generatorId'>>): Promise<FactoryState>;
  saveProviderSettings(settings: ProviderSettingsInput): Promise<FactoryState>;
  setCloudConsent(consent: boolean): Promise<FactoryState>;
  analyzeFactoryIdentity(): Promise<FactoryState>;
  startFactoryGeneration(): Promise<FactoryState>;
  cancelFactoryGeneration(): Promise<FactoryState>;
  installFactoryResult(): Promise<RendererState>;
  exportFactoryResult(): Promise<{ canceled: boolean; path?: string }>;
  onStateChanged(callback: (state: RendererState) => void): () => void;
  onCursorPos(callback: (x: number, y: number, wx: number, wy: number) => void): () => void;
  onStartRename(callback: () => void): () => void;
  onImportProgress(callback: (progress: ImportProgress) => void): () => void;
  onFactoryStateChanged(callback: (state: FactoryState) => void): () => void;
}

export interface Point {
  x: number;
  y: number;
}
