import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import type { AppConfig, PetBehavior } from '../shared/types';

export interface TrayActions {
  reload(): void;
  setBehavior(behavior: PetBehavior): void;
  setAlwaysOnTop(value: boolean): void;
  setIgnoreMouse(value: boolean): void;
  startRename(): void;
  importPet(): void;
  resetPet(): void;
  openFactory(): void;
}

export class TrayMenu {
  private tray: Tray | null = null;
  private menu: Menu | null = null;

  create(config: AppConfig, actions: TrayActions): void {
    const iconPath = path.join(app.getAppPath(), 'assets', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
    this.update(config, actions);
  }

  update(config: AppConfig, actions: TrayActions): void {
    if (!this.tray) return;

    this.tray.setToolTip(`${config.pet.name} - Desktop Pet`);
    this.menu = Menu.buildFromTemplate([
      { label: '打开宠物工坊…', click: () => actions.openFactory() },
      { type: 'separator' },
      { label: '重新载入桌宠', click: () => actions.reload() },
      { label: '始终置顶', type: 'checkbox', checked: config.pet.alwaysOnTop, click: (item) => actions.setAlwaysOnTop(item.checked) },
      { label: '完全忽略鼠标', type: 'checkbox', checked: config.pet.ignoreMouse, click: (item) => actions.setIgnoreMouse(item.checked) },
      { type: 'separator' },
      { label: '随机散步', type: 'radio', checked: config.pet.behavior === 'random', click: () => actions.setBehavior('random') },
      { label: '跟随鼠标', type: 'radio', checked: config.pet.behavior === 'followMouse', click: () => actions.setBehavior('followMouse') },
      { label: '保持静止', type: 'radio', checked: config.pet.behavior === 'still', click: () => actions.setBehavior('still') },
      { type: 'separator' },
      { label: '重命名…', click: () => actions.startRename() },
      { label: '安装桌宠素材包…', click: () => actions.importPet() },
      { label: '恢复内置猫咪', click: () => actions.resetPet() },
      { type: 'separator' },
      { label: '退出赫尔财', click: () => app.quit() },
    ]);
    this.tray.setContextMenu(this.menu);
  }

  popup(window: BrowserWindow | null): void {
    if (!this.menu) return;
    this.menu.popup(window && !window.isDestroyed() ? { window } : undefined);
  }

  notify(title: string, content: string): void {
    if (!this.tray || process.platform !== 'win32') return;
    this.tray.displayBalloon({ title, content, iconType: 'info' });
  }
}
