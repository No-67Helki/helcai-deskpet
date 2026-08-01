export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampWindowPosition(
  area: WorkArea,
  windowWidth: number,
  windowHeight: number,
  x: number,
  y: number,
  grounded: boolean,
): { x: number; y: number } {
  const maxX = area.x + Math.max(0, area.width - windowWidth);
  const maxY = area.y + Math.max(0, area.height - windowHeight);
  return {
    x: Math.max(area.x, Math.min(maxX, x)),
    y: grounded ? maxY : Math.max(area.y, Math.min(maxY, y)),
  };
}

export function horizontalPositionRatio(area: WorkArea, windowWidth: number, x: number): number {
  const usableWidth = Math.max(1, area.width - windowWidth);
  return Math.min(1, Math.max(0, (x - area.x) / usableWidth));
}
