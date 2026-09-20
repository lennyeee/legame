import { getHasteCarrier } from './heroActivation';
import { isUnit, isHeroLetter } from './items';
import { itemEffects, activeItemCooldown } from '../config/itemEffects';
import { MAX_LEVEL } from '../config/levels';
import { getDragItem } from './board';
import type { BoardState, UnitPosition } from './board';
import type { RecruitmentState } from './recruitment';
import type { Loadout } from './equipment';
import { getHeroProgression } from './heroProgression';

// 单局运行状态；场景负责暂停时不推进，规则不依赖 Phaser。
export class ActiveItems {
  readonly slots: { id: string; remainingMs: number }[];
  private stopped = false;
  constructor(loadout: Loadout) {
    this.slots = loadout.active.map(item => ({ id: item.id, remainingMs: activeItemCooldown(item.id) ?? 0 }));
  }
  update(delta: number): void {
    if (this.stopped || !Number.isFinite(delta) || delta <= 0) return;
    for (const slot of this.slots) slot.remainingMs = Math.max(0, slot.remainingMs - delta);
  }
  ready(index: number): boolean {
    return !this.stopped && activeItemCooldown(this.slots[index]?.id ?? '') !== undefined && this.slots[index]?.remainingMs === 0;
  }
  use(index: number, board: BoardState, state: RecruitmentState, target: UnitPosition | null): boolean {
    if (!this.ready(index) || !target) return false;
    const unit = getDragItem(board, state, target);
    if (!unit || unit === '铲') return false;
    const id = this.slots[index]!.id;
    if (id === 'golden_hand') {
      if (target.kind === 'slot') state.slots[target.index] = null;
      else board.tiles[target.index]!.unit = null;
      state.money += itemEffects.saleReward;
    } else if (id === 'haste_edict') {
      if (isUnit(unit)) {
        if (unit.hasteEnhanced) return false;
        unit.hasteEnhanced = true;
      } else if (isHeroLetter(unit) && target.kind === 'tile') {
        const progression = getHeroProgression(board);
        progression.sync();
        const link = [...progression.links.values()].find(link => link.left === unit || link.right === unit);
        if (!link || getHasteCarrier(link).hasteEnhanced) return false;
        getHasteCarrier(link).hasteEnhanced = true;
      } else return false;
    } else {
      if (unit.level >= MAX_LEVEL) return false;
      unit.level += 1;
    }
    getHeroProgression(board).sync();
    this.slots[index]!.remainingMs = activeItemCooldown(id)!;
    return true;
  }
  stop(): void { this.stopped = true; }
  destroy(): void { this.stop(); this.slots.length = 0; }
}
