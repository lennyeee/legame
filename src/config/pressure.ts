import { combatConfig } from './combat';

// TEMPORARY — v0.62-B balance target.
// 仅验证无限时间轴；不是最终HP/count/density或局长设计。
export const pressureConfig = {
  baseHealth: 3,
  firstEnemyDelay: 9500,
  waveStartInterval: 20000,
  stageLength: 5,
  initialHp: combatConfig.enemy.maxHp,
  hpPerStage: 0.35,
  hpPerStep: 0.05,
  initialCount: 5,
  countPerStage: 2,
  countStepEvery: 2,
  maxCount: 80,
  initialSpawnInterval: 2000,
  intervalReductionPerStage: 150,
  minimumSpawnInterval: 500,
  pulseEvery: 5,
  pulseExtraCount: 2,
};

export type PressureConfig = typeof pressureConfig;

export function validatePressureConfig(config: PressureConfig): void {
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
      throw new RangeError(`Invalid pressure parameter: ${key}`);
    }
  }
  for (const key of ['baseHealth', 'stageLength', 'initialCount', 'countPerStage', 'countStepEvery',
    'maxCount', 'pulseEvery', 'pulseExtraCount'] as const) {
    if (!Number.isSafeInteger(config[key])) throw new RangeError(`Invalid integer: ${key}`);
  }
  if (config.baseHealth < 1 || config.stageLength < 1 || config.initialHp < 1 || config.initialCount < 1
    || config.countStepEvery < 1 || config.pulseEvery < 1 || config.maxCount < config.initialCount
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
  // 线性增长；极端数值封顶于可精确表示的整数，绝不产生Infinity/NaN。
  return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER,
    Math.round(config.initialHp * (1 + config.hpPerStage * stage + config.hpPerStep * step))));
}

export function enemyCountForWave(wave: number, config: PressureConfig = pressureConfig): number {
  const { stage, step } = stageForWave(wave, config);
  const pulse = wave % config.pulseEvery === 0 ? config.pulseExtraCount : 0;
  // 限制单波实体压力，不限制波数；高阶段HP仍持续增长。
  return Math.min(config.maxCount,
    config.initialCount + config.countPerStage * stage + Math.floor(step / config.countStepEvery) + pulse);
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
