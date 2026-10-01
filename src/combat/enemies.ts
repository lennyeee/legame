import type { MapPoint } from '../config/maps';
import type { BattlePath } from './path';
import { pointOnPath } from './path';

export interface Enemy extends MapPoint {
  id: number;
  maxHp: number;
  hp: number;
  moveSpeed: number;
  distance: number;
  hitRadius?: number; // 受击圆，独立于显示尺寸；无体积的规则fixture默认0。
  isBoss?: boolean;
  percentDamageMultiplier?: number;
  spawnEventId?: number; // Match共享出题事件；id本身仍只在所属Side内唯一。
}

export function createEnemy(id: number, path: BattlePath, stats: { maxHp: number; moveSpeed: number; hitRadius?: number }): Enemy {
  return { id, ...pointOnPath(path, 0), ...stats, hp: stats.maxHp, distance: 0, percentDamageMultiplier: 1 };
}

// 按走过的总长度插值，一次更新跨越拐角也不会偏离路径。
export function advanceEnemy(enemy: Enemy, path: BattlePath, deltaSeconds: number): boolean {
  enemy.distance = Math.min(path.totalLength, enemy.distance + enemy.moveSpeed * deltaSeconds);
  Object.assign(enemy, pointOnPath(path, enemy.distance));
  return enemy.distance >= path.totalLength;
}

export function damageEnemy(enemy: Enemy, damage: number | { regular: number; trueDamage: number }): { applied: number; killed: boolean } {
  // 防御系统尚未存在；分开的真实伤害通道为以后绕过防御保留明确入口。
  const total = typeof damage === 'number' ? damage : damage.regular + damage.trueDamage;
  if (enemy.hp <= 0 || total <= 0) return { applied: 0, killed: false };
  const before = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - total);
  return { applied: before - enemy.hp, killed: enemy.hp === 0 };
}

export function executeEnemy(enemy: Enemy): { applied: number; killed: boolean } {
  if (enemy.hp <= 0 || enemy.isBoss) return { applied: 0, killed: false };
  const applied = enemy.hp;
  enemy.hp = 0;
  return { applied, killed: true };
}
