export const waveConfig = {
  baseHealth: 3,
  enemyCounts: [5, 6, 7, 8, 10],
  spawnInterval: 2000,
  waveDelay: 3000,
  hpGrowth: 0.25,
} as const;

export interface WaveConfig {
  baseHealth: number;
  enemyCounts: readonly number[];
  spawnInterval: number;
  waveDelay: number;
  hpGrowth: number;
}
