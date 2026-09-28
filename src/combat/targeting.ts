import type { MapPoint } from '../config/maps';
import type { Enemy } from './enemies';

export function inRange(origin: MapPoint, target: MapPoint & { hitRadius?: number }, range: number): boolean {
  return Math.hypot(origin.x - target.x, origin.y - target.y) <= range + (target.hitRadius ?? 0);
}

export function selectTarget(enemies: readonly Enemy[], origin: MapPoint, range: number): Enemy | null {
  let target: Enemy | null = null;
  for (const enemy of enemies) {
    if (enemy.hp > 0 && inRange(origin, enemy, range) && (!target || enemy.distance > target.distance)) target = enemy;
  }
  return target;
}

export function lineEnd(origin: MapPoint, target: MapPoint, range: number): MapPoint {
  const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
  if (distance === 0) return { ...origin };
  return { x: origin.x + (target.x - origin.x) / distance * range, y: origin.y + (target.y - origin.y) / distance * range };
}

export function piercingTargets(
  enemies: readonly Enemy[], origin: MapPoint, target: MapPoint, range: number, width: number,
): Enemy[] {
  const end = lineEnd(origin, target, 1);
  const dx = end.x - origin.x;
  const dy = end.y - origin.y;
  return enemies.filter(enemy => {
    if (enemy.hp <= 0 || !inRange(origin, enemy, range)) return false;
    const x = enemy.x - origin.x;
    const y = enemy.y - origin.y;
    const forward = x * dx + y * dy;
    const perpendicular = Math.abs(x * dy - y * dx);
    // 保留32px线宽，使用线段胶囊与目标受击圆的相交；端点同样有体积语义。
    const beyondEnd = forward < 0 ? -forward : Math.max(0, forward - range);
    return Math.hypot(beyondEnd, perpendicular) <= width / 2 + (enemy.hitRadius ?? 0);
  });
}
