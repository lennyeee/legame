import { itemAttackInterval } from './itemEffects';
import type { Unit } from '../systems/items';
import { attackRangeCells, bowRangeCellsByLevel, rangePixels } from './ranges';
import { clampLevel } from './levels';

export interface CombatStats {
  damage: number;
  attackInterval: number; // 毫秒
  range: number; // 圆形攻击半径；索敌判断与敌人的受击圆相交。
}

export const ordinaryAttackSpeeds = [1.25, 1.88, 2.62, 3.41, 4.27] as const;
export const ordinaryDamageByLevel = {
  刀: [3, 4.5, 6.3, 8.19, 10.24],
  枪: [2, 3, 4.2, 5.46, 6.82],
  弓: [2, 3, 4.2, 5.46, 6.82],
  骑: [2, 3, 4.2, 5.46, 6.82],
} as const;
// 五级明确标尺；伤害保留小数，攻击间隔由每秒攻击次数换算。
function levelStats(type: Unit['type']): readonly CombatStats[] {
  return ordinaryDamageByLevel[type].map((damage, i) => ({ damage,
    attackInterval: 1000 / ordinaryAttackSpeeds[i]!,
    range: rangePixels(type === '弓' ? bowRangeCellsByLevel[i]! : attackRangeCells[type]),
  }));
}
export const unitLevelStats: Record<Unit['type'], readonly CombatStats[]> = {
  刀: levelStats('刀'), 枪: levelStats('枪'), 弓: levelStats('弓'), 骑: levelStats('骑'),
};
export const unitCombatStats = Object.fromEntries(
  (Object.keys(unitLevelStats) as Unit['type'][]).map(type => [type, unitLevelStats[type][0]!]),
) as Record<Unit['type'], CombatStats>;

export const combatConfig = {
  enemy: { maxHp: 10, moveSpeed: 45, killReward: 1, hitRadius: 20 },
  stepMs: 1000 / 60,
  maxFrameMs: 250, // 切回页面时不瞬间补发大量敌人和攻击
  spearWidth: 32,
  arrowSpeed: 560,
  visuals: {
    enemyRadius: 21,
    enemyColor: 0xa85c4d,
    hitColor: 0xffffff,
    hitFlashMs: 140,
    attackEffectMs: 220,
    rewardMs: 800,
    attackColors: { 刀: 0xf0b65d, 枪: 0x68b9c7, 弓: 0x866947, 骑: 0xd79b65 },
  },
};

export type CombatConfig = typeof combatConfig;

export function getCombatStats(unit: Unit): CombatStats {
  const base = unitLevelStats[unit.type][clampLevel(unit.level) - 1]!;
  return {
    ...base,
    attackInterval: itemAttackInterval(base.attackInterval, unit.hasteEnhanced),
  };
}
