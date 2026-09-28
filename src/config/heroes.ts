import { attackRangeCells, rangePixels } from './ranges';
import { clampLevel } from './levels';

export type ByLevel<T> = readonly [T, T, T, T, T];
export type LevelValues = ByLevel<number>;
export type SkillEffect = Readonly<Record<string, number>>;
export type HeroId = (typeof heroRegistry)[number]['id'];
export type SkillId = Exclude<(typeof heroRegistry)[number]['skillId'], null>;
export type HeroLetterType = (typeof heroRegistry)[number]['letters'][number];
export type HeroName = (typeof heroRegistry)[number]['name'];

export const heroCombat = { damage: 10, range: rangePixels(attackRangeCells.hero), attackInterval: 1200, splashRadius: 70 };
export const heroVisuals = { color: 0xb49a50, fill: 0xf5edce, sleepColor: '#8b8272' };
export const hasteConfig = { attacks: 7, speedMultiplier: 3, speedPerLevel: 0.2, minAttackInterval: 80 };
// 逐级需求；累计45/115/220/360 EXP，敌人仍奖励5，不改变有效参战规则。
export const heroGrowth = { expByLevel: [45, 70, 105, 140] as const, enemyExp: 5, damagePerLevel: 0.5, speedPerLevel: 0.08 };

