import { itemAttackInterval } from './itemEffects';
import type { Unit } from '../systems/items';
import { attackRangeCells, rangePixels } from './ranges';

export interface CombatStats {
  damage: number;
  attackInterval: number; // 毫秒
  range: number; // 750×1334 逻辑像素，以敌人中心判定
}

export const unitCombatStats: Record<Unit['type'], CombatStats> = {
  刀: { damage: 12, attackInterval: 450, range: rangePixels(attackRangeCells.刀) },
  枪: { damage: 18, attackInterval: 1250, range: rangePixels(attackRangeCells.枪) },
  弓: { damage: 30, attackInterval: 1700, range: rangePixels(attackRangeCells.弓) },
  骑: { damage: 22, attackInterval: 1600, range: rangePixels(attackRangeCells.骑) },
};

export const combatConfig = {
  enemy: { maxHp: 90, moveSpeed: 55, killReward: 5 },
  stepMs: 1000 / 60,
  maxFrameMs: 250, // 切回页面时不瞬间补发大量敌人和攻击
  growth: { damageMultiplier: 1.55, attackSpeedPerLevel: 0.08 },
  spearWidth: 32,
  arrowSpeed: 560,
  visuals: {
    enemyRadius: 15,
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
  const base = unitCombatStats[unit.type];
  const upgrades = Math.max(0, unit.level - 1);
  return {
    damage: Math.round(base.damage * combatConfig.growth.damageMultiplier ** upgrades),
    attackInterval: itemAttackInterval(base.attackInterval / (1 + combatConfig.growth.attackSpeedPerLevel * upgrades), unit.hasteEnhanced),
    range: unit.type === '弓' && unit.level >= 2 ? rangePixels(attackRangeCells.弓进阶) : base.range,
  };
}
