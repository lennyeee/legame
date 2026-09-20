import type { BoardMap } from '../config/maps';
import type { BoardState } from './board';
import { getHeroLinks, getHasteCarrier } from './heroActivation';
import type { HeroLink } from './heroActivation';
import { heroExpRequired, getHeroDefinition } from '../config/heroes';
import { createSkillState } from '../combat/skills';
import { MAX_LEVEL, clampLevel } from '../config/levels';

// 与本局棋盘同寿命，弱引用避免旧局状态被全局保存；不向单字写入临时EXP。
const sessions = new WeakMap<BoardState, HeroProgression>();
export function initializeHeroProgression(board: BoardState, map: BoardMap): void {
  sessions.set(board, new HeroProgression(board, map));
}
export function getHeroProgression(board: BoardState): HeroProgression {
  const progression = sessions.get(board);
  if (!progression) throw new Error('棋盘尚未初始化');
  return progression;
}

export class HeroProgression {
  private readonly board: BoardState;
  private readonly map: BoardMap;
  private nextCycle = 1;
  readonly links = new Map<string, HeroLink>();
  private readonly participants = new Map<number, Set<HeroLink>>();

  constructor(board: BoardState, map: BoardMap) { this.board = board; this.map = map; }

  sync(suspendedTile: number | null = null): void {
    const placements = getHeroLinks(this.map, this.board, suspendedTile, [...this.links.values()]);
    const keys = new Set(placements.map(p => p.key));
    for (const [key, link] of this.links) if (!keys.has(key)) { link.skill = null; this.links.delete(key); }
    for (const placement of placements) {
      let link = this.links.get(placement.key);
      const level = clampLevel(Math.max(placement.left.level, placement.right.level));
      placement.left.level = placement.right.level = level;
      if (!link || link.left !== placement.left || link.right !== placement.right || link.heroId !== placement.heroId) {
        if (link) link.skill = null;
        const skillId = getHeroDefinition(placement.heroId).skillId;
        link = { ...placement, cycleId: this.nextCycle++, level, currentExp: 0,
          skill: skillId ? createSkillState(skillId, level) : null };
        this.links.set(placement.key, link);
      } else if (link.level !== level) {
        link.level = level;
        link.currentExp = 0; // 同字升级/外部等级同步，不继承旧等级EXP。
      }
      link.hasteEnhanced = getHasteCarrier(link).hasteEnhanced;
      if (level === MAX_LEVEL) link.currentExp = 0;
    }
    for (const [id, set] of this.participants) {
      for (const link of set) if (!this.isActive(link)) set.delete(link);
      if (!set.size) this.participants.delete(id);
    }
  }

  isActive(link: HeroLink): boolean { return this.links.get(link.key) === link; }

  recordDamage(enemyId: number, link: HeroLink, damage: number): void {
    if (!(damage > 0) || !this.isActive(link)) return;
    const set = this.participants.get(enemyId) ?? new Set<HeroLink>();
    set.add(link);
    this.participants.set(enemyId, set);
  }

  awardKill(enemyId: number, exp: number): void {
    for (const link of this.participants.get(enemyId) ?? []) {
      if (!this.isActive(link)) continue;
      if (link.level >= MAX_LEVEL) { link.currentExp = 0; continue; }
      link.currentExp += exp;
      while (link.level < MAX_LEVEL && link.currentExp >= heroExpRequired(link.level)) {
        link.currentExp -= heroExpRequired(link.level);
        link.level++;
        link.left.level = link.right.level = link.level;
      }
      if (link.level === MAX_LEVEL) link.currentExp = 0;
    }
    this.participants.delete(enemyId);
  }

  forgetEnemy(enemyId: number): void { this.participants.delete(enemyId); }
  clearParticipation(): void { this.participants.clear(); }
  clearSkills(): void { for (const link of this.links.values()) link.skill = null; }
  clear(): void { this.clearSkills(); this.links.clear(); this.participants.clear(); }
}
