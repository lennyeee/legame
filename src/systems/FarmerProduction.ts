import type { BoardState } from './board';
import { isFarmer } from './items';
import type { Farmer } from './items';
import { farmerConfig, farmerYield } from '../config/farmer';

export interface FarmerState {
  tileIndex: number;
  level: number;
  elapsedMs: number;
  reward: { id: number; amount: number; remainingMs: number } | null;
}

// 纯逻辑，不注册计时器。状态跟随对象身份，移动保留，合并的新对象重新计时。
export class FarmerProduction {
  readonly states = new Map<Farmer, FarmerState>();
  private nextRewardId = 1;
  private stopped = false;
  private readonly board: BoardState;
  private readonly wallet: { money: number };
  constructor(board: BoardState, wallet: { money: number }) { this.board = board; this.wallet = wallet; }

  sync(): void {
    if (this.stopped) return;
    const present = new Set<Farmer>();
    this.board.tiles.forEach((tile, tileIndex) => {
      if (!tile.unlocked || !isFarmer(tile.unit)) return;
      const farmer = tile.unit;
      present.add(farmer);
      const state = this.states.get(farmer);
      if (!state || state.level !== farmer.level) {
        this.states.set(farmer, { tileIndex, level: farmer.level, elapsedMs: 0, reward: null });
      } else state.tileIndex = tileIndex;
    });
    for (const farmer of this.states.keys()) if (!present.has(farmer)) this.states.delete(farmer);
  }

  update(deltaMs: number): void {
    if (this.stopped || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.sync();
    for (const state of this.states.values()) {
      let remaining = deltaMs;
      while (remaining > 0) {
        if (state.reward) {
          const used = Math.min(remaining, state.reward.remainingMs);
          state.reward.remainingMs -= used; remaining -= used;
          if (state.reward.remainingMs === 0) { state.reward = null; state.elapsedMs = 0; }
        } else {
          const used = Math.min(remaining, farmerConfig.productionMs - state.elapsedMs);
          state.elapsedMs += used; remaining -= used;
          if (state.elapsedMs === farmerConfig.productionMs) {
            state.elapsedMs = 0;
            state.reward = { id: this.nextRewardId++, amount: farmerYield(state.level), remainingMs: farmerConfig.rewardLifetimeMs };
          }
        }
      }
    }
  }

  collect(farmer: Farmer, rewardId: number): boolean {
    if (this.stopped) return false;
    this.sync();
    const state = this.states.get(farmer);
    if (!state?.reward || state.reward.id !== rewardId) return false;
    this.wallet.money += state.reward.amount;
    state.reward = null;
    state.elapsedMs = 0;
    return true;
  }

  stop(): void { this.stopped = true; }
  destroy(): void { this.stop(); this.states.clear(); }
}
