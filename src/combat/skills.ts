import { getSkillStats, hasteConfig } from '../config/skills';
import { getHeroStats } from '../config/heroes';
import type { SkillId } from '../config/skills';
import type { Enemy } from './enemies';
import type { HeroLink } from '../systems/heroActivation';
import { selectTarget } from './targeting';
import { MAX_LEVEL } from '../config/levels';
import { heroSpecial, specialAtLevel } from '../config/heroSpecial';
import type { PercentDamage } from './specialDamage';

export interface SkillState {
  skillId: SkillId;
  phase: 'charging' | 'ready' | 'casting' | 'empowered';
  remainingAttacks: number;
  cooldownElapsed: number;
  cooldownDuration: number;
  targetIds: number[];
  nextTarget: number;
  hitElapsed: number;
  castDamage: number;
  castRemaining: number;
}
export type SkillEvent = {
  kind: 'skillStart' | 'skillHit' | 'skillEnd';
  skillId: SkillId;
  link: HeroLink;
  targetId?: number;
};

export function createSkillState(skillId: SkillId, level: number): SkillState {
  return { skillId, phase: 'charging', cooldownElapsed: 0, cooldownDuration: getSkillStats(skillId, level).cooldown,
    targetIds: [], nextTarget: 0, hitElapsed: 0, castDamage: 0, remainingAttacks: 0, castRemaining: 0 };
}

// 后续技能在此登记选敌策略，身份和显示名不参与技能核心判定。
const selectors: Partial<Record<SkillId, (enemies: readonly Enemy[], maxTargets: number) => number[]>> = {
  xiaomei_barrage: (enemies, maxTargets) => enemies.filter(enemy => enemy.hp > 0 && !enemy.isBoss)
    .sort((a, b) => a.hp - b.hp || a.id - b.id).slice(0, maxTargets).map(enemy => enemy.id),
};

export function heroAttackInterval(link: HeroLink, base: number): number {
  if (link.skill?.phase !== 'empowered') return base;
  const effect = getSkillStats(link.skill.skillId, link.level).effectByLevel[Math.min(MAX_LEVEL, link.level) - 1]!;
  const multiplier = link.level > MAX_LEVEL ? hasteConfig.speedMultiplier + (link.level - 1) * hasteConfig.speedPerLevel : effect.speedMultiplier!;
  return Math.max(effect.minAttackInterval!, base / multiplier);
}

export function consumeEmpoweredAttack(link: HeroLink, emit: (event: SkillEvent) => void): void {
  const state = link.skill;
  if (state?.phase !== 'empowered') return;
  if (--state.remainingAttacks === 0) {
    state.phase = 'charging';
    state.cooldownElapsed = 0;
    emit({ kind: 'skillEnd', skillId: state.skillId, link });
  }
}

// 仅推进逻辑时间并产生事件；不使用动画回调、音效或 Phaser Timer 结算伤害。
export function updateHeroSkill(link: HeroLink, enemies: readonly Enemy[], deltaMs: number,
  hit: (enemy: Enemy, damage: number, link: HeroLink, special?: PercentDamage) => void, emit: (event: SkillEvent) => void,
  ordinaryAttackRange = getHeroStats(link.level, link.heroId).range,
  applyEffect?: (link:HeroLink, effect:Readonly<Record<string,number>>, behavior:string)=>void): void {
  const state = link.skill;
  if (!state) return;
  const stats = getSkillStats(state.skillId, link.level);
  state.cooldownDuration = stats.cooldown;
  if (state.phase === 'empowered') return;
  // 普攻射程内存在存活目标才积累CD；与普攻自身的出手间隔无关。
  const hasAttackTarget = selectTarget(enemies, link.origin, ordinaryAttackRange) !== null;
  if (state.phase === 'charging' && hasAttackTarget) {
    state.cooldownElapsed = Math.min(state.cooldownDuration, state.cooldownElapsed + deltaMs);
  }
  if (stats.behavior === 'empoweredAttack') {
    if (state.cooldownElapsed + 1e-8 < state.cooldownDuration) return;
    state.phase = 'ready';
    if (!hasAttackTarget) return;
    state.phase = 'empowered';
    state.remainingAttacks = stats.effectByLevel[link.level - 1]!.attacks!;
    state.cooldownElapsed = 0;
    emit({ kind: 'skillStart', skillId: state.skillId, link });
    return;
  }
  if (stats.behavior !== 'sequenceDamage') {
    const effect = stats.effectByLevel[Math.min(MAX_LEVEL,link.level)-1]!;
    if (state.phase !== 'casting') {
      if(state.cooldownElapsed+1e-8<state.cooldownDuration)return;
      state.phase='ready';
      if(!hasAttackTarget)return;
      emit({kind:'skillStart',skillId:state.skillId,link});
      state.cooldownElapsed=0;
      if(stats.behavior==='sword') {
        state.phase='casting';state.castRemaining=effect.windup!;
        state.castDamage=getHeroStats(link.level,link.heroId).damage*effect.damageMultiplier!;
        return;
      }
      applyEffect?.(link,effect,stats.behavior);
      state.phase='charging';emit({kind:'skillEnd',skillId:state.skillId,link});return;
    }
    state.castRemaining-=deltaMs;
    if(state.castRemaining>1e-8)return;
    // 落剑时读取本Side当前存活实体，包含预警后入场者，不锁开始时的名单。
    for(const enemy of enemies.filter(e=>e.hp>0)) {
      hit(enemy,state.castDamage,link,{basis:'missingHp',
        ratio:specialAtLevel(heroSpecial.abiaoMissingHpTrue,link.level),trueDamage:true});
      emit({kind:'skillHit',skillId:state.skillId,link,targetId:enemy.id});
    }
    state.phase='charging';emit({kind:'skillEnd',skillId:state.skillId,link});return;
  }
  if (state.phase !== 'casting') {
    if (state.cooldownElapsed + 1e-8 < state.cooldownDuration) return;
    state.phase = 'ready';
    const targets = selectors[state.skillId]!(enemies, stats.maxTargets);
    if (!targets.length) return;
    state.targetIds = targets;
    state.nextTarget = 0;
    state.castDamage = stats.damage;
    state.hitElapsed = stats.hitInterval; // 第一击在发动时处理，之后按固定间隔推进。
    state.cooldownElapsed = 0;
    state.phase = 'casting';
    emit({ kind: 'skillStart', skillId: state.skillId, link });
  } else state.hitElapsed += deltaMs;
  if (state.hitElapsed + 1e-8 < stats.hitInterval) return;
  state.hitElapsed -= stats.hitInterval;
  const id = state.targetIds[state.nextTarget++]!;
  const target = enemies.find(enemy => enemy.id === id && enemy.hp > 0 && !enemy.isBoss);
  if (target) {
    hit(target, state.castDamage, link,{basis:'maxHp',ratio:specialAtLevel(heroSpecial.xiaomeiMaxHp,link.level)});
    emit({ kind: 'skillHit', skillId: state.skillId, link, targetId: target.id });
  }
  if (state.nextTarget === state.targetIds.length) {
    state.phase = 'charging';
    state.targetIds = [];
    emit({ kind: 'skillEnd', skillId: state.skillId, link });
  }
}

export function heroBasicDamageMultiplier(link:HeroLink):number {
  return link.skill?.phase==='empowered'
    ? 1+getSkillStats(link.skill.skillId,link.level).effectByLevel[Math.min(MAX_LEVEL,link.level)-1]!.damageBonus! : 1;
}
