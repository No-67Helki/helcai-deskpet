import type { PetAnimationState } from '../shared/types';

interface InputCallbacks {
  setState(state: PetAnimationState): void;
  wake(): void;
  move(dx: number, dy: number): void;
  finishDrag(wasClick: boolean): Promise<void>;
}

export class InputController {
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private lastPointer = { x: 0, y: 0 };
  private totalDrag = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: InputCallbacks,
  ) {}

  attach(): void {
    this.canvas.addEventListener('mousedown', (event) => this.onMouseDown(event));
    window.addEventListener('mousemove', (event) => this.onMouseMove(event));
    window.addEventListener('mouseup', () => this.onMouseUp());
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    this.dragging = true;
    this.totalDrag = 0;
    this.dragStart = { x: event.screenX, y: event.screenY };
    this.lastPointer = { ...this.dragStart };
    this.callbacks.wake();
    this.callbacks.setState('dragged');
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.dragging) return;

    const dx = event.screenX - this.lastPointer.x;
    const dy = event.screenY - this.lastPointer.y;
    this.totalDrag += Math.hypot(dx, dy);
    this.lastPointer = { x: event.screenX, y: event.screenY };
    this.callbacks.move(dx, dy);
  }

  private onMouseUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.callbacks.wake();
    const wasClick = this.totalDrag < 12;
    this.callbacks.setState(wasClick ? 'happy' : 'idle');
    void this.callbacks.finishDrag(wasClick);
  }
}
