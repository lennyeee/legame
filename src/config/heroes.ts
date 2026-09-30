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
// 每级追加需求10/20/30/40，总计100；有效击杀+1，助攻+0.2。
export const heroGrowth = { expByLevel: [10, 20, 30, 40] as const,
  rewards: { kill: 1, assist: 0.2 }, damagePerLevel: 0.5, speedPerLevel: 0.08 };

export interface ActiveSkillDefinition {
  kind: 'active'; id: string; behavior: 'sequenceDamage' | 'selfBuff' | 'empoweredAttack' | 'stun' | 'allyBuff' | 'poison' | 'sword';
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
    skillName: '顺序打击',
    attackMode: 'single', combat: heroCombat, baseAttackRange: heroCombat.range, plannedAttackRange: heroCombat.range,
    skillId: 'xiaomei_barrage', skill: activeSkill({ id: 'xiaomei_barrage', behavior: 'sequenceDamage', damage: 100, damagePerLevel: 0.5,
      cooldown: 10000, cooldownReductionPerLevel: 0.08, minCooldown: 3000, maxTargets: 5, hitInterval: 150, flashDuration: 450 }),
    description: '中距离单体普攻，技能锁定当前HP最低的至多五个非Boss敌人依次打击。' },
  { id: 'abing', name: '阿饼', letters: ['阿', '饼'], available: true, cardColor: 'purple',
    skillName: '自身爆发',
    attackMode: 'splash', combat: heroCombat, baseAttackRange: 225, plannedAttackRange: 225,
    skillId: 'abing_burst', skill: tableSkill('abing_burst', 'selfBuff', [12000,11500,11000,10500,10000],
      level => ({ duration:4000, damageBonus:.3+(level-1)*.025, speedBonus:.3+(level-1)*.025 })),
    description: '自身爆发：4秒内普通攻击伤害和攻速提高30%～40%。' },
  { id: 'xiaoliu', name: '小六', letters: ['小', '六'], available: true, cardColor: 'purple',
    skillName: '七次强化',
    attackMode: 'splash', combat: heroCombat, baseAttackRange: heroCombat.range, plannedAttackRange: heroCombat.range,
    skillId: 'xiaoliu_haste', skill: activeSkill({ id: 'xiaoliu_haste', behavior: 'empoweredAttack', damage: 0, damagePerLevel: 0,
      cooldown: 12000, cooldownReductionPerLevel: 0.08, minCooldown: 3500, maxTargets: 0, hitInterval: 0, flashDuration: 450 }),
    description: '七次强化普攻：加速并提升20%～30%伤害，次数固定七次。' },
  { id: 'houjiang', name: '侯将', letters: ['侯', '将'], available: true, cardColor: 'gold',
    skillName: '大喝',
    attackMode: 'selfArea', combat: heroCombat, baseAttackRange: 180, plannedAttackRange: 180,
    skillId: 'houjiang_shout', skill: tableSkill('houjiang_shout','stun',[14000,13500,13000,12500,12000],
      level => ({ radius:180, duration:1200+(level-1)*150 })),
    description:'大喝：眩晕周围敌人1.2～1.8秒，其他状态继续计时。' },
  { id:'xiaozhan', name:'肖战', letters:['肖','战'], available:true, cardColor:'gold',
    skillName:'灌鸡汤',
    attackMode:'single', combat:heroCombat, baseAttackRange:230, plannedAttackRange:230,
    skillId:'xiaozhan_encourage', skill:tableSkill('xiaozhan_encourage','allyBuff',[15000,14250,13500,12750,12000],
      level=>({ radius:230,duration:5000,damageBonus:.15+(level-1)*.0125,speedBonus:.15+(level-1)*.0125 })),
    description:'灌鸡汤：周围战斗友军5秒内普攻伤害与攻速提高15%～20%。' },
  { id:'yongqi',name:'永琪',letters:['永','琪'],available:true,cardColor:'gold',
    skillName:'二手烟',
    attackMode:'splash',combat:heroCombat,baseAttackRange:230,plannedAttackRange:230,
    splashMultiplier:.7,skillId:'yongqi_smoke',skill:tableSkill('yongqi_smoke','poison',[14000,13500,13000,12500,12000],
      level=>({ radius:230,duration:4000,tickInterval:1000,dotDamage:6+(level-1),slow:.1+(level-1)*.0125 })),
    description:'二手烟：周围敌人中毒4秒，每秒受伤并减速10%～15%。' },
  { id:'xiaoqian',name:'小倩',letters:['小','倩'],available:true,cardColor:'gold',
    skillName:'专注',
    attackMode:'single',combat:heroCombat,baseAttackRange:180,plannedAttackRange:180,skillId:null,
    skill:{kind:'passive',id:'xiaoqian_focus',effectByLevel:levels(level=>({speedPerStack:.08+(level-1)*.005,maxStacks:6}))},
    description:'专注：连续攻击同一目标每次叠一层攻速，最多6层；失去或更换目标清零。' },
  { id:'abiao',name:'阿彪',letters:['阿','彪'],available:true,cardColor:'gold',
    skillName:'剑来',
    attackMode:'single',combat:heroCombat,baseAttackRange:300,plannedAttackRange:300,
    skillId:'abiao_sword',skill:tableSkill('abiao_sword','sword',[16000,15250,14500,13750,13000],
      level=>({ windup:400,damageMultiplier:1.2+(level-1)*.075 })),
    description:'剑来：短暂预警后对本方路径全部存活敌人造成基础普攻120%～150%的技能伤害。' },
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
