export const waveTestGrowth = {
  waveCount: 20,
  stageLength: 5,
  initialCount: 5,
  countPerWave: 1,
  countPerStage: 2,
};

export const waveConfig = {
  baseHealth: 3,
  enemyCounts: Array.from({ length: waveTestGrowth.waveCount }, (_, index) =>
    waveTestGrowth.initialCount + index * waveTestGrowth.countPerWave
    + Math.floor(index / waveTestGrowth.stageLength) * waveTestGrowth.countPerStage),
  spawnInterval: 2000,
  waveDelay: 3000,
  hpGrowth: 0.25,
  hpAcceleration: 0.04,
  hpAccelerationStart: 5,
} as const;

export interface WaveConfig {
  baseHealth: number;
  enemyCounts: readonly number[];
  spawnInterval: number;
  waveDelay: number;
  hpGrowth: number;
  hpAcceleration: number;
  hpAccelerationStart: number;
}

export function getWaveHpMultiplier(wave: number, config: WaveConfig): number {
  return 1 + (wave - 1) * config.hpGrowth
    + Math.max(0, wave - config.hpAccelerationStart) ** 2 * config.hpAcceleration;
}
