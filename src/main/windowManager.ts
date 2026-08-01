import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { AppConfig, WindowSnapshot } from '../shared/types';
import { clampWindowPosition, horizontalPositionRatio } from '../shared/windowGeometry';

export class WindowManager {
  private window: BrowserWindow | null = null;
  private floatX = 0;
  private floatY = 0;

  get current(): BrowserWindow | null {
    return this.window;
  }

  create(config: AppConfig): BrowserWindow {
    const { x, y } = this.resolveInitialPosition(config);
    const window = new BrowserWindow({
      width: config.pet.width,
      height: config.pet.height,
      x,
      y,
      transparent: true,
      frame: false,
      alwaysOnTop: config.pet.alwaysOnTop,
      resizable: false,
      skipTaskbar: true,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    window.setVisibleOnAllWorkspaces(true);
    window.setAlwaysOnTop(config.pet.alwaysOnTop, 'screen-saver');
    window.setOpacity(config.window.opacity);
    window.setIgnoreMouseEvents(config.pet.ignoreMouse, { forward: true });
    window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    window.on('closed', () => {
      this.window = null;
    });

    this.window = window;
    this.floatX = x;
    this.floatY = y;
    return window;
  }

  applyConfig(config: AppConfig): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setAlwaysOnTop(config.pet.alwaysOnTop, 'screen-saver');
    this.window.setIgnoreMouseEvents(config.pet.ignoreMouse, { forward: true });
    this.window.setOpacity(config.window.opacity);

    const [width, height] = this.window.getSize();
    if (width !== config.pet.width || height !== config.pet.height) {
      this.window.setSize(config.pet.width, config.pet.height);
      this.snapToGround();
    }
  }

  setPointerPassthrough(value: boolean): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setIgnoreMouseEvents(value, { forward: true });
  }

  moveBy(dx: number, dy: number, grounded = false): WindowSnapshot {
    if (!this.window || this.window.isDestroyed()) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const position = this.window.getPosition();
    const size = this.window.getSize();
    const x = position[0] ?? 0;
    const y = position[1] ?? 0;
    if (Math.abs(this.floatX - x) > 2) this.floatX = x;
    if (Math.abs(this.floatY - y) > 2) this.floatY = y;
    const width = size[0] ?? 0;
    const height = size[1] ?? 0;
    const display = screen.getDisplayMatching({ x, y, width, height });
    const area = display.workArea;
    this.floatX += dx;
    this.floatY += dy;
    const next = clampWindowPosition(area, width, height, this.floatX, this.floatY, grounded);
    const nextX = next.x;
    const nextY = next.y;

    this.window.setPosition(Math.round(nextX), Math.round(nextY));
    this.floatX = nextX;
    this.floatY = nextY;
    return this.snapshot();
  }

  snapToGround(): { snapshot: WindowSnapshot; displayId: string; xRatio: number } {
    if (!this.window || this.window.isDestroyed()) {
      return { snapshot: this.snapshot(), displayId: '', xRatio: 0.5 };
    }
    const position = this.window.getPosition();
    const size = this.window.getSize();
    const x = position[0] ?? 0;
    const y = position[1] ?? 0;
    const width = size[0] ?? 0;
    const height = size[1] ?? 0;
    const display = screen.getDisplayMatching({ x, y, width, height });
    const area = display.workArea;
    const next = clampWindowPosition(area, width, height, x, y, true);
    const nextX = next.x;
    const nextY = next.y;
    this.floatX = nextX;
    this.floatY = nextY;
    this.window.setPosition(Math.round(nextX), Math.round(nextY));
    return {
      snapshot: this.snapshot(),
      displayId: String(display.id),
      xRatio: horizontalPositionRatio(area, width, nextX),
    };
  }

  currentPlacement(): { displayId: string; xRatio: number } | null {
    if (!this.window || this.window.isDestroyed()) return null;
    const snapshot = this.snapshot();
    const display = screen.getDisplayMatching(snapshot);
    return {
      displayId: String(display.id),
      xRatio: horizontalPositionRatio(display.workArea, snapshot.width, snapshot.x),
    };
  }

  snapshot(): WindowSnapshot {
    if (!this.window || this.window.isDestroyed()) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const position = this.window.getPosition();
    const size = this.window.getSize();
    const x = position[0] ?? 0;
    const y = position[1] ?? 0;
    const width = size[0] ?? 0;
    const height = size[1] ?? 0;
    return { x, y, width, height };
  }

  reload(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.reload();
  }

  private resolveInitialPosition(config: AppConfig): { x: number; y: number } {
    const display = screen.getAllDisplays().find((item) => String(item.id) === config.window.lastDisplayId) ?? screen.getPrimaryDisplay();
    const area = display.workArea;
    const marginX = 20;

    if (config.window.lastXRatio !== null) {
      const usableWidth = Math.max(0, area.width - config.pet.width);
      return {
        x: area.x + Math.round(usableWidth * config.window.lastXRatio),
        y: area.y + area.height - config.pet.height,
      };
    }

    switch (config.window.startPosition) {
      case 'bottom-left':
        return { x: area.x + marginX, y: area.y + area.height - config.pet.height };
      case 'top-right':
        return { x: area.x + area.width - config.pet.width - marginX, y: area.y + 20 };
      case 'top-left':
        return { x: area.x + marginX, y: area.y + 20 };
      case 'bottom-right':
      default:
        return { x: area.x + area.width - config.pet.width - marginX, y: area.y + area.height - config.pet.height };
    }
  }
}
