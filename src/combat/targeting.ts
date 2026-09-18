import type { MapPoint } from '../config/maps';
import type { Enemy } from './enemies';

export function inRange(origin: MapPoint, target: MapPoint, range: number): boolean {
  return Math.hypot(origin.x - target.x, origin.y - target.y) <= range;
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
    return forward >= 0 && forward <= range && perpendicular <= width / 2;
  });
}
