import { attackRangeCells, rangePixels } from './ranges';
import { clampLevel } from './levels';

export type ByLevel<T> = readonly [T, T, T, T, T];
export type LevelValues = ByLevel<number>;
export type SkillEffect = Readonly<Record<string, number>>;
export type HeroId = (typeof heroRegistry)[number]['id'];
export type SkillId = Exclude<(typeof heroRegistry)[number]['skillId'], null>;
export type HeroLetterType = (typeof heroRegistry)[number]['letters'][number];
export type HeroName = (typeof heroRegistry)[number]['name'];

export const heroCombat = { range: rangePixels(attackRangeCells.hero), splashRadius: 70 };
export const heroVisuals = { color: 0xb49a50, fill: 0xf5edce, sleepColor: '#8b8272' };
export const hasteConfig = { attacks: 7, speedMultiplier: 3, speedPerLevel: 0.2, minAttackInterval: 80 };
// 每级追加需求10/20/30/40，总计100；有效击杀+1，助攻+0.2。
export const heroGrowth = { expByLevel: [10, 20, 30, 40] as const,
  rewards: { kill: 1, assist: 0.2 } };

export interface ActiveSkillDefinition {
  kind: 'active'; id: string; behavior: 'sequenceDamage' | 'selfBuff' | 'empoweredAttack' | 'stun' | 'allyBuff' | 'poison' | 'sword';
  damage: number; damagePerLevel: number;
  cooldown: number; cooldownReductionPerLevel: number; minCooldown: number;
  maxTargets: number; hitInterval: number; flashDuration: number;
  readonly cooldownByLevel: LevelValues;
  readonly effectByLevel: ByLevel<SkillEffect>;
}
// 技能的等级成长独立于武将普攻基础属性表。
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
          damageBonus: 0.2 + (level - 1) * 0.025, attacks: hasteConfig.attacks, minAttackInterval: hasteConfig.minAttackInterval } : {}),
      })) as unknown as ByLevel<SkillEffect>;
    },
  };
}
function levels<T>(value:(level:number)=>T):ByLevel<T> { return [value(1),value(2),value(3),value(4),value(5)]; }
function tableSkill(id:string,behavior:ActiveSkillDefinition['behavior'],cooldowns:LevelValues,
  effect:(level:number)=>SkillEffect):ActiveSkillDefinition {
  return {kind:'active',id,behavior,damage:0,damagePerLevel:0,cooldown:cooldowns[0],cooldownReductionPerLevel:0,
    minCooldown:cooldowns[4],maxTargets:0,hitInterval:0,flashDuration:450,
    cooldownByLevel:cooldowns,effectByLevel:levels(level=>({damage:0,...effect(level)}))};
}
export const statusConfig = { minimumMoveSpeedRatio: .25 };
export interface HeroDefinition {
  id: string; name: string; letters: readonly [string, string]; available: boolean;
  skillName: string;
  cardColor: 'purple' | 'gold'; // 仅视觉，不进入概率/成长/属性计算。
  attackMode: 'single' | 'splash' | 'selfArea' | null;
  attackDamageByLevel: LevelValues;
  attacksPerSecondByLevel: LevelValues;
  combat: typeof heroCombat | null;
  baseAttackRange: number | null;
  plannedAttackRange: number | null;
  skillId: string | null;
  skill: ActiveSkillDefinition | { kind: 'passive'; id: string; effectByLevel: ByLevel<SkillEffect> | null }
    | { kind: 'plannedActive'; id: string; cooldownByLevel: LevelValues | null; effectByLevel: ByLevel<SkillEffect> | null };
  splashMultiplier?: number;
  description: string;
}
export const heroRegistry = [
  { id: 'xiaomei', name: '小美', letters: ['小', '美'], available: true, cardColor: 'gold',
    attackDamageByLevel: [10,14,19,25,32], attacksPerSecondByLevel: [1.30,1.50,1.70,1.90,2.10],
    skillName: '顺序打击',
    attackMode: 'single', combat: heroCombat, baseAttackRange: heroCombat.range, plannedAttackRange: heroCombat.range,
    skillId: 'xiaomei_barrage', skill: activeSkill({ id: 'xiaomei_barrage', behavior: 'sequenceDamage', damage: 100, damagePerLevel: 0.5,
      cooldown: 10000, cooldownReductionPerLevel: 0.08, minCooldown: 3000, maxTargets: 5, hitInterval: 150, flashDuration: 450 }),
    description: '中距离单体普攻；技能依次打击至多五个低HP非Boss敌人，额外造成18%～30%最大生命值伤害。' },
  { id: 'abing', name: '阿饼', letters: ['阿', '饼'], available: true, cardColor: 'purple',
    attackDamageByLevel: [8,11,15,20,26], attacksPerSecondByLevel: [1.25,1.45,1.65,1.85,2.05],
    skillName: '自身爆发',
    attackMode: 'splash', combat: heroCombat, baseAttackRange: 225, plannedAttackRange: 225,
    skillId: 'abing_burst', skill: tableSkill('abing_burst', 'selfBuff', [12000,11500,11000,10500,10000],
      level => ({ duration:4000, damageBonus:.3+(level-1)*.025, speedBonus:.3+(level-1)*.025 })),
    description: '自身爆发：4秒内普攻伤害和攻速提高30%～40%，AOE每次命中额外造成1.5%～3.5%最大生命值伤害。' },
  { id: 'xiaoliu', name: '小六', letters: ['小', '六'], available: true, cardColor: 'purple',
    attackDamageByLevel: [8,11,15,20,26], attacksPerSecondByLevel: [1.10,1.25,1.40,1.55,1.70],
    skillName: '七次强化',
    attackMode: 'splash', combat: heroCombat, baseAttackRange: heroCombat.range, plannedAttackRange: heroCombat.range,
    skillId: 'xiaoliu_haste', skill: activeSkill({ id: 'xiaoliu_haste', behavior: 'empoweredAttack', damage: 0, damagePerLevel: 0,
      cooldown: 12000, cooldownReductionPerLevel: 0.08, minCooldown: 3500, maxTargets: 0, hitInterval: 0, flashDuration: 450 }),
    description: '七次强化普攻：加速、增伤，前六击附加4%～8%最大生命值伤害，第七击附加10%～20%真实伤害。' },
  { id: 'houjiang', name: '侯将', letters: ['侯', '将'], available: true, cardColor: 'gold',
    attackDamageByLevel: [9,13,18,24,31], attacksPerSecondByLevel: [1.05,1.20,1.35,1.50,1.65],
    skillName: '大喝',
    attackMode: 'selfArea', combat: heroCombat, baseAttackRange: 180, plannedAttackRange: 180,
    skillId: 'houjiang_shout', skill: tableSkill('houjiang_shout','stun',[14000,13500,13000,12500,12000],
      level => ({ radius:180, duration:1200+(level-1)*150 })),
    description:'大喝：眩晕周围敌人1.2～1.8秒，并施加3秒易伤（受到所有伤害+10%）。' },
  { id:'xiaozhan', name:'肖战', letters:['肖','战'], available:true, cardColor:'gold',
    attackDamageByLevel: [8,11,15,20,26], attacksPerSecondByLevel: [1.10,1.25,1.40,1.55,1.70],
    skillName:'灌鸡汤',
    attackMode:'single', combat:heroCombat, baseAttackRange:230, plannedAttackRange:230,
    skillId:'xiaozhan_encourage', skill:tableSkill('xiaozhan_encourage','allyBuff',[15000,14250,13500,12750,12000],
      level=>({ radius:230,duration:5000,damageBonus:.15+(level-1)*.0125,speedBonus:.15+(level-1)*.0125 })),
    description:'灌鸡汤：周围友军5秒内普攻伤害与攻速提高15%～20%；英雄特殊伤害另乘1.10～1.20。' },
  { id:'yongqi',name:'永琪',letters:['永','琪'],available:true,cardColor:'gold',
    attackDamageByLevel: [9,13,18,24,31], attacksPerSecondByLevel: [1.10,1.25,1.40,1.55,1.70],
    skillName:'二手烟',
    attackMode:'splash',combat:heroCombat,baseAttackRange:230,plannedAttackRange:230,
    splashMultiplier:.7,skillId:'yongqi_smoke',skill:tableSkill('yongqi_smoke','poison',[14000,13500,13000,12500,12000],
      level=>({ radius:230,duration:4000,tickInterval:1000,dotDamage:6+(level-1),slow:.1+(level-1)*.0125 })),
    description:'二手烟：周围敌人中毒4秒，每秒受固定伤害，合计另受12%～20%最大生命值伤害，并减速10%～15%。' },
  { id:'xiaoqian',name:'小倩',letters:['小','倩'],available:true,cardColor:'gold',
    attackDamageByLevel: [10,15,21,28,36], attacksPerSecondByLevel: [1.30,1.50,1.70,1.90,2.10],
    skillName:'专注',
    attackMode:'single',combat:heroCombat,baseAttackRange:180,plannedAttackRange:180,skillId:null,
    skill:{kind:'passive',id:'xiaoqian_focus',effectByLevel:levels(level=>({speedPerStack:.08+(level-1)*.005,maxStacks:6}))},
    description:'专注：同目标叠攻速至多6层；连击额外造成2%/3%/4%/5%/6%最大生命值伤害，换目标重置。' },
  { id:'abiao',name:'阿彪',letters:['阿','彪'],available:true,cardColor:'gold',
    attackDamageByLevel: [14,20,28,37,48], attacksPerSecondByLevel: [.95,1.05,1.15,1.25,1.35],
    skillName:'剑来',
    attackMode:'single',combat:heroCombat,baseAttackRange:300,plannedAttackRange:300,
    skillId:'abiao_sword',skill:tableSkill('abiao_sword','sword',[16000,15250,14500,13750,13000],
      level=>({ windup:400,damageMultiplier:1.2+(level-1)*.075 })),
    description:'剑来：预警后攻击本方路径全部存活敌人，原普攻120%～150%伤害外再附加15%～35%已损失生命值真实伤害。' },
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
  const index = clampLevel(level) - 1;
  return { damage: definition.attackDamageByLevel[index],
    attackInterval: 1000 / definition.attacksPerSecondByLevel[index], range: definition.baseAttackRange };
}
