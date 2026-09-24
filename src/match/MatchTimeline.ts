import { waveConfig, getWaveHpMultiplier } from '../config/waves';
import type { WaveConfig } from '../config/waves';

export interface SpawnEvent {
  id: number;
  atMs: number;
  wave: number;
  hpMultiplier: number;
}

// 过渡schedule：沿用每波数量/HP/2秒间隔，最后一次计划出怪后固定等3秒。
// 时间表创建后不再读取敌人数或清场结果；v0.62可以替换数据生成而保留消费入口。
export class MatchTimeline {
  readonly events: readonly SpawnEvent[];
  readonly waveStarts: readonly number[];
  elapsedMs = 0;
  wave = 1;
  private cursor = 0;

  constructor(config: WaveConfig = waveConfig) {
    const events: SpawnEvent[] = [];
    const starts: number[] = [];
    let start = 0;
    config.enemyCounts.forEach((count, index) => {
      starts.push(start);
      for (let n = 1; n <= count; n++) {
        events.push(Object.freeze({ id: events.length + 1, atMs: start + n * config.spawnInterval,
          wave: index + 1, hpMultiplier: getWaveHpMultiplier(index + 1, config) }));
      }
      start += count * config.spawnInterval + config.waveDelay;
    });
    this.events = Object.freeze(events);
    this.waveStarts = Object.freeze(starts);
  }

  get finished(): boolean { return this.cursor === this.events.length; }

  advance(deltaMs: number): SpawnEvent[] {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return [];
    this.elapsedMs += deltaMs;
    while (this.wave < this.waveStarts.length && this.elapsedMs + 1e-8 >= this.waveStarts[this.wave]!) this.wave++;
    const due: SpawnEvent[] = [];
    while (this.cursor < this.events.length && this.events[this.cursor]!.atMs <= this.elapsedMs + 1e-8) {
      due.push(this.events[this.cursor++]!);
    }
    return due;
  }
}
