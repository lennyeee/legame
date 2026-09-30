import { recruitableHeroLetters } from './heroes';

export const GAME_VERSION = '0.69-D';

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
  default: { ordinary: 70, shovel: 15, heroLetter: 15, farmer: 0 },
  hero: { ordinary: 61, shovel: 14, heroLetter: 25, farmer: 0 },
  farmer: { ordinary: 64, shovel: 15, heroLetter: 15, farmer: 6 },
  heroAndFarmer: { ordinary: 55, shovel: 14, heroLetter: 25, farmer: 6 },
} as const;
