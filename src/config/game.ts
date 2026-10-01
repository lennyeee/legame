import { recruitableHeroLetters } from './heroes';

export const GAME_VERSION = '0.71';

export const gameConfig = {
  initialMoney: 20,
  recruitmentCost: 10,
  recruitmentPriceIncrease: 2,
  slotCount: 5,
  recruitmentPool: ['刀', '枪', '弓', '骑', '铲', ...recruitableHeroLetters],
} as const;

export type Recruit = (typeof gameConfig.recruitmentPool)[number];

// 类别百分比，每行合计100。52 = lcm(4种兵,13种字)，使每种兵/字都获得整数权重。
export const recruitmentCategoryScale = 52;
export const recruitmentCategories = {
  default: { ordinary: 73, shovel: 15, heroLetter: 12, farmer: 0 },
  hero: { ordinary: 69, shovel: 14, heroLetter: 17, farmer: 0 },
  farmer: { ordinary: 67, shovel: 15, heroLetter: 12, farmer: 6 },
  heroAndFarmer: { ordinary: 63, shovel: 14, heroLetter: 17, farmer: 6 },
} as const;
