import { recruitableHeroLetters } from './heroes';

export const GAME_VERSION = '0.68-A';

export const gameConfig = {
  initialMoney: 20,
  recruitmentCost: 10,
  recruitmentPriceIncrease: 2,
  slotCount: 5,
  recruitmentPool: ['刀', '枪', '弓', '骑', '铲', ...recruitableHeroLetters],
} as const;

export type Recruit = (typeof gameConfig.recruitmentPool)[number];

// 普通兵与铲子权重各3，每种去重后的武将字权重1；只调整这里即可改变测试概率。
export const recruitmentWeights: Record<Recruit, number> = {
  刀: 3, 枪: 3, 弓: 3, 骑: 3, 铲: 3,
  ...Object.fromEntries(recruitableHeroLetters.map(letter => [letter, 1])),
} as Record<Recruit, number>;
