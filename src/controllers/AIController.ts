import { aiConfig } from '../config/ai';
import { heroRecipes } from '../config/heroes';
import type { PlayerSide } from '../systems/PlayerSide';
import type { UnitPosition, DropAction } from '../systems/board';
import type { DragItem } from '../systems/board';
import { isUnit, isHeroLetter } from '../systems/items';
import type { Farmer } from '../systems/items';
import { getHeroLinks } from '../systems/heroActivation';

type AIAction =
  | { kind: 'recruit' }
  | { kind: 'drop'; source: UnitPosition; target: UnitPosition; action: DropAction }
  | { kind: 'item'; index: number; target: UnitPosition }
  | { kind: 'collect'; farmer: Farmer; rewardId: number };
interface Candidate { action: AIAction; score: number }
interface Pending {
  candidate: Candidate;
  remainingMs: number;
  expected: { position: UnitPosition; item: DragItem | null; level: number | null }[];
  recruitCount: number;
}

export type TimingRandom = () => number;

// 计时使用 Web Crypto 独立取样，不消耗招募/金铲铲使用的 Math.random 序列。
function createTimingRandom(): TimingRandom {
  return () => {
    const sample = new Uint32Array(1);
    globalThis.crypto.getRandomValues(sample);
    return sample[0]! / 0x1_0000_0000;
  };
}

// 只持有本方状态；无Match/timeline/bottom、Phaser、timer或未来动作队列。
export class AIController {
  private pending: Pending | null = null;
  private stopped = false;
  private hasActed = false;
  private observeAfterRecruit = false;
  constructor(private readonly side: PlayerSide, private readonly timingRandom: TimingRandom = createTimingRandom()) {}

