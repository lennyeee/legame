export const GAME_VERSION = '0.47';

export const gameConfig = {
  initialMoney: 100,
  incomePerSecond: 1,
  recruitmentCost: 10,
  slotCount: 5,
  recruitmentPool: ['刀', '枪', '弓', '骑', '铲', '赵', '云', '关', '羽', '张', '飞'],
} as const;

export type Recruit = (typeof gameConfig.recruitmentPool)[number];

// 普通兵与铲子各占 3/21，每个武将字占 1/21；只调整这里即可改变测试概率。
export const recruitmentWeights: Record<Recruit, number> = {
  刀: 3, 枪: 3, 弓: 3, 骑: 3, 铲: 3,
  赵: 1, 云: 1, 关: 1, 羽: 1, 张: 1, 飞: 1,
};
