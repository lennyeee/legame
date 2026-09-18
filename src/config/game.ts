export const GAME_VERSION = '0.49';

export const gameConfig = {
  initialMoney: 100,
  incomePerSecond: 1,
  recruitmentCost: 10,
  slotCount: 5,
  recruitmentPool: ['刀', '枪', '弓', '骑', '铲', '小', '美', '阿', '饼', '六'],
} as const;

export type Recruit = (typeof gameConfig.recruitmentPool)[number];

// 普通兵与铲子各占 3/20，每个武将字占 1/20；只调整这里即可改变测试概率。
export const recruitmentWeights: Record<Recruit, number> = {
  刀: 3, 枪: 3, 弓: 3, 骑: 3, 铲: 3,
  小: 1, 美: 1, 阿: 1, 饼: 1, 六: 1,
};
