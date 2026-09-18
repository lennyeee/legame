import type { BoardMap, MapPoint } from '../config/maps';

// 上半区按对向布局展示：入口右下、终点左上。
// 因此除关于中央水平线翻转 y 外，也翻转 x；仅翻转 y 会保留入口在左侧。
export function getBattlefieldLayout(map: BoardMap, width: number, upper: boolean) {
  const transform = (point: MapPoint): MapPoint => transformBattlefieldPoint(map, width, upper, point);
  return {
    path: map.path.map(transform),
    cells: map.cells.map(cell => ({ ...cell, ...transform(cell) })),
  };
}

export function transformBattlefieldPoint(map: BoardMap, width: number, upper: boolean, point: MapPoint): MapPoint {
  return upper ? { x: width - point.x, y: 2 * map.mirrorY - point.y } : { x: point.x, y: point.y };
}
