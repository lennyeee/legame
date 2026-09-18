export const skillConfigs = {
  abing_execute: {
    damage: 0, damagePerLevel: 0, cooldown: 14000, cooldownReductionPerLevel: 0.08,
    minCooldown: 4000, maxTargets: 1, hitInterval: 0, flashDuration: 450,
  },
  xiaoliu_haste: {
    damage: 0, damagePerLevel: 0, cooldown: 12000, cooldownReductionPerLevel: 0.08,
    minCooldown: 3500, maxTargets: 0, hitInterval: 0, flashDuration: 450,
  },
  xiaomei_barrage: {
    damage: 100,
    damagePerLevel: 0.5,
    cooldown: 10000,
    cooldownReductionPerLevel: 0.08,
    minCooldown: 3000,
    maxTargets: 5,
    hitInterval: 150,
    flashDuration: 450,
  },
} as const;
export const hasteConfig = { attacks: 7, speedMultiplier: 3, speedPerLevel: 0.2, minAttackInterval: 80 };
export type SkillId = keyof typeof skillConfigs;
export function getSkillStats(id: SkillId, level: number) {
  const config = skillConfigs[id];
  return { ...config,
    damage: Math.round(config.damage * (1 + (level - 1) * config.damagePerLevel)),
    cooldown: Math.max(config.minCooldown, config.cooldown / (1 + (level - 1) * config.cooldownReductionPerLevel)),
  };
}
