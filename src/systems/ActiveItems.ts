import { itemEffects } from '../config/itemEffects';
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
    this.slots = loadout.active.map(item => ({ id: item.id, remainingMs: itemEffects.upgradeCooldownMs }));
  }
  update(delta: number): void {
    if (this.stopped || !Number.isFinite(delta) || delta <= 0) return;
    for (const slot of this.slots) slot.remainingMs = Math.max(0, slot.remainingMs - delta);
  }
  ready(index: number): boolean {
    return !this.stopped && this.slots[index]?.id === 'upgrade_talisman' && this.slots[index]?.remainingMs === 0;
  }
  use(index: number, board: BoardState, state: RecruitmentState, target: UnitPosition | null): boolean {
    if (!this.ready(index) || !target) return false;
    const unit = getDragItem(board, state, target);
    if (!unit || unit === '铲' || unit.level >= MAX_LEVEL) return false;
    unit.level += 1;
    getHeroProgression(board).sync();
    this.slots[index]!.remainingMs = itemEffects.upgradeCooldownMs;
    return true;
  }
  stop(): void { this.stopped = true; }
  destroy(): void { this.stop(); this.slots.length = 0; }
}
