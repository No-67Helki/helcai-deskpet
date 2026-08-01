import { AnimationController } from './animationController';
import { BehaviorController } from './behaviorController';
import { InputController } from './inputController';
import { MovementScheduler } from './movementScheduler';
import { PetRenderer } from './petRenderer';
import type { RendererState } from '../shared/types';

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const canvas = mustQuery<HTMLCanvasElement>('#pet-canvas');
const renameInput = mustQuery<HTMLInputElement>('#rename-input');
const statusBox = mustQuery<HTMLDivElement>('#status-box');
const context = canvas.getContext('2d', { willReadFrequently: true });
if (!context) throw new Error('Canvas 2D is not available.');

const renderer = new PetRenderer(canvas, context);
const animation = new AnimationController();
let behavior: BehaviorController;
let latestState: RendererState;
let lastFrameTime = performance.now();
let dragActive = false;
let passthrough = false;
let statusTimer = 0;
let lastAutoDirection = 0;
let lastWarning = '';

const movement = new MovementScheduler(
  (dx, dy, grounded) => window.deskcat.moveWindow(dx, dy, grounded),
  1000 / 60,
  (position) => {
    const previousX = latestState.window.x;
    latestState = { ...latestState, window: position };
    behavior.setWindow(position.x, position.y, position.width, position.height);
    if (!dragActive && lastAutoDirection !== 0 && Math.abs(position.x - previousX) < 0.5) behavior.reverseDirection();
  },
);

function showStatus(message: string, timeoutMs = 4500): void {
  window.clearTimeout(statusTimer);
  statusBox.textContent = message;
  statusBox.hidden = false;
  statusTimer = window.setTimeout(() => { statusBox.hidden = true; }, timeoutMs);
}

function applyState(state: RendererState): void {
  latestState = state;
  behavior.setConfig(state.config);
  behavior.setWindow(state.window.x, state.window.y, state.window.width, state.window.height);
  renderer.setPetAsset(state.currentPet);
  renameInput.value = state.config.pet.name;
  void window.deskcat.setCursorPolling(state.config.pet.behavior === 'followMouse');
  if (state.config.pet.ignoreMouse && renameInput.hidden) void setPassthrough(true);
  const warning = state.warnings.join(' ');
  if (warning && warning !== lastWarning) showStatus(warning, 12000);
  lastWarning = warning;
}

function startRename(): void {
  renameInput.hidden = false;
  renameInput.value = latestState.config.pet.name;
  void setPassthrough(false);
  renameInput.focus();
  renameInput.select();
}

function finishRename(save: boolean): void {
  const name = renameInput.value.trim();
  renameInput.hidden = true;
  if (latestState.config.pet.ignoreMouse) void setPassthrough(true);
  if (!save || name.length === 0) return;
  window.deskcat.saveName(name).then(applyState).catch((error: unknown) => showStatus(String(error)));
}

async function setPassthrough(value: boolean): Promise<void> {
  if (passthrough === value) return;
  passthrough = value;
  await window.deskcat.setPointerPassthrough(value);
}

function loop(now: number): void {
  const deltaMs = Math.min(50, Math.max(0, now - lastFrameTime));
  lastFrameTime = now;
  const snapshot = behavior.update(deltaMs);
  animation.setState(snapshot.state);
  animation.update(deltaMs, renderer.fpsForState(snapshot.state, Math.abs(snapshot.move.x)));

  if (!dragActive && snapshot.move.x !== 0) {
    const dx = snapshot.move.x * deltaMs / 1000;
    movement.queue(dx, 0);
    lastAutoDirection = Math.sign(snapshot.move.x);
  } else {
    lastAutoDirection = 0;
  }
  movement.flush(now, !dragActive);
  renderer.render(snapshot.state, animation.getFrame(), snapshot.facing);
  window.requestAnimationFrame(loop);
}

async function init(): Promise<void> {
  latestState = await window.deskcat.getState();
  behavior = new BehaviorController(latestState.config);
  applyState(latestState);
  renderer.resize();

  new InputController(canvas, {
    setState: (state) => behavior.setState(state),
    wake: () => behavior.wake(),
    move: (dx, dy) => {
      dragActive = true;
      movement.queue(dx, dy);
      movement.flush(performance.now() + 1000, false);
    },
    finishDrag: async () => {
      await movement.drain(false);
      dragActive = false;
      applyState(await window.deskcat.snapToGround());
    },
  }).attach();

  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('mousemove', (event) => {
    if (dragActive || !renameInput.hidden || latestState.config.pet.ignoreMouse) return;
    void setPassthrough(!renderer.isOpaqueAt(event.clientX, event.clientY));
  });
  window.addEventListener('mouseleave', () => {
    if (!dragActive && renameInput.hidden) void setPassthrough(true);
  });
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (renderer.isOpaqueAt(event.clientX, event.clientY)) void window.deskcat.showPetMenu();
  });

  window.deskcat.onStateChanged((state) => applyState(state));
  window.deskcat.onCursorPos((x, y, wx, wy) => {
    behavior.setMouse(x, y);
    behavior.setWindow(wx, wy, latestState.window.width, latestState.window.height);
  });
  window.deskcat.onStartRename(startRename);
  window.deskcat.onImportProgress((progress) => showStatus(progress.message, progress.stage === 'complete' ? 5000 : 12000));

  renameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finishRename(true);
    if (event.key === 'Escape') finishRename(false);
    event.stopPropagation();
  });
  renameInput.addEventListener('blur', () => finishRename(true));
  renameInput.addEventListener('mousedown', (event) => event.stopPropagation());
  window.requestAnimationFrame(loop);
}

init().catch((error: unknown) => showStatus(error instanceof Error ? error.message : String(error), 10000));
