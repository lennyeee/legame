// v0.62-B first calibration — awaiting human v0.62-C playtest.
// HP承担韧性，数量缓慢增长，密度/启动间隔承担持续压力；不是最终平衡。
export const pressureConfig = {
  baseHealth: 3,
  firstEnemyDelay: 9500,
  waveStartInterval: 12000,
  stageLength: 3,
  initialHp: 120,
  hpPerStage: 0.9,
  hpPerStep: 0.4,
  hpStageCurve: 0.45,
  initialCount: 5,
  countPerStage: 1,
  countStageEvery: 3,
  countStepEvery: 100,
  maxCount: 32,
  initialSpawnInterval: 1800,
  intervalReductionPerStage: 35,
  minimumSpawnInterval: 800,
  pulseEvery: 6,
  pulseExtraCount: 1,
};

export type PressureConfig = typeof pressureConfig;

export function validatePressureConfig(config: PressureConfig): void {
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
      throw new RangeError(`Invalid pressure parameter: ${key}`);
    }
  }
  for (const key of ['baseHealth', 'stageLength', 'initialCount', 'countPerStage', 'countStepEvery',
    'countStageEvery', 'maxCount', 'pulseEvery', 'pulseExtraCount'] as const) {
    if (!Number.isSafeInteger(config[key])) throw new RangeError(`Invalid integer: ${key}`);
  }
  if (config.baseHealth < 1 || config.stageLength < 1 || config.initialHp < 1 || config.initialCount < 1
    || config.countStepEvery < 1 || config.countStageEvery < 1 || config.pulseEvery < 1 || config.maxCount < config.initialCount
    || config.waveStartInterval < 1 || config.minimumSpawnInterval < 1
    || config.initialSpawnInterval < config.minimumSpawnInterval) {
    throw new RangeError('Pressure cadence/count/HP must remain positive');
  }
}

function stageForWave(wave: number, config: PressureConfig): { stage: number; step: number } {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError('Wave must be a positive safe integer');
  return { stage: Math.floor((wave - 1) / config.stageLength), step: (wave - 1) % config.stageLength };
}

export function enemyHpForWave(wave: number, config: PressureConfig = pressureConfig): number {
  const { stage, step } = stageForWave(wave, config);
  // 阶段二次项（非指数）；极端数值封顶于安全整数。
  return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER,
    Math.round(config.initialHp * (1 + config.hpPerStage * stage + config.hpStageCurve * stage ** 2 + config.hpPerStep * step))));
}

export function enemyCountForWave(wave: number, config: PressureConfig = pressureConfig): number {
  const { stage, step } = stageForWave(wave, config);
  const pulse = wave % config.pulseEvery === 0 ? config.pulseExtraCount : 0;
  // 限制单波实体压力，不限制波数；高阶段HP仍持续增长。
  return Math.min(config.maxCount,
    config.initialCount + config.countPerStage * Math.floor(stage / config.countStageEvery)
    + Math.floor(step / config.countStepEvery) + pulse);
}

export function spawnIntervalForWave(wave: number, config: PressureConfig = pressureConfig): number {
  const { stage } = stageForWave(wave, config);
  return Math.max(config.minimumSpawnInterval, config.initialSpawnInterval - config.intervalReductionPerStage * stage);
}

export function waveStartForWave(wave: number, config: PressureConfig = pressureConfig): number {
  stageForWave(wave, config);
  const time = config.firstEnemyDelay + (wave - 1) * config.waveStartInterval;
  // 没有最终波。超过JS安全时钟时显式拒绝，不静默溢出或重复派发。
  if (!Number.isFinite(time) || time > Number.MAX_SAFE_INTEGER) throw new RangeError('Timeline exceeds safe clock precision');
  return time;
}
