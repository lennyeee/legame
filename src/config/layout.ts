// 750×1334：顶部190，双半场750，操作区394。每个半场8列×5行。
export const battleLayout = { width: 600, left: 75, top: 190, columns: 8, rows: 5 } as const;
export const CELL_SIZE = battleLayout.width / battleLayout.columns;
export const HALF_HEIGHT = CELL_SIZE * battleLayout.rows;
export const MIRROR_Y = battleLayout.top + HALF_HEIGHT;
export const controlsLayout = {
  top: 953.75,
  reserveTitleY: 977, reserveY: 1036, reserveWidth: 80, reserveHeight: 80, reserveStep: 86,
  feedbackY: 1294, recruitY: 1190, recruitWidth: 280, recruitHeight: 154,
  passiveY: 1130, passiveStep: 60, passiveRadius: 25,
} as const;
// 仅显示变换：逻辑地图仍为600宽、75格，不参与战斗坐标或数值计算。
export const boardDisplay = { scale: 1.125, x: -46.875, y: -103.75 } as const;
export function boardToScreen(x: number, y: number) {
  return { x: x * boardDisplay.scale + boardDisplay.x, y: y * boardDisplay.scale + boardDisplay.y };
}
