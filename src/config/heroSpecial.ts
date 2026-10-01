import { clampLevel } from './levels';

// 特殊伤害只在现有攻击/技能实际命中时结算；百分比均以小数表示。
export const heroSpecial = {
  xiaomeiMaxHp: [0.18, 0.21, 0.24, 0.27, 0.30],
  yongqiDotMaxHpTotal: [0.12, 0.14, 0.16, 0.18, 0.20],
  abiaoMissingHpTrue: [0.15, 0.20, 0.25, 0.30, 0.35],
  xiaoqianMaxHpByHit: [0.02, 0.03, 0.04, 0.05, 0.06],
  xiaoliuEmpoweredMaxHp: [0.04, 0.05, 0.06, 0.07, 0.08],
  xiaoliuFinalMaxHpTrue: [0.10, 0.125, 0.15, 0.175, 0.20],
  abingBuffMaxHp: [0.015, 0.02, 0.025, 0.03, 0.035],
  xiaozhanSpecialMultiplier: [1.10, 1.125, 1.15, 1.175, 1.20],
  houjiangVulnerability: { durationMs: 3000, bonus: 0.10 },
} as const;

export function specialAtLevel(values: readonly number[], level: number): number {
  return values[clampLevel(level) - 1]!;
}
