import type { MapPoint } from '../config/maps';

export interface BattlePath {
  nodes: readonly MapPoint[];
  lengths: number[];
  totalLength: number;
}

export function buildPath(nodes: readonly MapPoint[]): BattlePath {
  if (nodes.length < 2) throw new Error('敌军路径至少需要两个节点');
  const lengths = nodes.slice(1).map((point, index) =>
    Math.hypot(point.x - nodes[index]!.x, point.y - nodes[index]!.y));
  return { nodes, lengths, totalLength: lengths.reduce((sum, length) => sum + length, 0) };
}

export function pointOnPath(path: BattlePath, distance: number): MapPoint {
  let remaining = Math.max(0, distance);
  for (let index = 0; index < path.lengths.length; index++) {
    const length = path.lengths[index]!;
    if (length > 0 && remaining < length) {
      const start = path.nodes[index]!;
      const end = path.nodes[index + 1]!;
      const t = remaining / length;
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    }
    remaining -= length;
  }
  return { ...path.nodes[path.nodes.length - 1]! };
}
