import type { Enemy } from './enemies';

export interface PercentDamage {
  basis: 'maxHp' | 'missingHp';
  ratio: number;
  trueDamage?: boolean;
}

// 读取本次命中前的HP；未来Boss可单独调低百分比伤害倍率。
export function resolvePercentDamage(enemy: Enemy, special: PercentDamage, heroMultiplier = 1): number {
  const basis = special.basis === 'maxHp' ? enemy.maxHp : Math.max(0, enemy.maxHp - enemy.hp);
  return Math.max(0, basis * special.ratio * (enemy.percentDamageMultiplier ?? 1) * heroMultiplier);
}
