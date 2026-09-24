import { clampLevel } from './levels';

export const farmerConfig = {
  recruitmentWeight: 10, // 原池总权重20；装备后农民占10/30，方便测试。
  productionMs: 12_000,
  rewardLifetimeMs: 5000,
  dollarsPerLevel: 1,
};
export const farmerYield = (level: number): number => clampLevel(level) * farmerConfig.dollarsPerLevel;
