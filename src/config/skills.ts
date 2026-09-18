export const skillConfigs = {
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
export type SkillId = keyof typeof skillConfigs;
export function getSkillStats(id: SkillId, level: number) {
  const config = skillConfigs[id];
  return { ...config,
    damage: Math.round(config.damage * (1 + (level - 1) * config.damagePerLevel)),
    cooldown: Math.max(config.minCooldown, config.cooldown / (1 + (level - 1) * config.cooldownReductionPerLevel)),
  };
}