  update(deltaMs: number): void {
    if (this.stopped || !this.side.running || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    if (!this.pending) {
      const candidate = this.candidates().sort((a, b) => b.score - a.score)[0];
      if (!candidate || candidate.score <= 0) return;
      const action = candidate.action;
      const delayRange = !this.hasActed ? aiConfig.timing.initialReactionMs
        : this.observeAfterRecruit ? aiConfig.timing.recruitObservationMs
          : action.kind === 'drop' && action.action === 'unlock' ? aiConfig.timing.shovelActionMs
            : aiConfig.timing.ordinaryActionMs;
      const delayMs = Math.floor(this.timingRandom() * (delayRange.max - delayRange.min + 1)) + delayRange.min;
      if (this.observeAfterRecruit && this.hasActed) this.observeAfterRecruit = false;
      const positions = action.kind === 'drop' ? [action.source, action.target]
        : action.kind === 'item' ? [action.target] : [];
      this.pending = { candidate, remainingMs: delayMs,
        expected: positions.map(position => {
          const item = this.side.itemAt(position);
          return { position, item, level: item && item !== '铲' ? item.level : null };
        }), recruitCount: this.side.recruitment.successfulRecruits };
    }
    this.pending.remainingMs -= deltaMs;
    if (this.pending.remainingMs > 1e-8) return;
    const pending = this.pending;
    this.pending = null;
    if (!pending.expected.every(({ position, item, level }) => {
      const current = this.side.itemAt(position);
      return current === item && (current && current !== '铲' ? current.level : null) === level;
    }) || pending.recruitCount !== this.side.recruitment.successfulRecruits) return;
    const action = pending.candidate.action;
    // 重新枚举同一个动作，校验规则和active hero保护；不偷偷改为另一个动作。
    if (!this.candidates().some(candidate => this.sameAction(action, candidate.action))) return;
    let succeeded = false;
    if (action.kind === 'recruit') succeeded = this.side.recruit();
    else if (action.kind === 'drop') succeeded = this.side.drop(action.source, action.target) === action.action;
    else if (action.kind === 'item') succeeded = this.side.useActiveItem(action.index, action.target);
    else succeeded = this.side.collectFarmerReward(action.farmer, action.rewardId);
    if (succeeded) {
      this.hasActed = true;
      this.observeAfterRecruit = action.kind === 'recruit';
    }
  }

  stop(): void { this.stopped = true; this.pending = null; }
  destroy(): void { this.stop(); }

  private sameAction(a: AIAction, b: AIAction): boolean {
    const samePosition = (x: UnitPosition, y: UnitPosition) => x.kind === y.kind && x.index === y.index;
    if (a.kind === 'recruit') return b.kind === 'recruit';
    if (a.kind === 'collect') return b.kind === 'collect' && a.farmer === b.farmer && a.rewardId === b.rewardId;
    if (a.kind === 'item') return b.kind === 'item' && a.index === b.index && samePosition(a.target, b.target);
    return b.kind === 'drop' && a.action === b.action && samePosition(a.source, b.source) && samePosition(a.target, b.target);
  }

  private candidates(): Candidate[] {
    const side = this.side, scores = aiConfig.scores;
    const positions: UnitPosition[] = [
      ...side.recruitment.slots.map((_, index) => ({ kind: 'slot' as const, index })),
      ...side.board.tiles.map((_, index) => ({ kind: 'tile' as const, index })),
    ];
    const links = [...side.heroes.links.values()];
    const protectedTiles = new Set(links.flatMap(link => [link.leftIndex, link.rightIndex]));
    const protectedPosition = (p: UnitPosition) => p.kind === 'tile' && protectedTiles.has(p.index);
    const candidates: Candidate[] = [];
    for (const [farmer, state] of side.farmers.states) if (state.reward) {
      candidates.push({ action: { kind: 'collect', farmer, rewardId: state.reward.id }, score: scores.collect });
    }
    for (const source of positions) {
      const item = side.itemAt(source);
      if (!item || protectedPosition(source)) continue;
      for (const target of positions) {
        const action = side.dropAction(source, target);
        if (action === 'invalid' || (protectedPosition(target) && action !== 'merge')) continue;
        const occupant = side.itemAt(target);
        let score = 0;
        if (action === 'merge') score = scores.merge;
        else if (action === 'unlock') score = scores.unlock + this.proximity(target.index);
        else if (target.kind === 'tile' && item !== '铲') {
          // 仅为无副作用查询构造move/swap后的占格投影；激活判断复用正式getHeroLinks。
          const preview = { tiles: side.board.tiles.map((tile, index) => ({ ...tile,
            unit: index === target.index ? item
              : source.kind === 'tile' && index === source.index ? (action === 'swap' && occupant !== '铲' ? occupant : null) : tile.unit })) };
          const formed = getHeroLinks(side.combat.map, preview, null, links)
            .some(link => !links.some(old => old.key === link.key && old.left === link.left && old.right === link.right));
          if (formed) score = scores.hero;
          else if (source.kind === 'slot' && action === 'move') {
            score = (isHeroLetter(item) ? scores.letter : scores.deploy) + this.proximity(target.index);
            if (isHeroLetter(item) && this.hasHoldingPartner(item.type, target.index)) score += scores.preparePair;
          } else if (source.kind === 'slot' && action === 'swap' && isUnit(item) && isUnit(occupant)
            && item.type === occupant.type && item.level > occupant.level) score = scores.deploy;
          else if (source.kind === 'tile' && action === 'move' && isUnit(item)
            && this.pathDistance(source.index) - this.pathDistance(target.index)
              >= side.combat.map.cellSize * aiConfig.minimumMoveDistanceCells) score = scores.improvePosition;
        }
        if (score > 0) candidates.push({ action: { kind: 'drop', source, target, action }, score });
      }
    }
    side.activeItems.slots.forEach((slot, index) => {
      for (const target of positions) {
        if (!side.canUseActiveItem(index, target) || slot.id === 'golden_hand' && protectedPosition(target)) continue;
        // 点金手只在空间紧张时清理备战区；不会为了$1出售正在防守的单位。
        if (slot.id === 'golden_hand' && (target.kind !== 'slot'
          || side.recruitment.slots.some(item => item === null) || side.board.tiles.some(tile => tile.unlocked && !tile.unit))) continue;
        candidates.push({ action: { kind: 'item', index, target }, score: slot.id === 'golden_hand' ? scores.sell : scores.item });
      }
    });
    if (side.canRecruit()) candidates.push({ action: { kind: 'recruit' }, score: scores.recruit });
    return candidates;
  }

  private hasHoldingPartner(type: string, index: number): boolean {
    const map = this.side.combat.map, point = map.cells[index]!;
    return heroRecipes.some(recipe => {
      const left = recipe.letters[0] === type;
      if (!left && recipe.letters[1] !== type) return false;
      const other = left ? recipe.letters[1] : recipe.letters[0];
      if (!this.side.recruitment.slots.some(item => isHeroLetter(item) && item.type === other)) return false;
      const neighbour = map.cells.findIndex(cell => cell.y === point.y
        && Math.abs(cell.x - point.x - (left ? map.cellSize : -map.cellSize)) < 0.001);
      const tile = this.side.board.tiles[neighbour];
      return !!tile?.unlocked && !tile.unit;
    });
  }

  private pathDistance(index: number): number {
    const map = this.side.combat.map, point = map.cells[index]!;
    return Math.min(...map.path.slice(1).map((end, i) => {
      const start = map.path[i]!, dx = end.x - start.x, dy = end.y - start.y;
      const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(point.x - start.x - ratio * dx, point.y - start.y - ratio * dy);
    }));
  }
  private proximity(index: number): number {
    return aiConfig.scores.proximity / (1 + this.pathDistance(index) / this.side.combat.map.cellSize);
  }
}