export interface ActiveSkillDefinition {
  kind: 'active'; id: string; behavior: 'sequenceDamage' | 'execute' | 'empoweredAttack';
  damage: number; damagePerLevel: number;
  cooldown: number; cooldownReductionPerLevel: number; minCooldown: number;
  maxTargets: number; hitInterval: number; flashDuration: number;
  readonly cooldownByLevel: LevelValues;
  readonly effectByLevel: ByLevel<SkillEffect>;
}
// 每名武将独立的五级表接口；当前公式生成完全相同的数据，B可直接提供不同表。
function activeSkill(config: Omit<ActiveSkillDefinition, 'kind' | 'cooldownByLevel' | 'effectByLevel'>): ActiveSkillDefinition {
  return { ...config, kind: 'active',
    get cooldownByLevel() {
      return [1, 2, 3, 4, 5].map(level => Math.max(this.minCooldown,
        this.cooldown / (1 + (level - 1) * this.cooldownReductionPerLevel))) as unknown as LevelValues;
    },
    get effectByLevel() {
      return [1, 2, 3, 4, 5].map(level => ({
        damage: Math.round(this.damage * (1 + (level - 1) * this.damagePerLevel)), maxTargets: this.maxTargets,
        ...(this.behavior === 'empoweredAttack' ? { speedMultiplier: hasteConfig.speedMultiplier + (level - 1) * hasteConfig.speedPerLevel,
          attacks: hasteConfig.attacks, minAttackInterval: hasteConfig.minAttackInterval } : {}),
      })) as unknown as ByLevel<SkillEffect>;
    },
  };
}
export interface HeroDefinition {
  id: string; name: string; letters: readonly [string, string]; available: boolean;
  cardColor: 'purple' | 'gold'; // 仅视觉，不进入概率/成长/属性计算。
  attackMode: 'single' | 'splash' | 'selfArea' | null;
  combat: typeof heroCombat | null;
  baseAttackRange: number | null;
  plannedAttackRange: number | null;
  skillId: string | null;
  skill: ActiveSkillDefinition | { kind: 'passive'; id: string; effectByLevel: ByLevel<SkillEffect> | null }
    | { kind: 'plannedActive'; id: string; cooldownByLevel: LevelValues | null; effectByLevel: ByLevel<SkillEffect> | null };
  description: string;
}
export const heroRegistry = [
  { id: 'xiaomei', name: '小美', letters: ['小', '美'], available: true, cardColor: 'gold',
    attackMode: 'single', combat: heroCombat, baseAttackRange: heroCombat.range, plannedAttackRange: heroCombat.range,
    skillId: 'xiaomei_barrage', skill: activeSkill({ id: 'xiaomei_barrage', behavior: 'sequenceDamage', damage: 100, damagePerLevel: 0.5,
      cooldown: 10000, cooldownReductionPerLevel: 0.08, minCooldown: 3000, maxTargets: 5, hitInterval: 150, flashDuration: 450 }),
    description: '中距离单体普攻，技能锁定当前HP最低的至多五个非Boss敌人依次打击。' },
  { id: 'abing', name: '阿饼', letters: ['阿', '饼'], available: true, cardColor: 'purple',
    attackMode: 'splash', combat: heroCombat, baseAttackRange: heroCombat.range, plannedAttackRange: 225,
    skillId: 'abing_execute', skill: activeSkill({ id: 'abing_execute', behavior: 'execute', damage: 0, damagePerLevel: 0,
      cooldown: 14000, cooldownReductionPerLevel: 0.08, minCooldown: 4000, maxTargets: 1, hitInterval: 0, flashDuration: 450 }),
    description: '当前小范围普攻与最高HP非Boss处决；B阶段改为限时普攻伤害/攻速强化。' },
  { id: 'xiaoliu', name: '小六', letters: ['小', '六'], available: true, cardColor: 'purple',
    attackMode: 'splash', combat: heroCombat, baseAttackRange: heroCombat.range, plannedAttackRange: heroCombat.range,
    skillId: 'xiaoliu_haste', skill: activeSkill({ id: 'xiaoliu_haste', behavior: 'empoweredAttack', damage: 0, damagePerLevel: 0,
      cooldown: 12000, cooldownReductionPerLevel: 0.08, minCooldown: 3500, maxTargets: 0, hitInterval: 0, flashDuration: 450 }),
    description: '当前七次加速普攻；B阶段增加普攻伤害强化，次数仍固定七次。' },
  { id: 'houjiang', name: '侯将', letters: ['侯', '将'], available: false, cardColor: 'gold',
    attackMode: 'selfArea', combat: null, baseAttackRange: 180, plannedAttackRange: 180, skillId: null,
    skill: { kind: 'plannedActive', id: 'houjiang_shout', cooldownByLevel: null, effectByLevel: null },
    description: 'B阶段：自身周围范围普攻；大喝眩晕周围敌人，其他状态计时继续。' },
  { id: 'xiaozhan', name: '肖战', letters: ['肖', '战'], available: false, cardColor: 'gold',
    attackMode: null, combat: null, baseAttackRange: null, plannedAttackRange: null, skillId: null,
    skill: { kind: 'plannedActive', id: 'xiaozhan_encourage', cooldownByLevel: null, effectByLevel: null },
    description: 'B阶段：灌鸡汤强化周围可普攻友军的普通伤害与攻速，不强化技能/DOT。普攻规格待定。' },
  { id: 'yongqi', name: '永琪', letters: ['永', '琪'], available: false, cardColor: 'gold',
    attackMode: 'splash', combat: null, baseAttackRange: null, plannedAttackRange: null, skillId: null,
    skill: { kind: 'plannedActive', id: 'yongqi_smoke', cooldownByLevel: null, effectByLevel: null },
    description: 'B阶段：范围普攻；二手烟中毒持续伤害及可叠加的微弱减速。' },
  { id: 'xiaoqian', name: '小倩', letters: ['小', '倩'], available: false, cardColor: 'gold',
    attackMode: 'single', combat: null, baseAttackRange: 180, plannedAttackRange: 180, skillId: null,
    skill: { kind: 'passive', id: 'xiaoqian_focus', effectByLevel: null },
    description: 'B阶段：纯被动，同目标持续攻击逐渐加速，换目标/死亡/离开范围重置。' },
  { id: 'abiao', name: '阿彪', letters: ['阿', '彪'], available: false, cardColor: 'gold',
    attackMode: null, combat: null, baseAttackRange: 300, plannedAttackRange: 300, skillId: null,
    skill: { kind: 'plannedActive', id: 'abiao_sword', cooldownByLevel: null, effectByLevel: null },
    description: 'B阶段：剑来在落下时攻击整条本方敌人路径上的存活敌人，无视普攻射程。普攻方式待定。' },
] as const satisfies readonly HeroDefinition[];

// 既有调用名称兼容；名单只从注册表派生，未开放配方不能激活。
export const heroRecipes = heroRegistry.filter(hero => hero.available);
export const recruitableHeroLetters = [...new Set(heroRecipes.flatMap(hero => hero.letters))];
export function getHeroDefinition(id: HeroId) {
  const definition = heroRegistry.find(hero => hero.id === id);
  if (!definition) throw new Error(`未注册武将：${id}`);
  return definition;
}
export function heroExpRequired(level: number): number {
  return heroGrowth.expByLevel[clampLevel(level) - 1] ?? Infinity;
}
export function getHeroStats(level: number, id: HeroId = 'xiaomei') {
  const definition = getHeroDefinition(id);
  const base = definition.combat;
  if (!definition.available || !base || definition.baseAttackRange === null) throw new Error(`武将尚未开放：${id}`);
  return { damage: Math.round(base.damage * (1 + (level - 1) * heroGrowth.damagePerLevel)),
    attackInterval: base.attackInterval / (1 + (level - 1) * heroGrowth.speedPerLevel), range: definition.baseAttackRange };
}
