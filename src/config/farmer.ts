import { clampLevel } from './levels';

export const farmerConfig = {
  recruitmentWeight: 4, // 普通池20：4/24；招贤榜池25：4/29，约为旧单格概率的一半。
  productionMs: 12_000,
  rewardLifetimeMs: 5000,
  dollarsPerLevel: 1,
};
// 屏幕尺寸；双方使用相同样式，矩形本身同时作为领取触摸区域。
export const farmerRewardVisual = { width: 90, height: 38, fontSize: 29, offsetY: 34, edgeOffsetY: 52 } as const;
export const farmerYield = (level: number): number => clampLevel(level) * farmerConfig.dollarsPerLevel;
