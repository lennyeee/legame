// DEVELOPMENT / TEMPORARY: Basic Live AI验证参数，不是正式匹配、人格或平衡规则。
export const aiConfig = {
  timing: {
    initialReactionMs: { min: 1200, max: 2200 },
    ordinaryActionMs: { min: 800, max: 1600 },
    recruitObservationMs: { min: 1200, max: 2200 },
    shovelActionMs: { min: 1000, max: 1900 },
  },
  minimumMoveDistanceCells: 0.5,
  scores: { collect: 140, merge: 120, hero: 110, item: 95, unlock: 80,
    deploy: 60, letter: 35, preparePair: 15, improvePosition: 25, sell: 20, recruit: 10,
    proximity: 5 },
} as const;

export const developmentAILoadout = {
  // 保证能验证Farmer，其他合法装备随机选取；不赠送任何局内单位或收益。
  requiredPassive: 'farmer',
  activeCount: 2,
  extraPassiveCount: 2,
  activePool: ['upgrade_talisman', 'golden_hand', 'haste_edict'],
  passivePool: ['iron_rice_bowl', 'golden_shovel', 'hero_recruitment'],
} as const;
