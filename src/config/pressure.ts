export interface WavePressure { hp: number; count: number; spawnInterval?: number }
export interface PressureConfig {
  baseHealth: number;
  firstEnemyDelay: number;
  spawnInterval: number;
  waves: readonly WavePressure[];
  extension: { hpGrowthMultiplier: number; countPerWave: number };
  // 仅供历史对照/隔离测试显式覆盖；正式配置按count × spawnInterval衔接。
  waveStartInterval?: number;
}

export const pressureConfig: PressureConfig = {
  baseHealth: 3, firstEnemyDelay: 9500, spawnInterval: 1500,
  waves: [
    { hp: 10, count: 10 }, { hp: 18, count: 11 }, { hp: 28, count: 12 },
    { hp: 40, count: 13 }, { hp: 54, count: 15 }, { hp: 70, count: 16 },
    { hp: 88, count: 18 }, { hp: 125, count: 19 }, { hp: 175, count: 20 },
    { hp: 240, count: 21 }, { hp: 320, count: 22 }, { hp: 420, count: 23 },
    { hp: 540, count: 24 }, { hp: 680, count: 25 }, { hp: 840, count: 26 },
    { hp: 1020, count: 27 }, { hp: 1220, count: 28 }, { hp: 1440, count: 29 },
    { hp: 1680, count: 30 }, { hp: 1940, count: 31 },
  ],
  // Wave21起HP按上一波逐波乘1.15并round；数量规则保持每波+1。
  extension: { hpGrowthMultiplier: 1.15, countPerWave: 1 },
};

export function validatePressureConfig(config: PressureConfig): void {
  const positive = (n: number): boolean => Number.isSafeInteger(n) && n > 0;
  if (!positive(config.baseHealth) || !Number.isSafeInteger(config.firstEnemyDelay) || config.firstEnemyDelay < 0
    || !positive(config.spawnInterval) || !config.waves.length
    || config.waves.some(w => !positive(w.hp) || !positive(w.count)
      || (w.spawnInterval !== undefined && !positive(w.spawnInterval)))
    || !Number.isFinite(config.extension.hpGrowthMultiplier) || config.extension.hpGrowthMultiplier <= 1
    || !positive(config.extension.countPerWave)
    || (config.waveStartInterval !== undefined && !positive(config.waveStartInterval))) {
    throw new RangeError('Invalid pressure HP/count/cadence');
  }
}

function extensionStep(wave: number, config: PressureConfig): number {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError('Wave must be a positive safe integer');
  return Math.max(0, wave - config.waves.length);
}
const safeValue = (n: number): number => Math.min(Number.MAX_SAFE_INTEGER, n);

// 缓存每个不可变压力配置的逐波结果，既保持严格的逐波round语义，也避免时间轴反复重算。
const hpByConfig = new WeakMap<PressureConfig, { signature: string; values: number[] }>();

export function enemyHpForWave(wave: number, config: PressureConfig = pressureConfig): number {
  extensionStep(wave, config);
  const signature = `${config.extension.hpGrowthMultiplier}:${config.waves.map(entry => entry.hp).join(',')}`;
  let cached = hpByConfig.get(config);
  if (!cached || cached.signature !== signature) {
    cached = { signature, values: config.waves.map(entry => entry.hp) };
    hpByConfig.set(config, cached);
  }
  const { values } = cached;
  while (values.length < wave && Number.isFinite(values.at(-1))) {
    values.push(Math.round(values.at(-1)! * config.extension.hpGrowthMultiplier));
  }
  // Number的有限精度最终会自然溢出；不额外把HP限制到人为平衡上限。
  return values[Math.min(wave, values.length) - 1]!;
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
