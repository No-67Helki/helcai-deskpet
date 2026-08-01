import { BrowserWindow, screen } from 'electron';

export class CursorTracker {
  private interval: NodeJS.Timeout | null = null;

  setEnabled(enabled: boolean, getWindow: () => BrowserWindow | null): void {
    if (!enabled) {
      this.stop();
      return;
    }

    if (this.interval) return;
    this.interval = setInterval(() => {
      const window = getWindow();
      if (!window || window.isDestroyed()) return;

      const pos = screen.getCursorScreenPoint();
      const [wx, wy] = window.getPosition();
      window.webContents.send('cursor-pos', pos.x, pos.y, wx, wy);
    }, 50);
  }

  stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
  }
}
