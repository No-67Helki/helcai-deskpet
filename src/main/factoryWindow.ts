import { BrowserWindow } from 'electron';
import path from 'node:path';

export class FactoryWindow {
  private window: BrowserWindow | null = null;

  get current(): BrowserWindow | null {
    return this.window;
  }

  open(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return this.window;
    }
    this.window = new BrowserWindow({
      width: 1000,
      height: 720,
      minWidth: 880,
      minHeight: 640,
      backgroundColor: '#F6F4EF',
      title: '赫尔财 · 宠物工坊',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.window.loadFile(path.join(__dirname, '..', 'factory', 'index.html'));
    this.window.once('ready-to-show', () => this.window?.show());
    this.window.on('closed', () => { this.window = null; });
    return this.window;
  }

  send(channel: string, value: unknown): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, value);
  }
}
