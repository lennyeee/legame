import type { MapPoint } from '../config/maps';
import type { BattlePath } from './path';
import { pointOnPath } from './path';

export interface Enemy extends MapPoint {
  id: number;
  maxHp: number;
  hp: number;
  moveSpeed: number;
  distance: number;
  isBoss?: boolean;
}

export function createEnemy(id: number, path: BattlePath, stats: { maxHp: number; moveSpeed: number }): Enemy {
  return { id, ...pointOnPath(path, 0), ...stats, hp: stats.maxHp, distance: 0 };
}

// 按走过的总长度插值，一次更新跨越拐角也不会偏离路径。
export function advanceEnemy(enemy: Enemy, path: BattlePath, deltaSeconds: number): boolean {
  enemy.distance = Math.min(path.totalLength, enemy.distance + enemy.moveSpeed * deltaSeconds);
  Object.assign(enemy, pointOnPath(path, enemy.distance));
  return enemy.distance >= path.totalLength;
}

export function damageEnemy(enemy: Enemy, damage: number): { applied: number; killed: boolean } {
  if (enemy.hp <= 0 || damage <= 0) return { applied: 0, killed: false };
  const before = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - damage);
  return { applied: before - enemy.hp, killed: enemy.hp === 0 };
}

export function executeEnemy(enemy: Enemy): { applied: number; killed: boolean } {
  if (enemy.hp <= 0 || enemy.isBoss) return { applied: 0, killed: false };
  const applied = enemy.hp;
  enemy.hp = 0;
  return { applied, killed: true };
}
