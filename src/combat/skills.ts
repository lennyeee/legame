import { getSkillStats } from '../config/skills';
import type { SkillId } from '../config/skills';
import type { Enemy } from './enemies';
import type { HeroLink } from '../systems/heroActivation';

export interface SkillState {
  skillId: SkillId;
  phase: 'charging' | 'ready' | 'casting';
  cooldownElapsed: number;
  cooldownDuration: number;
  targetIds: number[];
  nextTarget: number;
  hitElapsed: number;
  castDamage: number;
}
export type SkillEvent = {
  kind: 'skillStart' | 'skillHit' | 'skillEnd';
  skillId: SkillId;
  link: HeroLink;
  targetId?: number;
};

export function createSkillState(skillId: SkillId, level: number): SkillState {
  return { skillId, phase: 'charging', cooldownElapsed: 0, cooldownDuration: getSkillStats(skillId, level).cooldown,
    targetIds: [], nextTarget: 0, hitElapsed: 0, castDamage: 0 };
}

// 后续技能在此登记选敌策略，身份和显示名不参与技能核心判定。
const selectors: Record<SkillId, (enemies: readonly Enemy[], maxTargets: number) => number[]> = {
  xiaomei_barrage: (enemies, maxTargets) => enemies.filter(enemy => enemy.hp > 0 && !enemy.isBoss)
    .sort((a, b) => a.hp - b.hp || a.id - b.id).slice(0, maxTargets).map(enemy => enemy.id),
};

// 仅推进逻辑时间并产生事件；不使用动画回调、音效或 Phaser Timer 结算伤害。
export function updateHeroSkill(link: HeroLink, enemies: readonly Enemy[], deltaMs: number,
  hit: (enemy: Enemy, damage: number, link: HeroLink) => void, emit: (event: SkillEvent) => void): void {
  const state = link.skill;
  if (!state) return;
  const stats = getSkillStats(state.skillId, link.level);
  state.cooldownDuration = stats.cooldown;
  state.cooldownElapsed = Math.min(state.cooldownDuration, state.cooldownElapsed + deltaMs);
  if (state.phase !== 'casting') {
    if (state.cooldownElapsed + 1e-8 < state.cooldownDuration) return;
    state.phase = 'ready';
    const targets = selectors[state.skillId](enemies, stats.maxTargets);
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
    hit(target, state.castDamage, link);
    emit({ kind: 'skillHit', skillId: state.skillId, link, targetId: target.id });
  }
  if (state.nextTarget === state.targetIds.length) {
    state.phase = 'charging';
    state.targetIds = [];
    emit({ kind: 'skillEnd', skillId: state.skillId, link });
  }
}
