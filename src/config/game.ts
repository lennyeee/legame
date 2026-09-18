export const GAME_VERSION = '0.40';

export const gameConfig = {
  initialMoney: 100,
  incomePerSecond: 1,
  recruitmentCost: 10,
  slotCount: 5,
  recruitmentPool: ['刀', '枪', '弓', '骑', '铲'],
} as const;

export type Recruit = (typeof gameConfig.recruitmentPool)[number];
