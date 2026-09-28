import { heroRecipes } from './heroes';
import type { ActiveSkillDefinition, SkillId } from './heroes';
import { clampLevel } from './levels';
import { MAX_LEVEL } from './levels';
export type { SkillId } from './heroes';
export { hasteConfig } from './heroes';
// Registry同一对象的技能索引，不维护第二套静态参数。
export const skillConfigs = Object.fromEntries(heroRecipes.flatMap(hero =>
  hero.skill.kind === 'active' ? [[hero.skill.id, hero.skill]] : [])) as Record<SkillId, ActiveSkillDefinition>;
export function getSkillStats(id: SkillId, level: number) {
  const config = skillConfigs[id];
  const index = clampLevel(level) - 1;
  // 非法高等级的旧诊断调用仍有安全下限；正式单位始终由MAX_LEVEL封顶。
  return { ...config, ...config.effectByLevel[index],
    damage: level > MAX_LEVEL ? Math.round(config.damage * (1 + (level - 1) * config.damagePerLevel)) : config.effectByLevel[index]!.damage!,
    cooldown: level > MAX_LEVEL ? Math.max(config.minCooldown, config.cooldown / (1 + (level - 1) * config.cooldownReductionPerLevel)) : config.cooldownByLevel[index]! };
}
