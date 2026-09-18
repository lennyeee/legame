// 750×1334：顶部190，双半场750，操作区394。每个半场8列×5行。
export const battleLayout = { width: 600, left: 75, top: 190, columns: 8, rows: 5 } as const;
export const CELL_SIZE = battleLayout.width / battleLayout.columns;
export const HALF_HEIGHT = CELL_SIZE * battleLayout.rows;
export const MIRROR_Y = battleLayout.top + HALF_HEIGHT;
export const controlsLayout = {
  top: battleLayout.top + HALF_HEIGHT * 2,
  reserveTitleY: 969, reserveY: 1034, reserveWidth: 108, reserveHeight: 100,
  feedbackY: 1114, recruitY: 1180, passiveY: 1270, passiveHeight: 62,
} as const;
