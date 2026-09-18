import type { WaveConfig } from '../config/waves';
import { getWaveHpMultiplier } from '../config/waves';

// 只管理出兵节奏、基地生命和胜负，不依赖画面或兵种规则。
export class WaveProgress {
  readonly config: WaveConfig;
  wave = 1;
  health: number;
  status: 'playing' | 'victory' | 'defeat' = 'playing';
  spawned = 0;
  private spawnClock = 0;
  private waiting: number | null = null;

  constructor(config: WaveConfig) {
    this.config = config;
    this.health = config.baseHealth;
  }

  get resultText(): string {
    return this.status === 'defeat' ? '失败' : this.status === 'victory' ? '胜利' : '';
  }

  tick(deltaMs: number, spawn: (hpMultiplier: number) => void): void {
    if (this.status !== 'playing') return;
    if (this.waiting !== null) {
      this.waiting -= deltaMs;
      if (this.waiting > 1e-8) return;
      this.waiting = null;
      this.wave++;
      this.spawned = 0;
      this.spawnClock = 0;
    }
    this.spawnClock += deltaMs;
    while (this.spawned < this.config.enemyCounts[this.wave - 1]!
      && this.spawnClock + 1e-8 >= this.config.spawnInterval) {
      this.spawnClock -= this.config.spawnInterval;
      this.spawned++;
      spawn(getWaveHpMultiplier(this.wave, this.config));
    }
  }

  escape(): void {
    if (this.status !== 'playing') return;
    this.health = Math.max(0, this.health - 1);
    if (this.health === 0) this.status = 'defeat';
  }

  finishStep(enemyCount: number): void {
    if (this.status !== 'playing' || this.waiting !== null || enemyCount > 0
      || this.spawned < this.config.enemyCounts[this.wave - 1]!) return;
    if (this.wave === this.config.enemyCounts.length) this.status = 'victory';
    else this.waiting = this.config.waveDelay;
  }
}
