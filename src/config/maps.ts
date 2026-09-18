export interface MapPoint {
  x: number;
  y: number;
}

export interface DeploymentCell extends MapPoint {
  unlocked: boolean;
}

export interface BoardMap {
  name: string;
  mirrorY: number;
  cellSize: number;
  path: readonly MapPoint[];
  cells: readonly DeploymentCell[];
}

// 只存玩家半场的数据；上半场由渲染器镜像展示。未来城市地图可沿用此结构。
export const testMap: BoardMap = {
  name: '训练场',
  mirrorY: 590,
  cellSize: 52,
  path: [
    { x: 105, y: 635 },
    { x: 105, y: 735 },
    { x: 375, y: 735 },
    { x: 375, y: 905 },
    { x: 645, y: 905 },
  ],
  cells: [
    { x: 195, y: 650, unlocked: true },
    { x: 247, y: 650, unlocked: true },
    { x: 465, y: 735, unlocked: true },
    { x: 517, y: 735, unlocked: false },
    { x: 195, y: 820, unlocked: true },
    { x: 247, y: 820, unlocked: false },
    { x: 465, y: 820, unlocked: true },
    { x: 517, y: 820, unlocked: false },
    { x: 195, y: 910, unlocked: false },
    { x: 247, y: 910, unlocked: false },
    { x: 299, y: 650, unlocked: true },
    { x: 351, y: 650, unlocked: false },
    { x: 403, y: 650, unlocked: true },
    { x: 455, y: 650, unlocked: false },
    { x: 569, y: 735, unlocked: true },
    { x: 621, y: 735, unlocked: true },
  ],
};
