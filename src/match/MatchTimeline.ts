import { combatConfig } from '../config/combat';
import { pressureConfig, validatePressureConfig, enemyHpForWave, enemyCountForWave,
  spawnIntervalForWave, waveStartForWave } from '../config/pressure';
import type { PressureConfig } from '../config/pressure';

export interface SpawnEvent {
  id: number;
  atMs: number;
  wave: number;
  hpMultiplier: number;
}

interface SpawningWave {
  wave: number;
  startMs: number;
  count: number;
  spawned: number;
  interval: number;
  hpMultiplier: number;
  nextAtMs: number;
}

// 只保存仍在出怪的波次游标；不保留历史事件或未来无限schedule。
// 每波启动时首怪立即到期，首波启动时间独立由firstEnemyDelay决定。
export class MatchTimeline {
  elapsedMs = 0;
  wave = 1;
  private readonly config: Readonly<PressureConfig>;
  private readonly spawning: SpawningWave[] = [];
  private nextWave = 1;
  private nextWaveAtMs: number;
  private nextEventId = 1;

  constructor(config: PressureConfig = pressureConfig) {
    validatePressureConfig(config);
    this.config = Object.freeze({ ...config });
    this.nextWaveAtMs = waveStartForWave(1, this.config);
  }

  advance(deltaMs: number): SpawnEvent[] {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return [];
    const target = this.elapsedMs + deltaMs;
    if (!Number.isFinite(target) || target > Number.MAX_SAFE_INTEGER || target === this.elapsedMs) {
      throw new RangeError('Timeline exceeds safe clock precision');
    }
    const due: SpawnEvent[] = [];
    for (;;) {
      // 时间相同时按波号升序，保证大delta和多个小delta产生一致的事件顺序。
      let earliest: SpawningWave | undefined;
      for (const active of this.spawning) {
        if (!earliest || active.nextAtMs < earliest.nextAtMs
          || (active.nextAtMs === earliest.nextAtMs && active.wave < earliest.wave)) earliest = active;
      }
      if (this.nextWaveAtMs <= target + 1e-8 && (!earliest || this.nextWaveAtMs <= earliest.nextAtMs)) {
        const wave = this.nextWave;
        const nextStart = waveStartForWave(wave + 1, this.config);
        if (nextStart <= this.nextWaveAtMs) throw new RangeError('Unsafe wave cadence');
        this.spawning.push({ wave, startMs: this.nextWaveAtMs, nextAtMs: this.nextWaveAtMs,
          count: enemyCountForWave(wave, this.config), spawned: 0,
          interval: spawnIntervalForWave(wave, this.config),
          hpMultiplier: enemyHpForWave(wave, this.config) / combatConfig.enemy.maxHp });
        this.wave = wave;
        this.nextWave++;
        this.nextWaveAtMs = nextStart;
        continue;
      }
      if (!earliest || earliest.nextAtMs > target + 1e-8) break;
      if (!Number.isSafeInteger(this.nextEventId)) throw new RangeError('Unsafe spawn event ID');
      due.push({ id: this.nextEventId++, atMs: earliest.nextAtMs, wave: earliest.wave,
        hpMultiplier: earliest.hpMultiplier });
      earliest.spawned++;
      if (earliest.spawned === earliest.count) {
        this.spawning.splice(this.spawning.indexOf(earliest), 1);
      } else {
        const nextAtMs = earliest.startMs + earliest.spawned * earliest.interval;
        if (!Number.isFinite(nextAtMs) || nextAtMs > Number.MAX_SAFE_INTEGER || nextAtMs <= earliest.nextAtMs) {
          throw new RangeError('Unsafe spawn interval');
        }
        earliest.nextAtMs = nextAtMs;
      }
    }
    this.elapsedMs = target;
    return due;
  }
}
