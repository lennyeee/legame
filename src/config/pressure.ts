export interface WavePressure { hp: number; count: number; spawnInterval?: number }
export interface PressureConfig {
  baseHealth: number;
  firstEnemyDelay: number;
  spawnInterval: number;
  waves: readonly WavePressure[];
  extension: { hpPerWave: number; hpIncrementGrowth: number; countPerWave: number };
  // 仅供历史对照/隔离测试显式覆盖；正式配置按count × spawnInterval衔接。
  waveStartInterval?: number;
}

export const pressureConfig: PressureConfig = {
  baseHealth: 3, firstEnemyDelay: 9500, spawnInterval: 1500,
  waves: [
    { hp: 10, count: 10 }, { hp: 18, count: 11 }, { hp: 28, count: 12 },
    { hp: 40, count: 13 }, { hp: 54, count: 15 }, { hp: 70, count: 16 },
    { hp: 88, count: 18 }, { hp: 108, count: 19 }, { hp: 130, count: 20 },
    { hp: 154, count: 21 }, { hp: 180, count: 22 }, { hp: 208, count: 23 },
    { hp: 238, count: 24 }, { hp: 270, count: 25 }, { hp: 304, count: 26 },
  ],
  // 第16波增36HP，之后每波增量再+2；数量每波+1，无最终波。
  extension: { hpPerWave: 36, hpIncrementGrowth: 2, countPerWave: 1 },
};

export function validatePressureConfig(config: PressureConfig): void {
  const positive = (n: number): boolean => Number.isSafeInteger(n) && n > 0;
  if (!positive(config.baseHealth) || !Number.isSafeInteger(config.firstEnemyDelay) || config.firstEnemyDelay < 0
    || !positive(config.spawnInterval) || !config.waves.length
    || config.waves.some(w => !positive(w.hp) || !positive(w.count)
      || (w.spawnInterval !== undefined && !positive(w.spawnInterval)))
    || !positive(config.extension.hpPerWave) || !positive(config.extension.countPerWave)
    || !Number.isSafeInteger(config.extension.hpIncrementGrowth) || config.extension.hpIncrementGrowth < 0
    || (config.waveStartInterval !== undefined && !positive(config.waveStartInterval))) {
    throw new RangeError('Invalid pressure HP/count/cadence');
  }
}

function extensionStep(wave: number, config: PressureConfig): number {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError('Wave must be a positive safe integer');
  return Math.max(0, wave - config.waves.length);
}
const safeValue = (n: number): number => Math.min(Number.MAX_SAFE_INTEGER, n);

export function enemyHpForWave(wave: number, config: PressureConfig = pressureConfig): number {
  const k = extensionStep(wave, config), last = config.waves.at(-1)!;
  return k === 0 ? config.waves[wave - 1]!.hp : safeValue(last.hp + config.extension.hpPerWave * k
    + config.extension.hpIncrementGrowth * k * (k - 1) / 2);
}
export function enemyCountForWave(wave: number, config: PressureConfig = pressureConfig): number {
  const k = extensionStep(wave, config);
  return k === 0 ? config.waves[wave - 1]!.count
    : safeValue(config.waves.at(-1)!.count + config.extension.countPerWave * k);
}
export function spawnIntervalForWave(wave: number, config: PressureConfig = pressureConfig): number {
  extensionStep(wave, config);
  return config.waves[wave - 1]?.spawnInterval ?? config.spawnInterval;
}
export function waveDurationForWave(wave: number, config: PressureConfig = pressureConfig): number {
  return config.waveStartInterval ?? enemyCountForWave(wave, config) * spawnIntervalForWave(wave, config);
}
export function waveStartForWave(wave: number, config: PressureConfig = pressureConfig): number {
  extensionStep(wave, config);
  let duration = 0;
  if (config.waveStartInterval !== undefined) duration = (wave - 1) * config.waveStartInterval;
  else {
    for (let i = 1; i <= Math.min(wave - 1, config.waves.length); i++) duration += waveDurationForWave(i, config);
    const k = Math.max(0, wave - 1 - config.waves.length);
    duration += config.spawnInterval * (k * config.waves.at(-1)!.count + config.extension.countPerWave * k * (k + 1) / 2);
  }
  const time = config.firstEnemyDelay + duration;
  if (!Number.isSafeInteger(time)) throw new RangeError('Timeline exceeds safe clock precision');
  return time;
}
